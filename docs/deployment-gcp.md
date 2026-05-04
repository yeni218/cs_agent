# Google Cloud Deployment

## Recommended Split

Use two services:

1. `afiyet-api`
   - dashboard
   - menu and order API
   - database connection
   - Server-Sent Events

2. `afiyet-voice-agent`
   - public Twilio webhook
   - WebSocket media stream
   - AI provider calls
   - human handoff

For the API, Cloud Run is a good fit. For the voice agent, Cloud Run can work if WebSocket duration limits and cold starts are acceptable. A small Compute Engine VM with Docker is safer for always-on call handling.

## Secrets

Use Secret Manager or VM environment variables for:

- `GROQ_API_KEY`
- Google TTS service-account JSON or Application Default Credentials
- `TWILIO_AUTH_TOKEN`
- `DASHBOARD_API_TOKEN`
- `ORDER_API_TOKEN`

Do not bake secrets into Docker images.

## Docker Build

From `afiyet-ai/`:

```bash
docker build -f infra/docker/Dockerfile.api -t afiyet-api .
docker build -f infra/docker/Dockerfile.voice-agent -t afiyet-voice-agent .
```

## Minimum Runtime Settings

API:

```text
API_PORT=8080
DATA_DIR=/data
DASHBOARD_API_TOKEN=...
```

Voice agent:

```text
VOICE_PORT=8081
PUBLIC_URL=https://voice.yourdomain.com
ORDER_API_BASE_URL=https://api.yourdomain.com
ORDER_API_TOKEN=...
VALIDATE_TWILIO_SIGNATURE=true
TTS_PROVIDER=google
GOOGLE_APPLICATION_CREDENTIALS=/secrets/google-tts.json
GOOGLE_TTS_LANGUAGE_CODE=tr-TR
GOOGLE_TTS_VOICE_NAME=tr-TR-Standard-A
GOOGLE_TTS_AUDIO_ENCODING=MULAW
GOOGLE_TTS_SAMPLE_RATE=8000
```

## Production Checklist

- Stable public URL for Twilio
- Twilio signature validation enabled
- Dashboard protected
- Persistent database attached
- Health checks configured
- Logs shipped to Cloud Logging
- Alerts on 5xx, call failures, provider failures, and handoff failures
