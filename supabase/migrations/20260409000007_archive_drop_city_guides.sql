begin;

do $$
begin
  if to_regclass('public.city_guides') is not null then
    execute $archive$
      create table if not exists public.city_guides_archive as
      select *, now()::timestamptz as archived_at
      from public.city_guides
      where false
    $archive$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.city_guides') is not null then
    insert into public.city_guides_archive
    select *, now()::timestamptz as archived_at
    from public.city_guides;
  end if;
end $$;

drop table if exists public.city_guides cascade;

commit;

notify pgrst, 'reload schema';
