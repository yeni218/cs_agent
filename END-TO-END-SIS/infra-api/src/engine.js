// The call engine: STT → LLM → TTS using our providers, producing a Vapi-shaped
// call result (messages, transcript, analysis, costBreakdown). One turn per
// invocation; real telephony would loop this per caller utterance.
import { groqReady, llmComplete, sttTranscribe } from './providers/groq.js';
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

  const extraction = await extractStructuredData({ userText, assistantText, assistant });
  promptTokens += extraction.promptTokens;
  completionTokens += extraction.completionTokens;

  const durationSec = Math.max(audioSec, Math.round((Date.now() - started) / 1000), 2);
  const cost = computeCost({ audioSec, promptTokens, completionTokens, ttsChars, durationSec });

  return {
    messages: turns,
    transcript: turns.map((t) => `${t.role === 'user' ? 'User' : 'AI'}: ${t.message}`).join('\n'),
    analysis: buildAnalysis(userText, extraction.data),
    costBreakdown: cost,
    cost: cost.total,
    durationSec
  };
}

function buildAnalysis(userText = '', structuredData = {}) {
  const intent = structuredData.intent || (userText ? 'faq' : 'missed');
  return {
    summary: userText ? `Müşteri: ${userText}` : 'Görüşme tamamlanamadı',
    structuredData: intent === 'order' ? { currency: 'TRY', ...structuredData, intent } : { ...structuredData, intent },
    successEvaluation: userText ? 'success' : 'failed'
  };
}

async function extractStructuredData({ userText = '', assistantText = '', assistant = {} }) {
  const fallback = heuristicStructuredData(userText);
  if (!userText || !groqReady) return { data: fallback, promptTokens: 0, completionTokens: 0 };

  const schema = assistant.analysisPlan?.structuredDataSchema || {};
  const messages = [
    {
      role: 'system',
      content: [
        'Türkçe restoran çağrısından yapılandırılmış veri çıkar.',
        'Sadece geçerli JSON döndür.',
        'Alanlar: intent(order|reservation|faq|missed), items(array), total(number), customerName(string|null), currency(string).',
        'Emin değilsen fallback olarak total 0 ve boş items kullan.',
        `Şema: ${JSON.stringify(schema)}`
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify({ userText, assistantText })
    }
  ];

  try {
    const llm = await llmComplete({
      messages,
      model: assistant.model?.model || 'llama-3.3-70b-versatile',
      temperature: 0,
      maxTokens: 220,
      responseFormat: { type: 'json_object' }
    });
    return {
      data: normalizeStructuredData({ ...fallback, ...JSON.parse(llm.content || '{}') }, fallback),
      promptTokens: llm.promptTokens,
      completionTokens: llm.completionTokens
    };
  } catch {
    return { data: fallback, promptTokens: 0, completionTokens: 0 };
  }
}

function heuristicStructuredData(text = '') {
  const t = text.toLowerCase();
  const intent = /sipariş|istiyorum|alabilir miyim|gönder|paket|pizza|kebap|lahmacun|menü/.test(t)
    ? 'order'
    : /rezervasyon|masa|randevu/.test(t)
      ? 'reservation'
      : text
        ? 'faq'
        : 'missed';
  const total = extractTotal(text);
  const customerName = extractCustomerName(text);
  const items = intent === 'order' ? extractItems(text) : [];
  return { intent, items, total, customerName, currency: 'TRY' };
}

function normalizeStructuredData(value, fallback) {
  const intent = ['order', 'reservation', 'faq', 'missed'].includes(value.intent) ? value.intent : fallback.intent;
  const items = Array.isArray(value.items)
    ? value.items.map((x) => String(x).trim()).filter(Boolean)
    : fallback.items;
  const total = Number.isFinite(Number(value.total)) ? Number(value.total) : fallback.total;
  const customerName = typeof value.customerName === 'string' && value.customerName.trim()
    ? value.customerName.trim()
    : fallback.customerName;
  return { intent, items, total, customerName, currency: value.currency || 'TRY' };
}

function extractTotal(text) {
  const match = text.match(/(?:toplam|tutar|hesap)?\s*(\d+(?:[.,]\d+)?)\s*(?:tl|₺|lira)/i);
  return match ? Number(match[1].replace(',', '.')) : 0;
}

function extractCustomerName(text) {
  const match = text.match(/(?:adım|ismim|ben)\s+([A-ZÇĞİÖŞÜa-zçğıöşü]{2,}(?:\s+[A-ZÇĞİÖŞÜa-zçğıöşü]{2,})?)/);
  return match ? match[1].trim() : null;
}

function extractItems(text) {
  return text
    .replace(/(?:toplam|tutar|hesap)?\s*\d+(?:[.,]\d+)?\s*(?:tl|₺|lira).*/i, '')
    .replace(/(?:adım|ismim|ben)\s+[A-ZÇĞİÖŞÜa-zçğıöşü]{2,}(?:\s+[A-ZÇĞİÖŞÜa-zçğıöşü]{2,})?/gi, '')
    .replace(/sipariş vermek istiyorum|sipariş istiyorum|istiyorum|alabilir miyim|gönderir misiniz/gi, '')
    .split(/,|\+| ve /i)
    .map((s) => s.trim())
    .filter(Boolean);
}
