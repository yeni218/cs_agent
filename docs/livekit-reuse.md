# LiveKit Reuse Policy

LiveKit Agents is Apache 2.0 licensed, so selective reuse is possible when it helps. Still, this project should avoid becoming a fork.

## Prefer Studying

Use LiveKit as a reference for:

- turn-taking design
- interruption behavior
- speech handle lifecycle
- STT/TTS/LLM fallback patterns
- metrics and usage aggregation
- tool execution boundaries

## Copy Only When Small And Isolated

If we copy code later:

- copy only small separable modules
- keep Apache 2.0 license and NOTICE requirements
- mark modified files clearly
- document copied paths here
- avoid importing LiveKit runtime packages into the product core

## Current Status

No LiveKit source files have been copied into this clean scaffold.

## Local Findings From LiveKit Agents

The useful orchestration ideas are conceptual:

- `AgentSession` owns one conversation and composes STT, VAD, LLM, TTS, tools, and turn handling.
- `AgentActivity` treats each assistant response as interruptible speech with a lifecycle, instead of just "send audio and forget".
- Turn handling separates endpointing from interruption. Endpointing decides when the user is done; interruption decides when assistant playback should pause or stop.
- LiveKit defaults are a good starting point: VAD endpointing around 0.5-3.0 seconds, interruption enabled, and false-interruption recovery after a short timeout.
- The Google TTS plugin uses Google Cloud Text-to-Speech credentials from the environment and can synthesize PCM/LINEAR16 or µ-law style audio depending on encoding.

Afiyet now mirrors the important pieces without importing the runtime: one session per call/browser tab, provider adapters, explicit VAD thresholds, generation invalidation for barge-in, and browser false-interruption resume.
