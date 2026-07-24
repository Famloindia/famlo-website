create or replace function public.normalize_guest_email(input text)
returns text
language sql
immutable
as $$
  select nullif(lower(btrim(input)), '')
$$;

create or replace function public.normalize_guest_phone(input text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  if input is null then
    return null;
  end if;

  digits := regexp_replace(input, '\D', '', 'g');
  if digits = '' then
    return null;
  end if;

  if length(digits) = 10 then
    return '+91' || digits;
  end if;

  if length(digits) = 11 and left(digits, 1) = '0' then
    return '+91' || right(digits, 10);
  end if;

  if length(digits) = 12 and left(digits, 2) = '91' then
    return '+' || digits;
  end if;

  if left(input, 1) = '+' and length(digits) >= 11 then
    return '+' || digits;
  end if;

  if length(digits) >= 11 then
    return '+' || digits;
  end if;

  return null;
end;
$$;

create index if not exists users_guest_email_normalized_idx
  on public.users (public.normalize_guest_email(email))
  where role = 'guest' and public.normalize_guest_email(email) is not null;

create index if not exists users_guest_phone_normalized_idx
  on public.users (public.normalize_guest_phone(phone))
  where role = 'guest' and public.normalize_guest_phone(phone) is not null;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'users_guest_email_normalized_uidx'
  ) then
    if exists (
      select 1
      from public.users
      where role = 'guest'
      group by public.normalize_guest_email(email)
      having public.normalize_guest_email(email) is not null and count(*) > 1
    ) then
      raise notice 'Skipped users_guest_email_normalized_uidx because duplicate guest emails still exist. Run guest identity consolidation first.';
    else
      create unique index users_guest_email_normalized_uidx
        on public.users (public.normalize_guest_email(email))
        where role = 'guest' and public.normalize_guest_email(email) is not null;
    end if;
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'users_guest_phone_normalized_uidx'
  ) then
    if exists (
      select 1
      from public.users
      where role = 'guest'
      group by public.normalize_guest_phone(phone)
      having public.normalize_guest_phone(phone) is not null and count(*) > 1
    ) then
      raise notice 'Skipped users_guest_phone_normalized_uidx because duplicate guest phones still exist. Run guest identity consolidation first.';
    else
      create unique index users_guest_phone_normalized_uidx
        on public.users (public.normalize_guest_phone(phone))
        where role = 'guest' and public.normalize_guest_phone(phone) is not null;
    end if;
  end if;
end
$$;
