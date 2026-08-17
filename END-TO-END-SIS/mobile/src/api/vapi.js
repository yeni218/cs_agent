// Vapi-shaped resource calls, normalized into flat objects the UI consumes.
// Because our own backend returns the SAME shapes, these functions work
// unchanged when we swap baseUrl to the sovereign backend.
import { DEMO_ASSISTANTS, DEMO_CALLS } from './demoData.js';

const asArray = (data) => (Array.isArray(data) ? data : data?.results || data?.items || []);

export async function listAssistants(client, { limit = 100 } = {}) {
  const raw = client.demo ? DEMO_ASSISTANTS : asArray(await client.get('/assistant', { limit }));
  return raw.map(normalizeAssistant);
}

export async function listCalls(client, { limit = 100 } = {}) {
  const raw = client.demo ? DEMO_CALLS : asArray(await client.get('/call', { limit }));
  return raw.map(normalizeCall);
}

function normalizeAssistant(a) {
  return {
    id: a.id,
    name: a.name || '(isimsiz asistan)',
    model: a.model?.model || a.model?.provider || '—',
    voice: a.voice?.voiceId || a.voice?.provider || '—',
    transcriber: a.transcriber?.provider || '—',
    createdAt: a.createdAt,
    updatedAt: a.updatedAt
  };
}

function normalizeCall(c) {
  const started = c.startedAt ? Date.parse(c.startedAt) : null;
  const ended = c.endedAt ? Date.parse(c.endedAt) : null;
  const durationSec = started && ended ? Math.max(0, (ended - started) / 1000) : 0;
  const cb = c.costBreakdown || {};
  return {
    id: c.id,
    assistantId: c.assistantId,
    type: c.type || 'unknown',
    status: c.status || 'unknown',
    endedReason: c.endedReason || null,
    startedAt: c.startedAt || c.createdAt || null,
    endedAt: c.endedAt || null,
    durationSec,
    cost: Number(c.cost) || 0,
    costBreakdown: {
      stt: Number(cb.stt) || 0,
      llm: Number(cb.llm) || 0,
      tts: Number(cb.tts) || 0,
      transport: Number(cb.transport) || 0,
      vapi: Number(cb.vapi) || 0
    }
  };
}

// ---- Analytics derived entirely on-device from the call list ----
export function computeAnalytics(calls) {
  const ended = calls.filter((c) => c.status === 'ended');
  const totalCost = calls.reduce((s, c) => s + c.cost, 0);
  const totalDur = calls.reduce((s, c) => s + c.durationSec, 0);
  const avgDur = ended.length ? totalDur / ended.length : 0;

  const breakdown = calls.reduce(
    (acc, c) => {
      acc.stt += c.costBreakdown.stt;
      acc.llm += c.costBreakdown.llm;
      acc.tts += c.costBreakdown.tts;
      acc.transport += c.costBreakdown.transport;
      acc.vapi += c.costBreakdown.vapi;
      return acc;
    },
    { stt: 0, llm: 0, tts: 0, transport: 0, vapi: 0 }
  );

  const byType = {};
  const byStatus = {};
  for (const c of calls) {
    byType[c.type] = (byType[c.type] || 0) + 1;
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  }

  const costPerMin = totalDur > 0 ? totalCost / (totalDur / 60) : 0;

  return {
    totalCalls: calls.length,
    endedCalls: ended.length,
    totalCost,
    avgDurationSec: avgDur,
    costPerMin,
    breakdown,
    byType,
    byStatus
  };
}
