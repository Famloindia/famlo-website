begin;

alter table public.host_pro_billing_orders
  drop constraint if exists host_pro_billing_orders_status_check;

alter table public.host_pro_billing_orders
  add constraint host_pro_billing_orders_status_check
  check (status in ('draft', 'payment_pending', 'paid', 'payment_failed', 'failed', 'cancelled'));

alter table public.host_pro_subscriptions
  drop constraint if exists host_pro_subscriptions_status_check;

update public.host_pro_subscriptions
set status = 'paused',
    updated_at = now()
where status = 'expired';

update public.host_pro_subscriptions
set grace_until = current_period_end + interval '7 days',
    updated_at = now()
where current_period_end is not null
  and (
    grace_until is null
    or grace_until < current_period_end + interval '7 days'
  );

alter table public.host_pro_subscriptions
  add constraint host_pro_subscriptions_status_check
  check (status in ('inactive', 'active', 'grace', 'paused', 'cancelled', 'payment_failed'));

notify pgrst, 'reload schema';

commit;
