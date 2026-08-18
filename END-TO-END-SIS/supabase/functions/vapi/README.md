# `vapi` — Vapi-compatible gateway on Supabase

Exposes the **exact Vapi contract** from Supabase, so any Vapi client (or our
`backend` proxy) switches to us by changing **one base URL + one key**.

- **Base URL:** `https://<project-ref>.supabase.co/functions/v1/vapi`
- **Auth:** `Authorization: Bearer <VAPI_COMPAT_KEY>` (our "Vapi private key")

## Endpoints (identical to api.vapi.ai)
| Method | Path | |
|---|---|---|
| GET | `/assistant?limit=` | list |
| GET | `/assistant/{id}` | one |
| POST | `/assistant` | create |
| PATCH | `/assistant/{id}` | update |
| DELETE | `/assistant/{id}` | delete |
| GET | `/call?assistantId=&limit=` | list |
| GET | `/call/{id}` | one |
| POST | `/call` | create + run a turn (Groq + Inworld) |
| DELETE | `/call/{id}` | delete |

Objects are Vapi-shaped camelCase (`assistantId`, `firstMessage`,
`costBreakdown{ transport, stt, llm, tts, vapi, total }`, `endedReason`, …),
mapped from the Postgres rows by `_shared/vapi-map.ts`.

## Deploy
```bash
supabase secrets set VAPI_COMPAT_KEY=<long-random> --project-ref <ref>
supabase functions deploy vapi --no-verify-jwt --project-ref <ref>
```
`--no-verify-jwt` is required: auth is the `VAPI_COMPAT_KEY` (Vapi's private-key
model), not a Supabase JWT.

## The "one URL" swap — all planes interchangeable
Point the backend (or any Vapi client) at any of these and it behaves the same:
```
VAPI_BASE_URL=https://api.vapi.ai                                   VAPI_API_KEY=<vapi key>
VAPI_BASE_URL=http://localhost:8790                                 (our infra-api)
VAPI_BASE_URL=https://<ref>.supabase.co/functions/v1/vapi           VAPI_API_KEY=<VAPI_COMPAT_KEY>
```
Verified: `backend` with `DATA_SOURCE=vapi` + the Supabase URL served customer
and admin views unchanged, cost redaction intact.

> Note: this gateway returns **full** Vapi objects (incl. cost) — it's the
> operator/Vapi surface, protected by the private key. Customer-facing redaction
> is enforced separately on the app's direct-Supabase path (`customer_calls` view).
