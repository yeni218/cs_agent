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
| `customer/` | **The app** (Expo/React Native). Login → restaurant view *or* admin cockpit by role. Direct Supabase when `EXPO_PUBLIC_SUPABASE_*` is set; demo/backend fallback remains. (folder name is historical) | ✅ runnable |
| `backend/` | One brain, two faces: `POST /auth/login` → role; `/customer/*` (COGS stripped) + `/admin/*` (full economics). Source switch: `DATA_SOURCE=demo` \| `vapi` (proxies any Vapi-shaped API). | ✅ auth + tenancy + redaction + proxy |
| `infra-api/` | **Our own** voice-agent API, **Vapi-compatible** (Groq LLM/STT + Inworld TTS). Also has production-only telephony ingest, Verimor CDR reconciliation, audit events, and cost reports. | ✅ CRUD + engine + cost proofing |
| `supabase/` | **Backend-less** option: app talks straight to Supabase. Schema + **RLS** + cost-free `customer_calls` view + `call` and `ingest-call` Edge Functions. Simplest to run. | ✅ schema + RLS + functions |
| `mobile/` | Earlier admin-only prototype — **superseded** by the app's admin role; removable. | legacy |
| `docs/` | End-to-end + two-sided architecture, swap plan, sovereign cascade design. | ✅ |

**Demo logins:** restaurant `lezzet@demo.com` / `demo` · admin `admin@afiyet.ai` / `admin`.

> **The hard rule:** cost redaction is **server-side**. The customer scope builds
> responses that physically lack `cost`/`margin` fields — a UI bug can't leak
> margin. Verified with a leak check.

## Quick start

```bash
# Unified app (works in demo mode with no API key)
cd customer
npm install
npx expo start        # press w for web, or scan QR with Expo Go

# Optional backend fallback (not needed for direct Supabase mode)
cd ../backend
npm install
npm start             # http://localhost:8787/assistant , /call
```

For direct Supabase mode, copy `customer/.env.example` to `customer/.env`, set
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, then untick
`Demo modu` on the login screen. Nothing else in the app changes — that is the
point.

## Cost target

The default route is tuned for sub-`$0.02/min` COGS: Verimor bundled minutes,
Groq Whisper, Groq `llama-3.1-8b-instant`, and Inworld TTS 1.5 Mini. The repo now
stores estimated cost per call and reconciles it against Verimor CDRs/provider
usage before relying on margins. See `docs/cost-control.md`.
