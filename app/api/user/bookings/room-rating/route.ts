import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { isCompletedStayStatus } from "@/lib/chat-access";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveStayUnitIdFromBooking(row: Record<string, unknown> | null): string {
  const direct = asString(row?.stay_unit_id);
  if (direct) {
    return direct;
  }

  const snapshot = row?.pricing_snapshot;
  if (snapshot && typeof snapshot === "object") {
    return asString((snapshot as Record<string, unknown>).stay_unit_id);
  }

  return "";
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

async function resolveCurrentStayUnitId(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  booking: Record<string, unknown> | null,
  requestedStayUnitId: string | null
): Promise<string> {
  const preferredId = asString(requestedStayUnitId) || resolveStayUnitIdFromBooking(booking);

  if (preferredId) {
    const currentRoomLookup = await supabase.from("stay_units_v2").select("id").eq("id", preferredId).maybeSingle();
    if (!currentRoomLookup.error && asString(currentRoomLookup.data?.id)) {
      return asString(currentRoomLookup.data?.id);
    }
  }

  const hostRelation = Array.isArray(booking?.hosts) ? booking?.hosts[0] : booking?.hosts;
  const legacyFamilyId = asString(hostRelation?.legacy_family_id);
  const hostId = asString(booking?.host_id);
  if (!legacyFamilyId && !hostId) {
    return preferredId ?? "";
  }

  const roomQuery = legacyFamilyId
    ? supabase
        .from("stay_units_v2")
        .select("id,price_morning,price_afternoon,price_evening,price_fullday,is_primary")
        .eq("legacy_family_id", legacyFamilyId)
        .eq("is_active", true)
    : supabase
        .from("stay_units_v2")
        .select("id,price_morning,price_afternoon,price_evening,price_fullday,is_primary")
        .eq("host_id", hostId ?? "")
        .eq("is_active", true);

  const { data: currentRooms, error: currentRoomsError } = await roomQuery;
  if (currentRoomsError) throw currentRoomsError;

  const unitPrice = asNumber((booking?.pricing_snapshot as Record<string, unknown> | null)?.unit_price);
  const exactMatches = ((currentRooms ?? []) as Record<string, unknown>[]).filter((room) => {
    const prices = [room.price_morning, room.price_afternoon, room.price_evening, room.price_fullday].map(asNumber);
    return Number.isFinite(unitPrice) && prices.some((price) => price === unitPrice);
  });

  if (exactMatches.length === 1) {
    return asString(exactMatches[0]?.id);
  }

  const nonPrimaryRooms = ((currentRooms ?? []) as Record<string, unknown>[]).filter((room) => room.is_primary !== true);
  if (nonPrimaryRooms.length === 1) {
    return asString(nonPrimaryRooms[0]?.id);
  }

  return preferredId ?? "";
}

async function loadBookingForRating(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  bookingId: string
): Promise<Record<string, unknown> | null> {
  let bookingResult:
    | {
        data: Record<string, unknown> | null;
        error: unknown;
      }
    | undefined;

  try {
    bookingResult = await supabase
      .from("bookings_v2")
      .select("id,user_id,status,stay_unit_id,pricing_snapshot,checked_out_at,legacy_booking_id,host_id,hosts(legacy_family_id)")
      .or(`id.eq.${bookingId},legacy_booking_id.eq.${bookingId}`)
      .maybeSingle();
  } catch (error) {
    bookingResult = { data: null, error };
  }

  const bookingErrorRecord =
    bookingResult?.error && typeof bookingResult.error === "object" ? (bookingResult.error as { message?: unknown; code?: unknown }) : null;
  const missingStayUnitColumn =
    typeof bookingErrorRecord?.message === "string" &&
    bookingErrorRecord.message.includes("stay_unit_id") &&
    (bookingErrorRecord.message.includes("schema cache") || bookingErrorRecord.message.includes("does not exist"));

  if (missingStayUnitColumn) {
    bookingResult = await supabase
      .from("bookings_v2")
      .select("id,user_id,status,pricing_snapshot,checked_out_at,legacy_booking_id,host_id,hosts(legacy_family_id)")
      .or(`id.eq.${bookingId},legacy_booking_id.eq.${bookingId}`)
      .maybeSingle();
  }

  if (bookingResult?.error) throw bookingResult.error;
  return bookingResult?.data ?? null;
}

async function loadExistingRating(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  bookingId: string,
  legacyBookingId: string
): Promise<{ id: string; target_profile_id: string; rating: number | null } | null> {
  const candidateIds = [...new Set([bookingId, legacyBookingId].map(asString).filter(Boolean))];
  if (candidateIds.length === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from("reviews_v2")
    .select("id,target_profile_id,rating,created_at,booking_id")
    .eq("target_type", "stay_unit")
    .in("booking_id", candidateIds)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as Array<{ id?: string; target_profile_id?: string; rating?: number | null }>;
  const first = rows[0];
  if (!first?.id) {
    return null;
  }

  return {
    id: asString(first.id),
    target_profile_id: asString(first.target_profile_id),
    rating: Number.isFinite(asNumber(first.rating)) ? asNumber(first.rating) : null,
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const cleanBookingId = url.searchParams.get("bookingId")?.trim() ?? "";
    if (!cleanBookingId) {
      return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const booking = await loadBookingForRating(supabase, cleanBookingId);
    if (!booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }
    if (asString(booking.user_id) !== authUser.id) {
      return NextResponse.json({ error: "You can only access your own room rating." }, { status: 403 });
    }

    const canonicalBookingId = asString(booking.id) || cleanBookingId;
    const legacyBookingId = asString(booking.legacy_booking_id);
    const existingRating = await loadExistingRating(supabase, canonicalBookingId, legacyBookingId);
    const stayUnitId = await resolveCurrentStayUnitId(supabase, booking, "");

    return NextResponse.json({
      bookingId: canonicalBookingId,
      stayUnitId,
      rating: existingRating?.rating ?? null,
    });
  } catch (error) {
    console.error("Room rating load failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load room rating." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { bookingId, stayUnitId: requestedStayUnitId, rating } = (await request.json()) as {
      bookingId?: string;
      stayUnitId?: string | null;
      rating?: number | string;
    };
    const cleanBookingId = String(bookingId ?? "").trim();
    const normalizedRating = typeof rating === "number" ? rating : typeof rating === "string" ? Number(rating) : NaN;

    if (!cleanBookingId || !Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
      return NextResponse.json({ error: "bookingId and a rating from 1 to 5 are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const booking = await loadBookingForRating(supabase, cleanBookingId);

    if (!booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    if (asString(booking.user_id) !== authUser.id) {
      return NextResponse.json({ error: "You can only rate your own completed stay." }, { status: 403 });
    }

    if (!isCompletedStayStatus(asString(booking.status)) && !String(booking.checked_out_at ?? "").length) {
      return NextResponse.json({ error: "Room rating opens after checkout is completed." }, { status: 409 });
    }

    const stayUnitId = await resolveCurrentStayUnitId(
      supabase,
      booking as Record<string, unknown> | null,
      asString(requestedStayUnitId)
    );
    if (!stayUnitId) {
      return NextResponse.json({ error: "This booking is not linked to a room." }, { status: 409 });
    }

    const canonicalBookingId = asString(booking.id) || cleanBookingId;
    const legacyBookingId = asString(booking.legacy_booking_id);
    const now = new Date().toISOString();
    const existingRating = await loadExistingRating(supabase, canonicalBookingId, legacyBookingId);

    const payload = {
      booking_id: canonicalBookingId,
      guest_user_id: authUser.id,
      target_type: "stay_unit",
      target_profile_id: stayUnitId,
      rating: normalizedRating,
      title: null,
      body: null,
      created_at: now,
    };

    if (existingRating?.id) {
      const { error: updateError } = await supabase
        .from("reviews_v2")
        .update({ rating: normalizedRating, target_profile_id: stayUnitId, booking_id: canonicalBookingId } as never)
        .eq("id", existingRating.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase.from("reviews_v2").insert(payload as never);
      if (insertError) throw insertError;
    }

    revalidateTag("public-home-stay-data", "max");
    revalidateTag("home-detail-public-data", "max");

    return NextResponse.json({ success: true, rating: normalizedRating, stayUnitId, bookingId: canonicalBookingId });
  } catch (error) {
    console.error("Room rating save failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save room rating." },
      { status: 500 }
    );
  }
}
