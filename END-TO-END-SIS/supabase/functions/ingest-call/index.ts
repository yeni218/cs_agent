// Internal production ingest: persistent voice worker / Verimor webhook -> Supabase.
// Writes the completed call, measured usage, optional CDR, reconciliation, and
// audit event. Protect with AFIYET_INGEST_SECRET in production.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { computeCost } from '../_shared/engine.ts';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-afiyet-ingest-secret',
  'access-control-allow-methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const secret = Deno.env.get('AFIYET_INGEST_SECRET') || '';
  if (secret && req.headers.get('x-afiyet-ingest-secret') !== secret) return json({ error: 'unauthorized' }, 401);

  try {
    const body = await req.json();
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const { data: assistant, error } = body.assistantId
      ? await admin.from('assistants').select('*').eq('id', body.assistantId).single()
      : { data: null, error: null };
    if (error) return json({ error: error.message }, 400);

    const tenantId = body.tenantId || body.tenant_id || assistant?.tenant_id;
    if (!tenantId) return json({ error: 'tenantId or assistantId is required' }, 400);

    const usage = body.usage || {};
    const durationSec = num(body.durationSec ?? body.duration_sec);
    const audioSec = num(body.audioSec ?? body.audio_sec, durationSec);
    const costBreakdown = body.costBreakdown || computeCost({
      audioSec,
      promptTokens: usage.promptTokens || usage.llmPromptTokens || 0,
      completionTokens: usage.completionTokens || usage.llmCompletionTokens || 0,
      ttsChars: usage.ttsChars || usage.ttsCharacters || 0,
      durationSec,
      providerUsage: body.providerUsage
    });

    const id = body.callId || body.id || `call_${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();
    const row = {
      id,
      external_call_id: body.externalCallId || body.external_call_id || null,
      tenant_id: tenantId,
      assistant_id: body.assistantId || assistant?.id || null,
      type: body.type || 'inboundPhoneCall',
      status: body.status || 'ended',
      answered: body.answered !== false,
      outcome: body.outcome || body.analysis?.structuredData?.intent || 'faq',
      order_amount: num(body.orderAmount ?? body.order_amount ?? body.analysis?.structuredData?.total),
      customer_name: body.customerName || body.customer_name || body.analysis?.structuredData?.customerName || null,
      summary: body.summary || body.analysis?.summary || body.transcript || 'Telephony call ingested',
      duration_sec: durationSec,
      cost: num(body.cost, costBreakdown.total),
      cost_breakdown: costBreakdown,
      messages: body.messages || [],
      analysis: body.analysis || { summary: body.summary || body.transcript || '', structuredData: body.structuredData || {}, successEvaluation: body.answered === false ? 'failed' : 'success' },
      recording_url: body.recordingPath || body.recording_url || body.recordingUrl || null,
      cost_status: 'estimated',
      started_at: body.startedAt || body.started_at || new Date(Date.now() - durationSec * 1000).toISOString(),
      ended_at: body.endedAt || body.ended_at || nowIso
    };

    const { error: upsertErr } = await admin.from('calls').upsert(row).select('id').single();
    if (upsertErr) return json({ error: upsertErr.message }, 500);

    const usageRows = usageRowsFromBreakdown(id, tenantId, costBreakdown);
    if (usageRows.length) await admin.from('call_usage_events').insert(usageRows);

    let reconciliation = null;
    if (body.telephonyCdr) {
      const cdr = normalizeCdr(body.telephonyCdr, { callId: id, tenantId, externalCallId: row.external_call_id });
      await admin.from('telephony_cdrs').upsert(cdr);
      const actualBreakdown = computeCost({
        audioSec,
        promptTokens: costBreakdown.llmPromptTokens || 0,
        completionTokens: costBreakdown.llmCompletionTokens || 0,
        ttsChars: costBreakdown.ttsCharacters || 0,
        durationSec: cdr.duration_sec || durationSec,
        providerUsage: { ...body.providerUsage, transportUsd: cdr.cost_usd ?? costBreakdown.transport }
      });
      const delta = +(actualBreakdown.total - row.cost).toFixed(6);
      reconciliation = {
        call_id: id,
        tenant_id: tenantId,
        expected_cost_usd: row.cost,
        actual_cost_usd: actualBreakdown.total,
        delta_usd: delta,
        status: Math.abs(delta) <= 0.002 ? 'ok' : 'review',
        breakdown: actualBreakdown
      };
      await admin.from('cost_reconciliations').insert(reconciliation);
      await admin.from('calls').update({
        cost: actualBreakdown.total,
        cost_breakdown: actualBreakdown,
        cost_status: reconciliation.status,
        cost_reconciled_at: new Date().toISOString(),
        duration_sec: cdr.duration_sec || durationSec
      }).eq('id', id);
    }

    // Serialized hash-chained audit (advisory lock in SQL — no chain race).
    await admin.rpc('append_audit_event', {
      p_actor: 'ingest-call',
      p_action: 'call.ingested',
      p_entity_type: 'call',
      p_entity_id: id,
      p_tenant_id: tenantId,
      p_metadata: { externalCallId: row.external_call_id, reconciled: !!reconciliation }
    });
    await logRequest(admin, tenantId, 'ingest-call', 'ok');

    return json({ id, tenantId, cost: reconciliation?.actual_cost_usd ?? row.cost, reconciliation }, 201);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function usageRowsFromBreakdown(callId: string, tenantId: string, breakdown: any) {
  return Object.entries(breakdown)
    .filter(([k, v]) => ['stt', 'llm', 'tts', 'transport', 'media', 'platform'].includes(k) && Number(v) > 0)
    .map(([metric, amount]) => ({
      call_id: callId,
      tenant_id: tenantId,
      provider: metric === 'transport' ? 'verimor' : metric,
      metric,
      quantity: metric === 'llm' ? (breakdown.llmPromptTokens || 0) + (breakdown.llmCompletionTokens || 0) : null,
      unit: metric === 'llm' ? 'tokens' : metric === 'tts' ? 'chars' : metric === 'platform' ? 'call' : 'seconds',
      amount_usd: Number(amount),
      raw: breakdown
    }));
}

function normalizeCdr(cdr: any, defaults: { callId: string; tenantId: string; externalCallId: string | null }) {
  const exchangeRate = num(cdr.exchangeRate ?? cdr.usdTry ?? Deno.env.get('USD_TRY'), 47.52);
  const costTry = num(cdr.costTry ?? cdr.cost_try);
  const costUsd = Number.isFinite(Number(cdr.costUsd ?? cdr.cost_usd))
    ? Number(cdr.costUsd ?? cdr.cost_usd)
    : costTry > 0 ? costTry / exchangeRate : null;
  return {
    id: String(cdr.id || cdr.cdrId || defaults.externalCallId || crypto.randomUUID()),
    call_id: cdr.callId || defaults.callId,
    external_call_id: cdr.externalCallId || defaults.externalCallId,
    tenant_id: cdr.tenantId || defaults.tenantId,
    provider: 'verimor',
    direction: cdr.direction || 'inbound',
    from_number: cdr.from || cdr.fromNumber || null,
    to_number: cdr.to || cdr.toNumber || null,
    duration_sec: num(cdr.durationSec ?? cdr.duration_sec),
    billed_sec: num(cdr.billedSec ?? cdr.billed_sec ?? cdr.durationSec ?? cdr.duration_sec),
    cost_try: costTry || null,
    exchange_rate: exchangeRate,
    cost_usd: costUsd,
    raw: cdr
  };
}

// Best-effort observability; never fails the request.
async function logRequest(admin: any, tenantId: string | null, functionName: string, status: string) {
  try {
    await admin.from('function_request_log').insert({ tenant_id: tenantId, function_name: functionName, status });
  } catch (_) { /* non-fatal */ }
}
