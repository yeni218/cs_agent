// Vapi-compatible object builders. These shapes match api.vapi.ai so our own
// infrastructure is a drop-in replacement — the E2E-SIS backend / dashboard
// switch by changing only the base URL.
import { randomUUID } from 'node:crypto';

const nowIso = () => new Date().toISOString();
const ORG_ID = process.env.ORG_ID || 'org_afiyet';

// ---- Assistant (matches Vapi GET/POST /assistant) ----
export function buildAssistant(input = {}) {
  const ts = nowIso();
  return {
    id: input.id || `asst_${randomUUID().slice(0, 8)}`,
    orgId: ORG_ID,
    name: input.name || 'Assistant',
    createdAt: ts,
    updatedAt: ts,
    // Voice pipeline — our providers behind Vapi's field names.
    transcriber: {
      provider: input.transcriber?.provider || 'groq',        // Groq Whisper
      model: input.transcriber?.model || 'whisper-large-v3-turbo',
      language: input.transcriber?.language || 'tr'
    },
    model: {
      provider: input.model?.provider || 'groq',              // Groq LLM
      model: input.model?.model || 'llama-3.3-70b-versatile',
      temperature: input.model?.temperature ?? 0.3,
      maxTokens: input.model?.maxTokens ?? 250,
      messages: input.model?.messages || [{ role: 'system', content: input.systemPrompt || 'Sen yardımcı bir sesli asistansın.' }]
    },
    voice: {
      provider: input.voice?.provider || 'inworld',           // Inworld AI TTS
      voiceId: input.voice?.voiceId || 'Ashley'
    },
    firstMessage: input.firstMessage || 'Merhaba, size nasıl yardımcı olabilirim?',
    // Where an order/intent schema lives (Vapi analysisPlan equivalent).
    analysisPlan: input.analysisPlan || {
      structuredDataSchema: {
        type: 'object',
        properties: { intent: { type: 'string' }, total: { type: 'number' }, customerName: { type: 'string' }, items: { type: 'array' } }
      }
    },
    metadata: input.metadata || {}
  };
}

export function applyAssistantPatch(existing, patch = {}) {
  const merged = { ...existing };
  for (const k of ['name', 'firstMessage', 'metadata', 'analysisPlan']) if (patch[k] !== undefined) merged[k] = patch[k];
  for (const k of ['transcriber', 'model', 'voice']) if (patch[k] !== undefined) merged[k] = { ...existing[k], ...patch[k] };
  merged.updatedAt = nowIso();
  return merged;
}

// ---- Call (matches Vapi GET/POST /call) ----
export function buildCall(input = {}) {
  const ts = nowIso();
  return {
    id: input.id || `call_${randomUUID().slice(0, 8)}`,
    orgId: ORG_ID,
    assistantId: input.assistantId || null,
    phoneNumberId: input.phoneNumberId || null,
    type: input.type || 'inboundPhoneCall',        // inboundPhoneCall | outboundPhoneCall | webCall
    status: input.status || 'queued',              // queued | ringing | in-progress | ended
    endedReason: null,
    createdAt: ts,
    updatedAt: ts,
    startedAt: null,
    endedAt: null,
    customer: input.customer || null,              // { number, name }
    messages: [],
    transcript: '',
    recordingUrl: null,
    analysis: null,                                // { summary, structuredData, successEvaluation }
    cost: 0,
    costBreakdown: emptyCostBreakdown()
  };
}

export function emptyCostBreakdown() {
  return { transport: 0, stt: 0, llm: 0, tts: 0, vapi: 0, total: 0, llmPromptTokens: 0, llmCompletionTokens: 0, ttsCharacters: 0 };
}

// ---- Phone number (matches Vapi /phone-number) ----
export function buildPhoneNumber(input = {}) {
  const ts = nowIso();
  return {
    id: input.id || `phn_${randomUUID().slice(0, 8)}`,
    orgId: ORG_ID,
    number: input.number || null,
    provider: input.provider || 'afiyet-telephony',  // Jambonz/Asterisk in prod
    assistantId: input.assistantId || null,
    name: input.name || null,
    createdAt: ts,
    updatedAt: ts,
    status: input.status || 'active'
  };
}
