alter table public.stay_units_v2
  add column if not exists toilet_types text[] not null default '{}'::text[],
  add column if not exists toilet_type text;

update public.stay_units_v2
set toilet_type = array_to_string(toilet_types, ', ')
where toilet_type is null
  and array_length(toilet_types, 1) is not null;
