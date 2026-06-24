import { TOOL_DEFINITIONS, createToolExecutor } from './agent-tools.js';
import { SYSTEM_PROMPT } from './prompts.js';

export class AgentSession {
  constructor({ sessionId, callerNumber = 'browser', llm, orderClient }) {
    this.sessionId = sessionId;
    this.callerNumber = callerNumber;
    this.llm = llm;
    this.toolExecutor = createToolExecutor({
      orderClient,
      sessionId,
      callerNumber
    });
    this.messages = [{ role: 'system', content: SYSTEM_PROMPT }];
    this.transferRequested = false;
  }

  getGreetingText() {
    return 'Afiyet Restoran’a hoş geldiniz, ben Afiyet. Siparişinizi almak için buradayım. Size nasıl yardımcı olabilirim?';
  }

  async processUserText(userText) {
    this.messages.push({ role: 'user', content: userText });
    this.trimConversation();

    for (let iteration = 0; iteration < 5; iteration += 1) {
      const message = await this.llm.complete({
        messages: this.messages,
        tools: TOOL_DEFINITIONS
      });

      this.messages.push(message);

      if (!message.tool_calls?.length) {
        return {
          text: message.content || '',
          transfer: this.transferRequested,
          orderId: this.toolExecutor.orderId
        };
      }

      for (const toolCall of message.tool_calls) {
        const result = await this.toolExecutor.execute(
          toolCall.function.name,
          parseToolArgs(toolCall.function.arguments)
        );

        if (result.action === 'transfer') this.transferRequested = true;

        this.messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }
    }

    return {
      text: 'Siparişinizi aldım. Devam etmek ister misiniz?',
      transfer: this.transferRequested,
      orderId: this.toolExecutor.orderId
    };
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
