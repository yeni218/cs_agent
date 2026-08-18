# AfiyetSesli — The App (one app, role-based login)

> Folder is named `customer/` for historical reasons — it's the **single unified
> app**. Same binary for restaurants and for us; the **login decides** which
> experience you get.

- **Restaurant login** → Voicebit-like view: phone revenue, orders, answer rate,
  agent config, plan usage. **Never shows our costs.**
- **Admin login** (us) → ops cockpit: MRR, COGS, gross margin, per-tenant margins,
  system health, per-call cost breakdown.

The app talks **directly to Supabase** — Supabase *is* the backend (auth,
tenancy, RLS-enforced customer cost redaction, call store). There is no Node
backend and no demo mode.

## Run
```bash
npm install
cp .env.example .env      # set EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo start            # w = web, or scan QR in Expo Go
```
Log in with a Supabase Auth user whose role/tenant is set in `public.profiles`
(a signup auto-creates the profile via trigger; assign role/tenant via user
metadata or an `update public.profiles ...`).

## How it's wired
- `src/api/supabase.js` — the Supabase client.
- `src/api/auth.js` — `supabase.auth.signInWithPassword` → reads `profiles(role, tenant_id)`.
- `src/api/customer.js` — reads the cost-free `customer_calls` view + `assistants`/`tenants`.
- `src/api/admin.js` — reads `calls` (with cost) + `tenants`, computes margins client-side.
- `src/api/shape.js` — maps Postgres rows to the shapes the screens use.
- `App.js` — session gate + role-based tabs + logout.

The redaction guarantee is **server-side** (Supabase RLS + the `customer_calls`
view has no cost columns), so a customer literally cannot fetch cost.

## Backend / provider (optional)
`../backend/` and `../infra-api/` are legacy/optional — the Vapi-provider &
portability layer. The app no longer uses them. To run calls on **Vapi** instead
of our Groq+Inworld engine, point a Vapi assistant's Server URL at the
`ingest-call` Edge Function; results flow into the same Supabase the app reads.
