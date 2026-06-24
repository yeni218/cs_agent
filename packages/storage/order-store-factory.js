import { FileOrderStore } from './file-order-store.js';

// Selects the order store backend, mirroring the TTS/turn-detector factories.
// Default is the file store (zero dependencies, good for local/dev). Postgres
// is opt-in for production and falls back to the file store if it is requested
// without a DATABASE_URL, so a misconfiguration degrades instead of crashing.
//
//   ORDER_STORE=file       (default)
//   ORDER_STORE=postgres   (requires DATABASE_URL + the "pg" package)
export async function createOrderStore({ logger = null } = {}) {
  const backend = (process.env.ORDER_STORE || 'file').toLowerCase();

  if (backend === 'postgres') {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      logger?.warn?.(
        'ORDER_STORE=postgres but DATABASE_URL is unset; falling back to file store'
      );
    } else {
      const { PostgresOrderStore } = await import('./postgres-order-store.js');
      logger?.info?.('Order store: postgres');
      return new PostgresOrderStore({
        connectionString,
        table: process.env.ORDER_STORE_TABLE || 'orders',
        ssl: process.env.DATABASE_SSL === 'true'
      });
    }
  }

  logger?.info?.('Order store: file');
  return new FileOrderStore({ dataDir: process.env.DATA_DIR || './data' });
}
