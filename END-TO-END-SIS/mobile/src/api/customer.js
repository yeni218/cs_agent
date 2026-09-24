import { customerOverview, mapAssistant, mapCustomerCall, mapTenant } from './shape.js';
import { requireData } from './supabase.js';

// Customer-scope reads, direct to Supabase. Cost-free by construction: these hit
// the `customer_calls` view (no cost columns) and RLS scopes rows to the tenant.

export async function getOverview(client) {
  const [tenant, calls] = await Promise.all([getTenant(client), listCalls(client)]);
  return customerOverview(tenant, calls);
}

export async function listCalls(client) {
  const rows = await requireData(client.supabase
    .from('customer_calls')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(100));
  return (rows || []).map(mapCustomerCall);
}

export async function getCall(client, id) {
  const row = await requireData(client.supabase.from('customer_calls').select('*').eq('id', id).single());
  return mapCustomerCall(row);
}

export async function getAssistant(client) {
  const rows = await requireData(client.supabase
    .from('assistants')
    .select('*')
    .eq('tenant_id', client.session?.tenantId)
    .order('created_at', { ascending: true })
    .limit(1));
  return rows?.[0] ? mapAssistant(rows[0]) : null;
}

export async function updateAssistant(client, id, config) {
  const current = await getAssistant(client);
  const nextConfig = { ...(current?.config || {}), ...config };
  const patch = { config: nextConfig, updated_at: new Date().toISOString() };
  if (config.greeting !== undefined) patch.first_message = config.greeting;
  const row = await requireData(client.supabase.from('assistants').update(patch).eq('id', id).select('*').single());
  return mapAssistant(row);
}

export async function getPhoneNumber(client) {
  const rows = await requireData(client.supabase
    .from('phone_numbers')
    .select('*')
    .eq('tenant_id', client.session?.tenantId)
    .limit(1));
  if (rows?.[0]) return { number: rows[0].number, status: rows[0].status, provider: rows[0].provider };
  const tenant = mapTenant(await getTenant(client));
  return { number: tenant.phoneNumber, status: tenant.status, provider: 'afiyet-telephony' };
}

export async function runCall(client, assistantId, input) {
  const { data, error } = await client.supabase.functions.invoke('call', { body: { assistantId, input } });
  if (error) throw new Error(error.message);
  return mapCustomerCall(data);
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
