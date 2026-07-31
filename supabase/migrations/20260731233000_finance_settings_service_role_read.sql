begin;

revoke all on table public.finance_settings from anon, authenticated;
grant select on table public.finance_settings to service_role;

commit;
