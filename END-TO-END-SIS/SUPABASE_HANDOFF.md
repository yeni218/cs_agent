# Supabase Handoff

This note records what was done so another agent can continue without guessing.

## Project

- Supabase project name: `afiyet-ai`
- Project ref: `tdmfpiynrybrnehnoaot`
- Region: Central EU / Frankfurt (`eu-central-1`)
- Dashboard: `https://supabase.com/dashboard/project/tdmfpiynrybrnehnoaot`
- Local Supabase directory: `END-TO-END-SIS/supabase`

## What Is Already Done

1. Installed/verified Supabase CLI access.
2. Created the Supabase project under the logged-in org.
3. Ran `supabase init`, which added `supabase/config.toml`.
4. Linked the repo to the project.
5. Applied `supabase/migrations/0001_init.sql`.
6. Seeded demo data from `supabase/seed.sql`.
7. Deployed the `call` Edge Function.
8. Created two Supabase Auth users and linked their `profiles` rows:
   - `lezzet@demo.com` -> customer, tenant `t_lezzet`
   - `admin@afiyet.ai` -> admin
9. Wrote the customer app's local Supabase env in `customer/.env`.
10. Added production hardening locally:
    - `supabase/migrations/0002_production_hardening.sql`
    - `supabase/functions/ingest-call`
    - usage events, Verimor CDRs, cost reconciliations, audit log, private
      recording bucket policies
    - cheap-route pricing defaults for Groq 8B + Inworld 1.5 Mini + Verimor
11. Applied `0002_production_hardening.sql` to the live project.
12. Set `AFIYET_INGEST_SECRET` and pricing secrets on the live project.
13. Deployed both `call` and `ingest-call` Edge Functions.
14. Ran a live protected `ingest-call` smoke test:
    - inserted an order call for `t_lezzet`
    - reconciled cost: `$0.018313`, status `ok`, target status `ok`
    - customer account saw the call through `customer_calls` with no cost fields
    - customer account saw `0` base `calls` rows
    - admin account saw `calls.cost`, `cost_status`, and `admin_cost_daily`

## Important Local-Only Files

These are intentionally ignored by git and must not be committed:

- `customer/.env` contains the public Supabase URL and anon key for local app runs.
- `supabase/.temp/db-password` contains the generated DB password used for linking.
- `supabase/.temp/lezzet-password` contains the generated customer login password.
- `supabase/.temp/admin-password` contains the generated admin login password.
- `supabase/.temp/ingest-secret` contains the generated `AFIYET_INGEST_SECRET`
  for the deployed `ingest-call` function.

## Commands Used

```bash
cd END-TO-END-SIS

supabase projects create afiyet-ai \
  --org-id tpfuhaqvzsrvodsgmpou \
  --region eu-central-1 \
  --db-password "$(cat supabase/.temp/db-password)"

supabase link \
  --project-ref tdmfpiynrybrnehnoaot \
  --password "$(cat supabase/.temp/db-password)"

npx supabase@latest db push \
  --include-seed \
  --password "$(cat supabase/.temp/db-password)"

npx supabase@latest functions deploy call \
  --project-ref tdmfpiynrybrnehnoaot \
  --use-api \
  --output pretty

npx supabase@latest secrets set \
  AFIYET_INGEST_SECRET="$(cat supabase/.temp/ingest-secret)" \
  USD_TRY=47.52 \
  VERIMOR_PACKAGE_MINUTES=10000 \
  VERIMOR_PACKAGE_PRICE_TRY=2999 \
  VERIMOR_OVERAGE_TRY_PER_MIN=0.99 \
  VERIMOR_BILLING_INCREMENT_SEC=6 \
  PRICE_TARGET_PER_MIN=0.02 \
  --project-ref tdmfpiynrybrnehnoaot

npx supabase@latest functions deploy ingest-call \
  --project-ref tdmfpiynrybrnehnoaot \
  --use-api \
  --output pretty
```

The installed Homebrew CLI was `2.20.5`, which is too old for the new Postgres 17
project config. Use `npx supabase@latest ...` for deployment commands unless the
global CLI is upgraded.

## Verification Already Passed

Live Supabase checks passed:

- customer login works for `lezzet@demo.com`
- admin login works for `admin@afiyet.ai`
- customer can read `customer_calls`
- customer sees `0` rows from base `calls`
- admin can read `calls.cost_breakdown`
- deployed `call` function inserted a demo order call
- function response did not include `cost` or `cost_breakdown`

Expo web export also passed with `customer/.env` loaded.

## Still Needed For Real AI Calls

Groq and Inworld secrets are not set yet. Until Groq and Inworld are set, the
Edge Functions use mock-safe fallback behavior for AI generation.

```bash
cd END-TO-END-SIS
npx supabase@latest secrets set \
  GROQ_API_KEY=... \
  INWORLD_API_KEY=... \
  --project-ref tdmfpiynrybrnehnoaot
```

Redeploy after function code changes:

```bash
npx supabase@latest functions deploy call \
  --project-ref tdmfpiynrybrnehnoaot \
  --use-api \
  --output pretty

npx supabase@latest functions deploy ingest-call \
  --project-ref tdmfpiynrybrnehnoaot \
  --use-api \
  --output pretty
```

Use `ingest-call` for real worker/Verimor calls. It stores internal costs and
returns an internal response only; customers still read the cost-free
`customer_calls` view.

## Running The App

The Expo dev server currently fails on this machine with Node `v20.10.0` because
React Native `0.81.5` requires Node `>=20.19.4`. Upgrade Node before using
`npx expo start --web`.

The static web export works:

```bash
cd END-TO-END-SIS/customer
EXPO_NO_TELEMETRY=1 npx expo export --platform web --output-dir /tmp/e2e-sis-web-export-supabase
python3 -m http.server 19007 --bind 127.0.0.1 --directory /tmp/e2e-sis-web-export-supabase
```

Open `http://127.0.0.1:19007`.
