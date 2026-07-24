begin;

create index if not exists users_email_idx
  on public.users(email);

create index if not exists users_role_idx
  on public.users(role);

create index if not exists stories_v2_image_urls_idx
  on public.stories_v2 using gin (image_urls);

create unique index if not exists stay_units_v2_host_unit_key_idx
  on public.stay_units_v2(host_id, unit_key);

create index if not exists reservation_folios_v2_booking_idx
  on public.reservation_folios_v2(booking_id);

create index if not exists reservation_folios_v2_host_idx
  on public.reservation_folios_v2(host_id);

create index if not exists folio_line_items_v2_booking_idx
  on public.folio_line_items_v2(booking_id);

create index if not exists folio_line_items_v2_source_event_idx
  on public.folio_line_items_v2(source_event_id);

create unique index if not exists folio_line_items_v2_folio_idempotency_idx
  on public.folio_line_items_v2(folio_id, idempotency_key);

create index if not exists hosts_payout_hold_status_idx
  on public.hosts(payout_hold_status, updated_at desc);

create index if not exists families_payout_hold_status_idx
  on public.families(payout_hold_status, updated_at desc);

commit;
