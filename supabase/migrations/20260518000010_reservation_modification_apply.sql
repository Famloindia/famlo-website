begin;

alter table public.reservations_v2
  add column if not exists assignment_status text not null default 'assigned';

alter table public.reservations_v2
  drop constraint if exists reservations_v2_assignment_status_check;

alter table public.reservations_v2
  add constraint reservations_v2_assignment_status_check
  check (assignment_status in ('assigned', 'unassigned', 'invalid_reference'));

update public.reservations_v2 r
set
  assignment_status = case
    when r.stay_unit_id is null then 'unassigned'
    when exists (select 1 from public.stay_units_v2 su where su.id = r.stay_unit_id) then 'assigned'
    else 'invalid_reference'
  end,
  updated_at = now();

alter table public.reservation_lifecycle_events_v2
  drop constraint if exists reservation_lifecycle_events_v2_event_type_check;

alter table public.reservation_lifecycle_events_v2
  add constraint reservation_lifecycle_events_v2_event_type_check
  check (
    event_type in (
      'reservation_backfilled',
      'reservation_created',
      'status_synced',
      'modification_requested',
      'modification_rejected',
      'modification_applied',
      'cancellation_applied',
      'guest_checked_in',
      'guest_checked_out',
      'auto_completed',
      'no_show_marked',
      'early_checkout_applied',
      'reassigned'
    )
  );

create or replace function public.apply_reservation_modification_v2(
  p_modification_id uuid,
  p_actor_user_id uuid default null,
  p_actor_role text default 'operator',
  p_decision text default 'apply'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mod booking_modifications_v2%rowtype;
  v_booking bookings_v2%rowtype;
  v_reservation reservations_v2%rowtype;
  v_segment reservation_segments_v2%rowtype;
  v_folio reservation_folios_v2%rowtype;
  v_requested jsonb;
  v_financial jsonb;
  v_now timestamptz := now();
  v_has_booking_stay_unit boolean := false;
  v_new_start date;
  v_new_end date;
  v_new_quarter text;
  v_new_guests integer;
  v_new_total integer;
  v_old_total integer;
  v_delta integer;
  v_stay_unit_text text;
  v_new_stay_unit uuid;
  v_old_stay_unit uuid;
  v_currency text;
  v_segment_status text;
begin
  if p_decision not in ('apply', 'reject') then
    raise exception 'Unsupported modification decision: %', p_decision;
  end if;

  select * into v_mod
  from public.booking_modifications_v2
  where id = p_modification_id
  for update;

  if not found then
    raise exception 'Modification not found: %', p_modification_id;
  end if;

  if v_mod.status in ('applied', 'rejected') then
    return jsonb_build_object('ok', true, 'status', v_mod.status, 'modification_id', v_mod.id);
  end if;

  select * into v_booking
  from public.bookings_v2
  where id = v_mod.booking_id
  for update;

  if not found then
    raise exception 'Booking not found for modification: %', v_mod.booking_id;
  end if;

  select * into v_reservation
  from public.reservations_v2
  where booking_id = v_mod.booking_id
  for update;

  if not found then
    raise exception 'Reservation not found for booking: %', v_mod.booking_id;
  end if;

  select * into v_segment
  from public.reservation_segments_v2
  where reservation_id = v_reservation.id
    and segment_index = 1
  for update;

  if not found then
    raise exception 'Primary reservation segment not found: %', v_reservation.id;
  end if;

  select * into v_folio
  from public.reservation_folios_v2
  where reservation_id = v_reservation.id
  for update;

  if p_decision = 'reject' then
    update public.booking_modifications_v2
    set status = 'rejected', updated_at = v_now
    where id = v_mod.id;

    insert into public.reservation_lifecycle_events_v2 (
      reservation_id,
      booking_id,
      segment_id,
      event_type,
      from_status,
      to_status,
      actor_user_id,
      actor_role,
      source,
      idempotency_key,
      payload
    )
    values (
      v_reservation.id,
      v_booking.id,
      v_segment.id,
      'modification_rejected',
      v_reservation.operational_status,
      v_reservation.operational_status,
      p_actor_user_id,
      p_actor_role,
      'modification_apply_engine',
      concat('modification_rejected:', v_mod.id::text),
      jsonb_build_object('modification_id', v_mod.id, 'reason', v_mod.reason)
    )
    on conflict do nothing;

    return jsonb_build_object('ok', true, 'status', 'rejected', 'modification_id', v_mod.id, 'reservation_id', v_reservation.id);
  end if;

  v_requested := coalesce(v_mod.requested_snapshot, '{}'::jsonb);
  v_financial := coalesce(v_mod.financial_delta, '{}'::jsonb);
  v_old_total := coalesce(v_booking.total_price, 0);
  v_new_start := coalesce(nullif(v_requested->>'startDate', '')::date, nullif(v_requested->>'start_date', '')::date, v_booking.start_date);
  v_new_end := coalesce(nullif(v_requested->>'endDate', '')::date, nullif(v_requested->>'end_date', '')::date, v_new_start);
  v_new_quarter := coalesce(nullif(v_requested->>'quarterType', ''), nullif(v_requested->>'quarter_type', ''), v_booking.quarter_type);
  v_new_guests := greatest(
    1,
    coalesce(
      nullif(v_requested->>'guestsCount', '')::integer,
      nullif(v_requested->>'guests_count', '')::integer,
      v_booking.guests_count,
      1
    )
  );
  v_new_total := greatest(
    0,
    coalesce(
      nullif(v_financial->>'new_total_price', '')::integer,
      nullif(v_requested->>'totalPrice', '')::integer,
      nullif(v_requested->>'total_price', '')::integer,
      v_booking.total_price,
      0
    )
  );
  v_delta := v_new_total - v_old_total;
  v_currency := coalesce(v_booking.pricing_snapshot->>'currency', 'INR');
  v_stay_unit_text := nullif(coalesce(v_requested->>'stayUnitId', v_requested->>'stay_unit_id', v_reservation.stay_unit_id::text), '');

  if v_new_end < v_new_start then
    raise exception 'Modification checkout date cannot be before check-in date.';
  end if;

  if v_stay_unit_text is null then
    raise exception 'Reservation is unassigned. Assign a valid room before applying this modification.';
  end if;

  if v_stay_unit_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Requested stay_unit_id is invalid: %', v_stay_unit_text;
  end if;

  v_new_stay_unit := v_stay_unit_text::uuid;

  if not exists (select 1 from public.stay_units_v2 where id = v_new_stay_unit) then
    raise exception 'Requested stay unit does not exist: %', v_new_stay_unit;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings_v2'
      and column_name = 'stay_unit_id'
  ) into v_has_booking_stay_unit;

  update public.bookings_v2
  set
    start_date = v_new_start,
    end_date = v_new_end,
    quarter_type = v_new_quarter,
    guests_count = v_new_guests,
    total_price = v_new_total,
    pricing_snapshot = coalesce(pricing_snapshot, '{}'::jsonb)
      || jsonb_build_object(
        'stay_unit_id', v_new_stay_unit,
        'modification_id', v_mod.id,
        'modified_from', v_mod.old_snapshot,
        'modified_to', v_requested,
        'modified_at', v_now
      ),
    updated_at = v_now
  where id = v_booking.id;

  if v_has_booking_stay_unit then
    execute 'update public.bookings_v2 set stay_unit_id = $1 where id = $2'
    using v_new_stay_unit, v_booking.id;
  end if;

  v_old_stay_unit := v_reservation.stay_unit_id;
  v_segment_status := case
    when v_reservation.operational_status = 'checked_in' then 'checked_in'
    when v_reservation.operational_status in ('checked_out', 'completed') then 'checked_out'
    when v_reservation.operational_status in ('cancelled', 'no_show') then 'cancelled'
    else 'reserved'
  end;

  update public.reservations_v2
  set
    stay_unit_id = v_new_stay_unit,
    assignment_status = 'assigned',
    check_in_date = v_new_start,
    check_out_date = v_new_end,
    adults_count = v_new_guests,
    total_amount = v_new_total,
    currency = v_currency,
    metadata = metadata || jsonb_build_object('last_modification_id', v_mod.id, 'last_modified_at', v_now),
    updated_at = v_now
  where id = v_reservation.id;

  update public.reservation_segments_v2
  set
    stay_unit_id = v_new_stay_unit,
    check_in_date = v_new_start,
    check_out_date = v_new_end,
    guests_count = v_new_guests,
    segment_status = v_segment_status,
    metadata = metadata || jsonb_build_object('last_modification_id', v_mod.id),
    updated_at = v_now
  where id = v_segment.id;

  if v_old_stay_unit is distinct from v_new_stay_unit then
    update public.reservation_assignment_history_v2
    set assigned_to = v_now
    where reservation_id = v_reservation.id
      and assigned_to is null;

    insert into public.reservation_assignment_history_v2 (
      reservation_id,
      segment_id,
      stay_unit_id,
      event_type,
      assigned_from,
      assigned_by_user_id,
      reason,
      metadata
    )
    values (
      v_reservation.id,
      v_segment.id,
      v_new_stay_unit,
      'reassigned',
      v_now,
      p_actor_user_id,
      'Modification applied',
      jsonb_build_object('modification_id', v_mod.id, 'previous_stay_unit_id', v_old_stay_unit)
    );
  end if;

  if v_folio.id is not null then
    update public.reservation_folios_v2
    set
      currency = v_currency,
      balance_amount = v_new_total,
      updated_at = v_now
    where id = v_folio.id;

    if v_delta <> 0 then
      insert into public.folio_line_items_v2 (
        folio_id,
        reservation_id,
        booking_id,
        line_type,
        direction,
        amount,
        currency,
        occurred_at,
        reference_type,
        reference_id,
        description,
        metadata
      )
      values (
        v_folio.id,
        v_reservation.id,
        v_booking.id,
        'adjustment',
        case when v_delta > 0 then 'debit' else 'credit' end,
        abs(v_delta),
        v_currency,
        v_now,
        'booking_modification',
        v_mod.id::text,
        'Reservation modification delta',
        jsonb_build_object(
          'old_total_price', v_old_total,
          'new_total_price', v_new_total,
          'delta', v_delta
        )
      );
    end if;
  end if;

  update public.booking_modifications_v2
  set status = 'applied', updated_at = v_now
  where id = v_mod.id;

  insert into public.reservation_lifecycle_events_v2 (
    reservation_id,
    booking_id,
    segment_id,
    event_type,
    from_status,
    to_status,
    actor_user_id,
    actor_role,
    source,
    idempotency_key,
    payload
  )
  values (
    v_reservation.id,
    v_booking.id,
    v_segment.id,
    'modification_applied',
    v_reservation.operational_status,
    v_reservation.operational_status,
    p_actor_user_id,
    p_actor_role,
    'modification_apply_engine',
    concat('modification_applied:', v_mod.id::text),
    jsonb_build_object(
      'modification_id', v_mod.id,
      'old_snapshot', v_mod.old_snapshot,
      'requested_snapshot', v_requested,
      'financial_delta', v_mod.financial_delta,
      'old_stay_unit_id', v_old_stay_unit,
      'new_stay_unit_id', v_new_stay_unit
    )
  )
  on conflict do nothing;

  return jsonb_build_object(
    'ok', true,
    'status', 'applied',
    'modification_id', v_mod.id,
    'booking_id', v_booking.id,
    'reservation_id', v_reservation.id,
    'segment_id', v_segment.id,
    'stay_unit_id', v_new_stay_unit,
    'start_date', v_new_start,
    'end_date', v_new_end,
    'total_price', v_new_total,
    'folio_delta', v_delta
  );
end;
$$;

commit;
