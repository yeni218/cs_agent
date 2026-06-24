export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_menu',
      description: 'Restoran menüsünü getirir. İsteğe bağlı kategori ID alır.',
      parameters: {
        type: 'object',
        properties: {
          category_id: {
            type: 'string',
            enum: ['baslangiclar', 'ana_yemekler', 'pide_lahmacun', 'icecekler', 'tatlilar']
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_menu',
      description: 'Menüde ürün adı veya açıklamaya göre arama yapar.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_to_order',
      description: 'Mevcut siparişe ürün ekler.',
      parameters: {
        type: 'object',
        properties: {
          item_id: { type: 'string' },
          quantity: { type: 'integer', minimum: 1, maximum: 20 },
          notes: { type: 'string' }
        },
        required: ['item_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remove_from_order',
      description: 'Mevcut siparişten ürün çıkarır.',
      parameters: {
        type: 'object',
        properties: {
          item_id: { type: 'string' }
        },
        required: ['item_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_order_summary',
      description: 'Mevcut siparişin ürünlerini, toplamını ve durumunu getirir.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'confirm_order',
      description: 'Müşteri açıkça onay verdikten sonra siparişi onaylar.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'transfer_to_human',
      description: 'Müşteriyi insan operatöre aktarır.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' }
        },
        required: ['reason']
      }
    }
  }
];

export function createToolExecutor({ orderClient, sessionId, callerNumber }) {
  let orderId = null;

  async function ensureOrder() {
    if (orderId) return orderId;
    const order = await orderClient.getOrCreateOrder({ sessionId, callerNumber });
    orderId = order.id;
    return orderId;
  }

  return {
    get orderId() {
      return orderId;
    },

    async execute(toolName, args = {}) {
      switch (toolName) {
        case 'get_menu':
          return orderClient.getMenu(args.category_id || null);

        case 'search_menu':
          return orderClient.searchMenu(args.query || '');

        case 'add_to_order': {
          const id = await ensureOrder();
          const order = await orderClient.addItem(id, {
            itemId: args.item_id,
            quantity: args.quantity || 1,
            notes: args.notes || ''
          });
          return {
            success: true,
            orderId: order.id,
            total: `${order.total} TL`,
            message: 'Ürün siparişe eklendi.'
          };
        }

        case 'remove_from_order': {
          const id = await ensureOrder();
          const order = await orderClient.removeItem(id, args.item_id);
          return {
            success: true,
            orderId: order.id,
            total: `${order.total} TL`,
            message: 'Ürün siparişten çıkarıldı.'
          };
        }

        case 'get_order_summary': {
          const id = await ensureOrder();
          return orderClient.getOrderSummary(id);
        }

        case 'confirm_order': {
          const id = await ensureOrder();
          const order = await orderClient.confirmOrder(id);
          return {
            success: true,
            orderId: order.id,
            total: `${order.total} TL`,
            estimatedTime: '25-35 dakika',
            message: `Sipariş onaylandı. Sipariş numarası ${order.id}.`
          };
        }

        case 'transfer_to_human':
          return {
            action: 'transfer',
            reason: args.reason || 'Müşteri insan operatör istedi.',
            message: 'Müşteri insan operatöre aktarılıyor.'
          };

        default:
          return { error: `Bilinmeyen araç: ${toolName}` };
      }
    }
  };
}
