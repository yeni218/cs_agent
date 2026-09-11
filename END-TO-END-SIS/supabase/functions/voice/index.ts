// Supabase Edge Function: POST /functions/v1/voice
// The in-app "talk to your agent" loop, end-to-end on your own stack:
//   audio (base64) -> Groq Whisper (STT) -> Groq LLM -> Inworld TTS -> audio back.
// Returns transcript + reply text + reply audio (base64) so the phone can play it.
// Logs the call (with cost) via service role, like `call`, but ALSO returns the
// TTS audio (which `call` discards).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { computeCost } from '../_shared/engine.ts';

const env = (k: string) => Deno.env.get(k) || '';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey',
  'access-control-allow-methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Groq Whisper transcription (OpenAI-compatible multipart endpoint).
async function groqTranscribe(audio: Uint8Array, mimeType: string): Promise<{ text: string; audioSec: number }> {
  const key = env('GROQ_API_KEY');
  if (!key) return { text: 'sipariş vermek istiyorum', audioSec: 3 }; // mock without key
  const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('webm') ? 'webm' : 'm4a';
  const form = new FormData();
  form.append('file', new Blob([audio], { type: mimeType || 'audio/m4a' }), `audio.${ext}`);
  form.append('model', env('GROQ_STT_MODEL') || 'whisper-large-v3-turbo');
  form.append('language', 'tr');
  form.append('response_format', 'json');
  const res = await fetch(`${env('GROQ_BASE_URL') || 'https://api.groq.com/openai/v1'}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: form
  });
  if (!res.ok) throw new Error(`Groq STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  return { text: (d.text || '').trim(), audioSec: Number(d.duration) || 0 };
}

async function groqComplete(messages: any[], model: string): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
  const key = env('GROQ_API_KEY');
  if (!key) {
    const last = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const content = /sipariş|istiyorum/i.test(last)
      ? 'Tabii, siparişinizi aldım. Başka bir arzunuz var mı?'
      : 'Size nasıl yardımcı olabilirim?';
    return { content, promptTokens: 20, completionTokens: 12 };
  }
  const res = await fetch(`${env('GROQ_BASE_URL') || 'https://api.groq.com/openai/v1'}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 300 })
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  return {
    content: d.choices?.[0]?.message?.content || '',
    promptTokens: d.usage?.prompt_tokens || 0,
    completionTokens: d.usage?.completion_tokens || 0
  };
}

async function inworldTts(text: string, voiceId: string): Promise<{ chars: number; audioBase64: string | null }> {
  const key = env('INWORLD_API_KEY');
  if (!key) return { chars: text.length, audioBase64: null };
  const res = await fetch(env('INWORLD_TTS_URL') || 'https://api.inworld.ai/tts/v1/voice', {
    method: 'POST',
    headers: { authorization: `Basic ${key}`, 'content-type': 'application/json' },
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const { assistantId, audioBase64, mimeType, history } = await req.json();
    if (!assistantId || !audioBase64) return json({ error: 'assistantId and audioBase64 required' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );
    const { data: assistant, error } = await admin.from('assistants').select('*').eq('id', assistantId).single();
    if (error || !assistant) return json({ error: 'assistant not found' }, 404);

    const started = Date.now();

    // 1) STT — caller audio -> Turkish text
    const stt = await groqTranscribe(b64ToBytes(audioBase64), mimeType || 'audio/m4a');
    const userText = stt.text;
    if (!userText) return json({ error: 'no speech detected', transcript: '', reply: '', audioBase64: null }, 200);

    // 2) LLM — reply, with optional prior turns for context
    const sys = assistant.model?.messages?.[0] || {
      role: 'system',
      content: 'Sen bir Türk restoranının sesli sipariş asistanısın. Kısa, doğal ve sadece Türkçe konuş.'
    };
    const priorTurns = Array.isArray(history)
      ? history.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-8)
      : [];
    const messages = [sys, ...priorTurns, { role: 'user', content: userText }];
    const llm = await groqComplete(messages, assistant.model?.model || 'openai/gpt-oss-20b');
    const replyText = llm.content;

    // 3) TTS — reply text -> audio (returned to the phone)
    const tts = await inworldTts(replyText, assistant.voice?.voiceId || 'Ashley');

    // 4) Cost + persist (mirrors `call`; cost stripped from response)
    const durationSec = Math.max(2, Math.round((Date.now() - started) / 1000));
    const costBreakdown = computeCost({
      promptTokens: llm.promptTokens,
      completionTokens: llm.completionTokens,
      ttsChars: tts.chars,
      durationSec,
      audioSec: stt.audioSec
    });
    const id = `call_${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();
    await admin.from('calls').insert({
      id, tenant_id: assistant.tenant_id, assistant_id: assistant.id,
      type: 'webCall', status: 'ended', answered: true,
      outcome: /sipariş|istiyorum|pizza|kebap|lahmacun/i.test(userText) ? 'order' : 'faq',
      summary: `Müşteri: ${userText}`,
      duration_sec: durationSec, cost: costBreakdown.total, cost_breakdown: costBreakdown,
      messages: [
        { role: 'user', message: userText, time: started },
        { role: 'bot', message: replyText, time: Date.now() }
      ],
      started_at: nowIso, ended_at: nowIso
    }).then(() => {}, () => {});

    return json({
      transcript: userText,
      reply: replyText,
      audioBase64: tts.audioBase64,
      audioMime: (env('INWORLD_TTS_AUDIO_ENCODING') || 'MP3').toLowerCase().includes('wav') ? 'audio/wav' : 'audio/mpeg'
    }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
