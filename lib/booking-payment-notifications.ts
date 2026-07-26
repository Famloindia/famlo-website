import type { SupabaseClient } from "@supabase/supabase-js";

import { createHostBookingActionLinks } from "@/lib/booking-action-tokens";
import {
  createOrReuseBookingWhatsAppAction,
} from "@/lib/booking-whatsapp-actions";
import { enqueueNotification } from "@/lib/booking-platform";
import { asNumber, asString, type JsonRecord } from "@/lib/platform-utils";
import { getWhatsAppRuntimeConfig } from "@/lib/whatsapp-config";
import {
  resolveEligibleGuestWhatsApp,
  resolveEligibleHostWhatsApp,
} from "@/lib/whatsapp-eligibility";

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

function bookingStayLength(startDate: string | null, endDate: string | null): { nights: number; days: number } {
  if (!startDate || !endDate) return { nights: 0, days: 0 };
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return { nights: 0, days: 0 };
  const nights = Math.max(0, Math.round((end - start) / 86_400_000));
  return { nights, days: nights + 1 };
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
  const whatsappConfig = getWhatsAppRuntimeConfig();
  const eligibleGuestWhatsApp = guestUserId
    ? await resolveEligibleGuestWhatsApp(supabase, guestUserId)
    : null;
  const guestTemplate = input.approvalRequired
    ? whatsappConfig.templates.guestBookingPending
    : whatsappConfig.templates.guestBookingConfirmed;
  if (guestUserId && eligibleGuestWhatsApp && guestTemplate) {
    await enqueueNotification(supabase, {
      eventType: guestEventType,
      channel: "whatsapp",
      userId: guestUserId,
      bookingId,
      dedupeKey: `${guestEventType}:${bookingId}:whatsapp`,
      subject: guestSubject,
      recipientRole: "guest",
      recipientPhone: eligibleGuestWhatsApp.phoneE164,
      templateName: guestTemplate,
      payload: { message: guestMessage },
    });
  }
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
    const eligibleWhatsApp = await resolveEligibleHostWhatsApp(supabase, hostUserId);
    const whatsappAction = eligibleWhatsApp && whatsappConfig.templates.bookingApproval
      ? await createOrReuseBookingWhatsAppAction(supabase, {
          bookingId,
          hostPhone: eligibleWhatsApp.phoneE164,
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
    if (eligibleWhatsApp && whatsappAction && whatsappConfig.templates.bookingApproval) {
      const startDate = asString(input.booking.start_date);
      const endDate = asString(input.booking.end_date) ?? startDate;
      const length = bookingStayLength(startDate, endDate);
      const bookingReference =
        asString(input.booking.booking_reference) ??
        asString(input.booking.reference_code) ??
        `FAM-${bookingId.slice(0, 8).toUpperCase()}`;
      await enqueueNotification(supabase, {
        eventType: "booking_host_action_required",
        channel: "whatsapp",
        userId: hostUserId,
        bookingId,
        dedupeKey: `booking_host_action_required:${bookingId}:whatsapp`,
        subject: "New Famlo booking request needs your approval",
        templateName: whatsappConfig.templates.bookingApproval,
        recipientRole: "host",
        recipientPhone: eligibleWhatsApp.phoneE164,
        payload: {
          action_token: asString(whatsappAction.action_token),
          template_parameters: {
            property_name: hostPropertyLabel,
            booking_reference: bookingReference,
            check_in: startDate ?? "Not set",
            check_out: endDate ?? "Not set",
            nights: String(length.nights),
            days: String(length.days),
            guest_count: String(Math.max(1, asNumber(input.booking.guests_count, 1))),
            booking_amount: formatTemplateAmount(asNumber(input.payment.amount_total)),
            decision_deadline: asString(whatsappAction.expires_at) ?? "Review promptly",
          },
          buttons: [
            { id: whatsappAction.approve_payload, title: "Approve Booking" },
            { id: whatsappAction.reject_payload, title: "Decline Booking" },
          ],
        },
      });
    }
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
}
