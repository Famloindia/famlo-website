import { createBrowserSupabaseClient } from "../supabase";
import { recordRecentEntityViewCompatibility } from "@/lib/recent-views-db";

export async function recordRecentView(listingId: string) {
  const supabase = createBrowserSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return;

  try {
    await recordRecentEntityViewCompatibility({
      supabase,
      userId: user.id,
      entityType: "host",
      entityId: listingId,
      legacyFamilyId: listingId
    });
  } catch (err) {
    console.error("Failed to record recent view:", err);
  }
}
