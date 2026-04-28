-- Migration: Privacy-First Location System
-- Created At: 2026-04-11
-- Adds support for exact/approximate coordinates and neighborhood metadata.

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
