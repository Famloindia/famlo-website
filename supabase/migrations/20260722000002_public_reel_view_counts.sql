create table if not exists public.reel_view_counts (
  family_id uuid not null references public.families(id) on delete cascade,
  reel_key text not null,
  view_count bigint not null default 0 check (view_count >= 0),
  last_viewed_at timestamptz not null default now(),
  primary key (family_id, reel_key)
);

create index if not exists reel_view_counts_rank_idx
  on public.reel_view_counts (view_count desc, last_viewed_at desc);

alter table public.reel_view_counts enable row level security;

create or replace function public.increment_reel_view_count(
  p_family_id uuid,
  p_reel_key text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count bigint;
begin
  if p_reel_key is null or length(trim(p_reel_key)) = 0 or length(p_reel_key) > 180 then
    raise exception 'Invalid reel key';
  end if;

  insert into public.reel_view_counts (family_id, reel_key, view_count, last_viewed_at)
  values (p_family_id, p_reel_key, 1, now())
  on conflict (family_id, reel_key)
  do update set
    view_count = public.reel_view_counts.view_count + 1,
    last_viewed_at = now()
  returning view_count into next_count;

  return next_count;
end;
$$;

revoke all on table public.reel_view_counts from anon, authenticated;
revoke all on function public.increment_reel_view_count(uuid, text) from public, anon, authenticated;
grant select, insert, update on table public.reel_view_counts to service_role;
grant execute on function public.increment_reel_view_count(uuid, text) to service_role;
