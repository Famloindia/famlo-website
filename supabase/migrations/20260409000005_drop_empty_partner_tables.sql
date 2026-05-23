begin;

drop table if exists homes cascade;
drop table if exists hommies cascade;

commit;

notify pgrst, 'reload schema';
