import assert from "node:assert/strict";
import test from "node:test";

import { resolveOtaPaymentCollectMode } from "@/lib/channel-booking-normalization";
import { buildFolioLineIdempotencyKey, planFinanceEventContract } from "@/lib/finance/folio-event-pipeline";
import { isDirectSourceChannel, resolveOtaSettlementDiagnostics } from "@/lib/finance/folio-line-writer";

test("buildFolioLineIdempotencyKey is deterministic for the same input", () => {
  const left = buildFolioLineIdempotencyKey({
    bookingId: "booking-1",
    eventType: "PAYMENT_CAPTURED",
    sourceEventId: "pay_123",
    lineCode: "GUEST_PAYMENT",
    calculationVersion: "batch2-direct-folio-v1",
  });

  const right = buildFolioLineIdempotencyKey({
    bookingId: "booking-1",
    eventType: "PAYMENT_CAPTURED",
    sourceEventId: "pay_123",
    lineCode: "GUEST_PAYMENT",
    calculationVersion: "batch2-direct-folio-v1",
  });

  assert.equal(left, right);
});

test("different line codes produce different idempotency keys", () => {
  const paymentLine = buildFolioLineIdempotencyKey({
    bookingId: "booking-1",
    eventType: "REFUND_CREATED",
    sourceEventId: "refund_123",
    lineCode: "REFUND",
    calculationVersion: "batch2-direct-folio-v1",
  });

  const adjustmentLine = buildFolioLineIdempotencyKey({
    bookingId: "booking-1",
    eventType: "REFUND_CREATED",
    sourceEventId: "refund_123",
    lineCode: "ADJUSTMENT",
    calculationVersion: "batch2-direct-folio-v1",
  });

  assert.notEqual(paymentLine, adjustmentLine);
});

test("planFinanceEventContract creates direct booking proof-line plan", () => {
  const result = planFinanceEventContract({
    bookingId: "booking-1",
    eventType: "BOOKING_CREATED",
    sourceEventId: "booking-1",
    calculationVersion: "batch2-direct-folio-v1",
    bookingAmount: 10000,
    platformFeeAmount: 1600,
    hostPayoutAmount: 8400,
    sourceChannel: "famlo_direct",
  });

  assert.deepEqual(
    result.plannedLines.map((line) => line.lineCode),
    ["ROOM_CHARGE", "PLATFORM_FEE", "HOST_PAYOUT_PENDING"]
  );
});

test("isDirectSourceChannel recognizes direct values and rejects OTA", () => {
  assert.equal(isDirectSourceChannel("famlo_direct"), true);
  assert.equal(isDirectSourceChannel("direct"), true);
  assert.equal(isDirectSourceChannel("BOOKING_COM"), false);
});

test("OTA payment collect mode resolves known buckets", () => {
  assert.equal(resolveOtaPaymentCollectMode("ota prepaid"), "OTA_COLLECT");
  assert.equal(resolveOtaPaymentCollectMode("pay_at_hotel"), "PROPERTY_COLLECT");
  assert.equal(resolveOtaPaymentCollectMode("famlo direct collect"), "FAMLO_COLLECT");
  assert.equal(resolveOtaPaymentCollectMode(""), "UNKNOWN");
});

test("OTA import plan does not add guest payment by default", () => {
  const result = planFinanceEventContract({
    bookingId: "ota-1",
    eventType: "OTA_BOOKING_IMPORTED",
    sourceEventId: "rev-1",
    calculationVersion: "batch3-ota-folio-v1",
    bookingAmount: 12000,
    sourceChannel: "BOOKING_COM",
    paymentCollectMode: "OTA_COLLECT",
  });

  assert.deepEqual(
    result.plannedLines.map((line) => line.lineCode),
    ["ROOM_CHARGE", "PLATFORM_FEE", "HOST_PAYOUT_PENDING"]
  );
});

test("OTA modification plan creates only adjustment proof line", () => {
  const result = planFinanceEventContract({
    bookingId: "ota-1",
    eventType: "OTA_BOOKING_MODIFIED",
    sourceEventId: "rev-2",
    calculationVersion: "batch3-ota-folio-v1",
    adjustmentAmount: -1500,
    sourceChannel: "BOOKING_COM",
    paymentCollectMode: "OTA_COLLECT",
  });

  assert.deepEqual(result.plannedLines.map((line) => line.lineCode), ["ADJUSTMENT"]);
  assert.equal(result.plannedLines[0]?.direction, "credit");
});

test("UNKNOWN OTA collect mode is marked not settlement eligible", () => {
  const diagnostics = resolveOtaSettlementDiagnostics({
    id: "ota-unknown",
    source_channel: "BOOKING_COM",
    pricing_snapshot: {
      channel_user_id_mode: "external_ota_guest",
      payment_collect_mode: "UNKNOWN",
    },
  });

  assert.equal(diagnostics.paymentCollectMode, "UNKNOWN");
  assert.equal(diagnostics.isSettlementEligible, false);
  assert.equal(diagnostics.settlementBlockedReason, "unknown_payment_collect_mode");
});

test("Direct booking regression plan remains unchanged", () => {
  const result = planFinanceEventContract({
    bookingId: "direct-1",
    eventType: "BOOKING_CREATED",
    sourceEventId: "direct-1",
    calculationVersion: "batch2-direct-folio-v1",
    bookingAmount: 8000,
    platformFeeAmount: 1280,
    hostPayoutAmount: 6720,
    sourceChannel: "famlo_direct",
  });

  assert.deepEqual(
    result.plannedLines.map((line) => line.lineCode),
    ["ROOM_CHARGE", "PLATFORM_FEE", "HOST_PAYOUT_PENDING"]
  );
});
