// Thin Vapi REST client + mappers from Vapi's shapes to our normalized shapes.
// Normalized calls keep cost fields; the server's redaction strips them for the
// customer scope. Where a field depends on the assistant's configured
// structuredDataSchema (order total, customer name, intent), we read
// analysis.structuredData and fall back gracefully.
const NO_ANSWER = /no-answer|busy|failed|voicemail|customer-did-not-answer|pipeline-error/i;

export class VapiClient {
  constructor({ apiKey, baseUrl = 'https://api.vapi.ai' } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async req(method, path, { params = {}, body } = {}) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const res = await fetch(`${this.baseUrl}${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Vapi ${res.status} ${path}: ${detail}`.slice(0, 300));
    }
    return res.json();
  }

  listAssistants(params) { return this.req('GET', '/assistant', { params }); }
  getAssistant(id) { return this.req('GET', `/assistant/${id}`); }
  patchAssistant(id, body) { return this.req('PATCH', `/assistant/${id}`, { body }); }
  listCalls(params) { return this.req('GET', '/call', { params }); }
  getCall(id) { return this.req('GET', `/call/${id}`); }
}

export function mapAssistant(v, tenantId) {
  return {
    id: v.id,
    tenantId,
    orgId: v.orgId,
    name: v.name || '(isimsiz asistan)',
    model: { provider: v.model?.provider, model: v.model?.model },
    voice: { provider: v.voice?.provider, voiceId: v.voice?.voiceId },
    transcriber: { provider: v.transcriber?.provider, language: v.transcriber?.language },
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    // Surface the editable bits our UI knows about.
    config: {
      greeting: v.firstMessage || '',
      openHours: v.metadata?.openHours || '',
      language: v.transcriber?.language || 'tr'
    }
  };
}

// Our editable config -> Vapi assistant patch body.
export function mapConfigToVapi(config = {}) {
  const body = {};
  if (config.greeting !== undefined) body.firstMessage = config.greeting;
  if (config.openHours !== undefined || config.language !== undefined) {
    body.metadata = {};
    if (config.openHours !== undefined) body.metadata.openHours = config.openHours;
  }
  return body;
}

export function mapCall(v, tenantId) {
  const started = v.startedAt ? Date.parse(v.startedAt) : null;
  const ended = v.endedAt ? Date.parse(v.endedAt) : null;
  const durationSec = started && ended ? Math.max(0, (ended - started) / 1000) : 0;
  const sd = v.analysis?.structuredData || {};
  const answered = v.status === 'ended' && !NO_ANSWER.test(v.endedReason || '');
  const cb = v.costBreakdown || {};
  return {
    id: v.id,
    orgId: v.orgId,
    tenantId,
    assistantId: v.assistantId,
    type: v.type || 'inboundPhoneCall',
    status: v.status,
    endedReason: v.endedReason || null,
    answered,
    outcome: sd.intent || (answered ? 'faq' : 'missed'),
    orderAmount: Number(sd.total) || 0,
    customerName: sd.customerName || v.customer?.name || v.customer?.number || 'Bilinmeyen',
    summary: v.analysis?.summary || '',
    startedAt: v.startedAt || v.createdAt || null,
    endedAt: v.endedAt || null,
    durationSec,
    cost: Number(v.cost) || 0,
    costBreakdown: {
      stt: Number(cb.stt) || 0,
      llm: Number(cb.llm) || 0,
      tts: Number(cb.tts) || 0,
      transport: Number(cb.transport) || 0,
      platform: Number(cb.vapi) || 0
    }
  };
}

export function mapCallDetail(v, tenantId) {
  const base = mapCall(v, tenantId);
  const rawMsgs = v.messages || v.artifact?.messages || [];
  const transcript = rawMsgs
    .filter((m) => m.role === 'user' || m.role === 'bot' || m.role === 'assistant')
    .map((m) => ({ role: m.role === 'bot' ? 'assistant' : m.role, text: m.message || m.content || '' }))
    .filter((m) => m.text);
  const sd = v.analysis?.structuredData || {};
  return {
    ...base,
    transcript,
    recordingUrl: v.recordingUrl || v.artifact?.recordingUrl || v.artifact?.recording?.stereoUrl || null,
    analysis: {
      summary: v.analysis?.summary || '',
      structuredData: sd,
      successEvaluation: v.analysis?.successEvaluation ?? (base.answered ? 'success' : 'failed')
    }
  };
}
