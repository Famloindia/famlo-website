import type { JsonRecord } from "@/lib/platform-utils";

export type NotificationChannel = "email" | "whatsapp" | "sms" | "in_app" | string;
export type NotificationQueueStatus = "pending" | "processed" | "failed" | "skipped";
export type NotificationRecipientRole = "host" | "guest" | "admin" | "system";

export interface NotificationEnqueueInput {
  eventType: string;
  channel: NotificationChannel;
  userId?: string | null;
  bookingId?: string | null;
  payoutId?: string | null;
  dedupeKey?: string | null;
  subject?: string | null;
  payload?: JsonRecord;
  scheduledFor?: string | null;
  recipientRole?: NotificationRecipientRole | null;
  recipientPhone?: string | null;
  templateName?: string | null;
}

export interface NotificationQueueRow extends JsonRecord {
  id?: string | null;
  event_type?: string | null;
  channel?: string | null;
  status?: string | null;
  user_id?: string | null;
  booking_id?: string | null;
  payout_id?: string | null;
  dedupe_key?: string | null;
  subject?: string | null;
  payload?: JsonRecord | null;
  scheduled_for?: string | null;
  processed_at?: string | null;
  error_message?: string | null;
  recipient_role?: string | null;
  recipient_phone?: string | null;
  template_name?: string | null;
  provider_message_id?: string | null;
  attempts?: number | null;
}

export interface NotificationMessageContent {
  subject: string;
  title: string;
  message: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  templateName?: string | null;
}

export interface NotificationDeliveryResult {
  status: Extract<NotificationQueueStatus, "processed" | "failed" | "skipped">;
  providerMessageId?: string | null;
  errorMessage?: string | null;
}
