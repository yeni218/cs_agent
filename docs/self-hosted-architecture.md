# Fully Self-Hosted Voice Agent — Max Performance, Min Cost (Türkiye)

Companion to `docs/data-residency-turkiye-research.md`. That doc answers *why*
(consulate/KVKK data must stay in Türkiye). This doc answers *how*: the concrete
architecture, the hardware, the capacity math, and the money — with everything
running on Turkish soil and **$0 per-provider API cost**.

## 0. The key insight that makes this cheap

A consulate call center is **low concurrency**. It is not a national hotline — it
handles maybe **2–20 simultaneous calls**, not thousands. Voice is also
**turn-based**: the GPU works in short bursts (STT on an utterance, one LLM
answer, one TTS reply), then idles while the human talks.

That means we do **not** need a GPU farm. STT + LLM + TTS all fit and run on a
**single 24 GB GPU**, and one box comfortably serves a consulate's whole load.
That single fact is what turns "self-hosted sovereign AI" from expensive into
*cheaper than the current cloud bill*.

## 1. Component choices (all open-source, all self-hostable)

| Layer | Pick | Why | Footprint / perf |
|---|---|---|---|
| Telephony | **Jambonz** (MIT, self-host) | Twilio-equivalent **WebSocket media stream** → smallest change to `apps/voice-agent`; FreeSWITCH under the hood; scales down to one server | CPU-only VM, no GPU |
| SIP trunk | **Turkish ITSP** (Türk Telekom / Turkcell / local) | Numbers + PSTN stay in-country | per-minute or per-channel |
| STT | **faster-whisper** `large-v3-turbo`, INT8 (CTranslate2) | Whisper accuracy, ~4× faster; strong Turkish; stream via **WhisperLiveKit** | ~1.6–2 GB VRAM/instance |
| LLM | **Kumru-7.4B** (VNGRS, Turkish) AWQ-INT4 via **vLLM** — or **Kumru-2B** / Trendyol-LLM | Turkish-native beats generic Llama on TR; AWQ halves VRAM; vLLM batches concurrent calls | ~5–6 GB (7B INT4); 2B fits 16 GB cards |
| TTS | **XTTS-v2** (Turkish, GPU, voice-clone) primary; **Piper** `tr_TR` (CPU) fallback | XTTS = warm/branded voice; Piper = near-free CPU realtime | XTTS ~2–4 GB; Piper ~0 GPU |
| Store | **Postgres** (already in repo via `order-store-factory`) | Point `DATABASE_URL` at TR Postgres | CPU |
| Audit | **hash-chained audit-log** (already in repo) | WORM storage in-country | CPU |

Latency reference points (measured, 2026):
- **faster-whisper**: production real-time on a single mid GPU.
- **vLLM 7–8B on one RTX 4090**: ~130–180 tok/s single-user; **1,000–2,500+ tok/s
  aggregate** at 30–100 parallel requests (its scheduler never idles the GPU).
- **XTTS-v2 streaming**: ~200 ms round-trip to first audio chunk (<100 ms
  inference), RTF ~0.15–0.3 (generates faster than real time).
- **Piper**: ~40 ms first audio, RTF ~0.03 — flatter/synthetic but basically free.

## 2. It all fits on one 24 GB GPU

VRAM budget on a single **RTX 4090 / RTX 3090 (24 GB)**:

```
faster-whisper large-v3-turbo INT8   ~2 GB
Kumru-7.4B AWQ-INT4 (vLLM weights)   ~6 GB
XTTS-v2                              ~4 GB
------------------------------------------
model weights                       ~12 GB
KV cache + audio buffers + headroom ~12 GB   ← room for concurrent calls
```

Comfortable. If you want more concurrency headroom, drop the LLM to **Kumru-2B**
(runs on a 16 GB card) and the whole stack fits a cheaper GPU.

## 3. Capacity: how many calls per box?

Because voice is turn-based and vLLM batches, a **single RTX 4090** realistically
serves **~8–15 concurrent Turkish voice calls** end-to-end within the sub-700 ms
target. A consulate rarely needs that many lines. So:

- **1 GPU box = one consulate** (with headroom), or several small ones.
- Scale-out is horizontal and boring: add a second box behind Jambonz when a
  site genuinely exceeds ~12 concurrent calls. No architecture change.

Latency budget per turn (target < 700 ms after the caller stops speaking):
```
endpoint detection   ~150 ms   (Silero VAD + semantic endpointer, already scaffolded)
STT (final)          ~150 ms
LLM first tokens     ~150 ms   (temp≈0, short answers)
TTS first audio      ~200 ms   (XTTS streaming)   → overlaps LLM if piped
------------------------------------------------
perceived            ~500–700 ms
```

## 4. The money

### One-time (CapEx) — the "buy the box" path (cheapest long-run)
| Item | Cost (approx) |
|---|---|
| GPU: used RTX 3090 24 GB | $700–900 |
| — or new RTX 4090 24 GB | $1,600–1,900 |
| Server chassis (CPU, 64 GB RAM, NVMe) | $1,000–1,800 |
| **Total per box, all-in** | **~$2,500–3,500 one-time** |

### Recurring (OpEx)
| Item | Cost |
|---|---|
| Colocation (1U + power) in Istanbul/Ankara DC | ~$100–300 / mo |
| — or Turkcell/Türk Telekom **sovereign cloud** GPU (L40S-class) rental | ~$0.75–1.0 / hr ≈ $540–720 / mo 24×7 |
| Jambonz VM (2–4 vCPU, 8 GB) | ~$20–40 / mo |
| Postgres VM / managed (in TR) | ~$20–50 / mo |
| SIP trunk (DID + termination, Turkish ITSP) | per-minute; wholesale term ~$0.004–0.006/min |
| **Software licenses (Whisper, Kumru, vLLM, Jambonz, Piper, Postgres)** | **$0** |

**Buy vs rent:** for a steady 24×7 consulate deployment, **buying a box pays for
itself in ~4–6 months** versus renting a cloud GPU. Rent only for the pilot.

### Cost per call — the punchline
Self-hosting collapses the marginal cost of a call to **just SIP minutes** (~sub-cent/min).
Compare to today's stack, where every minute pays **Twilio + Groq STT + Groq LLM +
Google/ElevenLabs TTS** simultaneously. After the one-time hardware, inference is
effectively free and, crucially, **the data never leaves Türkiye**.

## 5. ⚠️ Licensing caveat (matters because you're *selling* this)

- **XTTS-v2** ships under the **Coqui Public Model License (CPML)**, which
  **restricts commercial use** of the released weights. For a commercial
  consulate sale you must either (a) obtain a commercial license, (b) fine-tune
  and own a voice with explicit synthetic-voice + commercial rights (the
  `training/voice/` pipeline is built for exactly this), or (c) ship **Piper
  `tr_TR`** (permissive) as the commercial-safe default and offer XTTS as a
  premium branded voice only where licensing is cleared.
- Everything else in the stack (faster-whisper/MIT-ish, vLLM/Apache-2,
  Jambonz/MIT, Postgres/PostgreSQL license) is commercial-friendly. Check the
  **specific Turkish LLM license** you pick (Kumru / Trendyol / CosmosGemma) for
  commercial + redistribution terms before signing a customer.

## 6. Target deployment (one sovereign box)

```
Caller (Turkish PSTN)
  └─ Turkish SIP trunk (Türk Telekom / Turkcell / local ITSP)
      └─ Jambonz            ── VM, TR            (telephony, WS media stream)
          └─ voice-agent (Node, this repo)  ── TR
              ├─ WhisperLiveKit / faster-whisper  ─┐
              ├─ vLLM · Kumru-7.4B (AWQ)           ├─ one 24 GB GPU, TR
              └─ XTTS-v2 (or Piper CPU)           ─┘
          ├─ Postgres (orders/policies)   ── TR
          └─ hash-chained audit log (WORM) ── TR
```
Every box in that diagram is inside Türkiye. **Zero cross-border transfer.**

## 7. How this maps onto the existing code (the work)

The repo already has the seams — this is adapters + config, not a rewrite:

1. **STT adapter** `STT_PROVIDER=whisper-local` → new
   `packages/providers/whisper-local-stt.js` (HTTP/WS to a local
   faster-whisper/WhisperLiveKit server), selected alongside `groq-stt.js`.
2. **LLM adapter** `LLM_PROVIDER=vllm` → new `packages/providers/vllm-llm.js`
   (OpenAI-compatible endpoint that vLLM exposes), sibling of `groq-llm.js`;
   keep `temperature≈0`.
3. **TTS provider** extend `createTtsProvider()` with `TTS_PROVIDER=xtts`
   (reuse `training/voice/serve_xtts_fastapi.py`) and `TTS_PROVIDER=piper`.
4. **Telephony variant** of `apps/voice-agent/server.js` speaking Jambonz's
   WebSocket media protocol instead of Twilio's (same audio codec helpers in
   `voice-core`).
5. **Everything else is already done**: `order-store-factory` (Postgres),
   `audit-log`, `pii-redactor`, metrics, KVKK consent, dialogue orchestrator.

## 8. Recommended sequence

1. **Pilot on rented TR sovereign-cloud GPU** (L40S) — validate Kumru vs
   Trendyol vs CosmosGemma on real insurance/consulate intents (Turkish accuracy
   + latency), and XTTS vs Piper for voice quality.
2. Wire the four adapters above behind the existing factories; prove end-to-end
   latency < 700 ms.
3. **Buy the box** once load is understood; colocate in an Istanbul/Ankara DC.
4. Produce the **residency attestation** ("all processing in Türkiye, no
   cross-border transfer, open-source stack, immutable audit log") for
   procurement — that document closes the sale as much as the demo.

## Sources
- vLLM 7–8B on RTX 4090 throughput/concurrency & AWQ:
  https://ermolushka.github.io/posts/vllm-benchmark-4090/ ,
  https://www.databasemart.com/blog/vllm-gpu-benchmark-rtx4090 ,
  https://www.spheron.network/blog/awq-quantization-guide-llm-deployment/ ,
  https://intuitionlabs.ai/articles/local-llm-deployment-24gb-gpu-optimization
- XTTS-v2 streaming latency / VRAM:
  https://www.baseten.co/blog/streaming-real-time-text-to-speech-with-xtts-v2/ ,
  https://gigagpu.com/tts-latency-benchmarks/
- Piper / Kokoro / XTTS comparison & Turkish support (XTTS = 17 langs incl. TR):
  https://gigagpu.com/self-hosted-tts-comparison/ ,
  https://contracollective.com/blog/kokoro-vs-piper-vs-xtts-local-text-to-speech-m5-max-2026 ,
  https://www.promptquorum.com/power-local-llm/local-tts-voice-cloning-piper-coqui-xtts
- faster-whisper self-host / streaming:
  https://www.spheron.network/blog/faster-whisper-gpu-cloud-production-deployment-guide/ ,
  https://www.blog.brightcoding.dev/2026/05/30/whisperlivekit-self-hosted-speech-to-text-that-actually-works-in-real-time
- Jambonz (MIT, self-host, single-server to multi-tenant):
  https://jambonz.org/ , https://docs.jambonz.org/guides/get-started/jambonz-overview
- Turkish open LLMs (Kumru/Trendyol/CosmosGemma):
  https://medium.com/vngrs/kumru-llm-34d1628cfd93 , https://ollama.com/alibayram/kumru
