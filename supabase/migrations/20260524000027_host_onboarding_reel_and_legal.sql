alter table if exists public.host_onboarding_drafts
  add column if not exists host_reel_storage_key text,
  add column if not exists host_reel_public_url text,
  add column if not exists host_reel_mime_type text,
  add column if not exists host_reel_size_bytes bigint,
  add column if not exists host_reel_uploaded_at timestamptz,
  add column if not exists gstin text,
  add column if not exists platform_agreement_accepted_at timestamptz;

notify pgrst, 'reload schema';
