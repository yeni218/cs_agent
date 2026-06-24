# Afiyet AI

Clean production-oriented rebuild of the Turkish restaurant AI call center.

This project intentionally does **not** depend on the LiveKit runtime. LiveKit remains a reference for proven voice-agent ideas such as turn-taking, interruption handling, tool calls, and metrics. The code here is organized as our own product.

## Project Shape

```text
apps/
  api/             Restaurant API, dashboard, order persistence, SSE updates
  voice-agent/     Twilio Media Streams gateway and AI voice loop
packages/
  domain/          Menu, order rules, tools, prompts
  storage/         File-backed order store for local/dev
  providers/       Groq, Google TTS, optional ElevenLabs, and order API adapters
  voice-core/      Audio conversion, turn detection, Twilio playback helpers
infra/
  docker/          Container scaffolding
docs/              Architecture and deployment notes
training/voice/    XTTS-v2 Turkish voice fine-tuning research pipeline
notebooks/         Colab notebooks for model experiments
```

## Local Setup

```bash
cd afiyet-ai
cp .env.example .env
npm install
```

Run the API/dashboard:

```bash
npm run dev:api
```

Open:

```text
http://localhost:8080
```

Run the voice agent in another terminal:

```bash
npm run dev:voice
```

Or start both services with one command:

```bash
./run
```

The dashboard includes a floating agent button in the bottom-right corner. Press it to start a browser-based Turkish conversation with the same order/menu tools used by the phone agent. The browser streams microphone audio over WebSocket and supports barge-in interruption; the panel also includes a text fallback.

For local development, leave `DASHBOARD_API_TOKEN` and `ORDER_API_TOKEN` empty. In production, set both tokens and open the dashboard with the tokenized URL printed by `./run`.

Expose the voice agent with ngrok or another tunnel:

```bash
ngrok http 8081
```

Set `PUBLIC_URL` to the ngrok URL and point Twilio’s voice webhook to:

```text
POST https://your-url.ngrok-free.dev/incoming-call
```

## First Production Milestone

- Inbound phone call via Twilio Media Streams
- Turkish STT with Groq Whisper
- Turkish conversation with Groq Llama
- Turkish TTS with Google Cloud Text-to-Speech µ-law 8 kHz output
- Persistent local order store
- Dashboard with live order updates
- Human transfer path through Twilio

## TTS Provider

Google TTS is the default because it matches the deployed LiveKit environment:

```env
TTS_PROVIDER=google
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/google-service-account.json
GOOGLE_TTS_LANGUAGE_CODE=tr-TR
GOOGLE_TTS_VOICE_NAME=tr-TR-Standard-A
GOOGLE_TTS_AUDIO_ENCODING=MULAW
GOOGLE_TTS_SAMPLE_RATE=8000
```

Keep the Google service-account JSON outside the repository. ElevenLabs remains available only as an optional fallback with `TTS_PROVIDER=elevenlabs`.

## Custom Voice Research

The XTTS-v2 Turkish prototype pipeline lives in:

```text
notebooks/afiyet_xtts_v2_turkish_colab.ipynb
training/voice/
docs/xtts-training-colab.md
```

Use it for research and listening tests first. For production, train only on
voice data with explicit synthetic voice and commercial deployment rights.

## Security Notes

- Do not commit `.env`, service-account JSON, Twilio auth tokens, LiveKit keys, or provider API keys.
- Set `DASHBOARD_API_TOKEN` and `ORDER_API_TOKEN` in production.
- Enable `VALIDATE_TWILIO_SIGNATURE=true` once `PUBLIC_URL` is stable.
- Rotate any keys that were previously committed or shared.

## Tests

```bash
npm test
```

The initial tests cover domain/order behavior and turn detection. They do not require external API keys.
