import { adminOverview, adminTenants, mapAdminCall } from './shape.js';
import { requireData } from './supabase.js';

// Admin-scope reads, direct to Supabase (full economics: cost + margins).

export async function getAdminOverview(client) {
  const [tenants, calls] = await Promise.all([loadTenants(client), listAdminCalls(client)]);
  return adminOverview(tenants, calls);
}

export async function listTenants(client) {
  const [tenants, calls] = await Promise.all([loadTenants(client), listAdminCalls(client)]);
  return adminTenants(tenants, calls);
}

export async function listAdminCalls(client) {
  const rows = await requireData(client.supabase
    .from('calls')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100));
  return (rows || []).map(mapAdminCall);
}

export async function getAdminCall(client, id) {
  const row = await requireData(client.supabase.from('calls').select('*').eq('id', id).single());
  return mapAdminCall(row);
}

async function loadTenants(client) {
  return requireData(client.supabase.from('tenants').select('*').order('created_at', { ascending: true }));
}
