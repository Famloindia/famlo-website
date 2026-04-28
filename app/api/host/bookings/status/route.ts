import { NextResponse } from "next/server";

import { resolveMessageThread } from "@/lib/chat-thread";
import { updateHostBookingStatusCompatibility } from "@/lib/booking-compat";
import { appendLedgerEntryIfMissing, ensureScheduledPayout } from "@/lib/finance/runtime";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

const ALLOWED_STATUSES = new Set(["accepted", "confirmed", "rejected"]);

function buildStatusMessage(status: string): string {
  switch (status) {
    case "accepted":
    case "confirmed":
      return "Famlo update: your host has accepted this booking. You can now message the family and prepare for your stay.";
    case "rejected":
      return "Famlo update: this booking was not accepted by the host. Team Famlo can help you choose another live home if needed.";
    case "checked_in":
      return "Famlo update: your host has marked you as checked in. Enjoy the Famlo experience and use this chat if you need support.";
    case "completed":
      return "Famlo update: this stay has been marked as completed. You can now return to your bookings and leave a like or story.";
    default:
      return "Famlo update: your booking status changed.";
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      bookingId?: string;
      familyId?: string;
      status?: string;
    };

    const bookingId = String(body.bookingId ?? "").trim();
    const familyId = String(body.familyId ?? "").trim();
    const status = String(body.status ?? "").trim();

    if (!bookingId || !familyId || !status) {
      return NextResponse.json({ error: "bookingId, familyId, and status are required." }, { status: 400 });
    }

    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: "Unsupported booking status." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess) {
      return NextResponse.json({ error: "You do not have access to this host listing." }, { status: 403 });
    }

    const { data: host } = await supabase
      .from("hosts")
      .select("id")
      .eq("legacy_family_id", familyId)
      .maybeSingle();
    const resolvedHostId = typeof host?.id === "string" ? host.id : null;

    const { data: v2Booking, error: v2BookingError } = await supabase
      .from("bookings_v2")
      .select("id,status,host_id,conversation_id,user_id,legacy_booking_id,payment_status,partner_payout_amount,pricing_snapshot,hosts(user_id,legacy_family_id,display_name)")
      .or(`id.eq.${bookingId},legacy_booking_id.eq.${bookingId}`)
      .maybeSingle();
    if (v2Booking?.host_id && hostAccess.hostId && v2Booking.host_id !== hostAccess.hostId) {
      return NextResponse.json({ error: "Booking not found for this listing." }, { status: 404 });
    }

    const updated = await updateHostBookingStatusCompatibility(supabase, {
      bookingId,
      familyId,
      hostId: resolvedHostId,
      status,
    });

    if (!updated) {
      return NextResponse.json({ error: "Booking not found for this listing." }, { status: 404 });
    }

    const bookingWasPaid = String(v2Booking?.payment_status ?? "").trim() === "paid";
    const shouldSchedulePayout = bookingWasPaid && (status === "accepted" || status === "confirmed");
    const hostRelation = Array.isArray(v2Booking?.hosts) ? v2Booking.hosts[0] : v2Booking?.hosts;

    if (shouldSchedulePayout && v2Booking?.host_id && hostRelation?.user_id) {
      const payoutId = await ensureScheduledPayout(supabase, {
        bookingId: String(v2Booking.id),
        paymentId: null,
        partnerType: "host",
        partnerUserId: String(hostRelation.user_id),
        partnerProfileId: String(v2Booking.host_id),
        amount:
          typeof v2Booking.partner_payout_amount === "number"
            ? v2Booking.partner_payout_amount
            : Number(v2Booking.partner_payout_amount ?? 0),
        pricingSnapshot: (v2Booking.pricing_snapshot as Record<string, unknown> | null) ?? {},
      });

      if (payoutId) {
        await appendLedgerEntryIfMissing(supabase, {
          bookingId: String(v2Booking.id),
          payoutId,
          entryType: "payout_scheduled",
          accountCode: "partner_payable",
          direction: "credit",
          amount:
            typeof v2Booking.partner_payout_amount === "number"
              ? v2Booking.partner_payout_amount
              : Number(v2Booking.partner_payout_amount ?? 0),
          referenceType: "payout_schedule",
          referenceId: payoutId,
          metadata: {
            source: "host_booking_status",
            status,
          },
        });
      }
    }

    const thread = await resolveMessageThread(supabase, bookingId, { createIfMissing: true });

    if (!thread) {
      if (!v2Booking) {
        throw v2BookingError ?? new Error("Booking not found for this listing.");
      }
      return NextResponse.json({ success: true, booking: updated });
    }

    if (thread.conversationId) {
      const now = new Date().toISOString();
      const statusMessage = buildStatusMessage(status);

      const { error: insertMessageError } = await supabase.from("messages").insert({
        conversation_id: thread.conversationId,
        booking_id: thread.legacyBookingId,
        sender_id: null,
        receiver_id: thread.guestId ?? (typeof v2Booking?.user_id === "string" ? v2Booking.user_id : null),
        sender_type: "system",
        text: statusMessage,
        created_at: now,
      } as never);

      if (insertMessageError) {
        console.error("Host booking status message failed:", insertMessageError);
      } else {
        const { error: conversationError } = await supabase
          .from("conversations")
          .update({
            last_message: statusMessage,
            last_message_at: now,
            guest_unread: 1,
          } as never)
          .eq("id", thread.conversationId);

        if (conversationError) {
          console.error("Host booking conversation update failed:", conversationError);
        }
      }
    }

    return NextResponse.json({ success: true, booking: updated });
  } catch (error) {
    console.error("Host booking status update failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update booking status." },
      { status: 500 }
    );
  }
}
