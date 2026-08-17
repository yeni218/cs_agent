// Inworld AI TTS provider. Returns synthesized audio (base64) + char count for
// cost accounting. Mock-safe when INWORLD_API_KEY is absent.
//
// Inworld TTS uses Basic auth with the API key and returns base64 audio. The
// exact request/response is configurable so you can align it to the current
// Inworld TTS API without touching the rest of the system.
const INWORLD_URL = process.env.INWORLD_TTS_URL || 'https://api.inworld.ai/tts/v1/voice';
const KEY = process.env.INWORLD_API_KEY;             // base64 "workspace:key" per Inworld
const MODEL = process.env.INWORLD_TTS_MODEL || 'inworld-tts-1';

export async function synthesize(text, { voiceId = 'Ashley', language = 'tr' } = {}) {
  const chars = (text || '').length;
  if (!KEY) return { audioBase64: null, mimeType: 'audio/wav', chars, mock: true };

  const res = await fetch(INWORLD_URL, {
    method: 'POST',
    headers: { authorization: `Basic ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text, voiceId, modelId: MODEL, language })
  });
  if (!res.ok) throw new Error(`Inworld TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  // Inworld returns audioContent (base64). Keep tolerant of field naming.
  const audioBase64 = data.audioContent || data.audio || data.result?.audioContent || null;
  return { audioBase64, mimeType: data.mimeType || 'audio/wav', chars };
}

export const inworldReady = !!KEY;
