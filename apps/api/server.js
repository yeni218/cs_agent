import 'dotenv/config';
import Fastify from 'fastify';
import fastifyFormbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_MENU } from '../../packages/domain/menu.js';
import { createAgentSession } from '../../packages/domain/session-factory.js';
import { OrderService } from '../../packages/domain/order-service.js';
import { createLlmProvider } from '../../packages/providers/llm-factory.js';
import { createSttProvider } from '../../packages/providers/stt-factory.js';
import { createTtsProvider } from '../../packages/providers/tts-provider.js';
import { normalizeForSpeech } from '../../packages/voice-core/text-normalize.js';
import { createOrderStore } from '../../packages/storage/order-store-factory.js';
import { EnergyTurnDetector } from '../../packages/voice-core/turn-detector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.API_PORT || process.env.PORT || '8080', 10);
const apiToken = normalizeLocalToken(process.env.DASHBOARD_API_TOKEN);

const fastify = Fastify({ logger: true });
await fastify.register(fastifyFormbody);
await fastify.register(fastifyWebsocket);
await fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/'
});

const store = await createOrderStore({ logger: fastify.log });
const orders = new OrderService({ store, menu: DEFAULT_MENU });
await orders.init();
const browserAgentSessions = new Map();
let browserAgentLlm = null;
let browserAgentStt = null;
let browserAgentTts = null;

registerRoutes(fastify, orders);
registerBrowserAgentRoutes(fastify, orders);
registerBrowserRealtimeAgent(fastify, orders);
registerOrderStream(fastify, orders);

fastify.get('/health', async () => ({
  status: 'ok',
  service: 'afiyet-api',
  timestamp: new Date().toISOString()
}));

try {
  await fastify.listen({ port, host: '0.0.0.0' });
  fastify.log.info(`Afiyet API listening on http://localhost:${port}`);
} catch (error) {
  fastify.log.error(error);
  process.exit(1);
}

function registerRoutes(app, service) {
  app.get('/api/menu', { preHandler: authorize }, async (request) => {
    return service.getMenu(request.query.category || null);
  });

  app.get('/api/menu/search', { preHandler: authorize }, async (request) => {
    return service.searchMenu(request.query.q || '');
  });

  app.get('/api/orders', { preHandler: authorize }, async () => ({
    orders: await service.listOrders()
  }));

  app.get('/api/orders/active', { preHandler: authorize }, async () => ({
    orders: await service.listActiveOrders()
  }));

  app.post('/api/orders', { preHandler: authorize }, async (request, reply) => {
    try {
      const order = await service.getOrCreateOrder({
        sessionId: request.body?.sessionId || `manual-${Date.now()}`,
        callerNumber: request.body?.callerNumber || 'unknown'
      });
      return order;
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });

  app.get('/api/orders/:id', { preHandler: authorize }, async (request, reply) => {
    const order = await service.getOrder(request.params.id);
    if (!order) return reply.code(404).send({ error: 'Sipariş bulunamadı.' });
    return order;
  });

  app.get('/api/orders/:id/summary', { preHandler: authorize }, async (request, reply) => {
    try {
      return await service.summarize(request.params.id);
    } catch (error) {
      return reply.code(404).send({ error: error.message });
    }
  });

  app.post('/api/orders/:id/items', { preHandler: authorize }, async (request, reply) => {
    try {
      return await service.addItem(request.params.id, request.body || {});
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });

  app.delete('/api/orders/:id/items/:itemId', { preHandler: authorize }, async (request, reply) => {
    try {
      return await service.removeItem(request.params.id, request.params.itemId);
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });

  app.post('/api/orders/:id/delivery', { preHandler: authorize }, async (request, reply) => {
    try {
      return await service.updateDelivery(request.params.id, request.body || {});
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });

  app.post('/api/orders/:id/confirm', { preHandler: authorize }, async (request, reply) => {
    try {
      return await service.confirmOrder(request.params.id);
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });

  app.post('/api/orders/:id/status', { preHandler: authorize }, async (request, reply) => {
    try {
      return await service.updateStatus(request.params.id, request.body?.status);
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });
}

function registerBrowserAgentRoutes(app, service) {
  app.post('/api/agent/chat', { preHandler: authorize }, async (request, reply) => {
    const message = String(request.body?.message || '').trim();
    if (!message) return reply.code(400).send({ error: 'Mesaj gerekli.' });

    try {
      const sessionId = request.body?.sessionId || `browser-${Date.now()}`;
      const session = getBrowserAgentSession(service, {
        sessionId,
        callerNumber: request.body?.callerNumber || 'browser'
      });
      const result = await session.processUserText(message);

      return {
        sessionId,
        text: result.text,
        transfer: result.transfer,
        orderId: result.orderId
      };
    } catch (error) {
      request.log.error({ error }, 'Browser agent chat failed');
      return reply.code(500).send({
        error: error.message || 'Agent yanıt veremedi.'
      });
    }
  });

  app.delete('/api/agent/sessions/:id', { preHandler: authorize }, async (request) => {
    browserAgentSessions.delete(request.params.id);
    return { ok: true };
  });
}

function registerBrowserRealtimeAgent(app, service) {
  app.register(async function registerRealtimeRoutes(instance) {
    instance.get('/api/agent/realtime', { websocket: true }, (socket, request) => {
      const query = request.query || {};
      if (apiToken && query.token !== apiToken) {
        socket.close(1008, 'unauthorized');
        return;
      }

      const sessionId = query.sessionId || `browser-${Date.now()}`;
      const session = getBrowserAgentSession(service, {
        sessionId,
        callerNumber: 'browser'
      });
      const detector = new EnergyTurnDetector({
        speechThreshold: Number.parseInt(process.env.BROWSER_AGENT_VAD_THRESHOLD || '650', 10),
        speechFramesToStart: Number.parseInt(process.env.BROWSER_AGENT_SPEECH_FRAMES || '2', 10),
        maxPreSpeechFrames: Number.parseInt(process.env.BROWSER_AGENT_PRE_SPEECH_FRAMES || '8', 10),
        silenceFramesToEnd: Number.parseInt(process.env.BROWSER_AGENT_SILENCE_FRAMES || '22', 10),
        minSpeechBytes: Number.parseInt(process.env.BROWSER_AGENT_MIN_SPEECH_BYTES || '5600', 10)
      });

      let processing = false;
      let pendingUtterance = null;
      let generation = 0;
      let falseInterruptionTimer = null;
      let awaitingInterruptTranscript = false;

      sendSocket(socket, {
        type: 'ready',
        sessionId,
        greeting: session.getGreetingText()
      });

      // Warm the filler cache now so the first turn's acknowledgement is instant.
      getFillerPayloads().catch(() => {});

      // Play a cached acknowledgement immediately (masks STT+LLM latency).
      async function playFiller(turnGen) {
        if (process.env.BROWSER_AGENT_FILLER === 'false') return;
        let fillers;
        try {
          fillers = await getFillerPayloads();
        } catch {
          return;
        }
        if (!fillers.length || turnGen !== generation) return;
        const filler = fillers[Math.floor(Math.random() * fillers.length)];
        sendSocket(socket, { type: 'status', status: 'speaking' });
        sendSocket(socket, { type: 'assistant_audio', ...filler });
      }

      socket.on('message', (raw) => {
        handleRealtimeMessage(raw).catch((error) => {
          request.log.error({ error }, 'Realtime agent message failed');
          sendSocket(socket, { type: 'error', error: error.message || 'Agent hatası.' });
        });
      });
      socket.on('close', () => clearFalseInterruption());

      async function handleRealtimeMessage(raw) {
        const message = JSON.parse(typeof raw === 'string' ? raw : raw.toString());

        if (message.type === 'interrupt') {
          generation += 1;
          sendSocket(socket, { type: 'interrupted' });
          scheduleFalseInterruption();
          return;
        }

        if (message.type === 'text') {
          const text = String(message.text || '').trim();
          if (text) {
            clearFalseInterruption();
            await processText(text);
          }
          return;
        }

        if (message.type !== 'audio' || !message.audio) return;

        const pcm16 = Buffer.from(message.audio, 'base64');
        for (const event of detector.accept(pcm16)) {
          if (event.type === 'speech_start') {
            generation += 1;
            sendSocket(socket, { type: 'speech_start' });
            scheduleFalseInterruption();
          }
          if (event.type === 'utterance') {
            queueUtterance(event.audio);
          }
        }
      }

      function queueUtterance(audio) {
        if (processing) {
          pendingUtterance = audio;
          return;
        }
        processUtterance(audio).catch((error) => {
          request.log.error({ error }, 'Realtime utterance processing failed');
          sendSocket(socket, { type: 'error', error: explainProviderError(error) });
        });
      }

      async function processUtterance(audio) {
        processing = true;
        try {
          // New turn: drop any queued audio from the previous reply, then play
          // an instant filler while STT runs.
          const turnGen = ++generation;
          sendSocket(socket, { type: 'clear_audio' });
          sendSocket(socket, { type: 'status', status: 'transcribing' });
          await playFiller(turnGen);

          const text = await getBrowserAgentStt().transcribePcm16(audio);
          request.log.info({ bytes: audio.length, heard: text }, 'STT utterance');
          if (!text || text.length < 2) {
            sendSocket(socket, { type: 'status', status: 'listening' });
            emitFalseInterruption();
            return;
          }
          if (turnGen !== generation) return; // caller barged in during STT
          clearFalseInterruption();
          sendSocket(socket, { type: 'transcript', text });
          await processText(text, turnGen);
        } finally {
          processing = false;
          if (pendingUtterance) {
            const next = pendingUtterance;
            pendingUtterance = null;
            queueUtterance(next);
          }
        }
      }

      async function processText(text, existingGen) {
        clearFalseInterruption();
        // Reuse the generation from processUtterance (which already played the
        // filler); the text-chat path has none, so it bumps and clears here.
        const responseGeneration = existingGen != null ? existingGen : ++generation;
        if (existingGen == null) sendSocket(socket, { type: 'clear_audio' });
        sendSocket(socket, { type: 'status', status: 'thinking' });

        const ttsProvider = getBrowserAgentTts();
        let spokeAny = false;
        let ttsFailed = false;

        // Synthesize and stream one sentence as soon as it's ready. The
        // generation check makes this a barge-in seam: if the caller starts
        // talking, later sentences are dropped.
        const speakSentence = async (sentence) => {
          if (responseGeneration !== generation) return;
          const speakText = normalizeForSpeech(sentence);
          if (!speakText) return;
          try {
            let payload = null;
            if (typeof ttsProvider.synthesizePcm === 'function') {
              const native = await ttsProvider.synthesizePcm(speakText);
              if (native?.pcm?.length) {
                payload = { audio: native.pcm.toString('base64'), format: `pcm16_${native.sampleRate}` };
              }
            } else {
              const audio = await ttsProvider.synthesizeMulaw(speakText);
              if (audio) payload = { audio: audio.toString('base64'), format: 'ulaw_8000' };
            }
            if (payload && responseGeneration === generation) {
              if (!spokeAny) {
                sendSocket(socket, { type: 'status', status: 'speaking' });
                spokeAny = true;
              }
              sendSocket(socket, { type: 'assistant_audio', ...payload });
            }
          } catch (error) {
            if (!ttsFailed) {
              ttsFailed = true;
              sendSocket(socket, { type: 'tts_unavailable', error: explainProviderError(error) });
            }
          }
        };

        let result;
        try {
          if (typeof session.processUserTextStream === 'function') {
            result = await session.processUserTextStream(text, speakSentence);
          } else {
            result = await session.processUserText(text);
            if (result.text) await speakSentence(result.text);
          }
        } catch (error) {
          sendSocket(socket, { type: 'error', error: explainProviderError(error) });
          return;
        }

        // Full transcript for the on-screen panel (audio already streamed above).
        sendSocket(socket, {
          type: 'assistant_text',
          text: result.text,
          transfer: result.transfer,
          orderId: result.orderId
        });
      }

      function scheduleFalseInterruption() {
        awaitingInterruptTranscript = true;
        clearTimeout(falseInterruptionTimer);
        const delay = Number.parseInt(process.env.BROWSER_AGENT_FALSE_INTERRUPTION_MS || '1800', 10);
        falseInterruptionTimer = setTimeout(() => {
          if (!awaitingInterruptTranscript) return;
          if (detector.isSpeaking || processing || pendingUtterance) {
            scheduleFalseInterruption();
            return;
          }
          emitFalseInterruption();
        }, delay);
      }

      function emitFalseInterruption() {
        if (!awaitingInterruptTranscript) return;
        clearTimeout(falseInterruptionTimer);
        falseInterruptionTimer = null;
        awaitingInterruptTranscript = false;
        sendSocket(socket, { type: 'false_interrupt' });
      }

      function clearFalseInterruption() {
        clearTimeout(falseInterruptionTimer);
        falseInterruptionTimer = null;
        awaitingInterruptTranscript = false;
      }
    });
  });
}

function getBrowserAgentSession(service, { sessionId, callerNumber }) {
  if (browserAgentSessions.has(sessionId)) {
    return browserAgentSessions.get(sessionId);
  }

  const session = createAgentSession({
    sessionId,
    callerNumber,
    llm: getBrowserAgentLlm(),
    orderClient: createLocalOrderClient(service),
    logger: fastify.log
  });
  browserAgentSessions.set(sessionId, session);
  pruneBrowserAgentSessions();
  return session;
}

function getBrowserAgentLlm() {
  if (!browserAgentLlm) browserAgentLlm = createLlmProvider();
  return browserAgentLlm;
}

function getBrowserAgentStt() {
  if (!browserAgentStt) browserAgentStt = createSttProvider();
  return browserAgentStt;
}

function getBrowserAgentTts() {
  if (!browserAgentTts) browserAgentTts = createTtsProvider();
  return browserAgentTts;
}

// Short spoken acknowledgements ("bir saniye", "tabii") synthesized once and
// cached. Played the instant the caller's turn ends — before STT/LLM even run —
// so the agent feels responsive on slow hardware instead of dead-silent for
// several seconds. Disable with BROWSER_AGENT_FILLER=false.
const FILLER_TEXTS = (process.env.BROWSER_AGENT_FILLERS || 'Tabii.|Bir saniye.|Bakıyorum.')
  .split('|')
  .map((s) => s.trim())
  .filter(Boolean);
let fillerCache = null;
async function getFillerPayloads() {
  if (fillerCache) return fillerCache;
  const tts = getBrowserAgentTts();
  const out = [];
  for (const text of FILLER_TEXTS) {
    try {
      if (typeof tts.synthesizePcm === 'function') {
        const n = await tts.synthesizePcm(text);
        if (n?.pcm?.length) out.push({ audio: n.pcm.toString('base64'), format: `pcm16_${n.sampleRate}` });
      } else {
        const a = await tts.synthesizeMulaw(text);
        if (a) out.push({ audio: a.toString('base64'), format: 'ulaw_8000' });
      }
    } catch {
      // best-effort; skip a filler that fails to synthesize
    }
  }
  fillerCache = out;
  return fillerCache;
}

function createLocalOrderClient(service) {
  return {
    getMenu: (categoryId) => service.getMenu(categoryId),
    searchMenu: (query) => service.searchMenu(query),
    getOrCreateOrder: (payload) => service.getOrCreateOrder(payload),
    addItem: (orderId, payload) => service.addItem(orderId, payload),
    removeItem: (orderId, itemId) => service.removeItem(orderId, itemId),
    getOrderSummary: (orderId) => service.summarize(orderId),
    confirmOrder: (orderId) => service.confirmOrder(orderId)
  };
}

function pruneBrowserAgentSessions() {
  const maxSessions = 100;
  if (browserAgentSessions.size <= maxSessions) return;
  const deleteCount = browserAgentSessions.size - maxSessions;
  for (const sessionId of Array.from(browserAgentSessions.keys()).slice(0, deleteCount)) {
    browserAgentSessions.delete(sessionId);
  }
}

function sendSocket(socket, payload) {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(payload));
  }
}

function explainProviderError(error) {
  const message = String(error?.message || '');
  const status = error?.status || error?.response?.status;
  const providerMessage = error?.error?.error?.message || error?.error?.message;

  if (status === 401 || /invalid api key/i.test(message) || /invalid api key/i.test(providerMessage || '')) {
    return 'Groq veya TTS sağlayıcısı API anahtarı geçersiz. .env dosyasındaki anahtarları kontrol edip ./run ile yeniden başlatın.';
  }
  if (/GROQ_API_KEY|ELEVENLABS_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_TTS/.test(message)) {
    return `${message} .env dosyasını güncelleyip ./run ile yeniden başlatın.`;
  }
  if (/Could not load the default credentials|Application Default Credentials|@google-cloud\/text-to-speech/i.test(message)) {
    return 'Google TTS kimliği bulunamadı. GOOGLE_APPLICATION_CREDENTIALS yolunu .env içinde ayarlayıp ./run ile yeniden başlatın.';
  }
  return message || 'Agent sağlayıcısı yanıt veremedi.';
}

function registerOrderStream(app, service) {
  const clients = new Set();

  app.get('/api/orders/stream', { preHandler: authorize }, async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    });

    clients.add(reply.raw);
    sendSse(reply.raw, { type: 'init', orders: await service.listOrders() });

    request.raw.on('close', () => {
      clients.delete(reply.raw);
    });
  });

  const broadcast = (event) => {
    for (const client of clients) {
      sendSse(client, event);
    }
  };

  service.on('order:created', (order) => broadcast({ type: 'order:created', order }));
  service.on('order:updated', (order) => broadcast({ type: 'order:updated', order }));
  service.on('order:confirmed', (order) => broadcast({ type: 'order:confirmed', order }));
  service.on('order:statusChanged', (order) => broadcast({ type: 'order:statusChanged', order }));

  const heartbeat = setInterval(() => {
    for (const client of clients) {
      client.write(': heartbeat\n\n');
    }
  }, 20000);
  app.addHook('onClose', async () => clearInterval(heartbeat));
}

function sendSse(client, event) {
  try {
    client.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch {
    client.destroy();
  }
}

async function authorize(request, reply) {
  if (!apiToken) return;

  const authHeader = request.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
  const supplied = bearer || request.headers['x-api-token'] || request.query?.token;

  if (supplied !== apiToken) {
    return reply.code(401).send({ error: 'Yetkisiz istek.' });
  }
}

function normalizeLocalToken(value) {
  const token = String(value || '').trim();
  if (!token || token === 'change-me-before-production') return '';
  return token;
}
