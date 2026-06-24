import { averagePcm16Amplitude } from './mulaw.js';

export class EnergyTurnDetector {
  constructor({
    speechThreshold = 500,
    speechFramesToStart = 2,
    maxPreSpeechFrames = 8,
    silenceFramesToEnd = 25,
    minSpeechBytes = 4800,
    maxBufferedBytes = 8000 * 2 * 20,
    // Adaptive noise floor: when enabled, the speech threshold tracks the
    // ambient noise of recent non-speech frames so background hiss / line
    // noise does not false-trigger speech_start. Opt-in to keep deterministic
    // behavior for tests and simple deployments.
    adaptiveNoiseFloor = false,
    noiseFloorMargin = 2.2,
    noiseFloorSmoothing = 0.05
  } = {}) {
    this.speechThreshold = speechThreshold;
    this.speechFramesToStart = speechFramesToStart;
    this.maxPreSpeechFrames = maxPreSpeechFrames;
    this.silenceFramesToEnd = silenceFramesToEnd;
    this.minSpeechBytes = minSpeechBytes;
    this.maxBufferedBytes = maxBufferedBytes;
    this.adaptiveNoiseFloor = adaptiveNoiseFloor;
    this.noiseFloorMargin = noiseFloorMargin;
    this.noiseFloorSmoothing = noiseFloorSmoothing;
    this.noiseEstimate = speechThreshold / noiseFloorMargin;
    this.reset();
  }

  effectiveThreshold() {
    if (!this.adaptiveNoiseFloor) return this.speechThreshold;
    return Math.max(this.speechThreshold, this.noiseEstimate * this.noiseFloorMargin);
  }

  reset() {
    this.isSpeaking = false;
    this.speechFrames = 0;
    this.silenceFrames = 0;
    this.audioBuffer = Buffer.alloc(0);
    this.preSpeechFrames = [];
  }

  accept(pcm16Chunk) {
    const events = [];
    const amplitude = averagePcm16Amplitude(pcm16Chunk);
    const hasSpeech = amplitude > this.effectiveThreshold();

    // Update the ambient noise estimate from quiet, non-speech frames only.
    if (this.adaptiveNoiseFloor && !this.isSpeaking && !hasSpeech) {
      this.noiseEstimate =
        this.noiseEstimate * (1 - this.noiseFloorSmoothing) +
        amplitude * this.noiseFloorSmoothing;
    }

    if (hasSpeech) {
      if (!this.isSpeaking) {
        this.speechFrames += 1;
        this.preSpeechFrames.push(pcm16Chunk);
        if (this.preSpeechFrames.length > this.maxPreSpeechFrames) this.preSpeechFrames.shift();

        if (this.speechFrames < this.speechFramesToStart) return events;

        this.isSpeaking = true;
        this.audioBuffer = Buffer.concat(this.preSpeechFrames);
        this.preSpeechFrames = [];
        events.push({ type: 'speech_start', amplitude });
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
      if (audio.length >= this.minSpeechBytes) {
        events.push({ type: 'utterance', audio });
      }
    }

    return events;
  }

  append(chunk) {
    this.audioBuffer = Buffer.concat([this.audioBuffer, chunk]);
    if (this.audioBuffer.length > this.maxBufferedBytes) {
      this.audioBuffer = this.audioBuffer.subarray(this.audioBuffer.length - this.maxBufferedBytes);
    }
  }
}
