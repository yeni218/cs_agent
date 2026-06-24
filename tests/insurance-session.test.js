import test from 'node:test';
import assert from 'node:assert/strict';
import { createInsuranceToolExecutor } from '../packages/domain/insurance-tools.js';
import { InsuranceSession } from '../packages/domain/insurance-session.js';

function fakeClient(overrides = {}) {
  return {
    requestOtp: async () => ({ BasariliMi: true }),
    verifyOtp: async () => ({ BasariliMi: true }),
    getCustomer: async () => ({ BasariliMi: true, Ad: 'Test', Soyad: 'Müşteri' }),
    listQuotes: async () => ({ BasariliMi: true, Teklifler: [] }),
    getQuoteDetails: async () => ({ BasariliMi: true }),
    ...overrides
  };
}

test('sensitive tools are blocked until identity is verified', async () => {
  const exec = createInsuranceToolExecutor({ client: fakeClient(), sessionId: 's1' });

  const blocked = await exec.execute('list_quotes', {});
  assert.equal(blocked.success, false);
  assert.equal(blocked.requiresAuth, true);

  await exec.execute('request_otp', { kimlik_no: '11111111111' });
  await exec.execute('verify_otp', { kimlik_no: '11111111111', kod: '123456' });

  const allowed = await exec.execute('list_quotes', {});
  assert.equal(allowed.success, true);
  assert.equal(exec.verifiedKimlikNo, '11111111111');
});

test('transfer_to_agent surfaces a transfer action', async () => {
  const exec = createInsuranceToolExecutor({ client: fakeClient(), sessionId: 's2' });
  const result = await exec.execute('transfer_to_agent', { reason: 'poliçeleştirme' });
  assert.equal(result.action, 'transfer');
});

test('insurance session verifies identity then lists quotes via tool calls', async () => {
  let step = 0;
  const llm = {
    async complete() {
      step += 1;
      if (step === 1) {
        return {
          role: 'assistant',
          tool_calls: [
            { id: 't1', function: { name: 'verify_otp', arguments: JSON.stringify({ kimlik_no: '22222222222', kod: '999' }) } }
          ]
        };
      }
      if (step === 2) {
        return {
          role: 'assistant',
          tool_calls: [
            { id: 't2', function: { name: 'list_quotes', arguments: '{}' } }
          ]
        };
      }
      return { role: 'assistant', content: 'Aktif teklifiniz bulunmuyor.' };
    }
  };

  const session = new InsuranceSession({ sessionId: 's3', llm, client: fakeClient() });
  const result = await session.processUserText('tekliflerimi öğrenmek istiyorum');
  assert.equal(result.text, 'Aktif teklifiniz bulunmuyor.');
});
