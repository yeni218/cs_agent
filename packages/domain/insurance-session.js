import { INSURANCE_TOOL_DEFINITIONS, createInsuranceToolExecutor } from './insurance-tools.js';
import { INSURANCE_SYSTEM_PROMPT } from './insurance-prompts.js';
import { DialogueOrchestrator } from './dialogue-orchestrator.js';
import { takeSpeechChunks } from '../voice-core/speech-chunker.js';

// Insurance equivalent of AgentSession. Same conversation loop, but wired to
// the PoliServis tools and prompt. The deterministic dialogue orchestrator
// (roadmap step 2) will wrap this; for now the LLM drives tool selection.
export class InsuranceSession {
  constructor({ sessionId, callerNumber = 'browser', llm, client, audit = null }) {
    this.sessionId = sessionId;
    this.callerNumber = callerNumber;
    this.llm = llm;
    this.audit = audit; // optional AuditLog; no-op when null
    this.toolExecutor = createInsuranceToolExecutor({ client, sessionId, callerNumber });
    this.orchestrator = new DialogueOrchestrator();
    this.messages = [{ role: 'system', content: INSURANCE_SYSTEM_PROMPT }];
    this.transferRequested = false;
  }

  audit_(event) {
    // Fire-and-forget; never let auditing failures break the call.
    this.audit?.record({ sessionId: this.sessionId, ...event }).catch(() => {});
  }

  getGreetingText() {
    return 'Sigorta acentemize hoş geldiniz, ben sigorta asistanınız. Görüşmemiz kalite ve KVKK amacıyla kayıt altına alınmaktadır. Size nasıl yardımcı olabilirim?';
  }

  async processUserText(userText) {
    // Deterministic guardrails run first — these decisions must not depend on
    // the LLM (esp. binding/payment, which the AI is never allowed to do).
    this.audit_({ type: 'user_turn', text: userText });

    const directive = this.orchestrator.inspect(userText);
    if (directive.type === 'handoff') {
      this.transferRequested = true;
      this.messages.push({ role: 'user', content: userText });
      this.messages.push({ role: 'assistant', content: directive.message });
      this.audit_({ type: 'handoff', reason: directive.reason });
      this.audit_({ type: 'assistant_turn', text: directive.message });
      return { text: directive.message, transfer: true, reason: directive.reason };
    }

    this.messages.push({ role: 'user', content: userText });
    this.trimConversation();

    for (let iteration = 0; iteration < 5; iteration += 1) {
      const message = await this.llm.complete({
        messages: this.messages,
        tools: INSURANCE_TOOL_DEFINITIONS
      });

      this.messages.push(message);

      if (!message.tool_calls?.length) {
        this.audit_({ type: 'assistant_turn', text: message.content || '' });
        return {
          text: message.content || '',
          transfer: this.transferRequested
        };
      }

      for (const toolCall of message.tool_calls) {
        const args = parseToolArgs(toolCall.function.arguments);
        const result = await this.toolExecutor.execute(toolCall.function.name, args);

        this.audit_({ type: 'tool_call', tool: toolCall.function.name, args, ok: result.success !== false });

        if (result.action === 'transfer') this.transferRequested = true;

        this.messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }
    }

    return {
      text: 'Talebinizi aldım. Sizi bir temsilcimize aktarayım mı?',
      transfer: this.transferRequested
    };
  }

  // Streaming turn: emits complete sentences via onSentence(text) as the LLM
  // generates them, so the caller can synthesize/speak the first sentence before
  // the whole reply exists. Deterministic handoff still runs first. Tools are not
  // driven here — the tool loop stays on the non-streaming processUserText path.
  async processUserTextStream(userText, onSentence) {
    this.audit_({ type: 'user_turn', text: userText });

    const directive = this.orchestrator.inspect(userText);
    if (directive.type === 'handoff') {
      this.transferRequested = true;
      this.messages.push({ role: 'user', content: userText });
      this.messages.push({ role: 'assistant', content: directive.message });
      this.audit_({ type: 'handoff', reason: directive.reason });
      this.audit_({ type: 'assistant_turn', text: directive.message });
      await onSentence(directive.message);
      return { text: directive.message, transfer: true, reason: directive.reason };
    }

    this.messages.push({ role: 'user', content: userText });
    this.trimConversation();

    let full = '';
    if (typeof this.llm.completeStream === 'function') {
      let buffer = '';
      await this.llm.completeStream({
        messages: this.messages,
        onToken: async (delta) => {
          full += delta;
          buffer += delta;
          const { chunks, rest } = takeSpeechChunks(buffer);
          buffer = rest;
          for (const chunk of chunks) await onSentence(chunk);
        }
      });
      if (buffer.trim()) await onSentence(buffer.trim());
    } else {
      // Provider without streaming: generate once, then emit as chunks.
      const message = await this.llm.complete({ messages: this.messages });
      full = message.content || '';
      const { chunks, rest } = takeSpeechChunks(full);
      for (const chunk of chunks) await onSentence(chunk);
      if (rest.trim()) await onSentence(rest.trim());
    }

    this.messages.push({ role: 'assistant', content: full });
    this.audit_({ type: 'assistant_turn', text: full });
    return { text: full, transfer: this.transferRequested };
  }

  trimConversation() {
    if (this.messages.length <= 30) return;
    this.messages = [this.messages[0], ...this.messages.slice(-24)];
  }
}

function parseToolArgs(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
