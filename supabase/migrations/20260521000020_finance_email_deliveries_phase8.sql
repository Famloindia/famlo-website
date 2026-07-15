create table if not exists finance_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  recipient_type text not null,
  recipient_id text null,
  email text not null,
  template_key text not null,
  artifact_type text null,
  artifact_id uuid null,
  provider text not null default 'resend',
  provider_message_id text null,
  status text not null default 'pending',
  error_message text null,
  sent_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists finance_email_deliveries_artifact_idx
  on finance_email_deliveries (artifact_type, artifact_id);

create index if not exists finance_email_deliveries_recipient_idx
  on finance_email_deliveries (recipient_type, recipient_id, created_at desc);

create unique index if not exists finance_email_deliveries_idempotency_idx
  on finance_email_deliveries (template_key, artifact_type, artifact_id, email);
