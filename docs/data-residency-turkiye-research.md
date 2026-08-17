# Data Residency in Türkiye — Research for Selling to Consulates / Government

> Question driving this doc: we want to sell this voice agent to consulates
> (diplomatic missions) and other Turkish public bodies. The requirement they
> impose is that **personal data must not leave Türkiye**. What does that mean
> for this codebase, and which open-source projects let us run the whole
> pipeline inside Türkiye?

## 1. Where does data leave the country today?

Every audio second and every transcript in a call is **personal data** under
KVKK — and for insurance flows it is often **special-category** data (TC Kimlik
No, health for *Seyahat Sağlık*, payment/IBAN). For a consulate it is also
citizen + diplomatic data, i.e. the most sensitive tier.

Today the pipeline ships that data to four foreign clouds:

| Layer | Current provider (in repo) | Where it runs | Data that leaves TR |
|---|---|---|---|
| Telephony / media | **Twilio** Media Streams | US | Raw call audio (both parties) |
| STT | **Groq** Whisper (`groq-stt.js`) | US | Call audio → transcript |
| LLM | **Groq** Llama (`groq-llm.js`) | US | Full transcript + tool args (TCKN etc.) |
| TTS | **Google Cloud TTS** (`google-tts.js`) | Global | Agent text (may echo PII) |
| TTS (fallback) | **ElevenLabs** | US | Agent text |

So the current stack is a **non-starter for a consulate** as-is: five separate
cross-border transfers, several of special-category data.

## 2. What the law actually requires (short version)

- KVKK (Law 6698, amended by Law 7499 in 2024) does **not** ban cross-border
  transfer outright. It allows it via **adequacy decision**, **standard
  contractual clauses (SCCs)**, or **binding corporate rules** — plus a
  five-business-day notification of any signed SCC to the Authority (missing
  that deadline is the #1 fine trigger in 2026 enforcement; fines run into the
  millions of TRY).
- **But**: as of early 2026 the KVKK Board has published **no adequacy list**,
  so US clouds cannot be justified by adequacy. And in practice, **public-sector
  / diplomatic buyers do not accept SCCs for special-category citizen data** —
  they demand the data physically stay on Turkish soil. KVKK enforcement is
  explicitly "pushing enterprises to keep Turkish citizens' personal data on
  Turkish soil."

**Practical conclusion:** to sell to consulates, don't try to legally justify
the foreign transfer — **eliminate it**. Run the entire pipeline on Turkish
infrastructure (sovereign cloud or on-prem). This is a data-*localization*
posture, stricter than baseline KVKK, and it is the realistic bar for
government/diplomatic buyers.

## 3. The good news: the architecture already supports this

The repo was built around **provider adapters** (`createTtsProvider`, swappable
STT/LLM, `order-store-factory`, `turn-detector-factory`). That is exactly the
seam we need — swapping a cloud provider for a self-hosted one is a config +
adapter change, not a rewrite. The compliance layer already added on this branch
(hash-chained audit log, PII redaction, Postgres store, KVKK spoken consent)
is the other half of what a public-sector review checks.

The remaining work is: **replace each foreign endpoint with a self-hostable,
open-source equivalent deployed in a Türkiye data center.**

## 4. Self-hostable open-source replacements (per layer)

### Telephony / media (replace Twilio)
- **Jambonz** — self-hosted, open-source CPaaS. Gives a Twilio-like webhook +
  **WebSocket media-stream** interface, so `apps/voice-agent` changes least.
  Closest drop-in.
- **Asterisk** (via ARI `ExternalMedia` channels) or **FreeSWITCH** — the two
  battle-tested open-source SIP/RTP engines; run them on our own box and buy a
  SIP trunk from a **Turkish carrier** (Türk Telekom / Turkcell / a local ITSP)
  so numbers and PSTN termination stay in-country.
- **Fonoster** — open-source "Twilio alternative" if we want a higher-level API.

### STT (replace Groq Whisper)
- **faster-whisper** (CTranslate2, `large-v3`, INT8) — same Whisper accuracy,
  ~4× faster on GPU; strong Turkish. Production default for self-hosting.
- **WhisperLiveKit** — real-time streaming wrapper (AlignAtt/Simul-Whisper),
  OpenAI-compatible API, low latency. Good fit for the sub-700 ms target and
  removes the current temp-WAV-per-utterance hack.
- Fits on a single **L40S / RTX 4090 / A4000-class** GPU.

### LLM (replace Groq Llama) — Turkish open models
- **Kumru** (VNGRS, 7.4B; 2B lightweight) — Turkish-from-scratch; the 2B runs on
  16 GB VRAM (RTX 3090 / A4000). Reported to beat much larger general models on
  Turkish-specific tasks. Strong sovereign choice.
- **Trendyol-LLM**, **CosmosGemma-9B**, **WiroAI-9B/8B**, **KoçDigital-8B** —
  other open Turkish models to benchmark.
- Serve any of them with **vLLM** or **Ollama** on-prem. (General **Qwen** /
  **Llama-3.x** self-hosted are fallbacks, but a Turkish-tuned model is the
  better story for a Turkish government buyer.)
- Keep `temperature` near 0 for coverage/quote answers (already noted in the plan).

### TTS (replace Google / ElevenLabs)
- **XTTS-v2 Turkish** — already scaffolded in `training/voice/` +
  `serve_xtts_fastapi.py`. An owned, self-hosted, branded Turkish voice. Use
  only with explicit commercial + synthetic-voice rights.
- **Piper** — fast, CPU-friendly neural TTS; good low-cost self-hosted fallback
  while XTTS-v2 is being fine-tuned.

### Data store & audit (already done, just host in TR)
- **PostgresOrderStore** + `order-store-factory` already exist → point
  `DATABASE_URL` at a **Postgres inside Türkiye**.
- Hash-chained **audit-log** already exists → put it on WORM/immutable storage
  in-country.

## 5. Where to run it (Türkiye-resident infrastructure)

- **Sovereign cloud:** **Turkcell Cloud** (positioned as sovereign cloud for
  regulated industries) or **Türk Telekom Bulut** — both explicitly market
  data-in-Turkey / data-sovereignty. 57+ colocation facilities in-country as of
  Q1 2026.
- **On-prem / colocation** in an Istanbul/Ankara data center if the consulate
  wants full physical control (common for diplomatic buyers).
- Avoid the Turkish *regions* of AWS/Azure/Alibaba for this buyer unless legal
  signs off — a US/foreign parent can weaken the "data never leaves TR" claim in
  a diplomatic procurement review.

## 6. Recommended target architecture (all in-country)

```
Caller (Turkish PSTN)
  → Turkish SIP trunk (Türk Telekom / Turkcell / local ITSP)
  → Jambonz  (or Asterisk ARI / FreeSWITCH)   ── self-hosted, TR
      → voice-agent gateway (Node, this repo)   ── TR
          → faster-whisper / WhisperLiveKit STT  ── TR GPU
          → Dialogue orchestrator + Kumru/Trendyol LLM (vLLM)  ── TR GPU
          → XTTS-v2 (or Piper) TTS               ── TR GPU
      → Postgres (orders/policies)               ── TR
      → hash-chained audit log (WORM)            ── TR
```

Net effect: **zero personal data leaves Türkiye.** That is the sentence to put
in front of a consulate procurement team.

## 7. Suggested next steps

1. Add self-hosted provider adapters behind the existing factories:
   `STT_PROVIDER=whisper-local`, `LLM_PROVIDER=vllm`, `TTS_PROVIDER=xtts|piper`,
   and a Jambonz/Asterisk gateway variant of `apps/voice-agent`.
2. Benchmark Kumru vs Trendyol vs CosmosGemma on our insurance/consulate intents
   (Turkish accuracy + latency) and pick one.
3. Stand up a single-GPU reference deployment on Turkcell/Türk Telekom sovereign
   cloud; measure end-to-end latency against the sub-700 ms target.
4. Produce a one-page **data-flow / residency attestation** ("all processing in
   Türkiye, no cross-border transfer") for procurement — that document sells the
   product as much as the demo does.

## Sources

- KVKK cross-border transfer framework (Law 7499, 2024; no adequacy list as of
  2026; SCC 5-day notification):
  https://www.recordinglaw.com/world-laws/world-data-privacy-laws/turkey-data-privacy-laws/ ,
  https://www.istanbulattorneys.com/post/cross-border-data-transfers-kvkk-turkey ,
  https://istanbullawyerfirm.com/blog/kvkk-cross-border-data-transfers-standard-contracts-notification-guide-2025
- "KVKK pushes enterprises to keep Turkish citizens' data on Turkish soil";
  data-center / sovereign-cloud market:
  https://www.mordorintelligence.com/industry-reports/turkey-data-center-market ,
  https://www.cio.com/article/649215/turkcell-cloud-bringing-sovereign-cloud-to-turkeys-regulated-industries.html ,
  https://www.datacenterdynamics.com/en/news/t%C3%BCrk-telekom-forms-new-dc-cloud-business/
- Turkish open-source LLMs (Kumru / Trendyol / CosmosGemma):
  https://medium.com/vngrs/kumru-llm-34d1628cfd93 ,
  https://ollama.com/alibayram/kumru , https://zenodo.org/records/18861750
- Self-hosted STT (faster-whisper / WhisperLiveKit):
  https://www.spheron.network/blog/faster-whisper-gpu-cloud-production-deployment-guide/ ,
  https://www.blog.brightcoding.dev/2026/05/30/whisperlivekit-self-hosted-speech-to-text-that-actually-works-in-real-time
- Self-hosted telephony (Asterisk/FreeSWITCH/Jambonz/Fonoster):
  https://news.ycombinator.com/item?id=46518527 ,
  https://www.forasoft.com/blog/article/twilio-alternatives-voice-ai ,
  https://opensourceprojects.cc/alternatives/twilio
