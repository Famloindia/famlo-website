begin;

alter table public.bookings_v2
  add column if not exists stay_unit_id uuid references public.stay_units_v2(id) on delete set null;

create index if not exists bookings_v2_stay_unit_id_idx
  on public.bookings_v2(stay_unit_id);

create index if not exists bookings_v2_host_stay_unit_start_idx
  on public.bookings_v2(host_id, stay_unit_id, start_date, end_date, status);

with unambiguous_primary_units as (
  select host_id, (array_agg(id order by id::text))[1] as stay_unit_id
  from public.stay_units_v2
  where host_id is not null
    and is_primary = true
  group by host_id
  having count(*) = 1
)
update public.bookings_v2 booking
set stay_unit_id = primary_unit.stay_unit_id
from unambiguous_primary_units primary_unit
where booking.stay_unit_id is null
  and booking.booking_type = 'host_stay'
  and booking.host_id = primary_unit.host_id;

notify pgrst, 'reload schema';

commit;
