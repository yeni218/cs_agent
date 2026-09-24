// AfiyetSesli voice agent — replaces Vapi with OUR OWN engine.
//
//   Caller -> Verimor SIP trunk -> LiveKit Cloud (media) -> THIS agent -> Supabase
//                                                            │
//                            Groq STT (Whisper) + Groq LLM (gpt-oss-20b) + Inworld TTS
//
// The agent joins the LiveKit room that a phone call is routed into, runs the
// Turkish order-taking conversation with our own keys, and POSTs the finished
// call to the `ingest-call` Edge Function — the same write path Vapi uses, so
// cost computation, usage rows, reconciliation and the audit chain all stay in
// Supabase and the app needs no changes.
import {
  type JobContext,
  ServerOptions,
  cli,
  defineAgent,
  voice,
} from '@livekit/agents';
import * as inworld from '@livekit/agents-plugin-inworld';
import * as openai from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: '.env' });

const {
  // Provider keys normally arrive from Supabase (see fetchConfig). These env
  // vars are only a fallback for local `npm run console` runs.
  GROQ_API_KEY,
  GROQ_LLM_MODEL = 'openai/gpt-oss-20b',
  GROQ_STT_MODEL = 'whisper-large-v3-turbo',
  INWORLD_API_KEY,
  INWORLD_TTS_MODEL = 'inworld-tts-1.5-max',
  INWORLD_VOICE = 'Ashley',
  // 'inworld' streams (low latency); 'groq' is batch Whisper (cheaper, slower).
  // Switchable so both can be A/B'd on real Turkish calls.
  STT_PROVIDER = 'inworld',
  SUPABASE_URL,
  AFIYET_INGEST_SECRET,
  AFIYET_ASSISTANT_ID = 'asst_lezzet',
  // JSON map of dialed number -> assistant id, so one deployment serves every
  // restaurant: {"+902127061540":"asst_lezzet","+902127061541":"asst_kebap"}
  AFIYET_NUMBER_MAP = '{}',
} = process.env;

// Keep replies short: the caller hears audio as soon as the first sentence is
// synthesized, so brevity is a latency setting as much as a style one.
const SYSTEM_PROMPT = [
  'Sen "Lezzet Restoran"ın telefonla sipariş alan Türkçe sesli asistanısın.',
  'Kibar, kısa ve net konuş. Sadece Türkçe konuş.',
  'Cevapların EN FAZLA 1-2 kısa cümle olsun. Asla liste veya uzun açıklama yapma.',
  'Görevin: müşteriyi selamla, siparişini al (ürünler ve adet), teslimat',
  'adresini ve telefon numarasını sor, siparişi özetle ve onayla.',
  'Menü dışı sorulara kısaca yardımcı ol. Konuşma bitince nazikçe kapat.',
].join(' ');

const GREETING = 'Merhaba, Lezzet Restoran, buyurun sizi dinliyorum.';

/** Usage totals for one call, in the shape `ingest-call` expects. */
type CallUsage = { promptTokens: number; completionTokens: number; ttsChars: number; audioSec: number };

/** Per-restaurant settings, editable in Supabase without redeploying. */
type AssistantConfig = {
  tenantId: string;
  name: string;
  llmModel: string;
  voice: string | null;
  language: string;
  greeting: string | null;
  openHours: string | null;
};

/** Everything the agent bootstraps from Supabase at worker start. */
type AgentConfig = {
  providers: { groqApiKey: string | null; inworldApiKey: string | null };
  assistants: Record<string, AssistantConfig>;
  numberMap: Record<string, string>;
};

export default defineAgent({
  // Warm up the VAD model and pull config once per worker process, not per call.
  prewarm: async (proc) => {
    proc.userData.vad = await silero.VAD.load();
    proc.userData.config = await fetchConfig();
  },

  entry: async (ctx: JobContext) => {
    const startedAt = Date.now();
    const transcript: { role: 'user' | 'bot'; message: string; time: number }[] = [];
    const usage: CallUsage = { promptTokens: 0, completionTokens: 0, ttsChars: 0, audioSec: 0 };

    const config = ctx.proc.userData.config as AgentConfig;
    const groqKey = config.providers.groqApiKey ?? GROQ_API_KEY;
    const inworldKey = config.providers.inworldApiKey ?? INWORLD_API_KEY;

    // Connect first so we can read the SIP participant and route to the right
    // restaurant before we say anything.
    await ctx.connect();
    const caller = await ctx.waitForParticipant();
    const attrs = caller.attributes ?? {};
    const dialedNumber = attrs['sip.trunkPhoneNumber'] ?? null;
    const callerNumber = attrs['sip.phoneNumber'] ?? null;
    const assistantId = resolveAssistant(dialedNumber, config);
    const assistant = config.assistants[assistantId];

    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as Awaited<ReturnType<typeof silero.VAD.load>>,
      stt: buildSTT(inworldKey, groqKey, assistant?.language ?? 'tr'),
      // LLM: Groq gpt-oss-20b (the llama-* ids were deprecated 2026-06-17).
      llm: openai.LLM.withGroq({
        apiKey: groqKey,
        model: assistant?.llmModel ?? GROQ_LLM_MODEL,
        temperature: 0.3,
      }),
      // TTS: Inworld, via its own plugin (Inworld is not OpenAI-compatible).
      tts: new inworld.TTS({
        apiKey: inworldKey,
        model: INWORLD_TTS_MODEL,
        voice: assistant?.voice ?? INWORLD_VOICE,
        language: 'tr-TR',
      }),
      turnHandling: {
        // Start the LLM on the partial transcript instead of waiting for the
        // turn to be confirmed. The reply is discarded if the caller keeps
        // talking, so the cost is a few wasted tokens (Groq tokens are ~free)
        // in exchange for removing LLM time from the critical path.
        preemptiveGeneration: { enabled: true },
        // Defaults are 500/3000 ms. The caller is on a phone and speaks in
        // short order-taking bursts, so we can afford to be twitchier.
        endpointing: { minDelay: 300, maxDelay: 2000 },
      },
    });

    // Capture the running transcript so we can persist it on hangup.
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      if (ev.isFinal && ev.transcript) transcript.push({ role: 'user', message: ev.transcript, time: Date.now() });
    });
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
      const item = ev.item;
      if ('role' in item && item.role === 'assistant' && item.textContent)
        transcript.push({ role: 'bot', message: item.textContent, time: Date.now() });
    });

    // Real measured usage — this is what makes the per-call COGS figure honest
    // instead of an estimate. The SDK re-emits cumulative totals, so assign.
    session.on(voice.AgentSessionEventTypes.SessionUsageUpdated, (ev) => {
      Object.assign(usage, { promptTokens: 0, completionTokens: 0, ttsChars: 0, audioSec: 0 });
      for (const m of ev.usage.modelUsage) {
        if (m.type === 'llm_usage') {
          usage.promptTokens += m.inputTokens ?? 0;
          usage.completionTokens += m.outputTokens ?? 0;
        } else if (m.type === 'tts_usage') {
          usage.ttsChars += m.charactersCount ?? 0;
        } else if (m.type === 'stt_usage') {
          usage.audioSec += (m.audioDurationMs ?? 0) / 1000;
        }
      }
    });

    await session.start({
      agent: voice.Agent.create({ instructions: buildPrompt(assistant) }),
      room: ctx.room,
    });

    // Greet the caller — the restaurant's own greeting when Supabase has one.
    session.say(assistant?.greeting ?? GREETING, { allowInterruptions: true });

    // On hangup the job shuts down — that's our one chance to record the call.
    let persisted = false;
    ctx.addShutdownCallback(async () => {
      if (persisted) return;
      persisted = true;
      await persistCall({ startedAt, transcript, usage, assistantId, callerNumber, dialedNumber });
    });
  },
});

/**
 * Speech-to-text. Inworld streams over a WebSocket and decides end-of-turn from
 * confidence, so transcription overlaps with the caller still talking. Groq
 * Whisper is batch: it buffers the whole utterance, uploads it, and only then
 * returns — which puts the full transcription time on the critical path. Groq
 * is kept as a fallback because it is cheaper and already proven on Turkish.
 */
function buildSTT(inworldKey: string | undefined, groqKey: string | undefined, language: string) {
  if (STT_PROVIDER === 'groq') {
    return openai.STT.withGroq({
      apiKey: groqKey,
      model: GROQ_STT_MODEL,
      language,
    });
  }
  return new inworld.STT({
    apiKey: inworldKey,
    language: language === 'tr' ? 'tr-TR' : language,
    // Voice profiling (emotion/accent/age) is on by default and we never read
    // it — turn it off rather than pay for it on every call.
    enableVoiceProfile: false,
  });
}

/**
 * Bootstrap from Supabase so provider keys live in exactly one place. The agent
 * authenticates with AFIYET_INGEST_SECRET, which grants nothing beyond this
 * endpoint and `ingest-call` — no service-role key ever reaches the container.
 *
 * If Supabase is unreachable we fall back to whatever is in the environment, so
 * a Supabase blip degrades the agent instead of taking the phone line down.
 */
async function fetchConfig(): Promise<AgentConfig> {
  const fallback: AgentConfig = {
    providers: { groqApiKey: GROQ_API_KEY ?? null, inworldApiKey: INWORLD_API_KEY ?? null },
    assistants: {},
    numberMap: safeParseNumberMap(),
  };
  if (!SUPABASE_URL || !AFIYET_INGEST_SECRET) {
    console.warn('[afiyet] no Supabase config endpoint — using environment variables');
    return fallback;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-config`, {
      headers: { 'x-afiyet-ingest-secret': AFIYET_INGEST_SECRET },
    });
    if (!res.ok) throw new Error(`agent-config returned ${res.status}`);
    const cfg = (await res.json()) as AgentConfig;
    console.log(`[afiyet] config loaded: ${Object.keys(cfg.assistants).length} assistant(s)`);
    return {
      providers: {
        groqApiKey: cfg.providers?.groqApiKey ?? fallback.providers.groqApiKey,
        inworldApiKey: cfg.providers?.inworldApiKey ?? fallback.providers.inworldApiKey,
      },
      assistants: cfg.assistants ?? {},
      numberMap: { ...fallback.numberMap, ...(cfg.numberMap ?? {}) },
    };
  } catch (e) {
    console.error('[afiyet] could not load config from Supabase, falling back to env', e);
    return fallback;
  }
}

/** Build the system prompt from the restaurant's own Supabase settings. */
function buildPrompt(assistant: AssistantConfig | undefined): string {
  if (!assistant) return SYSTEM_PROMPT;
  const lines = [
    `Sen "${assistant.name}" için telefonla sipariş alan Türkçe sesli asistansın.`,
    'Kibar, kısa ve net konuş. Sadece Türkçe konuş.',
    'Cevapların EN FAZLA 1-2 kısa cümle olsun. Asla liste veya uzun açıklama yapma.',
    'Görevin: müşteriyi selamla, siparişini al (ürünler ve adet), teslimat',
    'adresini ve telefon numarasını sor, siparişi özetle ve onayla.',
    'Menü dışı sorulara kısaca yardımcı ol. Konuşma bitince nazikçe kapat.',
  ];
  if (assistant.openHours) lines.push(`Çalışma saatleri: ${assistant.openHours}.`);
  return lines.join(' ');
}

/** Map the dialed number to a restaurant's assistant; fall back to the default. */
function resolveAssistant(dialedNumber: string | null, config: AgentConfig): string {
  if (dialedNumber && config.numberMap[dialedNumber]) return config.numberMap[dialedNumber]!;
  return AFIYET_ASSISTANT_ID;
}

/** Env-var number map — only used when Supabase is unreachable. */
function safeParseNumberMap(): Record<string, string> {
  try {
    return JSON.parse(AFIYET_NUMBER_MAP) as Record<string, string>;
  } catch {
    console.error('[afiyet] AFIYET_NUMBER_MAP is not valid JSON — ignoring it');
    return {};
  }
}

async function persistCall(call: {
  startedAt: number;
  transcript: { role: string; message: string; time: number }[];
  usage: CallUsage;
  assistantId: string;
  callerNumber: string | null;
  dialedNumber: string | null;
}) {
  if (!SUPABASE_URL) return;
  const durationSec = Math.max(1, Math.round((Date.now() - call.startedAt) / 1000));
  const userText = call.transcript.filter((t) => t.role === 'user').map((t) => t.message).join(' ');
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest-call`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-afiyet-ingest-secret': AFIYET_INGEST_SECRET ?? '',
      },
      body: JSON.stringify({
        assistantId: call.assistantId,
        type: 'inboundPhoneCall',
        status: 'ended',
        answered: call.transcript.length > 0,
        outcome: /sipariş|istiyorum|pizza|kebap|lahmacun/i.test(userText) ? 'order' : userText ? 'faq' : 'missed',
        summary: userText ? `Müşteri: ${userText}` : 'Görüşme tamamlanamadı',
        customerName: call.callerNumber,
        durationSec,
        // Whisper only bills the caller's speech, so audioSec < durationSec.
        audioSec: call.usage.audioSec || durationSec,
        usage: {
          promptTokens: call.usage.promptTokens,
          completionTokens: call.usage.completionTokens,
          ttsChars: call.usage.ttsChars,
        },
        messages: call.transcript,
        startedAt: new Date(call.startedAt).toISOString(),
        endedAt: new Date().toISOString(),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[afiyet] ingest-call rejected the call (${res.status})`, body);
      return;
    }
    console.log(`[afiyet] call ${body.id} logged (${durationSec}s, $${body.cost})`);
  } catch (e) {
    console.error('[afiyet] failed to log call', e);
  }
}

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName: 'afiyetsesli' }));
