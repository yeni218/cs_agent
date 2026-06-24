import test from 'node:test';
import assert from 'node:assert/strict';
import { SemanticEndpointer } from '../packages/voice-core/semantic-endpointer.js';
import { EnergyTurnDetector } from '../packages/voice-core/turn-detector.js';

test('waits when the caller trails off on a conjunction or filler', () => {
  const ep = new SemanticEndpointer();
  assert.equal(ep.analyze('kasko yaptırmak istiyorum ve').complete, false);
  assert.equal(ep.analyze('aracım için şey').complete, false);
  assert.equal(ep.analyze('bir').complete, false);
});

test('commits on a complete-looking utterance', () => {
  const ep = new SemanticEndpointer();
  assert.equal(ep.analyze('kasko teklifi almak istiyorum').complete, true);
  assert.equal(ep.analyze('plakam otuz dört ABC yüz yirmi üç').complete, true);
  assert.equal(ep.analyze('teklifim var mı').complete, true);
});

test('treats short confirmations as complete', () => {
  const ep = new SemanticEndpointer();
  assert.equal(ep.analyze('evet').complete, true);
  assert.equal(ep.analyze('tamam').complete, true);
});

test('punctuation forces a commit', () => {
  const ep = new SemanticEndpointer();
  assert.equal(ep.analyze('teşekkürler.').complete, true);
});

test('classifier can override a wait decision', async () => {
  const ep = new SemanticEndpointer({ classifier: async () => true });
  assert.equal(await ep.shouldCommit('aracım için şey'), true);
});

test('adaptive noise floor raises the bar after hearing ambient noise', () => {
  const detector = new EnergyTurnDetector({
    speechThreshold: 300,
    adaptiveNoiseFloor: true,
    noiseFloorMargin: 2,
    noiseFloorSmoothing: 0.3,
    speechFramesToStart: 1,
    silenceFramesToEnd: 2,
    minSpeechBytes: 320
  });

  // Ambient noise sits below the static floor (250 < 300); the detector learns
  // it and lifts the effective threshold toward ~500 (250 * margin 2).
  let started = false;
  for (let i = 0; i < 15; i += 1) {
    const events = detector.accept(frame(250));
    if (events.some((e) => e.type === 'speech_start')) started = true;
  }
  assert.equal(started, false);
  assert.ok(detector.effectiveThreshold() > 300);

  // A moderate transient (350) that WOULD trip the static 300 floor is now
  // suppressed, while genuine loud speech still triggers.
  assert.deepEqual(detector.accept(frame(350)), []);
  const speech = detector.accept(frame(3000));
  assert.equal(speech[0]?.type, 'speech_start');
});

function frame(sample, samples = 160) {
  const buffer = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) buffer.writeInt16LE(sample, i * 2);
  return buffer;
}
