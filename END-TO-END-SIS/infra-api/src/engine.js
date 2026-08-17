// The call engine: STT → LLM → TTS using our providers, producing a Vapi-shaped
// call result (messages, transcript, analysis, costBreakdown). One turn per
// invocation; real telephony would loop this per caller utterance.
import { llmComplete, sttTranscribe } from './providers/groq.js';
import { synthesize } from './providers/inworld.js';
import { computeCost } from './pricing.js';

export async function runCall(assistant, { input, audio } = {}) {
  const started = Date.now();
  const messages = [...(assistant.model?.messages || [])];
  const turns = [{ role: 'bot', message: assistant.firstMessage, time: started }];
  let audioSec = 0, promptTokens = 0, completionTokens = 0, ttsChars = (assistant.firstMessage || '').length;
  let assistantText = '';

  let userText = input || '';
  if (audio) {
    const stt = await sttTranscribe(audio, assistant.transcriber);
    userText = stt.text;
    audioSec += stt.audioSec;
  }

  if (userText) {
    turns.push({ role: 'user', message: userText, time: Date.now() });
    messages.push({ role: 'user', content: userText });
    const llm = await llmComplete({
      messages, model: assistant.model?.model, temperature: assistant.model?.temperature, maxTokens: assistant.model?.maxTokens
    });
    assistantText = llm.content;
    promptTokens += llm.promptTokens;
    completionTokens += llm.completionTokens;
    turns.push({ role: 'bot', message: assistantText, time: Date.now() });
    const tts = await synthesize(assistantText, assistant.voice);
    ttsChars += tts.chars;
  }

  const durationSec = Math.max(audioSec, Math.round((Date.now() - started) / 1000), 2);
  const cost = computeCost({ audioSec, promptTokens, completionTokens, ttsChars, durationSec });

  return {
    messages: turns,
    transcript: turns.map((t) => `${t.role === 'user' ? 'User' : 'AI'}: ${t.message}`).join('\n'),
    analysis: buildAnalysis(userText, assistantText),
    costBreakdown: cost,
    cost: cost.total,
    durationSec
  };
}

function buildAnalysis(userText = '', assistantText = '') {
  const t = userText.toLowerCase();
  const intent = t.includes('sipariş') || t.includes('istiyorum') ? 'order'
    : t.includes('rezervasyon') ? 'reservation'
    : t.includes('saat') || t.includes('nerede') ? 'faq'
    : userText ? 'faq' : 'missed';
  const items = intent === 'order' ? userText.split(/[+,]/).map((s) => s.trim()).filter(Boolean) : [];
  return {
    summary: userText ? `Müşteri: ${userText}` : 'Görüşme tamamlanamadı',
    structuredData: intent === 'order' ? { intent, items, total: 0, currency: 'TRY' } : { intent },
    successEvaluation: userText ? 'success' : 'failed'
  };
}
