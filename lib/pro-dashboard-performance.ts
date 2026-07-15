export type ProDashboardLoadMetrics = {
  familyId: string;
  initialSection: string;
  generatedAt: string;
  serverRenderMs: number;
  mediaLoadMs: number;
  calendarProjectionMs: number;
  snapshotOnly: boolean;
  preloadBookingWorkspace: boolean;
  preloadCalendarWorkspace: boolean;
  clientHydratedMs?: number | null;
  navigationType?: string | null;
  counts: {
    rooms: number;
    bookings: number;
    calendarRows: number;
    syncLogs: number;
    syncJobs: number;
    bookingRevisions: number;
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNonNegativeNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

export function sanitizeDashboardLoadMetrics(value: unknown): ProDashboardLoadMetrics | null {
  const record = asRecord(value);
  if (!record) return null;

  const familyId = asString(record.familyId);
  if (!familyId) return null;

  const countsRecord = asRecord(record.counts) ?? {};

  return {
    familyId,
    initialSection: asString(record.initialSection) || "dashboard",
    generatedAt: asString(record.generatedAt) || new Date().toISOString(),
    serverRenderMs: asNonNegativeNumber(record.serverRenderMs),
    mediaLoadMs: asNonNegativeNumber(record.mediaLoadMs),
    calendarProjectionMs: asNonNegativeNumber(record.calendarProjectionMs),
    snapshotOnly: asBoolean(record.snapshotOnly),
    preloadBookingWorkspace: asBoolean(record.preloadBookingWorkspace),
    preloadCalendarWorkspace: asBoolean(record.preloadCalendarWorkspace),
    clientHydratedMs: record.clientHydratedMs == null ? null : asNonNegativeNumber(record.clientHydratedMs),
    navigationType: asString(record.navigationType) || null,
    counts: {
      rooms: asNonNegativeNumber(countsRecord.rooms),
      bookings: asNonNegativeNumber(countsRecord.bookings),
      calendarRows: asNonNegativeNumber(countsRecord.calendarRows),
      syncLogs: asNonNegativeNumber(countsRecord.syncLogs),
      syncJobs: asNonNegativeNumber(countsRecord.syncJobs),
      bookingRevisions: asNonNegativeNumber(countsRecord.bookingRevisions),
    },
  };
}
