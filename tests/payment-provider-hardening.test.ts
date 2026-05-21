import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveProviderEventId,
  storePaymentProviderEvent,
} from "@/lib/finance/provider-event-store";
import {
  buildRazorpayOrderNotes,
  resolveInternalGuestPayableAmount,
} from "@/lib/payment-intent";
import {
  doesGatewayAmountMatchInternalAmount,
  resolveCapturedPaymentFinalizationDecision,
} from "@/lib/payment-booking-finalization";

function createProviderEventSupabase() {
  const rows: Record<string, unknown>[] = [];

  return {
    rows,
    client: {
      from(table: string) {
        if (table !== "payment_provider_events") {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          insert(payload: Record<string, unknown>) {
            return {
              select() {
                return {
                  async single() {
                    const duplicate = rows.find(
                      (row) => row.provider === payload.provider && row.event_id === payload.event_id
                    );
                    if (duplicate) {
                      return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
                    }
                    const row = {
                      id: `event-${rows.length + 1}`,
                      created_at: "2026-05-21T00:00:00.000Z",
                      ...payload,
                    };
                    rows.push(row);
                    return { data: row, error: null };
                  },
                };
              },
            };
          },
          select() {
            return this;
          },
          eq(column: string, value: unknown) {
            const state = (this as any).__state ?? { filters: [] as Array<{ column: string; value: unknown }> };
            state.filters.push({ column, value });
            (this as any).__state = state;
            return this;
          },
          async maybeSingle() {
            const filters = ((this as any).__state?.filters as Array<{ column: string; value: unknown }>) ?? [];
            const row =
              rows.find((candidate) => filters.every((filter) => candidate[filter.column] === filter.value)) ?? null;
            return { data: row, error: null };
          },
        };
      },
    } as any,
  };
}

test("payment provider events dedupe by provider and event id", async () => {
  const { client } = createProviderEventSupabase();

  const first = await storePaymentProviderEvent(client, {
    provider: "RAZORPAY",
    eventId: "evt_1",
    eventType: "payment.captured",
    entityType: "payment",
    entityId: "pay_1",
    rawPayload: { event: "payment.captured" },
    signatureValid: true,
    processingStatus: "received",
  });
  const duplicate = await storePaymentProviderEvent(client, {
    provider: "RAZORPAY",
    eventId: "evt_1",
    eventType: "payment.captured",
    entityType: "payment",
    entityId: "pay_1",
    rawPayload: { event: "payment.captured" },
    signatureValid: true,
    processingStatus: "received",
  });

  assert.equal(first.isDuplicate, false);
  assert.equal(duplicate.isDuplicate, true);
  assert.equal(duplicate.record.eventId, "evt_1");
});

test("provider event id falls back to a deterministic hash when header is missing", () => {
  const rawBody = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1" } } } });

  const first = deriveProviderEventId("RAZORPAY", rawBody, null);
  const second = deriveProviderEventId("RAZORPAY", rawBody, null);

  assert.equal(first, second);
  assert.match(first, /^RAZORPAY:/);
});

test("verify then webhook replay is skipped after booking is already finalized", () => {
  const decision = resolveCapturedPaymentFinalizationDecision({
    paymentStatus: "paid",
    bookingPaymentStatus: "paid",
    bookingStatus: "confirmed",
    providerPaymentStatus: "captured",
    gatewayOrderId: "order_1",
    gatewayPaymentId: "pay_1",
    expectedAmountRupees: 11800,
    providerAmountPaise: 1180000,
  });

  assert.equal(decision, "skip_already_finalized");
});

test("webhook then verify replay is skipped after booking is already finalized", () => {
  const decision = resolveCapturedPaymentFinalizationDecision({
    paymentStatus: "paid",
    bookingPaymentStatus: "paid",
    bookingStatus: "pending_host_approval",
    providerPaymentStatus: "captured",
    gatewayOrderId: "order_1",
    gatewayPaymentId: "pay_1",
    expectedAmountRupees: 11800,
    providerAmountPaise: 1180000,
  });

  assert.equal(decision, "skip_already_finalized");
});

test("out-of-order paid events do not trigger duplicate finalization", () => {
  const decision = resolveCapturedPaymentFinalizationDecision({
    paymentStatus: "paid",
    bookingPaymentStatus: "paid",
    bookingStatus: "checked_in",
    providerPaymentStatus: "paid",
    gatewayOrderId: "order_1",
    gatewayPaymentId: "pay_1",
    expectedAmountRupees: 11800,
    providerAmountPaise: 1180000,
  });

  assert.equal(decision, "skip_already_finalized");
});

test("invalid/missing ids are rejected safely", () => {
  const decision = resolveCapturedPaymentFinalizationDecision({
    paymentStatus: "created",
    bookingPaymentStatus: "pending",
    bookingStatus: "pending",
    providerPaymentStatus: "captured",
    gatewayOrderId: "",
    gatewayPaymentId: "pay_1",
    expectedAmountRupees: 11800,
    providerAmountPaise: 1180000,
  });

  assert.equal(decision, "reject_invalid_ids");
});

test("amount mismatch blocks finalization", () => {
  assert.equal(doesGatewayAmountMatchInternalAmount(11800, 1170000), false);

  const decision = resolveCapturedPaymentFinalizationDecision({
    paymentStatus: "created",
    bookingPaymentStatus: "pending",
    bookingStatus: "pending",
    providerPaymentStatus: "captured",
    gatewayOrderId: "order_1",
    gatewayPaymentId: "pay_1",
    expectedAmountRupees: 11800,
    providerAmountPaise: 1170000,
  });

  assert.equal(decision, "reject_amount_mismatch");
});

test("captured payment finalizes once when state is still pending", () => {
  const decision = resolveCapturedPaymentFinalizationDecision({
    paymentStatus: "created",
    bookingPaymentStatus: "pending",
    bookingStatus: "pending",
    providerPaymentStatus: "captured",
    gatewayOrderId: "order_1",
    gatewayPaymentId: "pay_1",
    expectedAmountRupees: 11800,
    providerAmountPaise: 1180000,
  });

  assert.equal(decision, "finalize_now");
});

test("authorized-only provider payments do not finalize booking", () => {
  const decision = resolveCapturedPaymentFinalizationDecision({
    paymentStatus: "created",
    bookingPaymentStatus: "pending",
    bookingStatus: "pending",
    providerPaymentStatus: "authorized",
    gatewayOrderId: "order_1",
    gatewayPaymentId: "pay_1",
    expectedAmountRupees: 11800,
    providerAmountPaise: 1180000,
  });

  assert.equal(decision, "ignore_not_captured");
});

test("payment intent uses internal guest payable amount and rich Razorpay notes", () => {
  const amount = resolveInternalGuestPayableAmount(10000, {
    guest_payable_amount: 11800,
    guest_total: 11700,
  });
  const notes = buildRazorpayOrderNotes({
    bookingId: "booking-1",
    hostId: "host-1",
    propertyId: "property-1",
    paymentIntentId: "payment-1",
  });

  assert.equal(amount, 11800);
  assert.deepEqual(notes, {
    booking_id: "booking-1",
    payment_intent_id: "payment-1",
    host_id: "host-1",
    property_id: "property-1",
  });
});
