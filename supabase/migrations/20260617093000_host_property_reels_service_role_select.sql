-- Runtime media loaders use the server-side service role client for scoped
-- property/profile media reads. Reassert the narrow read grant because some
-- staging resets missed the earlier host_property_reels runtime grants.
grant select on table public.host_property_reels to service_role;
