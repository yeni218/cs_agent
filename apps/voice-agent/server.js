import 'dotenv/config';
import Fastify from 'fastify';
import fastifyFormbody from '@fastify/formbody';
import fastifyWebsocket from '@fastify/websocket';
import twilio from 'twilio';
import { transferToHuman } from './handoff.js';
import { createAgentSession } from '../../packages/domain/session-factory.js';
import { GroqLlmProvider } from '../../packages/providers/groq-llm.js';
import { GroqSttProvider } from '../../packages/providers/groq-stt.js';
import { OrderApiClient } from '../../packages/providers/order-api-client.js';
import { createTtsProvider } from '../../packages/providers/tts-provider.js';
import { mulawToPcm16 } from '../../packages/voice-core/mulaw.js';
import { EnergyTurnDetector } from '../../packages/voice-core/turn-detector.js';
import { SemanticEndpointer } from '../../packages/voice-core/semantic-endpointer.js';
import { CallMetrics } from '../../packages/voice-core/metrics.js';
import { sendClear, sendMulawAudio } from '../../packages/voice-core/twilio-playback.js';

const port = Number.parseInt(process.env.VOICE_PORT || '8081', 10);
const publicUrl = process.env.PUBLIC_URL || `http://localhost:${port}`;

const fastify = Fastify({ logger: true });
await fastify.register(fastifyFormbody);
await fastify.register(fastifyWebsocket);

const stt = new GroqSttProvider();
const llm = new GroqLlmProvider();
const tts = createTtsProvider();
const orderClient = new OrderApiClient();
const activeCalls = new Map();

fastify.post('/incoming-call', { preHandler: validateTwilio }, async (request, reply) => {
  const from = request.body?.From || 'unknown';
  const twiml = new twilio.twiml.VoiceResponse();
  const connect = twiml.connect();
  const stream = connect.stream({
    url: `${toWebsocketUrl(publicUrl)}/media-stream`,
    statusCallback: `${publicUrl}/stream-status`,
    statusCallbackMethod: 'POST'
  });
  stream.parameter({ name: 'callerNumber', value: from });

  reply.type('text/xml').send(twiml.toString());
});

fastify.post('/stream-status', { preHandler: validateTwilio }, async (request) => {
  fastify.log.info({ body: request.body }, 'Twilio stream status');
  return { ok: true };
});

fastify.post('/handoff-status', { preHandler: validateTwilio }, async (request, reply) => {
  fastify.log.info({ body: request.body }, 'Handoff status');
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say({ language: 'tr-TR', voice: 'Google.tr-TR-Standard-A' }, 'Görüşme sona erdi. Afiyet olsun.');
  twiml.hangup();
  reply.type('text/xml').send(twiml.toString());
});

fastify.get('/health', async () => ({
  status: 'ok',
  service: 'afiyet-voice-agent',
  activeCalls: activeCalls.size,
  timestamp: new Date().toISOString()
}));

fastify.register(async function registerMediaStream(app) {
  app.get('/media-stream', { websocket: true }, (socket) => {
    const detector = new EnergyTurnDetector({
      adaptiveNoiseFloor: process.env.VOICE_AGENT_ADAPTIVE_VAD !== 'false',
      speechFramesToStart: Number.parseInt(process.env.VOICE_AGENT_SPEECH_FRAMES || '2', 10),
      silenceFramesToEnd: Number.parseInt(process.env.VOICE_AGENT_SILENCE_FRAMES || '25', 10),
      minSpeechBytes: Number.parseInt(process.env.VOICE_AGENT_MIN_SPEECH_BYTES || '4800', 10)
    });
    const endpointer = new SemanticEndpointer({
      maxWaitMs: Number.parseInt(process.env.VOICE_AGENT_ENDPOINT_WAIT_MS || '1000', 10)
    });

    let streamSid = null;
    let callSid = null;
    let session = null;
    let processing = false;
    let pendingUtterance = null;
    let pendingText = '';
    let flushTimer = null;
    let assistantGeneration = 0;
    let heardUser = false;
    const metrics = new CallMetrics();

    socket.on('message', async (data) => {
      try {
        const message = JSON.parse(typeof data === 'string' ? data : data.toString());

        if (message.event === 'start') {
          streamSid = message.start.streamSid;
          callSid = message.start.callSid;
          metrics.sessionId = streamSid;
          const callerNumber = message.start.customParameters?.callerNumber || 'unknown';

          session = createAgentSession({
            sessionId: streamSid,
            callerNumber,
            llm,
            orderClient,
            logger: fastify.log
          });
          activeCalls.set(streamSid, { callSid, callerNumber, startedAt: new Date() });

          setTimeout(() => {
            if (!heardUser && session) {
              speak(session.getGreetingText()).catch((error) => {
                fastify.log.error({ error }, 'Greeting failed');
              });
            }
          }, 500);
          return;
        }

        if (message.event === 'media' && session) {
          const pcm16 = mulawToPcm16(Buffer.from(message.media.payload, 'base64'));
          for (const event of detector.accept(pcm16)) {
            if (event.type === 'speech_start') {
              if (heardUser) metrics.increment('interruptions');
              heardUser = true;
              assistantGeneration += 1;
              clearFlush();
              sendClear(socket, streamSid);
            }
            if (event.type === 'utterance') {
              queueUtterance(event.audio);
            }
          }
          return;
        }

        if (message.event === 'stop') {
          cleanup();
        }
      } catch (error) {
        fastify.log.error({ error }, 'Media stream message failed');
      }
    });

    socket.on('close', cleanup);
    socket.on('error', (error) => fastify.log.error({ error }, 'Media stream socket error'));

    function cleanup() {
      clearFlush();
      if (streamSid) {
        activeCalls.delete(streamSid);
        fastify.log.info({ metrics: metrics.summary() }, 'Call metrics');
      }
    }

    function clearFlush() {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
    }

    // If the caller paused mid-thought, hold the partial briefly and merge the
    // next utterance instead of answering over them.
    function scheduleFlush() {
      clearFlush();
      flushTimer = setTimeout(() => {
        flushTimer = null;
        if (detector.isSpeaking || processing) {
          scheduleFlush();
          return;
        }
        const text = pendingText;
        pendingText = '';
        if (text) {
          respond(text).catch((error) => fastify.log.error({ error }, 'Flush response failed'));
        }
      }, endpointer.maxWaitMs);
    }

    function queueUtterance(audio) {
      if (processing) {
        pendingUtterance = audio;
        return;
      }
      processUtterance(audio).catch((error) => {
        fastify.log.error({ error }, 'Utterance processing failed');
      });
    }

    async function processUtterance(audio) {
      processing = true;
      try {
        const text = await metrics.time('stt', () => stt.transcribePcm16(audio));
        if (!text || text.length < 2) return;

        const combined = pendingText ? `${pendingText} ${text}` : text;
        const verdict = endpointer.analyze(combined);
        fastify.log.info({ streamSid, text, combined, verdict }, 'User utterance transcribed');

        if (!verdict.complete) {
          // Caller likely not finished — buffer and wait for continuation.
          pendingText = combined;
          scheduleFlush();
          return;
        }

        clearFlush();
        pendingText = '';
        await respond(combined);
      } finally {
        processing = false;
        if (pendingUtterance) {
          const next = pendingUtterance;
          pendingUtterance = null;
          queueUtterance(next);
        }
      }
    }

    async function respond(text) {
      metrics.increment('turns');
      const result = await metrics.time('llm', () => session.processUserText(text));

      if (result.transfer) {
        metrics.increment('transfers');
        await transferToHuman({ callSid, reason: 'AI requested handoff' });
        return;
      }

      await speak(result.text);
    }

    async function speak(text) {
      if (!text?.trim()) return;

      const generation = ++assistantGeneration;
      const audio = await metrics.time('tts', () => tts.synthesizeMulaw(text));
      if (!audio || generation !== assistantGeneration) return;

      const chunksSent = sendMulawAudio(socket, streamSid, audio);
      fastify.log.info({ streamSid, chunksSent }, 'Assistant audio sent');
    }
  });
});

try {
  await fastify.listen({ port, host: '0.0.0.0' });
  fastify.log.info(`Afiyet voice agent listening on http://localhost:${port}`);
} catch (error) {
  fastify.log.error(error);
  process.exit(1);
}

function toWebsocketUrl(url) {
  return url.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
}

async function validateTwilio(request, reply) {
  if (process.env.VALIDATE_TWILIO_SIGNATURE !== 'true') return;

  const signature = request.headers['x-twilio-signature'];
  const url = `${publicUrl}${request.url}`;
  const valid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    request.body || {}
  );

  if (!valid) return reply.code(403).send({ error: 'Invalid Twilio signature.' });
}
