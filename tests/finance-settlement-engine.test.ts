import assert from "node:assert/strict";
import test from "node:test";

import { evaluateSettlementEligibility } from "@/lib/finance/settlement-eligibility";

function baseInput() {
  return {
    folioId: "folio-1",
    bookingId: "booking-1",
    reservationId: "reservation-1",
    sourceChannel: "famlo_direct",
    bookingStatus: "completed",
    paymentStatus: "paid",
    guestTotalAmount: 10000,
    hostPayoutAmount: 8400,
    refundTotalAmount: 0,
    folioMetadata: {},
    reservationCheckOutDate: "2026-05-20",
    requiredLineCodes: new Set(["ROOM_CHARGE", "PLATFORM_FEE", "HOST_PAYOUT_PENDING", "GUEST_PAYMENT"]),
    existingActiveSettlementId: null,
    otaIncluded: false,
    requireCheckoutCompleted: true,
  } as const;
}

test("direct paid and completed folio becomes eligible", () => {
  const result = evaluateSettlementEligibility(baseInput());
  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasons, []);
});

test("direct unpaid folio is excluded", () => {
  const result = evaluateSettlementEligibility({
    ...baseInput(),
    paymentStatus: "pending",
  });
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("direct_payment_not_captured"));
});

test("direct cancelled unresolved refund is excluded", () => {
  const result = evaluateSettlementEligibility({
    ...baseInput(),
    bookingStatus: "cancelled",
    paymentStatus: "refund_pending",
  });
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("cancelled_booking"));
  assert.ok(result.reasons.includes("refund_not_resolved"));
});

test("OTA unknown collect mode is excluded", () => {
  const result = evaluateSettlementEligibility({
    ...baseInput(),
    sourceChannel: "BOOKING_COM",
    requiredLineCodes: new Set(["ROOM_CHARGE", "PLATFORM_FEE", "HOST_PAYOUT_PENDING"]),
    folioMetadata: { payment_collect_mode: "UNKNOWN" },
    otaIncluded: true,
  });
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("unknown_payment_collect_mode"));
});

test("OTA collect is excluded when OTA settlements are disabled", () => {
  const result = evaluateSettlementEligibility({
    ...baseInput(),
    sourceChannel: "BOOKING_COM",
    requiredLineCodes: new Set(["ROOM_CHARGE", "PLATFORM_FEE", "HOST_PAYOUT_PENDING"]),
    folioMetadata: { payment_collect_mode: "OTA_COLLECT" },
    otaIncluded: false,
  });
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("ota_settlements_disabled"));
});

test("OTA collect can be eligible when OTA inclusion is enabled and amount is clear", () => {
  const result = evaluateSettlementEligibility({
    ...baseInput(),
    sourceChannel: "BOOKING_COM",
    requiredLineCodes: new Set(["ROOM_CHARGE", "PLATFORM_FEE", "HOST_PAYOUT_PENDING"]),
    folioMetadata: { payment_collect_mode: "OTA_COLLECT" },
    otaIncluded: true,
  });
  assert.equal(result.eligible, true);
});

test("same folio in active settlement is excluded", () => {
  const result = evaluateSettlementEligibility({
    ...baseInput(),
    existingActiveSettlementId: "settlement-1",
  });
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("already_in_active_settlement"));
});

test("FAMLO_COLLECT OTA requires guest payment proof", () => {
  const result = evaluateSettlementEligibility({
    ...baseInput(),
    sourceChannel: "BOOKING_COM",
    requiredLineCodes: new Set(["ROOM_CHARGE", "PLATFORM_FEE", "HOST_PAYOUT_PENDING"]),
    folioMetadata: { payment_collect_mode: "FAMLO_COLLECT" },
    otaIncluded: true,
  });
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("missing_guest_payment_proof"));
});

test("tax-related values stay outside eligibility logic", () => {
  const result = evaluateSettlementEligibility(baseInput());
  assert.equal(result.eligible, true);
  assert.equal(result.isSettlementEligible, true);
});

test("eligibility helper does not trigger payout execution side effects", () => {
  const result = evaluateSettlementEligibility(baseInput());
  assert.equal("provider" in result, false);
  assert.equal("transferReference" in result, false);
});
