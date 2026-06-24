import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyIntent } from '../packages/domain/intent-classifier.js';
import { nextMissingSlot, isQuoteReady } from '../packages/domain/quote-flow.js';
import { DialogueOrchestrator } from '../packages/domain/dialogue-orchestrator.js';
import { InsuranceSession } from '../packages/domain/insurance-session.js';

test('intent classifier routes safety intents before quotes', () => {
  assert.equal(classifyIntent('poliçeyi satın almak istiyorum').intent, 'binding_payment');
  assert.equal(classifyIntent('ödeme yapmak istiyorum kart numaram').intent, 'binding_payment');
  assert.equal(classifyIntent('beni bir temsilciye bağlar mısın').intent, 'human');
  assert.equal(classifyIntent('kaza yaptım hasar var').intent, 'complaint');
  assert.equal(classifyIntent('kasko teklifi almak istiyorum').intent, 'new_quote');
  assert.equal(classifyIntent('kasko teklifi almak istiyorum').branch, 'kasko');
});

test('quote flow tracks the next missing slot', () => {
  assert.equal(nextMissingSlot('kasko', {}).key, 'kimlikNo');
  assert.equal(nextMissingSlot('kasko', { kimlikNo: '111' }).key, 'plaka');
  assert.equal(nextMissingSlot('kasko', { kimlikNo: '111', plaka: '34ABC' }), null);
  assert.equal(isQuoteReady('kasko', { kimlikNo: '111', plaka: '34ABC' }), true);
  assert.equal(isQuoteReady('seyahat', { kimlikNo: '111' }), false);
});

test('orchestrator hands off on binding without consulting the LLM', () => {
  const orch = new DialogueOrchestrator();
  const directive = orch.inspect('hemen poliçeleştir ve öde');
  assert.equal(directive.type, 'handoff');
  assert.equal(directive.reason, 'binding_payment');
  assert.equal(orch.phase, 'handoff');
});

test('orchestrator drives deterministic quote questions', () => {
  const orch = new DialogueOrchestrator();
  orch.inspect('trafik sigortası teklifi istiyorum');
  assert.equal(orch.branch, 'trafik');
  assert.equal(orch.nextQuoteQuestion(), 'TC Kimlik Numaranızı alabilir miyim?');
  orch.recordSlot('kimlikNo', '11111111111');
  assert.match(orch.nextQuoteQuestion(), /plaka/i);
});

test('insurance session short-circuits binding intent to a human handoff', async () => {
  let llmCalled = false;
  const llm = { async complete() { llmCalled = true; return { role: 'assistant', content: 'x' }; } };
  const session = new InsuranceSession({ sessionId: 's', llm, client: {} });

  const result = await session.processUserText('poliçeyi satın almak ve ödemek istiyorum');
  assert.equal(result.transfer, true);
  assert.equal(result.reason, 'binding_payment');
  assert.equal(llmCalled, false); // deterministic path never touched the model
});
