# E2E-SIS — Implementation Plan (hand-off)

Hand-off doc for continuing this project with a fresh agent. Read §0 fully before
touching code. Paths are relative to `END-TO-END-SIS/` unless noted.

---

## 0. Context (read first)

**What this is:** a two-sided Turkish voice-agent SaaS.
- **Customer** (restaurants) — a Voicebit-style app: phone revenue, orders,
  answer rate, agent config, plan usage. **Must never see our cost/margin.**
- **Admin** (us) — MRR, COGS, per-tenant margins, system health.
- Same app, **role-based login** decides which experience you get.
- Bigger picture: also targets **consulates / regulated buyers** where data must
  stay in Türkiye (see `../docs/data-residency-turkiye-research.md`).

**Repo layout (`END-TO-END-SIS/`):**
| Dir | What | State |
|---|---|---|
| `customer/` | THE app (Expo/React Native). Login → customer view or admin cockpit. Folder name is historical. | ✅ built; direct Supabase adapter added; demo/backend fallback remains |
| `mobile/` | earlier admin-only prototype | legacy, removable |
| `backend/` | Node API: `/customer/*` (cost-stripped) + `/admin/*` (full) + `POST /auth/login`. `DATA_SOURCE=demo\|vapi` proxies any Vapi-shaped API. | ✅ built + verified |
| `infra-api/` | **our own Vapi-compatible API** (Groq LLM/STT + Inworld TTS) with a call engine + cost accounting. Pluggable `Store` (`DB=memory\|postgres`). | ✅ built + verified |
| `supabase/` | **backend-less** option: app → Supabase directly. Schema + RLS + cost-free `customer_calls` view + `call` + `ingest-call` Edge Functions. | ✅ deployed + live smoke-tested |
| `docs/` | architecture + research | ✅ |

**Four interchangeable data planes** (all produce/consume the same Vapi-ish shapes):
1. `demo` (in-memory) · 2. **Vapi** (`api.vapi.ai`) · 3. **infra-api** (our Node API) ·
4. **direct Supabase** (this plan's target).

**DECISION (chosen by the product owner):** go **direct-to-Supabase** — the app talks
straight to Supabase; the only server code is the `call` Edge Function. Rationale:
cheapest, least to run. Keep `infra-api` as the alternative/portable engine.

**THE ONE INVARIANT — do not break:** a **customer must never receive `cost` /
`cost_breakdown` / margin**. In the Supabase design this is enforced by Postgres
(RLS makes `calls` admin-only; customers read the `customer_calls` view which has
no cost columns and filters to their tenant). Every new customer-facing
table/view/RPC MUST exclude cost and filter by tenant, and MUST be tested.

---

## 1. Prerequisites
- A **Supabase project** (Cloud for the SMB tier; **self-hosted in Türkiye** for
  the consulate/health tier — same schema/RLS).
- Env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `GROQ_API_KEY`, `INWORLD_API_KEY`, `AFIYET_INGEST_SECRET`, and current
  pricing values (`USD_TRY`, Verimor package fields, `PRICE_*` overrides).
- Node ≥18, Expo (SDK 54 already pinned), Supabase CLI.
- Confirm the **Inworld TTS request shape** against current Inworld docs and fix
  `supabase/functions/_shared/engine.ts` (`inworldTts`) + `infra-api/src/providers/inworld.js`
  if needed. Groq is exact.

---

## 2. Phase A — Stand up Supabase  (done; re-run for new projects)
1. Run `supabase/migrations/0001_init.sql` in the SQL editor (or `supabase db push`).
2. Run `supabase/seed.sql`.
3. Auth → create users (`lezzet@demo.com`, `admin@afiyet.ai`), then link roles via
   `public.profiles` (SQL snippet is at the bottom of `seed.sql`).
4. `supabase secrets set GROQ_API_KEY=… INWORLD_API_KEY=… AFIYET_INGEST_SECRET=…`
   plus pricing vars, then deploy `call` and `ingest-call`.

**Acceptance (must all pass):**
- Signed in as the **customer**: `select * from customer_calls` returns that
  tenant's rows **with no cost columns**; `select * from calls` returns **0 rows**.
- Signed in as **admin**: `select * from calls` returns all rows **including
  `cost_breakdown`**.
- `POST /functions/v1/call` with `{assistantId, input}` inserts a call and returns
  a **cost-free** body.
- Verify the leak explicitly: as a customer, try every way to read cost
  (`from('calls')`, `rpc`, view columns) → all denied/absent.

---

## 3. Phase B — Migrate the app to supabase-js  (2–3 days)  ← main work
Goal: `customer/` runs directly on Supabase; delete the dependency on our Node
`backend/`. Keep all screens/UI/icons.

1. `cd customer && npx expo install @supabase/supabase-js`.
2. New `src/api/supabase.js`: `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`
   (read from Expo config/env). Replace `src/api/client.js` usage.
3. `src/api/auth.js` → `supabase.auth.signInWithPassword`; after login read
   `profiles(role, tenant_id)`; store session (supabase persists it).
4. `src/api/customer.js`:
   - `listCalls` → `supabase.from('customer_calls').select('*')`
   - `getAssistant` → `from('assistants').select('*').eq('tenant_id', …)` (RLS scopes it)
   - `updateAssistant` → `from('assistants').update({config}).eq('id', …)`
   - `getPhoneNumber` → from `tenants`/`phone_numbers`
   - `getOverview` → compute client-side from `customer_calls` (port
     `customerOverview()` from `backend/server.js`).
   - `getCall(id)` → `from('customer_calls').select('*').eq('id', …).single()`
5. `src/api/admin.js`:
   - `listAdminCalls` → `from('calls').select('*')` (has cost)
   - `listTenants` / `getAdminOverview` → from `tenants` + `calls`, compute
     margins client-side (port `adminTenants()`/`adminOverview()` from `backend/server.js`).
6. Run-a-call (if you keep a test button) → `supabase.functions.invoke('call', {body})`.
7. `App.js` — role routing already exists; just feed it the Supabase session/role.

**Acceptance:**
- Login as customer → Voicebit view populated **from Supabase**, no cost anywhere
  (check network tab / query responses).
- Login as admin → margins/MRR from Supabase.
- Editing the agent config persists (RLS-scoped).
- `backend/` no longer needed for the app to work.

---

## 4. Phase C — Real order extraction  (½ day)
Implemented in both engines. In `supabase/functions/_shared/engine.ts` and
`infra-api/src/engine.js`:
- After the LLM turn, add a **structured-data pass** (a 2nd Groq call in JSON
  mode, or Groq tool/JSON output) that extracts `{ intent, items, total,
  customerName }` per `assistant.analysisPlan.structuredDataSchema`.
- Write those to the call row (`order_amount`, `analysis.structuredData`).

**Acceptance:** a call saying "iki pizza, toplam 420 lira" yields `order_amount=420`
and items; customer revenue/avg-ticket become real.

---

## 5. Phase D — Real voice (telephony + streaming)  (1–2 weeks)
Edge Functions are fine for **web/test** calls, not real-time phone audio.
- **Implemented scaffold:** `supabase/functions/ingest-call` and
  `infra-api` `/telephony/ingest-call` accept completed worker calls with
  measured `durationSec`, `audioSec`, provider usage, recording path, and Verimor
  CDR. These write `calls`, `call_usage_events`, `telephony_cdrs`,
  `cost_reconciliations`, and `audit_log`.
- **Worker bridge:** root `apps/voice-agent` now posts completed calls to
  Supabase `ingest-call` when `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
  `AFIYET_INGEST_SECRET` are set.
- **Implemented cost control:** cheap-route pricing defaults to Groq 8B +
  Inworld 1.5 Mini + Verimor package math; over-target calls are flagged.
- **Inbound phone:** stand up a persistent voice worker — reuse the sovereign
  cascade in the parent repo: `afiyet-ai` `apps/voice-agent` + `packages/*`
  (STT/LLM/TTS providers, streaming, barge-in filler already built and tested).
- Telephony: **Jambonz** (or Twilio) → worker → runs the turn loop → writes the
  finished call to Supabase (same `calls` shape). See
  `../docs/self-hosted-architecture.md`.
- **Sovereign tier:** self-host Supabase **and** the voice worker in Türkiye.

**Remaining acceptance:** connect the worker to real Verimor/Jambonz media and
prove a live inbound call produces a `calls` row (transcript, order, reconciled
cost) visible in both customer and admin views.

---

## 6. Phase E — Harden  (ongoing)
- **RLS/schema tests:** added repo tests that assert `customer_calls` has no cost
  fields and cost tables are admin-only.
- **Storage:** `call-recordings` private bucket + tenant-scoped policies added in
  migration `0002_production_hardening.sql`.
- **Audit log:** hash-chained audit events added in `infra-api/src/audit.js` and
  Supabase `audit_log`.
- **Still harden next:** real provider smoke tests, retry/backoff on provider
  failures, production rate-limit enforcement, invoice import automation.

---

## Critical constraints (never violate)
1. **Cost redaction** — customers never get `cost`/`cost_breakdown`/margin. New
   customer surfaces must exclude cost + filter by tenant, and be tested.
2. **Data residency** — consulate/health tier → self-hosted Supabase + voice
   worker **in Türkiye**. SMB tier → cloud OK with KVKK SCC paperwork
   (`../docs/data-residency-turkiye-research.md`).
3. **The LLM never connects to the DB directly** (per the consular dossier
   `../../turkish_consular_call_center_research.md`); access stays behind
   typed queries / the Edge Function.
4. **Keep the contract stable** — all four data planes share Vapi-ish shapes so
   they stay interchangeable; don't fork the shapes.

---

## File map (key files)
- Redaction/RLS: `supabase/migrations/0001_init.sql` (the `customer_calls` view is the crux).
- Call engine (Deno): `supabase/functions/call/index.ts`, `supabase/functions/_shared/engine.ts`.
- Call engine (Node, parity): `infra-api/src/engine.js`, `infra-api/src/pricing.js`, `infra-api/src/providers/{groq,inworld}.js`.
- Server-side redaction reference (to port client-side): `backend/server.js`
  (`customerOverview`, `adminTenants`, `adminOverview`, `toCustomerCall*`).
- App: `customer/App.js` (role routing), `customer/src/api/*` (swap to supabase-js),
  `customer/src/screens/*` (unchanged), `customer/src/components/ui.js` (Feather icons, theme).
- Sovereign voice worker (for Phase D): parent repo `afiyet-ai/apps/voice-agent`,
  `afiyet-ai/packages/{providers,voice-core,domain}`, `afiyet-ai/tools/local-stack`.

---

## Known gaps / risks
- Production hardening migration `0002_production_hardening.sql` is deployed to
  the live project.
- `ingest-call` is deployed and protected with `AFIYET_INGEST_SECRET`.
- **Inworld** request/response shape has been aligned to current docs, but still needs a real-key smoke test.
- **Order total extraction** now exists in both engines; still needs real-call QA against messy Turkish orders.
- App now supports direct Supabase when `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set.
- **Telephony media not wired** — completed-call/CDR ingest exists, but live
  Verimor/Jambonz media needs provider credentials and a worker deployment.
- `security_invoker=false` on `customer_calls` relies on the view being owned by a
  role that bypasses RLS (Supabase `postgres`) — confirm after migration.

---

## Alternative (if Supabase is dropped)
Keep `backend/` + `infra-api/` with `DB=postgres` (works with Neon / self-hosted
Postgres too). More portable and keeps the Vapi↔us base-URL swap, at the cost of
running a small Node service. The app then keeps talking to `backend/` instead of
Supabase directly.
```
