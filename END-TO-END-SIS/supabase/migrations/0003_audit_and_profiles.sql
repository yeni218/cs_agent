-- Fixes: (1) audit-log chain race, (2) auto-create profile on signup.

-- ---- (1) Serialized, tamper-evident audit append -------------------------
-- Read-then-insert in JS could fork the hash chain under concurrency. This RPC
-- takes a transaction-scoped advisory lock, so concurrent appends serialize and
-- the chain stays linear. Hash is computed in SQL (pgcrypto from 0002).
create or replace function public.append_audit_event(
  p_actor text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_tenant_id text,
  p_metadata jsonb default '{}'
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_prev text;
  v_hash text;
begin
  perform pg_advisory_xact_lock(hashtext('afiyet_audit_log'));
  select hash into v_prev from public.audit_log order by created_at desc limit 1;
  v_hash := encode(
    digest(
      coalesce(v_prev, '') || '|' || coalesce(p_actor,'') || '|' || coalesce(p_action,'') || '|' ||
      coalesce(p_entity_type,'') || '|' || coalesce(p_entity_id,'') || '|' ||
      coalesce(p_tenant_id,'') || '|' || coalesce(p_metadata::text, '{}'),
      'sha256'),
    'hex');
  insert into public.audit_log (actor, action, entity_type, entity_id, tenant_id, previous_hash, hash, metadata)
    values (p_actor, p_action, p_entity_type, p_entity_id, p_tenant_id, v_prev, v_hash, coalesce(p_metadata, '{}'));
  return v_hash;
end $$;

revoke all on function public.append_audit_event(text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.append_audit_event(text, text, text, text, text, jsonb) to service_role;

-- Optional: verify the chain is intact (admin tool). Returns the first broken id.
create or replace function public.verify_audit_chain()
returns table (broken_id uuid, expected text, actual text)
language sql stable security definer set search_path = public, extensions as $$
  with ordered as (
    select id, actor, action, entity_type, entity_id, tenant_id, previous_hash, hash, metadata,
           lag(hash) over (order by created_at) as prev_actual
    from public.audit_log
  )
  select id,
         encode(digest(
           coalesce(prev_actual,'') || '|' || coalesce(actor,'') || '|' || coalesce(action,'') || '|' ||
           coalesce(entity_type,'') || '|' || coalesce(entity_id,'') || '|' ||
           coalesce(tenant_id,'') || '|' || coalesce(metadata::text,'{}'), 'sha256'), 'hex'),
         hash
  from ordered
  where hash <> encode(digest(
           coalesce(prev_actual,'') || '|' || coalesce(actor,'') || '|' || coalesce(action,'') || '|' ||
           coalesce(entity_type,'') || '|' || coalesce(entity_id,'') || '|' ||
           coalesce(tenant_id,'') || '|' || coalesce(metadata::text,'{}'), 'sha256'), 'hex')
  limit 1
$$;

-- ---- (2) Auto-create a profile when an auth user is created ---------------
-- role/tenant come from the user's metadata set at invite/signup time (admin
-- assigns them); default to a tenant-less customer otherwise.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.profiles (id, role, tenant_id)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'customer'),
    nullif(new.raw_user_meta_data->>'tenant_id', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
