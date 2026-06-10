import { isAutoRefundEnabled } from "@/lib/finance/feature-flags";

export type AutoRefundEligibilityInput = {
  cancellationSource: "guest" | "host" | "admin" | "system" | "unknown";
  policyCase: string;
  paymentCaptured: boolean;
  hasSettlementPayout: boolean;
  hasHostPayoutExecution: boolean;
  hasDispute: boolean;
  refundAmount: number;
  autoRefundMaxAmount: number;
  providerSupportsRefund: boolean;
  hasCriticalReconciliationIssue: boolean;
};

export type AutoRefundEligibilityResult = {
  eligible: boolean;
  blockedReasons: string[];
  autoRefundEnabled: boolean;
};

function asMoney(value: number | null | undefined): number {
  return Math.max(0, Math.round(Number(value ?? 0) || 0));
}

export function getAutoRefundMaxAmount(): number {
  const parsed = Number(process.env.AUTO_REFUND_MAX_AMOUNT ?? "0");
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

export function evaluateAutoRefundEligibility(input: AutoRefundEligibilityInput): AutoRefundEligibilityResult {
  const blockedReasons: string[] = [];

  if (input.cancellationSource !== "guest") {
    blockedReasons.push("guest_initiated_cancellation_required");
  }
  if (String(input.policyCase).trim().toUpperCase() !== "FREE_CANCELLATION") {
    blockedReasons.push("full_free_cancellation_required");
  }
  if (!input.paymentCaptured) {
    blockedReasons.push("captured_payment_required");
  }
  if (input.hasSettlementPayout) {
    blockedReasons.push("settlement_payout_exists");
  }
  if (input.hasHostPayoutExecution) {
    blockedReasons.push("host_payout_execution_exists");
  }
  if (input.hasDispute) {
    blockedReasons.push("booking_has_dispute");
  }
  if (!input.providerSupportsRefund) {
    blockedReasons.push("payment_provider_refund_not_supported");
  }
  if (input.hasCriticalReconciliationIssue) {
    blockedReasons.push("critical_reconciliation_issue_present");
  }

  const refundAmount = asMoney(input.refundAmount);
  const maxAmount = asMoney(input.autoRefundMaxAmount);
  if (maxAmount <= 0 || refundAmount > maxAmount) {
    blockedReasons.push("refund_exceeds_auto_refund_max_amount");
  }

  return {
    eligible: blockedReasons.length === 0,
    blockedReasons,
    autoRefundEnabled: isAutoRefundEnabled(),
  };
}
