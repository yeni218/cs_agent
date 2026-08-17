-- Production hardening for real telephony, cost proofing, recordings, and audit.
create extension if not exists pgcrypto;

alter table public.calls add column if not exists external_call_id text;
alter table public.calls add column if not exists cost_status text not null default 'estimated';
alter table public.calls add column if not exists cost_reconciled_at timestamptz;
create index if not exists calls_external_call_idx on public.calls(external_call_id);

-- Recreate the customer view after adding external_call_id. Still no cost fields.
-- Postgres cannot insert a new column into an existing view with
-- create-or-replace, so drop/recreate it explicitly.
drop view if exists public.customer_calls;
create or replace view public.customer_calls
with (security_invoker = false) as
  select id, external_call_id, tenant_id, assistant_id, type, status, answered,
         outcome, order_amount, customer_name, summary, duration_sec, messages,
         analysis, recording_url, started_at, ended_at, created_at
  from public.calls
  where tenant_id = public.current_tenant_id();

create table if not exists public.call_usage_events (
  id bigserial primary key,
  call_id text references public.calls(id) on delete cascade,
  tenant_id text references public.tenants(id),
  provider text not null,
  metric text not null,
  quantity numeric,
  unit text,
  unit_price_usd numeric,
  amount_usd numeric not null default 0,
  raw jsonb not null default '{}',
  created_at timestamptz default now()
);
create index if not exists call_usage_events_call_idx on public.call_usage_events(call_id);
create index if not exists call_usage_events_tenant_idx on public.call_usage_events(tenant_id);

create table if not exists public.telephony_cdrs (
  id text primary key,
  call_id text references public.calls(id) on delete set null,
  external_call_id text,
  tenant_id text references public.tenants(id),
  provider text not null default 'verimor',
  direction text,
  from_number text,
  to_number text,
  duration_sec integer not null default 0,
  billed_sec integer not null default 0,
  cost_try numeric,
  exchange_rate numeric,
  cost_usd numeric,
  raw jsonb not null default '{}',
  created_at timestamptz default now()
);
create index if not exists telephony_cdrs_call_idx on public.telephony_cdrs(call_id);
create index if not exists telephony_cdrs_external_idx on public.telephony_cdrs(external_call_id);
create index if not exists telephony_cdrs_tenant_idx on public.telephony_cdrs(tenant_id);

create table if not exists public.cost_reconciliations (
  id uuid primary key default gen_random_uuid(),
  call_id text references public.calls(id) on delete cascade,
  tenant_id text references public.tenants(id),
  expected_cost_usd numeric not null default 0,
  actual_cost_usd numeric not null default 0,
  delta_usd numeric not null default 0,
  status text not null default 'ok',
  breakdown jsonb not null default '{}',
  created_at timestamptz default now()
);
create index if not exists cost_reconciliations_call_idx on public.cost_reconciliations(call_id);
create index if not exists cost_reconciliations_tenant_idx on public.cost_reconciliations(tenant_id);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null default 'system',
  action text not null,
  entity_type text,
  entity_id text,
  tenant_id text references public.tenants(id),
  previous_hash text,
  hash text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz default now()
);
create index if not exists audit_log_tenant_idx on public.audit_log(tenant_id);
create index if not exists audit_log_entity_idx on public.audit_log(entity_type, entity_id);

create table if not exists public.function_request_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id text references public.tenants(id),
  function_name text not null,
  caller_id uuid,
  ip text,
  status text not null default 'ok',
  created_at timestamptz default now()
);
create index if not exists function_request_log_tenant_idx on public.function_request_log(tenant_id);
create index if not exists function_request_log_created_idx on public.function_request_log(created_at);

create or replace view public.admin_cost_daily
with (security_invoker = true) as
  select
    tenant_id,
    date_trunc('day', coalesce(started_at, created_at))::date as day,
    count(*)::integer as calls,
    round(sum(duration_sec)::numeric / 60, 2) as minutes,
    round(sum(cost)::numeric, 6) as cost_usd,
    case
      when sum(duration_sec) > 0 then round((sum(cost)::numeric / (sum(duration_sec)::numeric / 60)), 6)
      else 0
    end as cost_per_minute_usd,
    count(*) filter (where cost_status = 'review')::integer as review_count
  from public.calls
  group by tenant_id, date_trunc('day', coalesce(started_at, created_at))::date;

alter table public.call_usage_events enable row level security;
alter table public.telephony_cdrs enable row level security;
alter table public.cost_reconciliations enable row level security;
alter table public.audit_log enable row level security;
alter table public.function_request_log enable row level security;

create policy call_usage_events_admin_only on public.call_usage_events for select using (public.is_admin());
create policy telephony_cdrs_admin_only on public.telephony_cdrs for select using (public.is_admin());
create policy cost_reconciliations_admin_only on public.cost_reconciliations for select using (public.is_admin());
create policy audit_log_admin_only on public.audit_log for select using (public.is_admin());
create policy function_request_log_admin_only on public.function_request_log for select using (public.is_admin());

grant select on public.call_usage_events to authenticated;
grant select on public.telephony_cdrs to authenticated;
grant select on public.cost_reconciliations to authenticated;
grant select on public.audit_log to authenticated;
grant select on public.function_request_log to authenticated;
grant select on public.admin_cost_daily to authenticated;
grant select on public.customer_calls to authenticated;

-- Tenant-scoped private recording storage. Object paths must begin with tenant_id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'call-recordings',
  'call-recordings',
  false,
  104857600,
  array['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists call_recordings_read on storage.objects;
create policy call_recordings_read on storage.objects for select to authenticated
using (
  bucket_id = 'call-recordings'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = public.current_tenant_id()
  )
);

drop policy if exists call_recordings_insert on storage.objects;
create policy call_recordings_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'call-recordings'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = public.current_tenant_id()
  )
);
