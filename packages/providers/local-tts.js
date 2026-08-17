import { pcm16ToMulaw } from '../voice-core/mulaw.js';
import { parseWav } from '../voice-core/wav.js';
import { resamplePcm16, toMonoPcm16 } from '../voice-core/resample.js';

// Self-hosted TTS adapter for a local HTTP server (XTTS-v2 via
// training/voice/serve_xtts_fastapi.py, or a Piper HTTP wrapper). Sovereign,
// in-Türkiye replacement for Google/ElevenLabs — same `synthesizeMulaw(text)`
// contract, returning mu-law 8 kHz for Twilio/Jambonz/browser playback.
//
// The server returns WAV (or raw PCM16) at its native rate; we down-convert to
// telephony 8 kHz mu-law here. Request/response shapes are configurable so the
// same adapter fits XTTS, Piper, or a thin custom server.
export class LocalTtsProvider {
  constructor({
    baseUrl = process.env.TTS_BASE_URL || 'http://localhost:8020',
    path = process.env.TTS_PATH || '/tts',
    voice = process.env.TTS_VOICE || 'default',
    language = process.env.TTS_LANGUAGE || 'tr',
    // Used only when the server returns headerless raw PCM.
    inputSampleRate = Number.parseInt(process.env.TTS_INPUT_SAMPLE_RATE || '24000', 10),
    timeoutMs = Number.parseInt(process.env.TTS_TIMEOUT_MS || '20000', 10)
  } = {}) {
    this.url = `${baseUrl.replace(/\/$/, '')}${path}`;
    this.voice = voice;
    this.language = language;
    this.inputSampleRate = inputSampleRate;
    this.timeoutMs = timeoutMs;
  }

  // Telephony path (Twilio/phone): mu-law 8 kHz. Lossy on purpose — that's the
  // codec the PSTN uses.
  async synthesizeMulaw(text) {
    const native = await this.synthesizePcm(text);
    if (!native) return null;
    const pcm8k = resamplePcm16(native.pcm, native.sampleRate, 8000);
    return pcm16ToMulaw(pcm8k);
  }

  // Full-quality path (browser/WebRTC): the engine's native-rate 16-bit mono
  // PCM, no down-conversion. Returns { pcm, sampleRate }. This is what makes the
  // browser voice sound clear instead of telephony-muffled.
  async synthesizePcm(text) {
    if (!text?.trim()) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'audio/wav' },
        body: JSON.stringify({
          text,
          voice: this.voice,
          speaker: this.voice,
          language: this.language
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`TTS server ${response.status}: ${detail.slice(0, 300)}`);
      }

      const audio = Buffer.from(await response.arrayBuffer());
      const { sampleRate, channels, data } = parseWav(audio, {
        defaultSampleRate: this.inputSampleRate
      });
      return { pcm: toMonoPcm16(data, channels), sampleRate };
    } finally {
      clearTimeout(timer);
    }
  }
}
