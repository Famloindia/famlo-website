-- Preserve onboarding room data and the full submission payload on family applications.

CREATE TABLE IF NOT EXISTS public.family_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_draft_id UUID REFERENCES public.host_onboarding_drafts(id) ON DELETE SET NULL,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  whatsapp_number TEXT,
  property_name TEXT,
  property_address TEXT,
  village TEXT,
  state TEXT,
  house_type TEXT,
  about_family TEXT,
  max_guests INTEGER,
  upi_id TEXT,
  cultural_offerings JSONB NOT NULL DEFAULT '[]'::jsonb,
  languages JSONB NOT NULL DEFAULT '[]'::jsonb,
  photo_url TEXT,
  rooms JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

alter table if exists public.family_applications
  add column if not exists rooms jsonb default '[]'::jsonb,
  add column if not exists payload jsonb default '{}'::jsonb;

update public.family_applications
set rooms = coalesce(rooms, '[]'::jsonb)
where rooms is null;

update public.family_applications
set payload = coalesce(payload, '{}'::jsonb)
where payload is null;

notify pgrst, 'reload schema';
