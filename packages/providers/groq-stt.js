import { createReadStream } from 'fs';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import path from 'path';
import { unlink, writeFile } from 'fs/promises';
import Groq from 'groq-sdk';
import { createWavBuffer } from '../voice-core/wav.js';

export class GroqSttProvider {
  constructor({
    apiKey = process.env.GROQ_API_KEY,
    model = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo'
  } = {}) {
    this.apiKey = apiKey;
    this.client = null;
    this.model = model;
  }

  async transcribePcm16(pcmBuffer) {
    const wavBuffer = createWavBuffer(pcmBuffer, 8000, 1, 16);
    const tmpPath = path.join(tmpdir(), `afiyet-stt-${randomUUID()}.wav`);

    try {
      await writeFile(tmpPath, wavBuffer);
      const result = await this.getClient().audio.transcriptions.create({
        file: createReadStream(tmpPath),
        model: this.model,
        language: 'tr',
        response_format: 'json',
        temperature: 0
      });
      return result.text?.trim() || null;
    } finally {
      await unlink(tmpPath).catch(() => {});
    }
  }

  getClient() {
    if (!this.apiKey) throw new Error('GROQ_API_KEY is required for speech recognition.');
    if (!this.client) this.client = new Groq({ apiKey: this.apiKey });
    return this.client;
  }
}
