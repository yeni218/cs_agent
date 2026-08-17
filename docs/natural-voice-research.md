# Making the Voice Agent Sound Natural — Research + What We Implemented

Companion to `docs/self-hosted-architecture.md`. That doc keeps the pipeline
inside Türkiye; this one is about the other half of the sale: **does it sound
like a person?** For a consulate line, a robotic agent gets switched off no
matter how compliant it is.

## What actually makes a voice agent feel human (2026 consensus)

Naturalness is **not** mostly the TTS voice — it's **turn-taking and latency**.
The levers, in order of impact:

1. **Low end-to-end latency.** The bar for "human" is a response gap **< ~600 ms**
   after the caller stops speaking; above ~800 ms it feels laggy. The dominant
   cost is *time-to-first-audio*, not total synthesis.
2. **Streaming / sentence chunking.** Don't synthesize the whole reply before
   playing it. Emit the first sentence while the rest is still being made — this
   is what collapses perceived latency. It also means little audio is "in flight"
   to cancel on a barge-in.
3. **Barge-in (interruption).** The agent must stop talking the instant the
   caller speaks — stop playback, cancel in-flight TTS, cancel the LLM, reset.
   Production bar: 200–400 ms turn-taking gap, **< 2 % false barge-ins**, TTS
   flush < 60 ms.
4. **Good end-of-turn detection.** Semantic endpointing (wait through "şey…",
   "bir saniye…") so the agent doesn't cut the caller off mid-thought.
5. **Prosody / voice quality.** A warm neural voice (Wavenet/Chirp, XTTS,
   Kokoro) over a robotic one (Google Standard). Real but *last* on the list.
6. **Conversational writing.** Short spoken turns, one question at a time, natural
   acknowledgements ("tabii", "anladım"), numbers spoken out — the LLM must write
   for the ear, not the page.
7. **(Advanced) backchanneling / filler.** Streaming a quick "tabii, bir
   bakıyorum" while the LLM/tool runs hides latency to near zero.

## What this repo already had

- **Barge-in**: `speech_start` bumps a generation counter, sends `clear`, and
  stale audio is dropped (`apps/voice-agent/server.js`).
- **Semantic endpointing + adaptive VAD**: `SemanticEndpointer` +
  `EnergyTurnDetector` adaptive noise floor hold the turn through Turkish fillers.
- **Metrics**: `CallMetrics` tracks STT/LLM/TTS latency.
- **Voice quality**: Google TTS is Chirp/Neural-safe; default raised to
  `tr-TR-Wavenet-E`.

The gap was **#2 (streaming)** and **#1/#6** — the agent synthesized the *entire*
reply before any audio played (worst-case time-to-first-audio), and the prompt
wrote page-style Turkish.

## What we implemented in this change

1. **Sentence-streamed TTS** — `packages/voice-core/speech-chunker.js`
   (`splitIntoSpeechChunks`). The reply is split into short, Turkish-aware
   speakable chunks (sentence enders as hard breaks; long run-ons broken at a
   comma; ordinals/abbreviations like "3." and "no." not treated as sentence
   ends; tiny trailing fragments merged). `speak()` now synthesizes and plays
   **chunk by chunk**, so time-to-first-audio is the first *clause*, not the
   paragraph — and it checks the generation counter **between chunks**, giving
   barge-in a clean seam (the rest of the reply is abandoned the moment the
   caller speaks). Covered by `tests/speech-chunker.test.js`.
2. **Time-to-first-audio metric** — `CallMetrics` gained a `ttfa` stage, recorded
   in `speak()` and logged in the call summary, so we can *measure* snappiness
   (the #1 naturalness lever) rather than guess.
3. **Conversational prompt** — `insurance-prompts.js` now instructs spoken-style
   Turkish: one-to-two sentence turns, no lists/bullets read aloud, one question
   at a time, natural acknowledgements, numbers spoken out, and "stop when
   interrupted."
4. **Warmer self-hosted voice option** — `LocalTtsProvider` (XTTS-v2 / Piper)
   for an owned Turkish voice, with 24 k/22 k → 8 k telephony down-conversion
   (`resample.js` + `parseWav`).

## Latency budget we're aiming for (< 700 ms perceived)

```
endpoint detection   ~150 ms   (semantic endpointer + adaptive VAD)
STT (final)          ~150 ms   (in-memory whisper-local; no temp-WAV)
LLM first tokens     ~150 ms   (temp≈0, short answers)
TTS first chunk      ~200 ms   (streamed first sentence, not the paragraph)
------------------------------------------------
perceived            ~500–650 ms
```

## Next naturalness upgrades (not yet done)

- **Token-streaming LLM → TTS**: feed sentences to TTS as the LLM emits them
  (needs a streaming `complete()`; vLLM/Groq both support SSE). Biggest remaining
  latency win — pairs directly with the chunker.
- **Backchannel/filler while tools run**: play a short "bir saniye, kontrol
  ediyorum" during `get_quote_details` etc.
- **XTTS-v2 streaming endpoint**: use its ~200 ms first-chunk streaming API
  instead of one-shot synthesis per chunk.
- **Silero VAD**: swap the energy detector for the scaffolded Silero backend to
  push false barge-ins below 2 %.
- **Voice A/B test**: Wavenet-E vs Chirp3-HD vs a fine-tuned XTTS Turkish voice,
  scored on listening tests (mind the XTTS CPML license for commercial use — see
  `docs/self-hosted-architecture.md` §5).

## Sources
- Turn-taking / barge-in / latency as the core naturalness levers:
  https://futureagi.com/blog/voice-ai-barge-in-turn-taking-2026/ ,
  https://www.autointerviewai.com/blog/prompt-engineering-voice-ai-interruptions-latency-2026
- Streaming/chunking + backchanneling + <600 ms bar:
  https://softcery.com/lab/ai-voice-agents-real-time-vs-turn-based-tts-stt-architecture ,
  https://www.lumay.ai/blogs/top-21-ai-voice-agents
- TTS latency (XTTS ~200 ms streaming first chunk; Piper ~40 ms):
  https://gigagpu.com/tts-latency-benchmarks/ ,
  https://gigagpu.com/self-hosted-tts-comparison/
