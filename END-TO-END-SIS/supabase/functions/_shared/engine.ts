// Call engine for Deno / Supabase Edge Functions: STT? → LLM (Groq) → TTS
// (Inworld) → Vapi-shaped result + costBreakdown. Mock-safe without keys.
const env = (k: string) => Deno.env.get(k) || '';

const PRICING = {
  llmInPer1k: Number(env('PRICE_LLM_IN_PER_1K') || 0.00059),
  llmOutPer1k: Number(env('PRICE_LLM_OUT_PER_1K') || 0.00079),
  ttsPer1kChars: Number(env('PRICE_TTS_PER_1K_CHARS') || 0.005),
  transportPerSec: Number(env('PRICE_TRANSPORT_PER_SEC') || 0.0000833),
  platformPerCall: Number(env('PRICE_PLATFORM_PER_CALL') || 0.005)
};

function computeCost(u: { promptTokens: number; completionTokens: number; ttsChars: number; durationSec: number }) {
  const llm = (u.promptTokens / 1000) * PRICING.llmInPer1k + (u.completionTokens / 1000) * PRICING.llmOutPer1k;
  const tts = (u.ttsChars / 1000) * PRICING.ttsPer1kChars;
  const transport = u.durationSec * PRICING.transportPerSec;
  const vapi = PRICING.platformPerCall;
  const r = (x: number) => +x.toFixed(6);
  return { stt: 0, llm: r(llm), tts: r(tts), transport: r(transport), platform: r(vapi), total: r(llm + tts + transport + vapi) };
}

async function groqComplete(messages: any[], model: string, temperature: number, maxTokens: number) {
  const key = env('GROQ_API_KEY');
  if (!key) {
    const last = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const content = /sipariş|istiyorum/i.test(last) ? 'Tabii, siparişinizi aldım. Başka bir arzunuz var mı?'
      : /rezervasyon/i.test(last) ? 'Rezervasyonunuzu oluşturdum, teşekkürler.'
      : 'Size nasıl yardımcı olabilirim?';
    return { content, promptTokens: Math.ceil(JSON.stringify(messages).length / 4), completionTokens: Math.ceil(content.length / 4) };
  }
  const res = await fetch(`${env('GROQ_BASE_URL') || 'https://api.groq.com/openai/v1'}/chat/completions`, {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens })
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  return { content: d.choices?.[0]?.message?.content || '', promptTokens: d.usage?.prompt_tokens || 0, completionTokens: d.usage?.completion_tokens || 0 };
}

async function inworldTts(text: string, voiceId: string) {
  const key = env('INWORLD_API_KEY');
  if (!key) return { chars: text.length, audioBase64: null };
  const res = await fetch(env('INWORLD_TTS_URL') || 'https://api.inworld.ai/tts/v1/voice', {
    method: 'POST', headers: { authorization: `Basic ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text, voiceId, modelId: env('INWORLD_TTS_MODEL') || 'inworld-tts-1' })
  });
  if (!res.ok) throw new Error(`Inworld ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  return { chars: text.length, audioBase64: d.audioContent || d.audio || null };
}

export async function runTurn(assistant: any, { input }: { input?: string }) {
  const started = Date.now();
  const messages = [...(assistant.model?.messages || [{ role: 'system', content: 'Sen yardımcı bir sesli asistansın.' }])];
  const turns: any[] = [{ role: 'bot', message: assistant.first_message, time: started }];
  let ttsChars = (assistant.first_message || '').length;
  let promptTokens = 0, completionTokens = 0, assistantText = '';

  if (input) {
    turns.push({ role: 'user', message: input, time: Date.now() });
    messages.push({ role: 'user', content: input });
    const llm = await groqComplete(messages, assistant.model?.model || 'llama-3.3-70b-versatile', 0.3, 250);
    assistantText = llm.content; promptTokens = llm.promptTokens; completionTokens = llm.completionTokens;
    turns.push({ role: 'bot', message: assistantText, time: Date.now() });
    const tts = await inworldTts(assistantText, assistant.voice?.voiceId || 'Ashley');
    ttsChars += tts.chars;
  }

  const durationSec = Math.max(2, Math.round((Date.now() - started) / 1000));
  const costBreakdown = computeCost({ promptTokens, completionTokens, ttsChars, durationSec });
  const t = (input || '').toLowerCase();
  const intent = /sipariş|istiyorum/.test(t) ? 'order' : /rezervasyon/.test(t) ? 'reservation' : input ? 'faq' : 'missed';
  return {
    messages: turns,
    analysis: {
      summary: input ? `Müşteri: ${input}` : 'Görüşme tamamlanamadı',
      structuredData: intent === 'order' ? { intent, items: input!.split(/[+,]/).map((s) => s.trim()).filter(Boolean), total: 0 } : { intent },
      successEvaluation: input ? 'success' : 'failed'
    },
    outcome: intent,
    orderAmount: 0,
    durationSec,
    cost: costBreakdown.total,
    costBreakdown
  };
}
