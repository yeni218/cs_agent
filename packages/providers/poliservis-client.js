// Adapter for the PoliServis / PoliCore .NET backend.
// Mirrors the real controller routes (Sms, Kisi, Teklif, Police) and unwraps
// the backend's `{ BasariliMi, Hata, ... }` response envelope.
//
// The voice agent must use a dedicated, tenant-scoped agent token — never a
// full staff user token. Configure via env:
//   POLISERVIS_API_BASE_URL   e.g. https://api.poliservis.local
//   POLISERVIS_AGENT_TOKEN    scoped JWT issued for the voice agent
//   POLISERVIS_ACENTE_ID      tenant (agency) id
//   POLISERVIS_KAYNAK_ID      channel/source id for the voice channel

export class PoliservisClient {
  constructor({
    baseUrl = process.env.POLISERVIS_API_BASE_URL || 'http://localhost:5000',
    token = process.env.POLISERVIS_AGENT_TOKEN,
    acenteId = process.env.POLISERVIS_ACENTE_ID,
    kaynakId = process.env.POLISERVIS_KAYNAK_ID
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = String(token || '').trim();
    this.acenteId = acenteId ? Number(acenteId) : null;
    this.kaynakId = kaynakId ? Number(kaynakId) : null;
  }

  // --- Identity / auth (SMS OTP) ---

  // POST /api/Sms/gonder
  requestOtp({ kimlikNo, telefon }) {
    return this.request('/api/Sms/gonder', {
      method: 'POST',
      body: { KimlikNo: kimlikNo, Telefon: telefon, AcenteId: this.acenteId }
    });
  }

  // POST /api/Sms/dogrula
  verifyOtp({ kimlikNo, kod }) {
    return this.request('/api/Sms/dogrula', {
      method: 'POST',
      body: { KimlikNo: kimlikNo, Kod: kod }
    });
  }

  // --- Customer (Kisi) ---

  // GET /api/Kisi/getir?kimlikNo=
  getCustomer(kimlikNo) {
    return this.request(`/api/Kisi/getir?kimlikNo=${encodeURIComponent(kimlikNo)}`);
  }

  // --- Quotes (Teklif) ---

  // GET /api/Teklif/liste-getir
  listQuotes({ kullaniciId = null, sayfaNo = 1, sayfaBoyutu = 10, aramaMetni = null } = {}) {
    const params = new URLSearchParams();
    if (kullaniciId != null) params.set('kullaniciId', String(kullaniciId));
    if (this.acenteId != null) params.set('acenteId', String(this.acenteId));
    if (this.kaynakId != null) params.set('kaynakId', String(this.kaynakId));
    params.set('sayfaNo', String(sayfaNo));
    params.set('sayfaBoyutu', String(sayfaBoyutu));
    if (aramaMetni) params.set('aramaMetni', aramaMetni);
    return this.request(`/api/Teklif/liste-getir?${params.toString()}`);
  }

  // POST /api/Teklif/kaydet
  saveQuote(teklifIstek) {
    return this.request('/api/Teklif/kaydet', { method: 'POST', body: teklifIstek });
  }

  // GET /api/Teklif/detay-liste-getir?teklifId=  (multi-insurer comparison)
  getQuoteDetails(teklifId) {
    return this.request(`/api/Teklif/detay-liste-getir?teklifId=${encodeURIComponent(teklifId)}`);
  }

  // --- low-level ---

  async request(path, { method = 'GET', body } = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw new Error(extractError(payload) || `PoliServis API failed with ${response.status}`);
    }
    // Backend returns Ok(sonuc) with a BasariliMi flag even on 200.
    if (payload && payload.BasariliMi === false) {
      throw new Error(extractError(payload) || 'PoliServis işlemi başarısız.');
    }
    return payload;
  }
}

function extractError(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;
  return payload.Hata || payload.hata || payload.error || payload.title || null;
}
