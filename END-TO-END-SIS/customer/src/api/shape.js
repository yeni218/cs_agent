const toNumber = (v) => Number(v || 0);
const toIso = (v) => v || null;

export function mapTenant(row = {}) {
  const plan = row.plan || {};
  return {
    id: row.id,
    name: row.name || 'Restoran',
    phoneNumber: row.phone_number || row.phoneNumber || '',
    status: row.status || 'active',
    plan: {
      name: plan.name || row.planName || 'Plan',
      monthlyPrice: toNumber(plan.monthlyPrice),
      includedMinutes: toNumber(plan.includedMinutes)
    }
  };
}

export function mapAssistant(row = {}) {
  const config = row.config || {};
  const transcriber = row.transcriber || {};
  return {
    id: row.id,
    tenantId: row.tenant_id || row.tenantId,
    name: row.name || 'Asistan',
    firstMessage: row.first_message || row.firstMessage || '',
    model: row.model || {},
    voice: row.voice || {},
    transcriber,
    config: {
      ...config,
      greeting: config.greeting || row.first_message || row.firstMessage || '',
      openHours: config.openHours || '',
      language: config.language || transcriber.language || 'tr'
    },
    createdAt: toIso(row.created_at || row.createdAt),
    updatedAt: toIso(row.updated_at || row.updatedAt)
  };
}

export function mapCustomerCall(row = {}) {
  return {
    id: row.id,
    tenantId: row.tenant_id || row.tenantId,
    assistantId: row.assistant_id || row.assistantId,
    type: row.type || 'inboundPhoneCall',
    status: row.status || 'ended',
    answered: row.answered !== false,
    outcome: row.outcome || inferOutcome(row),
    orderAmount: toNumber(row.order_amount ?? row.orderAmount),
    customerName: row.customer_name || row.customerName || 'Bilinmeyen',
    summary: row.summary || '',
    durationSec: toNumber(row.duration_sec ?? row.durationSec),
    messages: Array.isArray(row.messages) ? row.messages : [],
    transcript: mapTranscript(row.messages),
    analysis: row.analysis || {},
    recordingUrl: row.recording_url || row.recordingUrl || null,
    startedAt: toIso(row.started_at || row.startedAt || row.created_at || row.createdAt),
    endedAt: toIso(row.ended_at || row.endedAt),
    createdAt: toIso(row.created_at || row.createdAt)
  };
}

export function mapAdminCall(row = {}) {
  return {
    ...mapCustomerCall(row),
    cost: toNumber(row.cost),
    costBreakdown: row.cost_breakdown || row.costBreakdown || {}
  };
}

export function mapTranscript(messages = []) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((m) => ({
      role: m.role === 'bot' ? 'assistant' : m.role,
      text: m.text || m.message || m.content || ''
    }))
    .filter((m) => (m.role === 'assistant' || m.role === 'user') && m.text);
}

export function customerOverview(tenantRow, calls = []) {
  const tenant = mapTenant(tenantRow);
  const answered = calls.filter((c) => c.answered);
  const orders = calls.filter((c) => c.outcome === 'order');
  const revenue = orders.reduce((s, c) => s + toNumber(c.orderAmount), 0);
  const minutesUsed = calls.reduce((s, c) => s + toNumber(c.durationSec), 0) / 60;
  const volume = {};
  const outcomes = {};
  const hours = {};

  for (const c of calls) {
    const day = (c.startedAt || c.createdAt || '').slice(0, 10);
    if (day) volume[day] = (volume[day] || 0) + 1;
    const outcome = c.outcome || 'unknown';
    outcomes[outcome] = (outcomes[outcome] || 0) + 1;
    const hour = c.startedAt ? new Date(c.startedAt).getHours() : null;
    if (hour !== null && !Number.isNaN(hour)) {
      const label = `${hour.toString().padStart(2, '0')}:00`;
      hours[label] = (hours[label] || 0) + 1;
    }
  }

  const missedCalls = calls.length - answered.length;
  const avgTicket = orders.length ? revenue / orders.length : 0;

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      phoneNumber: tenant.phoneNumber,
      plan: tenant.plan.name
    },
    revenue,
    orders: orders.length,
    reservations: calls.filter((c) => c.outcome === 'reservation').length,
    totalCalls: calls.length,
    answerRate: calls.length ? answered.length / calls.length : 0,
    missedCalls,
    conversionRate: answered.length ? orders.length / answered.length : 0,
    avgTicket,
    lostRevenueEstimate: Math.round(missedCalls * avgTicket),
    totalMinutes: Math.round(minutesUsed),
    volumeByDay: Object.entries(volume).map(([day, count]) => ({ day, count })),
    volumeByHour: Object.entries(hours).map(([hour, count]) => ({ hour, count })),
    outcomeBreakdown: Object.entries(outcomes).map(([outcome, count]) => ({ outcome, count })),
    recentOrders: orders.slice(0, 5).map((c) => ({
      id: c.id,
      customerName: c.customerName,
      summary: c.summary,
      amount: c.orderAmount,
      startedAt: c.startedAt
    })),
    usage: {
      minutesUsed: Math.round(minutesUsed),
      includedMinutes: tenant.plan.includedMinutes || 0
    }
  };
}

export function adminTenants(tenantRows = [], calls = []) {
  return tenantRows.map((row) => {
    const tenant = mapTenant(row);
    const tenantCalls = calls.filter((c) => c.tenantId === tenant.id);
    const cogs = +tenantCalls.reduce((s, c) => s + toNumber(c.cost), 0).toFixed(4);
    const revenue = tenant.plan.monthlyPrice || 0;
    return {
      id: tenant.id,
      name: tenant.name,
      status: tenant.status,
      plan: tenant.plan,
      revenue,
      cogs,
      margin: +(revenue - cogs).toFixed(2),
      marginPct: revenue ? +(((revenue - cogs) / revenue) * 100).toFixed(1) : 0,
      minutesUsed: Math.round(tenantCalls.reduce((s, c) => s + toNumber(c.durationSec), 0) / 60),
      calls: tenantCalls.length
    };
  });
}

export function adminOverview(tenantRows = [], calls = []) {
  const rows = adminTenants(tenantRows, calls);
  const mrr = rows.reduce((s, r) => s + toNumber(r.revenue), 0);
  const totalCogs = +rows.reduce((s, r) => s + toNumber(r.cogs), 0).toFixed(4);
  return {
    tenantCount: rows.length,
    activeTenants: tenantRows.filter((t) => (t.status || 'active') === 'active').length,
    mrr,
    totalCogs,
    grossMargin: +(mrr - totalCogs).toFixed(2),
    grossMarginPct: mrr ? +(((mrr - totalCogs) / mrr) * 100).toFixed(1) : 0,
    systemHealth: { stt: 'up', llm: 'up', tts: 'up', telephony: 'up' }
  };
}

function inferOutcome(row) {
  const structured = row.analysis?.structuredData || row.analysis?.structured_data || {};
  if (structured.intent) return structured.intent;
  if (toNumber(row.order_amount ?? row.orderAmount) > 0) return 'order';
  return row.answered === false ? 'missed' : 'faq';
}
