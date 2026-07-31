-- Atomic guest booking hold acquisition for the Cashfree staging rollout.
-- The function is service-role only and leaves all historical provider data intact.

create or replace function public.acquire_guest_booking_hold_v1(
  p_user_id uuid,
  p_stay_unit_id uuid,
  p_start_date date,
  p_end_date date,
  p_hold_expires_at timestamptz,
  p_booking_payload jsonb
)
returns table(booking_id uuid, reused boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_date date;
  v_effective_end date := greatest(p_start_date + 1, p_end_date);
begin
  if p_user_id is null or p_stay_unit_id is null then
    raise exception 'Guest and stay unit are required.' using errcode = '22023';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Invalid booking date range.' using errcode = '22023';
  end if;
  if p_hold_expires_at is null or p_hold_expires_at <= now() then
    raise exception 'Hold expiry must be in the future.' using errcode = '22023';
  end if;

  -- Every writer locks the same room nights in a stable order.
  for v_date in
    select day::date
    from generate_series(p_start_date, v_effective_end - 1, interval '1 day') day
    order by day
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(p_stay_unit_id::text || ':' || v_date::text, 0)
    );
  end loop;

  select b.id
  into v_booking_id
  from public.bookings_v2 b
  where b.user_id = p_user_id
    and b.stay_unit_id = p_stay_unit_id
    and b.start_date = p_start_date
    and b.end_date = p_end_date
    and b.payment_status not in ('paid', 'refund_pending', 'refunded', 'partially_refunded')
    and (
      b.status = 'awaiting_payment'
      or b.status = 'payment_failed'
      or (
        b.status = 'cancelled'
        and b.cancellation_reason in ('hold_expired', 'payment_failed', 'user_dropped', 'payment_setup_failed', 'order_expired')
      )
    )
  order by b.created_at desc
  limit 1;

  if exists (
    select 1
    from public.bookings_v2 b
    where b.stay_unit_id = p_stay_unit_id
      and (v_booking_id is null or b.id <> v_booking_id)
      and daterange(b.start_date, greatest(b.start_date + 1, b.end_date), '[)')
          && daterange(p_start_date, v_effective_end, '[)')
      and (
        (b.status = 'awaiting_payment' and b.hold_expires_at > now())
        or b.payment_status = 'paid'
        or b.status in ('pending_host_approval', 'confirmed', 'accepted', 'checked_in', 'completed')
      )
  ) then
    raise exception 'This room is temporarily unavailable for the selected dates.'
      using errcode = 'P0001';
  end if;

  if v_booking_id is not null then
    update public.bookings_v2
    set status = 'awaiting_payment',
        payment_status = 'pending',
        hold_expires_at = p_hold_expires_at,
        cancelled_at = null,
        cancellation_reason = null,
        updated_at = now()
    where id = v_booking_id;

    return query select v_booking_id, true;
    return;
  end if;

  insert into public.bookings_v2 (
    user_id,
    booking_type,
    recipient_type,
    recipient_id,
    product_type,
    product_id,
    host_id,
    hommie_id,
    activity_id,
    status,
    hold_expires_at,
    start_date,
    end_date,
    quarter_type,
    quarter_time,
    guests_count,
    notes,
    pricing_snapshot,
    total_price,
    partner_payout_amount,
    payment_status,
    cancellation_policy_code,
    stay_unit_id
  ) values (
    p_user_id,
    coalesce(p_booking_payload->>'booking_type', 'host_stay'),
    p_booking_payload->>'recipient_type',
    nullif(p_booking_payload->>'recipient_id', '')::uuid,
    p_booking_payload->>'product_type',
    nullif(p_booking_payload->>'product_id', '')::uuid,
    nullif(p_booking_payload->>'host_id', '')::uuid,
    nullif(p_booking_payload->>'hommie_id', '')::uuid,
    nullif(p_booking_payload->>'activity_id', '')::uuid,
    'awaiting_payment',
    p_hold_expires_at,
    p_start_date,
    p_end_date,
    nullif(p_booking_payload->>'quarter_type', ''),
    nullif(p_booking_payload->>'quarter_time', ''),
    greatest(1, coalesce((p_booking_payload->>'guests_count')::integer, 1)),
    nullif(p_booking_payload->>'notes', ''),
    coalesce(p_booking_payload->'pricing_snapshot', '{}'::jsonb),
    greatest(0, coalesce((p_booking_payload->>'total_price')::integer, 0)),
    greatest(0, coalesce((p_booking_payload->>'partner_payout_amount')::integer, 0)),
    'pending',
    coalesce(p_booking_payload->>'cancellation_policy_code', 'famlo_flexible_24h'),
    p_stay_unit_id
  )
  returning id into v_booking_id;

  return query select v_booking_id, false;
end;
$$;

revoke all on function public.acquire_guest_booking_hold_v1(
  uuid, uuid, date, date, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.acquire_guest_booking_hold_v1(
  uuid, uuid, date, date, timestamptz, jsonb
) to service_role;

comment on function public.acquire_guest_booking_hold_v1(
  uuid, uuid, date, date, timestamptz, jsonb
) is 'Atomically creates or reuses one unpaid guest booking hold under room-night advisory locks.';
