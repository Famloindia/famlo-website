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

function buildBackfillSql(options) {
  const bookingStayUnitExpression = options.hasBookingStayUnitColumn
    ? "coalesce(b.stay_unit_id::text, b.pricing_snapshot->>'stay_unit_id')"
    : "(b.pricing_snapshot->>'stay_unit_id')";

  return `
begin;

insert into public.inventory_rule_sets (
  family_id,
  stay_unit_id,
  timezone,
  currency,
  booking_window_days,
  lead_time_hours,
  min_stay_days,
  max_stay_days,
  base_allotment,
  metadata
)
select
  su.legacy_family_id,
  su.id,
  coalesce(hps.timezone, 'Asia/Kolkata'),
  coalesce(hps.currency, 'INR'),
  coalesce(ir.booking_window_days, 365),
  coalesce(ir.lead_time_hours, 0),
  coalesce(ir.min_stay_days, 1),
  greatest(coalesce(ir.max_stay_days, 30), coalesce(ir.min_stay_days, 1)),
  case
    when su.inventory_mode = 'room_type_bucket' then greatest(coalesce(su.inventory_allotment, 1), 1)
    else 1
  end,
  jsonb_build_object('source', 'canonical_inventory_backfill')
from public.stay_units_v2 su
left join public.host_pro_settings hps
  on hps.family_id = su.legacy_family_id
left join public.inventory_rules_v2 ir
  on ir.owner_type = 'stay_unit'
 and ir.owner_id = su.id
where su.legacy_family_id is not null
on conflict (family_id, stay_unit_id) where stay_unit_id is not null
do update set
  timezone = excluded.timezone,
  currency = excluded.currency,
  booking_window_days = excluded.booking_window_days,
  lead_time_hours = excluded.lead_time_hours,
  min_stay_days = excluded.min_stay_days,
  max_stay_days = excluded.max_stay_days,
  base_allotment = excluded.base_allotment,
  updated_at = now(),
  metadata = public.inventory_rule_sets.metadata || excluded.metadata;

insert into public.inventory_event_log (
  family_id,
  stay_unit_id,
  event_type,
  event_source,
  source_reference,
  effective_date_start,
  effective_date_end,
  payload
)
select
  su.legacy_family_id,
  su.id,
  'legacy_manual_block_imported',
  'legacy_blocked_dates',
  concat('family:', f.id, ':', block_token),
  split_part(block_token, '::', 1)::date,
  split_part(block_token, '::', 1)::date,
  jsonb_build_object('legacy_block_token', block_token, 'source_table', 'families')
from public.families f
join public.stay_units_v2 su
  on su.legacy_family_id = f.id
cross join lateral unnest(coalesce(f.blocked_dates, '{}'::text[])) as legacy_blocks(block_token)
where split_part(block_token, '::', 1) ~ '^\\d{4}-\\d{2}-\\d{2}$'
  and (position('::' in block_token) = 0 or split_part(block_token, '::', 2) = 'fullday')
  and not exists (
    select 1
    from public.inventory_event_log existing
    where existing.stay_unit_id = su.id
      and existing.event_source = 'legacy_blocked_dates'
      and existing.source_reference = concat('family:', f.id, ':', block_token)
  );

insert into public.inventory_event_log (
  family_id,
  stay_unit_id,
  event_type,
  event_source,
  source_reference,
  effective_date_start,
  effective_date_end,
  payload
)
select
  su.legacy_family_id,
  su.id,
  'legacy_manual_block_imported',
  'legacy_blocked_dates',
  concat('host:', h.id, ':', block_token),
  split_part(block_token, '::', 1)::date,
  split_part(block_token, '::', 1)::date,
  jsonb_build_object('legacy_block_token', block_token, 'source_table', 'hosts')
from public.hosts h
join public.stay_units_v2 su
  on su.host_id = h.id
cross join lateral unnest(coalesce(h.blocked_dates, '{}'::text[])) as legacy_blocks(block_token)
where su.legacy_family_id is not null
  and split_part(block_token, '::', 1) ~ '^\\d{4}-\\d{2}-\\d{2}$'
  and (position('::' in block_token) = 0 or split_part(block_token, '::', 2) = 'fullday')
  and not exists (
    select 1
    from public.inventory_event_log existing
    where existing.stay_unit_id = su.id
      and existing.event_source = 'legacy_blocked_dates'
      and existing.source_reference = concat('host:', h.id, ':', block_token)
  );

with dates as (
  select generate_series(current_date, current_date + interval '365 days', interval '1 day')::date as day
),
unit_days as (
  select
    su.id as stay_unit_id,
    su.legacy_family_id as family_id,
    d.day,
    coalesce(hps.timezone, irs.timezone, 'Asia/Kolkata') as timezone,
    coalesce(hps.currency, irs.currency, 'INR') as currency,
    greatest(coalesce(su.price_fullday, su.price_afternoon, su.price_morning, su.price_evening, 0), 0) as base_rate,
    case
      when su.inventory_mode = 'room_type_bucket' then greatest(coalesce(su.inventory_allotment, irs.base_allotment, 1), 1)
      else 1
    end as allotment_limit,
    coalesce(irs.min_stay_days, 1) as min_stay,
    greatest(coalesce(irs.max_stay_days, 30), coalesce(irs.min_stay_days, 1)) as max_stay,
    coalesce(irs.cta_default, false) as cta,
    coalesce(irs.ctd_default, false) as ctd,
    coalesce(irs.stop_sell_default, false) as stop_sell
  from public.stay_units_v2 su
  cross join dates d
  left join public.host_pro_settings hps
    on hps.family_id = su.legacy_family_id
  left join public.inventory_rule_sets irs
    on irs.family_id = su.legacy_family_id
   and irs.stay_unit_id = su.id
  where su.legacy_family_id is not null
),
projected as (
  select
    ud.*,
    rate_event.id as rate_event_id,
    block_event.id as block_event_id,
    case
      when rate_event.event_type = 'manual_rate_set' then greatest(coalesce((rate_event.payload->>'amount')::integer, ud.base_rate), 0)
      else ud.base_rate
    end as effective_rate,
    case
      when rate_event.event_type = 'manual_rate_set' then 'manual_rate'
      else 'stay_units_v2'
    end as rate_source,
    case
      when block_event.event_type in ('manual_block_set', 'legacy_manual_block_imported') then true
      else false
    end as manual_block_present,
    coalesce(booking_counts.confirmed_units, 0) as confirmed_units,
    coalesce(booking_counts.hold_units, 0) as hold_units
  from unit_days ud
  left join lateral (
    select e.*
    from public.inventory_event_log e
    where e.family_id = ud.family_id
      and e.stay_unit_id = ud.stay_unit_id
      and e.event_type in ('manual_rate_set', 'manual_rate_removed')
      and ud.day between e.effective_date_start and e.effective_date_end
    order by e.created_at desc
    limit 1
  ) rate_event on true
  left join lateral (
    select e.*
    from public.inventory_event_log e
    where e.family_id = ud.family_id
      and e.stay_unit_id = ud.stay_unit_id
      and e.event_type in ('manual_block_set', 'manual_block_removed', 'legacy_manual_block_imported')
      and ud.day between e.effective_date_start and e.effective_date_end
    order by e.created_at desc
    limit 1
  ) block_event on true
  left join lateral (
    select
      count(*) filter (
        where b.status <> 'awaiting_payment'
          and b.status not in ('rejected', 'cancelled', 'cancelled_by_user', 'cancelled_by_partner')
          and coalesce(b.payment_status, '') not in ('refunded', 'partially_refunded')
      )::integer as confirmed_units,
      count(*) filter (
        where b.status = 'awaiting_payment'
          and b.hold_expires_at is not null
          and b.hold_expires_at > now()
      )::integer as hold_units
    from public.bookings_v2 b
    where ${bookingStayUnitExpression} = ud.stay_unit_id::text
      and ud.day between b.start_date and b.end_date
  ) booking_counts on true
)
insert into public.inventory_day_projection (
  family_id,
  stay_unit_id,
  date,
  timezone,
  currency,
  base_rate,
  effective_rate,
  rate_source,
  is_blocked,
  block_reason,
  is_sellable,
  available_units,
  allotment_limit,
  confirmed_units,
  hold_units,
  cta,
  ctd,
  min_stay,
  max_stay,
  stop_sell,
  manual_block_present,
  last_event_id,
  metadata,
  updated_at,
  last_projected_at
)
select
  family_id,
  stay_unit_id,
  day,
  timezone,
  currency,
  base_rate,
  effective_rate,
  rate_source,
  (stop_sell or manual_block_present or greatest(allotment_limit - confirmed_units - hold_units, 0) = 0),
  case
    when stop_sell then 'stop_sell'
    when manual_block_present then 'manual_block'
    when greatest(allotment_limit - confirmed_units - hold_units, 0) = 0 then 'sold_out'
    else null
  end,
  not (stop_sell or manual_block_present or greatest(allotment_limit - confirmed_units - hold_units, 0) = 0),
  greatest(allotment_limit - confirmed_units - hold_units, 0),
  allotment_limit,
  confirmed_units,
  hold_units,
  cta,
  ctd,
  min_stay,
  max_stay,
  stop_sell,
  manual_block_present,
  coalesce(rate_event_id, block_event_id),
  jsonb_build_object('source', 'canonical_inventory_backfill'),
  now(),
  now()
from projected
on conflict (family_id, stay_unit_id, date)
do update set
  timezone = excluded.timezone,
  currency = excluded.currency,
  base_rate = excluded.base_rate,
  effective_rate = excluded.effective_rate,
  rate_source = excluded.rate_source,
  is_blocked = excluded.is_blocked,
  block_reason = excluded.block_reason,
  is_sellable = excluded.is_sellable,
  available_units = excluded.available_units,
  allotment_limit = excluded.allotment_limit,
  confirmed_units = excluded.confirmed_units,
  hold_units = excluded.hold_units,
  cta = excluded.cta,
  ctd = excluded.ctd,
  min_stay = excluded.min_stay,
  max_stay = excluded.max_stay,
  stop_sell = excluded.stop_sell,
  manual_block_present = excluded.manual_block_present,
  last_event_id = excluded.last_event_id,
  metadata = public.inventory_day_projection.metadata || excluded.metadata,
  updated_at = now(),
  last_projected_at = now();

commit;
`;
}

try {
  await client.connect();
  const stayUnitColumnCheck = await client.query(`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'bookings_v2'
        and column_name = 'stay_unit_id'
    ) as has_stay_unit_id
  `);
  const hasBookingStayUnitColumn = Boolean(stayUnitColumnCheck.rows[0]?.has_stay_unit_id);
  const sql = buildBackfillSql({ hasBookingStayUnitColumn });
  await client.query(sql);
  console.log("Canonical inventory backfill completed.");
} catch (error) {
  console.error("Canonical inventory backfill failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}
