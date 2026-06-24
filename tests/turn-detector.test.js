import test from 'node:test';
import assert from 'node:assert/strict';
import { EnergyTurnDetector } from '../packages/voice-core/turn-detector.js';

test('detects speech start and emits an utterance after silence', () => {
  const detector = new EnergyTurnDetector({
    speechThreshold: 500,
    speechFramesToStart: 1,
    silenceFramesToEnd: 2,
    minSpeechBytes: 320
  });

  assert.deepEqual(detector.accept(frame(0)), []);

  const speechStart = detector.accept(frame(2000));
  assert.equal(speechStart[0].type, 'speech_start');

  assert.deepEqual(detector.accept(frame(1800)), []);
  assert.deepEqual(detector.accept(frame(0)), []);

  const ended = detector.accept(frame(0));
  assert.equal(ended[0].type, 'utterance');
  assert.ok(ended[0].audio.length >= 320);
});

test('ignores one-frame noise before speech start', () => {
  const detector = new EnergyTurnDetector({
    speechThreshold: 500,
    speechFramesToStart: 2,
    silenceFramesToEnd: 2,
    minSpeechBytes: 320
  });

  assert.deepEqual(detector.accept(frame(2000)), []);
  assert.deepEqual(detector.accept(frame(0)), []);
  assert.deepEqual(detector.accept(frame(2000)), []);

  const speechStart = detector.accept(frame(1800));
  assert.equal(speechStart[0].type, 'speech_start');
});

function frame(sample, samples = 160) {
  const buffer = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    buffer.writeInt16LE(sample, i * 2);
  }
  return buffer;
}
