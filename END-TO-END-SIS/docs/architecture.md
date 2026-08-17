# END-TO-END-SIS — Architecture

The end-to-end sovereign voice system, and how the pieces in this repo fit.

## Two-layer strategy

1. **Control/observability layer** (this repo, working now): the **mobile
   dashboard** + a **Vapi-shaped API**. We use Vapi's ready endpoints today, but
   design our own to match, so switching is a base-URL change.
2. **Sovereign voice layer** (from the `afiyet-ai` project): the self-hosted
   **STT → dialogue → LLM → TTS** cascade that runs entirely in Türkiye.

```
┌───────────────────────────── mobile/ (React Native) ─────────────────────────────┐
│  Analiz (cost/analytics)   Çağrılar (calls)   Asistanlar (assistants)   Ayarlar   │
└───────────────────────────────────────┬───────────────────────────────────────────┘
                                         │  ApiClient (one swappable seam)
                     ┌───────────────────┴───────────────────┐
                     ▼                                         ▼
             Vapi Cloud (now)                         backend/ (ours, later)
        GET /assistant  GET /call                 GET /assistant  GET /call
                                                          │
                                                          ▼
                              ┌──────── sovereign voice cascade (Türkiye) ────────┐
                              │ Telephony (Jambonz/Asterisk)                       │
                              │   → STT   (faster-whisper, streaming)              │
                              │   → Dialogue orchestrator (deterministic)          │
                              │   → LLM   (Turkish model via vLLM)                 │
                              │   → TTS   (Piper / XTTS)                            │
                              │   → Postgres + hash-chained audit log              │
                              └────────────────────────────────────────────────────┘
```

## Why Vapi-shaped

Vapi already solved the boring parts (assistant CRUD, call records, cost
breakdown, telephony orchestration). We borrow its **API shape** so we can:

- ship the dashboard immediately against real Vapi data, and
- replace Vapi provider-by-provider without touching the app — the app only ever
  knows `/assistant` and `/call`.

The `costBreakdown` fields (`stt`, `llm`, `tts`, `transport`, `vapi`) map cleanly
onto our own per-stage costs, so the same **Analiz** screen visualizes either
Vapi's costs or our sovereign cascade's costs.

## Data-residency fit

- Using **Vapi** (US cloud) is fine for restaurants / general SMB with proper
  KVKK paperwork (SCCs + notification) — see the residency research in
  `afiyet-ai/docs/`.
- For **consulates / health-sensitive** clients, we run the **sovereign backend**
  so audio, transcripts, and call records never leave Türkiye. Same dashboard,
  different base URL.

## What to build next (to bypass Vapi)

1. Flesh out `backend/` so `/assistant` and `/call` read from the sovereign
   cascade's store + audit log (replace the in-memory stubs).
2. Add write endpoints Vapi has (`POST /assistant`, `POST /call`) as needed.
3. Add auth/tenancy (`acenteId`) consistent with the insurance backend.
4. Point the mobile app's **Ayarlar → Afiyet Backend** at it. Done — no app
   rewrite.
