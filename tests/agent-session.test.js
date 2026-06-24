import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { AgentSession } from '../packages/domain/agent-session.js';
import { DEFAULT_MENU } from '../packages/domain/menu.js';
import { OrderService } from '../packages/domain/order-service.js';
import { FileOrderStore } from '../packages/storage/file-order-store.js';

test('agent session executes order tools through the order client', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'afiyet-agent-'));

  try {
    const service = new OrderService({
      store: new FileOrderStore({ dataDir }),
      menu: DEFAULT_MENU
    });
    await service.init();

    let calls = 0;
    const llm = {
      async complete() {
        calls += 1;
        if (calls === 1) {
          return {
            role: 'assistant',
            tool_calls: [
              {
                id: 'tool-1',
                function: {
                  name: 'add_to_order',
                  arguments: JSON.stringify({ item_id: 'ayran', quantity: 2 })
                }
              }
            ]
          };
        }
        return { role: 'assistant', content: '2 adet ayran ekledim.' };
      }
    };

    const session = new AgentSession({
      sessionId: 'browser-test',
      llm,
      orderClient: {
        getMenu: (categoryId) => service.getMenu(categoryId),
        searchMenu: (query) => service.searchMenu(query),
        getOrCreateOrder: (payload) => service.getOrCreateOrder(payload),
        addItem: (orderId, payload) => service.addItem(orderId, payload),
        removeItem: (orderId, itemId) => service.removeItem(orderId, itemId),
        getOrderSummary: (orderId) => service.summarize(orderId),
        confirmOrder: (orderId) => service.confirmOrder(orderId)
      }
    });

    const result = await session.processUserText('iki ayran istiyorum');
    const orders = await service.listOrders();

    assert.equal(result.text, '2 adet ayran ekledim.');
    assert.equal(orders.length, 1);
    assert.equal(orders[0].items[0].itemId, 'ayran');
    assert.equal(orders[0].items[0].quantity, 2);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
