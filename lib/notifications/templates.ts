import { getPublicSiteUrl } from "@/lib/site-url";
import { asString, type JsonRecord } from "@/lib/platform-utils";

import type { NotificationMessageContent, NotificationQueueRow } from "@/lib/notifications/types";

function ensureAbsoluteUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (!value.startsWith("/")) return null;
  return `${getPublicSiteUrl()}${value}`;
}

function buildFallbackContent(eventType: string): Pick<NotificationMessageContent, "subject" | "title" | "message"> {
  switch (eventType) {
    case "booking_request":
      return {
        subject: "Your Famlo booking is awaiting host approval",
        title: "Booking Request Received",
        message: "Your payment was received and your Famlo booking is pending host approval.",
      };
    case "booking_confirmed":
      return {
        subject: "Your Famlo booking is confirmed",
        title: "Booking Confirmed",
        message: "Your Famlo booking is confirmed. You can now prepare for your stay.",
      };
    case "booking_rejected":
      return {
        subject: "Your Famlo booking was not accepted",
        title: "Booking Not Accepted",
        message: "This booking was not accepted by the host. Team Famlo can help you find another live home.",
      };
    case "booking_cancelled":
      return {
        subject: "Your Famlo booking cancellation was processed",
        title: "Booking Cancelled",
        message: "Your booking cancellation has been processed.",
      };
    case "booking_cancelled_by_guest":
      return {
        subject: "A guest cancelled their Famlo booking",
        title: "Guest Cancelled Booking",
        message: "A guest cancelled their Famlo booking. The room is open again for new bookings.",
      };
    case "booking_hold_expired":
      return {
        subject: "Your Famlo booking hold expired",
        title: "Booking Hold Expired",
        message: "A pending Famlo booking hold expired, so the dates are open again.",
      };
    case "booking_host_action_required":
      return {
        subject: "New Famlo booking request needs your approval",
        title: "New Booking Request",
        message: "A new Famlo booking request is waiting for your approval.",
      };
    case "host_message_sent":
      return {
        subject: "New Famlo message from your host",
        title: "New Host Message",
        message: "Your host sent you a new message on Famlo.",
      };
    case "guest_message_sent":
      return {
        subject: "New Famlo booking message",
        title: "New Guest Message",
        message: "You received a new booking message on Famlo.",
      };
    case "guest_network_message_sent":
      return {
        subject: "New Famlo guest network message",
        title: "New Guest Network Message",
        message: "You received a new message in your Famlo guest network.",
      };
    case "host_pro_invoice_receipt":
      return {
        subject: "Your Famlo Pro GST Tax Invoice",
        title: "Famlo Pro payment received",
        message: "Your Famlo Pro payment has been received and the GST Tax Invoice cum Payment Receipt is ready.",
      };
    default:
      return {
        subject: "Famlo update",
        title: "Famlo Update",
        message: "A Famlo event requires your attention.",
      };
  }
}

export function buildNotificationContent(row: NotificationQueueRow): NotificationMessageContent {
  const eventType = asString(row.event_type) ?? "notification";
  const payload = (row.payload as JsonRecord | null) ?? {};
  const fallback = buildFallbackContent(eventType);
  const ctaLabel = asString(payload.cta_label);
  const ctaUrl = ensureAbsoluteUrl(asString(payload.cta_url) ?? asString(payload.view_url));
  const templateName = asString(row.template_name) ?? asString(payload.template_name) ?? eventType;

  return {
    subject: asString(row.subject) ?? fallback.subject,
    title: asString(payload.title) ?? asString(row.subject) ?? fallback.title,
    message: asString(payload.message) ?? fallback.message,
    ctaLabel,
    ctaUrl,
    templateName,
  };
}

export function buildWhatsAppBody(content: NotificationMessageContent): string {
  const lines = [content.title, "", content.message];
  if (content.ctaUrl) {
    lines.push("", `Open: ${content.ctaUrl}`);
  }
  return lines.join("\n").trim();
}
