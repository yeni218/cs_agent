// Heuristic PII redaction for Turkish insurance calls.
//
// Applied to anything written to logs / the audit trail and to text spoken back
// (TTS) — NOT to the live tool arguments, since the agent genuinely needs the
// real TC Kimlik No to authenticate the caller. Raw values stay in memory only
// for the duration of the tool call.
//
// Heuristic by design: a deployment handling regulated data should also enable
// redaction at the STT provider layer. These patterns cover the common cases.

const PATTERNS = [
  // IBAN: TR + 24 digits (optionally spaced in groups).
  { re: /\bTR\d{2}(?:[ ]?\d{4}){5}[ ]?\d{2}\b/gi, replace: () => '[IBAN]' },
  // Payment card: 13-19 digits, often grouped by spaces/dashes. Keep last 4.
  {
    re: /\b(?:\d[ -]?){12,18}\d\b/g,
    replace: (m) => {
      const digits = m.replace(/\D/g, '');
      if (digits.length < 13 || digits.length > 19) return m;
      return `[KART ****${digits.slice(-4)}]`;
    }
  },
  // Turkish phone: +90 / 0 prefix, 10-11 digits with optional spacing.
  { re: /\b(?:\+90[ ]?|0)(?:\d[ ]?){9,10}\d\b/g, replace: () => '[TELEFON]' },
  // TC Kimlik No: exactly 11 digits.
  { re: /\b\d{11}\b/g, replace: () => '[TCKN]' }
];

export function redact(text) {
  if (text == null) return text;
  let out = String(text);
  for (const { re, replace } of PATTERNS) {
    out = out.replace(re, (m) => replace(m));
  }
  return out;
}

// Deep-redact strings inside an object/array (e.g. tool-call arguments) for
// safe logging. Returns a new structure; does not mutate the input.
export function redactDeep(value) {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v);
    return out;
  }
  return value;
}
