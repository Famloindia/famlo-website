import type { SupabaseClient } from "@supabase/supabase-js";

import { renderEmailTemplate } from "@/lib/document-templates";
import { attachBookingWhatsAppMessageId } from "@/lib/booking-whatsapp-actions";
import { loadUserProfileCompatibility } from "@/lib/user-profile";
import { asString, type JsonRecord } from "@/lib/platform-utils";
import { sendEmail } from "@/lib/resend";

import {
  sendWhatsAppInteractiveButtons,
  sendWhatsAppNotification,
  sendWhatsAppTemplateNotification,
} from "@/lib/notifications/providers/whatsapp";
import { buildNotificationContent, buildWhatsAppBody } from "@/lib/notifications/templates";
import type { NotificationDeliveryResult, NotificationQueueRow } from "@/lib/notifications/types";

const BASE_SELECT =
  "id,event_type,channel,user_id,booking_id,payout_id,subject,payload,scheduled_for,status,processed_at,error_message";
const EXTENDED_SELECT =
  `${BASE_SELECT},recipient_role,recipient_phone,template_name,provider_message_id,attempts`;

function isSchemaCompatibilityError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("column") || lower.includes("schema cache") || lower.includes("does not exist") || lower.includes("relation");
}

async function loadPendingNotificationRows(
  supabase: SupabaseClient,
  now: string
): Promise<NotificationQueueRow[]> {
  const extendedResult = await supabase
    .from("notification_queue")
    .select(EXTENDED_SELECT)
    .eq("status", "pending")
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(50);

  if (extendedResult.error && isSchemaCompatibilityError(extendedResult.error.message)) {
    const fallbackResult = await supabase
      .from("notification_queue")
      .select(BASE_SELECT)
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(50);

    if (fallbackResult.error) {
      throw fallbackResult.error;
    }

    return (fallbackResult.data ?? []) as NotificationQueueRow[];
  }

  if (extendedResult.error) {
    throw extendedResult.error;
  }

  return (extendedResult.data ?? []) as NotificationQueueRow[];
}

async function resolveUserContact(
  supabase: SupabaseClient,
  userId: string | null
): Promise<{ email: string | null; phone: string | null }> {
  if (!userId) {
    return { email: null, phone: null };
  }

  const profile = await loadUserProfileCompatibility(supabase, userId);
  return {
    email: asString(profile?.email),
    phone: asString(profile?.phone),
  };
}

async function deliverEmailNotification(
  supabase: SupabaseClient,
  row: NotificationQueueRow
): Promise<NotificationDeliveryResult> {
  const payload = (row.payload as JsonRecord | null) ?? {};
  const directTo = asString(payload.to);
  const userContact = await resolveUserContact(supabase, asString(row.user_id));
  const emailTo = directTo ?? userContact.email;

  if (!emailTo) {
    return {
      status: "skipped",
      errorMessage: "Recipient email not found.",
    };
  }

  const content = buildNotificationContent(row);
  const emailResult = await sendEmail({
    to: emailTo,
    subject: content.subject,
    html: renderEmailTemplate({
      eyebrow: "Famlo Update",
      title: content.title,
      message: content.message,
      ctaLabel: content.ctaLabel ?? undefined,
      ctaUrl: content.ctaUrl ?? undefined,
    }),
  });

  if (!emailResult.success) {
    return {
      status: "failed",
      errorMessage: emailResult.error ?? "Email delivery failed.",
    };
  }

  return {
    status: "processed",
    providerMessageId: emailResult.id ?? null,
  };
}

async function deliverWhatsAppNotification(
  supabase: SupabaseClient,
  row: NotificationQueueRow
): Promise<NotificationDeliveryResult> {
  const payload = (row.payload as JsonRecord | null) ?? {};
  const directPhone = asString(payload.phone) ?? asString(row.recipient_phone);
  const userContact = await resolveUserContact(supabase, asString(row.user_id));
  const phone = directPhone ?? userContact.phone;

  if (!phone) {
    return {
      status: "skipped",
      errorMessage: "Recipient phone not found.",
    };
  }

  const content = buildNotificationContent(row);
  const interactiveButtons = Array.isArray(payload.buttons)
    ? payload.buttons
        .map((button) => {
          const record = button as JsonRecord;
          const id = asString(record.id);
          const title = asString(record.title);
          if (!id || !title) return null;
          return { id, title };
        })
        .filter((button): button is { id: string; title: string } => Boolean(button))
    : [];
  const templateName = asString(row.template_name);
  const templateVariables = Array.isArray(payload.template_variables)
    ? payload.template_variables
        .map((value) => asString(value))
        .filter((value): value is string => Boolean(value))
    : [];

  if (templateName === "host_booking_approval_request" && interactiveButtons.length >= 2 && templateVariables.length >= 6) {
    const result = await sendWhatsAppTemplateNotification({
      phone,
      templateName,
      languageCode: asString(payload.template_language) ?? "en",
      bodyVariables: templateVariables.slice(0, 6),
      quickReplyButtons: interactiveButtons.slice(0, 2).map((button, index) => ({
        index,
        payload: button.id,
      })),
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

  if (interactiveButtons.length > 0) {
    const result = await sendWhatsAppInteractiveButtons({
      phone,
      bodyText: asString(payload.body_text) ?? buildWhatsAppBody(content),
      buttons: interactiveButtons,
      templateName: content.templateName,
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

  const actionLines = [
    asString(payload.accept_url) ? `Accept: ${asString(payload.accept_url)}` : null,
    asString(payload.reject_url) ? `Reject: ${asString(payload.reject_url)}` : null,
  ].filter((value): value is string => Boolean(value));

  return sendWhatsAppNotification({
    phone,
    message: [buildWhatsAppBody(content), ...actionLines].join(actionLines.length > 0 ? "\n\n" : ""),
    templateName: content.templateName,
  });
}

async function updateNotificationRow(
  supabase: SupabaseClient,
  rowId: string,
  patch: {
    status: "processed" | "failed" | "skipped";
    processedAt: string;
    errorMessage?: string | null;
    providerMessageId?: string | null;
    attempts?: number | null;
  }
): Promise<void> {
  const extendedUpdate = {
    status: patch.status,
    processed_at: patch.processedAt,
    error_message: patch.errorMessage ?? null,
    provider_message_id: patch.providerMessageId ?? null,
    ...(typeof patch.attempts === "number" ? { attempts: patch.attempts } : {}),
  };

  let error = (
    await supabase
      .from("notification_queue")
      .update(extendedUpdate as never)
      .eq("id", rowId)
  ).error;

  if (error && isSchemaCompatibilityError(error.message)) {
    const fallbackUpdate = {
      status: patch.status,
      processed_at: patch.processedAt,
      error_message: patch.errorMessage ?? null,
    };
    error = (
      await supabase
        .from("notification_queue")
        .update(fallbackUpdate as never)
        .eq("id", rowId)
    ).error;
  }

  if (error) {
    throw error;
  }
}

async function handleNotificationRow(
  supabase: SupabaseClient,
  row: NotificationQueueRow,
  now: string
): Promise<NotificationDeliveryResult> {
  const channel = asString(row.channel) ?? "email";
  const nextAttempts = typeof row.attempts === "number" && Number.isFinite(row.attempts) ? row.attempts + 1 : 1;

  if (channel === "email") {
    const result = await deliverEmailNotification(supabase, row);
    await updateNotificationRow(supabase, asString(row.id) ?? "", {
      status: result.status,
      processedAt: now,
      errorMessage: result.errorMessage ?? null,
      providerMessageId: result.providerMessageId ?? null,
      attempts: nextAttempts,
    });
    return result;
  }

  if (channel === "whatsapp") {
    const result = await deliverWhatsAppNotification(supabase, row);
    await updateNotificationRow(supabase, asString(row.id) ?? "", {
      status: result.status,
      processedAt: now,
      errorMessage: result.errorMessage ?? null,
      providerMessageId: result.providerMessageId ?? null,
      attempts: nextAttempts,
    });
    return result;
  }

  const skipped: NotificationDeliveryResult = {
    status: "skipped",
    errorMessage: `Notification channel '${channel}' is not supported yet.`,
  };
  await updateNotificationRow(supabase, asString(row.id) ?? "", {
    status: skipped.status,
    processedAt: now,
    errorMessage: skipped.errorMessage,
    attempts: nextAttempts,
  });
  return skipped;
}

export async function processNotificationQueueBatch(
  supabase: SupabaseClient
): Promise<{ processed: number; failed: number; skipped: number }> {
  const now = new Date().toISOString();
  const rows = await loadPendingNotificationRows(supabase, now);

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const rowId = asString(row.id);
    if (!rowId) continue;

    try {
      const result = await handleNotificationRow(supabase, row, now);
      if (result.status === "processed") {
        processed += 1;
      } else if (result.status === "skipped") {
        skipped += 1;
      } else {
        failed += 1;
      }
    } catch (notificationError) {
      await updateNotificationRow(supabase, rowId, {
        status: "failed",
        processedAt: now,
        errorMessage: notificationError instanceof Error ? notificationError.message : "Unknown notification error",
        attempts:
          typeof row.attempts === "number" && Number.isFinite(row.attempts) ? row.attempts + 1 : 1,
      });
      failed += 1;
    }
  }

  return { processed, failed, skipped };
}
