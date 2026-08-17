// Groq provider: LLM (llama) + STT (whisper). OpenAI-compatible HTTP.
// Falls back to a deterministic mock when GROQ_API_KEY is absent, so the API
// runs end-to-end without keys.
const GROQ_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
const KEY = process.env.GROQ_API_KEY;

export async function llmComplete({ messages, model, temperature = 0.3, maxTokens = 250 }) {
  if (!KEY) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const content = mockReply(lastUser);
    return { content, promptTokens: estTokens(messages.map((m) => m.content).join(' ')), completionTokens: estTokens(content), mock: true };
  }
  const res = await fetch(`${GROQ_URL}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens })
  });
  if (!res.ok) throw new Error(`Groq LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    promptTokens: data.usage?.prompt_tokens || 0,
    completionTokens: data.usage?.completion_tokens || 0
  };
}

// audio: Buffer (wav). Returns { text, audioSec }.
export async function sttTranscribe(audio, { model = 'whisper-large-v3-turbo', language = 'tr' } = {}) {
  const audioSec = estAudioSec(audio);
  if (!KEY) return { text: '(mock transkript)', audioSec, mock: true };
  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', model);
  form.append('language', language);
  const res = await fetch(`${GROQ_URL}/audio/transcriptions`, {
    method: 'POST', headers: { authorization: `Bearer ${KEY}` }, body: form
  });
  if (!res.ok) throw new Error(`Groq STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { text: data.text?.trim() || '', audioSec };
}

export const groqReady = !!KEY;

function estTokens(s) { return Math.ceil((s || '').length / 4); }
function estAudioSec(buf) { return buf?.length ? Math.round((buf.length - 44) / (16000 * 2)) : 0; } // 16kHz mono s16
function mockReply(userText) {
  const t = userText.toLowerCase();
  if (t.includes('sipariş') || t.includes('istiyorum')) return 'Tabii, siparişinizi aldım. Başka bir arzunuz var mı?';
  if (t.includes('rezervasyon')) return 'Rezervasyonunuzu oluşturdum, teşekkür ederim.';
  if (t.includes('saat')) return 'Çalışma saatlerimiz her gün 11:00 - 23:00 arasındadır.';
  return 'Size nasıl yardımcı olabilirim?';
}
