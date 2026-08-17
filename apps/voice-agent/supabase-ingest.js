const SUPABASE_URL = process.env.SUPABASE_URL || process.env.AFIYET_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.AFIYET_SUPABASE_ANON_KEY;
const INGEST_SECRET = process.env.AFIYET_INGEST_SECRET || '';

export function isSupabaseIngestEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && INGEST_SECRET);
}

export async function ingestCompletedCall(payload, { logger = console } = {}) {
  if (!isSupabaseIngestEnabled()) {
    logger.info?.('Supabase ingest skipped; set SUPABASE_URL, SUPABASE_ANON_KEY, and AFIYET_INGEST_SECRET.');
    return { skipped: true };
  }

  const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/ingest-call`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
      'x-afiyet-ingest-secret': INGEST_SECRET,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) throw new Error(`Supabase ingest ${res.status}: ${text.slice(0, 300)}`);
  return body;
}
