begin;

alter table public.reservation_folios_v2
  add column if not exists booking_id uuid references public.bookings_v2(id) on delete set null,
  add column if not exists property_id uuid,
  add column if not exists host_id uuid references public.hosts(id) on delete set null,
  add column if not exists guest_user_id uuid references public.users(id) on delete set null,
  add column if not exists source_channel text,
  add column if not exists booking_status text,
  add column if not exists payment_status text,
  add column if not exists guest_total_amount integer not null default 0,
  add column if not exists platform_fee_amount integer not null default 0,
  add column if not exists platform_fee_tax_amount integer not null default 0,
  add column if not exists host_payout_amount integer not null default 0,
  add column if not exists refund_total_amount integer not null default 0,
  add column if not exists calculation_snapshot_id uuid references public.booking_financial_snapshots(id) on delete set null,
  add column if not exists tax_mode text not null default 'PENDING_COMPLIANCE',
  add column if not exists gst_collection_enabled boolean not null default false,
  add column if not exists tcs_enabled boolean not null default false,
  add column if not exists tds_enabled boolean not null default false,
  add column if not exists version integer not null default 1;

create index if not exists reservation_folios_v2_booking_idx
  on public.reservation_folios_v2(booking_id);

create index if not exists reservation_folios_v2_host_idx
  on public.reservation_folios_v2(host_id, status);

alter table public.folio_line_items_v2
  add column if not exists line_code text,
  add column if not exists line_subtype text,
  add column if not exists quantity integer not null default 1,
  add column if not exists unit_amount integer not null default 0,
  add column if not exists source_event_type text,
  add column if not exists source_event_id text,
  add column if not exists source_system text,
  add column if not exists idempotency_key text,
  add column if not exists reversal_of_line_item_id uuid references public.folio_line_items_v2(id) on delete set null,
  add column if not exists calculation_snapshot_id uuid references public.booking_financial_snapshots(id) on delete set null,
  add column if not exists tax_mode text,
  add column if not exists sort_order integer not null default 0;

create index if not exists folio_line_items_v2_booking_idx
  on public.folio_line_items_v2(booking_id, occurred_at desc);

create index if not exists folio_line_items_v2_source_event_idx
  on public.folio_line_items_v2(source_event_type, source_event_id);

create unique index if not exists folio_line_items_v2_folio_idempotency_idx
  on public.folio_line_items_v2(folio_id, idempotency_key)
  where idempotency_key is not null;

commit;
