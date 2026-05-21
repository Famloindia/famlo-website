import assert from "node:assert/strict";
import test from "node:test";

import { reconcilePayments } from "@/lib/finance/reconciliation/payment-reconciliation";
import { reconcileProviderEventHealth } from "@/lib/finance/reconciliation/provider-event-health";
import { reconcilePayouts } from "@/lib/finance/reconciliation/payout-reconciliation";
import { reconcileRefunds } from "@/lib/finance/reconciliation/refund-reconciliation";

test("clean payment returns no critical issues", () => {
  const issues = reconcilePayments({
    payments: [
      {
        id: "pay-1",
        booking_id: "booking-1",
        gateway: "razorpay",
        status: "paid",
        amount_total: 10500,
        gateway_payment_id: "rzp_pay_1",
        gateway_order_id: "order_1",
        raw_response: { settlement_id: "set_1" },
        created_at: "2026-05-21T00:00:00.000Z",
      },
    ],
    bookings: [
      {
        id: "booking-1",
        payment_id: "pay-1",
        payment_status: "paid",
        total_price: 10500,
        pricing_snapshot: { guest_payable_amount: 10500 },
      },
    ],
    paymentIntents: [
      {
        payment_id: "pay-1",
        booking_id: "booking-1",
        provider: "razorpay",
        provider_order_id: "order_1",
      },
    ],
    providerEvents: [
      {
        provider: "RAZORPAY",
        entity_id: "rzp_pay_1",
        event_type: "payment.captured",
        signature_valid: true,
        processing_status: "processed",
      },
    ],
    folioLines: [{ booking_id: "booking-1", line_code: "GUEST_PAYMENT", source_event_id: "pay-1" }],
  });

  assert.equal(issues.filter((issue) => issue.severity === "critical").length, 0);
});

test("amount mismatch returns critical issue", () => {
  const issues = reconcilePayments({
    payments: [
      {
        id: "pay-1",
        booking_id: "booking-1",
        gateway: "razorpay",
        status: "paid",
        amount_total: 10000,
        gateway_payment_id: "rzp_pay_1",
        gateway_order_id: "order_1",
      },
    ],
    bookings: [
      {
        id: "booking-1",
        payment_id: "pay-1",
        payment_status: "paid",
        total_price: 10500,
        pricing_snapshot: { guest_payable_amount: 10500 },
      },
    ],
    paymentIntents: [{ payment_id: "pay-1", booking_id: "booking-1" }],
    providerEvents: [{ provider: "RAZORPAY", entity_id: "rzp_pay_1", processing_status: "processed" }],
    folioLines: [{ booking_id: "booking-1", line_code: "GUEST_PAYMENT" }],
  });

  assert.equal(issues.some((issue) => issue.reasonCode === "captured_payment_amount_mismatch" && issue.severity === "critical"), true);
});

test("duplicate GUEST_PAYMENT proof returns critical issue", () => {
  const issues = reconcilePayments({
    payments: [
      {
        id: "pay-1",
        booking_id: "booking-1",
        gateway: "razorpay",
        status: "paid",
        amount_total: 10500,
        gateway_payment_id: "rzp_pay_1",
      },
    ],
    bookings: [
      {
        id: "booking-1",
        payment_id: "pay-1",
        payment_status: "paid",
        total_price: 10500,
        pricing_snapshot: { guest_payable_amount: 10500 },
      },
    ],
    paymentIntents: [{ payment_id: "pay-1", booking_id: "booking-1" }],
    providerEvents: [{ provider: "RAZORPAY", entity_id: "rzp_pay_1", processing_status: "processed" }],
    folioLines: [
      { booking_id: "booking-1", line_code: "GUEST_PAYMENT" },
      { booking_id: "booking-1", line_code: "GUEST_PAYMENT" },
    ],
  });

  assert.equal(issues.some((issue) => issue.reasonCode === "duplicate_guest_payment_proof_lines" && issue.severity === "critical"), true);
});

test("approved refund without attempt returns warning", () => {
  const issues = reconcileRefunds({
    refundRequests: [
      {
        id: "req-1",
        booking_id: "booking-1",
        refund_amount: 10500,
        refund_base_amount: 10000,
        refund_gst_amount: 500,
        status: "approved",
        created_at: "2026-05-18T00:00:00.000Z",
      },
    ],
    refundAttempts: [],
    refunds: [],
    folioLines: [],
    creditNotes: [],
    taxMode: "PENDING_COMPLIANCE",
    nowIso: "2026-05-21T12:00:00.000Z",
  });

  assert.equal(issues.some((issue) => issue.reasonCode === "approved_refund_missing_attempt" && issue.severity === "warning"), true);
});

test("processed refund without proof line returns critical issue", () => {
  const issues = reconcileRefunds({
    refundRequests: [
      {
        id: "req-1",
        booking_id: "booking-1",
        refund_amount: 10500,
        refund_base_amount: 10000,
        refund_gst_amount: 500,
        status: "processed",
      },
    ],
    refundAttempts: [
      {
        id: "attempt-1",
        refund_request_id: "req-1",
        provider: "razorpay",
        provider_refund_id: "rfnd_1",
        status: "processed",
      },
    ],
    refunds: [
      {
        id: "refund-1",
        booking_id: "booking-1",
        provider: "razorpay",
        provider_refund_id: "rfnd_1",
        status: "processed",
        created_at: "2026-05-21T00:00:00.000Z",
      },
    ],
    folioLines: [],
    creditNotes: [],
    taxMode: "PENDING_COMPLIANCE",
  });

  assert.equal(issues.some((issue) => issue.reasonCode === "processed_refund_missing_proof_line" && issue.severity === "critical"), true);
});

test("failed refund marked processed returns critical issue", () => {
  const issues = reconcileRefunds({
    refundRequests: [
      {
        id: "req-1",
        booking_id: "booking-1",
        refund_amount: 10500,
        refund_base_amount: 10000,
        refund_gst_amount: 500,
        status: "processed",
      },
    ],
    refundAttempts: [
      {
        id: "attempt-1",
        refund_request_id: "req-1",
        provider: "razorpay",
        provider_refund_id: "rfnd_1",
        status: "processed",
      },
    ],
    refunds: [
      {
        id: "refund-1",
        booking_id: "booking-1",
        provider: "razorpay",
        provider_refund_id: "rfnd_1",
        status: "failed",
      },
    ],
    folioLines: [],
    creditNotes: [],
    taxMode: "PENDING_COMPLIANCE",
  });

  assert.equal(issues.some((issue) => issue.reasonCode === "failed_refund_marked_processed" && issue.severity === "critical"), true);
});

test("paid settlement without processed payout returns critical issue", () => {
  const issues = reconcilePayouts({
    settlements: [
      {
        id: "settlement-1",
        host_id: "host-1",
        status: "paid",
        net_payable_amount: 8400,
        created_at: "2026-05-21T00:00:00.000Z",
      },
    ],
    payoutExecutions: [],
    payoutAccounts: [{ host_id: "host-1", provider: "RAZORPAYX", is_active: true }],
    refundRequests: [],
    settlementLineItems: [],
    providerEvents: [],
  });

  assert.equal(issues.some((issue) => issue.reasonCode === "paid_settlement_missing_processed_payout" && issue.severity === "critical"), true);
});

test("reversed payout with paid settlement returns critical issue", () => {
  const issues = reconcilePayouts({
    settlements: [
      {
        id: "settlement-1",
        host_id: "host-1",
        status: "paid",
        net_payable_amount: 8400,
      },
    ],
    payoutExecutions: [
      {
        id: "exec-1",
        settlement_id: "settlement-1",
        provider: "RAZORPAYX",
        provider_payout_id: "pout_1",
        amount: 8400,
        status: "reversed",
      },
    ],
    payoutAccounts: [{ host_id: "host-1", provider: "RAZORPAYX", is_active: true }],
    refundRequests: [],
    settlementLineItems: [],
    providerEvents: [],
  });

  assert.equal(issues.some((issue) => issue.reasonCode === "reversed_payout_marked_paid" && issue.severity === "critical"), true);
});

test("invalid signature provider events appear in health report", () => {
  const report = reconcileProviderEventHealth({
    providerEvents: [
      {
        id: "evt-1",
        provider: "RAZORPAY",
        event_id: "evt-1",
        entity_id: "pay_1",
        event_type: "payment.captured",
        signature_valid: false,
        processing_status: "invalid_signature",
        created_at: "2026-05-21T00:00:00.000Z",
      },
    ],
  });

  assert.equal(report.health.invalidSignatureCount, 1);
  assert.equal(report.issues.some((issue) => issue.reasonCode === "invalid_signature_event"), true);
});

test("tax credit note missing is not critical under PENDING_COMPLIANCE", () => {
  const issues = reconcileRefunds({
    refundRequests: [
      {
        id: "req-1",
        booking_id: "booking-1",
        refund_amount: 10500,
        refund_base_amount: 10000,
        refund_gst_amount: 500,
        status: "processed",
      },
    ],
    refundAttempts: [
      {
        id: "attempt-1",
        refund_request_id: "req-1",
        provider: "razorpay",
        provider_refund_id: "rfnd_1",
        status: "processed",
      },
    ],
    refunds: [
      {
        id: "refund-1",
        booking_id: "booking-1",
        provider: "razorpay",
        provider_refund_id: "rfnd_1",
        status: "processed",
        created_at: "2026-05-21T00:00:00.000Z",
      },
    ],
    folioLines: [{ booking_id: "booking-1", line_code: "REFUND" }],
    creditNotes: [],
    taxMode: "PENDING_COMPLIANCE",
  });

  const issue = issues.find((candidate) => candidate.reasonCode === "credit_note_missing_under_tax_lock");
  assert.equal(issue?.severity, "info");
});
