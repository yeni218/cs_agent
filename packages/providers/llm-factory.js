import { GroqLlmProvider } from './groq-llm.js';
import { VllmLlmProvider } from './vllm-llm.js';

// Selects the LLM backend, mirroring the TTS/STT provider-factory pattern.
//
//   LLM_PROVIDER=groq   (default; cloud, US — NOT for sovereign deployments)
//   LLM_PROVIDER=vllm   (self-hosted OpenAI-compatible endpoint in Türkiye)
//
// The sovereign/consulate profile sets LLM_PROVIDER=vllm and points
// LLM_BASE_URL at a Turkish GPU box. See docs/self-hosted-architecture.md.
export function createLlmProvider({ provider = process.env.LLM_PROVIDER || 'groq' } = {}) {
  const normalized = provider.trim().toLowerCase();

  if (normalized === 'groq') return new GroqLlmProvider();
  if (normalized === 'vllm' || normalized === 'local' || normalized === 'openai-compatible') {
    return new VllmLlmProvider();
  }

  throw new Error(`Unsupported LLM_PROVIDER "${provider}". Use "groq" or "vllm".`);
}
