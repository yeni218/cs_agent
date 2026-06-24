import Groq from 'groq-sdk';

export class GroqLlmProvider {
  constructor({
    apiKey = process.env.GROQ_API_KEY,
    model = process.env.GROQ_LLM_MODEL || 'llama-3.3-70b-versatile'
  } = {}) {
    this.apiKey = apiKey;
    this.client = null;
    this.model = model;
  }

  async complete({ messages, tools }) {
    const completion = await this.getClient().chat.completions.create({
      model: this.model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.5,
      max_tokens: 500,
      top_p: 0.9
    });

    return completion.choices[0]?.message || { role: 'assistant', content: '' };
  }

  getClient() {
    if (!this.apiKey) throw new Error('GROQ_API_KEY is required for agent chat.');
    if (!this.client) this.client = new Groq({ apiKey: this.apiKey });
    return this.client;
  }
}
