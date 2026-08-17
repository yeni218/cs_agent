import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitIntoSpeechChunks } from '../packages/voice-core/speech-chunker.js';

test('returns empty for blank input', () => {
  assert.deepEqual(splitIntoSpeechChunks(''), []);
  assert.deepEqual(splitIntoSpeechChunks('   '), []);
  assert.deepEqual(splitIntoSpeechChunks(null), []);
});

test('splits on sentence boundaries', () => {
  const chunks = splitIntoSpeechChunks(
    'Merhaba, size nasıl yardımcı olabilirim? Kasko teklifi hazırlayabilirim. Devam edelim mi?'
  );
  assert.equal(chunks.length, 3);
  assert.ok(chunks[0].endsWith('?'));
  assert.ok(chunks[1].endsWith('.'));
});

test('emits the first chunk early instead of the whole paragraph', () => {
  const text = 'Teklifiniz hazır. ' + 'a'.repeat(300);
  const chunks = splitIntoSpeechChunks(text);
  assert.ok(chunks.length >= 2);
  assert.equal(chunks[0], 'Teklifiniz hazır.');
});

test('does not split on ordinal / abbreviation dots', () => {
  const chunks = splitIntoSpeechChunks('Poliçe no 3. maddede belirtildiği gibi geçerlidir.');
  assert.equal(chunks.length, 1);
});

test('breaks overlong run-on clauses at a soft boundary', () => {
  const longClause =
    'Kasko sigortanız aracınızın çarpma, çarpışma, yanma ve hırsızlık gibi risklerini kapsar, ' +
    'ayrıca cam kırılması, sel ve doğal afet teminatları da dahildir, dilerseniz ek teminat ekleyebiliriz';
  const chunks = splitIntoSpeechChunks(longClause, { maxChars: 80 });
  assert.ok(chunks.length >= 2);
  for (const chunk of chunks) assert.ok(chunk.length <= 90, `chunk too long: ${chunk.length}`);
});

test('merges a tiny trailing fragment into the previous chunk', () => {
  const chunks = splitIntoSpeechChunks('Teklifiniz hazırlandı ve size iletildi. Peki.');
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].includes('Peki'));
});
