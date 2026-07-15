create table if not exists public.booking_calendar_index (
  booking_id uuid primary key references public.bookings_v2(id) on delete cascade,
  reservation_id uuid references public.reservations_v2(id) on delete set null,
  family_id uuid not null,
  stay_unit_id uuid references public.stay_units_v2(id) on delete set null,
  rate_plan_id uuid,
  checkin_date date not null,
  checkout_date date not null,
  stay_nights integer not null,
  booking_status text not null,
  payment_status text not null,
  source_channel text,
  ota_name text,
  guest_display_name text,
  guest_phone_masked text,
  guest_email_masked text,
  room_display_name text,
  property_display_name text,
  channex_booking_id text,
  channex_revision_id text,
  calendar_chip_label text,
  calendar_chip_color_key text,
  total_amount numeric,
  amount_paid numeric,
  amount_due numeric,
  last_inventory_impact_at timestamptz,
  last_payment_update_at timestamptz,
  last_channex_event_at timestamptz,
  source_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_calendar_index_family_checkin_idx
  on public.booking_calendar_index (family_id, checkin_date desc);

create index if not exists booking_calendar_index_family_status_idx
  on public.booking_calendar_index (family_id, booking_status);

create index if not exists booking_calendar_index_family_stay_unit_checkin_idx
  on public.booking_calendar_index (family_id, stay_unit_id, checkin_date);

create index if not exists booking_calendar_index_family_source_channel_idx
  on public.booking_calendar_index (family_id, source_channel);

create index if not exists booking_calendar_index_family_payment_status_idx
  on public.booking_calendar_index (family_id, payment_status);

alter table public.booking_calendar_index enable row level security;

revoke all on public.booking_calendar_index from anon;
revoke all on public.booking_calendar_index from authenticated;
