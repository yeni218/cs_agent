# Open-Source Voice Agent Research

This project should stay small. The useful move is to borrow architecture patterns, not fork entire runtimes.

## Projects Reviewed

- LiveKit Agents: strongest reference for session lifecycle, turn handling, interruption events, endpointing options, and false-interruption recovery.
  - https://docs.livekit.io/agents/build/turns/
  - https://docs.livekit.io/reference/agents/turn-handling-options/
- Pipecat: confirms the pipeline approach: transport, VAD/STT, LLM, TTS, tools, and client SDKs as separate pieces.
  - https://github.com/pipecat-ai/pipecat
  - https://docs.pipecat.ai/overview/introduction
- Vocode: useful knobs for endpointing, interrupt sensitivity, and conversation speed.
  - https://docs.vocode.dev/
  - https://docs.vocode.dev/open-source/conversation-mechanics
- Bolna: useful as a production voice-agent platform reference, especially JSON/config-driven provider selection and telephony/provider orchestration.
  - https://github.com/bolna-ai/bolna
- Google Cloud Text-to-Speech: confirms `MULAW` and `LINEAR16` return WAV-wrapped audio, so Afiyet strips the WAV container before Twilio/browser playback.
  - https://docs.cloud.google.com/text-to-speech/docs/reference/rest/v1/AudioEncoding

## Decisions For Afiyet

- Keep Node/Fastify and the current two-app split. It is easier to deploy and operate than adopting a large Python framework.
- Add provider factories, not framework inheritance.
- Keep turn handling in `voice-core`, shared by browser and Twilio.
- Make Google TTS the default provider because it matches the LiveKit environment.
- Use browser WebSocket audio for the dashboard agent and preserve the text fallback.
- Do not fork external repos into this codebase yet. If we copy a small licensed module later, document the source path and license in `docs/livekit-reuse.md`.

## Next Robustness Targets

- Add call/session metrics: STT latency, LLM latency, TTS latency, interruptions, false interruptions, and transfers.
- Add a production store adapter for Cloud SQL or Firestore.
- Add an evaluation script with recorded Turkish restaurant-order transcripts.
- Add Twilio signature validation in production and rotate any exposed keys.
