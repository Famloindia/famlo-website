alter table public.channel_booking_revisions
  add column if not exists source text not null default 'booking_revision_feed';

alter table public.channel_booking_revisions
  add column if not exists linked_booking_id uuid references public.bookings_v2(id) on delete set null;

create index if not exists channel_booking_revisions_source_idx
  on public.channel_booking_revisions (source);

create index if not exists channel_booking_revisions_linked_booking_id_idx
  on public.channel_booking_revisions (linked_booking_id);

create unique index if not exists channel_booking_revisions_provider_booking_source_uidx
  on public.channel_booking_revisions (provider_code, external_booking_id, source)
  where external_booking_id is not null;
