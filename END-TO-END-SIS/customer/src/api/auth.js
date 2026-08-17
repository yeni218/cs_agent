// One login. The returned session's `role` (+ `tenantId` for customers) routes
// the whole app to either the customer view or the admin cockpit.
const DEMO_USERS = [
  { email: 'lezzet@demo.com', password: 'demo', session: { token: 'tok_lezzet', role: 'customer', tenantId: 't_lezzet', name: 'Lezzet Restoran' } },
  { email: 'kebap@demo.com', password: 'demo', session: { token: 'tok_kebap', role: 'customer', tenantId: 't_kebap', name: 'Kebapçı Ali' } },
  { email: 'admin@afiyet.ai', password: 'admin', session: { token: 'tok_admin', role: 'admin', name: 'Platform Admin' } }
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

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: em, password })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Giriş başarısız (${res.status})`);
  }
  return { ...(await res.json()), demo: false, baseUrl };
}
