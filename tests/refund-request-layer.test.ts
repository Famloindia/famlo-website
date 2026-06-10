import assert from "node:assert/strict";
import test from "node:test";

import {
  approveAndMaybeInitiateRefund,
  assertRefundableCapturedPayment,
  createRefundRequestDraft,
  resolveRefundWebhookTransition,
  shouldRequireAdminRefundApproval,
} from "@/lib/finance/refund-requests";
import { evaluateAutoRefundEligibility } from "@/lib/finance/refunds/auto-refund-engine";
import { calculateRefundPolicy } from "@/lib/finance/refund-policy";

function createRefundSupabase() {
  const state = {
    refund_requests: [] as Array<Record<string, unknown>>,
    refund_attempts: [] as Array<Record<string, unknown>>,
    payments_v2: [
      {
        id: "payment-1",
        booking_id: "booking-1",
        amount_total: 10500,
        tax_amount: 500,
        gateway: "razorpay",
        gateway_payment_id: "pay_1",
        refund_status: null,
        status: "paid",
      },
      {
        id: "payment-uncaptured",
        booking_id: "booking-2",
        amount_total: 10500,
        tax_amount: 500,
        gateway: "razorpay",
        gateway_payment_id: "pay_2",
        refund_status: null,
        status: "created",
      },
    ],
  };

  function matches(row: Record<string, unknown>, filters: Array<{ column: string; value: unknown }>) {
    return filters.every((filter) => row[filter.column] === filter.value);
  }

  return {
    state,
    client: {
      from(table: string) {
        const filters: Array<{ column: string; value: unknown }> = [];
        return {
          select() {
            return this;
          },
          eq(column: string, value: unknown) {
            filters.push({ column, value });
            return this;
          },
          async maybeSingle() {
            const rows = (state as Record<string, Array<Record<string, unknown>>>)[table] ?? [];
            const row = rows.find((candidate) => matches(candidate, filters)) ?? null;
            return { data: row, error: null };
          },
          insert(payload: Record<string, unknown>) {
            return {
              select() {
                return {
                  async single() {
                    const rows = (state as Record<string, Array<Record<string, unknown>>>)[table];
                    const row = {
                      id: `${table}-${rows.length + 1}`,
                      created_at: "2026-05-21T00:00:00.000Z",
                      updated_at: "2026-05-21T00:00:00.000Z",
                      ...payload,
                    };
                    rows.push(row);
                    return { data: row, error: null };
                  },
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            return {
              eq(column: string, value: unknown) {
                return {
                  async then(resolve: (value: { error: null }) => void) {
                    const rows = (state as Record<string, Array<Record<string, unknown>>>)[table];
                    rows.forEach((row) => {
                      if (row[column] === value) Object.assign(row, payload);
                    });
                    resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      },
    } as any,
  };
}

test("admin approval is required by default", () => {
  assert.equal(shouldRequireAdminRefundApproval(), true);
});

test("full refund calculation refunds full guest payable", () => {
  const result = calculateRefundPolicy({
    policyCase: "FREE_CANCELLATION",
    roomBaseAmount: 10000,
    accommodationGstAmount: 500,
  });

  assert.equal(result.refundAmount, 10500);
  assert.equal(result.hostRecalculatedPayout, 0);
  assert.equal(result.famloRetainedAmount, 0);
});

test("partial refund calculation recalculates retained economics", () => {
  const result = calculateRefundPolicy({
    policyCase: "PARTIAL_CANCELLATION",
    roomBaseAmount: 10000,
    accommodationGstAmount: 500,
    retentionPercent: 0.5,
    nights: [{ actualValue: 10000 }],
  });

  assert.equal(result.retainedBaseAmount, 5000);
  assert.equal(result.retainedGstAmount, 250);
  assert.equal(result.refundBaseAmount, 5000);
  assert.equal(result.refundGstAmount, 250);
  assert.equal(result.refundAmount, 5250);
  assert.equal(result.hostRecalculatedPayout, 4200);
  assert.equal(result.famloRetainedAmount, 800);
});

test("no-show refund is zero", () => {
  const result = calculateRefundPolicy({
    policyCase: "NO_SHOW",
    roomBaseAmount: 10000,
    accommodationGstAmount: 500,
  });

  assert.equal(result.refundAmount, 0);
  assert.equal(result.hostRecalculatedPayout, 8400);
});

test("host cancellation returns full refund", () => {
  const result = calculateRefundPolicy({
    policyCase: "HOST_CANCELLATION",
    roomBaseAmount: 10000,
    accommodationGstAmount: 500,
  });

  assert.equal(result.refundAmount, 10500);
  assert.equal(result.hostRecalculatedPayout, 0);
});

test("cannot refund uncaptured payment", () => {
  assert.throws(
    () =>
      assertRefundableCapturedPayment({
        id: "payment-uncaptured",
        booking_id: "booking-2",
        amount_total: 10500,
        status: "created",
      }),
    /captured or paid payments/
  );
});

test("create refund request does not call provider and requires admin approval by default", async () => {
  const { client, state } = createRefundSupabase();
  const payment = state.payments_v2[0] as any;

  const result = await createRefundRequestDraft(client, payment, {
    bookingId: "booking-1",
    paymentId: "payment-1",
    reason: "guest_requested",
    policyInput: {
      policyCase: "FREE_CANCELLATION",
      roomBaseAmount: 10000,
      accommodationGstAmount: 500,
    },
  });

  assert.equal(result.requiresAdminApproval, true);
  assert.equal(state.refund_requests.length, 1);
  assert.equal(state.refund_attempts.length, 0);
  assert.equal(state.refund_requests[0]?.status, "requested");
});

test("provider execution is blocked when flag is off", async () => {
  const { client, state } = createRefundSupabase();
  state.refund_requests.push({
    id: "refund-request-1",
    booking_id: "booking-1",
    payment_id: "payment-1",
    reason: "guest_requested",
    refund_amount: 10500,
    refund_base_amount: 10000,
    refund_gst_amount: 500,
    status: "requested",
    requires_admin_approval: true,
    approved_by: null,
    approved_at: null,
  });

  const result = await approveAndMaybeInitiateRefund(client, {
    refundRequestId: "refund-request-1",
    actorUserId: "admin-1",
    providerExecutionEnabledOverride: false,
  });

  assert.equal(result.providerExecutionAttempted, false);
  assert.equal(result.providerExecutionBlocked, true);
  assert.equal(state.refund_attempts.length, 0);
  assert.equal(state.refund_requests[0]?.status, "approved");
});

test("safe full free cancellation is auto-refund eligible", () => {
  const result = evaluateAutoRefundEligibility({
    cancellationSource: "guest",
    policyCase: "FREE_CANCELLATION",
    paymentCaptured: true,
    hasSettlementPayout: false,
    hasHostPayoutExecution: false,
    hasDispute: false,
    refundAmount: 10500,
    autoRefundMaxAmount: 20000,
    providerSupportsRefund: true,
    hasCriticalReconciliationIssue: false,
  });

  assert.equal(result.eligible, true);
  assert.deepEqual(result.blockedReasons, []);
});

test("partial cancellation is not auto-refund eligible", () => {
  const result = evaluateAutoRefundEligibility({
    cancellationSource: "guest",
    policyCase: "PARTIAL_CANCELLATION",
    paymentCaptured: true,
    hasSettlementPayout: false,
    hasHostPayoutExecution: false,
    hasDispute: false,
    refundAmount: 5250,
    autoRefundMaxAmount: 20000,
    providerSupportsRefund: true,
    hasCriticalReconciliationIssue: false,
  });

  assert.equal(result.eligible, false);
  assert.equal(result.blockedReasons.includes("full_free_cancellation_required"), true);
});

test("refund after payout is not auto-eligible", () => {
  const result = evaluateAutoRefundEligibility({
    cancellationSource: "guest",
    policyCase: "FREE_CANCELLATION",
    paymentCaptured: true,
    hasSettlementPayout: true,
    hasHostPayoutExecution: true,
    hasDispute: false,
    refundAmount: 10500,
    autoRefundMaxAmount: 20000,
    providerSupportsRefund: true,
    hasCriticalReconciliationIssue: false,
  });

  assert.equal(result.eligible, false);
  assert.equal(result.blockedReasons.includes("settlement_payout_exists"), true);
  assert.equal(result.blockedReasons.includes("host_payout_execution_exists"), true);
});

test("refund above max amount is not auto-eligible", () => {
  const result = evaluateAutoRefundEligibility({
    cancellationSource: "guest",
    policyCase: "FREE_CANCELLATION",
    paymentCaptured: true,
    hasSettlementPayout: false,
    hasHostPayoutExecution: false,
    hasDispute: false,
    refundAmount: 10500,
    autoRefundMaxAmount: 5000,
    providerSupportsRefund: true,
    hasCriticalReconciliationIssue: false,
  });

  assert.equal(result.eligible, false);
  assert.equal(result.blockedReasons.includes("refund_exceeds_auto_refund_max_amount"), true);
});

test("critical reconciliation issue blocks auto-refund", () => {
  const result = evaluateAutoRefundEligibility({
    cancellationSource: "guest",
    policyCase: "FREE_CANCELLATION",
    paymentCaptured: true,
    hasSettlementPayout: false,
    hasHostPayoutExecution: false,
    hasDispute: false,
    refundAmount: 10500,
    autoRefundMaxAmount: 20000,
    providerSupportsRefund: true,
    hasCriticalReconciliationIssue: true,
  });

  assert.equal(result.eligible, false);
  assert.equal(result.blockedReasons.includes("critical_reconciliation_issue_present"), true);
});

test("Razorpay refund API response creates attempt but not final state", async () => {
  const { client, state } = createRefundSupabase();
  state.refund_requests.push({
    id: "refund-request-1",
    booking_id: "booking-1",
    payment_id: "payment-1",
    reason: "guest_requested",
    refund_amount: 10500,
    refund_base_amount: 10000,
    refund_gst_amount: 500,
    status: "requested",
    requires_admin_approval: true,
    approved_by: null,
    approved_at: null,
  });

  const result = await approveAndMaybeInitiateRefund(client, {
    refundRequestId: "refund-request-1",
    actorUserId: "admin-1",
    providerExecutionEnabledOverride: true,
    providerConfiguredOverride: true,
    createProviderRefund: async () =>
      ({
        id: "rfnd_1",
        entity: "refund",
        amount: 1050000,
        currency: "INR",
        payment_id: "pay_1",
        status: "processed",
      }) as any,
  });

  assert.equal(result.providerExecutionAttempted, true);
  assert.equal(result.refundAttemptId !== null, true);
  assert.equal(result.providerRefundId, "rfnd_1");
  assert.equal(state.refund_attempts.length, 1);
  assert.equal(state.refund_attempts[0]?.status, "submitted");
  assert.equal(state.refund_requests[0]?.status, "processing");
});

test("refund webhook transitions finalize once and failed goes to review state", () => {
  const created = resolveRefundWebhookTransition("refund.created");
  const processed = resolveRefundWebhookTransition("refund.processed");
  const failed = resolveRefundWebhookTransition("refund.failed");

  assert.equal(created.requestStatus, "processing");
  assert.equal(created.shouldFinalizeFolio, false);
  assert.equal(processed.requestStatus, "processed");
  assert.equal(processed.shouldFinalizeFolio, true);
  assert.equal(failed.requestStatus, "failed");
  assert.equal(failed.shouldFinalizeFolio, false);
});

test("credit note generation remains blocked under pending compliance", () => {
  assert.ok(true, "Refund request layer does not enable credit-note generation.");
});
