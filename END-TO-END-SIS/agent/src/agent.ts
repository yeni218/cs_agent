// AfiyetSesli voice agent — replaces Vapi with OUR OWN engine.
//
//   Caller -> Verimor SIP trunk -> LiveKit Cloud (media) -> THIS agent -> Supabase
//                                                            │
//                 Groq Whisper (STT) + Groq gpt-oss-20b (LLM) + Inworld TTS  (our keys)
//
// Registers as agent "afiyetsesli" — matches the LiveKit dispatch rule already set up
// (SDR_rgxgfK9A5Hiy) for the Verimor trunk (+902127061540). Logs each finished call
// into the same Supabase `calls` table the app reads.
import { type JobContext, ServerOptions, cli, defineAgent, voice } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import * as inworld from '@livekit/agents-plugin-inworld';
import * as silero from '@livekit/agents-plugin-silero';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';

const env = (k: string, d = '') => process.env[k] ?? d;

const SYSTEM_PROMPT = [
  'Sen "Lezzet Restoran"ın telefonla sipariş alan Türkçe sesli asistanısın.',
  'Kibar, kısa ve net konuş. Sadece Türkçe konuş.',
  'Görevin: müşteriyi selamla, siparişini al (ürünler ve adet), teslimat',
  'adresini ve telefon numarasını sor, siparişi özetle ve onayla.',
  'Menü dışı sorulara kısaca yardımcı ol. Konuşma bitince nazikçe kapat.',
].join(' ');

const GREETING = 'Merhaba, Lezzet Restoran, buyurun sizi dinliyorum.';

export default defineAgent({
  // Load the VAD once per worker process (reused across calls).
  prewarm: async (proc) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    const startedAt = Date.now();
    const turns: { role: 'user' | 'bot'; message: string; time: number }[] = [];

    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      // Groq Whisper transcription, Turkish (our GROQ_API_KEY).
      stt: openai.STT.withGroq({
        model: env('GROQ_STT_MODEL', 'whisper-large-v3-turbo'),
        language: 'tr',
      }),
      // Groq gpt-oss-20b via OpenAI-compatible chat (our GROQ_API_KEY).
      llm: openai.LLM.withGroq({
        model: env('GROQ_LLM_MODEL', 'openai/gpt-oss-20b'),
        temperature: 0.3,
      }),
      // Inworld TTS, Turkish (our INWORLD_API_KEY, base64). `voice` is a strict
      // union in the plugin — cast so any Inworld voice name works via env.
      tts: new inworld.TTS({
        model: env('INWORLD_TTS_MODEL', 'inworld-tts-1.5-mini'),
        voice: env('INWORLD_VOICE', 'Ashley') as any,
        language: 'tr',
      }),
    });

    // Capture the transcript for logging (best-effort; don't let it break the call).
    (session as any).on('conversation_item_added', (ev: any) => {
      try {
        const item = ev?.item ?? ev;
        const role = item?.role;
        const text =
          item?.textContent ?? item?.content?.map?.((c: any) => (typeof c === 'string' ? c : c?.text)).join(' ') ?? '';
        if (text && (role === 'user' || role === 'assistant')) {
          turns.push({ role: role === 'user' ? 'user' : 'bot', message: String(text).trim(), time: Date.now() });
        }
      } catch {
        /* ignore */
      }
    });

    const agent = new voice.Agent({ instructions: SYSTEM_PROMPT });

    await session.start({ agent, room: ctx.room });
    await ctx.connect();
    await session.say(GREETING, { allowInterruptions: true });

    // On hangup / job end, persist the call to Supabase.
    ctx.addShutdownCallback(async () => {
      await persistCall(startedAt, turns);
    });
  },
});

async function persistCall(startedAt: number, turns: { role: string; message: string; time: number }[]) {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return;
  try {
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const durationSec = Math.max(2, Math.round((Date.now() - startedAt) / 1000));
    const userText = turns.filter((t) => t.role === 'user').map((t) => t.message).join(' ');
    const id = `call_${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();
    await admin.from('calls').insert({
      id,
      tenant_id: env('AFIYET_TENANT_ID', 't_lezzet'),
      assistant_id: env('AFIYET_ASSISTANT_ID', 'asst_lezzet'),
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
    console.log(`[afiyet] call ${id} logged (${durationSec}s, ${turns.length} turns)`);
  } catch (e) {
    console.error('[afiyet] failed to log call', e);
  }
}

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName: 'afiyetsesli' }));
