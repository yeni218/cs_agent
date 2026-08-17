// Sample Vapi-shaped payloads so the app is fully explorable with no API key.
// Shapes mirror https://api.vapi.ai/assistant and /call.
const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();

export const DEMO_ASSISTANTS = [
  {
    id: 'asst_kasko_01',
    name: 'Kasko Teklif Asistanı',
    model: { provider: 'openai', model: 'gpt-4o-mini' },
    voice: { provider: 'piper', voiceId: 'tr_TR-dfki-medium' },
    transcriber: { provider: 'whisper', language: 'tr' },
    createdAt: iso(30 * 864e5),
    updatedAt: iso(2 * 864e5)
  },
  {
    id: 'asst_trafik_02',
    name: 'Trafik Sigortası Asistanı',
    model: { provider: 'local', model: 'qwen2.5:3b-instruct' },
    voice: { provider: 'piper', voiceId: 'tr_TR-dfki-medium' },
    transcriber: { provider: 'faster-whisper', language: 'tr' },
    createdAt: iso(21 * 864e5),
    updatedAt: iso(1 * 864e5)
  },
  {
    id: 'asst_seyahat_03',
    name: 'Seyahat Sağlık Asistanı',
    model: { provider: 'local', model: 'qwen2.5:3b-instruct' },
    voice: { provider: 'xtts', voiceId: 'afiyet-tr' },
    transcriber: { provider: 'faster-whisper', language: 'tr' },
    createdAt: iso(10 * 864e5),
    updatedAt: iso(6 * 36e5)
  }
];

function mkCall(i, { type, status, endedReason, durMin, stt, llm, tts, transport, startedMsAgo, assistantId }) {
  const started = startedMsAgo;
  const ended = started - durMin * 60 * 1000;
  return {
    id: `call_${1000 + i}`,
    orgId: 'org_demo',
    assistantId,
    type,
    status,
    endedReason,
    startedAt: iso(started),
    endedAt: status === 'ended' ? iso(ended) : null,
    createdAt: iso(started + 2000),
    cost: +(stt + llm + tts + transport + 0.01).toFixed(4),
    costBreakdown: { stt, llm, tts, transport, vapi: 0.01 }
  };
}

const A = DEMO_ASSISTANTS;
export const DEMO_CALLS = [
  mkCall(1, { type: 'inboundPhoneCall', status: 'ended', endedReason: 'customer-ended-call', durMin: 3.2, stt: 0.006, llm: 0.011, tts: 0.008, transport: 0.021, startedMsAgo: 1 * 36e5, assistantId: A[0].id }),
  mkCall(2, { type: 'inboundPhoneCall', status: 'ended', endedReason: 'assistant-forwarded-call', durMin: 5.1, stt: 0.010, llm: 0.019, tts: 0.013, transport: 0.034, startedMsAgo: 3 * 36e5, assistantId: A[1].id }),
  mkCall(3, { type: 'webCall', status: 'ended', endedReason: 'customer-ended-call', durMin: 1.4, stt: 0.003, llm: 0.005, tts: 0.004, transport: 0.0, startedMsAgo: 8 * 36e5, assistantId: A[0].id }),
  mkCall(4, { type: 'inboundPhoneCall', status: 'ended', endedReason: 'silence-timed-out', durMin: 0.6, stt: 0.001, llm: 0.002, tts: 0.001, transport: 0.004, startedMsAgo: 26 * 36e5, assistantId: A[2].id }),
  mkCall(5, { type: 'inboundPhoneCall', status: 'ended', endedReason: 'customer-ended-call', durMin: 4.4, stt: 0.009, llm: 0.016, tts: 0.011, transport: 0.029, startedMsAgo: 30 * 36e5, assistantId: A[1].id }),
  mkCall(6, { type: 'outboundPhoneCall', status: 'ended', endedReason: 'assistant-ended-call', durMin: 2.0, stt: 0.004, llm: 0.007, tts: 0.005, transport: 0.013, startedMsAgo: 52 * 36e5, assistantId: A[0].id }),
  mkCall(7, { type: 'inboundPhoneCall', status: 'in-progress', endedReason: null, durMin: 1.1, stt: 0.002, llm: 0.004, tts: 0.003, transport: 0.007, startedMsAgo: 0.2 * 36e5, assistantId: A[2].id })
];
