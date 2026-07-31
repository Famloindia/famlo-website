begin;

revoke all on table public.credit_notes from anon, authenticated;
revoke all on table public.payouts_v2 from anon, authenticated;

grant select on table public.credit_notes to service_role;
grant select on table public.payouts_v2 to service_role;

commit;
