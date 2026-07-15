begin;

drop table if exists profiles cascade;
drop table if exists kyc_verifications cascade;

do $$
begin
  if to_regclass('public.bulk_export_result') is not null then
    execute $archive$
      create table if not exists public.bulk_export_result_archive as
      select *, now()::timestamptz as archived_at
      from public.bulk_export_result
      where false
    $archive$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.bulk_export_result') is not null then
    insert into public.bulk_export_result_archive
    select *, now()::timestamptz as archived_at
    from public.bulk_export_result;
  end if;
end $$;

drop table if exists public.bulk_export_result cascade;

commit;

notify pgrst, 'reload schema';
