export type ReconciliationIssueType = "PAYMENT" | "REFUND" | "PAYOUT" | "PROVIDER_EVENT";
export type ReconciliationSeverity = "info" | "warning" | "critical";
export type ReconciliationStatus = "open" | "resolved" | "ignored";

export type ReconciliationIssue = {
  id: string;
  type: ReconciliationIssueType;
  entityId: string;
  provider: string | null;
  providerEntityId: string | null;
  severity: ReconciliationSeverity;
  status: ReconciliationStatus;
  reasonCode: string;
  expectedAmount: number | null;
  observedAmount: number | null;
  differenceAmount: number | null;
  details: Record<string, unknown>;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  resolvedAt: string | null;
};

export type ReconciliationSummary = {
  total: number;
  info: number;
  warning: number;
  critical: number;
};

export type ReconciliationSection = {
  summary: ReconciliationSummary;
  issues: ReconciliationIssue[];
};

export type ProviderEventHealthSummary = ReconciliationSummary & {
  duplicateCount: number;
  invalidSignatureCount: number;
  failedProcessingCount: number;
  staleUnprocessedCount: number;
};

export type FinanceReconciliationSnapshot = {
  generatedAt: string;
  taxMode: string;
  payments: ReconciliationSection;
  refunds: ReconciliationSection;
  payouts: ReconciliationSection;
  providerEvents: ReconciliationSection & {
    health: ProviderEventHealthSummary;
  };
  overall: ReconciliationSummary;
};

export function buildReconciliationIssue(input: {
  type: ReconciliationIssueType;
  entityId: string;
  provider?: string | null;
  providerEntityId?: string | null;
  severity: ReconciliationSeverity;
  reasonCode: string;
  expectedAmount?: number | null;
  observedAmount?: number | null;
  details?: Record<string, unknown>;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  status?: ReconciliationStatus;
}): ReconciliationIssue {
  const expectedAmount = typeof input.expectedAmount === "number" ? input.expectedAmount : null;
  const observedAmount = typeof input.observedAmount === "number" ? input.observedAmount : null;
  return {
    id: `${input.type}:${input.reasonCode}:${input.entityId}:${input.providerEntityId ?? "none"}`,
    type: input.type,
    entityId: input.entityId,
    provider: input.provider ?? null,
    providerEntityId: input.providerEntityId ?? null,
    severity: input.severity,
    status: input.status ?? "open",
    reasonCode: input.reasonCode,
    expectedAmount,
    observedAmount,
    differenceAmount:
      expectedAmount !== null && observedAmount !== null ? Math.abs(expectedAmount - observedAmount) : null,
    details: input.details ?? {},
    firstSeenAt: input.firstSeenAt ?? null,
    lastSeenAt: input.lastSeenAt ?? input.firstSeenAt ?? null,
    resolvedAt: null,
  };
}

export function summarizeReconciliationIssues(issues: ReconciliationIssue[]): ReconciliationSummary {
  return issues.reduce<ReconciliationSummary>(
    (summary, issue) => {
      summary.total += 1;
      summary[issue.severity] += 1;
      return summary;
    },
    { total: 0, info: 0, warning: 0, critical: 0 }
  );
}
