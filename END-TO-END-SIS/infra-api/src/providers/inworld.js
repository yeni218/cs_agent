// Inworld AI TTS provider. Returns synthesized audio (base64) + char count for
// cost accounting. Mock-safe when INWORLD_API_KEY is absent.
//
// Inworld TTS uses Basic auth with the API key and returns base64 audio. The
// exact request/response is configurable so you can align it to the current
// Inworld TTS API without touching the rest of the system.
const INWORLD_URL = process.env.INWORLD_TTS_URL || 'https://api.inworld.ai/tts/v1/voice';
const KEY = process.env.INWORLD_API_KEY;
const MODEL = process.env.INWORLD_TTS_MODEL || 'inworld-tts-1.5-mini';
const AUDIO_ENCODING = process.env.INWORLD_TTS_AUDIO_ENCODING || 'MP3';
const SAMPLE_RATE = Number(process.env.INWORLD_TTS_SAMPLE_RATE || 48000);
const LANGUAGE = process.env.INWORLD_TTS_LANGUAGE || 'tr-TR';

export async function synthesize(text, { voiceId = 'Ashley', language = LANGUAGE } = {}) {
  const chars = (text || '').length;
  if (!KEY) return { audioBase64: null, mimeType: 'audio/wav', chars, mock: true };

  const body = {
    text,
    voiceId,
    modelId: MODEL,
    audioConfig: {
      audioEncoding: AUDIO_ENCODING,
      sampleRateHertz: SAMPLE_RATE
    },
    language: language || LANGUAGE,
    deliveryMode: process.env.INWORLD_TTS_DELIVERY_MODE || 'BALANCED',
    applyTextNormalization: process.env.INWORLD_TTS_TEXT_NORMALIZATION || 'ON'
  };

  const res = await fetch(INWORLD_URL, {
    method: 'POST',
    headers: { authorization: `Basic ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Inworld TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  // Inworld returns audioContent (base64). Keep tolerant of field naming.
  const audioBase64 = data.audioContent || data.audio || data.result?.audioContent || null;
  const billedChars = data.usage?.processedCharactersCount || data.result?.usage?.processedCharactersCount || chars;
  return { audioBase64, mimeType: data.mimeType || mimeTypeFor(AUDIO_ENCODING), chars: billedChars };
}

export const inworldReady = !!KEY;

function mimeTypeFor(encoding) {
  if (encoding === 'MP3') return 'audio/mpeg';
  if (encoding === 'OGG_OPUS') return 'audio/ogg';
  if (encoding === 'FLAC') return 'audio/flac';
  return 'audio/wav';
}
