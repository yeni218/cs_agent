# E2E-SIS on Supabase (direct, no backend)

The "as easy as possible" architecture: the app talks **directly to Supabase**.
No API server of ours to run.

```
[ app: supabase-js ]
   • Auth (login → JWT: role + tenant)
   • data: RLS + customer/admin views    ← redaction enforced by Postgres
   • functions/call                      ← web/test turn (Groq + Inworld)
   • functions/ingest-call               ← production worker/CDR ingest
```

## What enforces "customers never see cost"
Postgres, not app code:
- `calls` (has `cost`, `cost_breakdown`) → RLS **admin-only**.
- `customer_calls` **view** → cost columns don't exist in it, and it filters to the
  caller's own tenant. Customers read here.
So even a hand-crafted `supabase.from('calls')` returns nothing for a customer.

## Deploy
1. Create a Supabase project (or self-host in Türkiye for the sovereign tier).
2. **Schema:** run `migrations/0001_init.sql` in SQL Editor (or `supabase db push`).
3. **Demo data:** run `seed.sql`.
4. **Users:** in Auth → create users (e.g. `lezzet@demo.com`, `admin@afiyet.ai`),
   then link roles:
   ```sql
   insert into public.profiles (id, role, tenant_id) values
     ('<lezzet-user-uuid>', 'customer', 't_lezzet'),
     ('<admin-user-uuid>',  'admin',    null);
   ```
5. **Edge Function secrets & deploy:**
   ```bash
   supabase secrets set \
     GROQ_API_KEY=... \
     INWORLD_API_KEY=... \
     AFIYET_INGEST_SECRET=... \
     USD_TRY=47.52 \
     VERIMOR_PACKAGE_MINUTES=10000 \
     VERIMOR_PACKAGE_PRICE_TRY=2999
   supabase functions deploy call
   supabase functions deploy ingest-call
   ```

## Client integration (replaces our backend + client.js)
```js
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// login
await supabase.auth.signInWithPassword({ email, password });
const { data: { user } } = await supabase.auth.getUser();
const { data: profile } = await supabase.from('profiles').select('role, tenant_id').eq('id', user.id).single();

// CUSTOMER (cost-free by construction)
const { data: calls } = await supabase.from('customer_calls').select('*');            // no cost columns
const { data: assistants } = await supabase.from('assistants').select('*');           // RLS: own tenant
await supabase.from('assistants').update({ config }).eq('id', assistantId);           // edit agent

// ADMIN (full economics)
const { data: allCalls } = await supabase.from('calls').select('*');                  // includes cost_breakdown
const { data: tenants } = await supabase.from('tenants').select('*');

// run a web/test call
const { data: call } = await supabase.functions.invoke('call', { body: { assistantId, input: 'iki pizza istiyorum' } });
```
Overview numbers (revenue, answer rate, MRR, margins) are computed **client-side**
from these rows — the same way `mobile/`'s analytics already work.

## Production call ingest

The persistent voice worker should send completed calls here:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/ingest-call" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-afiyet-ingest-secret: $AFIYET_INGEST_SECRET" \
  -H "content-type: application/json" \
  -d '{
    "assistantId": "asst_lezzet",
    "externalCallId": "verimor-123",
    "durationSec": 84,
    "audioSec": 74,
    "messages": [{"role":"user","message":"iki pizza toplam 420 lira"}],
    "analysis": {"summary":"iki pizza", "structuredData":{"intent":"order","total":420}},
    "usage": {"promptTokens":800, "completionTokens":150, "ttsChars":400},
    "telephonyCdr": {"durationSec":84, "billedSec":84, "costTry":0.42, "exchangeRate":47.52}
  }'
```

This writes:
- `calls` with internal `cost` / `cost_breakdown`
- `call_usage_events`
- `telephony_cdrs`
- `cost_reconciliations`
- `audit_log`

Customers still read only `customer_calls`, where cost columns do not exist.

## Migrating the app
Swap the app's `src/api/client.js` (fetch) for a `supabase-js` client and change
each screen's data call to the queries above. Auth screen → `supabase.auth`.
Everything else (screens, UI, icons) stays.

## Tiers (residency)
- **SMB / restaurant** → Supabase Cloud (fast, cheap).
- **Consulate / health** → **self-hosted Supabase in Türkiye** (same schema/RLS),
  so data never leaves the country.
