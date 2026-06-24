// Deterministic slot requirements for each insurance branch. The orchestrator
// uses this to know what to collect next, instead of trusting the LLM to track
// it. Slot keys are stable; prompts/questions are Turkish-facing.

export const QUOTE_SLOTS = {
  kasko: [
    { key: 'kimlikNo', soru: 'TC Kimlik Numaranızı alabilir miyim?' },
    { key: 'plaka', soru: 'Aracınızın plakasını söyler misiniz?' }
  ],
  trafik: [
    { key: 'kimlikNo', soru: 'TC Kimlik Numaranızı alabilir miyim?' },
    { key: 'plaka', soru: 'Aracınızın plakasını söyler misiniz?' }
  ],
  seyahat: [
    { key: 'kimlikNo', soru: 'TC Kimlik Numaranızı alabilir miyim?' },
    { key: 'destinasyon', soru: 'Hangi ülkeye / bölgeye seyahat edeceksiniz?' },
    { key: 'baslangicTarihi', soru: 'Seyahat başlangıç tarihiniz nedir?' },
    { key: 'bitisTarihi', soru: 'Seyahat bitiş tarihiniz nedir?' }
  ]
};

export function requiredSlots(branch) {
  return QUOTE_SLOTS[branch] || [];
}

// Returns the first unfilled slot for the branch, or null if all are present.
export function nextMissingSlot(branch, collected = {}) {
  for (const slot of requiredSlots(branch)) {
    const value = collected[slot.key];
    if (value === undefined || value === null || String(value).trim() === '') {
      return slot;
    }
  }
  return null;
}

export function isQuoteReady(branch, collected = {}) {
  return requiredSlots(branch).length > 0 && nextMissingSlot(branch, collected) === null;
}
