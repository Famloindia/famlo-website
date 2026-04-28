import { NextResponse } from "next/server";

import { resolveMessageThread } from "@/lib/chat-thread";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

function isCheckoutEligible(status: unknown): boolean {
  return String(status ?? "").trim().toLowerCase() === "checked_in";
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { bookingId, familyId } = (await request.json()) as { bookingId?: string; familyId?: string };
    const cleanBookingId = String(bookingId ?? "").trim();
    const cleanFamilyId = String(familyId ?? "").trim();

    if (!cleanBookingId || !cleanFamilyId) {
      return NextResponse.json({ error: "bookingId and familyId are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    const now = new Date().toISOString();

    const { data: host, error: hostError } = await supabase
      .from("hosts")
      .select("id,user_id")
      .eq("legacy_family_id", cleanFamilyId)
      .maybeSingle();
    if (hostError) throw hostError;

    if (!host?.id || !host?.user_id || host.user_id !== authUser.id) {
      return NextResponse.json({ error: "Host profile not found." }, { status: 404 });
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings_v2")
      .select("id,user_id,status,host_id,legacy_booking_id,conversation_id,checked_in_at,checked_out_at")
      .eq("id", cleanBookingId)
      .eq("host_id", host.id)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    if (String(booking.checked_out_at ?? "").length > 0) {
      return NextResponse.json({ error: "This stay is already checked out." }, { status: 409 });
    }

    if (!isCheckoutEligible(booking.status)) {
      return NextResponse.json({ error: "Checkout is only available after check-in." }, { status: 409 });
    }

    const { error: updateError } = await supabase
      .from("bookings_v2")
      .update({
        status: "completed",
        checked_out_at: now,
        checked_out_by_host_user_id: host.user_id,
        updated_at: now,
      } as never)
      .eq("id", cleanBookingId);
    if (updateError) throw updateError;

    if (booking.legacy_booking_id) {
      await supabase
        .from("bookings")
        .update({ status: "completed", updated_at: now } as never)
        .eq("id", booking.legacy_booking_id);
    }

    await supabase.from("booking_status_history_v2").insert({
      booking_id: cleanBookingId,
      old_status: booking.status ?? null,
      new_status: "completed",
      changed_by_user_id: host.user_id,
      reason: "host_checkout_confirmed",
      created_at: now,
    } as never);

    const thread = await resolveMessageThread(supabase, cleanBookingId, { createIfMissing: true });
    if (thread?.conversationId) {
      const systemMessage = "Famlo update: your host has marked this stay complete. You can now share your story.";
      const { error: messageError } = await supabase.from("messages").insert({
        conversation_id: thread.conversationId,
        booking_id: thread.legacyBookingId,
        sender_id: null,
        receiver_id: booking.user_id,
        sender_type: "system",
        text: systemMessage,
        created_at: now,
      } as never);
      if (messageError) {
        console.error("Checkout system message failed:", messageError);
      } else {
        await supabase
          .from("conversations")
          .update({ last_message: systemMessage, last_message_at: now, guest_unread: 1 } as never)
          .eq("id", thread.conversationId);
      }
    }

    return NextResponse.json({ success: true, status: "completed" });
  } catch (error) {
    console.error("Host checkout failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not complete checkout." },
      { status: 500 }
    );
  }
}
