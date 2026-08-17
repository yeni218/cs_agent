import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adminOverview,
  adminTenants,
  customerOverview,
  mapAdminCall,
  mapCustomerCall
} from '../END-TO-END-SIS/customer/src/api/shape.js';

test('customer call mapper strips internal cost fields', () => {
  const call = mapCustomerCall({
    id: 'call_1',
    tenant_id: 't_1',
    assistant_id: 'asst_1',
    outcome: 'order',
    order_amount: 420,
    duration_sec: 120,
    cost: 99,
    cost_breakdown: { tts: 42 },
    messages: [{ role: 'bot', message: 'Merhaba' }, { role: 'user', message: 'iki pizza' }]
  });

  assert.equal(call.orderAmount, 420);
  assert.equal(call.transcript.length, 2);
  assert.equal(Object.hasOwn(call, 'cost'), false);
  assert.equal(Object.hasOwn(call, 'costBreakdown'), false);
});

test('admin call mapper keeps cost fields', () => {
  const call = mapAdminCall({
    id: 'call_1',
    tenant_id: 't_1',
    cost: 0.123,
    cost_breakdown: { stt: 0.01, llm: 0.02, tts: 0.03 }
  });

  assert.equal(call.cost, 0.123);
  assert.deepEqual(call.costBreakdown, { stt: 0.01, llm: 0.02, tts: 0.03 });
});

test('customer overview computes revenue without cost inputs', () => {
  const overview = customerOverview(
    { id: 't_1', name: 'Lezzet', phone_number: '+90', plan: { name: 'Pro', includedMinutes: 100 } },
    [
      { outcome: 'order', answered: true, orderAmount: 420, durationSec: 120, startedAt: '2026-08-17T10:00:00Z' },
      { outcome: 'faq', answered: true, orderAmount: 0, durationSec: 60, startedAt: '2026-08-17T11:00:00Z' },
      { outcome: 'missed', answered: false, orderAmount: 0, durationSec: 30, startedAt: '2026-08-17T12:00:00Z' }
    ]
  );

  assert.equal(overview.revenue, 420);
  assert.equal(overview.orders, 1);
  assert.equal(overview.missedCalls, 1);
  assert.equal(overview.conversionRate, 0.5);
  assert.equal(overview.lostRevenueEstimate, 420);
  assert.equal(overview.outcomeBreakdown.length, 3);
  assert.equal(overview.volumeByHour.length, 3);
  assert.equal(overview.usage.minutesUsed, 4);
  assert.equal(Object.hasOwn(overview, 'cost'), false);
});

test('admin overview computes tenant margin from internal costs', () => {
  const tenants = [{ id: 't_1', name: 'Lezzet', status: 'active', plan: { name: 'Pro', monthlyPrice: 299 } }];
  const calls = [
    { tenantId: 't_1', cost: 0.02, durationSec: 60 },
    { tenantId: 't_1', cost: 0.03, durationSec: 60 }
  ];

  const rows = adminTenants(tenants, calls);
  const overview = adminOverview(tenants, calls);

  assert.equal(rows[0].cogs, 0.05);
  assert.equal(rows[0].margin, 298.95);
  assert.equal(overview.totalCogs, 0.05);
});
