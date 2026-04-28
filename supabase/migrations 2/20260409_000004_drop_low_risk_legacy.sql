begin;

create table if not exists home_applications_archive as
select *, now()::timestamptz as archived_at
from home_applications
where false;

insert into home_applications_archive
select *, now()::timestamptz as archived_at
from home_applications;

drop table if exists hommie_booking_requests cascade;
drop table if exists home_booking_requests cascade;
drop table if exists friend_connections cascade;
drop table if exists home_applications cascade;

commit;

notify pgrst, 'reload schema';
