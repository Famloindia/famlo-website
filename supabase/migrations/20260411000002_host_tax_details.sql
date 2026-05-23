create table if not exists host_tax_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  pan_number_encrypted text not null,
  pan_number_hash text not null,
  pan_last_four char(4) not null,
  pan_holder_name text not null,
  pan_image_url text,
  pan_date_of_birth date,
  verification_status text not null default 'pending',
  verification_provider text,
  is_verified boolean not null default false,
  risk_flag boolean not null default false,
  risk_reason text,
  consent_given boolean not null default true,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_tax_details_verification_status_check check (
    verification_status in ('pending', 'submitted', 'under_review', 'verified', 'rejected', 'flagged')
  )
);

create unique index if not exists host_tax_details_user_id_idx
  on host_tax_details (user_id);

create unique index if not exists unique_host_pan_hash
  on host_tax_details (pan_number_hash);

create index if not exists host_tax_details_status_idx
  on host_tax_details (verification_status, is_verified, risk_flag);

alter table host_tax_details enable row level security;

drop policy if exists "host_tax_details_owner_select" on host_tax_details;
create policy "host_tax_details_owner_select"
on host_tax_details
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "host_tax_details_owner_insert" on host_tax_details;
create policy "host_tax_details_owner_insert"
on host_tax_details
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "host_tax_details_owner_update" on host_tax_details;
create policy "host_tax_details_owner_update"
on host_tax_details
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
