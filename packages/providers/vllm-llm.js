// Self-hosted LLM adapter for an OpenAI-compatible endpoint (vLLM, SGLang,
// llama.cpp server, Ollama's /v1). This is the sovereign, in-Türkiye replacement
// for GroqLlmProvider — same `complete({ messages, tools })` contract, so the
// insurance/restaurant sessions don't change. Point LLM_BASE_URL at a Turkish
// GPU box running e.g. Kumru / Trendyol-LLM behind vLLM.
//
// No SDK dependency: vLLM speaks the OpenAI HTTP schema, so a plain fetch keeps
// the sovereign path free of foreign client libraries.
export class VllmLlmProvider {
  constructor({
    baseUrl = process.env.LLM_BASE_URL || 'http://localhost:8000/v1',
    apiKey = process.env.LLM_API_KEY || 'not-needed',
    model = process.env.LLM_MODEL || 'kumru',
    // Insurance/quote answers must be deterministic — no invented coverage.
    temperature = Number.parseFloat(process.env.LLM_TEMPERATURE || '0'),
    maxTokens = Number.parseInt(process.env.LLM_MAX_TOKENS || '500', 10),
    timeoutMs = Number.parseInt(process.env.LLM_TIMEOUT_MS || '30000', 10),
    // Small local models (e.g. Kumru-2B) don't do reliable tool-calling; set
    // LLM_DISABLE_TOOLS=true so the model just converses instead of erroring.
    disableTools = process.env.LLM_DISABLE_TOOLS === 'true'
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.model = model;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
    this.timeoutMs = timeoutMs;
    this.disableTools = disableTools;
  }

  async complete({ messages, tools }) {
    const body = {
      model: this.model,
      messages,
      temperature: this.temperature,
      max_tokens: this.maxTokens
    };
    // Only advertise tools when the caller provides them; some local models are
    // served without tool-calling and reject the field.
    if (tools?.length && !this.disableTools) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`LLM server ${response.status}: ${detail.slice(0, 300)}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message || { role: 'assistant', content: '' };
    } finally {
      clearTimeout(timer);
    }
  }

  // Streaming completion (SSE). Calls onToken(delta) for each content delta and
  // returns the assembled { role, content }. Used by the browser agent to speak
  // the first sentence while the rest is still generating. Content-only: tool
  // calls use the non-streaming complete() path.
  async completeStream({ messages, onToken }) {
    const body = {
      model: this.model,
      messages,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: true
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`LLM server ${response.status}: ${detail.slice(0, 300)}`);
      }

      let full = '';
      let buf = '';
      const decoder = new TextDecoder();
      for await (const part of response.body) {
        buf += decoder.decode(part, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content || '';
            if (delta) {
              full += delta;
              if (onToken) await onToken(delta);
            }
          } catch {
            // ignore keep-alive / partial lines
          }
        }
      }
      return { role: 'assistant', content: full };
    } finally {
      clearTimeout(timer);
    }
  }
}
