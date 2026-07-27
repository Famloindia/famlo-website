begin;

alter table public.host_whatsapp_otp_challenges
  drop constraint if exists host_whatsapp_otp_provider_check;

alter table public.host_whatsapp_otp_challenges
  add constraint host_whatsapp_otp_provider_check
  check (provider in ('twofactor', 'staging_test', 'meta_whatsapp'));

alter table public.host_whatsapp_otp_challenges
  drop constraint if exists host_whatsapp_otp_secret_reference_check;

alter table public.host_whatsapp_otp_challenges
  add constraint host_whatsapp_otp_secret_reference_check
  check (
    status <> 'pending'
    or (provider = 'twofactor' and provider_session_id is not null and code_hash is null)
    or (provider = 'staging_test' and code_hash is not null and provider_session_id is null)
    or (
      provider = 'meta_whatsapp'
      and provider_session_id is not null
      and code_hash is not null
    )
  );

commit;

-- Rollback note:
-- Revert these checks to the Phase 2 definitions only after confirming that no
-- rows with provider = 'meta_whatsapp' remain.
