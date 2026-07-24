begin;

create table if not exists public.payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  entity_type text,
  entity_id text,
  raw_payload jsonb not null default '{}'::jsonb,
  signature_valid boolean not null default false,
  processing_status text not null default 'pending',
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  constraint payment_provider_events_provider_event_uidx unique (provider, event_id)
);

create index if not exists payment_provider_events_processing_idx
  on public.payment_provider_events(provider, processing_status, created_at desc);

create index if not exists payment_provider_events_entity_idx
  on public.payment_provider_events(entity_type, entity_id);

revoke all on public.payment_provider_events from anon, authenticated;
grant select, insert, update, delete on public.payment_provider_events to service_role;

commit;
