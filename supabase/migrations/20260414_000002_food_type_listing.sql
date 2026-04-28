alter table if exists public.families
  add column if not exists food_type text;

alter table if exists public.hosts
  add column if not exists food_type text;
