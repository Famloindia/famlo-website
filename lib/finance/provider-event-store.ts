import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  PaymentProviderEventProcessingStatus,
  PaymentProviderEventRecord,
  PaymentProviderName,
} from "@/lib/finance/provider-contracts";

type JsonRecord = Record<string, unknown>;

type ProviderEventStoreInput = {
  provider: PaymentProviderName;
  eventId: string;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  rawPayload: JsonRecord;
  signatureValid: boolean;
  processingStatus: PaymentProviderEventProcessingStatus;
  processedAt?: string | null;
  errorMessage?: string | null;
};

type ProviderEventStoreResult = {
  record: PaymentProviderEventRecord;
  isDuplicate: boolean;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code?: string }).code : "";
  return code === "23505";
}

function mapRow(row: Record<string, unknown>): PaymentProviderEventRecord {
  return {
    id: String(row.id ?? ""),
    provider: String(row.provider ?? "RAZORPAY") as PaymentProviderName,
    eventId: String(row.event_id ?? ""),
    eventType: String(row.event_type ?? ""),
    entityType: asString(row.entity_type),
    entityId: asString(row.entity_id),
    rawPayload: (row.raw_payload as JsonRecord | null) ?? {},
    signatureValid: row.signature_valid === true,
    processingStatus: String(row.processing_status ?? "received") as PaymentProviderEventProcessingStatus,
    processingAttempts: Number(row.processing_attempts ?? 0),
    processedAt: asString(row.processed_at),
    errorMessage: asString(row.error_message),
    createdAt: String(row.created_at ?? ""),
  };
}

export function safeParseProviderPayload(rawBody: string): JsonRecord {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as JsonRecord;
    }
    return { raw_body: rawBody };
  } catch (error) {
    return {
      raw_body: rawBody,
      parse_error: error instanceof Error ? error.message : "Unable to parse provider payload.",
    };
  }
}

export function deriveProviderEventId(
  provider: PaymentProviderName,
  rawBody: string,
  headerEventId?: string | null
): string {
  const normalizedHeader = asString(headerEventId);
  if (normalizedHeader) return normalizedHeader;
  return `${provider}:${crypto.createHash("sha256").update(rawBody).digest("hex")}`;
}

export async function storePaymentProviderEvent(
  supabase: SupabaseClient,
  input: ProviderEventStoreInput
): Promise<ProviderEventStoreResult> {
  const payload = {
    provider: input.provider,
    event_id: input.eventId,
    event_type: input.eventType,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    raw_payload: input.rawPayload,
    signature_valid: input.signatureValid,
    processing_status: input.processingStatus,
    processing_attempts: 1,
    processed_at: input.processedAt ?? null,
    error_message: input.errorMessage ?? null,
    updated_at: new Date().toISOString(),
  };

  const insertResult = await supabase
    .from("payment_provider_events")
    .insert(payload)
    .select("*")
    .single();

  if (!insertResult.error && insertResult.data) {
    return {
      record: mapRow(insertResult.data as Record<string, unknown>),
      isDuplicate: false,
    };
  }

  if (!isUniqueViolation(insertResult.error)) {
    throw insertResult.error;
  }

  const existingResult = await supabase
    .from("payment_provider_events")
    .select("*")
    .eq("provider", input.provider)
    .eq("event_id", input.eventId)
    .maybeSingle();

  if (existingResult.error) throw existingResult.error;
  if (!existingResult.data) {
    throw insertResult.error;
  }

  const existingRecord = mapRow(existingResult.data as Record<string, unknown>);
  if (existingRecord.processingStatus === "failed" && input.signatureValid) {
    const { error: retryUpdateError } = await supabase
      .from("payment_provider_events")
      .update({
        processing_attempts: existingRecord.processingAttempts + 1,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("provider", input.provider)
      .eq("event_id", input.eventId);
    if (retryUpdateError) throw retryUpdateError;
  }

  return {
    record: existingRecord,
    isDuplicate: true,
  };
}

export async function updatePaymentProviderEventStatus(
  supabase: SupabaseClient,
  input: {
    provider: PaymentProviderName;
    eventId: string;
    processingStatus: PaymentProviderEventProcessingStatus;
    processedAt?: string | null;
    errorMessage?: string | null;
  }
): Promise<void> {
  const { error } = await supabase
    .from("payment_provider_events")
    .update({
      processing_status: input.processingStatus,
      processed_at: input.processedAt ?? null,
      error_message: input.errorMessage ?? null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("provider", input.provider)
    .eq("event_id", input.eventId);

  if (error) throw error;
}
