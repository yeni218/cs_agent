// In-memory mock of PoliservisClient for local testing without the .NET backend.
// Same method surface as packages/providers/poliservis-client.js so swapping in
// the real client later is a one-line change. Data is illustrative only.

const CUSTOMERS = {
  '11111111111': {
    BasariliMi: true,
    KimlikNo: '11111111111',
    Ad: 'Ahmet',
    Soyad: 'Yılmaz',
    Telefon: '0532 000 00 00'
  },
  '22222222222': {
    BasariliMi: true,
    KimlikNo: '22222222222',
    Ad: 'Ayşe',
    Soyad: 'Demir',
    Telefon: '0533 111 11 11'
  }
};

const QUOTES = {
  '11111111111': [
    { TeklifId: 1001, Brans: 'kasko', Plaka: '34 ABC 123', Tarih: '2026-06-20', Ozet: 'Tahmini en düşük 11.800 TL' },
    { TeklifId: 1002, Brans: 'trafik', Plaka: '34 ABC 123', Tarih: '2026-06-20', Ozet: 'Tahmini en düşük 3.950 TL' }
  ],
  '22222222222': [
    { TeklifId: 2001, Brans: 'seyahat', Plaka: null, Tarih: '2026-06-18', Ozet: 'Schengen, 30 gün, en düşük 750 TL' }
  ]
};

const QUOTE_DETAILS = {
  1001: {
    BasariliMi: true,
    TeklifId: 1001,
    Brans: 'kasko',
    Sirketler: [
      { Sirket: 'Sompo', BrutPrim: 11800, ParaBirimi: 'TL' },
      { Sirket: 'Anadolu', BrutPrim: 12500, ParaBirimi: 'TL' },
      { Sirket: 'Mapfre', BrutPrim: 13200, ParaBirimi: 'TL' }
    ]
  },
  1002: {
    BasariliMi: true,
    TeklifId: 1002,
    Brans: 'trafik',
    Sirketler: [
      { Sirket: 'Ray', BrutPrim: 3950, ParaBirimi: 'TL' },
      { Sirket: 'Ak', BrutPrim: 4200, ParaBirimi: 'TL' }
    ]
  },
  2001: {
    BasariliMi: true,
    TeklifId: 2001,
    Brans: 'seyahat',
    Sirketler: [
      { Sirket: 'Türkiye Katılım', BrutPrim: 750, ParaBirimi: 'TL' },
      { Sirket: 'Zurich', BrutPrim: 910, ParaBirimi: 'TL' }
    ]
  }
};

export class MockPoliservisClient {
  constructor({ logger = null } = {}) {
    this.logger = logger;
    this.pendingOtp = new Map();
  }

  async requestOtp({ kimlikNo, telefon }) {
    const code = '123456';
    this.pendingOtp.set(kimlikNo, code);
    this.logger?.info?.({ kimlikNo, telefon, code }, '[mock] OTP issued (use 123456)');
    return { BasariliMi: true, Mesaj: 'Doğrulama kodu gönderildi.' };
  }

  async verifyOtp({ kimlikNo, kod }) {
    // Accept the issued code, or any 4-6 digit code for easy local testing.
    const expected = this.pendingOtp.get(kimlikNo);
    const ok = (expected && kod === expected) || /^\d{4,6}$/.test(String(kod || ''));
    if (!ok) throw new Error('Doğrulama kodu hatalı.');
    this.pendingOtp.delete(kimlikNo);
    return { BasariliMi: true, Mesaj: 'Kimlik doğrulandı.' };
  }

  async getCustomer(kimlikNo) {
    const customer = CUSTOMERS[kimlikNo];
    if (!customer) throw new Error('Müşteri kaydı bulunamadı.');
    return customer;
  }

  async listQuotes({ kimlikNo = null, aramaMetni = null } = {}) {
    // In mock mode we resolve quotes by the most recently verified customer.
    const all = kimlikNo ? QUOTES[kimlikNo] || [] : Object.values(QUOTES).flat();
    const filtered = aramaMetni
      ? all.filter((q) => `${q.Plaka || ''} ${q.Brans}`.toLowerCase().includes(aramaMetni.toLowerCase()))
      : all;
    return { BasariliMi: true, Teklifler: filtered };
  }

  async saveQuote(teklifIstek) {
    const teklifId = Math.floor(3000 + Math.random() * 1000);
    return { BasariliMi: true, TeklifId: teklifId, Mesaj: 'Teklif oluşturuldu.', Istek: teklifIstek };
  }

  async getQuoteDetails(teklifId) {
    const details = QUOTE_DETAILS[teklifId];
    if (!details) throw new Error('Teklif detayı bulunamadı.');
    return details;
  }
}
