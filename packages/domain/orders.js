import { assertValidStatusTransition } from './status.js';

export function createOrder({ id, sessionId, callerNumber = 'unknown', now = new Date() }) {
  const timestamp = now.toISOString();
  return {
    id,
    sessionId,
    callerNumber,
    items: [],
    status: 'building',
    total: 0,
    notes: '',
    delivery: {
      mode: 'pickup',
      address: '',
      phone: callerNumber === 'unknown' ? '' : callerNumber
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function addItemToOrder(order, menuItem, { quantity = 1, notes = '' } = {}) {
  assertBuilding(order);

  const cleanQuantity = Number.parseInt(quantity, 10);
  if (!Number.isFinite(cleanQuantity) || cleanQuantity < 1 || cleanQuantity > 20) {
    throw new Error('Adet 1 ile 20 arasında olmalı.');
  }
  if (!menuItem?.available) {
    throw new Error(`${menuItem?.name || 'Ürün'} şu anda mevcut değil.`);
  }

  const next = cloneOrder(order);
  const existing = next.items.find((item) => item.itemId === menuItem.id && item.notes === notes);

  if (existing) {
    existing.quantity += cleanQuantity;
  } else {
    next.items.push({
      itemId: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      quantity: cleanQuantity,
      notes
    });
  }

  return recalculate(next);
}

export function removeItemFromOrder(order, itemId) {
  assertBuilding(order);
  const next = cloneOrder(order);
  const index = next.items.findIndex((item) => item.itemId === itemId);
  if (index === -1) throw new Error('Bu ürün siparişte bulunmuyor.');
  next.items.splice(index, 1);
  return recalculate(next);
}

export function setOrderStatus(order, status, now = new Date()) {
  assertValidStatusTransition(order.status, status);
  return {
    ...cloneOrder(order),
    status,
    updatedAt: now.toISOString()
  };
}

export function setOrderDelivery(order, delivery, now = new Date()) {
  const next = cloneOrder(order);
  next.delivery = {
    ...next.delivery,
    ...delivery
  };
  next.updatedAt = now.toISOString();
  return next;
}

export function summarizeOrder(order) {
  if (!order || order.items.length === 0) {
    return { message: 'Siparişte henüz ürün bulunmuyor.' };
  }

  return {
    orderId: order.id,
    status: order.status,
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: `${item.price} TL`,
      subtotal: `${item.price * item.quantity} TL`,
      notes: item.notes || undefined
    })),
    total: `${order.total} TL`,
    delivery: order.delivery
  };
}

function assertBuilding(order) {
  if (!order) throw new Error('Sipariş bulunamadı.');
  if (order.status !== 'building') {
    throw new Error('Bu sipariş artık değiştirilemez.');
  }
}

function recalculate(order, now = new Date()) {
  order.total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  order.updatedAt = now.toISOString();
  return order;
}

function cloneOrder(order) {
  return JSON.parse(JSON.stringify(order));
}
