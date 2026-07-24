import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { asString, type JsonRecord } from "@/lib/platform-utils";

const STATUS_RANK: Record<string, number> = {
  submitted: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

export function verifyMetaWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret: string | null;
}): boolean {
  if (!input.appSecret || !input.signatureHeader?.startsWith("sha256=")) return false;
  const supplied = input.signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = createHmac("sha256", input.appSecret).update(input.rawBody, "utf8").digest("hex");
  const suppliedBuffer = Buffer.from(supplied.toLowerCase(), "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export function webhookPayloadDigest(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

export function sanitizeMetaFailure(value: unknown): {
  code: string | null;
  category: string | null;
  reason: string | null;
} {
  const record = value && typeof value === "object" ? (value as JsonRecord) : {};
  const details = record.error_data && typeof record.error_data === "object"
    ? (record.error_data as JsonRecord)
    : {};
  const code = asString(record.code) ?? (typeof record.code === "number" ? String(record.code) : null);
  const category = asString(record.title) ?? asString(record.type);
  const rawReason = asString(details.details) ?? asString(record.message);
  return {
    code,
    category: category?.slice(0, 120) ?? null,
    reason: rawReason?.replace(/\+?\d[\d\s-]{7,}\d/g, "[redacted phone]").slice(0, 500) ?? null,
  };
}

export async function recordWhatsAppWebhookEvent(
  supabase: SupabaseClient,
  input: {
    eventKey: string;
    eventType: "interactive" | "status" | "unsupported";
    providerMessageId?: string | null;
    payloadDigest: string;
  }
): Promise<"recorded" | "duplicate"> {
  const { error } = await supabase.from("whatsapp_webhook_events").insert({
    event_key: input.eventKey,
    event_type: input.eventType,
    provider_message_id: input.providerMessageId ?? null,
    payload_digest: input.payloadDigest,
  } as never);
  if (!error) return "recorded";
  if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
    const { data, error: lookupError } = await supabase
      .from("whatsapp_webhook_events")
      .select("processing_status")
      .eq("event_key", input.eventKey)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (asString(data?.processing_status) === "failed") {
      const { error: retryError } = await supabase
        .from("whatsapp_webhook_events")
        .update({ processing_status: "recorded", processed_at: null } as never)
        .eq("event_key", input.eventKey)
        .eq("processing_status", "failed");
      if (retryError) throw retryError;
      return "recorded";
    }
    return "duplicate";
  }
  throw error;
}

export async function markWhatsAppWebhookEvent(
  supabase: SupabaseClient,
  eventKey: string,
  status: "processed" | "ignored" | "failed"
): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_webhook_events")
    .update({ processing_status: status, processed_at: new Date().toISOString() } as never)
    .eq("event_key", eventKey);
  if (error) throw error;
}

export async function applyWhatsAppDeliveryStatus(
  supabase: SupabaseClient,
  input: {
    providerMessageId: string;
    status: "sent" | "delivered" | "read" | "failed";
    timestamp: string;
    eventId: string;
    failure?: { code: string | null; category: string | null; reason: string | null };
  }
): Promise<"updated" | "ignored" | "not_found"> {
  const { data, error } = await supabase
    .from("notification_queue")
    .select("id,user_id,provider_status,provider_status_at")
    .eq("provider_message_id", input.providerMessageId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return "not_found";

  const currentStatus = asString(data.provider_status);
  const currentRank = currentStatus ? STATUS_RANK[currentStatus] ?? -1 : -1;
  const nextRank = STATUS_RANK[input.status] ?? -1;
  const currentAt = asString(data.provider_status_at);
  if (nextRank < currentRank || (nextRank === currentRank && currentAt && currentAt >= input.timestamp)) {
    return "ignored";
  }

  const failure = input.status === "failed" ? input.failure : undefined;
  const { data: updated, error: updateError } = await supabase
    .from("notification_queue")
    .update({
      provider_status: input.status,
      provider_status_at: input.timestamp,
      provider_event_id: input.eventId,
      provider_error_code: failure?.code ?? null,
      provider_error_category: failure?.category ?? null,
      last_error: failure?.reason ?? null,
      error_message: failure?.reason ?? null,
      ...(input.status === "failed" ? { status: "failed", completed_at: input.timestamp } : {}),
    } as never)
    .eq("id", data.id)
    .or(`provider_status_at.is.null,provider_status_at.lte.${input.timestamp}`)
    .select("id")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) return "ignored";

  const hostUserId = asString(data.user_id);
  if (hostUserId) {
    const { error: settingsError } = await supabase
      .from("host_whatsapp_settings")
      .update({
        last_delivery_status: input.status,
        last_delivery_at: input.timestamp,
        last_delivery_error: failure?.reason ?? null,
      } as never)
      .eq("host_user_id", hostUserId);
    if (settingsError) throw settingsError;
  }
  return "updated";
}
