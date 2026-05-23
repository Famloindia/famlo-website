begin;

create table if not exists public.reservations_v2 (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid unique references public.bookings_v2(id) on delete set null,
  legacy_booking_id uuid,
  reservation_code text unique,
  operational_status text not null default 'pending',
  source_kind text not null default 'direct',
  source_channel text not null default 'famlo_direct',
  primary_guest_user_id uuid references public.users(id) on delete set null,
  host_id uuid references public.hosts(id) on delete set null,
  family_id uuid references public.families(id) on delete set null,
  stay_unit_id uuid references public.stay_units_v2(id) on delete set null,
  check_in_date date,
  check_out_date date,
  adults_count integer not null default 1,
  children_count integer not null default 0,
  currency text not null default 'INR',
  total_amount integer not null default 0,
  folio_status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_v2_status_check check (
    operational_status in (
      'pending',
      'awaiting_payment',
      'pending_host_approval',
      'accepted',
      'confirmed',
      'checked_in',
      'checked_out',
      'completed',
      'cancelled',
      'no_show'
    )
  ),
  constraint reservations_v2_source_kind_check check (source_kind in ('direct', 'ota', 'manual', 'migration')),
  constraint reservations_v2_folio_status_check check (folio_status in ('open', 'closed', 'void')),
  constraint reservations_v2_guest_counts_check check (adults_count >= 0 and children_count >= 0)
);

create index if not exists reservations_v2_host_idx on public.reservations_v2(host_id, created_at desc);
create index if not exists reservations_v2_family_idx on public.reservations_v2(family_id, created_at desc);
create index if not exists reservations_v2_stay_unit_idx on public.reservations_v2(stay_unit_id, check_in_date, check_out_date);
create index if not exists reservations_v2_status_idx on public.reservations_v2(operational_status, check_in_date);

create table if not exists public.reservation_segments_v2 (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations_v2(id) on delete cascade,
  segment_index integer not null default 1,
  stay_unit_id uuid references public.stay_units_v2(id) on delete set null,
  check_in_date date,
  check_out_date date,
  segment_status text not null default 'reserved',
  source_booking_id uuid references public.bookings_v2(id) on delete set null,
  guests_count integer not null default 1,
  actual_check_out_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_segments_v2_status_check check (segment_status in ('reserved', 'checked_in', 'checked_out', 'cancelled')),
  constraint reservation_segments_v2_guests_check check (guests_count >= 0),
  unique (reservation_id, segment_index)
);

create index if not exists reservation_segments_v2_stay_unit_idx
  on public.reservation_segments_v2(stay_unit_id, check_in_date, check_out_date);

create table if not exists public.reservation_guests_v2 (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations_v2(id) on delete cascade,
  platform_user_id uuid references public.users(id) on delete set null,
  guest_role text not null default 'primary',
  guest_type text not null default 'adult',
  is_primary boolean not null default false,
  full_name text,
  email text,
  phone text,
  id_document_type text,
  id_document_last4 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_guests_v2_role_check check (guest_role in ('primary', 'additional', 'ota_contact')),
  constraint reservation_guests_v2_type_check check (guest_type in ('adult', 'child', 'infant'))
);

create unique index if not exists reservation_guests_v2_primary_uidx
  on public.reservation_guests_v2(reservation_id)
  where is_primary = true;

create index if not exists reservation_guests_v2_platform_user_idx
  on public.reservation_guests_v2(platform_user_id, created_at desc);

create table if not exists public.reservation_assignment_history_v2 (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations_v2(id) on delete cascade,
  segment_id uuid references public.reservation_segments_v2(id) on delete set null,
  stay_unit_id uuid references public.stay_units_v2(id) on delete set null,
  event_type text not null default 'initial_assignment',
  assigned_from timestamptz not null default now(),
  assigned_to timestamptz,
  assigned_by_user_id uuid references public.users(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint reservation_assignment_history_v2_event_type_check
    check (event_type in ('initial_assignment', 'reassigned', 'unassigned'))
);

create index if not exists reservation_assignment_history_v2_lookup_idx
  on public.reservation_assignment_history_v2(reservation_id, created_at desc);

create table if not exists public.reservation_lifecycle_events_v2 (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations_v2(id) on delete cascade,
  booking_id uuid references public.bookings_v2(id) on delete set null,
  segment_id uuid references public.reservation_segments_v2(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  actor_user_id uuid references public.users(id) on delete set null,
  actor_role text,
  source text not null default 'famlo',
  idempotency_key text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint reservation_lifecycle_events_v2_event_type_check
    check (
      event_type in (
        'reservation_backfilled',
        'reservation_created',
        'status_synced',
        'modification_requested',
        'modification_applied',
        'cancellation_applied',
        'guest_checked_in',
        'guest_checked_out',
        'auto_completed',
        'no_show_marked',
        'early_checkout_applied',
        'reassigned'
      )
    )
);

create unique index if not exists reservation_lifecycle_events_v2_idempotency_uidx
  on public.reservation_lifecycle_events_v2(idempotency_key)
  where idempotency_key is not null;

create index if not exists reservation_lifecycle_events_v2_lookup_idx
  on public.reservation_lifecycle_events_v2(reservation_id, created_at desc);

create table if not exists public.reservation_folios_v2 (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations_v2(id) on delete cascade,
  status text not null default 'open',
  currency text not null default 'INR',
  balance_amount integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_folios_v2_status_check check (status in ('open', 'closed', 'void'))
);

create table if not exists public.folio_line_items_v2 (
  id uuid primary key default gen_random_uuid(),
  folio_id uuid not null references public.reservation_folios_v2(id) on delete cascade,
  reservation_id uuid not null references public.reservations_v2(id) on delete cascade,
  booking_id uuid references public.bookings_v2(id) on delete set null,
  line_type text not null,
  direction text not null,
  amount integer not null default 0,
  currency text not null default 'INR',
  occurred_at timestamptz not null default now(),
  reference_type text,
  reference_id text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint folio_line_items_v2_line_type_check check (
    line_type in ('room_charge', 'payment', 'refund', 'tax', 'fee', 'adjustment')
  ),
  constraint folio_line_items_v2_direction_check check (direction in ('debit', 'credit'))
);

create index if not exists folio_line_items_v2_folio_idx
  on public.folio_line_items_v2(folio_id, occurred_at desc);

create index if not exists folio_line_items_v2_reservation_idx
  on public.folio_line_items_v2(reservation_id, occurred_at desc);

commit;
