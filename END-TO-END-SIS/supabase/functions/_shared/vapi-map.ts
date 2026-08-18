// Map our Postgres rows (snake_case) to Vapi's exact object shapes (camelCase),
// so the /vapi Edge Function is a drop-in Vapi replacement.
const ORG = 'org_afiyet';

export function rowToAssistant(r: any) {
  return {
    id: r.id,
    orgId: ORG,
    name: r.name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    transcriber: r.transcriber || {},
    model: r.model || {},
    voice: r.voice || {},
    firstMessage: r.first_message || '',
    analysisPlan: r.analysis_plan || undefined,
    metadata: r.config || {}
  };
}

// Our editable config -> assistant row patch (Vapi PATCH semantics).
export function assistantPatchToRow(body: any = {}) {
  const patch: any = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.firstMessage !== undefined) patch.first_message = body.firstMessage;
  if (body.model !== undefined) patch.model = body.model;
  if (body.voice !== undefined) patch.voice = body.voice;
  if (body.transcriber !== undefined) patch.transcriber = body.transcriber;
  if (body.metadata !== undefined) patch.config = body.metadata;
  return patch;
}

export function assistantCreateToRow(body: any = {}) {
  return {
    id: body.id || `asst_${crypto.randomUUID().slice(0, 8)}`,
    tenant_id: body.tenantId || body.metadata?.tenantId || null,
    name: body.name || 'Assistant',
    first_message: body.firstMessage || 'Merhaba, size nasıl yardımcı olabilirim?',
    model: body.model || { provider: 'groq', model: 'llama-3.1-8b-instant' },
    voice: body.voice || { provider: 'inworld', voiceId: 'Ashley' },
    transcriber: body.transcriber || { provider: 'groq', language: 'tr' },
    config: body.metadata || {}
  };
}

export function rowToCall(r: any) {
  const cb = r.cost_breakdown || {};
  return {
    id: r.id,
    orgId: ORG,
    assistantId: r.assistant_id,
    type: r.type || 'inboundPhoneCall',
    status: r.status || 'ended',
    endedReason: r.answered === false ? 'customer-did-not-answer' : 'customer-ended-call',
    createdAt: r.created_at,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    cost: Number(r.cost) || 0,
    costBreakdown: {
      transport: Number(cb.transport) || 0,
      stt: Number(cb.stt) || 0,
      llm: Number(cb.llm) || 0,
      tts: Number(cb.tts) || 0,
      vapi: Number(cb.vapi ?? cb.platform) || 0,
      total: Number(cb.total) || Number(r.cost) || 0,
      llmPromptTokens: cb.llmPromptTokens || 0,
      llmCompletionTokens: cb.llmCompletionTokens || 0,
      ttsCharacters: cb.ttsCharacters || 0
    },
    messages: r.messages || [],
    transcript: Array.isArray(r.messages)
      ? r.messages.map((m: any) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.message}`).join('\n')
      : '',
    recordingUrl: r.recording_url || null,
    analysis: r.analysis || null,
    customer: r.customer_name ? { name: r.customer_name } : null
  };
}
