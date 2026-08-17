import { customerOverview, mapAssistant, mapCustomerCall, mapTenant } from './shape.js';
import { requireData } from './supabase.js';

// Customer-scope resource calls. Shapes mirror the backend /customer/* endpoints
// — deliberately cost-free. Demo data lets the app run with no backend.
const DEMO_OVERVIEW = {
  tenant: { id: 't_lezzet', name: 'Lezzet Restoran', phoneNumber: '+90 212 111 22 33', plan: 'Pro' },
  revenue: 1035,
  orders: 2,
  reservations: 0,
  totalCalls: 4,
  answerRate: 0.75,
  missedCalls: 1,
  conversionRate: 0.67,
  avgTicket: 517.5,
  lostRevenueEstimate: 518,
  totalMinutes: 9,
  volumeByDay: [
    { day: '2026-08-13', count: 3 },
    { day: '2026-08-14', count: 5 },
    { day: '2026-08-15', count: 1 },
    { day: '2026-08-16', count: 1 },
    { day: '2026-08-17', count: 2 }
  ],
  volumeByHour: [
    { hour: '12:00', count: 2 },
    { hour: '18:00', count: 4 },
    { hour: '19:00', count: 5 },
    { hour: '20:00', count: 2 }
  ],
  outcomeBreakdown: [
    { outcome: 'order', count: 2 },
    { outcome: 'faq', count: 1 },
    { outcome: 'missed', count: 1 }
  ],
  recentOrders: [
    { id: 'call_1001', customerName: 'Ahmet Y.', summary: 'Karışık pizza + ayran siparişi', amount: 420, startedAt: new Date(Date.now() - 36e5).toISOString() },
    { id: 'call_1003', customerName: 'Zeynep K.', summary: 'İki kişilik menü + tatlı', amount: 615, startedAt: new Date(Date.now() - 27 * 36e5).toISOString() }
  ],
  usage: { minutesUsed: 9, includedMinutes: 1000 }
};

const DEMO_CALLS = [
  { id: 'call_1001', type: 'inboundPhoneCall', startedAt: new Date(Date.now() - 36e5).toISOString(), durationSec: 192, answered: true, outcome: 'order', orderAmount: 420, customerName: 'Ahmet Y.', summary: 'Karışık pizza + ayran siparişi' },
  { id: 'call_1002', type: 'inboundPhoneCall', startedAt: new Date(Date.now() - 5 * 36e5).toISOString(), durationSec: 66, answered: true, outcome: 'faq', orderAmount: 0, customerName: 'Bilinmeyen', summary: 'Çalışma saatleri soruldu' },
  { id: 'call_1003', type: 'inboundPhoneCall', startedAt: new Date(Date.now() - 27 * 36e5).toISOString(), durationSec: 264, answered: true, outcome: 'order', orderAmount: 615, customerName: 'Zeynep K.', summary: 'İki kişilik menü + tatlı' },
  { id: 'call_1004', type: 'inboundPhoneCall', startedAt: new Date(Date.now() - 50 * 36e5).toISOString(), durationSec: 24, answered: false, outcome: 'missed', orderAmount: 0, customerName: 'Bilinmeyen', summary: 'Arayan bağlanmadan kapattı' }
];

const DEMO_ASSISTANT = {
  id: 'asst_lezzet',
  name: 'Lezzet Sipariş Asistanı',
  model: { model: 'qwen2.5:3b-instruct' },
  voice: { voiceId: 'tr_TR-dfki-medium' },
  transcriber: { language: 'tr' }
};

export async function getOverview(client) {
  if (client.demo) return DEMO_OVERVIEW;
  if (client.source === 'supabase') {
    const [tenant, calls] = await Promise.all([getTenant(client), listCalls(client)]);
    return customerOverview(tenant, calls);
  }
  return client.get('/customer/overview');
}

export async function listCalls(client) {
  if (client.source === 'supabase') {
    const rows = await requireData(client.supabase
      .from('customer_calls')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(100));
    return (rows || []).map(mapCustomerCall);
  }
  const raw = client.demo ? DEMO_CALLS : await client.get('/customer/calls', { limit: 100 });
  return Array.isArray(raw) ? raw : [];
}

export async function getAssistant(client) {
  if (client.demo) return { ...DEMO_ASSISTANT, config: demoConfig };
  if (client.source === 'supabase') {
    const rows = await requireData(client.supabase
      .from('assistants')
      .select('*')
      .eq('tenant_id', client.session?.tenantId)
      .order('created_at', { ascending: true })
      .limit(1));
    return rows?.[0] ? mapAssistant(rows[0]) : null;
  }
  const arr = await client.get('/customer/assistant');
  return Array.isArray(arr) ? arr[0] : arr;
}

export async function updateAssistant(client, id, config) {
  if (client.demo) { demoConfig = { ...demoConfig, ...config }; return { ...DEMO_ASSISTANT, config: demoConfig }; }
  if (client.source === 'supabase') {
    const current = await getAssistant(client);
    const nextConfig = { ...(current?.config || {}), ...config };
    const patch = { config: nextConfig, updated_at: new Date().toISOString() };
    if (config.greeting !== undefined) patch.first_message = config.greeting;
    const row = await requireData(client.supabase
      .from('assistants')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single());
    return mapAssistant(row);
  }
  return client.patch(`/customer/assistant/${id}`, { config });
}

export async function getPhoneNumber(client) {
  if (client.demo) return { number: '+90 212 111 22 33', status: 'active', provider: 'afiyet-telephony' };
  if (client.source === 'supabase') {
    const rows = await requireData(client.supabase
      .from('phone_numbers')
      .select('*')
      .eq('tenant_id', client.session?.tenantId)
      .limit(1));
    if (rows?.[0]) return { number: rows[0].number, status: rows[0].status, provider: rows[0].provider };
    const tenant = mapTenant(await getTenant(client));
    return { number: tenant.phoneNumber, status: tenant.status, provider: 'afiyet-telephony' };
  }
  return client.get('/customer/phone-number');
}

// Call detail (transcript + order breakdown + recording), cost-free.
export async function getCall(client, id) {
  if (client.demo) return demoDetail(DEMO_CALLS.find((c) => c.id === id));
  if (client.source === 'supabase') {
    const row = await requireData(client.supabase
      .from('customer_calls')
      .select('*')
      .eq('id', id)
      .single());
    return mapCustomerCall(row);
  }
  return client.get(`/customer/calls/${id}`);
}

export async function runCall(client, assistantId, input) {
  if (client.demo) return demoDetail({ ...DEMO_CALLS[0], id: `demo_${Date.now()}`, summary: input, startedAt: new Date().toISOString() });
  if (client.source === 'supabase') {
    const { data, error } = await client.supabase.functions.invoke('call', { body: { assistantId, input } });
    if (error) throw new Error(error.message);
    return mapCustomerCall(data);
  }
  throw new Error('Canlı çağrı testi yalnızca Supabase modunda desteklenir.');
}

let demoConfig = { greeting: 'Lezzet Restoran, hoş geldiniz. Nasıl yardımcı olabilirim?', openHours: '11:00 - 23:00', language: 'tr' };

function demoDetail(c) {
  if (!c) return null;
  const items = (c.summary || '').split(/[+,]/).map((s) => s.trim()).filter(Boolean);
  const t = [{ role: 'assistant', text: 'Hoş geldiniz, nasıl yardımcı olabilirim?' }];
  if (c.outcome === 'order') {
    t.push({ role: 'user', text: `${items.join(', ')} istiyorum.` });
    t.push({ role: 'assistant', text: `Tabii, toplam ${c.orderAmount} lira. Onaylıyor musunuz?` });
    t.push({ role: 'user', text: 'Evet.' });
    t.push({ role: 'assistant', text: 'Siparişiniz alındı, afiyet olsun!' });
  } else {
    t.push({ role: 'user', text: c.summary });
    t.push({ role: 'assistant', text: 'Teşekkürler.' });
  }
  return {
    ...c,
    transcript: t,
    recordingUrl: `https://recordings.afiyet.local/${c.id}.wav`,
    analysis: {
      summary: c.summary,
      structuredData: c.outcome === 'order' ? { intent: 'order', items, total: c.orderAmount, currency: 'TRY' } : { intent: c.outcome },
      successEvaluation: c.answered ? 'success' : 'failed'
    }
  };
}

async function getTenant(client) {
  const tenantId = client.session?.tenantId;
  const query = client.supabase.from('tenants').select('*');
  const row = tenantId
    ? await requireData(query.eq('id', tenantId).single())
    : (await requireData(query.limit(1)))?.[0];
  if (!row) throw new Error('Tenant bulunamadı');
  return row;
}
