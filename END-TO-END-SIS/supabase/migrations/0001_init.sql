-- E2E-SIS Supabase schema + RLS.
-- The app connects DIRECTLY to Supabase; this file is what keeps a customer from
-- ever seeing our cost/margin — enforced by Postgres, not by app code.

-- ============================ Tables ============================
create table if not exists public.tenants (
  id text primary key,
  name text not null,
  plan jsonb not null default '{}',          -- { name, monthlyPrice, includedMinutes }
  phone_number text,
  status text not null default 'active',
  created_at timestamptz default now()
);

-- Links Supabase Auth users to a role + tenant.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer',     -- 'customer' | 'admin'
  tenant_id text references public.tenants(id),
  created_at timestamptz default now()
);

create table if not exists public.assistants (
  id text primary key,
  tenant_id text references public.tenants(id),
  name text not null,
  first_message text,
  model jsonb not null default '{}',
  voice jsonb not null default '{}',
  transcriber jsonb not null default '{}',
  config jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.calls (
  id text primary key,
  tenant_id text references public.tenants(id),
  assistant_id text references public.assistants(id),
  type text default 'inboundPhoneCall',
  status text default 'ended',
  answered boolean default true,
  outcome text,
  order_amount numeric default 0,
  customer_name text,
  summary text,
  duration_sec integer default 0,
  cost numeric default 0,                    -- INTERNAL (never exposed to customers)
  cost_breakdown jsonb default '{}',         -- INTERNAL
  messages jsonb default '[]',
  analysis jsonb default '{}',
  recording_url text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists calls_tenant_idx on public.calls(tenant_id);
create index if not exists calls_assistant_idx on public.calls(assistant_id);

create table if not exists public.phone_numbers (
  id text primary key,
  tenant_id text references public.tenants(id),
  assistant_id text references public.assistants(id),
  number text,
  provider text default 'afiyet-telephony',
  status text default 'active',
  created_at timestamptz default now()
);

-- ====================== Helper functions =======================
-- SECURITY DEFINER + fixed search_path so RLS policies can read the caller's
-- role/tenant safely.
create or replace function public.current_tenant_id()
returns text language sql stable security definer set search_path = public as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- =========================== RLS ==============================
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.assistants enable row level security;
alter table public.calls enable row level security;
alter table public.phone_numbers enable row level security;

create policy profiles_self on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy tenants_read on public.tenants for select
  using (public.is_admin() or id = public.current_tenant_id());

create policy assistants_read on public.assistants for select
  using (public.is_admin() or tenant_id = public.current_tenant_id());
create policy assistants_update on public.assistants for update
  using (public.is_admin() or tenant_id = public.current_tenant_id())
  with check (public.is_admin() or tenant_id = public.current_tenant_id());

-- calls has cost columns → ADMINS ONLY on the base table. Customers CANNOT read
-- this table at all; they use the cost-free view below.
create policy calls_admin_only on public.calls for select using (public.is_admin());

create policy phone_read on public.phone_numbers for select
  using (public.is_admin() or tenant_id = public.current_tenant_id());

-- ================= Cost-free customer view ====================
-- Runs as owner (security_invoker=false) so it BYPASSES calls' admin-only RLS,
-- but it (a) exposes ONLY safe columns — no cost/cost_breakdown exist here — and
-- (b) filters to the caller's own tenant. This is how a customer reads calls
-- without any path to our COGS.
create or replace view public.customer_calls
with (security_invoker = false) as
  select id, tenant_id, assistant_id, type, status, answered, outcome,
         order_amount, customer_name, summary, duration_sec, messages, analysis,
         recording_url, started_at, ended_at, created_at
  from public.calls
  where tenant_id = public.current_tenant_id();

-- ========================== Grants ============================
grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.tenants to authenticated;
grant select, update on public.assistants to authenticated;
grant select on public.phone_numbers to authenticated;
grant select on public.calls to authenticated;          -- RLS still limits to admins
grant select on public.customer_calls to authenticated; -- customers read their calls here
