import { GroqSttProvider } from './groq-stt.js';
import { WhisperLocalSttProvider } from './whisper-local-stt.js';

// Selects the STT backend, mirroring the TTS/LLM provider-factory pattern.
//
//   STT_PROVIDER=groq            (default; cloud, US — NOT for sovereign use)
//   STT_PROVIDER=whisper-local   (self-hosted faster-whisper in Türkiye)
//
// See docs/self-hosted-architecture.md for the sovereign profile.
export function createSttProvider({ provider = process.env.STT_PROVIDER || 'groq' } = {}) {
  const normalized = provider.trim().toLowerCase();

  if (normalized === 'groq') return new GroqSttProvider();
  if (normalized === 'whisper-local' || normalized === 'local' || normalized === 'whisper') {
    return new WhisperLocalSttProvider();
  }

  throw new Error(`Unsupported STT_PROVIDER "${provider}". Use "groq" or "whisper-local".`);
}
