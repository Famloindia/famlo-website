CREATE TABLE IF NOT EXISTS public.family_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
  url TEXT,
  image_url TEXT,
  storage_path TEXT,
  caption TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS family_photos_family_id_primary_idx
  ON public.family_photos (family_id, is_primary DESC);

CREATE INDEX IF NOT EXISTS conversations_family_id_last_message_at_idx
  ON public.conversations (family_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS stay_units_v2_host_active_idx
  ON public.stay_units_v2 (host_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS stay_units_v2_family_idx
  ON public.stay_units_v2 (legacy_family_id);

NOTIFY pgrst, 'reload schema';
