import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { DEFAULT_MENU } from '../packages/domain/menu.js';
import { OrderService } from '../packages/domain/order-service.js';
import { FileOrderStore } from '../packages/storage/file-order-store.js';

test('creates, updates, and persists an order', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'afiyet-orders-'));
  try {
    const service = new OrderService({
      store: new FileOrderStore({ dataDir }),
      menu: DEFAULT_MENU
    });
    await service.init();

    const order = await service.getOrCreateOrder({
      sessionId: 'call-1',
      callerNumber: '+905551234567'
    });

    const withItem = await service.addItem(order.id, {
      itemId: 'iskender',
      quantity: 2,
      notes: 'yoğurt ayrı'
    });

    assert.equal(withItem.items.length, 1);
    assert.equal(withItem.total, 500);

    const confirmed = await service.confirmOrder(order.id);
    assert.equal(confirmed.status, 'confirmed');

    const reloaded = new OrderService({
      store: new FileOrderStore({ dataDir }),
      menu: DEFAULT_MENU
    });
    await reloaded.init();

    const orders = await reloaded.listOrders();
    assert.equal(orders.length, 1);
    assert.equal(orders[0].status, 'confirmed');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('rejects invalid status transitions', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'afiyet-orders-'));
  try {
    const service = new OrderService({
      store: new FileOrderStore({ dataDir }),
      menu: DEFAULT_MENU
    });
    await service.init();

    const order = await service.getOrCreateOrder({ sessionId: 'call-2' });

    await assert.rejects(
      () => service.updateStatus(order.id, 'ready'),
      /building durumundan ready durumuna geçilemez/
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
