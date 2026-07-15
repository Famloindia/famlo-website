import pg from "pg";

const { Client } = pg;

const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.SUPABASE_DB_URL ??
  process.env.CHAT_DB_URL;

if (!databaseUrl) {
  console.error("Set DATABASE_URL, POSTGRES_URL, SUPABASE_DB_URL, or CHAT_DB_URL before running this backfill.");
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });

function buildSql(options) {
  const stayUnitSelect = options.hasBookingStayUnitColumn ? "b.stay_unit_id" : "null::uuid";
  const sourceChannelSelect = options.hasBookingSourceChannelColumn ? "b.source_channel" : "'famlo_direct'";

  return `
begin;

with booking_base as (
  select
    b.id as booking_id,
    b.legacy_booking_id,
    b.status,
    b.payment_status,
    b.booking_type,
    b.user_id,
    b.host_id,
    ${stayUnitSelect} as stay_unit_id,
    b.start_date,
    b.end_date,
    b.guests_count,
    b.total_price,
    b.pricing_snapshot,
    ${sourceChannelSelect} as source_channel,
    h.legacy_family_id,
    u.name as guest_name,
    u.email as guest_email,
    u.phone as guest_phone
  from public.bookings_v2 b
  left join public.hosts h on h.id = b.host_id
  left join public.users u on u.id = b.user_id
),
reservation_rows as (
  select
    booking_id,
    legacy_booking_id,
    concat('RSV-', upper(substr(replace(booking_id::text, '-', ''), 1, 10))) as reservation_code,
    case
      when status in ('cancelled', 'cancelled_by_user', 'cancelled_by_partner', 'rejected', 'refunded') then 'cancelled'
      when status in ('awaiting_payment', 'pending_host_approval', 'accepted', 'confirmed', 'checked_in', 'checked_out', 'completed', 'no_show') then status
      else 'pending'
    end as operational_status,
    case
      when coalesce(source_channel, 'famlo_direct') = 'famlo_direct' then 'direct'
      else 'ota'
    end as source_kind,
    coalesce(source_channel, 'famlo_direct') as source_channel,
    user_id as primary_guest_user_id,
    host_id,
    legacy_family_id as family_id,
    case
      when nullif(
        ${options.hasBookingStayUnitColumn ? "coalesce(stay_unit_id::text, pricing_snapshot->>'stay_unit_id')" : "(pricing_snapshot->>'stay_unit_id')"},
        ''
      ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists (
        select 1
        from public.stay_units_v2 su
        where su.id = nullif(
          ${options.hasBookingStayUnitColumn ? "coalesce(stay_unit_id::text, pricing_snapshot->>'stay_unit_id')" : "(pricing_snapshot->>'stay_unit_id')"},
          ''
        )::uuid
      )
      then nullif(
        ${options.hasBookingStayUnitColumn ? "coalesce(stay_unit_id::text, pricing_snapshot->>'stay_unit_id')" : "(pricing_snapshot->>'stay_unit_id')"},
        ''
      )::uuid
      else null
    end as bridged_stay_unit_id,
    start_date as check_in_date,
    coalesce(end_date, start_date) as check_out_date,
    greatest(coalesce(guests_count, 1), 1) as adults_count,
    0 as children_count,
    coalesce(pricing_snapshot->>'currency', 'INR') as currency,
    greatest(coalesce(total_price, 0), 0) as total_amount,
    case
      when status in ('completed', 'cancelled', 'cancelled_by_user', 'cancelled_by_partner', 'rejected', 'refunded') then 'closed'
      else 'open'
    end as folio_status,
    jsonb_build_object(
      'booking_type', booking_type,
      'payment_status', payment_status,
      'backfilled_via', 'reservation_core_phase2'
    ) as metadata,
    guest_name,
    guest_email,
    guest_phone
  from booking_base
),
inserted_reservations as (
  insert into public.reservations_v2 (
    booking_id,
    legacy_booking_id,
    reservation_code,
    operational_status,
    source_kind,
    source_channel,
    primary_guest_user_id,
    host_id,
    family_id,
    stay_unit_id,
    check_in_date,
    check_out_date,
    adults_count,
    children_count,
    currency,
    total_amount,
    folio_status,
    metadata
  )
  select
    booking_id,
    legacy_booking_id,
    reservation_code,
    operational_status,
    source_kind,
    source_channel,
    primary_guest_user_id,
    host_id,
    family_id,
    bridged_stay_unit_id,
    check_in_date,
    check_out_date,
    adults_count,
    children_count,
    currency,
    total_amount,
    folio_status,
    metadata
  from reservation_rows
  on conflict (booking_id) do update set
    operational_status = excluded.operational_status,
    source_kind = excluded.source_kind,
    source_channel = excluded.source_channel,
    primary_guest_user_id = excluded.primary_guest_user_id,
    host_id = excluded.host_id,
    family_id = excluded.family_id,
    stay_unit_id = excluded.stay_unit_id,
    check_in_date = excluded.check_in_date,
    check_out_date = excluded.check_out_date,
    adults_count = excluded.adults_count,
    currency = excluded.currency,
    total_amount = excluded.total_amount,
    folio_status = excluded.folio_status,
    metadata = public.reservations_v2.metadata || excluded.metadata,
    updated_at = now()
  returning id, booking_id
),
resolved_reservations as (
  select r.id as reservation_id, rr.*
  from reservation_rows rr
  join public.reservations_v2 r on r.booking_id = rr.booking_id
),
inserted_segments as (
  insert into public.reservation_segments_v2 (
    reservation_id,
    segment_index,
    stay_unit_id,
    check_in_date,
    check_out_date,
    segment_status,
    source_booking_id,
    guests_count,
    actual_check_out_date,
    metadata
  )
  select
    reservation_id,
    1,
    bridged_stay_unit_id,
    check_in_date,
    check_out_date,
    case
      when operational_status = 'checked_in' then 'checked_in'
      when operational_status in ('checked_out', 'completed') then 'checked_out'
      when operational_status = 'cancelled' then 'cancelled'
      else 'reserved'
    end,
    booking_id,
    adults_count,
    case when operational_status in ('checked_out', 'completed') then check_out_date else null end,
    jsonb_build_object('backfilled_via', 'reservation_core_phase2')
  from resolved_reservations
  on conflict (reservation_id, segment_index) do update set
    stay_unit_id = excluded.stay_unit_id,
    check_in_date = excluded.check_in_date,
    check_out_date = excluded.check_out_date,
    segment_status = excluded.segment_status,
    guests_count = excluded.guests_count,
    actual_check_out_date = excluded.actual_check_out_date,
    updated_at = now()
  returning id, reservation_id
),
resolved_segments as (
  select s.id as segment_id, rr.reservation_id, rr.booking_id, rr.bridged_stay_unit_id
  from resolved_reservations rr
  join public.reservation_segments_v2 s
    on s.reservation_id = rr.reservation_id
   and s.segment_index = 1
),
inserted_guests as (
  insert into public.reservation_guests_v2 (
    reservation_id,
    platform_user_id,
    guest_role,
    guest_type,
    is_primary,
    full_name,
    email,
    phone,
    metadata
  )
  select
    reservation_id,
    primary_guest_user_id,
    'primary',
    'adult',
    true,
    guest_name,
    guest_email,
    guest_phone,
    jsonb_build_object('backfilled_via', 'reservation_core_phase2')
  from resolved_reservations
  on conflict do nothing
  returning id
),
inserted_assignments as (
  insert into public.reservation_assignment_history_v2 (
    reservation_id,
    segment_id,
    stay_unit_id,
    event_type,
    reason,
    metadata
  )
  select
    rs.reservation_id,
    rs.segment_id,
    rs.bridged_stay_unit_id,
    'initial_assignment',
    'Backfilled from booking stay unit',
    jsonb_build_object('backfilled_via', 'reservation_core_phase2')
  from resolved_segments rs
  where rs.bridged_stay_unit_id is not null
    and not exists (
      select 1
      from public.reservation_assignment_history_v2 existing
      where existing.reservation_id = rs.reservation_id
        and existing.segment_id = rs.segment_id
        and existing.stay_unit_id = rs.bridged_stay_unit_id
    )
  returning id
),
inserted_folios as (
  insert into public.reservation_folios_v2 (
    reservation_id,
    status,
    currency,
    balance_amount,
    metadata
  )
  select
    reservation_id,
    folio_status,
    currency,
    total_amount,
    jsonb_build_object('backfilled_via', 'reservation_core_phase2')
  from resolved_reservations
  on conflict (reservation_id) do update set
    status = excluded.status,
    currency = excluded.currency,
    balance_amount = excluded.balance_amount,
    metadata = public.reservation_folios_v2.metadata || excluded.metadata,
    updated_at = now()
  returning id, reservation_id
),
resolved_folios as (
  select f.id as folio_id, rr.reservation_id, rr.booking_id, rr.currency, rr.total_amount
  from resolved_reservations rr
  join public.reservation_folios_v2 f on f.reservation_id = rr.reservation_id
),
inserted_folio_lines as (
  insert into public.folio_line_items_v2 (
    folio_id,
    reservation_id,
    booking_id,
    line_type,
    direction,
    amount,
    currency,
    reference_type,
    reference_id,
    description,
    metadata
  )
  select
    folio_id,
    reservation_id,
    booking_id,
    'room_charge',
    'debit',
    total_amount,
    currency,
    'booking_total',
    booking_id::text,
    'Initial stay charge mirrored from booking total',
    jsonb_build_object('backfilled_via', 'reservation_core_phase2')
  from resolved_folios
  where total_amount > 0
    and not exists (
      select 1
      from public.folio_line_items_v2 existing
      where existing.folio_id = resolved_folios.folio_id
        and existing.line_type = 'room_charge'
        and existing.reference_type = 'booking_total'
        and existing.reference_id = resolved_folios.booking_id::text
    )
  returning id
)
insert into public.reservation_lifecycle_events_v2 (
  reservation_id,
  booking_id,
  event_type,
  from_status,
  to_status,
  source,
  idempotency_key,
  payload
)
select
  reservation_id,
  booking_id,
  'reservation_backfilled',
  null,
  operational_status,
  'reservation_backfill',
  concat('reservation_backfill:', booking_id::text),
  jsonb_build_object('backfilled_via', 'reservation_core_phase2')
from resolved_reservations
where not exists (
  select 1
  from public.reservation_lifecycle_events_v2 existing
  where existing.reservation_id = resolved_reservations.reservation_id
    and existing.idempotency_key = concat('reservation_backfill:', resolved_reservations.booking_id::text)
);

insert into public.reservation_segments_v2 (
  reservation_id,
  segment_index,
  stay_unit_id,
  check_in_date,
  check_out_date,
  segment_status,
  source_booking_id,
  guests_count,
  actual_check_out_date,
  metadata
)
select
  r.id,
  1,
  r.stay_unit_id,
  r.check_in_date,
  r.check_out_date,
  case
    when r.operational_status = 'checked_in' then 'checked_in'
    when r.operational_status in ('checked_out', 'completed') then 'checked_out'
    when r.operational_status in ('cancelled', 'no_show') then 'cancelled'
    else 'reserved'
  end,
  r.booking_id,
  greatest(r.adults_count, 1),
  case when r.operational_status in ('checked_out', 'completed', 'no_show') then r.check_out_date else null end,
  jsonb_build_object('backfilled_via', 'reservation_core_phase2')
from public.reservations_v2 r
where not exists (
  select 1
  from public.reservation_segments_v2 existing
  where existing.reservation_id = r.id
    and existing.segment_index = 1
);

insert into public.reservation_guests_v2 (
  reservation_id,
  platform_user_id,
  guest_role,
  guest_type,
  is_primary,
  full_name,
  email,
  phone,
  metadata
)
select
  r.id,
  r.primary_guest_user_id,
  'primary',
  'adult',
  true,
  u.name,
  u.email,
  u.phone,
  jsonb_build_object('backfilled_via', 'reservation_core_phase2')
from public.reservations_v2 r
left join public.users u on u.id = r.primary_guest_user_id
where not exists (
  select 1
  from public.reservation_guests_v2 existing
  where existing.reservation_id = r.id
    and existing.is_primary = true
);

insert into public.reservation_assignment_history_v2 (
  reservation_id,
  segment_id,
  stay_unit_id,
  event_type,
  reason,
  metadata
)
select
  r.id,
  s.id,
  r.stay_unit_id,
  'initial_assignment',
  'Backfilled from reservation stay unit',
  jsonb_build_object('backfilled_via', 'reservation_core_phase2')
from public.reservations_v2 r
join public.reservation_segments_v2 s
  on s.reservation_id = r.id
 and s.segment_index = 1
where r.stay_unit_id is not null
  and not exists (
    select 1
    from public.reservation_assignment_history_v2 existing
    where existing.reservation_id = r.id
      and existing.segment_id = s.id
      and existing.stay_unit_id = r.stay_unit_id
  );

insert into public.reservation_folios_v2 (
  reservation_id,
  status,
  currency,
  balance_amount,
  metadata
)
select
  r.id,
  r.folio_status,
  r.currency,
  r.total_amount,
  jsonb_build_object('backfilled_via', 'reservation_core_phase2')
from public.reservations_v2 r
on conflict (reservation_id) do update set
  status = excluded.status,
  currency = excluded.currency,
  balance_amount = excluded.balance_amount,
  metadata = public.reservation_folios_v2.metadata || excluded.metadata,
  updated_at = now();

insert into public.folio_line_items_v2 (
  folio_id,
  reservation_id,
  booking_id,
  line_type,
  direction,
  amount,
  currency,
  reference_type,
  reference_id,
  description,
  metadata
)
select
  f.id,
  r.id,
  r.booking_id,
  'room_charge',
  'debit',
  r.total_amount,
  r.currency,
  'booking_total',
  r.booking_id::text,
  'Initial stay charge mirrored from booking total',
  jsonb_build_object('backfilled_via', 'reservation_core_phase2')
from public.reservations_v2 r
join public.reservation_folios_v2 f on f.reservation_id = r.id
where r.total_amount > 0
  and not exists (
    select 1
    from public.folio_line_items_v2 existing
    where existing.folio_id = f.id
      and existing.line_type = 'room_charge'
      and existing.reference_type = 'booking_total'
      and existing.reference_id = r.booking_id::text
  );

insert into public.reservation_lifecycle_events_v2 (
  reservation_id,
  booking_id,
  event_type,
  from_status,
  to_status,
  source,
  idempotency_key,
  payload
)
select
  r.id,
  r.booking_id,
  'reservation_backfilled',
  null,
  r.operational_status,
  'reservation_backfill',
  concat('reservation_backfill:', r.booking_id::text),
  jsonb_build_object('backfilled_via', 'reservation_core_phase2')
from public.reservations_v2 r
where not exists (
  select 1
  from public.reservation_lifecycle_events_v2 existing
  where existing.reservation_id = r.id
    and existing.idempotency_key = concat('reservation_backfill:', r.booking_id::text)
);

commit;
`;
}

try {
  await client.connect();
  const columnCheck = await client.query(`
    select
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'bookings_v2' and column_name = 'stay_unit_id'
      ) as has_stay_unit_id,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'bookings_v2' and column_name = 'source_channel'
      ) as has_source_channel
  `);
  const sql = buildSql({
    hasBookingStayUnitColumn: Boolean(columnCheck.rows[0]?.has_stay_unit_id),
    hasBookingSourceChannelColumn: Boolean(columnCheck.rows[0]?.has_source_channel),
  });
  await client.query(sql);
  console.log("Reservation core backfill completed.");
} catch (error) {
  console.error("Reservation core backfill failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}
