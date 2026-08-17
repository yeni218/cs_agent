// Afiyet Infra API — our own voice-agent API, Vapi-compatible.
//
// Exposes the SAME endpoints + payload shapes as api.vapi.ai, backed by our
// stack (Groq LLM/STT + Inworld TTS). Switch the whole product between Vapi and
// us by changing one base URL — see CONTRACT.md.
//
// Auth: Authorization: Bearer <API_KEY>  (set API_KEY to require it)
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createStore } from './src/store.js';
import { buildAssistant, applyAssistantPatch, buildCall, buildPhoneNumber } from './src/schema.js';
import { runCall } from './src/engine.js';
import { appendAuditEvent } from './src/audit.js';
import { computeCost } from './src/pricing.js';
import { costReport, normalizeVerimorCdr, reconcileCallCost } from './src/telephony.js';
import { groqReady } from './src/providers/groq.js';
import { inworldReady } from './src/providers/inworld.js';

const PORT = Number.parseInt(process.env.PORT || '8790', 10);
const API_KEY = process.env.API_KEY || '';
const store = await createStore();

// Seed one assistant if none exist (first run).
if ((await store.list('assistants', { limit: 1 })).length === 0) {
  await store.put('assistants', buildAssistant({ name: 'Afiyet Sipariş Asistanı', transcriber: { language: 'tr' } }));
}

function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(body));
}
const readBody = (req) => new Promise((resolve) => {
  let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
});

async function recordUsageEvents(call) {
  const b = call.costBreakdown || {};
  const parts = [
    ['groq_stt', 'stt'],
    ['groq_llm', 'llm'],
    ['inworld_tts', 'tts'],
    ['telephony', 'transport'],
    ['media', 'media'],
    ['platform', 'platform']
  ];
  for (const [source, key] of parts) {
    if (!Number.isFinite(Number(b[key])) || Number(b[key]) === 0) continue;
    await store.put('usageEvents', {
      id: `use_${randomUUID().slice(0, 12)}`,
      callId: call.id,
      assistantId: call.assistantId || null,
      tenantId: call.tenantId || null,
      source,
      metric: key,
      amountUsd: Number(b[key]),
      raw: b,
      createdAt: new Date().toISOString()
    });
  }
}

function transcriptFromMessages(messages = []) {
  return messages.map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.message || m.text || m.content || ''}`).join('\n');
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const seg = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    const method = req.method;
    const limit = Number.parseInt(url.searchParams.get('limit') || '100', 10);

    if (seg[0] === 'health') {
      return send(res, 200, { status: 'ok', service: 'afiyet-infra-api', vapiCompatible: true, providers: { llm: groqReady ? 'groq' : 'mock', stt: groqReady ? 'groq' : 'mock', tts: inworldReady ? 'inworld' : 'mock' } });
    }

    if (API_KEY && req.headers.authorization !== `Bearer ${API_KEY}`) return send(res, 401, { message: 'Unauthorized' });

    // ---------------- Assistants ----------------
    if (seg[0] === 'assistant') {
      const id = seg[1];
      if (!id && method === 'GET') return send(res, 200, await store.list('assistants', { limit }));
      if (!id && method === 'POST') return send(res, 201, await store.put('assistants', buildAssistant(await readBody(req))));
      if (id) {
        const a = await store.get('assistants', id);
        if (!a) return send(res, 404, { message: 'Assistant not found' });
        if (method === 'GET') return send(res, 200, a);
        if (method === 'PATCH' || method === 'PUT') return send(res, 200, await store.put('assistants', applyAssistantPatch(a, await readBody(req))));
        if (method === 'DELETE') { await store.del('assistants', id); return send(res, 200, a); }
      }
      return send(res, 405, { message: 'Method not allowed' });
    }

    // ---------------- Calls ----------------
    if (seg[0] === 'call') {
      const id = seg[1];
      if (!id && method === 'GET') {
        const assistantId = url.searchParams.get('assistantId');
        return send(res, 200, await store.list('calls', { limit, where: assistantId ? { assistantId } : {} }));
      }
      if (!id && method === 'POST') {
        const body = await readBody(req);
        const assistant = (await store.get('assistants', body.assistantId)) || (await store.list('assistants', { limit: 1 }))[0];
        if (!assistant) return send(res, 400, { message: 'assistantId required (no assistants exist)' });
        const call = buildCall({ ...body, assistantId: assistant.id });
        // If input/audio provided, run a turn now (web/test call). Otherwise it
        // stays queued for a telephony webhook to drive.
        if (body.input || body.audio) {
          call.status = 'in-progress';
          call.startedAt = new Date().toISOString();
          const audio = body.audio ? Buffer.from(body.audio, 'base64') : null;
          const result = await runCall(assistant, {
            input: body.input,
            audio,
            audioSec: body.audioSec,
            durationSec: body.durationSec,
            providerUsage: body.providerUsage
          });
          Object.assign(call, {
            status: 'ended', endedReason: 'customer-ended-call', endedAt: new Date().toISOString(),
            messages: result.messages, transcript: result.transcript, analysis: result.analysis,
            cost: result.cost, costBreakdown: result.costBreakdown, durationSec: result.durationSec
          });
        }
        const saved = await store.put('calls', call);
        if (saved.status === 'ended') await recordUsageEvents(saved);
        return send(res, 201, saved);
      }
      if (id) {
        const c = await store.get('calls', id);
        if (!c) return send(res, 404, { message: 'Call not found' });
        if (method === 'GET') return send(res, 200, c);
        if (method === 'PATCH') { Object.assign(c, await readBody(req), { updatedAt: new Date().toISOString() }); return send(res, 200, await store.put('calls', c)); }
        if (method === 'DELETE') { await store.del('calls', id); return send(res, 200, c); }
      }
      return send(res, 405, { message: 'Method not allowed' });
    }

    // -------- Telephony / production ingestion --------
    if (seg[0] === 'telephony') {
      if (seg[1] === 'ingest-call' && method === 'POST') {
        const body = await readBody(req);
        const assistant = body.assistantId
          ? await store.get('assistants', body.assistantId)
          : (await store.list('assistants', { limit: 1 }))[0];
        if (!assistant) return send(res, 400, { message: 'assistantId required (no assistants exist)' });

        const call = buildCall({
          id: body.callId || body.id,
          assistantId: assistant.id,
          type: body.type || 'inboundPhoneCall',
          customer: body.customer || { number: body.from || null, name: body.customerName || null }
        });
        call.tenantId = body.tenantId || body.tenant_id || assistant.tenantId || null;
        call.externalCallId = body.externalCallId || body.external_call_id || null;
        call.status = 'ended';
        call.endedReason = body.endedReason || 'telephony-ended-call';
        call.startedAt = body.startedAt || new Date(Date.now() - Number(body.durationSec || 0) * 1000).toISOString();
        call.endedAt = body.endedAt || new Date().toISOString();

        let result;
        if (body.input || body.audio) {
          result = await runCall(assistant, {
            input: body.input,
            audio: body.audio ? Buffer.from(body.audio, 'base64') : null,
            audioSec: body.audioSec,
            durationSec: body.durationSec,
            providerUsage: body.providerUsage
          });
        } else {
          const usage = body.usage || {};
          const costBreakdown = computeCost({
            audioSec: body.audioSec ?? usage.audioSec ?? body.durationSec ?? 0,
            promptTokens: usage.promptTokens || usage.llmPromptTokens || 0,
            completionTokens: usage.completionTokens || usage.llmCompletionTokens || 0,
            ttsChars: usage.ttsChars || usage.ttsCharacters || 0,
            durationSec: body.durationSec || 0,
            providerUsage: body.providerUsage
          });
          result = {
            messages: body.messages || [],
            transcript: body.transcript || transcriptFromMessages(body.messages || []),
            analysis: body.analysis || {
              summary: body.summary || body.transcript || 'Telephony call ingested',
              structuredData: body.structuredData || {},
              successEvaluation: body.answered === false ? 'failed' : 'success'
            },
            costBreakdown,
            cost: body.cost ?? costBreakdown.total,
            durationSec: body.durationSec || costBreakdown.durationSeconds || 0
          };
        }

        Object.assign(call, {
          answered: body.answered !== false,
          outcome: body.outcome || result.analysis?.structuredData?.intent || 'faq',
          orderAmount: Number(body.orderAmount ?? body.order_amount ?? result.analysis?.structuredData?.total ?? 0),
          customerName: body.customerName || result.analysis?.structuredData?.customerName || null,
          summary: result.analysis?.summary || body.summary || '',
          durationSec: result.durationSec,
          messages: result.messages,
          transcript: result.transcript,
          analysis: result.analysis,
          recordingUrl: body.recordingUrl || body.recording_url || body.recordingPath || null,
          cost: result.cost,
          costBreakdown: result.costBreakdown
        });

        const saved = await store.put('calls', call);
        await recordUsageEvents(saved);
        await appendAuditEvent(store, { action: 'telephony.call_ingested', entityType: 'call', entityId: saved.id, metadata: { externalCallId: saved.externalCallId } });
        return send(res, 201, saved);
      }

      if (seg[1] === 'verimor' && seg[2] === 'cdr' && method === 'POST') {
        const cdr = normalizeVerimorCdr(await readBody(req));
        await store.put('telephonyCdrs', cdr);
        let call = cdr.callId ? await store.get('calls', cdr.callId) : null;
        if (!call && cdr.externalCallId) call = (await store.list('calls', { limit: 1, where: { externalCallId: cdr.externalCallId } }))[0] || null;

        let reconciliation = null;
        if (call) {
          reconciliation = reconcileCallCost(call, cdr);
          call.durationSec = cdr.durationSec || call.durationSec;
          call.cost = reconciliation.actualCost;
          call.costBreakdown = reconciliation.breakdown;
          call.updatedAt = new Date().toISOString();
          await store.put('calls', call);
          await store.put('reconciliations', reconciliation);
          await appendAuditEvent(store, {
            action: 'telephony.cdr_reconciled',
            entityType: 'call',
            entityId: call.id,
            metadata: { cdrId: cdr.id, delta: reconciliation.delta, status: reconciliation.status }
          });
        }
        return send(res, 201, { cdr, reconciliation });
      }

      return send(res, 404, { message: `no telephony route /${seg.slice(1).join('/')}` });
    }

    if (seg[0] === 'admin' && seg[1] === 'cost-report' && method === 'GET') {
      const tenantId = url.searchParams.get('tenantId');
      const calls = await store.list('calls', { limit, where: tenantId ? { tenantId } : {} });
      return send(res, 200, costReport(calls));
    }

    // ---------------- Phone numbers ----------------
    if (seg[0] === 'phone-number') {
      const id = seg[1];
      if (!id && method === 'GET') return send(res, 200, await store.list('phoneNumbers', { limit }));
      if (!id && method === 'POST') return send(res, 201, await store.put('phoneNumbers', buildPhoneNumber(await readBody(req))));
      if (id) {
        const p = await store.get('phoneNumbers', id);
        if (!p) return send(res, 404, { message: 'Phone number not found' });
        if (method === 'GET') return send(res, 200, p);
        if (method === 'PATCH') { Object.assign(p, await readBody(req), { updatedAt: new Date().toISOString() }); return send(res, 200, await store.put('phoneNumbers', p)); }
        if (method === 'DELETE') { await store.del('phoneNumbers', id); return send(res, 200, p); }
      }
      return send(res, 405, { message: 'Method not allowed' });
    }

    return send(res, 404, { message: `no route /${seg.join('/')}` });
  } catch (err) {
    return send(res, 500, { message: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Afiyet Infra API (Vapi-compatible) on http://localhost:${PORT}`);
  console.log(`  providers: LLM/STT=${groqReady ? 'groq' : 'mock'}  TTS=${inworldReady ? 'inworld' : 'mock'}`);
  console.log('  /assistant  /call  /phone-number  /health   (Bearer auth if API_KEY set)');
});
