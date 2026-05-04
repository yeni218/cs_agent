# Architecture

## Target Flow

```text
Customer phone call
  -> Twilio Voice webhook
  -> Twilio Media Streams WebSocket
  -> apps/voice-agent
      -> voice-core turn detector
      -> Groq STT
      -> Groq LLM with tools
      -> Order API tool calls
      -> Google TTS
      -> Twilio audio playback
  -> apps/api
      -> orders
      -> menu
      -> status updates
      -> dashboard SSE
```

## Why This Shape

The voice gateway is separated from the restaurant API so call audio code does not own business state. The agent calls the API through tools, the same way future channels could:

- phone calls
- WhatsApp
- web chat
- staff dashboard
- test transcripts

## Production Upgrade Path

Current local persistence uses `FileOrderStore`, which is durable enough for development and demos. For production, keep the `OrderService` API and replace the store with:

- Cloud SQL Postgres
- Cloud SQL MySQL
- Firestore
- SQLite on a persistent disk for a single small restaurant

The voice agent should remain stateless except for active call sessions.

## LiveKit Influence

This project borrows architectural ideas from LiveKit Agents:

- one isolated session per call
- explicit turn detection
- interruption invalidates current assistant playback
- false interruption recovery for the browser agent
- tools are the boundary between conversation and business logic
- metrics should track the voice pipeline stages separately

The first scaffold does not copy LiveKit source files.

## Provider Boundaries

The project keeps providers behind small adapters:

- `GroqSttProvider` accepts PCM16 speech and returns text.
- `GroqLlmProvider` accepts chat/tool messages and returns assistant/tool-call messages.
- `createTtsProvider()` selects Google TTS by default and returns µ-law 8 kHz audio for Twilio/browser playback.

This keeps the product simple while making provider swaps explicit instead of scattering SDK calls through call-handling code.
