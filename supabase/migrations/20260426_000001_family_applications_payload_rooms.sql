-- Preserve onboarding room data and the full submission payload on family applications.

alter table if exists public.family_applications
  add column if not exists rooms jsonb default '[]'::jsonb,
  add column if not exists payload jsonb default '{}'::jsonb;

update public.family_applications
set rooms = coalesce(rooms, '[]'::jsonb)
where rooms is null;

update public.family_applications
set payload = coalesce(payload, '{}'::jsonb)
where payload is null;

notify pgrst, 'reload schema';
