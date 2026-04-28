import { NextResponse } from "next/server";

import { deriveGuestCheckInCode, isGuestCheckInWindowOpen, normalizeGuestCheckInCode } from "@/lib/guest-check-in";
import { resolveMessageThread } from "@/lib/chat-thread";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

function isValidBookingStatus(status: string | null | undefined): boolean {
  return ["confirmed", "accepted"].includes(String(status ?? "").trim().toLowerCase());
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { bookingId, familyId, code } = (await request.json()) as {
      bookingId?: string;
      familyId?: string;
      code?: string;
    };

    const cleanBookingId = String(bookingId ?? "").trim();
    const cleanFamilyId = String(familyId ?? "").trim();
    const enteredCode = normalizeGuestCheckInCode(String(code ?? ""));

    if (!cleanBookingId || !cleanFamilyId || !enteredCode) {
      return NextResponse.json({ error: "bookingId, familyId, and code are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const now = new Date().toISOString();

    const { data: booking, error: bookingError } = await supabase
      .from("bookings_v2")
      .select("id,user_id,status,start_date,end_date,host_id,legacy_booking_id,conversation_id,guest_arrival_requested_at,checked_in_at,checked_out_at")
      .eq("id", cleanBookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;

    if (!booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const resolvedHostId = typeof booking.host_id === "string" && booking.host_id.length > 0 ? booking.host_id : null;
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, resolvedHostId ? { hostId: resolvedHostId } : { familyId: cleanFamilyId });
    if (!hostAccess) {
      return NextResponse.json({ error: "Check-in could not be verified for this booking." }, { status: 403 });
    }
    if (resolvedHostId && hostAccess.hostId && hostAccess.hostId !== resolvedHostId) {
      return NextResponse.json({ error: "Check-in could not be verified for this booking." }, { status: 403 });
    }

    if (!isValidBookingStatus(booking.status)) {
      await supabase.from("booking_checkin_attempts_v2").insert({
        booking_id: cleanBookingId,
        guest_user_id: booking.user_id,
        host_user_id: hostAccess.hostUserId,
        entered_code_suffix: enteredCode.slice(-2),
        success: false,
        failure_reason: "booking_not_eligible",
        created_at: now,
      } as never);
      return NextResponse.json({ error: "This booking is not ready for check-in." }, { status: 409 });
    }

    if (!isGuestCheckInWindowOpen({ startDate: booking.start_date, endDate: booking.end_date })) {
      return NextResponse.json({ error: "Check-in is not open for this booking yet." }, { status: 409 });
    }

    if (String(booking.checked_in_at ?? "").length > 0) {
      return NextResponse.json({ error: "This guest is already checked in." }, { status: 409 });
    }

    const recentFailures = await supabase
      .from("booking_checkin_attempts_v2")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", cleanBookingId)
      .eq("success", false)
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

    if ((recentFailures.count ?? 0) >= 5) {
      return NextResponse.json({ error: "Too many failed check-in attempts. Please try again later." }, { status: 429 });
    }

    const { data: guestProfile, error: guestError } = await supabase
      .from("users")
      .select("id,guest_checkin_seed")
      .eq("id", booking.user_id)
      .maybeSingle();
    if (guestError) throw guestError;

    if (!guestProfile?.guest_checkin_seed) {
      return NextResponse.json({ error: "Guest check-in profile is missing." }, { status: 409 });
    }

    const expectedCode = deriveGuestCheckInCode(String(guestProfile.guest_checkin_seed), cleanBookingId);
    const isMatch = expectedCode === enteredCode;

    await supabase.from("booking_checkin_attempts_v2").insert({
      booking_id: cleanBookingId,
      guest_user_id: booking.user_id,
      host_user_id: hostAccess.hostUserId,
      entered_code_suffix: enteredCode.slice(-2),
      success: isMatch,
      failure_reason: isMatch ? null : "code_mismatch",
      created_at: now,
    } as never);

    if (!isMatch) {
      return NextResponse.json({ error: "The code does not match this booking." }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("bookings_v2")
      .update({
        status: "checked_in",
        checked_in_at: now,
        checked_in_by_host_user_id: hostAccess.hostUserId,
        guest_arrival_requested_at: booking.guest_arrival_requested_at ?? now,
        updated_at: now,
      } as never)
      .eq("id", cleanBookingId);
    if (updateError) throw updateError;

    if (booking.legacy_booking_id) {
      await supabase
        .from("bookings")
        .update({ status: "checked_in", updated_at: now } as never)
        .eq("id", booking.legacy_booking_id);
    }

    await supabase.from("booking_status_history_v2").insert({
      booking_id: cleanBookingId,
      old_status: booking.status ?? null,
      new_status: "checked_in",
      changed_by_user_id: hostAccess.hostUserId,
      reason: "guest_secret_code_verified",
      created_at: now,
    } as never);

    const thread = await resolveMessageThread(supabase, cleanBookingId, { createIfMissing: true });
    if (thread?.conversationId) {
      const confirmationMessage = "Famlo update: your host has confirmed your check-in. Enjoy your stay and message if you need help.";
      const { error: messageError } = await supabase.from("messages").insert({
        conversation_id: thread.conversationId,
        booking_id: thread.legacyBookingId,
        sender_id: null,
        receiver_id: booking.user_id,
        sender_type: "system",
        text: confirmationMessage,
        created_at: now,
      } as never);
      if (messageError) {
        console.error("Check-in system message failed:", messageError);
      } else {
        await supabase
          .from("conversations")
          .update({ last_message: confirmationMessage, last_message_at: now, guest_unread: 1 } as never)
          .eq("id", thread.conversationId);
      }
    }

    return NextResponse.json({ success: true, status: "checked_in" });
  } catch (error) {
    console.error("Host check-in verification failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not confirm guest check-in." },
      { status: 500 }
    );
  }
}
