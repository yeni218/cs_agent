// Postgres-backed store — works with Supabase, Neon, or self-hosted Postgres via
// DATABASE_URL. `pg` is lazy-imported so DB=memory needs no dependency. Objects
// are stored whole as jsonb `data`, with a few extracted columns for filtering.
const TABLE = { assistants: 'assistants', calls: 'calls', phoneNumbers: 'phone_numbers' };

const SCHEMA = `
create table if not exists assistants (
  id text primary key,
  tenant_id text,
  data jsonb not null,
  created_at timestamptz default now()
);
create table if not exists calls (
  id text primary key,
  assistant_id text,
  tenant_id text,
  data jsonb not null,
  created_at timestamptz default now()
);
create table if not exists phone_numbers (
  id text primary key,
  assistant_id text,
  tenant_id text,
  data jsonb not null,
  created_at timestamptz default now()
);
create index if not exists calls_assistant_idx on calls (assistant_id);
create index if not exists calls_tenant_idx on calls (tenant_id);
create index if not exists assistants_tenant_idx on assistants (tenant_id);
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
    await this.pool.query(
      `insert into ${t} (id, assistant_id, tenant_id, data)
       values ($1, $2, $3, $4::jsonb)
       on conflict (id) do update set assistant_id = excluded.assistant_id,
                                       tenant_id = excluded.tenant_id,
                                       data = excluded.data`,
      [obj.id, obj.assistantId || null, obj.tenantId || null, JSON.stringify(obj)]
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
    vals.push(limit);
    const whereSql = conds.length ? `where ${conds.join(' and ')}` : '';
    const r = await this.pool.query(
      `select data from ${this.table(coll)} ${whereSql} order by created_at desc limit $${vals.length}`,
      vals
    );
    return r.rows.map((x) => x.data);
  }
}
