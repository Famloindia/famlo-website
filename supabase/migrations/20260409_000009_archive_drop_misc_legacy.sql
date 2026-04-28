begin;

drop table if exists profiles cascade;
drop table if exists kyc_verifications cascade;

create table if not exists bulk_export_result_archive as
select *, now()::timestamptz as archived_at
from bulk_export_result
where false;

insert into bulk_export_result_archive
select *, now()::timestamptz as archived_at
from bulk_export_result;

drop table if exists bulk_export_result cascade;

commit;

notify pgrst, 'reload schema';
