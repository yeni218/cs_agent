// The swappable API seam. Every screen talks to an ApiClient; changing baseUrl
// (Vapi ↔ our sovereign backend) is the ONLY thing that changes. Both expose the
// same Vapi-shaped REST surface, so the app code is provider-agnostic.
export class ApiClient {
  constructor({ baseUrl = '', apiKey = '', demo = false } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.demo = demo;
  }

  async get(path, params = {}) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const url = `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;

    const headers = { 'content-type': 'application/json' };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`${res.status} ${detail}`.slice(0, 200));
    }
    return res.json();
  }
}
