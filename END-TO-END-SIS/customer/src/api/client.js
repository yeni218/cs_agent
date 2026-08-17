// Session-aware client. The logged-in session decides scope:
//   customer → sends x-tenant-id (server returns cost-stripped data)
//   admin    → sends Bearer token (server returns full economics)
export class ApiClient {
  constructor({ baseUrl = '', session = null, demo = false } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.session = session;
    this.demo = demo;
  }

  headers() {
    const h = { 'content-type': 'application/json' };
    if (this.session?.role === 'customer' && this.session.tenantId) h['x-tenant-id'] = this.session.tenantId;
    if (this.session?.token) h.authorization = `Bearer ${this.session.token}`;
    return h;
  }

  async request(method, path, { params = {}, body } = {}) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const res = await fetch(`${this.baseUrl}${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`${res.status} ${detail}`.slice(0, 200));
    }
    return res.json();
  }

  get(path, params = {}) { return this.request('GET', path, { params }); }
  patch(path, body) { return this.request('PATCH', path, { body }); }
}
