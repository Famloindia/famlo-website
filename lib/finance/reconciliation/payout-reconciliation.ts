import {
  buildReconciliationIssue,
  type ReconciliationIssue,
} from "@/lib/finance/reconciliation/reconciliation-contracts";

export type PayoutReconciliationSettlementRow = {
  id: string;
  host_id?: string | null;
  host_user_id?: string | null;
  status?: string | null;
  net_payable_amount?: number | null;
  transfer_reference?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PayoutReconciliationExecutionRow = {
  id: string;
  settlement_id?: string | null;
  host_id?: string | null;
  provider?: string | null;
  provider_payout_id?: string | null;
  amount?: number | null;
  status?: string | null;
  reference_id?: string | null;
  created_at?: string | null;
};

export type PayoutReconciliationPayoutAccountRow = {
  host_id?: string | null;
  provider?: string | null;
  is_active?: boolean | null;
};

export type PayoutReconciliationRefundRequestRow = {
  booking_id?: string | null;
  status?: string | null;
};

export type PayoutReconciliationSettlementLineRow = {
  settlement_id?: string | null;
  booking_id?: string | null;
};

export type PayoutReconciliationBookingRow = {
  id: string;
};

export type PayoutReconciliationProviderEventRow = {
  provider?: string | null;
  entity_id?: string | null;
  event_type?: string | null;
  processing_status?: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function reconcilePayouts(input: {
  settlements: PayoutReconciliationSettlementRow[];
  payoutExecutions: PayoutReconciliationExecutionRow[];
  payoutAccounts: PayoutReconciliationPayoutAccountRow[];
  refundRequests: PayoutReconciliationRefundRequestRow[];
  settlementLineItems: PayoutReconciliationSettlementLineRow[];
  providerEvents: PayoutReconciliationProviderEventRow[];
  nowIso?: string;
  approvedWithoutPayoutThresholdHours?: number;
}): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];
  const executionsBySettlementId = new Map<string, PayoutReconciliationExecutionRow[]>();
  const activeAccountByHostId = new Map<string, boolean>();
  const bookingIdsBySettlement = new Map<string, string[]>();
  const now = new Date(input.nowIso ?? new Date().toISOString()).getTime();
  const thresholdMs = (input.approvedWithoutPayoutThresholdHours ?? 24) * 60 * 60 * 1000;

  for (const execution of input.payoutExecutions) {
    const key = asString(execution.settlement_id);
    if (!key) continue;
    const next = executionsBySettlementId.get(key) ?? [];
    next.push(execution);
    executionsBySettlementId.set(key, next);
  }

  for (const account of input.payoutAccounts) {
    const hostId = asString(account.host_id);
    if (!hostId || normalizeStatus(account.provider) !== "razorpayx") continue;
    activeAccountByHostId.set(hostId, account.is_active === true);
  }

  for (const line of input.settlementLineItems) {
    const settlementId = asString(line.settlement_id);
    const bookingId = asString(line.booking_id);
    if (!settlementId || !bookingId) continue;
    const next = bookingIdsBySettlement.get(settlementId) ?? [];
    next.push(bookingId);
    bookingIdsBySettlement.set(settlementId, next);
  }

  for (const settlement of input.settlements) {
    const settlementId = settlement.id;
    const settlementStatus = normalizeStatus(settlement.status);
    const executions = executionsBySettlementId.get(settlementId) ?? [];
    const activeExecutions = executions.filter((execution) => {
      const status = normalizeStatus(execution.status);
      return status === "created" || status === "submitted" || status === "processing";
    });
    const processedExecution = executions.find((execution) => normalizeStatus(execution.status) === "processed") ?? null;
    const reversedExecution = executions.find((execution) => normalizeStatus(execution.status) === "reversed") ?? null;
    const failedExecution = executions.find((execution) => normalizeStatus(execution.status) === "failed") ?? null;
    const bookingIds = bookingIdsBySettlement.get(settlementId) ?? [];
    const hasPendingRefund = input.refundRequests.some(
      (request) =>
        bookingIds.includes(asString(request.booking_id) ?? "") &&
        ["requested", "approved", "processing"].includes(normalizeStatus(request.status))
    );

    if (settlementStatus === "paid" && !processedExecution) {
      issues.push(
        buildReconciliationIssue({
          type: "PAYOUT",
          entityId: settlementId,
          provider: "RAZORPAYX",
          providerEntityId: asString(settlement.transfer_reference),
          severity: "critical",
          reasonCode: "paid_settlement_missing_processed_payout",
          expectedAmount: asNumber(settlement.net_payable_amount),
          observedAmount: executions[0] ? asNumber(executions[0].amount) : null,
          firstSeenAt: asString(settlement.updated_at) ?? asString(settlement.created_at),
        })
      );
    }

    if (processedExecution && !asString(processedExecution.provider_payout_id)) {
      issues.push(
        buildReconciliationIssue({
          type: "PAYOUT",
          entityId: processedExecution.id,
          provider: "RAZORPAYX",
          severity: "critical",
          reasonCode: "processed_payout_missing_provider_id",
          details: { settlementId },
          firstSeenAt: asString(processedExecution.created_at),
        })
      );
    }

    if (processedExecution && asNumber(processedExecution.amount) !== asNumber(settlement.net_payable_amount)) {
      issues.push(
        buildReconciliationIssue({
          type: "PAYOUT",
          entityId: processedExecution.id,
          provider: "RAZORPAYX",
          providerEntityId: asString(processedExecution.provider_payout_id),
          severity: "critical",
          reasonCode: "processed_payout_amount_mismatch",
          expectedAmount: asNumber(settlement.net_payable_amount),
          observedAmount: asNumber(processedExecution.amount),
          details: { settlementId },
          firstSeenAt: asString(processedExecution.created_at),
        })
      );
    }

    if (settlementStatus === "paid" && (failedExecution || reversedExecution)) {
      issues.push(
        buildReconciliationIssue({
          type: "PAYOUT",
          entityId: settlementId,
          provider: "RAZORPAYX",
          providerEntityId: asString((failedExecution ?? reversedExecution)?.provider_payout_id),
          severity: "critical",
          reasonCode: failedExecution ? "failed_payout_marked_paid" : "reversed_payout_marked_paid",
          details: { executionStatuses: executions.map((execution) => normalizeStatus(execution.status)) },
          firstSeenAt: asString(settlement.updated_at) ?? asString(settlement.created_at),
        })
      );
    }

    if (settlementStatus === "approved" && executions.length === 0) {
      const updatedAt = Date.parse(asString(settlement.updated_at) ?? asString(settlement.created_at) ?? "");
      issues.push(
        buildReconciliationIssue({
          type: "PAYOUT",
          entityId: settlementId,
          severity: Number.isFinite(updatedAt) && now - updatedAt > thresholdMs ? "warning" : "info",
          reasonCode: "approved_settlement_without_payout_execution",
          expectedAmount: asNumber(settlement.net_payable_amount),
          details: { hostId: asString(settlement.host_id) },
          firstSeenAt: asString(settlement.updated_at) ?? asString(settlement.created_at),
        })
      );
    }

    if (activeExecutions.length > 1) {
      issues.push(
        buildReconciliationIssue({
          type: "PAYOUT",
          entityId: settlementId,
          severity: "critical",
          reasonCode: "multiple_active_payout_executions",
          expectedAmount: 1,
          observedAmount: activeExecutions.length,
          firstSeenAt: asString(settlement.updated_at) ?? asString(settlement.created_at),
        })
      );
    }

    if ((processedExecution || failedExecution || reversedExecution) && !input.providerEvents.some((event) => {
      if (normalizeStatus(event.provider) !== "razorpayx") return false;
      const entityId = asString(event.entity_id);
      const payoutId =
        asString(processedExecution?.provider_payout_id) ??
        asString(failedExecution?.provider_payout_id) ??
        asString(reversedExecution?.provider_payout_id);
      return entityId === payoutId;
    })) {
      issues.push(
        buildReconciliationIssue({
          type: "PAYOUT",
          entityId: settlementId,
          provider: "RAZORPAYX",
          severity: "critical",
          reasonCode: "missing_payout_provider_event_for_final_state",
          firstSeenAt: asString(settlement.updated_at) ?? asString(settlement.created_at),
        })
      );
    }

    if (settlementStatus === "approved" && !activeAccountByHostId.get(asString(settlement.host_id) ?? "")) {
      issues.push(
        buildReconciliationIssue({
          type: "PAYOUT",
          entityId: settlementId,
          severity: "warning",
          reasonCode: "approved_settlement_host_payout_account_inactive",
          details: { hostId: asString(settlement.host_id) },
          firstSeenAt: asString(settlement.updated_at) ?? asString(settlement.created_at),
        })
      );
    }

    if (settlementStatus === "paid" && hasPendingRefund) {
      issues.push(
        buildReconciliationIssue({
          type: "PAYOUT",
          entityId: settlementId,
          severity: "critical",
          reasonCode: "paid_settlement_has_pending_refund",
          details: { bookingIds },
          firstSeenAt: asString(settlement.updated_at) ?? asString(settlement.created_at),
        })
      );
    }
  }

  return issues;
}
