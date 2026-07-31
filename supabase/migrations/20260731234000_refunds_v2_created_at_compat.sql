begin;

alter table public.refunds_v2
  add column if not exists created_at timestamptz;

update public.refunds_v2
set created_at = coalesce(created_at, initiated_at)
where created_at is null;

alter table public.refunds_v2
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists refunds_v2_created_at_idx
  on public.refunds_v2(created_at desc);

grant select on table
  public.refunds_v2,
  public.payment_intents,
  public.folio_line_items_v2,
  public.credit_notes_v2,
  public.host_settlements_v2,
  public.host_payout_executions,
  public.host_payout_accounts,
  public.settlement_line_items_v2
to service_role;

commit;
