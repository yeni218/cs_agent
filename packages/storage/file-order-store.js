import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';

export class FileOrderStore {
  constructor({ dataDir = './data', fileName = 'orders.json' } = {}) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, fileName);
    this.orders = new Map();
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.orders = new Map((parsed.orders || []).map((order) => [order.id, order]));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.flush();
    }
  }

  async listOrders() {
    return Array.from(this.orders.values()).map(clone);
  }

  async getOrder(id) {
    const order = this.orders.get(id);
    return order ? clone(order) : null;
  }

  async saveOrder(order) {
    this.orders.set(order.id, clone(order));
    await this.flush();
    return clone(order);
  }

  async flush() {
    this.writeQueue = this.writeQueue.then(async () => {
      const tmpPath = `${this.filePath}.tmp`;
      const payload = JSON.stringify(
        {
          version: 1,
          updatedAt: new Date().toISOString(),
          orders: Array.from(this.orders.values())
        },
        null,
        2
      );
      await writeFile(tmpPath, payload);
      await rename(tmpPath, this.filePath);
    });

    return this.writeQueue;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
