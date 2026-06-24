import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderStore } from '../packages/storage/order-store-factory.js';
import { FileOrderStore } from '../packages/storage/file-order-store.js';
import { PostgresOrderStore } from '../packages/storage/postgres-order-store.js';

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
}

test('defaults to the file store', async () => {
  await withEnv({ ORDER_STORE: undefined, DATABASE_URL: undefined }, async () => {
    const store = await createOrderStore();
    assert.ok(store instanceof FileOrderStore);
  });
});

test('selects postgres when configured with a DATABASE_URL', async () => {
  await withEnv(
    { ORDER_STORE: 'postgres', DATABASE_URL: 'postgres://user:pass@localhost:5432/db' },
    async () => {
      // Constructs the store but does not connect (init() is what connects).
      const store = await createOrderStore();
      assert.ok(store instanceof PostgresOrderStore);
    }
  );
});

test('falls back to file store when postgres is selected without DATABASE_URL', async () => {
  await withEnv({ ORDER_STORE: 'postgres', DATABASE_URL: undefined }, async () => {
    const store = await createOrderStore();
    assert.ok(store instanceof FileOrderStore);
  });
});

test('postgres store rejects an unsafe table name', () => {
  assert.throws(
    () => new PostgresOrderStore({ connectionString: 'postgres://x', table: 'orders; drop table' }),
    /Invalid table name/
  );
});

test('postgres store requires a connection string', () => {
  assert.throws(() => new PostgresOrderStore({}), /requires a connectionString/);
});
