// Supabase Edge Function: POST /functions/v1/call
// Runs one call turn (Groq LLM + Inworld TTS), writes the full call (with cost)
// using the service role, and returns a COST-FREE result to the caller.
// This is the only server-side code — the rest of the app talks to Supabase
// directly.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runTurn } from '../_shared/engine.ts';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey',
  'access-control-allow-methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const { assistantId, input } = await req.json();

    // Service-role client — bypasses RLS to read the assistant and write the call.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const { data: assistant, error } = await admin.from('assistants').select('*').eq('id', assistantId).single();
    if (error || !assistant) return json({ error: 'assistant not found' }, 404);

    const r = await runTurn(assistant, { input });

    const id = `call_${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();
    const row = {
      id, tenant_id: assistant.tenant_id, assistant_id: assistant.id,
      type: 'webCall', status: 'ended', answered: true,
      outcome: r.outcome, order_amount: r.orderAmount, customer_name: r.analysis?.structuredData?.customerName || null,
      summary: r.analysis.summary, duration_sec: r.durationSec,
      cost: r.cost, cost_breakdown: r.costBreakdown,          // stored, never returned to customer
      messages: r.messages, analysis: r.analysis, recording_url: null,
      started_at: nowIso, ended_at: nowIso
    };
    const { error: insErr } = await admin.from('calls').insert(row);
    if (insErr) return json({ error: insErr.message }, 500);

    // Strip cost before returning.
    const { cost, cost_breakdown, ...safe } = row;
    return json(safe, 201);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
