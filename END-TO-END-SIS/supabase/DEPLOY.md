# Deploy + verify (Supabase)

## Flag status (from code review)
| Flag | Status |
|---|---|
| App deps not installed locally | ✅ `npm install` run in `customer/` |
| Audit-log chain race | ✅ fixed — `append_audit_event()` RPC uses a tx advisory lock + SQL hash chain (`0003`); both Edge Functions call it |
| Profiles not auto-created | ✅ fixed — `handle_new_user()` trigger on `auth.users` (`0003`) |
| `function_request_log` not written | ✅ fixed — `call` + `ingest-call` now log each request |
| Recording path convention | ⚠ doc-only — the voice worker MUST upload recordings to `"{tenant_id}/…"` or the Storage RLS won't scope them |
| Run migrations + live RLS test | ⛔ needs your Supabase login (see below) — I can't do the interactive `supabase login` |

## One-time: authenticate the CLI (you run this)
The CLI here is `npx supabase` (v2.114+). Interactive login can't be automated:
```powershell
# option A: interactive
npx supabase login
# option B: paste a token from supabase.com/dashboard/account/tokens
$env:SUPABASE_ACCESS_TOKEN = "sbp_xxx"
```

## Deploy
```powershell
cd END-TO-END-SIS\supabase
npx supabase link --project-ref <your-project-ref>

# schema (applies 0001 through 0004 in order)
npx supabase db push
# demo data (or run seed.sql in the SQL editor)
npx supabase db execute --file seed.sql   # or paste seed.sql in Studio

# Edge Function secrets + deploy
npx supabase secrets set GROQ_API_KEY=... INWORLD_API_KEY=... AFIYET_INGEST_SECRET=<long-random>
npx supabase functions deploy call
npx supabase functions deploy ingest-call
```

## Users
Create Auth users in Studio (or via API). The `0003` trigger auto-creates a
`profiles` row. To assign role/tenant, set user metadata at invite time:
```
raw_user_meta_data = { "role": "customer", "tenant_id": "t_lezzet" }   // or role:"admin"
```
…or just update `profiles` after creation:
```sql
update public.profiles set role='customer', tenant_id='t_lezzet' where id='<uuid>';
```

## Vapi assistant mapping
Vapi sends its own assistant ID in an `end-of-call-report`. Map that ID to the
Afiyet assistant that belongs to the customer tenant before making a test call:

```sql
update public.assistants
set vapi_assistant_id = 'asst_from_vapi_dashboard'
where id = 'asst_lezzet';
```

Each Vapi assistant ID can belong to only one Afiyet assistant. The
`ingest-call` function resolves this mapping before it writes the call.

## The acceptance test (prove the redaction, run in SQL editor)
Simulate a customer JWT and confirm they cannot reach cost:
```sql
-- act as a specific customer user
select set_config('request.jwt.claims',
  json_build_object('sub','<lezzet-customer-uuid>','role','authenticated')::text, true);
set role authenticated;

select count(*) from public.calls;            -- EXPECT 0  (admin-only RLS)
select count(*) from public.customer_calls;   -- EXPECT >0 (their tenant, no cost cols)
select count(*) from public.call_usage_events;-- EXPECT 0
select count(*) from public.audit_log;        -- EXPECT 0

reset role;
```
As an admin user (`role` admin, `tenant_id` null) `select * from calls` returns
rows **with** `cost_breakdown`.

Also verify the audit chain after a few ingests:
```sql
select * from public.verify_audit_chain();    -- EXPECT 0 rows (chain intact)
```

## App
Set `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` for `customer/`,
then `npx expo start`. Untick "Demo modu" and log in with a real user — the app
routes by the profile role and reads `customer_calls` (customer) or `calls`
(admin).
```
