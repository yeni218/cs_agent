// Pluggable store. DB=memory (default) | postgres (Supabase / Neon / self-hosted
// Postgres via DATABASE_URL). Same async interface either way, so server.js and
// the engine don't care which backend is live.
class MemoryStore {
  constructor() {
    this.c = {
      assistants: new Map(),
      calls: new Map(),
      phoneNumbers: new Map(),
      usageEvents: new Map(),
      telephonyCdrs: new Map(),
      reconciliations: new Map(),
      auditLog: new Map()
    };
  }
  async init() { return this; }
  async put(coll, obj) { this.c[coll].set(obj.id, obj); return obj; }
  async get(coll, id) { return this.c[coll].get(id) || null; }
  async del(coll, id) { return this.c[coll].delete(id); }
  async list(coll, { limit = 100, where = {} } = {}) {
    let arr = Array.from(this.c[coll].values()).reverse();
    if (where.assistantId) arr = arr.filter((o) => o.assistantId === where.assistantId);
    if (where.tenantId) arr = arr.filter((o) => o.tenantId === where.tenantId);
    if (where.callId) arr = arr.filter((o) => o.callId === where.callId);
    if (where.externalCallId) arr = arr.filter((o) => o.externalCallId === where.externalCallId);
    return arr.slice(0, limit);
  }
}

export async function createStore() {
  const kind = (process.env.DB || 'memory').toLowerCase();
  if (kind === 'postgres' || kind === 'supabase') {
    const { PostgresStore } = await import('./store-postgres.js');
    const store = new PostgresStore();
    await store.init();
    console.log('[store] postgres');
    return store;
  }
  console.log('[store] memory');
  return new MemoryStore().init();
}
