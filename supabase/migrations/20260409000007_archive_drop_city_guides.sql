begin;

create table if not exists city_guides_archive as
select *, now()::timestamptz as archived_at
from city_guides
where false;

insert into city_guides_archive
select *, now()::timestamptz as archived_at
from city_guides;

drop table if exists city_guides cascade;

commit;

notify pgrst, 'reload schema';
