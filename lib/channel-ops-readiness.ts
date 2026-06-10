import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

export type ChannelOpsSeverity = "healthy" | "warning" | "critical";

export type ChannelOpsAlert = {
  id: string;
  severity: Exclude<ChannelOpsSeverity, "healthy">;
  title: string;
  detail: string;
  metric: string;
  value: number;
  threshold: number;
  familyId?: string | null;
  providerCode?: string | null;
};

export type ChannelOpsReadiness = {
  generatedAt: string;
  lookbackHours: number;
  familyId: string | null;
  severity: ChannelOpsSeverity;
  readinessPercent: number;
  metrics: {
    queueDepth: number;
    dueQueueDepth: number;
    runningJobs: number;
    staleRunningJobs: number;
    failedJobs: number;
    deadLetteredJobs: number;
    queueWaitP95Ms: number | null;
    queueWaitMaxMs: number | null;
    oldestQueuedJobAgeMs: number | null;
    unackedAppliedRevisions: number;
    webhookFailures: number;
    syncLogFailureRate: number;
    dashboardServerP95Ms: number | null;
    dashboardClientP95Ms: number | null;
    connectedProperties: number;
    staleProperties: number;
  };
  alerts: ChannelOpsAlert[];
  recentDeadLetters: Array<{
    id: string;
    familyId: string | null;
    providerCode: string | null;
    jobType: string | null;
    lastError: string | null;
    updatedAt: string | null;
  }>;
  runbook: string[];
};

type ChannelOpsRows = {
  jobs: JsonRecord[];
  revisions: JsonRecord[];
  logs: JsonRecord[];
  properties: JsonRecord[];
};

const QUEUE_WAIT_WARNING_MS = 120_000;
const QUEUE_WAIT_CRITICAL_MS = 300_000;
const STALE_RUNNING_MS = 10 * 60_000;
const STALE_PROPERTY_SYNC_MS = 2 * 60 * 60_000;
const DASHBOARD_CLIENT_WARNING_MS = 2_500;
const DASHBOARD_SERVER_WARNING_MS = 1_500;
const SYNC_FAILURE_RATE_WARNING = 0.05;
const SYNC_FAILURE_RATE_CRITICAL = 0.15;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function dateMs(value: unknown): number | null {
  const parsed = Date.parse(asString(value) ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * percentileValue) - 1);
  return sorted[index] ?? null;
}

function isAppliedRevision(row: JsonRecord): boolean {
  const importStatus = (asString(row.import_status) ?? "").toLowerCase();
  const status = (asString(row.status) ?? "").toLowerCase();
  return [
    "imported",
    "auto_imported",
    "auto_applied",
    "modified_applied",
    "cancelled_applied",
    "applied",
  ].includes(importStatus) || ["imported", "applied", "modified", "cancelled"].includes(status);
}

function isAcknowledged(row: JsonRecord): boolean {
  const ackStatus = (asString(row.ack_status) ?? "").toLowerCase();
  return ["acknowledged", "ack_succeeded", "acknowledged_success", "success", "not_applicable"].includes(ackStatus);
}

function isFailureStatus(value: unknown): boolean {
  const status = (asString(value) ?? "").toLowerCase();
  return ["failed", "failure", "error", "dead_lettered", "critical"].includes(status);
}

function buildAlert(input: Omit<ChannelOpsAlert, "id">): ChannelOpsAlert {
  return {
    id: `${input.metric}:${input.familyId ?? "all"}:${input.providerCode ?? "all"}`,
    ...input,
  };
}

function mergeRowsById(primary: JsonRecord[], secondary: JsonRecord[]): JsonRecord[] {
  const merged = new Map<string, JsonRecord>();
  for (const row of [...primary, ...secondary]) {
    const id = asString(row.id);
    if (id) {
      merged.set(id, row);
    }
  }
  return Array.from(merged.values());
}

export function buildChannelOpsReadiness(
  rows: ChannelOpsRows,
  options?: {
    familyId?: string | null;
    lookbackHours?: number;
    now?: Date;
  }
): ChannelOpsReadiness {
  const now = options?.now ?? new Date();
  const nowMs = now.getTime();
  const lookbackHours = options?.lookbackHours ?? 24;
  const familyId = options?.familyId ?? null;

  const queuedStatuses = new Set(["queued", "retrying"]);
  const runningStatuses = new Set(["running", "processing"]);
  const queueJobs = rows.jobs.filter((job) => queuedStatuses.has((asString(job.status) ?? "").toLowerCase()));
  const runningJobs = rows.jobs.filter((job) => runningStatuses.has((asString(job.status) ?? "").toLowerCase()));
  const dueQueueJobs = queueJobs.filter((job) => {
    const runAfter = dateMs(job.run_after);
    return runAfter == null || runAfter <= nowMs;
  });
  const failedJobs = rows.jobs.filter((job) => isFailureStatus(job.status) && (asString(job.status) ?? "").toLowerCase() !== "dead_lettered");
  const deadLetteredJobs = rows.jobs.filter((job) => (asString(job.status) ?? "").toLowerCase() === "dead_lettered");
  const staleRunningJobs = runningJobs.filter((job) => {
    const updatedAt = dateMs(job.updated_at) ?? dateMs(job.processed_at) ?? dateMs(job.created_at);
    return updatedAt != null && nowMs - updatedAt > STALE_RUNNING_MS;
  });

  const queueWaitValues = rows.jobs
    .map((job) => {
      const result = asObject(job.result);
      const explicitWait = asNumber(result.queue_wait_ms);
      if (explicitWait != null) return explicitWait;
      if (!queueJobs.includes(job)) return null;
      const eligibleAt = dateMs(job.run_after) ?? dateMs(job.created_at);
      return eligibleAt == null ? null : Math.max(0, nowMs - eligibleAt);
    })
    .filter((value): value is number => value != null && Number.isFinite(value));

  const queuedAges = queueJobs
    .map((job) => {
      const createdAt = dateMs(job.created_at);
      return createdAt == null ? null : Math.max(0, nowMs - createdAt);
    })
    .filter((value): value is number => value != null);

  const unackedAppliedRevisions = rows.revisions.filter((revision) => isAppliedRevision(revision) && !isAcknowledged(revision));
  const webhookFailures = rows.logs.filter((log) => {
    const action = (asString(log.action) ?? "").toLowerCase();
    return action.includes("webhook") && isFailureStatus(log.status);
  });
  const syncLogs = rows.logs.filter((log) => {
    const action = (asString(log.action) ?? "").toLowerCase();
    return action.includes("sync") || action.includes("ari") || action.includes("booking_feed");
  });
  const failedSyncLogs = syncLogs.filter((log) => isFailureStatus(log.status));
  const syncLogFailureRate = syncLogs.length > 0 ? failedSyncLogs.length / syncLogs.length : 0;

  const dashboardMetrics = rows.logs
    .filter((log) => asString(log.action) === "dashboard_load_metric")
    .map((log) => asObject(log.payload));
  const dashboardServerValues = dashboardMetrics
    .map((metric) => asNumber(metric.serverRenderMs))
    .filter((value): value is number => value != null);
  const dashboardClientValues = dashboardMetrics
    .map((metric) => asNumber(metric.clientHydratedMs))
    .filter((value): value is number => value != null);

  const connectedProperties = rows.properties.filter((property) => {
    const status = (asString(property.sync_status) ?? "").toLowerCase();
    return status === "connected" || Boolean(asString(property.external_property_id));
  });
  const staleProperties = connectedProperties.filter((property) => {
    const lastSyncedAt = dateMs(property.last_synced_at) ?? dateMs(asObject(property.metadata).last_ari_sync_at);
    return lastSyncedAt == null || nowMs - lastSyncedAt > STALE_PROPERTY_SYNC_MS;
  });

  const queueWaitP95Ms = percentile(queueWaitValues, 0.95);
  const dashboardServerP95Ms = percentile(dashboardServerValues, 0.95);
  const dashboardClientP95Ms = percentile(dashboardClientValues, 0.95);

  const alerts: ChannelOpsAlert[] = [];
  if (queueWaitP95Ms != null && queueWaitP95Ms > QUEUE_WAIT_CRITICAL_MS) {
    alerts.push(buildAlert({
      severity: "critical",
      title: "Channel queue wait is critical",
      detail: "Queued channel jobs are waiting too long before worker claim. This can delay ARI and booking synchronization.",
      metric: "queue_wait_p95_ms",
      value: queueWaitP95Ms,
      threshold: QUEUE_WAIT_CRITICAL_MS,
      familyId,
    }));
  } else if (queueWaitP95Ms != null && queueWaitP95Ms > QUEUE_WAIT_WARNING_MS) {
    alerts.push(buildAlert({
      severity: "warning",
      title: "Channel queue wait is elevated",
      detail: "Queued channel jobs are slower than the target production window.",
      metric: "queue_wait_p95_ms",
      value: queueWaitP95Ms,
      threshold: QUEUE_WAIT_WARNING_MS,
      familyId,
    }));
  }
  if (deadLetteredJobs.length > 0) {
    alerts.push(buildAlert({
      severity: "critical",
      title: "Dead-letter channel jobs need repair",
      detail: "At least one channel sync job exhausted retries and needs operator review.",
      metric: "dead_lettered_jobs",
      value: deadLetteredJobs.length,
      threshold: 0,
      familyId,
    }));
  }
  if (staleRunningJobs.length > 0) {
    alerts.push(buildAlert({
      severity: "critical",
      title: "Running channel jobs appear stuck",
      detail: "A running channel job has not updated within the safe worker window.",
      metric: "stale_running_jobs",
      value: staleRunningJobs.length,
      threshold: 0,
      familyId,
    }));
  }
  if (unackedAppliedRevisions.length > 0) {
    alerts.push(buildAlert({
      severity: "critical",
      title: "Applied OTA booking revisions are unacknowledged",
      detail: "Famlo has applied booking revisions that still need provider acknowledgement review.",
      metric: "unacked_applied_revisions",
      value: unackedAppliedRevisions.length,
      threshold: 0,
      familyId,
    }));
  }
  if (webhookFailures.length > 0) {
    alerts.push(buildAlert({
      severity: "warning",
      title: "Webhook failures were detected",
      detail: "Recent webhook auth or processing failures should be reviewed before widening production use.",
      metric: "webhook_failures",
      value: webhookFailures.length,
      threshold: 0,
      familyId,
    }));
  }
  if (syncLogFailureRate >= SYNC_FAILURE_RATE_CRITICAL) {
    alerts.push(buildAlert({
      severity: "critical",
      title: "Channel sync failure rate is critical",
      detail: "Recent channel sync logs show a high failure rate.",
      metric: "sync_failure_rate",
      value: syncLogFailureRate,
      threshold: SYNC_FAILURE_RATE_CRITICAL,
      familyId,
    }));
  } else if (syncLogFailureRate >= SYNC_FAILURE_RATE_WARNING) {
    alerts.push(buildAlert({
      severity: "warning",
      title: "Channel sync failure rate is elevated",
      detail: "Recent channel sync logs show failures above the production warning threshold.",
      metric: "sync_failure_rate",
      value: syncLogFailureRate,
      threshold: SYNC_FAILURE_RATE_WARNING,
      familyId,
    }));
  }
  if (dashboardClientP95Ms != null && dashboardClientP95Ms > DASHBOARD_CLIENT_WARNING_MS) {
    alerts.push(buildAlert({
      severity: "warning",
      title: "Dashboard client load p95 is slow",
      detail: "Famlo Pro dashboard hydrate/load p95 is above the production target.",
      metric: "dashboard_client_p95_ms",
      value: dashboardClientP95Ms,
      threshold: DASHBOARD_CLIENT_WARNING_MS,
      familyId,
    }));
  }
  if (dashboardServerP95Ms != null && dashboardServerP95Ms > DASHBOARD_SERVER_WARNING_MS) {
    alerts.push(buildAlert({
      severity: "warning",
      title: "Dashboard server render p95 is slow",
      detail: "Famlo Pro dashboard server render p95 is above the production target.",
      metric: "dashboard_server_p95_ms",
      value: dashboardServerP95Ms,
      threshold: DASHBOARD_SERVER_WARNING_MS,
      familyId,
    }));
  }
  if (staleProperties.length > 0) {
    alerts.push(buildAlert({
      severity: "warning",
      title: "Connected properties have stale sync timestamps",
      detail: "At least one connected property has not recorded a recent ARI sync.",
      metric: "stale_properties",
      value: staleProperties.length,
      threshold: 0,
      familyId,
    }));
  }

  const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;
  const warningCount = alerts.filter((alert) => alert.severity === "warning").length;
  const severity: ChannelOpsSeverity = criticalCount > 0 ? "critical" : warningCount > 0 ? "warning" : "healthy";
  const readinessPercent = Math.max(0, Math.min(100, 100 - criticalCount * 12 - warningCount * 5));

  return {
    generatedAt: now.toISOString(),
    lookbackHours,
    familyId,
    severity,
    readinessPercent,
    metrics: {
      queueDepth: queueJobs.length,
      dueQueueDepth: dueQueueJobs.length,
      runningJobs: runningJobs.length,
      staleRunningJobs: staleRunningJobs.length,
      failedJobs: failedJobs.length,
      deadLetteredJobs: deadLetteredJobs.length,
      queueWaitP95Ms,
      queueWaitMaxMs: queueWaitValues.length > 0 ? Math.max(...queueWaitValues) : null,
      oldestQueuedJobAgeMs: queuedAges.length > 0 ? Math.max(...queuedAges) : null,
      unackedAppliedRevisions: unackedAppliedRevisions.length,
      webhookFailures: webhookFailures.length,
      syncLogFailureRate,
      dashboardServerP95Ms,
      dashboardClientP95Ms,
      connectedProperties: connectedProperties.length,
      staleProperties: staleProperties.length,
    },
    alerts,
    recentDeadLetters: deadLetteredJobs.slice(0, 10).map((job) => ({
      id: asString(job.id) ?? "",
      familyId: asString(job.family_id),
      providerCode: asString(job.provider_code),
      jobType: asString(job.job_type),
      lastError: asString(job.last_error),
      updatedAt: asString(job.updated_at) ?? asString(job.dead_lettered_at),
    })),
    runbook: [
      "Open the affected property in Famlo Pro and verify room/rate mappings.",
      "Inspect dead-letter job payload and last_error before retrying.",
      "Run a narrow Channex projection compare for the affected date range.",
      "Replay or acknowledge booking revisions only after Famlo state is confirmed.",
      "Keep provider production mutation flags unchanged unless the rollout owner approves.",
    ],
  };
}

export async function loadChannelOpsReadiness(
  supabase: SupabaseClient,
  options?: {
    familyId?: string | null;
    lookbackHours?: number;
  }
): Promise<ChannelOpsReadiness> {
  const lookbackHours = Math.max(1, Math.min(options?.lookbackHours ?? 24, 168));
  const familyId = options?.familyId?.trim() || null;
  const since = new Date(Date.now() - lookbackHours * 60 * 60_000).toISOString();

  const jobSelect =
    "id,family_id,provider_code,job_type,status,last_error,attempts,max_attempts,run_after,created_at,updated_at,processed_at,dead_lettered_at,result";
  let recentJobsQuery = supabase
    .from("channel_sync_jobs")
    .select(jobSelect)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);
  let openJobsQuery = supabase
    .from("channel_sync_jobs")
    .select(jobSelect)
    .in("status", ["queued", "retrying", "running", "processing", "failed", "failure", "error", "dead_lettered", "critical"])
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1000);
  let revisionsQuery = supabase
    .from("channel_booking_revisions")
    .select("id,family_id,provider_code,status,import_status,ack_status,external_booking_id,updated_at,created_at")
    .gte("created_at", since)
    .order("updated_at", { ascending: false })
    .limit(1000);
  let logsQuery = supabase
    .from("channel_sync_logs")
    .select("id,family_id,provider_code,action,status,message,payload,created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);
  let propertiesQuery = supabase
    .from("channel_properties")
    .select("id,family_id,provider_code,external_property_id,sync_status,last_synced_at,metadata,updated_at")
    .order("updated_at", { ascending: false })
    .limit(1000);

  if (familyId) {
    recentJobsQuery = recentJobsQuery.eq("family_id", familyId);
    openJobsQuery = openJobsQuery.eq("family_id", familyId);
    revisionsQuery = revisionsQuery.eq("family_id", familyId);
    logsQuery = logsQuery.eq("family_id", familyId);
    propertiesQuery = propertiesQuery.eq("family_id", familyId);
  }

  const [recentJobsResult, openJobsResult, revisionsResult, logsResult, propertiesResult] = await Promise.all([
    recentJobsQuery,
    openJobsQuery,
    revisionsQuery,
    logsQuery,
    propertiesQuery,
  ]);

  if (recentJobsResult.error) throw recentJobsResult.error;
  if (openJobsResult.error) throw openJobsResult.error;
  if (revisionsResult.error) throw revisionsResult.error;
  if (logsResult.error) throw logsResult.error;
  if (propertiesResult.error) throw propertiesResult.error;

  return buildChannelOpsReadiness(
    {
      jobs: mergeRowsById(
        (recentJobsResult.data ?? []) as JsonRecord[],
        (openJobsResult.data ?? []) as JsonRecord[]
      ),
      revisions: (revisionsResult.data ?? []) as JsonRecord[],
      logs: (logsResult.data ?? []) as JsonRecord[],
      properties: (propertiesResult.data ?? []) as JsonRecord[],
    },
    { familyId, lookbackHours }
  );
}
