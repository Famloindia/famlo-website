-- Migration: Privacy-First Location System
-- Created At: 2026-04-11
-- Adds support for exact/approximate coordinates and neighborhood metadata.

CREATE TABLE IF NOT EXISTS public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  host_id TEXT,
  name TEXT,
  about TEXT,
  description TEXT,
  city TEXT,
  state TEXT,
  village TEXT,
  max_guests INTEGER,
  bathroom_type TEXT,
  lat NUMERIC,
  lng NUMERIC,
  price_morning INTEGER,
  price_afternoon INTEGER,
  price_evening INTEGER,
  price_fullday INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  amenities TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1. Updates to hosts (V2)
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS lat_exact NUMERIC;
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS lng_exact NUMERIC;
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS landmarks JSONB DEFAULT '[]';
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS neighborhood_desc TEXT;
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS accessibility_desc TEXT;
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS pincode TEXT;

-- 2. Updates to families (Legacy)
-- Note: Some columns might already exist in legacy tables, adding IF NOT EXISTS for safety.
ALTER TABLE families ADD COLUMN IF NOT EXISTS lat_exact NUMERIC;
ALTER TABLE families ADD COLUMN IF NOT EXISTS lng_exact NUMERIC;
ALTER TABLE families ADD COLUMN IF NOT EXISTS landmarks JSONB DEFAULT '[]';
ALTER TABLE families ADD COLUMN IF NOT EXISTS neighborhood_desc TEXT;
ALTER TABLE families ADD COLUMN IF NOT EXISTS accessibility_desc TEXT;
ALTER TABLE families ADD COLUMN IF NOT EXISTS pincode TEXT;

CREATE TABLE IF NOT EXISTS public.host_onboarding_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_application_id UUID,
  mobile_number TEXT,
  primary_host_name TEXT,
  city_neighbourhood TEXT,
  street_address TEXT,
  email TEXT,
  state TEXT,
  country TEXT,
  family_composition TEXT,
  host_bio TEXT,
  languages_spoken TEXT[] NOT NULL DEFAULT '{}'::text[],
  famlo_experience TEXT,
  images TEXT[] NOT NULL DEFAULT '{}'::text[],
  bathroom_type TEXT,
  common_areas TEXT[] NOT NULL DEFAULT '{}'::text[],
  amenities TEXT[] NOT NULL DEFAULT '{}'::text[],
  upi_id TEXT,
  bank_account_holder_name TEXT,
  bank_account_number TEXT,
  ifsc_code TEXT,
  bank_name TEXT,
  host_photo_url TEXT,
  password TEXT,
  current_step INTEGER NOT NULL DEFAULT 1,
  listing_status TEXT NOT NULL DEFAULT 'draft',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  compliance JSONB NOT NULL DEFAULT '{}'::jsonb,
  lat_exact NUMERIC,
  lng_exact NUMERIC,
  landmarks JSONB DEFAULT '[]',
  neighborhood_desc TEXT,
  accessibility_desc TEXT,
  pincode TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Updates to host_onboarding_drafts
ALTER TABLE host_onboarding_drafts ADD COLUMN IF NOT EXISTS lat_exact NUMERIC;
ALTER TABLE host_onboarding_drafts ADD COLUMN IF NOT EXISTS lng_exact NUMERIC;
ALTER TABLE host_onboarding_drafts ADD COLUMN IF NOT EXISTS landmarks JSONB DEFAULT '[]';
ALTER TABLE host_onboarding_drafts ADD COLUMN IF NOT EXISTS neighborhood_desc TEXT;
ALTER TABLE host_onboarding_drafts ADD COLUMN IF NOT EXISTS accessibility_desc TEXT;
ALTER TABLE host_onboarding_drafts ADD COLUMN IF NOT EXISTS pincode TEXT;

-- 4. Backfill Logic
-- Migrate existing lat/lng to exact columns for safety
UPDATE hosts SET lat_exact = lat, lng_exact = lng WHERE lat IS NOT NULL AND lat_exact IS NULL;
UPDATE families SET lat_exact = lat, lng_exact = lng WHERE lat IS NOT NULL AND lat_exact IS NULL;

-- 5. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
