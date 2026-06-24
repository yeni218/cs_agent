import { appendFile, readFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { createHash } from 'crypto';
import { redactDeep } from '../voice-core/pii-redactor.js';

// Append-only, hash-chained audit log for call interactions.
//
// Each record stores the SHA-256 of the previous record, so any later edit or
// deletion breaks the chain and is detectable (`verify()`). PII is redacted
// before write. For production, point this at append-only object storage or a
// WORM bucket; the file backend is for local/dev and demos.
//
// This satisfies the "immutable audit log of every turn" requirement; it is not
// a substitute for the regulator-facing call recording, which lives elsewhere.
export class AuditLog {
  constructor({ filePath = process.env.AUDIT_LOG_PATH || './data/audit-log.jsonl', redact = true } = {}) {
    this.filePath = filePath;
    this.redact = redact;
    this.lastHash = null;
    this.ready = false;
  }

  async init() {
    if (this.ready) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const existing = await readFile(this.filePath, 'utf8');
      const lines = existing.trim().split('\n').filter(Boolean);
      if (lines.length) this.lastHash = JSON.parse(lines[lines.length - 1]).hash;
    } catch {
      // No prior log — start a fresh chain.
    }
    this.ready = true;
  }

  // event: { sessionId, type, ... }  — type e.g. 'user_turn','assistant_turn',
  // 'tool_call','handoff','consent'.
  async record(event) {
    await this.init();
    const payload = this.redact ? redactDeep(event) : event;
    const entry = {
      ts: new Date().toISOString(),
      prevHash: this.lastHash,
      ...payload
    };
    entry.hash = hashEntry(entry);
    this.lastHash = entry.hash;
    await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, 'utf8');
    return entry;
  }

  // Recompute the chain and report the first broken link, if any.
  async verify() {
    let content;
    try {
      content = await readFile(this.filePath, 'utf8');
    } catch {
      return { valid: true, entries: 0 };
    }
    const lines = content.trim().split('\n').filter(Boolean);
    let prevHash = null;
    for (let i = 0; i < lines.length; i += 1) {
      const entry = JSON.parse(lines[i]);
      const { hash, ...rest } = entry;
      if (rest.prevHash !== prevHash) return { valid: false, brokenAt: i, reason: 'prevHash mismatch' };
      if (hashEntry(rest) !== hash) return { valid: false, brokenAt: i, reason: 'hash mismatch' };
      prevHash = hash;
    }
    return { valid: true, entries: lines.length };
  }
}

function hashEntry(entryWithoutHash) {
  const { hash, ...rest } = entryWithoutHash;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}
