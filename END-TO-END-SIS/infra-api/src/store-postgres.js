// Postgres-backed store — works with Supabase, Neon, or self-hosted Postgres via
// DATABASE_URL. `pg` is lazy-imported so DB=memory needs no dependency. Objects
// are stored whole as jsonb `data`, with a few extracted columns for filtering.
const TABLE = {
  assistants: 'infra_assistants',
  calls: 'infra_calls',
  phoneNumbers: 'infra_phone_numbers',
  usageEvents: 'infra_usage_events',
  telephonyCdrs: 'infra_telephony_cdrs',
  reconciliations: 'infra_reconciliations',
  auditLog: 'infra_audit_log'
};

const SCHEMA = `
create table if not exists infra_assistants (
  id text primary key,
  tenant_id text,
  data jsonb not null,
  created_at timestamptz default now()
);
create table if not exists infra_calls (
  id text primary key,
  assistant_id text,
  tenant_id text,
  data jsonb not null,
  created_at timestamptz default now()
);
create table if not exists infra_phone_numbers (
  id text primary key,
  assistant_id text,
  tenant_id text,
  data jsonb not null,
  created_at timestamptz default now()
);
create table if not exists infra_usage_events (
  id text primary key,
  call_id text,
  assistant_id text,
  tenant_id text,
  data jsonb not null,
  created_at timestamptz default now()
);
create table if not exists infra_telephony_cdrs (
  id text primary key,
  call_id text,
  assistant_id text,
  tenant_id text,
  external_call_id text,
  data jsonb not null,
  created_at timestamptz default now()
);
create table if not exists infra_reconciliations (
  id text primary key,
  call_id text,
  assistant_id text,
  tenant_id text,
  data jsonb not null,
  created_at timestamptz default now()
);
create table if not exists infra_audit_log (
  id text primary key,
  call_id text,
  assistant_id text,
  tenant_id text,
  data jsonb not null,
  created_at timestamptz default now()
);
create index if not exists infra_calls_assistant_idx on infra_calls (assistant_id);
create index if not exists infra_calls_tenant_idx on infra_calls (tenant_id);
create index if not exists infra_assistants_tenant_idx on infra_assistants (tenant_id);
create index if not exists infra_usage_events_call_idx on infra_usage_events (call_id);
create index if not exists infra_telephony_cdrs_call_idx on infra_telephony_cdrs (call_id);
create index if not exists infra_telephony_cdrs_external_idx on infra_telephony_cdrs (external_call_id);
create index if not exists infra_reconciliations_call_idx on infra_reconciliations (call_id);
`;

export class PostgresStore {
  async init() {
    const pg = (await import('pg')).default;
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required for DB=postgres');
    const local = /localhost|127\.0\.0\.1/.test(url);
    this.pool = new pg.Pool({
      connectionString: url,
      ssl: local || process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
    await this.pool.query(SCHEMA);
    return this;
  }

  table(coll) {
    const t = TABLE[coll];
    if (!t) throw new Error(`unknown collection ${coll}`);
    return t; // fixed allow-list — never interpolate user input
  }

  async put(coll, obj) {
    const t = this.table(coll);
    const cols = ['id', 'assistant_id', 'tenant_id', 'data'];
    const vals = [obj.id, obj.assistantId || null, obj.tenantId || null, JSON.stringify(obj)];
    if (['infra_usage_events', 'infra_telephony_cdrs', 'infra_reconciliations', 'infra_audit_log'].includes(t)) {
      vals.splice(3, 0, obj.callId || null);
      cols.splice(3, 0, 'call_id');
    }
    if (t === 'infra_telephony_cdrs') {
      vals.splice(4, 0, obj.externalCallId || null);
      cols.splice(4, 0, 'external_call_id');
    }
    const placeholders = vals.map((_, i) => `$${i + 1}${cols[i] === 'data' ? '::jsonb' : ''}`).join(', ');
    const updates = cols
      .filter((c) => c !== 'id')
      .map((c) => `${c} = excluded.${c}`)
      .join(', ');
    await this.pool.query(
      `insert into ${t} (${cols.join(', ')})
       values (${placeholders})
       on conflict (id) do update set ${updates}`,
      vals
    );
    return obj;
  }

  async get(coll, id) {
    const r = await this.pool.query(`select data from ${this.table(coll)} where id = $1`, [id]);
    return r.rows[0]?.data || null;
  }

  async del(coll, id) {
    const r = await this.pool.query(`delete from ${this.table(coll)} where id = $1`, [id]);
    return r.rowCount > 0;
  }

  async list(coll, { limit = 100, where = {} } = {}) {
    const conds = [];
    const vals = [];
    if (where.assistantId) { vals.push(where.assistantId); conds.push(`assistant_id = $${vals.length}`); }
    if (where.tenantId) { vals.push(where.tenantId); conds.push(`tenant_id = $${vals.length}`); }
    if (where.callId && ['infra_usage_events', 'infra_telephony_cdrs', 'infra_reconciliations', 'infra_audit_log'].includes(this.table(coll))) {
      vals.push(where.callId);
      conds.push(`call_id = $${vals.length}`);
    }
    if (where.externalCallId && this.table(coll) === 'infra_telephony_cdrs') {
      vals.push(where.externalCallId);
      conds.push(`external_call_id = $${vals.length}`);
    } else if (where.externalCallId) {
      vals.push(where.externalCallId);
      conds.push(`data->>'externalCallId' = $${vals.length}`);
    }
    vals.push(limit);
    const whereSql = conds.length ? `where ${conds.join(' and ')}` : '';
    const r = await this.pool.query(
      `select data from ${this.table(coll)} ${whereSql} order by created_at desc limit $${vals.length}`,
      vals
    );
    return r.rows.map((x) => x.data);
  }
}
