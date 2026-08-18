// Vapi-COMPATIBLE gateway on Supabase.
// Base URL:  https://<ref>.supabase.co/functions/v1/vapi
// Auth:      Authorization: Bearer <VAPI_COMPAT_KEY>   (our "Vapi private key")
// Exposes the exact Vapi contract (/assistant, /call) so any Vapi client — or
// our backend proxy (DATA_SOURCE=vapi, VAPI_BASE_URL=.../functions/v1/vapi) —
// swaps to us by changing one URL + key.
//
// Deploy with:  supabase functions deploy vapi --no-verify-jwt
// (auth is the VAPI_COMPAT_KEY, not a Supabase JWT — matches Vapi's model.)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runTurn } from '../_shared/engine.ts';
import { rowToAssistant, rowToCall, assistantCreateToRow, assistantPatchToRow } from '../_shared/vapi-map.ts';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS'
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Vapi-style private-key auth.
  const KEY = Deno.env.get('VAPI_COMPAT_KEY');
  if (KEY && req.headers.get('authorization') !== `Bearer ${KEY}`) return json({ message: 'Unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const url = new URL(req.url);
  const seg = url.pathname.split('/').filter(Boolean); // ['vapi','assistant', id?]
  const resource = seg[1];
  const id = seg[2];
  const limit = Number(url.searchParams.get('limit') || 100);
  const m = req.method;

  try {
    // ---------------- /assistant ----------------
    if (resource === 'assistant') {
      if (m === 'GET' && !id) {
        const { data } = await admin.from('assistants').select('*').order('created_at', { ascending: false }).limit(limit);
        return json((data || []).map(rowToAssistant));
      }
      if (m === 'GET' && id) {
        const { data } = await admin.from('assistants').select('*').eq('id', id).maybeSingle();
        return data ? json(rowToAssistant(data)) : json({ message: 'Not found' }, 404);
      }
      if (m === 'POST') {
        const row = assistantCreateToRow(await req.json());
        const { data, error } = await admin.from('assistants').insert(row).select('*').single();
        return error ? json({ message: error.message }, 400) : json(rowToAssistant(data), 201);
      }
      if ((m === 'PATCH' || m === 'PUT') && id) {
        const { data, error } = await admin.from('assistants').update(assistantPatchToRow(await req.json())).eq('id', id).select('*').single();
        return error ? json({ message: error.message }, 400) : json(rowToAssistant(data));
      }
      if (m === 'DELETE' && id) {
        const { data } = await admin.from('assistants').select('*').eq('id', id).maybeSingle();
        await admin.from('assistants').delete().eq('id', id);
        return json(data ? rowToAssistant(data) : { id, deleted: true });
      }
    }

    // ---------------- /call ----------------
    if (resource === 'call') {
      if (m === 'GET' && !id) {
        const assistantId = url.searchParams.get('assistantId');
        let q = admin.from('calls').select('*').order('created_at', { ascending: false }).limit(limit);
        if (assistantId) q = q.eq('assistant_id', assistantId);
        const { data } = await q;
        return json((data || []).map(rowToCall));
      }
      if (m === 'GET' && id) {
        const { data } = await admin.from('calls').select('*').eq('id', id).maybeSingle();
        return data ? json(rowToCall(data)) : json({ message: 'Not found' }, 404);
      }
      if (m === 'POST') {
        // Vapi POST /call initiates a call. We run one web/test turn and persist.
        const body = await req.json();
        const { data: assistant } = await admin.from('assistants').select('*').eq('id', body.assistantId).maybeSingle();
        if (!assistant) return json({ message: 'assistantId not found' }, 400);
        const r = await runTurn(assistant, { input: body.input });
        const nowIso = new Date().toISOString();
        const row = {
          id: `call_${crypto.randomUUID().slice(0, 8)}`, tenant_id: assistant.tenant_id, assistant_id: assistant.id,
          type: body.type || 'webCall', status: 'ended', answered: true,
          outcome: r.outcome, order_amount: r.orderAmount, customer_name: r.analysis?.structuredData?.customerName || null,
          summary: r.analysis.summary, duration_sec: r.durationSec, cost: r.cost, cost_breakdown: r.costBreakdown,
          messages: r.messages, analysis: r.analysis, started_at: nowIso, ended_at: nowIso
        };
        const { data, error } = await admin.from('calls').insert(row).select('*').single();
        return error ? json({ message: error.message }, 500) : json(rowToCall(data), 201);
      }
      if (m === 'DELETE' && id) {
        await admin.from('calls').delete().eq('id', id);
        return json({ id, deleted: true });
      }
    }

    return json({ message: `no route ${m} /${seg.slice(1).join('/')}` }, 404);
  } catch (e) {
    return json({ message: String(e) }, 500);
  }
});
