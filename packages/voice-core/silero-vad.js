// Silero VAD adapter — SCAFFOLD.
//
// This presents the same `accept(pcm16Chunk) -> events[]` interface as
// EnergyTurnDetector so it can be dropped in via createTurnDetector(). It is
// NOT exercised in this repo's tests because it requires an optional native
// dependency and a model file that are not bundled:
//
//   npm install onnxruntime-node
//   export SILERO_VAD_MODEL_PATH=/abs/path/to/silero_vad.onnx   (v5, 16 kHz)
//
// Silero expects 16 kHz mono; Twilio audio is 8 kHz, so frames are upsampled
// 2x by linear interpolation before inference. The model returns a per-window
// speech probability which drives the same start/silence frame counting the
// energy detector uses. Validate latency and accuracy on real calls before
// using in production — these defaults are a starting point, not tuned values.

import { averagePcm16Amplitude } from './mulaw.js';

const SAMPLE_RATE_IN = 8000;
const SAMPLE_RATE_MODEL = 16000;
const WINDOW_SAMPLES = 512; // Silero v5 window at 16 kHz (~32 ms)

export class SileroTurnDetector {
  constructor({
    modelPath = process.env.SILERO_VAD_MODEL_PATH,
    speechProbThreshold = 0.5,
    speechFramesToStart = 2,
    silenceFramesToEnd = 18,
    minSpeechBytes = 4800,
    maxBufferedBytes = SAMPLE_RATE_IN * 2 * 20
  } = {}) {
    this.modelPath = modelPath;
    this.speechProbThreshold = speechProbThreshold;
    this.speechFramesToStart = speechFramesToStart;
    this.silenceFramesToEnd = silenceFramesToEnd;
    this.minSpeechBytes = minSpeechBytes;
    this.maxBufferedBytes = maxBufferedBytes;
    this.ort = null;
    this.session = null;
    this.modelState = null;
    this.sampleRateTensor = null;
    this.reset();
  }

  async init() {
    if (!this.modelPath) {
      throw new Error('SILERO_VAD_MODEL_PATH is not set.');
    }
    // Lazy, optional import. Throws a clear message if the dep is missing.
    this.ort = await import('onnxruntime-node').catch(() => {
      throw new Error('onnxruntime-node is not installed. Run: npm install onnxruntime-node');
    });
    this.session = await this.ort.InferenceSession.create(this.modelPath);
    this.resetModelState();
    return this;
  }

  reset() {
    this.isSpeaking = false;
    this.speechFrames = 0;
    this.silenceFrames = 0;
    this.audioBuffer = Buffer.alloc(0);
    this.preSpeechFrames = [];
  }

  resetModelState() {
    // Silero v5 carries a recurrent state tensor between windows.
    this.modelState = new this.ort.Tensor('float32', new Float32Array(2 * 1 * 128), [2, 1, 128]);
    this.sampleRateTensor = new this.ort.Tensor('int64', BigInt64Array.from([BigInt(SAMPLE_RATE_MODEL)]), []);
  }

  // Mirrors EnergyTurnDetector.accept() but is async (model inference).
  async accept(pcm16Chunk) {
    const prob = await this.speechProbability(pcm16Chunk);
    const hasSpeech = prob >= this.speechProbThreshold;
    const events = [];

    if (hasSpeech) {
      if (!this.isSpeaking) {
        this.speechFrames += 1;
        this.preSpeechFrames.push(pcm16Chunk);
        if (this.speechFrames < this.speechFramesToStart) return events;
        this.isSpeaking = true;
        this.audioBuffer = Buffer.concat(this.preSpeechFrames);
        this.preSpeechFrames = [];
        events.push({ type: 'speech_start', probability: prob });
        return events;
      }
      this.silenceFrames = 0;
      this.append(pcm16Chunk);
      return events;
    }

    if (!this.isSpeaking) {
      this.speechFrames = 0;
      this.preSpeechFrames = [];
      return events;
    }

    this.silenceFrames += 1;
    this.append(pcm16Chunk);
    if (this.silenceFrames >= this.silenceFramesToEnd) {
      const audio = Buffer.from(this.audioBuffer);
      this.reset();
      if (audio.length >= this.minSpeechBytes) events.push({ type: 'utterance', audio });
    }
    return events;
  }

  async speechProbability(pcm16Chunk) {
    if (!this.session) {
      // Without a model, degrade to an energy proxy so callers still function.
      return averagePcm16Amplitude(pcm16Chunk) > 500 ? 1 : 0;
    }
    const samples16k = upsample2x(pcm16Chunk);
    const window = new Float32Array(WINDOW_SAMPLES);
    for (let i = 0; i < Math.min(WINDOW_SAMPLES, samples16k.length); i += 1) {
      window[i] = samples16k[i] / 32768;
    }
    const input = new this.ort.Tensor('float32', window, [1, WINDOW_SAMPLES]);
    const output = await this.session.run({
      input,
      state: this.modelState,
      sr: this.sampleRateTensor
    });
    if (output.stateN) this.modelState = output.stateN;
    return output.output?.data?.[0] ?? 0;
  }

  append(chunk) {
    this.audioBuffer = Buffer.concat([this.audioBuffer, chunk]);
    if (this.audioBuffer.length > this.maxBufferedBytes) {
      this.audioBuffer = this.audioBuffer.subarray(this.audioBuffer.length - this.maxBufferedBytes);
    }
  }
}

// Linear 2x upsample (8 kHz -> 16 kHz) of an interleaved PCM16 LE buffer.
function upsample2x(pcm16Chunk) {
  const inSamples = Math.floor(pcm16Chunk.length / 2);
  const out = new Int16Array(inSamples * 2);
  for (let i = 0; i < inSamples; i += 1) {
    const cur = pcm16Chunk.readInt16LE(i * 2);
    const next = i + 1 < inSamples ? pcm16Chunk.readInt16LE((i + 1) * 2) : cur;
    out[i * 2] = cur;
    out[i * 2 + 1] = (cur + next) >> 1;
  }
  return out;
}
