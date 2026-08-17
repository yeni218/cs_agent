# Making the Voice Agent Real-Time — Research

How to go from "feels responsive" (where we are) to genuinely real-time
(sub-second), for our self-hosted Turkish cascade.

## The one principle

Real-time voice = **stream every stage and overlap them.** Don't wait for STT to
finish before the LLM starts, or for the LLM to finish before TTS starts.
Streaming cuts perceived latency **3–5×** versus sequential processing. The 2026
production budget for an optimized stack is **p50 ~250 ms** end-to-end:

| Stage | Streaming budget (GPU/cloud) |
|---|---|
| Streaming STT partials | 60–100 ms |
| LLM first token | 100–180 ms |
| TTS first chunk | 40–80 ms |
| Transport (WebRTC) | 20–40 ms |

We already stream **LLM → TTS** (sentence-by-sentence) and mask the rest with an
instant **filler**. The missing pieces are **streaming STT** and **neural turn
detection** — and, ultimately, a **GPU**.

## Where our latency actually goes (CPU, this laptop)

```
you stop speaking
  → turn-end detection   ~690 ms   (energy VAD waiting for silence)
  → STT (whole utterance) ~2.4 s   (faster-whisper small, runs AFTER you stop)  ← the wall
  → LLM first sentence   ~2.0 s    (qwen2.5:3b, streamed)
  → TTS first chunk      ~0.4 s
real answer ≈ 5 s   (filler hides it at ~0.7 s)
```

The wall is **STT runs only after you stop talking**. That's the thing to fix.

## Fix #1 — Streaming STT (the big architectural win)

Transcribe **while the caller is still speaking**, so when they stop, only the
last fragment remains and the final transcript lands in ~200–500 ms instead of
2.4 s.

- Whisper is offline by design, but the **LocalAgreement** policy makes it
  streaming: run Whisper on a growing audio buffer and **commit a word only once
  two successive runs agree** on it — low latency, no flickering re-writes.
- **WhisperLiveKit** (self-hosted, WebSocket, FastAPI, CPU/CUDA/Apple) packages
  exactly this (Simul-Whisper + WhisperStreaming) around the same faster-whisper
  we already run. It's close to a drop-in for our `whisper-local` STT.
- **CPU caveat (honest):** LocalAgreement re-runs Whisper repeatedly on a
  growing buffer, so it needs real-time factor < 1 with headroom. Ours is
  RTF ≈ 0.9 at 8 threads — it *can* keep up for short turns but is tight for long
  ones. Streaming STT pays off fully on a **GPU**; on this CPU it helps short
  utterances and is strained on long ones.
- 2026 alternatives built for streaming: **Qwen3-ASR-causal** (append-only,
  constant compute per audio second — designed for this), **Nemotron 3.5 ASR
  streaming**, **Voxtral** (lower WER but only 13 langs, no Turkish). These are
  the consular-research doc's ASR bake-off candidates.

## Fix #2 — Neural turn detection (endpointing)

Replace the energy VAD's fixed ~690 ms silence wait with a **small neural
turn-detector** that updates an end-of-turn probability dozens of times/second.
It ends the turn faster when the caller is clearly done and waits through
hesitations ("şey… bir saniye…") instead of cutting them off.

- We already scaffolded **Silero VAD** (`packages/voice-core/silero-vad.js`,
  `turn-detector-factory.js`) and a **semantic endpointer** — wiring Silero into
  the browser path is the next step. LiveKit's turn-detector model is the
  reference.

## Fix #3 — Streaming TTS first-chunk

We synthesize each sentence in one shot. A **streaming TTS** emits the first
~200 ms of audio before the sentence is fully synthesized:

- **XTTS-v2 streaming** ≈ 200 ms to first chunk; **Piper** ≈ 40 ms (already very
  fast); **MOSS-TTS-Realtime** ≈ 180 ms; **FreyaTTS-small** (Turkish-first,
  Apache-2.0) from the consular doc. Piper is already near the floor, so this is
  a smaller win for us until we change voice.

## Fix #4 — GPU (the actual enabler)

True sub-second needs a GPU. Same cascade, models moved to a Türkiye GPU box
(the sovereign deployment from `docs/self-hosted-architecture.md`):
- Streaming STT partials in ~60–100 ms, LLM first token ~150 ms, streaming TTS
  ~40–200 ms → **p50 ~250–400 ms**, i.e. real-time.
- On CPU, the honest ceiling is "**feels responsive** (filler + streaming)"; on
  GPU it's "**actually real-time**." The code path is the same — only the
  `*_BASE_URL`s change.

## What about speech-to-speech (Moshi, etc.)?

Full-duplex S2S models (Moshi ~160–200 ms, native barge-in) are the fastest
architecture — but **wrong for a consular agent**, and the research is clear:

- **No native text log** — you'd run a separate transcription pass for audit,
  i.e. rebuild a cascade anyway. Bad for KVKK/auditability.
- **Weak tool-calling / reasoning** — locked to the model it ships with; can't
  pair with a strong Turkish LLM or the deterministic quote/OTP tools.
- Weaker instruction-following, monitoring, guardrails.

Consensus (and your colleague's consular dossier): **keep the cascade** for
auditability, tool-calling, data sovereignty, and text-layer guardrails.
Cascade still dominates production in 2026; S2S is frontier, not default. A
hybrid (S2S for chit-chat, cascade for real intents) exists but is too complex
to justify for a compliance-first consular line.

## Recommended roadmap

1. **Now / CPU:** keep the filler (done), streaming LLM→TTS (done); wire **Silero
   neural endpointing** into the browser path to cut turn-end delay and false
   cutoffs. Low risk, already scaffolded.
2. **Next / CPU-feasible:** stand up **WhisperLiveKit** as the `whisper-local`
   backend for streaming partial transcription; accept it shines on GPU.
3. **The real unlock:** deploy the cascade on a **Türkiye GPU** — streaming STT +
   vLLM (bigger Turkish model) + streaming TTS → genuine sub-400 ms. This also
   fixes the qwen2.5:3b fluency ceiling.
4. **Do not** switch to speech-to-speech for the consular product.

## Sources
- Streaming pipeline / latency budgets / cascade-for-sovereignty:
  https://softcery.com/lab/ai-voice-agents-real-time-vs-turn-based-tts-stt-architecture ,
  https://prodinit.com/blog/production-voice-ai-agents-latency-architecture ,
  https://gradium.ai/content/cascaded-voice-agent-vs-speech-to-speech-2026
- Streaming STT (LocalAgreement / WhisperLiveKit / Qwen3-ASR-causal):
  https://github.com/QuentinFuxa/WhisperLiveKit ,
  https://arxiv.org/pdf/2307.14743 ,
  https://www.blog.brightcoding.dev/2026/05/30/whisperlivekit-self-hosted-speech-to-text-that-actually-works-in-real-time
- Whisper vs streaming ASR (Voxtral, coverage):
  https://weesperneonflow.ai/en/blog/2026-03-31-voxtral-whisper-open-source-speech-models-comparison-2026/ ,
  https://northflank.com/blog/best-open-source-speech-to-text-stt-model-in-2026-benchmarks
- Speech-to-speech vs cascade (Moshi; auditability/tool-calling tradeoffs):
  https://arxiv.org/abs/2410.00037 ,
  https://hamming.ai/blog/are-speech-to-speech-models-ready-to-replace-cascade-models ,
  https://www.modulate.ai/ebooks/beat-the-black-box-why-cascade-beats-speech-to-speech-for-enterprise-voice-agents
