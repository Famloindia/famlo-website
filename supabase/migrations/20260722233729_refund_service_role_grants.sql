begin;

revoke all on public.refund_requests, public.refund_attempts from anon, authenticated;
grant select, insert, update, delete on public.refund_requests, public.refund_attempts to service_role;

commit;
