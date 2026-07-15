begin;

alter table public.host_pro_invoices
  add column if not exists family_id uuid null references public.families(id) on delete set null,
  add column if not exists subscription_id uuid null references public.host_pro_subscriptions(id) on delete set null,
  add column if not exists razorpay_order_id text null,
  add column if not exists razorpay_payment_id text null,
  add column if not exists financial_year_label text null,
  add column if not exists sequence_number integer null,
  add column if not exists invoice_date date null,
  add column if not exists payment_date date null,
  add column if not exists supplier_legal_name text null,
  add column if not exists supplier_gstin text null,
  add column if not exists supplier_registered_address text null,
  add column if not exists host_name text null,
  add column if not exists property_name text null,
  add column if not exists host_email text null,
  add column if not exists host_phone text null,
  add column if not exists host_gstin text null,
  add column if not exists place_of_supply text null,
  add column if not exists plan_duration_months integer null,
  add column if not exists subscription_period_start timestamptz null,
  add column if not exists subscription_period_end timestamptz null,
  add column if not exists taxable_value numeric(12,2) null,
  add column if not exists cgst_amount numeric(12,2) null,
  add column if not exists sgst_amount numeric(12,2) null,
  add column if not exists igst_amount numeric(12,2) null,
  add column if not exists total_gst numeric(12,2) null,
  add column if not exists round_off numeric(12,2) null,
  add column if not exists total_paid numeric(12,2) null,
  add column if not exists payment_reference text null,
  add column if not exists invoice_pdf_url text null,
  add column if not exists email_status text null default 'pending',
  add column if not exists email_sent_at timestamptz null,
  add column if not exists email_error text null,
  add column if not exists whatsapp_status text null default 'pending',
  add column if not exists whatsapp_sent_at timestamptz null,
  add column if not exists whatsapp_error text null;

alter table public.host_pro_invoices
  drop constraint if exists host_pro_invoices_status_check;

alter table public.host_pro_invoices
  add constraint host_pro_invoices_status_check
  check (status in ('issued', 'paid', 'void', 'refunded', 'cancelled'));

create unique index if not exists host_pro_invoices_financial_year_sequence_uidx
  on public.host_pro_invoices(financial_year_label, sequence_number)
  where financial_year_label is not null and sequence_number is not null;

create index if not exists host_pro_invoices_subscription_idx
  on public.host_pro_invoices(subscription_id, issued_at desc);

notify pgrst, 'reload schema';

commit;
