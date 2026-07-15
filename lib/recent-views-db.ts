import type { SupabaseClient } from "@supabase/supabase-js";

export async function recordRecentEntityViewCompatibility(params: {
  supabase: SupabaseClient;
  userId: string;
  entityType: "host" | "hommie" | "activity" | "story" | "ad";
  entityId: string;
  legacyFamilyId?: string | null;
  legacyActivityId?: string | null;
}): Promise<void> {
  const { supabase, userId, entityType, entityId, legacyFamilyId, legacyActivityId } = params;
  const viewedAt = new Date().toISOString();

  const v2Result = await supabase.from("recent_views_v2").upsert(
    {
      user_id: userId,
      entity_type: entityType,
      entity_id: entityId,
      viewed_at: viewedAt
    },
    { onConflict: "user_id,entity_type,entity_id" }
  );

  if (!v2Result.error) {
    return;
  }

  const fallbackTable = legacyFamilyId || legacyActivityId ? "recently_viewed" : null;
  if (!fallbackTable) {
    console.error("Error recording v2 recent view:", v2Result.error);
    return;
  }

  const fallbackResult = await supabase.from(fallbackTable).upsert(
    {
      user_id: userId,
      family_id: legacyFamilyId ?? null,
      activity_id: legacyActivityId ?? null,
      viewed_at: viewedAt
    },
    {
      onConflict: legacyFamilyId ? "user_id,family_id" : "user_id,activity_id"
    }
  );

  if (fallbackResult.error) {
    console.error("Error recording fallback recent view:", fallbackResult.error);
  }
}
