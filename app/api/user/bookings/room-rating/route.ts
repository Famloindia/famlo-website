import { NextResponse } from "next/server";

import { isCompletedStayStatus } from "@/lib/chat-access";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { bookingId, rating } = (await request.json()) as { bookingId?: string; rating?: number | string };
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

    const { data: booking, error: bookingError } = await supabase
      .from("bookings_v2")
      .select("id,user_id,status,stay_unit_id,checked_out_at")
      .eq("id", cleanBookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;

    if (!booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    if (asString(booking.user_id) !== authUser.id) {
      return NextResponse.json({ error: "You can only rate your own completed stay." }, { status: 403 });
    }

    if (!isCompletedStayStatus(asString(booking.status)) && !String(booking.checked_out_at ?? "").length) {
      return NextResponse.json({ error: "Room rating opens after checkout is completed." }, { status: 409 });
    }

    const stayUnitId = asString(booking.stay_unit_id);
    if (!stayUnitId) {
      return NextResponse.json({ error: "This booking is not linked to a room." }, { status: 409 });
    }

    const now = new Date().toISOString();
    const existingRatingResult = await supabase
      .from("reviews_v2")
      .select("id")
      .eq("booking_id", cleanBookingId)
      .eq("target_type", "stay_unit")
      .eq("target_profile_id", stayUnitId)
      .maybeSingle();
    if (existingRatingResult.error) throw existingRatingResult.error;

    const payload = {
      booking_id: cleanBookingId,
      guest_user_id: authUser.id,
      target_type: "stay_unit",
      target_profile_id: stayUnitId,
      rating: normalizedRating,
      title: null,
      body: null,
      created_at: now,
    };

    if (existingRatingResult.data?.id) {
      const { error: updateError } = await supabase
        .from("reviews_v2")
        .update({ rating: normalizedRating } as never)
        .eq("id", existingRatingResult.data.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase.from("reviews_v2").insert(payload as never);
      if (insertError) throw insertError;
    }

    return NextResponse.json({ success: true, rating: normalizedRating, stayUnitId });
  } catch (error) {
    console.error("Room rating save failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save room rating." },
      { status: 500 }
    );
  }
}
