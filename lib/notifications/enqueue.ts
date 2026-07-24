import type { SupabaseClient } from "@supabase/supabase-js";

import { asString } from "@/lib/platform-utils";

import type { NotificationEnqueueInput } from "@/lib/notifications/types";

function isDedupeError(error: { code?: string | null; message?: string | null }): boolean {
  return (
    error.code === "23505" ||
    String(error.message ?? "").includes("notification_queue_dedupe_idx") ||
    String(error.message ?? "").toLowerCase().includes("duplicate key")
  );
}

function isSchemaCompatibilityError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("column") || lower.includes("schema cache") || lower.includes("does not exist") || lower.includes("relation");
}

export async function enqueueNotificationRecord(
  supabase: SupabaseClient,
  input: NotificationEnqueueInput
): Promise<"inserted" | "deduped"> {
  const basePayload = {
    event_type: input.eventType,
    channel: input.channel,
    user_id: input.userId ?? null,
    booking_id: input.bookingId ?? null,
    payout_id: input.payoutId ?? null,
    dedupe_key: input.dedupeKey ?? null,
    subject: input.subject ?? null,
    payload: input.payload ?? {},
    scheduled_for: input.scheduledFor ?? new Date().toISOString(),
  };

  const extendedPayload = {
    ...basePayload,
    recipient_role: input.recipientRole ?? null,
    recipient_phone: input.recipientPhone ?? null,
    template_name: input.templateName ?? null,
  };

  let error = (await supabase.from("notification_queue").insert(extendedPayload)).error;
  if (error && isSchemaCompatibilityError(asString(error.message) ?? "")) {
    error = (await supabase.from("notification_queue").insert(basePayload)).error;
  }

  if (!error) {
    return "inserted";
  }

  if (isDedupeError(error)) {
    return "deduped";
  }

  throw error;
}
