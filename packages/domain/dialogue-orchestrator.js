import { classifyIntent } from './intent-classifier.js';
import { nextMissingSlot, isQuoteReady } from './quote-flow.js';

// Deterministic dialogue layer in front of the LLM.
//
// Its job is NOT to phrase replies (the LLM does that) but to make the
// control-flow decisions that must be reliable:
//   - binding/payment   -> always hand off to a licensed human (compliance)
//   - explicit human ask -> hand off
//   - complaint/claim    -> hand off
//   - quote slot-filling -> know the next required field deterministically
//
// Returns a directive the session acts on before/around the LLM loop.
export class DialogueOrchestrator {
  constructor() {
    this.phase = 'greeting'; // greeting -> discovery -> quoting -> presenting -> handoff
    this.intent = null;
    this.branch = null;
    this.slots = {};
    this.authenticated = false;
  }

  setAuthenticated(value) {
    this.authenticated = Boolean(value);
  }

  recordSlot(key, value) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      this.slots[key] = value;
    }
  }

  // Inspect a user turn and decide how the session should proceed.
  // type: 'handoff' (deterministic reply, skip LLM) | 'proceed' (run LLM)
  inspect(userText) {
    const { intent, branch } = classifyIntent(userText);
    this.intent = intent;
    if (branch) this.branch = branch;

    if (intent === 'binding_payment') {
      this.phase = 'handoff';
      return {
        type: 'handoff',
        reason: 'binding_payment',
        message:
          'Poliçeleştirme ve ödeme işlemleri yalnızca lisanslı temsilcimiz tarafından yapılabiliyor. Sizi hemen bir temsilcimize aktarıyorum.'
      };
    }

    if (intent === 'human') {
      this.phase = 'handoff';
      return {
        type: 'handoff',
        reason: 'human_request',
        message: 'Tabii, sizi bir müşteri temsilcimize aktarıyorum. Lütfen hatta kalın.'
      };
    }

    if (intent === 'complaint') {
      this.phase = 'handoff';
      return {
        type: 'handoff',
        reason: 'complaint',
        message:
          'Yaşadığınız durumla ilgili size en iyi şekilde yardımcı olabilmemiz için sizi yetkili bir temsilcimize aktarıyorum.'
      };
    }

    if (intent === 'new_quote' || this.phase === 'quoting') {
      this.phase = 'quoting';
    }

    return { type: 'proceed', intent, branch: this.branch };
  }

  // Deterministic next question for the active quote branch (helps the prompt
  // stay on-track), or null when ready / not quoting.
  nextQuoteQuestion() {
    if (this.phase !== 'quoting' || !this.branch) return null;
    const slot = nextMissingSlot(this.branch, this.slots);
    return slot ? slot.soru : null;
  }

  quoteReady() {
    return this.branch ? isQuoteReady(this.branch, this.slots) : false;
  }
}
