// Postgres-backed order store. Same interface as FileOrderStore
// (init/listOrders/getOrder/saveOrder) so it drops in behind OrderService.
//
// `pg` is an optional dependency, lazy-imported on init (mirrors how
// silero-vad.js treats onnxruntime-node) so the file backend stays the
// zero-dependency default. Orders are stored as a single jsonb column keyed by
// id; a bigserial `seq` preserves insertion order for listOrders().
export class PostgresOrderStore {
  constructor({ connectionString, table = 'orders', ssl = false } = {}) {
    if (!connectionString) {
      throw new Error('PostgresOrderStore requires a connectionString (DATABASE_URL)');
    }
    // Guard against SQL injection via a misconfigured table name.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
      throw new Error(`Invalid table name: ${table}`);
    }
    this.connectionString = connectionString;
    this.table = table;
    this.ssl = ssl;
    this.pool = null;
  }

  async init() {
    if (this.pool) return;
    let Pg;
    try {
      ({ default: Pg } = await import('pg'));
    } catch {
      throw new Error('PostgresOrderStore requires the "pg" package: npm install pg');
    }
    this.pool = new Pg.Pool({
      connectionString: this.connectionString,
      ssl: this.ssl ? { rejectUnauthorized: false } : undefined
    });
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${this.table} (
        id text PRIMARY KEY,
        seq bigserial,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`
    );
  }

  async listOrders() {
    const { rows } = await this.pool.query(
      `SELECT data FROM ${this.table} ORDER BY seq ASC`
    );
    return rows.map((row) => row.data);
  }

  async getOrder(id) {
    const { rows } = await this.pool.query(
      `SELECT data FROM ${this.table} WHERE id = $1`,
      [id]
    );
    return rows.length ? rows[0].data : null;
  }

  async saveOrder(order) {
    await this.pool.query(
      `INSERT INTO ${this.table} (id, data, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [order.id, order]
    );
    return clone(order);
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
