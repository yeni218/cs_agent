// Call engine for Deno / Supabase Edge Functions: STT? → LLM (Groq) → TTS
// (Inworld) → Vapi-shaped result + costBreakdown. Mock-safe without keys.
const env = (k: string) => Deno.env.get(k) || '';
const n = (v: string, d: number) => (v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

function verimorPerSecond() {
  const usdTry = n(env('USD_TRY'), 47.52);
  const minutes = n(env('VERIMOR_PACKAGE_MINUTES'), 10000);
  const priceTry = n(env('VERIMOR_PACKAGE_PRICE_TRY'), 2999);
  return priceTry / minutes / usdTry / 60;
}

function verimorOveragePerSecond() {
  const usdTry = n(env('USD_TRY'), 47.52);
  return n(env('VERIMOR_OVERAGE_TRY_PER_MIN'), 0.99) / usdTry / 60;
}

const PRICING = {
  // Real 2026 rates. Groq openai/gpt-oss-20b ($0.075/$0.30 per M), Whisper turbo
  // ($0.04/hr), Inworld 1.5-mini (~$15/M chars). Verify [Q] items before pricing.
  sttPerSec: n(env('PRICE_STT_PER_SEC'), 0.04 / 3600),
  llmInPer1k: n(env('PRICE_LLM_IN_PER_1K'), 0.000075),
  llmOutPer1k: n(env('PRICE_LLM_OUT_PER_1K'), 0.0003),
  ttsPer1kChars: n(env('PRICE_TTS_PER_1K_CHARS'), 0.015),
  transportPerSec: n(env('PRICE_TRANSPORT_PER_SEC'), verimorPerSecond()),
  transportOveragePerSec: n(env('PRICE_TRANSPORT_OVERAGE_PER_SEC'), verimorOveragePerSecond()),
  transportBillingIncrementSec: n(env('VERIMOR_BILLING_INCREMENT_SEC'), 6),
  mediaPerSec: n(env('PRICE_MEDIA_PER_SEC'), 0),
  platformPerCall: n(env('PRICE_PLATFORM_PER_CALL'), 0.005),
  platformPerSec: n(env('PRICE_PLATFORM_PER_SEC'), 0),
  targetPerMin: n(env('PRICE_TARGET_PER_MIN'), 0.02)
};

function billableSeconds(durationSec = 0) {
  const inc = Math.max(1, PRICING.transportBillingIncrementSec || 1);
  return Math.ceil(Math.max(0, durationSec) / inc) * inc;
}

export function computeCost(u: { promptTokens: number; completionTokens: number; ttsChars: number; durationSec: number; audioSec?: number; providerUsage?: any }) {
  const billedTransportSec = billableSeconds(u.durationSec);
  const stt = u.providerUsage?.sttUsd ?? (u.audioSec || 0) * PRICING.sttPerSec;
  const llm = u.providerUsage?.llmUsd ?? (u.promptTokens / 1000) * PRICING.llmInPer1k + (u.completionTokens / 1000) * PRICING.llmOutPer1k;
  const tts = u.providerUsage?.ttsUsd ?? (u.ttsChars / 1000) * PRICING.ttsPer1kChars;
  const transport = u.providerUsage?.transportUsd ?? billedTransportSec * PRICING.transportPerSec;
  const media = u.providerUsage?.mediaUsd ?? u.durationSec * PRICING.mediaPerSec;
  const platform = u.providerUsage?.platformUsd ?? PRICING.platformPerCall + u.durationSec * PRICING.platformPerSec;
  const total = stt + llm + tts + transport + media + platform;
  const perMinute = u.durationSec > 0 ? total / (u.durationSec / 60) : total;
  const r = (x: number) => +x.toFixed(6);
  return {
    stt: r(stt), llm: r(llm), tts: r(tts), transport: r(transport), media: r(media),
    platform: r(platform), vapi: r(platform), total: r(total), perMinute: r(perMinute),
    targetPerMinute: r(PRICING.targetPerMin), targetStatus: perMinute <= PRICING.targetPerMin ? 'ok' : 'over_target',
    durationSeconds: r(u.durationSec), billableTransportSeconds: r(billedTransportSec),
    audioSeconds: r(u.audioSec || 0), llmPromptTokens: u.promptTokens,
    llmCompletionTokens: u.completionTokens, ttsCharacters: u.ttsChars
  };
}

async function groqComplete(messages: any[], model: string, temperature: number, maxTokens: number, responseFormat?: any) {
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
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, ...(responseFormat ? { response_format: responseFormat } : {}) })
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
    body: JSON.stringify({
      text,
      voiceId,
      modelId: env('INWORLD_TTS_MODEL') || 'inworld-tts-1.5-mini',
      audioConfig: {
        audioEncoding: env('INWORLD_TTS_AUDIO_ENCODING') || 'MP3',
        sampleRateHertz: Number(env('INWORLD_TTS_SAMPLE_RATE') || 48000)
      },
      language: env('INWORLD_TTS_LANGUAGE') || 'tr-TR',
      deliveryMode: env('INWORLD_TTS_DELIVERY_MODE') || 'BALANCED',
      applyTextNormalization: env('INWORLD_TTS_TEXT_NORMALIZATION') || 'ON'
    })
  });
  if (!res.ok) throw new Error(`Inworld ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  return {
    chars: d.usage?.processedCharactersCount || d.result?.usage?.processedCharactersCount || text.length,
    audioBase64: d.audioContent || d.audio || d.result?.audioContent || null
  };
}

export async function runTurn(assistant: any, {
  input,
  audioSec,
  durationSec,
  providerUsage
}: { input?: string; audioSec?: number; durationSec?: number; providerUsage?: any }) {
  const started = Date.now();
  const messages = [...(assistant.model?.messages || [{ role: 'system', content: 'Sen yardımcı bir sesli asistansın.' }])];
  const turns: any[] = [{ role: 'bot', message: assistant.first_message, time: started }];
  let ttsChars = (assistant.first_message || '').length;
  let promptTokens = 0, completionTokens = 0, assistantText = '';

  if (input) {
    turns.push({ role: 'user', message: input, time: Date.now() });
    messages.push({ role: 'user', content: input });
    const llm = await groqComplete(messages, assistant.model?.model || 'openai/gpt-oss-20b', 0.3, 400);
    assistantText = llm.content; promptTokens = llm.promptTokens; completionTokens = llm.completionTokens;
    turns.push({ role: 'bot', message: assistantText, time: Date.now() });
    const tts = await inworldTts(assistantText, assistant.voice?.voiceId || 'Ashley');
    ttsChars += tts.chars;
  }

  const extraction = await extractStructuredData({ input: input || '', assistantText, assistant });
  promptTokens += extraction.promptTokens;
  completionTokens += extraction.completionTokens;

  const measuredDurationSec = Number.isFinite(Number(durationSec))
    ? Number(durationSec)
    : Math.max(2, Math.round((Date.now() - started) / 1000));
  const measuredAudioSec = Number.isFinite(Number(audioSec)) ? Number(audioSec) : 0;
  const costBreakdown = computeCost({ promptTokens, completionTokens, ttsChars, durationSec: measuredDurationSec, audioSec: measuredAudioSec, providerUsage });
  const structuredData = extraction.data;
  const intent = structuredData.intent;
  return {
    messages: turns,
    analysis: {
      summary: input ? `Müşteri: ${input}` : 'Görüşme tamamlanamadı',
      structuredData,
      successEvaluation: input ? 'success' : 'failed'
    },
    outcome: intent,
    orderAmount: Number(structuredData.total) || 0,
    durationSec: measuredDurationSec,
    cost: costBreakdown.total,
    costBreakdown
  };
}

async function extractStructuredData({ input, assistantText, assistant }: { input: string; assistantText: string; assistant: any }) {
  const fallback = heuristicStructuredData(input);
  if (!input || !env('GROQ_API_KEY')) return { data: fallback, promptTokens: 0, completionTokens: 0 };

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
    { role: 'user', content: JSON.stringify({ userText: input, assistantText }) }
  ];

  try {
    const llm = await groqComplete(
      messages,
      assistant.model?.model || 'openai/gpt-oss-20b',
      0,
      220,
      { type: 'json_object' }
    );
    return {
      data: normalizeStructuredData({ ...fallback, ...JSON.parse(llm.content || '{}') }, fallback),
      promptTokens: llm.promptTokens,
      completionTokens: llm.completionTokens
    };
  } catch {
    return { data: fallback, promptTokens: 0, completionTokens: 0 };
  }
}

function heuristicStructuredData(text: string) {
  const t = text.toLowerCase();
  const intent = /sipariş|istiyorum|alabilir miyim|gönder|paket|pizza|kebap|lahmacun|menü/.test(t)
    ? 'order'
    : /rezervasyon|masa|randevu/.test(t)
      ? 'reservation'
      : text
        ? 'faq'
        : 'missed';
  return {
    intent,
    items: intent === 'order' ? extractItems(text) : [],
    total: extractTotal(text),
    customerName: extractCustomerName(text),
    currency: 'TRY'
  };
}

function normalizeStructuredData(value: any, fallback: any) {
  const intent = ['order', 'reservation', 'faq', 'missed'].includes(value.intent) ? value.intent : fallback.intent;
  const items = Array.isArray(value.items)
    ? value.items.map((x: unknown) => String(x).trim()).filter(Boolean)
    : fallback.items;
  const total = Number.isFinite(Number(value.total)) ? Number(value.total) : fallback.total;
  const customerName = typeof value.customerName === 'string' && value.customerName.trim()
    ? value.customerName.trim()
    : fallback.customerName;
  return { intent, items, total, customerName, currency: value.currency || 'TRY' };
}

function extractTotal(text: string) {
  const match = text.match(/(?:toplam|tutar|hesap)?\s*(\d+(?:[.,]\d+)?)\s*(?:tl|₺|lira)/i);
  return match ? Number(match[1].replace(',', '.')) : 0;
}

function extractCustomerName(text: string) {
  const match = text.match(/(?:adım|ismim|ben)\s+([A-ZÇĞİÖŞÜa-zçğıöşü]{2,}(?:\s+[A-ZÇĞİÖŞÜa-zçğıöşü]{2,})?)/);
  return match ? match[1].trim() : null;
}

function extractItems(text: string) {
  return text
    .replace(/(?:toplam|tutar|hesap)?\s*\d+(?:[.,]\d+)?\s*(?:tl|₺|lira).*/i, '')
    .replace(/(?:adım|ismim|ben)\s+[A-ZÇĞİÖŞÜa-zçğıöşü]{2,}(?:\s+[A-ZÇĞİÖŞÜa-zçğıöşü]{2,})?/gi, '')
    .replace(/sipariş vermek istiyorum|sipariş istiyorum|istiyorum|alabilir miyim|gönderir misiniz/gi, '')
    .split(/,|\+| ve /i)
    .map((s) => s.trim())
    .filter(Boolean);
}
