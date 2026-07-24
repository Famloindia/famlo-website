import type { SupabaseClient } from "@supabase/supabase-js";

import { createHostBookingActionLinks } from "@/lib/booking-action-tokens";
import {
  buildHostApprovalWhatsAppMessage,
  createOrReuseBookingWhatsAppAction,
} from "@/lib/booking-whatsapp-actions";
import { enqueueNotification } from "@/lib/booking-platform";
import { asNumber, asString, type JsonRecord } from "@/lib/platform-utils";
import { loadUserProfileCompatibility } from "@/lib/user-profile";

function firstRecord(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? (first as JsonRecord) : null;
  }
  return value && typeof value === "object" ? (value as JsonRecord) : null;
}
function resolveStayUnitId(booking: JsonRecord): string | null {
  const snapshot = firstRecord(booking.pricing_snapshot);
  return asString(booking.stay_unit_id) ?? asString(snapshot?.stay_unit_id);
}

function formatBookingDateRange(startDate: string | null, endDate: string | null): string {
  if (!startDate) return "the selected dates";
  if (!endDate || endDate === startDate) return startDate;
  return `${startDate} to ${endDate}`;
}

function formatTemplateAmount(value: number): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `INR ${value}`;
  }
}

export async function enqueuePostPaymentBookingNotifications(
  supabase: SupabaseClient,
  input: {
    booking: JsonRecord;
    payment: JsonRecord;
    approvalRequired: boolean;
    source: "payments_verify" | "payments_webhook";
    stayUnitName?: string | null;
  }
): Promise<void> {
  const bookingId = asString(input.booking.id) ?? asString(input.payment.booking_id);
  if (!bookingId) throw new Error("Payment notification orchestration requires a booking ID.");

  const guestUserId = asString(input.booking.user_id);
  const guestEventType = input.approvalRequired ? "booking_request" : "booking_confirmed";
  const guestSubject = input.approvalRequired
    ? "Your Famlo booking is awaiting host approval"
    : "Your Famlo booking is confirmed";
  const guestMessage = input.approvalRequired
    ? "Your payment was received and your Famlo booking is pending host approval."
    : "Your payment was received and your Famlo booking is now confirmed.";

  await enqueueNotification(supabase, {
    eventType: guestEventType,
    channel: "email",
    userId: guestUserId,
    bookingId,
    dedupeKey: `${guestEventType}:${bookingId}`,
    subject: guestSubject,
    recipientRole: "guest",
    payload: { message: guestMessage },
  });
  await enqueueNotification(supabase, {
    eventType: guestEventType,
    channel: "whatsapp",
    userId: guestUserId,
    bookingId,
    dedupeKey: `${guestEventType}:${bookingId}:whatsapp`,
    subject: guestSubject,
    templateName: input.approvalRequired ? "guest_booking_request_received" : "guest_booking_confirmed",
    recipientRole: "guest",
    payload: { message: guestMessage },
  });

  const host = firstRecord(input.booking.hosts);
  const hostUserId = asString(host?.user_id);
  if (!hostUserId) return;

  const stayUnitId = resolveStayUnitId(input.booking);
  let stayUnitName = asString(input.stayUnitName);
  if (!stayUnitName && stayUnitId) {
    const { data, error } = await supabase
      .from("stay_units_v2")
      .select("name")
      .eq("id", stayUnitId)
      .maybeSingle();
    if (error) throw error;
    stayUnitName = asString(data?.name);
  }

  const [guestProfile, hostProfile] = await Promise.all([
    guestUserId ? loadUserProfileCompatibility(supabase, guestUserId) : null,
    loadUserProfileCompatibility(supabase, hostUserId),
  ]);
  const hostPhone = asString(hostProfile?.phone);
  const hostPropertyLabel = asString(host?.display_name) ?? "your Famlo stay";
  const hostListingLabel = stayUnitName ?? hostPropertyLabel;
  const familyId = asString(host?.legacy_family_id);
  const dashboardUrl = familyId
    ? `/partnerslogin/home/dashboard?family=${encodeURIComponent(familyId)}&tab=bookings`
    : "/partnerslogin/home/dashboard?tab=bookings";
  const bookingDateLabel = formatBookingDateRange(
    asString(input.booking.start_date),
    asString(input.booking.end_date) ?? asString(input.booking.start_date)
  );

  if (input.approvalRequired) {
    const whatsappAction = hostPhone
      ? await createOrReuseBookingWhatsAppAction(supabase, {
          bookingId,
          hostPhone,
          familyId,
        })
      : null;
    const actionLinks = await createHostBookingActionLinks(supabase, {
      bookingId,
      familyId,
      hostId: asString(input.booking.host_id),
      hostUserId,
      metadata: { source: input.source },
    });
    const message = `${hostListingLabel} has a paid booking request for ${bookingDateLabel}. Review it and accept or reject it soon.`;

    await enqueueNotification(supabase, {
      eventType: "booking_host_action_required",
      channel: "email",
      userId: hostUserId,
      bookingId,
      dedupeKey: `booking_host_action_required:${bookingId}:email`,
      subject: "New Famlo booking request needs your approval",
      templateName: "host_booking_approval_request",
      recipientRole: "host",
      payload: {
        title: "New Booking Request",
        message,
        cta_label: "Review booking request",
        cta_url: actionLinks?.dashboardUrl ?? dashboardUrl,
        view_url: actionLinks?.dashboardUrl ?? dashboardUrl,
        accept_url: actionLinks?.acceptUrl,
        reject_url: actionLinks?.rejectUrl,
      },
    });
    await enqueueNotification(supabase, {
      eventType: "booking_host_action_required",
      channel: "whatsapp",
      userId: hostUserId,
      bookingId,
      dedupeKey: `booking_host_action_required:${bookingId}:whatsapp`,
      subject: "New Famlo booking request needs your approval",
      templateName: "host_booking_approval_request",
      recipientRole: "host",
      recipientPhone: hostPhone,
      payload: {
        title: "New Booking Request",
        body_text:
          whatsappAction && hostPhone
            ? buildHostApprovalWhatsAppMessage({
                guestName: asString(guestProfile?.name),
                propertyName: hostPropertyLabel,
                roomName: stayUnitName ?? hostListingLabel,
                startDate: asString(input.booking.start_date),
                endDate: asString(input.booking.end_date) ?? asString(input.booking.start_date),
                amountTotal: asNumber(input.payment.amount_total),
              })
            : message,
        message,
        view_url: actionLinks?.dashboardUrl ?? dashboardUrl,
        accept_url: actionLinks?.acceptUrl,
        reject_url: actionLinks?.rejectUrl,
        action_token: asString(whatsappAction?.action_token),
        template_language: process.env.WHATSAPP_HOST_APPROVAL_TEMPLATE_LANGUAGE?.trim() || "en_US",
        template_variables: [
          asString(hostProfile?.name) ?? hostPropertyLabel,
          asString(guestProfile?.name) ?? "Famlo guest",
          hostPropertyLabel,
          stayUnitName ?? hostListingLabel,
          bookingDateLabel,
          formatTemplateAmount(asNumber(input.payment.amount_total)),
        ],
        buttons: whatsappAction
          ? [
              { id: whatsappAction.approve_payload, title: "Approve" },
              { id: whatsappAction.reject_payload, title: "Reject" },
            ]
          : [],
      },
    });
    return;
  }

  const confirmationMessage = `Congratulations. ${hostListingLabel} is booked for ${bookingDateLabel}.`;
  await enqueueNotification(supabase, {
    eventType: "booking_confirmed",
    channel: "email",
    userId: hostUserId,
    bookingId,
    dedupeKey: `booking_confirmed:host:${bookingId}:email`,
    subject: "Your room is booked on Famlo",
    recipientRole: "host",
    payload: {
      title: "Room booked",
      message: confirmationMessage,
      cta_label: "View booking",
      cta_url: dashboardUrl,
      view_url: dashboardUrl,
    },
  });
  await enqueueNotification(supabase, {
    eventType: "booking_confirmed",
    channel: "whatsapp",
    userId: hostUserId,
    bookingId,
    dedupeKey: `booking_confirmed:host:${bookingId}:whatsapp`,
    subject: "Your room is booked on Famlo",
    recipientRole: "host",
    recipientPhone: hostPhone,
    payload: {
      title: "Room booked",
      message: confirmationMessage,
      view_url: dashboardUrl,
    },
  });
}
