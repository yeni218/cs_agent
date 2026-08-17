# END-TO-END-SIS

End-to-end **S**overeign **I**nsurance/voice **S**ystem — a standalone project that
ties together the whole architecture we designed:

```
                    ┌─────────────────────────────┐
   mobile/  ───────▶│  API layer (Vapi-shaped)     │
  (React Native     │  /assistant  /call  ...      │
   dashboard)       └──────────────┬──────────────┘
                                   │ swap baseUrl
              ┌────────────────────┴────────────────────┐
              │                                          │
      Vapi Cloud (now)                        backend/ (our own, later)
   https://api.vapi.ai                    exposes the same endpoints so the
                                          mobile app never has to change
                                                   │
                                                   ▼
                                        voice/ sovereign cascade
                                  telephony → STT → dialogue → LLM → TTS
                                     (all self-hostable in Türkiye)
```

## The idea

1. **Use Vapi's ready endpoints now** for the dashboard / data visualization, so
   we get a working product immediately without building call infrastructure.
2. **Design our own endpoints to be Vapi-shaped** (`/assistant`, `/call`, Bearer
   auth, same JSON) so that when we later **bypass Vapi** with our sovereign
   backend, the mobile app only changes one setting: the base URL.
3. The **voice cascade** (STT → LLM → TTS, all self-hosted in Türkiye) is the
   sovereign engine behind our own backend — see `docs/architecture.md`.

## Directory layout

**One app, role-based login** (see `docs/two-sided-architecture.md`). A restaurant
login lands on the Voicebit-like view; our admin login lands on the cost/margin
cockpit — same binary, the account decides.

| Dir | What it is | Status |
|---|---|---|
| `customer/` | **The app** (Expo/React Native). Login → restaurant view *or* admin cockpit by role. (folder name is historical) | ✅ runnable (demo logins) |
| `backend/` | One brain, two faces: `POST /auth/login` → role; `/customer/*` (COGS stripped) + `/admin/*` (full economics). Source switch: `DATA_SOURCE=demo` \| `vapi` (proxies any Vapi-shaped API). | ✅ auth + tenancy + redaction + proxy |
| `infra-api/` | **Our own** voice-agent API, **Vapi-compatible** (Groq LLM/STT + Inworld TTS). Point the backend's `VAPI_BASE_URL` here to run on our infra instead of Vapi — swap by base URL only. | ✅ CRUD + engine + cost |
| `mobile/` | Earlier admin-only prototype — **superseded** by the app's admin role; removable. | legacy |
| `docs/` | End-to-end + two-sided architecture, swap plan, sovereign cascade design. | ✅ |

**Demo logins:** restaurant `lezzet@demo.com` / `demo` · admin `admin@afiyet.ai` / `admin`.

> **The hard rule:** cost redaction is **server-side**. The customer scope builds
> responses that physically lack `cost`/`margin` fields — a UI bug can't leak
> margin. Verified with a leak check.

## Quick start

```bash
# Mobile dashboard (works in demo mode with no API key)
cd mobile
npm install
npx expo start        # press w for web, or scan QR with Expo Go

# Vapi-shaped backend stub (the future "bypass Vapi" layer)
cd ../backend
npm install
npm start             # http://localhost:8787/assistant , /call
```

In the app's **Settings** tab you can switch between **Demo**, **Vapi Cloud**
(enter your Vapi private key), and **Afiyet Backend** (our stub / future
sovereign backend). Nothing else in the app changes — that's the point.
