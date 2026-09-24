// Agent bootstrap config. The LiveKit voice agent calls this once per worker
// process to fetch the provider keys and per-assistant settings, so Supabase
// stays the single place credentials live and get rotated.
//
// Security shape: the agent authenticates with AFIYET_INGEST_SECRET — a
// low-privilege shared secret that can only reach this endpoint and
// `ingest-call`. It deliberately does NOT hold a service-role key, so a
// compromised agent container cannot read tenant data.
//
// The AI keys themselves must still be handed to the agent: a live call streams
// audio to Groq/Inworld continuously, which cannot be proxied through an Edge
// Function without wrecking latency. The win is that they are stored and
// rotated in exactly one place.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-afiyet-ingest-secret',
  'access-control-allow-methods': 'GET, POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

// Groq retired these on 2026-06-17; a stored assistant may still reference one.
const DEPRECATED_LLMS = new Set(['llama-3.1-8b-instant', 'llama-3.3-70b-versatile']);
const DEFAULT_LLM = 'openai/gpt-oss-20b';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const ingestSecret = Deno.env.get('AFIYET_INGEST_SECRET') || '';
  if (!ingestSecret || req.headers.get('x-afiyet-ingest-secret') !== ingestSecret)
    return json({ error: 'unauthorized' }, 401);

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const { data, error } = await admin
      .from('assistants')
      .select('id, tenant_id, name, first_message, model, voice, transcriber, config');
    if (error) return json({ error: error.message }, 500);

    const assistants: Record<string, unknown> = {};
    for (const a of data ?? []) {
      const llm = a.model?.model;
      assistants[a.id] = {
        tenantId: a.tenant_id,
        name: a.name,
        firstMessage: a.first_message,
        // Never hand the agent a model Groq has retired — it would 404 mid-call.
        llmModel: !llm || DEPRECATED_LLMS.has(llm) ? DEFAULT_LLM : llm,
        voice: a.voice?.voiceId ?? null,
        language: a.transcriber?.language ?? a.config?.language ?? 'tr',
        greeting: a.config?.greeting ?? a.first_message ?? null,
        openHours: a.config?.openHours ?? null,
      };
    }

    // Phone number -> assistant, so the agent routes calls without its own map.
    const { data: numbers } = await admin
      .from('phone_numbers')
      .select('number, assistant_id')
      .eq('status', 'active');
    const numberMap: Record<string, string> = {};
    for (const n of numbers ?? []) if (n.number && n.assistant_id) numberMap[n.number] = n.assistant_id;

    return json({
      providers: {
        groqApiKey: Deno.env.get('GROQ_API_KEY') ?? null,
        inworldApiKey: Deno.env.get('INWORLD_API_KEY') ?? null,
      },
      assistants,
      numberMap,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
