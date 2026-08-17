// Cost model -> fills Vapi-style costBreakdown from measured usage. All rates
// are env-overridable so production numbers can be reconciled against invoices.
const n = (v, d) => (v !== undefined && v !== '' ? Number(v) : d);
const r = (x) => +Number(x || 0).toFixed(6);

function verimorPerSecond() {
  const usdTry = n(process.env.USD_TRY, 47.52);
  const minutes = n(process.env.VERIMOR_PACKAGE_MINUTES, 10000);
  const priceTry = n(process.env.VERIMOR_PACKAGE_PRICE_TRY, 2999);
  return priceTry / minutes / usdTry / 60;
}

function verimorOveragePerSecond() {
  const usdTry = n(process.env.USD_TRY, 47.52);
  return n(process.env.VERIMOR_OVERAGE_TRY_PER_MIN, 0.99) / usdTry / 60;
}

export const PRICING = {
  // Groq Whisper Large v3 Turbo: $0.04/hr.
  sttPerSec: n(process.env.PRICE_STT_PER_SEC, 0.04 / 3600),
  // Cheap realtime route: Groq llama-3.1-8b-instant.
  llmInPer1k: n(process.env.PRICE_LLM_IN_PER_1K, 0.00005),
  llmOutPer1k: n(process.env.PRICE_LLM_OUT_PER_1K, 0.00008),
  // Inworld Realtime TTS 1.5 Mini on Builder: $9 / 1M chars.
  ttsPer1kChars: n(process.env.PRICE_TTS_PER_1K_CHARS, 0.009),
  // Defaults to Verimor 10k package math unless explicitly overridden.
  transportPerSec: n(process.env.PRICE_TRANSPORT_PER_SEC, verimorPerSecond()),
  transportOveragePerSec: n(process.env.PRICE_TRANSPORT_OVERAGE_PER_SEC, verimorOveragePerSecond()),
  transportBillingIncrementSec: n(process.env.VERIMOR_BILLING_INCREMENT_SEC, 6),
  mediaPerSec: n(process.env.PRICE_MEDIA_PER_SEC, 0),
  platformPerCall: n(process.env.PRICE_PLATFORM_PER_CALL, 0.005),
  platformPerSec: n(process.env.PRICE_PLATFORM_PER_SEC, 0),
  targetPerMin: n(process.env.PRICE_TARGET_PER_MIN, 0.02)
};

export function billableSeconds(durationSec = 0, incrementSec = PRICING.transportBillingIncrementSec) {
  const d = Math.max(0, Number(durationSec) || 0);
  const inc = Math.max(1, Number(incrementSec) || 1);
  return Math.ceil(d / inc) * inc;
}

export function computeCost({
  audioSec = 0,
  promptTokens = 0,
  completionTokens = 0,
  ttsChars = 0,
  durationSec = 0,
  providerUsage = {},
  pricing = PRICING
} = {}) {
  const billedTransportSec = billableSeconds(durationSec, pricing.transportBillingIncrementSec);
  const stt = providerUsage.sttUsd ?? audioSec * pricing.sttPerSec;
  const llm = providerUsage.llmUsd ?? (promptTokens / 1000) * pricing.llmInPer1k + (completionTokens / 1000) * pricing.llmOutPer1k;
  const tts = providerUsage.ttsUsd ?? (ttsChars / 1000) * pricing.ttsPer1kChars;
  const transport = providerUsage.transportUsd ?? billedTransportSec * pricing.transportPerSec;
  const media = providerUsage.mediaUsd ?? durationSec * pricing.mediaPerSec;
  const platform = providerUsage.platformUsd ?? pricing.platformPerCall + durationSec * pricing.platformPerSec;
  const total = stt + llm + tts + transport + media + platform;
  const perMinute = durationSec > 0 ? total / (durationSec / 60) : total;

  return {
    transport: r(transport),
    stt: r(stt),
    llm: r(llm),
    tts: r(tts),
    media: r(media),
    platform: r(platform),
    // Keep the Vapi-shaped key for existing dashboards that expect it.
    vapi: r(platform),
    total: r(total),
    perMinute: r(perMinute),
    targetPerMinute: r(pricing.targetPerMin),
    targetStatus: perMinute <= pricing.targetPerMin ? 'ok' : 'over_target',
    durationSeconds: r(durationSec),
    billableTransportSeconds: r(billedTransportSec),
    audioSeconds: r(audioSec),
    llmPromptTokens: promptTokens,
    llmCompletionTokens: completionTokens,
    ttsCharacters: ttsChars
  };
}

export function estimateCostPerMinute({
  promptTokens = 800,
  completionTokens = 150,
  ttsChars = 400,
  audioSec = 60,
  durationSec = 60,
  averageCallSec = 120,
  pricing = PRICING
} = {}) {
  return computeCost({
    promptTokens,
    completionTokens,
    ttsChars,
    audioSec,
    durationSec,
    pricing: {
      ...pricing,
      platformPerCall: pricing.platformPerCall * (durationSec / averageCallSec)
    }
  });
}
