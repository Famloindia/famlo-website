import { NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/supabase";

function parseString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseStringList(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumberish(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function updateBookingStatusCompatibility(
  bookingId: string,
  bookingStatus: "pending" | "confirmed" | "rejected"
): Promise<void> {
  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();

  const { data: v2Booking } = await supabase
    .from("bookings_v2")
    .select("id,legacy_booking_id")
    .or(`id.eq.${bookingId},legacy_booking_id.eq.${bookingId}`)
    .maybeSingle();

  if (v2Booking) {
    await supabase
      .from("bookings_v2")
      .update({ status: bookingStatus, updated_at: now } as never)
      .eq("id", v2Booking.id);
    return;
  }

  await supabase.from("bookings").update({ status: bookingStatus, updated_at: now } as never).eq("id", bookingId);
}

async function syncHommieProfileV2(params: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  hommieId: string;
  hommieEmail?: string | null;
  hommieUserId?: string | null;
  legacyGuideId?: string | null;
  updates: Record<string, unknown>;
  amenities: string[];
  images: string[];
}): Promise<void> {
  const { supabase, hommieId, hommieEmail, hommieUserId, legacyGuideId, updates, amenities, images } = params;

  const candidateQueries = [
    supabase.from("hommie_profiles_v2").select("id").eq("legacy_hommie_id", hommieId).maybeSingle(),
    hommieUserId
      ? supabase.from("hommie_profiles_v2").select("id").eq("user_id", hommieUserId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    hommieEmail
      ? supabase.from("hommie_profiles_v2").select("id").eq("email", hommieEmail).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    legacyGuideId
      ? supabase.from("hommie_profiles_v2").select("id").eq("legacy_city_guide_id", legacyGuideId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ];

  const [legacyMatch, userMatch, emailMatch, guideMatch] = await Promise.all(candidateQueries);
  const profileId =
    legacyMatch.data?.id ??
    userMatch.data?.id ??
    emailMatch.data?.id ??
    guideMatch.data?.id ??
    null;

  if (!profileId) return;

  const displayName = parseString(updates.host_name) ?? parseString(updates.property_name) ?? "Famlo hommie";
  const description = parseString(updates.description);
  const nextHourlyPrice = parseNumberish(updates.nightly_price);
  const nextMaxGuests = parseNumberish(updates.max_guests);

  await supabase
    .from("hommie_profiles_v2")
    .update({
      display_name: displayName,
      email: parseString(updates.email),
      phone: parseString(updates.phone),
      city: parseString(updates.city),
      state: parseString(updates.state),
      locality: parseString(updates.locality),
      bio: description,
      service_tags: amenities,
      hourly_price: nextHourlyPrice,
      max_guests: nextMaxGuests > 0 ? nextMaxGuests : 1,
      status: parseBoolean(updates.is_active) === false ? "paused" : "published",
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", profileId);

  if (images.length > 0) {
    await supabase.from("hommie_media_v2").delete().eq("hommie_id", profileId);
    await supabase.from("hommie_media_v2").insert(
      images.map((mediaUrl, index) => ({
        hommie_id: profileId,
        media_url: mediaUrl,
        media_type: "image",
        is_primary: index === 0,
      })) as never
    );
  }
}

async function resolveHommieTargets(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  hommieId: string
): Promise<{
  v2ProfileId: string | null;
  userId: string | null;
  email: string | null;
  legacyGuideId: string | null;
}> {
  const { data: v2Profile, error: v2ProfileError } = await supabase
    .from("hommie_profiles_v2")
    .select("id,legacy_hommie_id,legacy_city_guide_id,user_id,email")
    .or(`id.eq.${hommieId},legacy_hommie_id.eq.${hommieId},legacy_city_guide_id.eq.${hommieId}`)
    .maybeSingle();

  if (v2ProfileError) {
    throw v2ProfileError;
  }

  if (!v2Profile) {
    return {
      v2ProfileId: null,
      userId: null,
      email: null,
      legacyGuideId: null,
    };
  }

  return {
    v2ProfileId: typeof v2Profile.id === "string" ? v2Profile.id : null,
    userId: typeof v2Profile.user_id === "string" ? v2Profile.user_id : null,
    email: typeof v2Profile.email === "string" ? v2Profile.email : null,
    legacyGuideId:
      typeof v2Profile.legacy_city_guide_id === "string" ? v2Profile.legacy_city_guide_id : null,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as {
    hommieId?: string;
    updates?: Record<string, unknown>;
    bookingId?: string;
    bookingStatus?: "pending" | "confirmed" | "rejected";
  };

    const supabase = createAdminSupabaseClient();

  try {
    if (body.bookingId && body.bookingStatus) {
      await updateBookingStatusCompatibility(body.bookingId, body.bookingStatus);
    }

    if (body.hommieId && body.updates) {
      const { v2ProfileId, userId, email, legacyGuideId } = await resolveHommieTargets(supabase, body.hommieId);

      const updates = body.updates;
      const amenities = parseStringList(updates.amenities);
      const images = parseStringList(updates.images);

      await syncHommieProfileV2({
        supabase,
        hommieId: body.hommieId,
        hommieEmail: email ?? parseString(updates.email),
        hommieUserId: userId,
        legacyGuideId,
        updates,
        amenities,
        images,
      });

      if (v2ProfileId) {
        await supabase
          .from("hommie_profiles_v2")
          .update({
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", v2ProfileId);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save hommie dashboard." },
      { status: 500 }
    );
  }
}
