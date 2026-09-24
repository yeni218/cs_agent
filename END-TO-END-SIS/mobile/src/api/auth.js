import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config.js';
import { getSupabaseClient } from './supabase.js';

// One login, direct to Supabase Auth. The profile's role (+ tenantId) routes the
// whole app to the customer view or the admin cockpit.
export async function login({ email, password, baseUrl } = {}) {
  const supabase = getSupabaseClient({ url: baseUrl || SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: (email || '').toLowerCase().trim(),
    password
  });
  if (authError) throw new Error(authError.message || 'Giriş başarısız');

  const userId = authData.user?.id;
  if (!userId) throw new Error('Kullanıcı bilgisi alınamadı');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, tenant_id')
    .eq('id', userId)
    .single();
  if (profileError) throw new Error(`Profil okunamadı: ${profileError.message}`);

  let name = profile.role === 'admin' ? 'Platform Admin' : 'Restoran';
  if (profile.tenant_id) {
    const { data: tenant } = await supabase.from('tenants').select('name').eq('id', profile.tenant_id).maybeSingle();
    if (tenant?.name) name = tenant.name;
  }

  return {
    token: authData.session?.access_token || '',
    role: profile.role,
    tenantId: profile.tenant_id || null,
    name,
    source: 'supabase',
    supabaseUrl: (baseUrl || SUPABASE_URL).replace(/\/$/, '')
  };
}
