export const ORDER_STATUSES = Object.freeze([
  'building',
  'confirmed',
  'preparing',
  'ready',
  'completed',
  'cancelled'
]);

export const ACTIVE_ORDER_STATUSES = Object.freeze([
  'building',
  'confirmed',
  'preparing',
  'ready'
]);

const TRANSITIONS = Object.freeze({
  building: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: []
});

export function isValidStatus(status) {
  return ORDER_STATUSES.includes(status);
}

export function canTransitionStatus(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

export function assertValidStatusTransition(from, to) {
  if (!isValidStatus(to)) {
    throw new Error(`Geçersiz durum: ${to}`);
  }
  if (from === to) return;
  if (!canTransitionStatus(from, to)) {
    throw new Error(`${from} durumundan ${to} durumuna geçilemez.`);
  }
}
