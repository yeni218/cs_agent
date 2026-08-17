import { randomUUID } from 'node:crypto';
import { computeCost, PRICING } from './pricing.js';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function normalizeVerimorCdr(body = {}) {
  const durationSec = num(body.durationSec ?? body.duration_sec ?? body.duration);
  const billedSec = num(body.billedSec ?? body.billed_sec, durationSec);
  const usdTry = num(body.usdTry ?? body.exchangeRate ?? process.env.USD_TRY, 47.52);
  const costTry = Number.isFinite(Number(body.costTry ?? body.cost_try))
    ? Number(body.costTry ?? body.cost_try)
    : billedSec * 60 * PRICING.transportPerSec * usdTry / 60;
  return {
    id: String(body.id || body.cdrId || body.callId || body.externalCallId || `cdr_${randomUUID().slice(0, 12)}`),
    provider: 'verimor',
    callId: body.callId || null,
    externalCallId: body.externalCallId || body.uuid || body.uniqueid || null,
    tenantId: body.tenantId || body.tenant_id || null,
    assistantId: body.assistantId || body.assistant_id || null,
    direction: body.direction || 'inbound',
    from: body.from || body.caller || body.caller_id || null,
    to: body.to || body.called || body.did || null,
    durationSec,
    billedSec,
    costTry,
    exchangeRate: usdTry,
    costUsd: num(body.costUsd ?? body.cost_usd, costTry / usdTry),
    raw: body,
    createdAt: new Date().toISOString()
  };
}

export function reconcileCallCost(call, cdr) {
  const previous = call.costBreakdown || {};
  const providerUsage = {
    sttUsd: previous.stt,
    llmUsd: previous.llm,
    ttsUsd: previous.tts,
    mediaUsd: previous.media,
    platformUsd: previous.platform ?? previous.vapi,
    transportUsd: cdr.costUsd
  };
  const actual = computeCost({
    audioSec: previous.audioSeconds ?? cdr.durationSec,
    promptTokens: previous.llmPromptTokens || 0,
    completionTokens: previous.llmCompletionTokens || 0,
    ttsChars: previous.ttsCharacters || 0,
    durationSec: cdr.durationSec,
    providerUsage
  });
  const expected = num(call.cost);
  const delta = +(actual.total - expected).toFixed(6);
  return {
    id: `rec_${randomUUID().slice(0, 12)}`,
    callId: call.id,
    tenantId: call.tenantId || cdr.tenantId || null,
    expectedCost: expected,
    actualCost: actual.total,
    delta,
    status: Math.abs(delta) <= 0.002 ? 'ok' : 'review',
    breakdown: actual,
    cdrId: cdr.id,
    createdAt: new Date().toISOString()
  };
}

export function costReport(calls = []) {
  const totals = calls.reduce((acc, call) => {
    const durationSec = num(call.durationSec);
    const cost = num(call.cost);
    acc.calls += 1;
    acc.durationSec += durationSec;
    acc.cost += cost;
    if (call.costBreakdown?.targetStatus === 'over_target') acc.overTarget += 1;
    return acc;
  }, { calls: 0, durationSec: 0, cost: 0, overTarget: 0 });
  return {
    ...totals,
    minutes: +(totals.durationSec / 60).toFixed(2),
    cost: +totals.cost.toFixed(6),
    costPerMinute: totals.durationSec > 0 ? +(totals.cost / (totals.durationSec / 60)).toFixed(6) : 0,
    targetPerMinute: PRICING.targetPerMin
  };
}
