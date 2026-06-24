// Deterministic, Turkish keyword-based intent classification.
//
// Runs BEFORE the LLM so control-flow decisions (especially the
// compliance-critical "AI must not bind/pay" rule) do not depend on the model
// behaving. The LLM still handles phrasing and tool execution for the
// non-critical paths. A model-based classifier can be layered on later for the
// `unknown` cases without changing call sites.

const INTENT_KEYWORDS = [
  // Order matters: safety/handoff intents are checked first.
  ['binding_payment', [
    'satın al', 'satin al', 'poliçeleştir', 'policelestir', 'poliçe yap', 'police yap',
    'ödeme', 'odeme', 'öde', 'ode ', 'kredi kart', 'kart numara', 'taksit', 'kesinleştir', 'kesinlestir'
  ]],
  ['human', [
    'operatör', 'operator', 'müşteri temsilci', 'musteri temsilci', 'temsilci',
    'insan', 'yetkili', 'birine bağla', 'birine bagla', 'canlı destek', 'canli destek'
  ]],
  ['complaint', [
    'şikayet', 'sikayet', 'hasar', 'kaza', 'memnun değil', 'memnun degil', 'sorun yaşıyorum', 'sorun yasiyorum'
  ]],
  ['existing_quote', [
    'tekliflerim', 'önceki teklif', 'onceki teklif', 'teklifim var', 'mevcut teklif', 'teklif numara'
  ]],
  ['policy_status', [
    'poliçem', 'policem', 'sigortam', 'poliçe durum', 'police durum', 'ne zaman bitiyor',
    'yenileme', 'bitiş tarih', 'bitis tarih', 'geçerli mi', 'gecerli mi'
  ]],
  ['new_quote', [
    'teklif al', 'teklif istiyorum', 'fiyat', 'kasko', 'trafik sigorta', 'trafik sigortası',
    'seyahat sigorta', 'seyahat sağlık', 'seyahat saglik', 'sigorta yaptır', 'sigorta yaptir',
    'yeni teklif', 'kaç para', 'kac para', 'ne kadar'
  ]],
  ['greeting', [
    'merhaba', 'selam', 'iyi günler', 'iyi gunler', 'günaydın', 'gunaydin', 'kolay gelsin'
  ]]
];

const BRANCH_KEYWORDS = [
  ['kasko', ['kasko']],
  ['trafik', ['trafik']],
  ['seyahat', ['seyahat']]
];

export function classifyIntent(text) {
  const clean = normalize(text);
  if (!clean) return { intent: 'unknown', branch: null };

  for (const [intent, keywords] of INTENT_KEYWORDS) {
    if (keywords.some((kw) => clean.includes(kw))) {
      return { intent, branch: detectBranch(clean) };
    }
  }
  return { intent: 'unknown', branch: detectBranch(clean) };
}

export function detectBranch(text) {
  const clean = normalize(text);
  for (const [branch, keywords] of BRANCH_KEYWORDS) {
    if (keywords.some((kw) => clean.includes(kw))) return branch;
  }
  return null;
}

function normalize(text) {
  return String(text || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim();
}
