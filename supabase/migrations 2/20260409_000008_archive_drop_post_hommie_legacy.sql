begin;

drop table if exists recently_viewed cascade;
drop table if exists reviews cascade;
drop table if exists payouts cascade;

create table if not exists guide_payouts_archive as
select *, now()::timestamptz as archived_at
from guide_payouts
where false;

insert into guide_payouts_archive
select *, now()::timestamptz as archived_at
from guide_payouts;

drop table if exists guide_payouts cascade;

commit;

notify pgrst, 'reload schema';
