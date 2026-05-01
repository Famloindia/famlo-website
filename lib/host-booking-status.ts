import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveMessageThread } from "@/lib/chat-thread";
import { enqueueNotification } from "@/lib/booking-platform";
import { updateHostBookingStatusCompatibility } from "@/lib/booking-compat";
import { appendLedgerEntryIfMissing, ensureScheduledPayout } from "@/lib/finance/runtime";
import { asString, type JsonRecord } from "@/lib/platform-utils";

type HostBookingStatusMessageContext = {
  guestName?: string | null;
  hostName?: string | null;
  hostFullAddress?: string | null;
  hostMapPinUrl?: string | null;
  cityName?: string | null;
};

export function buildHostBookingStatusMessage(
  status: string,
  context: HostBookingStatusMessageContext = {}
): string {
  const guestName = asString(context.guestName) || "there";
  const hostName = asString(context.hostName) || "your host";
  const hostFullAddress = asString(context.hostFullAddress) || "Your host will share the final location shortly.";
  const hostMapPinUrl = asString(context.hostMapPinUrl) || "Map pin will be shared shortly.";
  const cityName = asString(context.cityName) || "your stay city";

  switch (status) {
    case "accepted":
    case "confirmed":
      return [
        `Hi ${guestName},`,
        "",
        `Good news! ${hostName} has confirmed your arrival, and your booking is now confirmed.`,
        "",
        "Your stay location:",
        hostFullAddress,
        "",
        "Map pin location:",
        hostMapPinUrl,
        "",
        "If you have any questions, you can message your host directly or reach out to us at hello@famlo.in.",
        "",
        `For any emergency during your trip in ${cityName}, tap the Emergency button in your profile. We’re here to support you throughout your Famlo stay.`,
        "",
        "Welcome to Famlo — live like a local.",
      ].join("\n");
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

export async function applyHostBookingStatusUpdate(
  supabase: SupabaseClient,
  params: {
    bookingId: string;
    familyId?: string | null;
    hostId?: string | null;
    status: string;
    skipGuestNotifications?: boolean;
  }
): Promise<JsonRecord | null> {
  const { bookingId, familyId, hostId, status, skipGuestNotifications = false } = params;

  const { data: v2Booking, error: v2BookingError } = await supabase
    .from("bookings_v2")
    .select("id,status,host_id,conversation_id,user_id,legacy_booking_id,payment_status,partner_payout_amount,pricing_snapshot,hosts(user_id,legacy_family_id,display_name)")
    .or(`id.eq.${bookingId},legacy_booking_id.eq.${bookingId}`)
    .maybeSingle();

  const updated = await updateHostBookingStatusCompatibility(supabase, {
    bookingId,
    familyId,
    hostId,
    status,
  });

  if (!updated) {
    return null;
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
  const guestUserId = thread?.guestId ?? (typeof v2Booking?.user_id === "string" ? v2Booking.user_id : null);
  const notificationEventType = status === "rejected" ? "booking_rejected" : "booking_confirmed";
  const notificationSubject =
    status === "rejected" ? "Your Famlo booking was not accepted" : "Your Famlo booking was accepted";
  const { data: guestProfile } = guestUserId
    ? await supabase
        .from("users")
        .select("name,city,state")
        .eq("id", guestUserId)
        .maybeSingle()
    : { data: null };
  const resolvedFamilyId = familyId ?? hostRelation?.legacy_family_id ?? null;
  const { data: familyProfile } = resolvedFamilyId
    ? await supabase
        .from("families")
        .select("id,name,property_name,city,state,village,google_maps_link")
        .eq("id", resolvedFamilyId)
        .maybeSingle()
    : { data: null };
  const hostDisplayName =
    asString(hostRelation?.display_name) ||
    asString(familyProfile?.property_name) ||
    asString(familyProfile?.name) ||
    "your host";
  const hostFullAddress = [familyProfile?.village, familyProfile?.city, familyProfile?.state]
    .map((part) => asString(part))
    .filter(Boolean)
    .join(", ");
  const bookingContext = {
    guestName: asString(guestProfile?.name),
    hostName: hostDisplayName,
    hostFullAddress,
    hostMapPinUrl: asString(familyProfile?.google_maps_link),
    cityName: asString(familyProfile?.city) || asString(guestProfile?.city) || asString(guestProfile?.state),
  };
  const notificationPayload = {
    message: buildHostBookingStatusMessage(status, bookingContext),
    cta_label: "View booking",
    cta_url: "/bookings",
  };

  await supabase.from("booking_status_history_v2").insert({
    booking_id: bookingId,
    old_status: v2Booking?.status ?? null,
    new_status: status,
    changed_by_user_id: null,
    reason: "host_booking_status_update",
    created_at: new Date().toISOString(),
  } as never);

  if (!thread) {
    if (guestUserId && !skipGuestNotifications) {
      await enqueueNotification(supabase, {
        eventType: notificationEventType,
        channel: "email",
        userId: guestUserId,
        bookingId: String(updated.id ?? bookingId),
        dedupeKey: `${notificationEventType}:${String(updated.id ?? bookingId)}:${status}:email`,
        subject: notificationSubject,
        recipientRole: "guest",
        payload: notificationPayload,
      });

      await enqueueNotification(supabase, {
        eventType: notificationEventType,
        channel: "whatsapp",
        userId: guestUserId,
        bookingId: String(updated.id ?? bookingId),
        dedupeKey: `${notificationEventType}:${String(updated.id ?? bookingId)}:${status}:whatsapp`,
        subject: notificationSubject,
        templateName: status === "rejected" ? "guest_booking_rejected" : "guest_booking_confirmed",
        recipientRole: "guest",
        payload: notificationPayload,
      });
    }

    if (!v2Booking) {
      throw v2BookingError ?? new Error("Booking not found for this listing.");
    }

    return updated as JsonRecord | null;
  }

  if (thread.conversationId) {
    const now = new Date().toISOString();
    const statusMessage = buildHostBookingStatusMessage(status, bookingContext);

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

  if (guestUserId && !skipGuestNotifications) {
    await enqueueNotification(supabase, {
      eventType: notificationEventType,
      channel: "email",
      userId: guestUserId,
      bookingId: String(updated.id ?? bookingId),
      dedupeKey: `${notificationEventType}:${String(updated.id ?? bookingId)}:${status}:email`,
      subject: notificationSubject,
      recipientRole: "guest",
      payload: notificationPayload,
    });

    await enqueueNotification(supabase, {
      eventType: notificationEventType,
      channel: "whatsapp",
      userId: guestUserId,
      bookingId: String(updated.id ?? bookingId),
      dedupeKey: `${notificationEventType}:${String(updated.id ?? bookingId)}:${status}:whatsapp`,
      subject: notificationSubject,
      templateName: status === "rejected" ? "guest_booking_rejected" : "guest_booking_confirmed",
      recipientRole: "guest",
      payload: notificationPayload,
    });
  }

  return updated as JsonRecord | null;
}
