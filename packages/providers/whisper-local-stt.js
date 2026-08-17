import { createWavBuffer } from '../voice-core/wav.js';

// Self-hosted STT adapter for a local faster-whisper / WhisperLiveKit server
// exposing the OpenAI-compatible /audio/transcriptions route. Sovereign,
// in-Türkiye replacement for GroqSttProvider — same `transcribePcm16` contract.
//
// Unlike GroqSttProvider this posts the audio in-memory (no temp WAV per
// utterance), which also removes the latency the migration plan flagged.
export class WhisperLocalSttProvider {
  constructor({
    baseUrl = process.env.STT_BASE_URL || 'http://localhost:9000/v1',
    apiKey = process.env.STT_API_KEY || 'not-needed',
    model = process.env.STT_MODEL || 'whisper-large-v3-turbo',
    language = process.env.STT_LANGUAGE || 'tr',
    sampleRate = Number.parseInt(process.env.STT_SAMPLE_RATE || '8000', 10),
    timeoutMs = Number.parseInt(process.env.STT_TIMEOUT_MS || '15000', 10)
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.model = model;
    this.language = language;
    this.sampleRate = sampleRate;
    this.timeoutMs = timeoutMs;
  }

  async transcribePcm16(pcmBuffer) {
    const wav = createWavBuffer(pcmBuffer, this.sampleRate, 1, 16);

    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'utterance.wav');
    form.append('model', this.model);
    form.append('language', this.language);
    form.append('response_format', 'json');
    form.append('temperature', '0');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`STT server ${response.status}: ${detail.slice(0, 300)}`);
      }

      const data = await response.json();
      return data.text?.trim() || null;
    } finally {
      clearTimeout(timer);
    }
  }
}
