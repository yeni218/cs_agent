-- Maps a Vapi-managed assistant to the Afiyet assistant/tenant that owns it.
-- Keep this separate from `id`: callers use Vapi's external `asst_...` id,
-- while all foreign keys and tenant ownership remain inside Afiyet.
alter table public.assistants
  add column if not exists vapi_assistant_id text;

create unique index if not exists assistants_vapi_assistant_id_unique
  on public.assistants (vapi_assistant_id)
  where vapi_assistant_id is not null;

comment on column public.assistants.vapi_assistant_id is
  'External Vapi assistant ID used to resolve completed Vapi call webhooks.';
