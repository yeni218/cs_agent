// Admin-scope resource calls (full economics). Demo data mirrors /admin/*.
const DEMO_OVERVIEW = {
  tenantCount: 3, activeTenants: 2, mrr: 448, totalCogs: 0.366,
  grossMargin: 447.63, grossMarginPct: 99.9,
  systemHealth: { stt: 'up', llm: 'up', tts: 'up', telephony: 'up' }
};

const DEMO_TENANTS = [
  { id: 't_lezzet', name: 'Lezzet Restoran', status: 'active', plan: { name: 'Pro', monthlyPrice: 299 }, revenue: 299, cogs: 0.172, margin: 298.83, marginPct: 99.9, minutesUsed: 9, calls: 4 },
  { id: 't_kebap', name: 'Kebapçı Ali', status: 'active', plan: { name: 'Başlangıç', monthlyPrice: 149 }, revenue: 149, cogs: 0.172, margin: 148.83, marginPct: 99.9, minutesUsed: 10, calls: 3 },
  { id: 't_pizza', name: 'Pizza Napoli', status: 'trial', plan: { name: 'Deneme', monthlyPrice: 0 }, revenue: 0, cogs: 0.022, margin: -0.02, marginPct: 0, minutesUsed: 1, calls: 1 }
];

const DEMO_CALLS = [
  { id: 'call_1001', tenantId: 't_lezzet', durationSec: 192, cost: 0.056, costBreakdown: { stt: 0.006, llm: 0.011, tts: 0.008, transport: 0.021, platform: 0.01 } },
  { id: 'call_1005', tenantId: 't_kebap', durationSec: 156, cost: 0.047, costBreakdown: { stt: 0.005, llm: 0.009, tts: 0.006, transport: 0.017, platform: 0.01 } },
  { id: 'call_1006', tenantId: 't_kebap', durationSec: 306, cost: 0.086, costBreakdown: { stt: 0.010, llm: 0.019, tts: 0.013, transport: 0.034, platform: 0.01 } },
  { id: 'call_1008', tenantId: 't_pizza', durationSec: 84, cost: 0.022, costBreakdown: { stt: 0.003, llm: 0.005, tts: 0.004, transport: 0.0, platform: 0.01 } }
];

export async function getAdminOverview(client) {
  return client.demo ? DEMO_OVERVIEW : client.get('/admin/overview');
}
export async function listTenants(client) {
  return client.demo ? DEMO_TENANTS : client.get('/admin/tenants');
}
export async function listAdminCalls(client) {
  const raw = client.demo ? DEMO_CALLS : await client.get('/admin/calls', { limit: 100 });
  return Array.isArray(raw) ? raw : [];
}

export async function getAdminCall(client, id) {
  if (client.demo) {
    const c = DEMO_CALLS.find((x) => x.id === id) || DEMO_CALLS[0];
    return {
      ...c,
      transcript: [
        { role: 'assistant', text: 'Hoş geldiniz, nasıl yardımcı olabilirim?' },
        { role: 'user', text: 'Sipariş vermek istiyorum.' },
        { role: 'assistant', text: 'Tabii, siparişinizi alıyorum.' }
      ],
      recordingUrl: `https://recordings.afiyet.local/${c.id}.wav`,
      analysis: { summary: 'Sipariş alındı', structuredData: { intent: 'order' }, successEvaluation: 'success' }
    };
  }
  return client.get(`/admin/calls/${id}`);
}
