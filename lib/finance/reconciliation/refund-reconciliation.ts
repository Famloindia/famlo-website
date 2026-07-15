import {
  buildReconciliationIssue,
  type ReconciliationIssue,
} from "@/lib/finance/reconciliation/reconciliation-contracts";

export type RefundReconciliationRequestRow = {
  id: string;
  booking_id?: string | null;
  payment_id?: string | null;
  refund_amount?: number | null;
  refund_base_amount?: number | null;
  refund_gst_amount?: number | null;
  status?: string | null;
  requires_admin_approval?: boolean | null;
  created_at?: string | null;
};

export type RefundReconciliationAttemptRow = {
  id: string;
  refund_request_id?: string | null;
  provider?: string | null;
  provider_refund_id?: string | null;
  amount?: number | null;
  status?: string | null;
  created_at?: string | null;
};

export type RefundReconciliationRefundRow = {
  id: string;
  booking_id?: string | null;
  payment_id?: string | null;
  provider?: string | null;
  provider_refund_id?: string | null;
  amount_total?: number | null;
  status?: string | null;
  processed_at?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type RefundReconciliationFolioLineRow = {
  booking_id?: string | null;
  line_code?: string | null;
  source_event_id?: string | null;
};

export type RefundReconciliationCreditNoteRow = {
  refund_id?: string | null;
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

export function reconcileRefunds(input: {
  refundRequests: RefundReconciliationRequestRow[];
  refundAttempts: RefundReconciliationAttemptRow[];
  refunds: RefundReconciliationRefundRow[];
  folioLines: RefundReconciliationFolioLineRow[];
  creditNotes: RefundReconciliationCreditNoteRow[];
  taxMode: string;
  nowIso?: string;
  pendingThresholdHours?: number;
}): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];
  const attemptsByRequestId = new Map<string, RefundReconciliationAttemptRow[]>();
  const refundsByProviderRefundId = new Map<string, RefundReconciliationRefundRow>();
  const creditRefundIds = new Set(input.creditNotes.map((row) => asString(row.refund_id)).filter(Boolean) as string[]);
  const now = new Date(input.nowIso ?? new Date().toISOString()).getTime();
  const pendingThresholdMs = (input.pendingThresholdHours ?? 48) * 60 * 60 * 1000;

  for (const attempt of input.refundAttempts) {
    const key = asString(attempt.refund_request_id);
    if (!key) continue;
    const next = attemptsByRequestId.get(key) ?? [];
    next.push(attempt);
    attemptsByRequestId.set(key, next);
  }

  for (const refund of input.refunds) {
    const key = asString(refund.provider_refund_id);
    if (key) refundsByProviderRefundId.set(key, refund);
  }

  for (const request of input.refundRequests) {
    const requestId = request.id;
    const requestStatus = normalizeStatus(request.status);
    const expectedAmount = asNumber(request.refund_base_amount) + asNumber(request.refund_gst_amount);
    const observedAmount = asNumber(request.refund_amount);
    const attempts = attemptsByRequestId.get(requestId) ?? [];
    const matchingRefunds = attempts
      .map((attempt) => asString(attempt.provider_refund_id))
      .filter(Boolean)
      .map((providerRefundId) => refundsByProviderRefundId.get(providerRefundId!))
      .filter(Boolean) as RefundReconciliationRefundRow[];

    if (expectedAmount !== observedAmount) {
      issues.push(
        buildReconciliationIssue({
          type: "REFUND",
          entityId: requestId,
          provider: attempts[0] ? asString(attempts[0].provider) : null,
          providerEntityId: attempts[0] ? asString(attempts[0].provider_refund_id) : null,
          severity: "critical",
          reasonCode: "refund_request_amount_policy_mismatch",
          expectedAmount,
          observedAmount,
          details: { bookingId: asString(request.booking_id) },
          firstSeenAt: asString(request.created_at),
        })
      );
    }

    if ((requestStatus === "approved" || requestStatus === "processing" || requestStatus === "processed") && attempts.length === 0) {
      issues.push(
        buildReconciliationIssue({
          type: "REFUND",
          entityId: requestId,
          severity: "warning",
          reasonCode: "approved_refund_missing_attempt",
          details: { bookingId: asString(request.booking_id) },
          firstSeenAt: asString(request.created_at),
        })
      );
    }

    if (requestStatus === "requested" || requestStatus === "approved" || requestStatus === "processing") {
      const createdAt = Date.parse(asString(request.created_at) ?? "");
      if (Number.isFinite(createdAt) && now - createdAt > pendingThresholdMs) {
        issues.push(
          buildReconciliationIssue({
            type: "REFUND",
            entityId: requestId,
            severity: "warning",
            reasonCode: "refund_request_pending_too_long",
            details: { bookingId: asString(request.booking_id), status: requestStatus },
            firstSeenAt: asString(request.created_at),
          })
        );
      }
    }

    for (const refund of matchingRefunds) {
      const refundStatus = normalizeStatus(refund.status);
      const refundLines = input.folioLines.filter(
        (line) => asString(line.booking_id) === asString(refund.booking_id) && asString(line.line_code) === "REFUND"
      );

      if (refundStatus === "processed") {
        if (refundLines.length === 0) {
          issues.push(
            buildReconciliationIssue({
              type: "REFUND",
              entityId: refund.id,
              provider: asString(refund.provider),
              providerEntityId: asString(refund.provider_refund_id),
              severity: "critical",
              reasonCode: "processed_refund_missing_proof_line",
              details: { bookingId: asString(refund.booking_id), refundRequestId: requestId },
              firstSeenAt: asString(refund.created_at),
            })
          );
        }

        if (refundLines.length > 1) {
          issues.push(
            buildReconciliationIssue({
              type: "REFUND",
              entityId: refund.id,
              provider: asString(refund.provider),
              providerEntityId: asString(refund.provider_refund_id),
              severity: "critical",
              reasonCode: "duplicate_refund_proof_lines",
              expectedAmount: 1,
              observedAmount: refundLines.length,
              details: { bookingId: asString(refund.booking_id), refundRequestId: requestId },
              firstSeenAt: asString(refund.created_at),
            })
          );
        }
      }

      const hasProcessedAttempt = attempts.some((attempt) => normalizeStatus(attempt.status) === "processed");
      if (refundStatus === "failed" && (requestStatus === "processed" || hasProcessedAttempt)) {
        issues.push(
          buildReconciliationIssue({
            type: "REFUND",
            entityId: refund.id,
            provider: asString(refund.provider),
            providerEntityId: asString(refund.provider_refund_id),
            severity: "critical",
            reasonCode: "failed_refund_marked_processed",
            details: {
              refundRequestId: requestId,
              requestStatus,
              attemptStatuses: attempts.map((attempt) => normalizeStatus(attempt.status)),
            },
            firstSeenAt: asString(refund.created_at),
          })
        );
      }

      if (normalizeStatus(input.taxMode) === "pending_compliance" && !creditRefundIds.has(refund.id)) {
        issues.push(
          buildReconciliationIssue({
            type: "REFUND",
            entityId: refund.id,
            provider: asString(refund.provider),
            providerEntityId: asString(refund.provider_refund_id),
            severity: "info",
            reasonCode: "credit_note_missing_under_tax_lock",
            details: {
              refundRequestId: requestId,
              taxMode: input.taxMode,
            },
            firstSeenAt: asString(refund.created_at),
          })
        );
      }
    }
  }

  for (const refund of input.refunds) {
    if (normalizeStatus(refund.status) !== "processed") continue;
    const providerRefundId = asString(refund.provider_refund_id);
    const hasRequest = input.refundAttempts.some((attempt) => asString(attempt.provider_refund_id) === providerRefundId);
    if (!hasRequest) {
      issues.push(
        buildReconciliationIssue({
          type: "REFUND",
          entityId: refund.id,
          provider: asString(refund.provider),
          providerEntityId: providerRefundId,
          severity: "critical",
          reasonCode: "processed_provider_refund_missing_request",
          details: { bookingId: asString(refund.booking_id) },
          firstSeenAt: asString(refund.created_at),
        })
      );
    }
  }

  return issues;
}
