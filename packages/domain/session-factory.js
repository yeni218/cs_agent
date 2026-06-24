import { AgentSession } from './agent-session.js';
import { InsuranceSession } from './insurance-session.js';
import { AuditLog } from './audit-log.js';
import { MockPoliservisClient } from '../providers/mock-poliservis-client.js';
import { PoliservisClient } from '../providers/poliservis-client.js';

// Shared, hash-chained audit log across calls (single writer avoids chain races).
let sharedAudit = null;
function getAuditLog() {
  if (process.env.AUDIT_LOG_ENABLED === 'false') return null;
  if (!sharedAudit) sharedAudit = new AuditLog();
  return sharedAudit;
}

// AGENT_DOMAIN selects the product:  insurance (default) | restaurant
// POLISERVIS_MODE selects the data source for insurance:  mock (default) | live
export function getAgentDomain() {
  return (process.env.AGENT_DOMAIN || 'insurance').toLowerCase();
}

export function createInsuranceClient({ logger = null } = {}) {
  if ((process.env.POLISERVIS_MODE || 'mock').toLowerCase() === 'live') {
    return new PoliservisClient();
  }
  return new MockPoliservisClient({ logger });
}

// Builds the right agent session for the active domain.
// `orderClient` is only used by the restaurant domain.
export function createAgentSession({ sessionId, callerNumber, llm, orderClient = null, logger = null }) {
  if (getAgentDomain() === 'restaurant') {
    return new AgentSession({ sessionId, callerNumber, llm, orderClient });
  }
  return new InsuranceSession({
    sessionId,
    callerNumber,
    llm,
    client: createInsuranceClient({ logger }),
    audit: getAuditLog()
  });
}
