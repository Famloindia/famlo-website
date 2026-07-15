begin;

alter table public.host_pro_billing_orders
  alter column raw_subtotal_amount type numeric(12,2) using raw_subtotal_amount::numeric(12,2),
  alter column subtotal_amount type numeric(12,2) using subtotal_amount::numeric(12,2),
  alter column gst_amount type numeric(12,2) using gst_amount::numeric(12,2),
  alter column total_amount type numeric(12,2) using total_amount::numeric(12,2);

notify pgrst, 'reload schema';

commit;
