import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

export type HostProSubscriptionStatus = "inactive" | "active" | "grace" | "expired" | "cancelled";

export type HostProAccessResult = {
  allowed: boolean;
  status: HostProSubscriptionStatus;
  current_period_end: string | null;
  grace_until: string | null;
  reason: string;
};

type HostProSubscriptionRow = {
  family_id: string;
  status: HostProSubscriptionStatus | null;
  current_period_end: string | null;
  grace_until: string | null;
  created_at: string | null;
};

const DEFAULT_RESULT: HostProAccessResult = {
  allowed: false,
  status: "inactive",
  current_period_end: null,
  grace_until: null,
  reason: "no_subscription",
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStatus(value: unknown): HostProSubscriptionStatus {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "active" || status === "grace" || status === "expired" || status === "cancelled") {
    return status;
  }
  return "inactive";
}

function toMillis(value: string | null): number | null {
  if (!value) return null;
  const millis = Date.parse(value);
  return Number.isNaN(millis) ? null : millis;
}

function compareRows(left: HostProSubscriptionRow, right: HostProSubscriptionRow): number {
  const rank = (row: HostProSubscriptionRow): number => {
    const status = asStatus(row.status);
    if (status === "active") return 5;
    if (status === "grace") return 4;
    if (status === "inactive") return 3;
    if (status === "cancelled") return 2;
    return 1;
  };

  const rankDiff = rank(right) - rank(left);
  if (rankDiff !== 0) return rankDiff;

  const rightBoundary =
    toMillis(right.current_period_end) ??
    toMillis(right.grace_until) ??
    toMillis(right.created_at) ??
    0;
  const leftBoundary =
    toMillis(left.current_period_end) ??
    toMillis(left.grace_until) ??
    toMillis(left.created_at) ??
    0;

  return rightBoundary - leftBoundary;
}

function evaluateRow(row: HostProSubscriptionRow | null | undefined, now: Date): HostProAccessResult {
  if (!row) return DEFAULT_RESULT;

  const status = asStatus(row.status);
  const currentPeriodEnd = asString(row.current_period_end);
  const graceUntil = asString(row.grace_until);
  const nowMillis = now.getTime();

  if (status === "active") {
    const periodMillis = toMillis(currentPeriodEnd);
    if (periodMillis !== null && nowMillis <= periodMillis) {
      return {
        allowed: true,
        status,
        current_period_end: currentPeriodEnd,
        grace_until: graceUntil,
        reason: "active_period",
      };
    }

    return {
      allowed: false,
      status,
      current_period_end: currentPeriodEnd,
      grace_until: graceUntil,
      reason: periodMillis === null ? "missing_period_end" : "active_period_ended",
    };
  }

  if (status === "grace") {
    const graceMillis = toMillis(graceUntil);
    if (graceMillis !== null && nowMillis <= graceMillis) {
      return {
        allowed: true,
        status,
        current_period_end: currentPeriodEnd,
        grace_until: graceUntil,
        reason: "grace_period",
      };
    }

    return {
      allowed: false,
      status,
      current_period_end: currentPeriodEnd,
      grace_until: graceUntil,
      reason: graceMillis === null ? "missing_grace_until" : "grace_period_ended",
    };
  }

  return {
    allowed: false,
    status,
    current_period_end: currentPeriodEnd,
    grace_until: graceUntil,
    reason: status === "cancelled" ? "subscription_cancelled" : status === "expired" ? "subscription_expired" : "subscription_inactive",
  };
}

export function isFamloPlusPageEnabled(): boolean {
  return String(process.env.FAMLO_ENABLE_FAMLO_PLUS_PAGE ?? "").trim().toLowerCase() === "true";
}

export function isFamloProDashboardEnabled(): boolean {
  return String(process.env.FAMLO_ENABLE_PRO_DASHBOARD ?? "").trim().toLowerCase() === "true";
}

export async function loadHostProAccess(
  supabase: SupabaseClient,
  familyId: string,
  options?: { now?: Date }
): Promise<HostProAccessResult> {
  const normalizedFamilyId = familyId.trim();
  if (!normalizedFamilyId) {
    return {
      ...DEFAULT_RESULT,
      reason: "missing_family_id",
    };
  }

  const { data, error } = await supabase
    .from("host_pro_subscriptions")
    .select("family_id,status,current_period_end,grace_until,created_at")
    .eq("family_id", normalizedFamilyId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    const message = String(error.message ?? "");
    if (/relation|does not exist|schema cache/i.test(message)) {
      return DEFAULT_RESULT;
    }
    throw error;
  }

  const rows = Array.isArray(data) ? (data as HostProSubscriptionRow[]) : [];
  rows.sort(compareRows);
  return evaluateRow(rows[0] ?? null, options?.now ?? new Date());
}

export async function loadHostProAccessMap(
  supabase: SupabaseClient,
  familyIds: string[],
  options?: { now?: Date }
): Promise<Record<string, HostProAccessResult>> {
  const normalizedFamilyIds = Array.from(new Set(familyIds.map((familyId) => familyId.trim()).filter(Boolean)));
  const resultMap: Record<string, HostProAccessResult> = {};

  for (const familyId of normalizedFamilyIds) {
    resultMap[familyId] = DEFAULT_RESULT;
  }

  if (normalizedFamilyIds.length === 0) {
    return resultMap;
  }

  const { data, error } = await supabase
    .from("host_pro_subscriptions")
    .select("family_id,status,current_period_end,grace_until,created_at")
    .in("family_id", normalizedFamilyIds)
    .order("created_at", { ascending: false });

  if (error) {
    const message = String(error.message ?? "");
    if (/relation|does not exist|schema cache/i.test(message)) {
      return resultMap;
    }
    throw error;
  }

  const rows = Array.isArray(data) ? (data as JsonRecord[]) : [];
  const rowsByFamilyId = new Map<string, HostProSubscriptionRow[]>();

  for (const row of rows) {
    const familyId = asString(row.family_id);
    if (!familyId) continue;
    const nextRow: HostProSubscriptionRow = {
      family_id: familyId,
      status: asStatus(row.status),
      current_period_end: asString(row.current_period_end),
      grace_until: asString(row.grace_until),
      created_at: asString(row.created_at),
    };

    rowsByFamilyId.set(familyId, [...(rowsByFamilyId.get(familyId) ?? []), nextRow]);
  }

  for (const familyId of normalizedFamilyIds) {
    const familyRows = rowsByFamilyId.get(familyId) ?? [];
    familyRows.sort(compareRows);
    resultMap[familyId] = evaluateRow(familyRows[0] ?? null, options?.now ?? new Date());
  }

  return resultMap;
}
