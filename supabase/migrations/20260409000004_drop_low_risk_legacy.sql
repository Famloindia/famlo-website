begin;

do $$
begin
  if to_regclass('public.home_applications') is not null then
    execute $archive$
      create table if not exists public.home_applications_archive as
      select *, now()::timestamptz as archived_at
      from public.home_applications
      where false
    $archive$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.home_applications') is not null then
    insert into public.home_applications_archive
    select *, now()::timestamptz as archived_at
    from public.home_applications;
  end if;
end $$;

drop table if exists hommie_booking_requests cascade;
drop table if exists home_booking_requests cascade;
drop table if exists friend_connections cascade;
drop table if exists home_applications cascade;

commit;

notify pgrst, 'reload schema';
