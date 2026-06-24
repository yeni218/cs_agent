import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { ACTIVE_ORDER_STATUSES } from './status.js';
import { getItemById, getMenu, searchMenu } from './menu.js';
import {
  addItemToOrder,
  createOrder,
  removeItemFromOrder,
  setOrderDelivery,
  setOrderStatus,
  summarizeOrder
} from './orders.js';

export class OrderService extends EventEmitter {
  constructor({ store, menu }) {
    super();
    this.store = store;
    this.menu = menu;
  }

  async init() {
    await this.store.init();
  }

  getMenu(categoryId = null) {
    return getMenu(categoryId, this.menu);
  }

  searchMenu(query) {
    return searchMenu(query, this.menu);
  }

  async listOrders() {
    const orders = await this.store.listOrders();
    return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async listActiveOrders() {
    const orders = await this.listOrders();
    return orders.filter((order) => ACTIVE_ORDER_STATUSES.includes(order.status));
  }

  async getOrder(id) {
    return this.store.getOrder(id);
  }

  async getOrCreateOrder({ sessionId, callerNumber }) {
    const orders = await this.store.listOrders();
    const existing = orders.find(
      (order) => order.sessionId === sessionId && order.status === 'building'
    );
    if (existing) return existing;

    const order = createOrder({
      id: randomUUID().slice(0, 8).toUpperCase(),
      sessionId,
      callerNumber
    });
    await this.store.saveOrder(order);
    this.emit('order:created', order);
    return order;
  }

  async addItem(orderId, { itemId, quantity = 1, notes = '' }) {
    const order = await this.requireOrder(orderId);
    const menuItem = getItemById(itemId, this.menu);
    if (!menuItem) throw new Error(`"${itemId}" ürünü menüde bulunamadı.`);

    const updated = addItemToOrder(order, menuItem, { quantity, notes });
    await this.store.saveOrder(updated);
    this.emit('order:updated', updated);
    return updated;
  }

  async removeItem(orderId, itemId) {
    const order = await this.requireOrder(orderId);
    const updated = removeItemFromOrder(order, itemId);
    await this.store.saveOrder(updated);
    this.emit('order:updated', updated);
    return updated;
  }

  async updateDelivery(orderId, delivery) {
    const order = await this.requireOrder(orderId);
    const updated = setOrderDelivery(order, delivery);
    await this.store.saveOrder(updated);
    this.emit('order:updated', updated);
    return updated;
  }

  async confirmOrder(orderId) {
    const order = await this.requireOrder(orderId);
    if (order.items.length === 0) throw new Error('Siparişte ürün bulunmuyor.');
    const updated = setOrderStatus(order, 'confirmed');
    await this.store.saveOrder(updated);
    this.emit('order:confirmed', updated);
    return updated;
  }

  async updateStatus(orderId, status) {
    const order = await this.requireOrder(orderId);
    const updated = setOrderStatus(order, status);
    await this.store.saveOrder(updated);
    this.emit('order:statusChanged', updated);
    return updated;
  }

  async summarize(orderId) {
    const order = await this.requireOrder(orderId);
    return summarizeOrder(order);
  }

  async requireOrder(id) {
    const order = await this.store.getOrder(id);
    if (!order) throw new Error('Sipariş bulunamadı.');
    return order;
  }
}
