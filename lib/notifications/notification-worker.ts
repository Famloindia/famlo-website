import type { SupabaseClient } from "@supabase/supabase-js";

import {
  attachBookingWhatsAppMessageId,
  parseBookingWhatsAppReplyPayload,
} from "@/lib/booking-whatsapp-actions";
import { renderEmailTemplate } from "@/lib/document-templates";
import {
  sendWhatsAppTemplateNotification,
} from "@/lib/notifications/providers/whatsapp";
import { buildNotificationContent } from "@/lib/notifications/templates";
import type { NotificationDeliveryResult, NotificationQueueRow } from "@/lib/notifications/types";
import { asString, type JsonRecord } from "@/lib/platform-utils";
import { syncHostProInvoiceWhatsappDelivery } from "@/lib/pro-billing/whatsapp";
import { sendEmail } from "@/lib/resend";
import { loadUserProfileCompatibility } from "@/lib/user-profile";
import {
  getBookingTemplateParameterOrder,
  getWhatsAppRuntimeConfig,
  isStagingExplicitWhatsAppDeliveryAllowed,
  type WhatsAppTemplateKind,
} from "@/lib/whatsapp-config";

const MAX_ATTEMPTS = 5;
const DEFAULT_BATCH_SIZE = 25;
const LEASE_SECONDS = 120;

const CLAIM_SELECT =
  "id,event_type,channel,user_id,booking_id,payout_id,subject,payload,scheduled_for,status,processed_at,error_message," +
  "recipient_role,recipient_phone,template_name,provider_message_id,attempts,next_attempt_at,processing_started_at," +
  "lease_expires_at,completed_at,last_error,provider_status,provider_status_at";

function retryDelaySeconds(attempts: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
}

async function claimRows(
  supabase: SupabaseClient,
  batchSize: number
): Promise<NotificationQueueRow[]> {
  const { data, error } = await supabase.rpc("claim_notification_queue_batch", {
    p_batch_size: Math.max(1, Math.min(batchSize, 100)),
    p_lease_seconds: LEASE_SECONDS,
  });
  if (error) throw error;
  return (data ?? []) as NotificationQueueRow[];
}

async function resolveUserContact(
  supabase: SupabaseClient,
  userId: string | null
): Promise<{ email: string | null; phone: string | null }> {
  if (!userId) return { email: null, phone: null };
  const profile = await loadUserProfileCompatibility(supabase, userId);
  return { email: asString(profile?.email), phone: asString(profile?.phone) };
}

async function deliverEmail(
  supabase: SupabaseClient,
  row: NotificationQueueRow
): Promise<NotificationDeliveryResult> {
  const payload = (row.payload as JsonRecord | null) ?? {};
  const contact = await resolveUserContact(supabase, asString(row.user_id));
  const to = asString(payload.to) ?? contact.email;
  if (!to) return { status: "skipped", errorMessage: "Recipient email not found.", retryable: false };
  const content = buildNotificationContent(row);
  const result = await sendEmail({
    to,
    subject: content.subject,
    html: renderEmailTemplate({
      eyebrow: "Famlo Update",
      title: content.title,
      message: content.message,
      ctaLabel: content.ctaLabel ?? undefined,
      ctaUrl: content.ctaUrl ?? undefined,
    }),
  });
  return result.success
    ? { status: "processed", providerMessageId: result.id ?? null, retryable: false }
    : { status: "failed", errorMessage: result.error ?? "Email delivery failed.", retryable: true };
}

function templateKindForEvent(eventType: string): WhatsAppTemplateKind | null {
  if (eventType === "booking_host_action_required") return "bookingApproval";
  if (eventType === "host_whatsapp_test") return "setupConfirmation";
  if (eventType === "booking_request") return "guestBookingPending";
  if (eventType === "booking_confirmed") return "guestBookingConfirmed";
  if (eventType === "booking_rejected") return "guestBookingDeclined";
  if (eventType === "guest_refund_initiated") return "guestRefundInitiated";
  if (eventType === "guest_message_sent") return "guestMessageReceivedHost";
  return null;
}

function orderedBookingVariables(payload: JsonRecord): string[] {
  const parameters =
    payload.template_parameters && typeof payload.template_parameters === "object"
      ? (payload.template_parameters as JsonRecord)
      : {};
  return getBookingTemplateParameterOrder().map((key) => asString(parameters[key]) ?? "");
}

function bookingApprovalButtons(
  payload: JsonRecord
): Array<{ index: number; type: "quick_reply"; payload: string }> | null {
  const rawButtons = Array.isArray(payload.buttons) ? payload.buttons : [];
  const expected = [
    { action: "approve", title: "Approve Booking" },
    { action: "reject", title: "Decline Booking" },
  ] as const;
  const buttons: Array<{ index: number; type: "quick_reply"; payload: string }> = [];
  for (const [index, contract] of expected.entries()) {
    const raw = rawButtons[index];
    const button = raw && typeof raw === "object" ? (raw as JsonRecord) : {};
    const opaquePayload = asString(button.id);
    const title = asString(button.title);
    const parsed = parseBookingWhatsAppReplyPayload(opaquePayload);
    if (!opaquePayload || title !== contract.title || parsed?.action !== contract.action) {
      return null;
    }
    buttons.push({ index, type: "quick_reply", payload: opaquePayload });
  }
  return buttons;
}

async function deliverWhatsApp(
  supabase: SupabaseClient,
  row: NotificationQueueRow
): Promise<NotificationDeliveryResult> {
  const payload = (row.payload as JsonRecord | null) ?? {};
  const phone = asString(row.recipient_phone);
  if (!phone) {
    return {
      status: "failed",
      errorMessage: "Canonical WhatsApp recipient is missing.",
      errorCode: "missing_recipient",
      errorCategory: "recipient",
      retryable: false,
    };
  }
  const eventType = asString(row.event_type) ?? "";
  const kind = templateKindForEvent(eventType);
  if (!kind) {
    return {
      status: "failed",
      errorMessage: "This WhatsApp event has no approved template mapping.",
      errorCode: "template_mapping_missing",
      errorCategory: "configuration",
      retryable: false,
    };
  }
  const config = getWhatsAppRuntimeConfig();
  const stagingExplicitDelivery =
    eventType === "host_whatsapp_test" &&
    isStagingExplicitWhatsAppDeliveryAllowed();
  if (!config.enabled && !stagingExplicitDelivery) {
    return {
      status: "failed",
      errorMessage: "WhatsApp notifications are disabled.",
      errorCode: "provider_not_configured",
      errorCategory: "configuration",
      retryable: false,
    };
  }
  const templateName = config.templates[kind];
  if (!templateName) {
    return {
      status: "failed",
      errorMessage: `The approved ${kind} template is not configured.`,
      errorCode: "template_missing",
      errorCategory: "configuration",
      retryable: false,
    };
  }

  const buttons: Array<{ index: number; type: "quick_reply" | "url"; payload?: string; urlSuffix?: string }> = [];
  if (kind === "bookingApproval") {
    const approvalButtons = bookingApprovalButtons(payload);
    if (!approvalButtons) {
      return {
        status: "failed",
        errorMessage: "Booking approval template buttons do not match the approved contract.",
        errorCode: "booking_buttons_invalid",
        errorCategory: "payload",
        retryable: false,
      };
    }
    buttons.push(...approvalButtons);
  } else if (kind === "guestMessageReceivedHost") {
    const chatUrl = asString(payload.chat_url);
    if (chatUrl) buttons.push({ index: 0, type: "url", urlSuffix: chatUrl });
  }

  const bodyVariables =
    kind === "bookingApproval"
      ? orderedBookingVariables(payload)
      : Array.isArray(payload.template_variables)
        ? payload.template_variables.map((item) => asString(item) ?? "")
        : [];
  const result = await sendWhatsAppTemplateNotification({
    phone,
    templateKind: kind,
    templateName,
    languageCode: config.templateLanguages[kind],
    bodyVariables,
    buttons,
    stagingExplicitDelivery,
  });

  const actionToken = asString(payload.action_token);
  if (result.status === "processed" && actionToken && result.providerMessageId) {
    await attachBookingWhatsAppMessageId(supabase, {
      actionToken,
      providerMessageId: result.providerMessageId,
    });
  }
  return result;
}

async function completeRow(
  supabase: SupabaseClient,
  row: NotificationQueueRow,
  result: NotificationDeliveryResult
): Promise<"processed" | "failed" | "skipped" | "retried"> {
  const rowId = asString(row.id);
  if (!rowId) throw new Error("Claimed notification is missing an ID.");
  const attempts = typeof row.attempts === "number" ? row.attempts : 1;
  const now = new Date();
  const retry = result.status === "failed" && result.retryable === true && attempts < MAX_ATTEMPTS;
  const status = retry ? "retry_scheduled" : result.status;
  const patch: JsonRecord = {
    status,
    lease_expires_at: null,
    processing_started_at: null,
    error_message: result.errorMessage ?? null,
    last_error: result.errorMessage ?? null,
    provider_error_code: result.errorCode ?? null,
    provider_error_category: result.errorCategory ?? null,
  };
  if (retry) {
    patch.next_attempt_at = new Date(now.getTime() + retryDelaySeconds(attempts) * 1000).toISOString();
    patch.processed_at = null;
    patch.completed_at = null;
  } else {
    patch.processed_at = now.toISOString();
    patch.completed_at = now.toISOString();
  }
  if (result.providerMessageId) {
    patch.provider_message_id = result.providerMessageId;
    patch.provider_status = result.providerStatus ?? "submitted";
    patch.provider_status_at = now.toISOString();
  }
  const { error } = await supabase
    .from("notification_queue")
    .update(patch as never)
    .eq("id", rowId)
    .eq("status", "processing");
  if (error) throw error;
  return retry ? "retried" : result.status;
}

export async function processNotificationQueueBatch(
  supabase: SupabaseClient,
  options: { batchSize?: number; maxDurationMs?: number } = {}
): Promise<{ processed: number; failed: number; skipped: number; retried: number; claimed: number }> {
  const rows = await claimRows(supabase, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const deadline = Date.now() + (options.maxDurationMs ?? 20_000);
  const metrics = { processed: 0, failed: 0, skipped: 0, retried: 0, claimed: rows.length };
  for (const row of rows) {
    if (Date.now() >= deadline) break;
    let result: NotificationDeliveryResult;
    try {
      result =
        asString(row.channel) === "email"
          ? await deliverEmail(supabase, row)
          : asString(row.channel) === "whatsapp"
            ? await deliverWhatsApp(supabase, row)
            : { status: "skipped", errorMessage: "Unsupported notification channel.", retryable: false };
    } catch {
      result = {
        status: "failed",
        errorMessage: "Notification worker encountered an internal delivery error.",
        errorCode: "worker_error",
        errorCategory: "internal",
        retryable: true,
      };
    }
    const outcome = await completeRow(supabase, row, result);
    metrics[outcome] += 1;

    const payload = (row.payload as JsonRecord | null) ?? {};
    const invoiceId = asString(payload.invoice_id);
    if (asString(row.event_type) === "host_pro_invoice_receipt" && invoiceId && outcome !== "retried") {
      await syncHostProInvoiceWhatsappDelivery(supabase, {
        invoiceId,
        status: outcome,
        errorMessage: result.errorMessage ?? null,
      });
    }
  }
  return metrics;
}

export const notificationWorkerInternals = {
  retryDelaySeconds,
  templateKindForEvent,
  orderedBookingVariables,
  bookingApprovalButtons,
  claimSelect: CLAIM_SELECT,
};
