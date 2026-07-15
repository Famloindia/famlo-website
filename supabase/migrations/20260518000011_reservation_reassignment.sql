begin;

create or replace function public.reassign_reservation_v2(
  p_reservation_id uuid,
  p_stay_unit_id uuid,
  p_actor_user_id uuid default null,
  p_actor_role text default 'operator',
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations_v2%rowtype;
  v_segment reservation_segments_v2%rowtype;
  v_stay_unit stay_units_v2%rowtype;
  v_now timestamptz := now();
  v_old_stay_unit uuid;
  v_target_family_id uuid;
  v_has_booking_stay_unit boolean := false;
begin
  select * into v_reservation
  from public.reservations_v2
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Reservation not found: %', p_reservation_id;
  end if;

  if v_reservation.operational_status in ('checked_in', 'checked_out', 'completed', 'cancelled', 'no_show') then
    raise exception 'Reservation cannot be reassigned from status: %', v_reservation.operational_status;
  end if;

  select * into v_stay_unit
  from public.stay_units_v2
  where id = p_stay_unit_id;

  if not found then
    raise exception 'Target stay unit does not exist: %', p_stay_unit_id;
  end if;

  v_target_family_id := v_stay_unit.legacy_family_id;
  if v_reservation.family_id is not null and v_target_family_id is not null and v_reservation.family_id is distinct from v_target_family_id then
    raise exception 'Target stay unit belongs to a different property.';
  end if;

  perform pg_advisory_xact_lock(hashtext(coalesce(v_target_family_id::text, v_reservation.family_id::text, 'unknown') || ':' || p_stay_unit_id::text));

  select * into v_segment
  from public.reservation_segments_v2
  where reservation_id = v_reservation.id
    and segment_index = 1
  for update;

  if not found then
    insert into public.reservation_segments_v2 (
      reservation_id,
      segment_index,
      stay_unit_id,
      check_in_date,
      check_out_date,
      segment_status,
      source_booking_id,
      guests_count,
      metadata
    )
    values (
      v_reservation.id,
      1,
      p_stay_unit_id,
      v_reservation.check_in_date,
      coalesce(v_reservation.check_out_date, v_reservation.check_in_date),
      'reserved',
      v_reservation.booking_id,
      greatest(1, coalesce(v_reservation.adults_count, 1) + coalesce(v_reservation.children_count, 0)),
      jsonb_build_object('source', 'reservation_reassignment_repair')
    )
    returning * into v_segment;
  end if;

  v_old_stay_unit := v_reservation.stay_unit_id;

  update public.reservation_assignment_history_v2
  set assigned_to = v_now
  where reservation_id = v_reservation.id
    and assigned_to is null;

  update public.reservations_v2
  set
    stay_unit_id = p_stay_unit_id,
    family_id = coalesce(v_reservation.family_id, v_target_family_id),
    host_id = coalesce(v_reservation.host_id, v_stay_unit.host_id),
    assignment_status = 'assigned',
    metadata = metadata || jsonb_build_object(
      'last_reassigned_at', v_now,
      'last_reassigned_from_stay_unit_id', v_old_stay_unit,
      'last_reassigned_to_stay_unit_id', p_stay_unit_id,
      'last_reassignment_reason', p_reason
    ),
    updated_at = v_now
  where id = v_reservation.id;

  update public.reservation_segments_v2
  set
    stay_unit_id = p_stay_unit_id,
    check_in_date = coalesce(check_in_date, v_reservation.check_in_date),
    check_out_date = coalesce(check_out_date, v_reservation.check_out_date, v_reservation.check_in_date),
    segment_status = 'reserved',
    metadata = metadata || jsonb_build_object(
      'last_reassigned_at', v_now,
      'previous_stay_unit_id', v_old_stay_unit,
      'reason', p_reason
    ),
    updated_at = v_now
  where id = v_segment.id;

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
    p_stay_unit_id,
    case when v_old_stay_unit is null then 'initial_assignment' else 'reassigned' end,
    v_now,
    p_actor_user_id,
    coalesce(nullif(p_reason, ''), 'Operator room reassignment'),
    jsonb_build_object(
      'source', 'reservation_reassignment',
      'previous_stay_unit_id', v_old_stay_unit,
      'actor_role', p_actor_role
    )
  );

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
    payload
  )
  values (
    v_reservation.id,
    v_reservation.booking_id,
    v_segment.id,
    'reassigned',
    v_reservation.operational_status,
    v_reservation.operational_status,
    p_actor_user_id,
    p_actor_role,
    'reservation_reassignment',
    jsonb_build_object(
      'old_stay_unit_id', v_old_stay_unit,
      'new_stay_unit_id', p_stay_unit_id,
      'reason', p_reason
    )
  );

  if v_reservation.booking_id is not null then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'bookings_v2'
        and column_name = 'stay_unit_id'
    ) into v_has_booking_stay_unit;

    update public.bookings_v2
    set
      pricing_snapshot = coalesce(pricing_snapshot, '{}'::jsonb)
        || jsonb_build_object(
          'stay_unit_id', p_stay_unit_id,
          'reassigned_at', v_now,
          'reassigned_from_stay_unit_id', v_old_stay_unit,
          'reassignment_reason', p_reason
        ),
      updated_at = v_now
    where id = v_reservation.booking_id;

    if v_has_booking_stay_unit then
      execute 'update public.bookings_v2 set stay_unit_id = $1 where id = $2'
      using p_stay_unit_id, v_reservation.booking_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'reservation_id', v_reservation.id,
    'booking_id', v_reservation.booking_id,
    'segment_id', v_segment.id,
    'old_stay_unit_id', v_old_stay_unit,
    'new_stay_unit_id', p_stay_unit_id,
    'family_id', coalesce(v_reservation.family_id, v_target_family_id),
    'assignment_status', 'assigned'
  );
end;
$$;

commit;
