import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { redact, redactDeep } from '../packages/voice-core/pii-redactor.js';
import { AuditLog } from '../packages/domain/audit-log.js';
import { CallMetrics } from '../packages/voice-core/metrics.js';

test('redacts TC kimlik, card, phone, and IBAN', () => {
  assert.match(redact('kimlik numaram 12345678901'), /\[TCKN\]/);
  assert.match(redact('kartım 4111 1111 1111 1234'), /\[KART \*\*\*\*1234\]/);
  assert.match(redact('telefonum 0532 123 45 67'), /\[TELEFON\]/);
  assert.match(redact('IBAN TR33 0006 1005 1978 6457 8413 26'), /\[IBAN\]/);
});

test('redactDeep masks strings nested in tool args', () => {
  const out = redactDeep({ kimlik_no: '12345678901', note: 'normal metin' });
  assert.equal(out.kimlik_no, '[TCKN]');
  assert.equal(out.note, 'normal metin');
});

test('audit log is hash-chained and tamper-evident', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'afiyet-audit-'));
  const filePath = path.join(dir, 'audit.jsonl');
  try {
    const log = new AuditLog({ filePath });
    await log.record({ sessionId: 's1', type: 'user_turn', text: 'kimlik 12345678901' });
    await log.record({ sessionId: 's1', type: 'assistant_turn', text: 'tamam' });

    // PII is redacted at rest.
    const raw = await readFile(filePath, 'utf8');
    assert.match(raw, /\[TCKN\]/);
    assert.doesNotMatch(raw, /12345678901/);

    assert.deepEqual((await log.verify()).valid, true);

    // Tamper with a record -> chain breaks.
    const lines = raw.trim().split('\n');
    const first = JSON.parse(lines[0]);
    first.text = 'değiştirildi';
    lines[0] = JSON.stringify(first);
    await writeFile(filePath, lines.join('\n') + '\n', 'utf8');

    assert.equal((await log.verify()).valid, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('audit log creates its parent directory if missing', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'afiyet-audit-'));
  // Nested path whose parent dirs do not exist yet.
  const filePath = path.join(base, 'nested', 'logs', 'audit.jsonl');
  try {
    const log = new AuditLog({ filePath });
    await log.record({ sessionId: 's1', type: 'consent', text: 'kayıt onayı' });
    const raw = await readFile(filePath, 'utf8');
    assert.match(raw, /consent/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('call metrics summarize stage latency and counts', async () => {
  const m = new CallMetrics({ sessionId: 's1' });
  await m.time('stt', async () => {});
  await m.time('llm', async () => {});
  m.increment('turns');
  m.increment('transfers');
  const summary = m.summary();
  assert.equal(summary.counts.turns, 1);
  assert.equal(summary.counts.transfers, 1);
  assert.equal(summary.latencyMs.stt.count, 1);
  assert.equal(summary.latencyMs.llm.count, 1);
});
