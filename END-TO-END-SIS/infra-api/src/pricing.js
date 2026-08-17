// Cost model → fills Vapi's costBreakdown from real usage, so the same admin
// dashboards work unchanged. All rates overridable via env (tune to your real
// Groq + Inworld + telephony contracts).
const n = (v, d) => (v !== undefined && v !== '' ? Number(v) : d);

export const PRICING = {
  sttPerSec: n(process.env.PRICE_STT_PER_SEC, 0.0000111),        // Groq Whisper ≈ $0.04/hr
  llmInPer1k: n(process.env.PRICE_LLM_IN_PER_1K, 0.00059),       // Groq llama-3.3-70b in
  llmOutPer1k: n(process.env.PRICE_LLM_OUT_PER_1K, 0.00079),     // Groq llama-3.3-70b out
  ttsPer1kChars: n(process.env.PRICE_TTS_PER_1K_CHARS, 0.005),   // Inworld TTS (set to your rate)
  transportPerSec: n(process.env.PRICE_TRANSPORT_PER_SEC, 0.0000833), // telephony ≈ $0.005/min
  platformPerCall: n(process.env.PRICE_PLATFORM_PER_CALL, 0.005)      // our platform fee (Vapi's "vapi" line)
};

export function computeCost({ audioSec = 0, promptTokens = 0, completionTokens = 0, ttsChars = 0, durationSec = 0 }) {
  const stt = audioSec * PRICING.sttPerSec;
  const llm = (promptTokens / 1000) * PRICING.llmInPer1k + (completionTokens / 1000) * PRICING.llmOutPer1k;
  const tts = (ttsChars / 1000) * PRICING.ttsPer1kChars;
  const transport = durationSec * PRICING.transportPerSec;
  const vapi = PRICING.platformPerCall;
  const r = (x) => +Number(x).toFixed(6);
  return {
    transport: r(transport), stt: r(stt), llm: r(llm), tts: r(tts), vapi: r(vapi),
    total: r(stt + llm + tts + transport + vapi),
    llmPromptTokens: promptTokens, llmCompletionTokens: completionTokens, ttsCharacters: ttsChars
  };
}
