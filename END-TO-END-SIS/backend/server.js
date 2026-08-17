// E2E-SIS backend — one brain, two faces, two data sources.
//
//   DATA_SOURCE=demo (default) → in-memory sample data
//   DATA_SOURCE=vapi           → live proxy to api.vapi.ai (needs VAPI_API_KEY
//                                and tenants.json mapping tenants → assistantIds)
//
//   /customer/*  → tenant-scoped, COGS STRIPPED server-side
//   /admin/*     → full economics
//   /assistant, /call → Vapi-shaped raw (full)
//
// The redaction rule is enforced HERE for BOTH sources: the customer scope
// builds objects that physically lack cost fields. Zero deps beyond node + our
// vapi client. `node server.js`.
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { VapiClient, mapAssistant, mapConfigToVapi, mapCall, mapCallDetail } from './src/vapi.js';

const PORT = Number.parseInt(process.env.PORT || '8787', 10);
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const DATA_SOURCE = (process.env.DATA_SOURCE || 'demo').toLowerCase();
const USE_VAPI = DATA_SOURCE === 'vapi' && !!process.env.VAPI_API_KEY;

const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();

// ---- Accounts (our own auth, independent of the data source) ----
const USERS = [
  { email: 'lezzet@demo.com', password: 'demo', token: 'tok_lezzet', role: 'customer', tenantId: 't_lezzet', name: 'Lezzet Restoran' },
  { email: 'kebap@demo.com', password: 'demo', token: 'tok_kebap', role: 'customer', tenantId: 't_kebap', name: 'Kebapçı Ali' },
  { email: 'admin@afiyet.ai', password: 'admin', token: 'tok_admin', role: 'admin', name: 'Platform Admin' }
];

// ---- Demo data ----
const demoTenants = [
  { id: 't_lezzet', name: 'Lezzet Restoran', language: 'tr', phoneNumber: '+902121112233', status: 'active', plan: { name: 'Pro', monthlyPrice: 299, includedMinutes: 1000 } },
  { id: 't_kebap', name: 'Kebapçı Ali', language: 'tr', phoneNumber: '+903124445566', status: 'active', plan: { name: 'Başlangıç', monthlyPrice: 149, includedMinutes: 400 } },
  { id: 't_pizza', name: 'Pizza Napoli', language: 'tr', phoneNumber: '+902327778899', status: 'trial', plan: { name: 'Deneme', monthlyPrice: 0, includedMinutes: 100 } }
];

const demoAssistants = [
  { id: 'asst_lezzet', tenantId: 't_lezzet', orgId: 'org_afiyet', name: 'Lezzet Sipariş Asistanı', model: { provider: 'local', model: 'qwen2.5:3b-instruct' }, voice: { provider: 'piper', voiceId: 'tr_TR-dfki-medium' }, transcriber: { provider: 'faster-whisper', language: 'tr' }, createdAt: iso(40 * 864e5), updatedAt: iso(2 * 864e5) },
  { id: 'asst_kebap', tenantId: 't_kebap', orgId: 'org_afiyet', name: 'Kebapçı Ali Asistanı', model: { provider: 'local', model: 'qwen2.5:3b-instruct' }, voice: { provider: 'piper', voiceId: 'tr_TR-dfki-medium' }, transcriber: { provider: 'faster-whisper', language: 'tr' }, createdAt: iso(25 * 864e5), updatedAt: iso(1 * 864e5) },
  { id: 'asst_pizza', tenantId: 't_pizza', orgId: 'org_afiyet', name: 'Pizza Napoli Asistanı', model: { provider: 'local', model: 'qwen2.5:3b-instruct' }, voice: { provider: 'xtts', voiceId: 'afiyet-tr' }, transcriber: { provider: 'faster-whisper', language: 'tr' }, createdAt: iso(8 * 864e5), updatedAt: iso(6 * 36e5) }
];
for (const a of demoAssistants) {
  a.firstMessage = `${a.name}, hoş geldiniz. Nasıl yardımcı olabilirim?`;
  a.metadata = { tenantId: a.tenantId, openHours: '11:00 - 23:00' };
  a.config = { greeting: a.firstMessage, openHours: '11:00 - 23:00', language: 'tr' };
}

const demoPhoneNumbers = demoTenants.map((t) => {
  const assistant = demoAssistants.find((a) => a.tenantId === t.id);
  return {
    id: `pn_${t.id}`,
    orgId: 'org_afiyet',
    tenantId: t.id,
    assistantId: assistant?.id,
    provider: 'byo-phone-number',
    name: `${t.name} ana hat`,
    number: t.phoneNumber,
    status: t.status,
    createdAt: iso(30 * 864e5),
    updatedAt: iso(1 * 864e5),
    metadata: { tenantId: t.id }
  };
});

const demoCalls = [
  mkCall('t_lezzet', 'asst_lezzet', 1, { durMin: 3.2, answered: true, outcome: 'order', orderAmount: 420, customer: 'Ahmet Y.', summary: 'Karışık pizza + ayran siparişi', stt: 0.006, llm: 0.011, tts: 0.008, transport: 0.021, startedMsAgo: 1 * 36e5 }),
  mkCall('t_lezzet', 'asst_lezzet', 2, { durMin: 1.1, answered: true, outcome: 'faq', orderAmount: 0, customer: 'Bilinmeyen', summary: 'Çalışma saatleri soruldu', stt: 0.002, llm: 0.004, tts: 0.003, transport: 0.007, startedMsAgo: 5 * 36e5 }),
  mkCall('t_lezzet', 'asst_lezzet', 3, { durMin: 4.4, answered: true, outcome: 'order', orderAmount: 615, customer: 'Zeynep K.', summary: 'İki kişilik menü + tatlı', stt: 0.009, llm: 0.016, tts: 0.011, transport: 0.029, startedMsAgo: 27 * 36e5 }),
  mkCall('t_lezzet', 'asst_lezzet', 4, { durMin: 0.4, answered: false, outcome: 'missed', orderAmount: 0, customer: 'Bilinmeyen', summary: 'Arayan bağlanmadan kapattı', stt: 0.001, llm: 0.001, tts: 0.0, transport: 0.003, startedMsAgo: 50 * 36e5 }),
  mkCall('t_kebap', 'asst_kebap', 5, { durMin: 2.6, answered: true, outcome: 'order', orderAmount: 260, customer: 'Mehmet A.', summary: 'Adana porsiyon + lahmacun', stt: 0.005, llm: 0.009, tts: 0.006, transport: 0.017, startedMsAgo: 2 * 36e5 }),
  mkCall('t_kebap', 'asst_kebap', 6, { durMin: 5.1, answered: true, outcome: 'reservation', orderAmount: 0, customer: 'Ayşe D.', summary: 'Akşam 8 için 4 kişilik rezervasyon', stt: 0.010, llm: 0.019, tts: 0.013, transport: 0.034, startedMsAgo: 22 * 36e5 }),
  mkCall('t_kebap', 'asst_kebap', 7, { durMin: 1.9, answered: true, outcome: 'order', orderAmount: 190, customer: 'Can T.', summary: 'İskender + şalgam', stt: 0.004, llm: 0.007, tts: 0.005, transport: 0.013, startedMsAgo: 46 * 36e5 }),
  mkCall('t_pizza', 'asst_pizza', 8, { durMin: 1.4, answered: true, outcome: 'order', orderAmount: 340, customer: 'Deniz S.', summary: 'Margarita + kola', stt: 0.003, llm: 0.005, tts: 0.004, transport: 0.0, startedMsAgo: 3 * 36e5 })
];

function mkCall(tenantId, assistantId, i, o) {
  const cost = +(o.stt + o.llm + o.tts + o.transport + 0.01).toFixed(4);
  return {
    id: `call_${1000 + i}`, orgId: 'org_afiyet', tenantId, assistantId, type: 'inboundPhoneCall', status: 'ended',
    answered: o.answered, outcome: o.outcome, orderAmount: o.orderAmount, customerName: o.customer, summary: o.summary,
    startedAt: iso(o.startedMsAgo), endedAt: iso(o.startedMsAgo - o.durMin * 60000), createdAt: iso(o.startedMsAgo + 2000),
    durationSec: Math.round(o.durMin * 60),
    cost, costBreakdown: { stt: o.stt, llm: o.llm, tts: o.tts, transport: o.transport, platform: 0.01 }
  };
}

// ---- Detail synthesis (demo only; Vapi provides real transcripts) ----
function detailFor(c) {
  const items = (c.summary || '').split(/[+,]/).map((s) => s.trim()).filter(Boolean);
  const t = [{ role: 'assistant', text: 'Hoş geldiniz, nasıl yardımcı olabilirim?' }];
  if (c.outcome === 'order') {
    t.push({ role: 'user', text: `${items.join(', ')} istiyorum.` });
    t.push({ role: 'assistant', text: `Tabii, toplam ${c.orderAmount} lira. Onaylıyor musunuz?` });
    t.push({ role: 'user', text: 'Evet, onaylıyorum.' });
    t.push({ role: 'assistant', text: 'Siparişiniz alındı, afiyet olsun!' });
  } else if (c.outcome === 'reservation') {
    t.push({ role: 'user', text: c.summary }, { role: 'assistant', text: 'Rezervasyonunuzu oluşturdum, teşekkürler.' });
  } else if (c.outcome === 'faq') {
    t.push({ role: 'user', text: c.summary }, { role: 'assistant', text: 'Çalışma saatlerimiz her gün 11:00 - 23:00 arasındadır.' });
  } else {
    t.push({ role: 'user', text: '(bağlantı koptu)' });
  }
  return {
    transcript: t,
    recordingUrl: `https://recordings.afiyet.local/${c.id}.wav`,
    analysis: {
      summary: c.summary,
      structuredData: c.outcome === 'order' ? { intent: 'order', items, total: c.orderAmount, currency: 'TRY' } : { intent: c.outcome },
      successEvaluation: c.answered ? 'success' : 'failed'
    }
  };
}

function nextId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function assistantConfig(a) {
  return {
    ...(a.config || {}),
    greeting: a.config?.greeting || a.firstMessage || '',
    openHours: a.config?.openHours || a.metadata?.openHours || '',
    language: a.config?.language || a.transcriber?.language || 'tr'
  };
}

function applyAssistantConfig(a, config = {}) {
  a.config = { ...assistantConfig(a), ...config };
  if (config.greeting !== undefined) a.firstMessage = config.greeting;
  if (config.openHours !== undefined) a.metadata = { ...(a.metadata || {}), openHours: config.openHours };
  if (config.language !== undefined) a.transcriber = { ...(a.transcriber || {}), language: config.language };
  a.updatedAt = new Date().toISOString();
  return a;
}

function applyRawAssistantPatch(a, patch = {}) {
  const { config, ...raw } = patch;
  Object.assign(a, raw);
  if (raw.metadata) a.metadata = { ...(a.metadata || {}), ...raw.metadata };
  if (raw.transcriber) a.transcriber = { ...(a.transcriber || {}), ...raw.transcriber };
  if (raw.model) a.model = { ...(a.model || {}), ...raw.model };
  if (raw.voice) a.voice = { ...(a.voice || {}), ...raw.voice };
  a.config = assistantConfig(a);
  if (config) applyAssistantConfig(a, config);
  if (a.firstMessage !== undefined) a.config.greeting = a.firstMessage;
  if (a.metadata?.openHours !== undefined) a.config.openHours = a.metadata.openHours;
  if (a.transcriber?.language !== undefined) a.config.language = a.transcriber.language;
  a.updatedAt = new Date().toISOString();
  return a;
}

function createDemoAssistant(body = {}) {
  const nowIso = new Date().toISOString();
  const tenantId = body.tenantId || body.metadata?.tenantId || demoTenants[0]?.id;
  const a = {
    ...body,
    id: body.id || nextId('asst'),
    orgId: body.orgId || 'org_afiyet',
    tenantId,
    name: body.name || 'Yeni Afiyet Asistanı',
    model: body.model || { provider: 'groq', model: 'llama-3.1-8b-instant' },
    voice: body.voice || { provider: 'inworld', voiceId: 'inworld-tts-1.5-mini' },
    transcriber: body.transcriber || { provider: 'groq', model: 'whisper-large-v3-turbo', language: 'tr' },
    metadata: { ...(body.metadata || {}), tenantId },
    createdAt: body.createdAt || nowIso,
    updatedAt: body.updatedAt || nowIso
  };
  a.config = assistantConfig(a);
  if (!a.firstMessage) a.firstMessage = a.config.greeting || `${a.name}, hoş geldiniz. Nasıl yardımcı olabilirim?`;
  a.config = assistantConfig(a);
  demoAssistants.push(a);
  return a;
}

function createDemoCall(body = {}) {
  const assistant = demoAssistants.find((a) => a.id === body.assistantId) || demoAssistants[0];
  const tenantId = body.tenantId || body.metadata?.tenantId || assistant?.tenantId || demoTenants[0]?.id;
  const text = typeof body.input === 'string'
    ? body.input
    : Array.isArray(body.input)
      ? body.input.map((m) => m.content || m.message || m.text || '').join(' ')
      : '';
  const amount = Number(body.analysis?.structuredData?.total || body.orderAmount || 0);
  const inferredOrder = amount > 0 || /sipariş|order|pizza|kebap|menü|burger|lahmacun/i.test(text);
  const startedAt = body.startedAt || body.createdAt || new Date().toISOString();
  const durationSec = Number(body.durationSec || body.duration_sec || (text ? 65 : 0));
  const startedMs = Date.parse(startedAt);
  const endedAt = text && !Number.isNaN(startedMs) ? new Date(startedMs + durationSec * 1000).toISOString() : body.endedAt || null;
  const costBreakdown = body.costBreakdown || { stt: 0, llm: 0, tts: 0, transport: 0, platform: 0 };
  const cost = Number(body.cost || Object.values(costBreakdown).reduce((s, v) => s + Number(v || 0), 0).toFixed(4));
  const call = {
    ...body,
    id: body.id || nextId('call'),
    orgId: body.orgId || 'org_afiyet',
    tenantId,
    assistantId: assistant?.id || body.assistantId,
    type: body.type || 'outboundPhoneCall',
    status: body.status || (text ? 'ended' : 'queued'),
    endedReason: body.endedReason || (text ? 'customer-ended-call' : null),
    answered: body.answered ?? !!text,
    outcome: body.outcome || body.analysis?.structuredData?.intent || (inferredOrder ? 'order' : 'faq'),
    orderAmount: amount,
    customerName: body.customerName || body.customer?.name || body.customer?.number || 'Bilinmeyen',
    summary: body.summary || text || 'Vapi uyumlu çağrı oluşturuldu',
    startedAt,
    endedAt,
    createdAt: body.createdAt || startedAt,
    durationSec,
    cost,
    costBreakdown
  };
  if (text) {
    call.transcript = [
      { role: 'user', text },
      { role: 'assistant', text: inferredOrder ? 'Siparişinizi aldım ve onay için hazırlıyorum.' : 'Size yardımcı oldum, teşekkürler.' }
    ];
    call.analysis = {
      ...(body.analysis || {}),
      summary: body.analysis?.summary || call.summary,
      structuredData: {
        intent: call.outcome,
        total: call.orderAmount,
        currency: 'TRY',
        ...(body.analysis?.structuredData || {})
      },
      successEvaluation: body.analysis?.successEvaluation || 'success'
    };
  }
  demoCalls.unshift(call);
  return call;
}

function callDetail(c) {
  const generated = detailFor(c);
  return {
    ...c,
    ...generated,
    transcript: c.transcript || generated.transcript,
    recordingUrl: c.recordingUrl || generated.recordingUrl,
    analysis: c.analysis || generated.analysis
  };
}

function createDemoPhoneNumber(body = {}) {
  const nowIso = new Date().toISOString();
  const assistant = demoAssistants.find((a) => a.id === body.assistantId);
  const tenantId = body.tenantId || body.metadata?.tenantId || assistant?.tenantId || demoTenants[0]?.id;
  const p = {
    ...body,
    id: body.id || nextId('pn'),
    orgId: body.orgId || 'org_afiyet',
    tenantId,
    provider: body.provider || 'byo-phone-number',
    name: body.name || 'Afiyet telefon hattı',
    number: body.number || body.sipUri || '',
    status: body.status || 'active',
    createdAt: body.createdAt || nowIso,
    updatedAt: body.updatedAt || nowIso,
    metadata: { ...(body.metadata || {}), tenantId }
  };
  demoPhoneNumbers.push(p);
  return p;
}

// ================= Data sources (uniform async interface) =================
const demoSource = {
  async getTenants() { return demoTenants; },
  async listAssistants(tenantId) { return tenantId ? demoAssistants.filter((a) => a.tenantId === tenantId) : demoAssistants; },
  async getAssistant(id) { return demoAssistants.find((a) => a.id === id) || null; },
  async patchAssistant(id, config) {
    const a = demoAssistants.find((x) => x.id === id);
    if (!a) return null;
    return applyAssistantConfig(a, config);
  },
  async rawListAssistants(params = {}) { return demoAssistants.slice(0, Number(params.limit) || 100); },
  async rawCreateAssistant(body) { return createDemoAssistant(body); },
  async rawGetAssistant(id) { return demoAssistants.find((a) => a.id === id) || null; },
  async rawPatchAssistant(id, body) {
    const a = demoAssistants.find((x) => x.id === id);
    return a ? applyRawAssistantPatch(a, body) : null;
  },
  async rawDeleteAssistant(id) {
    const i = demoAssistants.findIndex((a) => a.id === id);
    if (i < 0) return null;
    return demoAssistants.splice(i, 1)[0];
  },
  async listCalls(tenantId) { return tenantId ? demoCalls.filter((c) => c.tenantId === tenantId) : demoCalls; },
  async getCall(id) { const c = demoCalls.find((x) => x.id === id); return c ? callDetail(c) : null; },
  async rawListCalls(params = {}) {
    let rows = demoCalls;
    if (params.assistantId) rows = rows.filter((c) => c.assistantId === params.assistantId);
    return rows.slice(0, Number(params.limit) || 100);
  },
  async rawCreateCall(body) { return createDemoCall(body); },
  async rawGetCall(id) { const c = demoCalls.find((x) => x.id === id); return c ? callDetail(c) : null; },
  async rawPatchCall(id, body) {
    const c = demoCalls.find((x) => x.id === id);
    if (!c) return null;
    Object.assign(c, body, { updatedAt: new Date().toISOString() });
    return c;
  },
  async rawDeleteCall(id) {
    const i = demoCalls.findIndex((c) => c.id === id);
    if (i < 0) return null;
    return demoCalls.splice(i, 1)[0];
  },
  async listPhoneNumbers(tenantId) {
    return tenantId ? demoPhoneNumbers.filter((p) => p.tenantId === tenantId) : demoPhoneNumbers;
  },
  async rawListPhoneNumbers(params = {}) { return demoPhoneNumbers.slice(0, Number(params.limit) || 100); },
  async rawCreatePhoneNumber(body) { return createDemoPhoneNumber(body); },
  async rawGetPhoneNumber(id) { return demoPhoneNumbers.find((p) => p.id === id) || null; },
  async rawPatchPhoneNumber(id, body) {
    const p = demoPhoneNumbers.find((x) => x.id === id);
    if (!p) return null;
    Object.assign(p, body, { updatedAt: new Date().toISOString() });
    if (body.metadata) p.metadata = { ...(p.metadata || {}), ...body.metadata };
    return p;
  },
  async rawDeletePhoneNumber(id) {
    const i = demoPhoneNumbers.findIndex((p) => p.id === id);
    if (i < 0) return null;
    return demoPhoneNumbers.splice(i, 1)[0];
  },
  async rawCreateChat(body) {
    const input = typeof body.input === 'string'
      ? body.input
      : Array.isArray(body.input)
        ? body.input.map((m) => m.content || m.message || m.text || '').join(' ')
        : '';
    const assistant = demoAssistants.find((a) => a.id === body.assistantId) || demoAssistants[0];
    return {
      id: nextId('chat'),
      orgId: 'org_afiyet',
      assistantId: assistant?.id,
      input: body.input,
      output: input
        ? `Demo yanıt: "${input}" mesajını aldım.`
        : 'Demo yanıt hazır.',
      messages: [
        ...(input ? [{ role: 'user', content: input }] : []),
        { role: 'assistant', content: input ? `Demo yanıt: "${input}" mesajını aldım.` : 'Demo yanıt hazır.' }
      ],
      createdAt: new Date().toISOString()
    };
  }
};

function buildVapiSource() {
  const vapi = new VapiClient({ apiKey: process.env.VAPI_API_KEY, baseUrl: process.env.VAPI_BASE_URL });
  const cfg = existsSync('./tenants.json') ? JSON.parse(readFileSync('./tenants.json', 'utf8')) : [];
  const asstToTenant = {};
  for (const t of cfg) for (const aid of t.assistantIds || []) asstToTenant[aid] = t.id;

  return {
    async getTenants() { return cfg; },
    async listAssistants(tenantId) {
      const raw = await vapi.listAssistants({ limit: 100 });
      const list = (Array.isArray(raw) ? raw : []).map((v) => mapAssistant(v, asstToTenant[v.id]));
      return tenantId ? list.filter((a) => a.tenantId === tenantId) : list;
    },
    async getAssistant(id) {
      const v = await vapi.getAssistant(id);
      return v ? mapAssistant(v, asstToTenant[id]) : null;
    },
    async patchAssistant(id, config) {
      const v = await vapi.patchAssistant(id, mapConfigToVapi(config));
      return v ? mapAssistant(v, asstToTenant[id]) : null;
    },
    async rawListAssistants(params = {}) { return vapi.listAssistants({ limit: 100, ...params }); },
    async rawCreateAssistant(body) { return vapi.createAssistant(body); },
    async rawGetAssistant(id) { return vapi.getAssistant(id); },
    async rawPatchAssistant(id, body) { return vapi.patchAssistant(id, body); },
    async rawDeleteAssistant(id) { return vapi.deleteAssistant(id); },
    async listCalls(tenantId) {
      if (tenantId) {
        const t = cfg.find((x) => x.id === tenantId);
        const ids = t?.assistantIds || [];
        const batches = await Promise.all(ids.map((aid) => vapi.listCalls({ assistantId: aid, limit: 100 })));
        return batches.flat().map((v) => mapCall(v, tenantId));
      }
      const raw = await vapi.listCalls({ limit: 100 });
      return (Array.isArray(raw) ? raw : []).map((v) => mapCall(v, asstToTenant[v.assistantId]));
    },
    async getCall(id) {
      const v = await vapi.getCall(id);
      return v ? mapCallDetail(v, asstToTenant[v.assistantId]) : null;
    },
    async rawListCalls(params = {}) { return vapi.listCalls({ limit: 100, ...params }); },
    async rawCreateCall(body) { return vapi.createCall(body); },
    async rawGetCall(id) { return vapi.getCall(id); },
    async rawPatchCall(id, body) { return vapi.patchCall(id, body); },
    async rawDeleteCall(id) { return vapi.deleteCall(id); },
    async listPhoneNumbers(tenantId) {
      const raw = await vapi.listPhoneNumbers({ limit: 100 });
      const list = (Array.isArray(raw) ? raw : []).map((p) => ({
        ...p,
        tenantId: asstToTenant[p.assistantId] || p.metadata?.tenantId
      }));
      return tenantId ? list.filter((p) => p.tenantId === tenantId) : list;
    },
    async rawListPhoneNumbers(params = {}) { return vapi.listPhoneNumbers({ limit: 100, ...params }); },
    async rawCreatePhoneNumber(body) { return vapi.createPhoneNumber(body); },
    async rawGetPhoneNumber(id) { return vapi.getPhoneNumber(id); },
    async rawPatchPhoneNumber(id, body) { return vapi.patchPhoneNumber(id, body); },
    async rawDeletePhoneNumber(id) { return vapi.deletePhoneNumber(id); },
    async rawCreateChat(body) { return vapi.createChat(body); }
  };
}

const source = USE_VAPI ? buildVapiSource() : demoSource;

// ================= Redaction + metrics (pure) =================
function toCustomerCall(c) {
  return { id: c.id, assistantId: c.assistantId, type: c.type, startedAt: c.startedAt, durationSec: c.durationSec, answered: c.answered, outcome: c.outcome, orderAmount: c.orderAmount, customerName: c.customerName, summary: c.summary };
}
function toCustomerCallDetail(d) {
  return { ...toCustomerCall(d), transcript: d.transcript, recordingUrl: d.recordingUrl, analysis: d.analysis }; // NO cost
}
function stripInternal(a) { const { tenantId, ...rest } = a; return rest; }

function customerOverview(tenant, tCalls) {
  const answered = tCalls.filter((c) => c.answered);
  const orders = tCalls.filter((c) => c.outcome === 'order');
  const revenue = orders.reduce((s, c) => s + c.orderAmount, 0);
  const minutesUsed = tCalls.reduce((s, c) => s + c.durationSec, 0) / 60;
  const volume = {};
  const outcomes = {};
  const hours = {};
  for (const c of tCalls) if (c.startedAt) volume[c.startedAt.slice(0, 10)] = (volume[c.startedAt.slice(0, 10)] || 0) + 1;
  for (const c of tCalls) {
    outcomes[c.outcome || 'unknown'] = (outcomes[c.outcome || 'unknown'] || 0) + 1;
    if (c.startedAt) {
      const hour = new Date(c.startedAt).getHours();
      if (!Number.isNaN(hour)) hours[`${hour.toString().padStart(2, '0')}:00`] = (hours[`${hour.toString().padStart(2, '0')}:00`] || 0) + 1;
    }
  }
  const missedCalls = tCalls.length - answered.length;
  const avgTicket = orders.length ? revenue / orders.length : 0;
  return {
    tenant: { id: tenant.id, name: tenant.name, phoneNumber: tenant.phoneNumber, plan: tenant.plan?.name },
    revenue, orders: orders.length, reservations: tCalls.filter((c) => c.outcome === 'reservation').length,
    totalCalls: tCalls.length, answerRate: tCalls.length ? answered.length / tCalls.length : 0,
    missedCalls, conversionRate: answered.length ? orders.length / answered.length : 0,
    avgTicket, lostRevenueEstimate: Math.round(missedCalls * avgTicket),
    totalMinutes: Math.round(minutesUsed),
    volumeByDay: Object.entries(volume).map(([day, count]) => ({ day, count })),
    volumeByHour: Object.entries(hours).map(([hour, count]) => ({ hour, count })),
    outcomeBreakdown: Object.entries(outcomes).map(([outcome, count]) => ({ outcome, count })),
    recentOrders: orders
      .slice(0, 5)
      .map((c) => ({ id: c.id, customerName: c.customerName, summary: c.summary, amount: c.orderAmount, startedAt: c.startedAt })),
    usage: { minutesUsed: Math.round(minutesUsed), includedMinutes: tenant.plan?.includedMinutes || 0 }
  };
}

function adminTenants(tenantList, allCalls) {
  return tenantList.map((t) => {
    const tc = allCalls.filter((c) => c.tenantId === t.id);
    const cogs = +tc.reduce((s, c) => s + c.cost, 0).toFixed(4);
    const revenue = t.plan?.monthlyPrice || 0;
    return {
      id: t.id, name: t.name, status: t.status, plan: t.plan,
      revenue, cogs, margin: +(revenue - cogs).toFixed(2),
      marginPct: revenue ? +(((revenue - cogs) / revenue) * 100).toFixed(1) : 0,
      minutesUsed: Math.round(tc.reduce((s, c) => s + c.durationSec, 0) / 60), calls: tc.length
    };
  });
}

function adminOverview(tenantList, allCalls) {
  const rows = adminTenants(tenantList, allCalls);
  const mrr = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCogs = +rows.reduce((s, r) => s + r.cogs, 0).toFixed(4);
  return {
    tenantCount: tenantList.length, activeTenants: tenantList.filter((t) => t.status === 'active').length,
    mrr, totalCogs, grossMargin: +(mrr - totalCogs).toFixed(2),
    grossMarginPct: mrr ? +(((mrr - totalCogs) / mrr) * 100).toFixed(1) : 0,
    systemHealth: { stt: 'up', llm: 'up', tts: 'up', telephony: 'up' }
  };
}

// ================= HTTP =================
function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type, x-tenant-id',
    'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(body));
}
function readBody(req, cb) {
  let data = '';
  req.on('data', (c) => (data += c));
  req.on('end', () => { try { cb(JSON.parse(data || '{}')); } catch { cb({}); } });
}
function readJson(req) {
  return new Promise((resolve) => readBody(req, resolve));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const seg = path.split('/').filter(Boolean);
    const limit = Number.parseInt(url.searchParams.get('limit') || '100', 10);
    const query = Object.fromEntries(url.searchParams.entries());
    if (!query.limit) query.limit = limit;

    if (path === '/health') return send(res, 200, { status: 'ok', service: 'e2e-sis-backend', source: USE_VAPI ? 'vapi' : 'demo' });

    if (path === '/auth/login' && req.method === 'POST') {
      return readBody(req, (body) => {
        const user = USERS.find((u) => u.email === (body.email || '').toLowerCase().trim() && u.password === body.password);
        if (!user) return send(res, 401, { error: 'E-posta veya şifre hatalı' });
        const { password, ...session } = user;
        return send(res, 200, session);
      });
    }

    // -------- Customer scope (COGS stripped) --------
    if (seg[0] === 'customer') {
      const tenantId = req.headers['x-tenant-id'] || url.searchParams.get('tenantId');
      const tenant = (await source.getTenants()).find((t) => t.id === tenantId);
      if (!tenant) return send(res, 400, { error: 'x-tenant-id gerekli / geçersiz tenant' });

      if (seg[1] === 'overview') return send(res, 200, customerOverview(tenant, await source.listCalls(tenant.id)));
      if (seg[1] === 'phone-number') {
        const numbers = source.listPhoneNumbers ? await source.listPhoneNumbers(tenant.id) : [];
        const phone = numbers[0];
        return send(res, 200, {
          number: phone?.number || phone?.sipUri || tenant.phoneNumber,
          status: phone?.status || tenant.status,
          provider: phone?.provider || 'afiyet-telephony',
          assistantId: phone?.assistantId
        });
      }
      if (seg[1] === 'calls') {
        if (!seg[2]) return send(res, 200, (await source.listCalls(tenant.id)).slice(0, limit).map(toCustomerCall));
        const d = await source.getCall(seg[2]);
        if (!d || d.tenantId !== tenant.id) return send(res, 404, { error: 'çağrı bulunamadı' });
        return send(res, 200, toCustomerCallDetail(d));
      }
      if (seg[1] === 'assistant') {
        if (!seg[2]) return send(res, 200, (await source.listAssistants(tenant.id)).map(stripInternal));
        const a = await source.getAssistant(seg[2]);
        if (!a || a.tenantId !== tenant.id) return send(res, 404, { error: 'asistan bulunamadı' });
        if (req.method === 'PATCH' || req.method === 'PUT') {
          return readBody(req, async (body) => {
            const updated = await source.patchAssistant(seg[2], body.config || body);
            return send(res, 200, stripInternal(updated || a));
          });
        }
        return send(res, 200, stripInternal(a));
      }
      return send(res, 404, { error: `no route ${path}` });
    }

    // -------- Admin scope (full economics) --------
    if (seg[0] === 'admin') {
      if (ADMIN_KEY && req.headers.authorization !== `Bearer ${ADMIN_KEY}`) return send(res, 401, { error: 'unauthorized' });
      if (seg[1] === 'overview') return send(res, 200, adminOverview(await source.getTenants(), await source.listCalls()));
      if (seg[1] === 'tenants') return send(res, 200, adminTenants(await source.getTenants(), await source.listCalls()));
      if (seg[1] === 'calls') {
        if (!seg[2]) return send(res, 200, (await source.listCalls()).slice(0, limit));
        const d = await source.getCall(seg[2]);
        return d ? send(res, 200, d) : send(res, 404, { error: 'çağrı bulunamadı' });
      }
      return send(res, 404, { error: `no route ${path}` });
    }

    // -------- Vapi-shaped raw (full) --------
    if (seg[0] === 'assistant') {
      if (!seg[1]) {
        if (req.method === 'GET') return send(res, 200, await source.rawListAssistants(query));
        if (req.method === 'POST') return send(res, 201, await source.rawCreateAssistant(await readJson(req)));
        return send(res, 405, { error: 'method not allowed' });
      }
      if (req.method === 'GET') {
        const a = await source.rawGetAssistant(seg[1]);
        return a ? send(res, 200, a) : send(res, 404, { error: 'not found' });
      }
      if (req.method === 'PATCH' || req.method === 'PUT') {
        const a = await source.rawPatchAssistant(seg[1], await readJson(req));
        return a ? send(res, 200, a) : send(res, 404, { error: 'not found' });
      }
      if (req.method === 'DELETE') {
        const a = await source.rawDeleteAssistant(seg[1]);
        return a ? send(res, 200, a) : send(res, 404, { error: 'not found' });
      }
      return send(res, 405, { error: 'method not allowed' });
    }
    if (seg[0] === 'call') {
      if (!seg[1]) {
        if (req.method === 'GET') return send(res, 200, await source.rawListCalls(query));
        if (req.method === 'POST') return send(res, 201, await source.rawCreateCall(await readJson(req)));
        return send(res, 405, { error: 'method not allowed' });
      }
      if (req.method === 'GET') {
        const d = await source.rawGetCall(seg[1]);
        return d ? send(res, 200, d) : send(res, 404, { error: 'not found' });
      }
      if (req.method === 'PATCH' || req.method === 'PUT') {
        const d = await source.rawPatchCall(seg[1], await readJson(req));
        return d ? send(res, 200, d) : send(res, 404, { error: 'not found' });
      }
      if (req.method === 'DELETE') {
        const d = await source.rawDeleteCall(seg[1]);
        return d ? send(res, 200, d) : send(res, 404, { error: 'not found' });
      }
      return send(res, 405, { error: 'method not allowed' });
    }
    if (seg[0] === 'phone-number') {
      if (!seg[1]) {
        if (req.method === 'GET') return send(res, 200, await source.rawListPhoneNumbers(query));
        if (req.method === 'POST') return send(res, 201, await source.rawCreatePhoneNumber(await readJson(req)));
        return send(res, 405, { error: 'method not allowed' });
      }
      if (req.method === 'GET') {
        const p = await source.rawGetPhoneNumber(seg[1]);
        return p ? send(res, 200, p) : send(res, 404, { error: 'not found' });
      }
      if (req.method === 'PATCH' || req.method === 'PUT') {
        const p = await source.rawPatchPhoneNumber(seg[1], await readJson(req));
        return p ? send(res, 200, p) : send(res, 404, { error: 'not found' });
      }
      if (req.method === 'DELETE') {
        const p = await source.rawDeletePhoneNumber(seg[1]);
        return p ? send(res, 200, p) : send(res, 404, { error: 'not found' });
      }
      return send(res, 405, { error: 'method not allowed' });
    }
    if (seg[0] === 'chat') {
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
      return send(res, 200, await source.rawCreateChat(await readJson(req)));
    }

    return send(res, 404, { error: `no route ${path}` });
  } catch (err) {
    return send(res, 502, { error: `upstream: ${err.message}` });
  }
});

server.listen(PORT, () => {
  console.log(`E2E-SIS backend on http://localhost:${PORT}  (source: ${USE_VAPI ? 'VAPI (live)' : 'demo'})`);
  console.log('  customer /customer/{overview,calls,calls/:id,assistant,assistant/:id,phone-number}  (x-tenant-id)');
  console.log('  admin    /admin/{overview,tenants,calls,calls/:id}');
  console.log('  raw      /assistant[/:id]  /call[/:id]  /phone-number[/:id]  /chat  /health');
  if (DATA_SOURCE === 'vapi' && !USE_VAPI) console.log('  ⚠ DATA_SOURCE=vapi but VAPI_API_KEY missing → using demo');
  if (USE_VAPI && !existsSync('./tenants.json')) console.log('  ⚠ tenants.json missing → customers map to no assistants (see tenants.example.json)');
});
