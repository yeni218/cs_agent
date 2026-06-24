# Enterprise Insurance Voice Agent — Plan

Repurposing the Afiyet voice agent (built for restaurant ordering) into an
enterprise-grade Turkish voice agent for the PoliServis insurance agency
platform.

> Status: planning. This document is the source of truth for the migration.
> Companion code lives in `apps/voice-agent`, `packages/domain`,
> `packages/voice-core`, and new `/api/agent/*` endpoints to be added in the
> `PoliCore` .NET backend.

## 1. System map (the three projects)

| Project | Stack | Role |
|---|---|---|
| `afiyet-ai-main` | Node 20, Fastify, Twilio Media Streams, Groq STT/LLM, Google TTS | The voice agent (this repo) |
| `backup_poliservis` / `PoliCore` | .NET 8 Web API, JWT auth, repository pattern, SOAP integrations to ~15 Turkish insurers | Backend / system of record |
| `polireact` | React + TypeScript (TailAdmin), quote forms, policy lists | Agency staff frontend |

**Domain (Turkish insurance):**
- Branches: **Kasko** (comprehensive auto), **Trafik** (mandatory MTPL),
  **Seyahat Sağlık** (travel health).
- Multi-tenant: `acenteId` (agency), `kaynakId` (channel/source), `kullaniciId` (user).
- Entities: `Teklif` (quote), `Police` (policy), `Kisi/Musteri` (customer),
  `Acente` (agency), `SigortaSirketi` (insurer).
- Existing flows: SMS OTP verification (`SmsController`), 3D Secure payment,
  PDF quote sharing, multi-insurer quote comparison.

## 2. Current agent review

**Keep (good bones):**
- Two-app split: voice gateway is separate from business state.
- Provider adapters (`createTtsProvider`, swappable STT/LLM) — provider swaps are explicit.
- Tools as the boundary between conversation and business logic.
- One isolated session per call; barge-in via `sendClear` + generation counter.

**Replace / fix:**
- Domain is restaurant menu/orders → rebuild for quote/policy (§5).
- `EnergyTurnDetector` is a raw amplitude gate — cuts users off, triggers on noise (§6).
- `tr-TR-Standard-A` TTS is robotic — upgrade voice (§6).
- `GroqSttProvider` writes a temp WAV per utterance — move to in-memory (latency).
- `GroqLlmProvider` `temperature: 0.5` — too high for coverage answers; drop toward 0.
- `AgentSession.trimConversation` is naive (first + last 24) — add summarization.
- `FileOrderStore` → production store (Postgres/Cloud SQL).
- No metrics, recording, audit log, or PII handling — mandatory for insurance (§7).
- Greeting fires on a blind 500ms timer — tie to confirmed stream start.

**Backend note:** `TeklifController.DetayListeGetir` contains `Thread.Sleep(2000)`
inside an async action — blocks a thread-pool thread and will not survive
concurrent agent traffic. Fix before connecting the agent.

## 3. Target architecture

Insert a **deterministic dialogue orchestrator** between STT and the LLM. The
LLM handles NLU + phrasing; the state machine owns control flow. This is the
core enterprise pattern: pair LLMs with deterministic conversation graphs to
constrain agents inside known intents and reduce hallucinations on policy answers.

```
Caller → Twilio Media Streams
  → voice-agent gateway (Node)
      → Turn detection (Silero VAD + semantic endpointing)
      → STT (streaming, in-memory)
      → Dialogue Orchestrator  ← NEW
          • intent router (quote / policy-status / claim / payment / human)
          • per-intent state machine (auth → collect → quote → confirm)
          • LLM for NLU + phrasing only, not control flow
      → Tool calls → PoliCore /api/agent/* (scoped agent JWT, tenant-isolated)
      → TTS (upgraded Turkish voice)
  → Audit/recording + metrics sink (every turn logged immutably)
```

Latency target: **sub-700ms** end-to-end response. Above ~800ms feels laggy.

## 4. Open-source projects to leverage

| Project | Borrow | Notes |
|---|---|---|
| **LiveKit Agents** | Turn-detector model, metrics taxonomy, session lifecycle | Reference standard (WebRTC, native telephony, ~379 contributors, active 2026). Full migration only if multi-region/video needed. |
| **Pipecat** (Daily) | Pipeline decomposition | Best if a Python pipeline is preferred. |
| **Bolna** | Config-driven provider selection; Twilio/Plivo/Exotel telephony patterns | Closest OSS "platform" feel. |
| **Vocode** | Endpointing / interrupt-sensitivity knobs | Reference only. |

**Decision:** stay on the existing Node app; adopt LiveKit's turn-detector model
+ metrics taxonomy and Bolna's config-driven provider selection. Do not fork a
runtime yet.

## 5. Insurance tooling (maps to PoliCore controllers)

Replace `packages/domain/agent-tools.js`:

| Tool | Backend |
|---|---|
| `authenticate_caller(tc_no \| policy_no, otp)` | `SmsController` + `KisiController` |
| `get_customer_policies(customer_id)` | `PoliceController` |
| `start_quote(branch: kasko\|trafik\|seyahat)` | `TeklifController/kaydet` |
| `collect_vehicle(plaka, tc, ruhsat)` | `AracController` |
| `compare_quotes(quote_id)` | `TeklifController/detay-liste-getir` |
| `read_back_quote(quote_id)` | formatted TL prices; never invent coverage |
| `send_quote_link(channel: sms\|whatsapp)` | `SmsController` (reuse `TeklifListesiPaylas`) |
| `transfer_to_agent(reason)` | human handoff for binding/payment |

Add a dedicated `/api/agent/*` surface in PoliCore with a scoped agent JWT and
`acenteId` tenant scoping — the voice agent must not hold a full user token.

## 6. "Flawless talking" — Turkish voice

**Turn-taking** (biggest quality lever):
- Replace `EnergyTurnDetector` with **Silero VAD** (small ONNX, runs in Node).
- Add **semantic endpointing** (LiveKit turn-detector model) so the agent waits
  through hesitations ("şey… bir saniye…").

**TTS:**
- Quick win: Google `tr-TR-Chirp3-HD`/Neural, or ElevenLabs (adapter exists) for a warm voice.
- Long term: the `training/voice/` XTTS-v2 Turkish fine-tune for an owned, branded
  voice — only with explicit commercial + synthetic-voice rights. 2026 OSS TTS
  leaders (CosyVoice2, Fish-Speech, IndexTTS-2) don't advertise Turkish, so
  XTTS-v2 remains the best self-hosted Turkish option.

**STT:** keep Groq Whisper-large-v3 (strong Turkish); move off the temp-file path
to in-memory streaming.

## 7. Compliance & security (Turkey)

Deployments fail compliance reviews on auditability, not AI quality.
- **KVKK** (Turkish GDPR): spoken recording-consent at call start; data minimization.
- **SEDDK** insurance-distribution rules: no misrepresentation of coverage; a
  licensed human completes binding/payment.
- **Immutable audit log** of every turn (transcript + tool calls + decisions);
  extend `LogController`.
- **PII redaction at the STT layer** (TC Kimlik No, card numbers) before logs/LLM context.
- **Tenant isolation** per `acenteId`; scoped tokens; rotate previously exposed keys.
- Enable `VALIDATE_TWILIO_SIGNATURE=true` in production.
- Lower LLM `temperature` toward 0 for coverage/quote answers.

## 8. Roadmap

1. **Domain swap** — insurance tools + prompt; new `PoliCore /api/agent/*` (scoped JWT); fix `Thread.Sleep`. ✅ scaffolded (mock-backed)
2. **Dialogue orchestrator** — deterministic intent routing + quote slot-filling; binding/payment/human/complaint always hand off without the LLM. ✅ first cut (see §9)
3. **Voice quality** — semantic endpointing + adaptive VAD ✅; TTS upgraded to Wavenet/Chirp-safe ✅; Silero scaffolded; XTTS-v2 later.
4. **Compliance layer** — spoken KVKK consent ✅; heuristic PII redaction ✅; immutable hash-chained audit log ✅; tenant scoping via the PoliCore client (existing). Provider-layer STT redaction still recommended for regulated data.
5. **Observability** — per-call STT/LLM/TTS latency + turn/transfer counts ✅ (`CallMetrics`, LiveKit-style taxonomy), logged at call end. Metrics sink/export still open.
6. **Production store** — `PostgresOrderStore` + env-driven `createOrderStore` factory behind the existing `OrderService` interface ✅ (file store remains the default; `pg` is an optional, lazy-imported dependency). Live-DB integration test + Cloud SQL deploy config still open.

## 9. Implemented so far

**Insurance domain (mock-backed, no live backend):**
- `packages/providers/poliservis-client.js` — real PoliCore route adapter (`Sms/gonder`,
  `Sms/dogrula`, `Kisi/getir`, `Teklif/*`), unwraps `{ BasariliMi, Hata }`, tenant-scoped.
- `packages/providers/mock-poliservis-client.js` — in-memory mock (OTP `123456`).
- `packages/domain/insurance-prompts.js`, `insurance-tools.js`, `insurance-session.js` —
  8 tools with auth-gating; binding/payment deliberately excluded (human handoff only).
- `packages/domain/session-factory.js` — `AGENT_DOMAIN` (insurance|restaurant),
  `POLISERVIS_MODE` (mock|live). Wired into both servers.

**Turn-taking / "flawless talking":**
- `packages/voice-core/semantic-endpointer.js` — Turkish-aware endpointing; holds the
  turn through trailing conjunctions/fillers ("…ve", "…şey") instead of cutting the caller off.
- `EnergyTurnDetector` adaptive noise floor (`adaptiveNoiseFloor`, opt-in; on by default
  for the phone agent) — learns ambient energy and suppresses moderate transients.
- `packages/voice-core/turn-detector-factory.js` — `TURN_DETECTOR=energy|silero` with
  graceful fallback.
- `packages/voice-core/silero-vad.js` — **scaffold** for Silero VAD (needs
  `onnxruntime-node` + a v5 model; not exercised in tests). The immediately effective
  upgrades are the adaptive floor + semantic endpointer, both wired into the phone server
  and covered by tests.

**Deterministic dialogue layer:**
- `packages/domain/intent-classifier.js` — Turkish keyword intent routing
  (`binding_payment`, `human`, `complaint`, `existing_quote`, `policy_status`,
  `new_quote`, `greeting`) + branch detection (kasko/trafik/seyahat).
- `packages/domain/quote-flow.js` — per-branch required slots + next-missing-slot logic.
- `packages/domain/dialogue-orchestrator.js` — runs before the LLM; binding/payment,
  human requests, and complaints hand off deterministically (the compliance-critical
  "AI never binds/pays" rule does not depend on the model). Wired into `InsuranceSession`.

**Voice quality:**
- `google-tts.js` is now Chirp/Neural-safe (omits `pitch` for Chirp voices) and the
  earlier missing-`await` on the client was fixed. Recommended voice raised from
  `tr-TR-Standard-A` to `tr-TR-Wavenet-E` (or Chirp3-HD).

**Compliance & observability:**
- `packages/voice-core/pii-redactor.js` — heuristic `redact`/`redactDeep` for TC Kimlik No,
  payment cards (keeps last 4), Turkish phone numbers, and IBANs. Applied to logs and the
  audit trail, not to live tool args (the agent needs the real TCKN to authenticate).
- `packages/domain/audit-log.js` — append-only, SHA-256 hash-chained audit log; `verify()`
  detects any edit/deletion. PII redacted before write; creates its parent dir on init. A
  single shared instance is provided by `session-factory.js`; `InsuranceSession` records every
  user/assistant turn, tool call, and handoff. File backend for dev — point at WORM storage in prod.
- `packages/voice-core/metrics.js` — `CallMetrics`: per-stage STT/LLM/TTS latency (avg/p95/max)
  plus turn/interruption/transfer/error counts; wired into the phone server (`apps/voice-agent/server.js`),
  summary logged on call cleanup.
- KVKK recording-consent is spoken in the insurance greeting (`insurance-session.js`).

**Production store:**
- `packages/storage/postgres-order-store.js` — same `init/listOrders/getOrder/saveOrder`
  interface as `FileOrderStore`; jsonb-per-order keyed by id, `bigserial seq` preserves
  insertion order, auto-creates its table on init. `pg` is an optional dependency,
  lazy-imported on `init()` (table name validated against injection).
- `packages/storage/order-store-factory.js` — `createOrderStore` selects `ORDER_STORE=file|postgres`,
  defaults to file, and falls back to file if postgres is selected without `DATABASE_URL`.
  Wired into `apps/api/server.js`.

Env reference for the above lives in `.env.example`. Test coverage: 31 tests passing.

## References

- LiveKit Agents — https://github.com/livekit/agents
- Pipecat — https://github.com/pipecat-ai/pipecat
- Bolna — https://github.com/bolna-ai/bolna
- AssemblyAI, orchestration tools 2026 — https://www.assemblyai.com/blog/orchestration-tools-ai-voice-agents
- Parloa, AI voice agents for insurance 2026 — https://www.parloa.com/knowledge-hub/best-ai-voice-agents-for-insurance/
- Fini Labs, compliance-grade voice agents — https://www.usefini.com/guides/compliance-grade-ai-voice-agents-fintech-healthcare-telecom
- SiliconFlow, best open-source TTS 2026 — https://www.siliconflow.com/articles/en/best-open-source-text-to-speech-models
