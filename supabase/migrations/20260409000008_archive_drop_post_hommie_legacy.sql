begin;

drop table if exists recently_viewed cascade;
drop table if exists reviews cascade;
drop table if exists payouts cascade;

do $$
begin
  if to_regclass('public.guide_payouts') is not null then
    execute $archive$
      create table if not exists public.guide_payouts_archive as
      select *, now()::timestamptz as archived_at
      from public.guide_payouts
      where false
    $archive$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.guide_payouts') is not null then
    insert into public.guide_payouts_archive
    select *, now()::timestamptz as archived_at
    from public.guide_payouts;
  end if;
end $$;

drop table if exists public.guide_payouts cascade;

commit;

notify pgrst, 'reload schema';
