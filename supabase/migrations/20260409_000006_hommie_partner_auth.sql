begin;

alter table hommie_profiles_v2
  add column if not exists partner_code text,
  add column if not exists partner_password text,
  add column if not exists is_online boolean not null default false,
  add column if not exists is_available boolean not null default true,
  add column if not exists is_verified boolean not null default false,
  add column if not exists avatar_url text,
  add column if not exists college text,
  add column if not exists total_trips integer not null default 0,
  add column if not exists notes text;

create unique index if not exists hommie_profiles_v2_partner_code_uidx
  on hommie_profiles_v2(partner_code)
  where partner_code is not null;

update hommie_profiles_v2 hp
set
  partner_code = coalesce(hp.partner_code, cg.guide_id),
  partner_password = coalesce(hp.partner_password, cg.guide_password),
  is_online = coalesce(cg.is_online, hp.is_online, false),
  is_available = coalesce(cg.is_available, hp.is_available, true),
  is_verified = coalesce(cg.is_verified, hp.is_verified, false),
  avatar_url = coalesce(cg.avatar_url, hp.avatar_url),
  college = coalesce(cg.college, hp.college),
  total_trips = coalesce(cg.total_trips, hp.total_trips, 0),
  notes = coalesce(cg.notes, hp.notes),
  updated_at = now()
from city_guides cg
where hp.legacy_city_guide_id = cg.id;

notify pgrst, 'reload schema';

commit;
