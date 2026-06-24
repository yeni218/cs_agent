export class OrderApiClient {
  constructor({
    baseUrl = process.env.ORDER_API_BASE_URL || 'http://localhost:8080',
    token = process.env.ORDER_API_TOKEN || process.env.DASHBOARD_API_TOKEN
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = normalizeLocalToken(token);
  }

  getMenu(categoryId = null) {
    const query = categoryId ? `?category=${encodeURIComponent(categoryId)}` : '';
    return this.request(`/api/menu${query}`);
  }

  searchMenu(query) {
    return this.request(`/api/menu/search?q=${encodeURIComponent(query)}`);
  }

  getOrCreateOrder(payload) {
    return this.request('/api/orders', { method: 'POST', body: payload });
  }

  addItem(orderId, payload) {
    return this.request(`/api/orders/${orderId}/items`, { method: 'POST', body: payload });
  }

  removeItem(orderId, itemId) {
    return this.request(`/api/orders/${orderId}/items/${itemId}`, { method: 'DELETE' });
  }

  getOrderSummary(orderId) {
    return this.request(`/api/orders/${orderId}/summary`);
  }

  confirmOrder(orderId) {
    return this.request(`/api/orders/${orderId}/confirm`, { method: 'POST' });
  }

  async request(path, { method = 'GET', body } = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Order API failed with ${response.status}`);
    }
    return payload;
  }
}

function normalizeLocalToken(value) {
  const token = String(value || '').trim();
  if (!token || token === 'change-me-before-production') return '';
  return token;
}
