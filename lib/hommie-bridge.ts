//lib/hommie-bridge.ts

import { createAdminSupabaseClient } from "@/lib/supabase";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export async function ensureHommieOverlayFromApplication(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  application: Record<string, unknown>,
  userId: string
): Promise<{ profileId: string | null; legacyProfileId: string | null; slug: string | null; partnerCode: string | null }> {
  const email = String(application.email ?? "");
  const hostName = String(application.full_name ?? "Famlo hommie");
  const city = typeof application.city === "string" ? application.city : "";
  const state = typeof application.state === "string" ? application.state : "";
  const bio = typeof application.bio === "string" ? application.bio : "";
  const activityTypes = Array.isArray(application.activity_types)
    ? application.activity_types.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  const interests = Array.isArray(application.interests)
    ? application.interests.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  const images =
    typeof application.photo_url === "string" && application.photo_url.length > 0
      ? [application.photo_url]
      : [];
  const baseSlug = slugify(`${hostName}-${city || "famlo"}`) || `hommie-${Date.now()}`;
  const now = new Date().toISOString();
  const legacyGuideId =
    typeof application.legacy_city_guide_id === "string" && application.legacy_city_guide_id.length > 0
      ? application.legacy_city_guide_id
      : null;
  const partnerCode =
    typeof application.partner_code === "string" && application.partner_code.length > 0
      ? application.partner_code
      : typeof application.guide_id === "string" && application.guide_id.length > 0
        ? application.guide_id
        : null;
  const partnerPassword =
    typeof application.partner_password === "string" && application.partner_password.length > 0
      ? application.partner_password
      : typeof application.guide_password === "string" && application.guide_password.length > 0
        ? application.guide_password
        : typeof application.password === "string" && application.password.length > 0
          ? application.password
          : null;

  let legacyProfileId: string | null = null;
  const serviceTags = activityTypes.length > 0 ? activityTypes : interests;

  const { data: existingV2, error: existingV2Error } = await supabase
    .from("hommie_profiles_v2")
    .select("id")
    .or(
      [
        `user_id.eq.${userId}`,
        `email.eq.${email}`,
        legacyGuideId ? `legacy_city_guide_id.eq.${legacyGuideId}` : null,
        partnerCode ? `partner_code.eq.${partnerCode}` : null,
      ]
        .filter(Boolean)
        .join(",")
    )
    .maybeSingle();

  if (existingV2Error) {
    throw existingV2Error;
  }

  const v2Payload = {
    user_id: userId,
    legacy_hommie_id: legacyProfileId,
    legacy_city_guide_id: legacyGuideId,
    status: "published",
    partner_code: partnerCode,
    partner_password: partnerPassword,
    display_name: hostName,
    email,
    phone: typeof application.phone === "string" ? application.phone : null,
    slug: baseSlug,
    city: city || null,
    state: state || null,
    locality: null,
    bio: bio || null,
    languages: [],
    service_tags: serviceTags,
    hourly_price: 500,
    nightly_price: 0,
    max_guests: 1,
    is_online: Boolean(application.is_online),
    is_available: typeof application.is_available === "boolean" ? application.is_available : true,
    is_verified: typeof application.is_verified === "boolean" ? application.is_verified : true,
    avatar_url: images[0] ?? null,
    college: typeof application.college === "string" ? application.college : null,
    total_trips:
      typeof application.total_trips === "number"
        ? application.total_trips
        : typeof application.total_trips === "string"
          ? Number(application.total_trips)
          : 0,
    notes: typeof application.notes === "string" ? application.notes : null,
    lat: 0,
    lng: 0,
    published_at: now,
    updated_at: now,
  };

  let v2ProfileId: string | null = null;
  if (existingV2?.id) {
    const { error: v2UpdateError } = await supabase
      .from("hommie_profiles_v2")
      .update(v2Payload as never)
      .eq("id", existingV2.id);
    if (v2UpdateError) {
      throw v2UpdateError;
    }
    v2ProfileId = existingV2.id;
  } else {
    const { data: v2Inserted, error: v2InsertError } = await supabase
      .from("hommie_profiles_v2")
      .insert(v2Payload as never)
      .select("id")
      .single();
    if (v2InsertError) {
      throw v2InsertError;
    }
    v2ProfileId = typeof v2Inserted.id === "string" ? v2Inserted.id : null;
  }

  if (v2ProfileId && images.length > 0) {
    await supabase.from("hommie_media_v2").delete().eq("hommie_id", v2ProfileId);
    const { error: mediaError } = await supabase.from("hommie_media_v2").insert(
      images.map((mediaUrl, index) => ({
        hommie_id: v2ProfileId,
        media_url: mediaUrl,
        media_type: "image",
        is_primary: index === 0,
      })) as never
    );
    if (mediaError) {
      console.error("[HommieBridge] Failed to sync hommie_media_v2:", mediaError);
    }
  }

  return {
    profileId: v2ProfileId,
    legacyProfileId,
    slug: baseSlug,
    partnerCode,
  };
}

export async function ensureHommieOverlayFromGuide(params: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  guide: Record<string, unknown>;
  email: string;
  userId: string;
}): Promise<{ profileId: string | null; slug: string | null }> {
  const { supabase, guide, email, userId } = params;

  const mappedApplication = {
    id: null,
    legacy_city_guide_id: typeof guide.id === "string" ? guide.id : null,
    full_name: typeof guide.name === "string" ? guide.name : "Famlo hommie",
    email,
    phone: typeof guide.phone === "string" ? guide.phone : null,
    city: typeof guide.city === "string" ? guide.city : null,
    state: typeof guide.state === "string" ? guide.state : null,
    bio: typeof guide.bio === "string" ? guide.bio : null,
    activity_types: [],
    interests: Array.isArray(guide.activities) ? guide.activities : [],
    photo_url: typeof guide.avatar_url === "string" ? guide.avatar_url : null
  };

  const result = await ensureHommieOverlayFromApplication(supabase, mappedApplication, userId);
  return { profileId: result.profileId, slug: result.slug };
}
