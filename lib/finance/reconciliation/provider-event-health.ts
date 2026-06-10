import {
  buildReconciliationIssue,
  summarizeReconciliationIssues,
  type ProviderEventHealthSummary,
  type ReconciliationIssue,
} from "@/lib/finance/reconciliation/reconciliation-contracts";

export type ProviderEventHealthRow = {
  id?: string | null;
  provider?: string | null;
  event_id?: string | null;
  event_type?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  signature_valid?: boolean | null;
  processing_status?: string | null;
  processed_at?: string | null;
  error_message?: string | null;
  created_at?: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function reconcileProviderEventHealth(input: {
  providerEvents: ProviderEventHealthRow[];
  nowIso?: string;
  staleThresholdHours?: number;
}): {
  issues: ReconciliationIssue[];
  health: ProviderEventHealthSummary;
} {
  const issues: ReconciliationIssue[] = [];
  const now = new Date(input.nowIso ?? new Date().toISOString()).getTime();
  const staleThresholdMs = (input.staleThresholdHours ?? 1) * 60 * 60 * 1000;
  let duplicateCount = 0;
  let invalidSignatureCount = 0;
  let failedProcessingCount = 0;
  let staleUnprocessedCount = 0;

  for (const event of input.providerEvents) {
    const eventId = asString(event.event_id) ?? asString(event.id) ?? "unknown";
    const processingStatus = normalizeStatus(event.processing_status);
    const provider = asString(event.provider);

    if (event.signature_valid === false || processingStatus === "invalid_signature") {
      invalidSignatureCount += 1;
      issues.push(
        buildReconciliationIssue({
          type: "PROVIDER_EVENT",
          entityId: eventId,
          provider,
          providerEntityId: asString(event.entity_id),
          severity: "critical",
          reasonCode: "invalid_signature_event",
          details: {
            eventType: asString(event.event_type),
            errorMessage: asString(event.error_message),
          },
          firstSeenAt: asString(event.created_at),
          lastSeenAt: asString(event.processed_at) ?? asString(event.created_at),
        })
      );
    }

    if (processingStatus === "failed") {
      failedProcessingCount += 1;
      issues.push(
        buildReconciliationIssue({
          type: "PROVIDER_EVENT",
          entityId: eventId,
          provider,
          providerEntityId: asString(event.entity_id),
          severity: "warning",
          reasonCode: "provider_event_processing_failed",
          details: {
            eventType: asString(event.event_type),
            errorMessage: asString(event.error_message),
          },
          firstSeenAt: asString(event.created_at),
          lastSeenAt: asString(event.processed_at) ?? asString(event.created_at),
        })
      );
    }

    if (processingStatus === "ignored_duplicate") {
      duplicateCount += 1;
    }

    if ((processingStatus === "received" || processingStatus === "processing" || processingStatus === "pending") && !asString(event.processed_at)) {
      const createdAt = Date.parse(asString(event.created_at) ?? "");
      if (Number.isFinite(createdAt) && now - createdAt > staleThresholdMs) {
        staleUnprocessedCount += 1;
        issues.push(
          buildReconciliationIssue({
            type: "PROVIDER_EVENT",
            entityId: eventId,
            provider,
            providerEntityId: asString(event.entity_id),
            severity: "warning",
            reasonCode: "provider_event_stale_unprocessed",
            details: {
              eventType: asString(event.event_type),
              processingStatus,
            },
            firstSeenAt: asString(event.created_at),
          })
        );
      }
    }
  }

  const summary = summarizeReconciliationIssues(issues);
  return {
    issues,
    health: {
      ...summary,
      duplicateCount,
      invalidSignatureCount,
      failedProcessingCount,
      staleUnprocessedCount,
    },
  };
}
