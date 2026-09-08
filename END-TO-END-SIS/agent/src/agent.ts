// AfiyetSesli voice agent — replaces Vapi with OUR OWN engine.
//
//   Caller -> Verimor SIP trunk -> LiveKit Cloud (media) -> THIS agent -> Supabase
//                                                            │
//                            Groq STT (Whisper) + Groq LLM (gpt-oss-20b) + Inworld TTS
//
// The agent joins the LiveKit room that a phone call is routed into, runs the
// Turkish order-taking conversation with our own keys, and writes the finished
// call (with cost) into Supabase — same table the app already reads.
import {
  type JobContext,
  ServerOptions,
  cli,
  defineAgent,
  voice,
} from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const {
  GROQ_API_KEY,
  GROQ_BASE_URL = 'https://api.groq.com/openai/v1',
  GROQ_LLM_MODEL = 'openai/gpt-oss-20b',
  GROQ_STT_MODEL = 'whisper-large-v3-turbo',
  INWORLD_API_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  AFIYET_TENANT_ID = 't_lezzet',
  AFIYET_ASSISTANT_ID = 'asst_lezzet',
} = process.env;

const SYSTEM_PROMPT = [
  'Sen "Lezzet Restoran"ın telefonla sipariş alan Türkçe sesli asistanısın.',
  'Kibar, kısa ve net konuş. Sadece Türkçe konuş.',
  'Görevin: müşteriyi selamla, siparişini al (ürünler ve adet), teslimat',
  'adresini ve telefon numarasını sor, siparişi özetle ve onayla.',
  'Menü dışı sorulara kısaca yardımcı ol. Konuşma bitince nazikçe kapat.',
].join(' ');

const GREETING = 'Merhaba, Lezzet Restoran, buyurun sizi dinliyorum.';

export default defineAgent({
  // Warm up the VAD model once per worker process.
  prewarm: async (proc) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    const startedAt = Date.now();
    const transcript: { role: 'user' | 'bot'; message: string; time: number }[] = [];

    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      // STT: Groq Whisper (OpenAI-compatible transcription endpoint), Turkish.
      stt: new openai.STT({
        baseURL: GROQ_BASE_URL,
        apiKey: GROQ_API_KEY,
        model: GROQ_STT_MODEL,
        language: 'tr',
      }),
      // LLM: Groq gpt-oss-20b via the OpenAI-compatible chat endpoint.
      llm: new openai.LLM({
        baseURL: GROQ_BASE_URL,
        apiKey: GROQ_API_KEY,
        model: GROQ_LLM_MODEL,
        temperature: 0.3,
      }),
      // TTS: Inworld (Turkish). Uses LiveKit's Inworld integration with our key.
      tts: new openai.TTS({
        baseURL: 'https://api.inworld.ai/tts/v1',
        apiKey: INWORLD_API_KEY,
        model: 'inworld-tts-1.5-mini',
        voice: 'Ashley',
      }),
    });

    // Capture the running transcript so we can persist it on hangup.
    session.on('user_input_transcribed', (ev: any) => {
      if (ev?.isFinal && ev?.transcript) transcript.push({ role: 'user', message: ev.transcript, time: Date.now() });
    });
    session.on('conversation_item_added', (ev: any) => {
      if (ev?.item?.role === 'assistant' && ev?.item?.textContent)
        transcript.push({ role: 'bot', message: ev.item.textContent, time: Date.now() });
    });

    const agent = new voice.Agent({ instructions: SYSTEM_PROMPT });

    await session.start({ agent, room: ctx.room });
    await ctx.connect();

    // Greet the caller.
    await session.say(GREETING, { allowInterruptions: true });

    // When the caller hangs up (room closes), write the call into Supabase.
    ctx.room.on('disconnected', async () => {
      await persistCall(startedAt, transcript);
    });
  },
});

async function persistCall(startedAt: number, turns: { role: string; message: string; time: number }[]) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const durationSec = Math.max(2, Math.round((Date.now() - startedAt) / 1000));
    const userText = turns.filter((t) => t.role === 'user').map((t) => t.message).join(' ');
    const id = `call_${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();
    await admin.from('calls').insert({
      id,
      tenant_id: AFIYET_TENANT_ID,
      assistant_id: AFIYET_ASSISTANT_ID,
      type: 'phoneCall',
      status: 'ended',
      answered: true,
      outcome: /sipariş|istiyorum|pizza|kebap|lahmacun/i.test(userText) ? 'order' : userText ? 'faq' : 'missed',
      summary: userText ? `Müşteri: ${userText}` : 'Görüşme tamamlanamadı',
      duration_sec: durationSec,
      messages: turns,
      started_at: new Date(startedAt).toISOString(),
      ended_at: nowIso,
    });
    console.log(`[afiyet] call ${id} logged (${durationSec}s)`);
  } catch (e) {
    console.error('[afiyet] failed to log call', e);
  }
}

cli.runApp(new ServerOptions({ agent: import.meta.url, agentName: 'afiyetsesli' }));
