import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { deriveGuestCheckInCode, formatGuestCheckInCode, isGuestCheckInWindowOpen } from "@/lib/guest-check-in";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { bookingId } = (await request.json()) as { bookingId?: string };
    const cleanBookingId = String(bookingId ?? "").trim();

    if (!cleanBookingId) {
      return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings_v2")
      .select("id,user_id,status,start_date,end_date,quarter_type,guest_arrival_requested_at")
      .eq("id", cleanBookingId)
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (bookingError) throw bookingError;
    if (!booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const normalizedStatus = String(booking.status ?? "").trim().toLowerCase();
    if (!["confirmed", "accepted", "checked_in"].includes(normalizedStatus)) {
      return NextResponse.json({ error: "Check-in is not available for this booking yet." }, { status: 409 });
    }

    if (!isGuestCheckInWindowOpen({ startDate: booking.start_date, endDate: booking.end_date })) {
      return NextResponse.json(
        { error: "Check-in opens 24 hours before arrival and stays open through the booking window." },
        { status: 409 }
      );
    }

    const { data: userProfile, error: profileError } = await supabase
      .from("users")
      .select("id,guest_checkin_seed")
      .eq("id", authUser.id)
      .maybeSingle();

    if (profileError) throw profileError;

    let seed = typeof userProfile?.guest_checkin_seed === "string" ? userProfile.guest_checkin_seed : "";
    if (!seed) {
      const generated = crypto.randomUUID();
      const { error: seedUpdateError } = await supabase
        .from("users")
        .update({ guest_checkin_seed: generated } as never)
        .eq("id", authUser.id);
      if (seedUpdateError) throw seedUpdateError;
      seed = generated;
    }

    const code = deriveGuestCheckInCode(seed, cleanBookingId);
    const now = new Date().toISOString();

    await supabase
      .from("bookings_v2")
      .update({
        guest_arrival_requested_at: now,
        updated_at: now,
      } as never)
      .eq("id", cleanBookingId);

    return NextResponse.json({
      success: true,
      code,
      displayCode: formatGuestCheckInCode(code),
      message: "Tell this code to your host to confirm check-in.",
    });
  } catch (error) {
    console.error("Guest check-in code request failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load your check-in code." },
      { status: 500 }
    );
  }
}
