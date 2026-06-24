import { ElevenLabsTtsProvider } from './elevenlabs-tts.js';
import { GoogleTtsProvider } from './google-tts.js';

export function createTtsProvider({ provider = process.env.TTS_PROVIDER || 'google' } = {}) {
  const normalized = provider.trim().toLowerCase();

  if (normalized === 'google' || normalized === 'google-cloud') {
    return new GoogleTtsProvider();
  }

  if (normalized === 'elevenlabs' || normalized === 'eleven-labs') {
    return new ElevenLabsTtsProvider();
  }

  throw new Error(`Unsupported TTS_PROVIDER "${provider}". Use "google" or "elevenlabs".`);
}
