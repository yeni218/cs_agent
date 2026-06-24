import test from 'node:test';
import assert from 'node:assert/strict';
import { mulawToPcm16, pcm16ToMulaw } from '../packages/voice-core/mulaw.js';
import { createWavBuffer, extractWavData } from '../packages/voice-core/wav.js';

test('extracts audio data from wav containers', () => {
  const pcm = Buffer.alloc(320);
  pcm.writeInt16LE(1200, 0);

  const wav = createWavBuffer(pcm);
  assert.deepEqual(extractWavData(wav), pcm);
});

test('converts pcm16 to mulaw and back to pcm16 shape', () => {
  const pcm = Buffer.alloc(320);
  for (let i = 0; i < 160; i += 1) pcm.writeInt16LE(i % 2 === 0 ? 1800 : -1800, i * 2);

  const mulaw = pcm16ToMulaw(pcm);
  const decoded = mulawToPcm16(mulaw);

  assert.equal(mulaw.length, 160);
  assert.equal(decoded.length, pcm.length);
  assert.ok(Math.abs(decoded.readInt16LE(0)) > 1000);
});
