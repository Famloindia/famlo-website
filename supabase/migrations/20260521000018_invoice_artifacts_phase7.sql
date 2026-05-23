begin;

create table if not exists public.guest_tax_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  booking_id uuid references public.bookings_v2(id) on delete set null,
  reservation_id uuid references public.reservations_v2(id) on delete set null,
  guest_id uuid references public.users(id) on delete set null,
  invoice_type text not null default 'guest_tax_invoice',
  status text not null default 'draft',
  taxable_amount integer not null default 0,
  gst_amount integer not null default 0,
  total_amount integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  calculation_version text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guest_tax_invoices_booking_idx
  on public.guest_tax_invoices(booking_id, created_at desc);

create index if not exists guest_tax_invoices_reservation_idx
  on public.guest_tax_invoices(reservation_id, created_at desc);

create table if not exists public.platform_fee_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  booking_id uuid references public.bookings_v2(id) on delete set null,
  reservation_id uuid references public.reservations_v2(id) on delete set null,
  host_id uuid references public.hosts(id) on delete set null,
  status text not null default 'draft',
  taxable_amount integer not null default 0,
  gst_amount integer not null default 0,
  total_amount integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  calculation_version text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_fee_invoices_booking_idx
  on public.platform_fee_invoices(booking_id, created_at desc);

create index if not exists platform_fee_invoices_host_idx
  on public.platform_fee_invoices(host_id, created_at desc);

create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  credit_note_number text not null unique,
  original_invoice_id uuid,
  original_invoice_type text not null,
  booking_id uuid references public.bookings_v2(id) on delete set null,
  reservation_id uuid references public.reservations_v2(id) on delete set null,
  status text not null default 'draft',
  taxable_reversal_amount integer not null default 0,
  gst_reversal_amount integer not null default 0,
  total_reversal_amount integer not null default 0,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists credit_notes_booking_idx
  on public.credit_notes(booking_id, created_at desc);

create index if not exists credit_notes_original_invoice_idx
  on public.credit_notes(original_invoice_id, original_invoice_type);

commit;
