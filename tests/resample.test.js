import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resamplePcm16, toMonoPcm16 } from '../packages/voice-core/resample.js';
import { createWavBuffer, parseWav } from '../packages/voice-core/wav.js';

function tone(samples, rate) {
  const buf = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    buf.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / rate)), i * 2);
  }
  return buf;
}

test('resamplePcm16 downsamples 24k to 8k by ratio', () => {
  const pcm = tone(2400, 24000); // 100 ms at 24 kHz
  const out = resamplePcm16(pcm, 24000, 8000);
  assert.equal(out.length / 2, 800); // 100 ms at 8 kHz
});

test('resamplePcm16 is a no-op at equal rates', () => {
  const pcm = tone(160, 8000);
  assert.equal(resamplePcm16(pcm, 8000, 8000), pcm);
});

test('resamplePcm16 handles empty input', () => {
  assert.equal(resamplePcm16(Buffer.alloc(0), 24000, 8000).length, 0);
});

test('toMonoPcm16 averages stereo to mono', () => {
  const stereo = Buffer.alloc(8); // 2 frames, 2 channels
  stereo.writeInt16LE(100, 0);
  stereo.writeInt16LE(300, 2);
  stereo.writeInt16LE(-100, 4);
  stereo.writeInt16LE(-300, 6);
  const mono = toMonoPcm16(stereo, 2);
  assert.equal(mono.length / 2, 2);
  assert.equal(mono.readInt16LE(0), 200);
  assert.equal(mono.readInt16LE(2), -200);
});

test('parseWav round-trips sample rate and data', () => {
  const pcm = tone(240, 24000);
  const wav = createWavBuffer(pcm, 24000, 1, 16);
  const parsed = parseWav(wav);
  assert.equal(parsed.sampleRate, 24000);
  assert.equal(parsed.channels, 1);
  assert.equal(parsed.data.length, pcm.length);
});

test('parseWav falls back to default rate for raw PCM', () => {
  const pcm = tone(100, 22050);
  const parsed = parseWav(pcm, { defaultSampleRate: 22050 });
  assert.equal(parsed.sampleRate, 22050);
  assert.equal(parsed.data.length, pcm.length);
});
