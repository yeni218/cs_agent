# Afiyet Infra API — Vapi-compatible contract

The **exact endpoints + payloads**, matching api.vapi.ai so switching is a
base-URL change. Backed by **Groq** (LLM + STT) and **Inworld** (TTS).

Base URL: `http://localhost:8790` · Auth: `Authorization: Bearer <API_KEY>` (if set).

## Assistants

| Method | Path | Body |
|---|---|---|
| GET | `/assistant?limit=` | — |
| POST | `/assistant` | assistant (see below) |
| GET | `/assistant/{id}` | — |
| PATCH | `/assistant/{id}` | partial assistant |
| DELETE | `/assistant/{id}` | — |

**Assistant object**
```json
{
  "id": "asst_1a2b3c4d",
  "orgId": "org_afiyet",
  "name": "Afiyet Sipariş Asistanı",
  "createdAt": "…", "updatedAt": "…",
  "transcriber": { "provider": "groq", "model": "whisper-large-v3-turbo", "language": "tr" },
  "model": { "provider": "groq", "model": "llama-3.1-8b-instant", "temperature": 0.3, "maxTokens": 250,
             "messages": [{ "role": "system", "content": "…" }] },
  "voice": { "provider": "inworld", "voiceId": "Ashley" },
  "firstMessage": "Merhaba, size nasıl yardımcı olabilirim?",
  "analysisPlan": { "structuredDataSchema": { "type": "object", "properties": { "intent": {}, "total": {}, "customerName": {}, "items": {} } } },
  "metadata": {}
}
```
Same field names as Vapi (`transcriber`/`model`/`voice`/`firstMessage`/`analysisPlan`);
only the `provider` values differ (`groq`, `inworld`).

## Calls

| Method | Path | Body |
|---|---|---|
| GET | `/call?limit=&assistantId=` | — |
| POST | `/call` | `{ assistantId, type?, customer?, input?, audio?, durationSec?, audioSec?, providerUsage? }` |
| GET | `/call/{id}` | — |
| PATCH | `/call/{id}` | partial |
| DELETE | `/call/{id}` | — |

`POST /call` runs a turn immediately when `input` (text) or `audio` (base64 wav)
is given — STT→LLM→TTS via our providers — and returns the completed call.
Without them the call stays `queued` for a telephony webhook to drive.

**Call object**
```json
{
  "id": "call_…", "orgId": "org_afiyet", "assistantId": "asst_…", "type": "inboundPhoneCall",
  "status": "ended", "endedReason": "customer-ended-call",
  "createdAt": "…", "startedAt": "…", "endedAt": "…",
  "customer": { "number": "+90…" },
  "messages": [ { "role": "bot", "message": "…", "time": 0 }, { "role": "user", "message": "…" } ],
  "transcript": "AI: …\nUser: …",
  "recordingUrl": null,
  "analysis": { "summary": "…", "structuredData": { "intent": "order", "items": [], "total": 0 }, "successEvaluation": "success" },
  "cost": 0.021,
  "costBreakdown": { "transport": 0, "stt": 0, "llm": 0, "tts": 0, "media": 0,
                     "platform": 0, "vapi": 0, "total": 0.015,
                     "perMinute": 0.015, "targetStatus": "ok",
                     "llmPromptTokens": 0, "llmCompletionTokens": 0, "ttsCharacters": 0 }
}
```
Matches Vapi's `messages` (roles `bot`/`user`), `analysis.structuredData`,
`cost`, and `costBreakdown` — so the E2E-SIS backend maps it with **zero code
changes**.

## Phone numbers
`GET/POST /phone-number`, `GET/PATCH/DELETE /phone-number/{id}` →
`{ id, number, provider, assistantId, status }`.

## Production telephony and cost proofing

These routes are not part of Vapi's public contract; they are our production
surface for the self-hosted worker and Verimor reconciliation.

| Method | Path | Body |
|---|---|---|
| POST | `/telephony/ingest-call` | completed call from worker: `{ assistantId, tenantId?, externalCallId?, messages?, transcript?, analysis?, durationSec, audioSec?, usage?, providerUsage?, recordingPath? }` |
| POST | `/telephony/verimor/cdr` | Verimor CDR: `{ callId? externalCallId?, tenantId?, durationSec, billedSec, costTry, exchangeRate }` |
| GET | `/admin/cost-report?tenantId=&limit=` | blended COGS/min report |

`providerUsage` can override estimates with actual invoice values:

```json
{
  "sttUsd": 0.0007,
  "llmUsd": 0.0001,
  "ttsUsd": 0.0036,
  "transportUsd": 0.0063,
  "mediaUsd": 0,
  "platformUsd": 0.0025
}
```

If a Verimor CDR changes the actual call cost by more than `$0.002`, the
reconciliation status becomes `review`.

## Switching Vapi ↔ us
In `END-TO-END-SIS/backend`:
```bash
DATA_SOURCE=vapi VAPI_API_KEY=<key> VAPI_BASE_URL=http://localhost:8790 npm start
```
Because this API is Vapi-shaped, the backend's existing mappers/redaction work
unchanged — the customer still never sees cost.
