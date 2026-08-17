import { DEFAULT_LIVE_SOURCE, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config.js';
import { getSupabaseClient, hasSupabaseConfig } from './supabase.js';

// One login. The returned session's `role` (+ `tenantId` for customers) routes
// the whole app to either the customer view or the admin cockpit.
const DEMO_USERS = [
  { email: 'lezzet@demo.com', password: 'demo', session: { token: 'tok_lezzet', role: 'customer', tenantId: 't_lezzet', name: 'Lezzet Restoran', source: 'demo' } },
  { email: 'kebap@demo.com', password: 'demo', session: { token: 'tok_kebap', role: 'customer', tenantId: 't_kebap', name: 'Kebapçı Ali', source: 'demo' } },
  { email: 'admin@afiyet.ai', password: 'admin', session: { token: 'tok_admin', role: 'admin', name: 'Platform Admin', source: 'demo' } }
];

export const DEMO_HINTS = [
  { label: 'Demo: Restoran (müşteri)', email: 'lezzet@demo.com', password: 'demo' },
  { label: 'Demo: Yönetici (biz)', email: 'admin@afiyet.ai', password: 'admin' }
];

export async function login({ baseUrl, email, password, demo }) {
  const em = (email || '').toLowerCase().trim();

  if (demo) {
    const u = DEMO_USERS.find((x) => x.email === em && x.password === password);
    if (!u) throw new Error('E-posta veya şifre hatalı');
    return { ...u.session, demo: true, baseUrl: '' };
  }

  const explicitSupabaseUrl = SUPABASE_URL && (baseUrl || '').replace(/\/$/, '') === SUPABASE_URL.replace(/\/$/, '');
  if (DEFAULT_LIVE_SOURCE === 'supabase' || (explicitSupabaseUrl && hasSupabaseConfig({ url: baseUrl }))) {
    return loginWithSupabase({ supabaseUrl: baseUrl, email: em, password });
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: em, password })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Giriş başarısız (${res.status})`);
  }
  return { ...(await res.json()), source: 'backend', demo: false, baseUrl };
}

async function loginWithSupabase({ supabaseUrl, email, password }) {
  const supabase = getSupabaseClient({ url: supabaseUrl, anonKey: SUPABASE_ANON_KEY });
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) throw new Error(authError.message || 'Supabase girişi başarısız');

  const userId = authData.user?.id;
  if (!userId) throw new Error('Supabase kullanıcı bilgisi alınamadı');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, tenant_id')
    .eq('id', userId)
    .single();
  if (profileError) throw new Error(`Profil okunamadı: ${profileError.message}`);

  let name = profile.role === 'admin' ? 'Platform Admin' : 'Restoran';
  if (profile.tenant_id) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', profile.tenant_id)
      .maybeSingle();
    if (tenant?.name) name = tenant.name;
  }

  return {
    token: authData.session?.access_token || '',
    role: profile.role,
    tenantId: profile.tenant_id || null,
    name,
    source: 'supabase',
    demo: false,
    baseUrl: '',
    supabaseUrl: supabaseUrl.replace(/\/$/, '')
  };
}
