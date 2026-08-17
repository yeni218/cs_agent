import assert from 'node:assert/strict';
import test from 'node:test';
import { billableSeconds, computeCost, estimateCostPerMinute } from '../END-TO-END-SIS/infra-api/src/pricing.js';
import { costReport, normalizeVerimorCdr, reconcileCallCost } from '../END-TO-END-SIS/infra-api/src/telephony.js';

test('cheap route default stays below the 0.02 USD per minute target', () => {
  const estimate = estimateCostPerMinute();

  assert.equal(estimate.targetStatus, 'ok');
  assert.equal(estimate.targetPerMinute, 0.02);
  assert.ok(estimate.perMinute > 0.01);
  assert.ok(estimate.perMinute < 0.02);
  assert.ok(estimate.stt > 0);
  assert.ok(estimate.transport > 0);
});

test('pricing rounds telephony duration to the configured Verimor billing increment', () => {
  assert.equal(billableSeconds(61, 6), 66);
  assert.equal(billableSeconds(60, 6), 60);

  const cost = computeCost({
    audioSec: 61,
    promptTokens: 800,
    completionTokens: 150,
    ttsChars: 400,
    durationSec: 61
  });

  assert.equal(cost.billableTransportSeconds, 66);
  assert.equal(cost.audioSeconds, 61);
  assert.equal(cost.targetStatus, 'ok');
});

test('Verimor overage CDR pushes reconciliation over target when transport alone is expensive', () => {
  const estimated = computeCost({
    audioSec: 60,
    promptTokens: 800,
    completionTokens: 150,
    ttsChars: 400,
    durationSec: 60
  });
  const cdr = normalizeVerimorCdr({
    id: 'cdr_1',
    callId: 'call_1',
    tenantId: 't_1',
    durationSec: 60,
    billedSec: 60,
    costTry: 0.99,
    exchangeRate: 47.52
  });
  const reconciliation = reconcileCallCost({ id: 'call_1', tenantId: 't_1', cost: estimated.total, costBreakdown: estimated }, cdr);

  assert.equal(cdr.costUsd, 0.99 / 47.52);
  assert.equal(reconciliation.status, 'review');
  assert.ok(reconciliation.actualCost > 0.02);
  assert.equal(reconciliation.breakdown.targetStatus, 'over_target');
});

test('cost report exposes blended cost per minute and over-target count', () => {
  const report = costReport([
    { id: 'call_1', durationSec: 60, cost: 0.015, costBreakdown: { targetStatus: 'ok' } },
    { id: 'call_2', durationSec: 60, cost: 0.03, costBreakdown: { targetStatus: 'over_target' } }
  ]);

  assert.equal(report.calls, 2);
  assert.equal(report.minutes, 2);
  assert.equal(report.cost, 0.045);
  assert.equal(report.costPerMinute, 0.0225);
  assert.equal(report.overTarget, 1);
});
