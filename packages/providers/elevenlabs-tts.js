import { ElevenLabsClient } from 'elevenlabs';

export class ElevenLabsTtsProvider {
  constructor({
    apiKey = process.env.ELEVENLABS_API_KEY,
    voiceId = process.env.ELEVENLABS_VOICE_ID
  } = {}) {
    this.apiKey = apiKey;
    this.client = null;
    this.voiceId = voiceId;
  }

  async synthesizeMulaw(text) {
    if (!text?.trim()) return null;
    if (!this.voiceId) throw new Error('ELEVENLABS_VOICE_ID is required.');

    const stream = await this.getClient().textToSpeech.convert(this.voiceId, {
      text,
      model_id: 'eleven_multilingual_v2',
      language_code: 'tr',
      output_format: 'ulaw_8000',
      voice_settings: {
        stability: 0.52,
        similarity_boost: 0.82,
        style: 0.35,
        use_speaker_boost: true
      }
    });

    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  getClient() {
    if (!this.apiKey) throw new Error('ELEVENLABS_API_KEY is required for speech synthesis.');
    if (!this.client) this.client = new ElevenLabsClient({ apiKey: this.apiKey });
    return this.client;
  }
}
