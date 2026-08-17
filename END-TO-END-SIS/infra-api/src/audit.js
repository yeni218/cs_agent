import { createHash, randomUUID } from 'node:crypto';

export async function appendAuditEvent(store, { actor = 'system', action, entityType, entityId, metadata = {} }) {
  const previous = (await store.list('auditLog', { limit: 1 }))[0] || null;
  const event = {
    id: `aud_${randomUUID().slice(0, 12)}`,
    actor,
    action,
    entityType,
    entityId,
    metadata,
    previousHash: previous?.hash || null,
    createdAt: new Date().toISOString()
  };
  event.hash = hashEvent(event);
  await store.put('auditLog', event);
  return event;
}

export function hashEvent(event) {
  const stable = JSON.stringify({
    actor: event.actor,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    metadata: event.metadata,
    previousHash: event.previousHash,
    createdAt: event.createdAt
  });
  return createHash('sha256').update(stable).digest('hex');
}
