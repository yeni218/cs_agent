import { pcm16ToMulaw } from '../voice-core/mulaw.js';
import { extractWavData } from '../voice-core/wav.js';

const SUPPORTED_ENCODINGS = new Set(['MULAW', 'LINEAR16', 'PCM']);

export class GoogleTtsProvider {
  constructor({
    languageCode = process.env.GOOGLE_TTS_LANGUAGE_CODE || 'tr-TR',
    voiceName = process.env.GOOGLE_TTS_VOICE_NAME || 'tr-TR-Standard-A',
    audioEncoding = process.env.GOOGLE_TTS_AUDIO_ENCODING || 'MULAW',
    sampleRateHertz = Number.parseInt(process.env.GOOGLE_TTS_SAMPLE_RATE || '8000', 10),
    speakingRate = Number.parseFloat(process.env.GOOGLE_TTS_SPEAKING_RATE || '1'),
    pitch = Number.parseFloat(process.env.GOOGLE_TTS_PITCH || '0')
  } = {}) {
    this.languageCode = languageCode;
    this.voiceName = voiceName;
    this.audioEncoding = audioEncoding.toUpperCase();
    this.sampleRateHertz = sampleRateHertz;
    this.speakingRate = speakingRate;
    this.pitch = pitch;
    this.client = null;

    if (!SUPPORTED_ENCODINGS.has(this.audioEncoding)) {
      throw new Error(`GOOGLE_TTS_AUDIO_ENCODING must be one of ${Array.from(SUPPORTED_ENCODINGS).join(', ')}.`);
    }
  }

  async synthesizeMulaw(text) {
    if (!text?.trim()) return null;

    const client = await this.getClient();
    // Chirp/Chirp3-HD voices are higher quality but reject `pitch` (and ignore
    // most prosody controls). Only send prosody params the voice supports.
    const isChirp = /chirp/i.test(this.voiceName);
    const audioConfig = {
      audioEncoding: this.audioEncoding,
      sampleRateHertz: this.sampleRateHertz
    };
    if (!isChirp) {
      audioConfig.speakingRate = this.speakingRate;
      audioConfig.pitch = this.pitch;
    } else if (this.speakingRate !== 1) {
      audioConfig.speakingRate = this.speakingRate;
    }

    const [response] = await client.synthesizeSpeech({
      input: { text },
      voice: {
        languageCode: this.languageCode,
        name: this.voiceName
      },
      audioConfig
    });

    const audio = Buffer.from(response.audioContent || []);
    if (this.audioEncoding === 'MULAW') return extractWavData(audio);
    if (this.audioEncoding === 'LINEAR16' || this.audioEncoding === 'PCM') {
      return pcm16ToMulaw(extractWavData(audio));
    }

    throw new Error(`Unsupported Google TTS encoding: ${this.audioEncoding}`);
  }

  async getClient() {
    if (this.client) return this.client;

    let module;
    try {
      module = await import('@google-cloud/text-to-speech');
    } catch (error) {
      throw new Error(
        '@google-cloud/text-to-speech is required for TTS_PROVIDER=google. Run npm install in afiyet-ai and restart ./run.',
        { cause: error }
      );
    }

    const { TextToSpeechClient } = module;
    this.client = new TextToSpeechClient();
    return this.client;
  }
}
