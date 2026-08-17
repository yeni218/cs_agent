import { ElevenLabsTtsProvider } from './elevenlabs-tts.js';
import { GoogleTtsProvider } from './google-tts.js';
import { LocalTtsProvider } from './local-tts.js';

// TTS_PROVIDER: google (default) | elevenlabs | xtts | piper | local
// xtts/piper/local all use the self-hosted LocalTtsProvider (an HTTP TTS server
// in Türkiye); see docs/self-hosted-architecture.md for the sovereign profile.
export function createTtsProvider({ provider = process.env.TTS_PROVIDER || 'google' } = {}) {
  const normalized = provider.trim().toLowerCase();

  if (normalized === 'google' || normalized === 'google-cloud') {
    return new GoogleTtsProvider();
  }

  if (normalized === 'elevenlabs' || normalized === 'eleven-labs') {
    return new ElevenLabsTtsProvider();
  }

  if (normalized === 'xtts' || normalized === 'piper' || normalized === 'local') {
    return new LocalTtsProvider();
  }

  throw new Error(
    `Unsupported TTS_PROVIDER "${provider}". Use "google", "elevenlabs", "xtts", "piper", or "local".`
  );
}
