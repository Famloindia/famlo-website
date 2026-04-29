CREATE INDEX IF NOT EXISTS family_photos_family_id_primary_idx
  ON public.family_photos (family_id, is_primary DESC);

CREATE INDEX IF NOT EXISTS conversations_family_id_last_message_at_idx
  ON public.conversations (family_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS stay_units_v2_host_active_idx
  ON public.stay_units_v2 (host_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS stay_units_v2_family_idx
  ON public.stay_units_v2 (legacy_family_id);

NOTIFY pgrst, 'reload schema';
