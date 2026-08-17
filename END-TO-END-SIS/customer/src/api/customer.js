// Customer-scope resource calls. Shapes mirror the backend /customer/* endpoints
// — deliberately cost-free. Demo data lets the app run with no backend.
const DEMO_OVERVIEW = {
  tenant: { id: 't_lezzet', name: 'Lezzet Restoran', phoneNumber: '+90 212 111 22 33', plan: 'Pro' },
  revenue: 1035,
  orders: 2,
  reservations: 0,
  totalCalls: 4,
  answerRate: 0.75,
  avgTicket: 517.5,
  volumeByDay: [
    { day: '2026-08-13', count: 3 },
    { day: '2026-08-14', count: 5 },
    { day: '2026-08-15', count: 1 },
    { day: '2026-08-16', count: 1 },
    { day: '2026-08-17', count: 2 }
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
  return client.demo ? DEMO_OVERVIEW : client.get('/customer/overview');
}

export async function listCalls(client) {
  const raw = client.demo ? DEMO_CALLS : await client.get('/customer/calls', { limit: 100 });
  return Array.isArray(raw) ? raw : [];
}

export async function getAssistant(client) {
  if (client.demo) return { ...DEMO_ASSISTANT, config: demoConfig };
  const arr = await client.get('/customer/assistant');
  return Array.isArray(arr) ? arr[0] : arr;
}

export async function updateAssistant(client, id, config) {
  if (client.demo) { demoConfig = { ...demoConfig, ...config }; return { ...DEMO_ASSISTANT, config: demoConfig }; }
  return client.patch(`/customer/assistant/${id}`, { config });
}

export async function getPhoneNumber(client) {
  if (client.demo) return { number: '+90 212 111 22 33', status: 'active', provider: 'afiyet-telephony' };
  return client.get('/customer/phone-number');
}

// Call detail (transcript + order breakdown + recording), cost-free.
export async function getCall(client, id) {
  if (client.demo) return demoDetail(DEMO_CALLS.find((c) => c.id === id));
  return client.get(`/customer/calls/${id}`);
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
