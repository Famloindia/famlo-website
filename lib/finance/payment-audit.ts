import type { SupabaseClient } from "@supabase/supabase-js";

import type { PaymentEventAuditInput, PaymentIntentAuditInput } from "@/lib/finance/types";

export async function upsertPaymentIntentAudit(
  supabase: SupabaseClient,
  input: PaymentIntentAuditInput
): Promise<void> {
  try {
    await supabase.from("payment_intents").upsert(
      {
        booking_id: input.bookingId,
        payment_id: input.paymentId,
        provider: input.provider,
        amount_total: input.amountTotal,
        currency: input.currency,
        provider_order_id: input.providerOrderId ?? null,
        idempotency_key: input.idempotencyKey,
        status: input.status,
        metadata: input.metadata ?? {},
      },
      { onConflict: "idempotency_key" }
    );
  } catch (error) {
    console.error("[finance] payment_intents audit insert failed:", error);
  }
}

export async function appendPaymentEventAudit(
  supabase: SupabaseClient,
  input: PaymentEventAuditInput
): Promise<void> {
  try {
    await supabase.from("payment_events").upsert(
      {
        payment_id: input.paymentId,
        payment_intent_id: input.paymentIntentId ?? null,
        provider: input.provider,
        event_name: input.eventName,
        provider_event_id: input.providerEventId ?? null,
        idempotency_key: input.idempotencyKey,
        payload: input.payload,
        processing_status: input.processingStatus,
        received_at: new Date().toISOString(),
      },
      { onConflict: "idempotency_key" }
    );
  } catch (error) {
    console.error("[finance] payment_events audit insert failed:", error);
  }
}
