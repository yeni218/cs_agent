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
for (const a of demoAssistants) a.config = { greeting: `${a.name}, hoş geldiniz. Nasıl yardımcı olabilirim?`, openHours: '11:00 - 23:00', language: 'tr' };

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

// ================= Data sources (uniform async interface) =================
const demoSource = {
  async getTenants() { return demoTenants; },
  async listAssistants(tenantId) { return tenantId ? demoAssistants.filter((a) => a.tenantId === tenantId) : demoAssistants; },
  async getAssistant(id) { return demoAssistants.find((a) => a.id === id) || null; },
  async patchAssistant(id, config) {
    const a = demoAssistants.find((x) => x.id === id);
    if (!a) return null;
    a.config = { ...a.config, ...config };
    a.updatedAt = new Date().toISOString();
    return a;
  },
  async listCalls(tenantId) { return tenantId ? demoCalls.filter((c) => c.tenantId === tenantId) : demoCalls; },
  async getCall(id) { const c = demoCalls.find((x) => x.id === id); return c ? { ...c, ...detailFor(c) } : null; }
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
    }
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
  for (const c of tCalls) if (c.startedAt) volume[c.startedAt.slice(0, 10)] = (volume[c.startedAt.slice(0, 10)] || 0) + 1;
  return {
    tenant: { id: tenant.id, name: tenant.name, phoneNumber: tenant.phoneNumber, plan: tenant.plan?.name },
    revenue, orders: orders.length, reservations: tCalls.filter((c) => c.outcome === 'reservation').length,
    totalCalls: tCalls.length, answerRate: tCalls.length ? answered.length / tCalls.length : 0,
    avgTicket: orders.length ? revenue / orders.length : 0,
    volumeByDay: Object.entries(volume).map(([day, count]) => ({ day, count })),
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
    'access-control-allow-methods': 'GET, POST, PATCH, PUT, OPTIONS'
  });
  res.end(JSON.stringify(body));
}
function readBody(req, cb) {
  let data = '';
  req.on('data', (c) => (data += c));
  req.on('end', () => { try { cb(JSON.parse(data || '{}')); } catch { cb({}); } });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const seg = path.split('/').filter(Boolean);
    const limit = Number.parseInt(url.searchParams.get('limit') || '100', 10);

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
      if (seg[1] === 'phone-number') return send(res, 200, { number: tenant.phoneNumber, status: tenant.status, provider: 'afiyet-telephony' });
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
      if (!seg[1]) return send(res, 200, (await source.listAssistants()).map(stripInternal));
      const a = await source.getAssistant(seg[1]);
      return a ? send(res, 200, stripInternal(a)) : send(res, 404, { error: 'not found' });
    }
    if (seg[0] === 'call') {
      if (!seg[1]) return send(res, 200, await source.listCalls());
      const d = await source.getCall(seg[1]);
      return d ? send(res, 200, d) : send(res, 404, { error: 'not found' });
    }
    if (seg[0] === 'phone-number') return send(res, 200, (await source.getTenants()).map((t) => ({ id: t.id, number: t.phoneNumber, status: t.status })));

    return send(res, 404, { error: `no route ${path}` });
  } catch (err) {
    return send(res, 502, { error: `upstream: ${err.message}` });
  }
});

server.listen(PORT, () => {
  console.log(`E2E-SIS backend on http://localhost:${PORT}  (source: ${USE_VAPI ? 'VAPI (live)' : 'demo'})`);
  console.log('  customer /customer/{overview,calls,calls/:id,assistant,assistant/:id,phone-number}  (x-tenant-id)');
  console.log('  admin    /admin/{overview,tenants,calls,calls/:id}');
  console.log('  raw      /assistant[/:id]  /call[/:id]  /phone-number  /health');
  if (DATA_SOURCE === 'vapi' && !USE_VAPI) console.log('  ⚠ DATA_SOURCE=vapi but VAPI_API_KEY missing → using demo');
  if (USE_VAPI && !existsSync('./tenants.json')) console.log('  ⚠ tenants.json missing → customers map to no assistants (see tenants.example.json)');
});
