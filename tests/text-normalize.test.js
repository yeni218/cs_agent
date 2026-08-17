import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForSpeech } from '../packages/voice-core/text-normalize.js';

test('empty in, empty out', () => {
  assert.equal(normalizeForSpeech(''), '');
  assert.equal(normalizeForSpeech(null), '');
});

test('strips bold, italic and headings', () => {
  assert.equal(normalizeForSpeech('## Başlık\n**Kalın** ve _italik_ metin'), 'Başlık. Kalın ve italik metin');
});

test('flattens bullet and numbered lists', () => {
  const md = 'Teminatlar:\n- Çarpma\n- Yangın\n1. Hırsızlık';
  const out = normalizeForSpeech(md);
  assert.ok(!out.includes('-'));
  assert.ok(!out.includes('*'));
  assert.ok(out.includes('Çarpma'));
  assert.ok(out.includes('Hırsızlık'));
});

test('removes stray markdown symbols and inline code', () => {
  assert.equal(normalizeForSpeech('Fiyat `1250` TL **net**'), 'Fiyat 1250 TL net');
});

test('no space left before punctuation', () => {
  assert.ok(!/\s[,.!?]/.test(normalizeForSpeech('Merhaba , nasılsın ?')));
});
