import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deriveProAccessStatus,
  markExpiredProSubscriptionsPaused,
  normalizeProSubscriptionStatus,
  type ProAccessStatusResult,
  type ProSubscriptionLifecycleStatus,
  type ProSubscriptionRecord,
} from "@/lib/pro-billing/access-status";

type JsonRecord = Record<string, unknown>;

export type HostProSubscriptionStatus = ProSubscriptionLifecycleStatus;

export type HostProAccessResult = {
  allowed: boolean;
  status: HostProSubscriptionStatus;
  current_period_end: string | null;
  grace_until: string | null;
  reason: string;
};

type HostProSubscriptionRow = ProSubscriptionRecord & {
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

function isHostProAccessCompatibilityError(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  const lower = message.toLowerCase();

  return (
    code === "42501" ||
    lower.includes("permission denied") ||
    lower.includes("relation") ||
    lower.includes("does not exist") ||
    lower.includes("schema cache")
  );
}

function toMillis(value: string | null): number | null {
  if (!value) return null;
  const millis = Date.parse(value);
  return Number.isNaN(millis) ? null : millis;
}

function compareRows(left: HostProSubscriptionRow, right: HostProSubscriptionRow, now: Date): number {
  const rank = (row: HostProSubscriptionRow): number => {
    const access = deriveProAccessStatus(row, { now });
    if (access.status === "active") return 7;
    if (access.status === "grace") return 6;
    if (access.status === "payment_failed") return 5;
    if (access.status === "halted") return 4;
    if (access.status === "paused") return 3;
    if (access.status === "inactive") return 2;
    if (access.status === "cancelled") return 1;
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

function toAccessResult(result: ProAccessStatusResult): HostProAccessResult {
  return {
    allowed: result.allowed,
    status: result.status,
    current_period_end: result.currentPeriodEnd,
    grace_until: result.graceUntil,
    reason: result.reason,
  };
}

function mapRow(row: JsonRecord): HostProSubscriptionRow | null {
  const familyId = asString(row.family_id);
  if (!familyId) return null;
  return {
    family_id: familyId,
    status: normalizeProSubscriptionStatus(row.status),
    current_period_start: asString(row.current_period_start),
    current_period_end: asString(row.current_period_end),
    grace_until: asString(row.grace_until),
    created_at: asString(row.created_at),
  };
}

export function isFamloPlusPageEnabled(): boolean {
  return String(process.env.FAMLO_ENABLE_FAMLO_PLUS_PAGE ?? "").trim().toLowerCase() === "true";
}

export function isFamloProDashboardEnabled(): boolean {
  return String(process.env.FAMLO_ENABLE_PRO_DASHBOARD ?? "").trim().toLowerCase() === "true";
}

export function buildBasicHostDashboardHref(familyId: string, tab = "dashboard"): string {
  const params = new URLSearchParams({
    family: familyId,
    tab,
  });
  return `/partnerslogin/home/dashboard?${params.toString()}`;
}

export function buildFamloProDashboardHref(familyId: string, section?: string): string {
  const params = new URLSearchParams({
    family: familyId,
  });

  if (section) {
    params.set("section", section);
  }

  return `/partnerslogin/home/pro/dashboard?${params.toString()}`;
}

export function resolveHostDashboardHref(params: {
  familyId: string;
  proDashboardEnabled: boolean;
  proAccess: Pick<HostProAccessResult, "allowed"> | null | undefined;
  basicTab?: string;
  proSection?: string;
}): string {
  if (params.proDashboardEnabled && params.proAccess?.allowed) {
    return buildFamloProDashboardHref(params.familyId, params.proSection);
  }

  return buildBasicHostDashboardHref(params.familyId, params.basicTab);
}

export async function loadHostProAccess(
  supabase: SupabaseClient,
  familyId: string,
  options?: { now?: Date }
): Promise<HostProAccessResult> {
  const resultMap = await loadHostProAccessMap(supabase, [familyId], options);
  return resultMap[familyId.trim()] ?? DEFAULT_RESULT;
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

  const now = options?.now ?? new Date();
  await markExpiredProSubscriptionsPaused(supabase, now).catch((error) => {
    if (!isHostProAccessCompatibilityError(error)) {
      throw error;
    }
  });

  const { data, error } = await supabase
    .from("host_pro_subscriptions")
    .select("family_id,status,current_period_start,current_period_end,grace_until,created_at")
    .in("family_id", normalizedFamilyIds)
    .order("created_at", { ascending: false });

  if (error) {
    if (isHostProAccessCompatibilityError(error)) {
      return resultMap;
    }
    throw error;
  }

  const rowsByFamilyId = new Map<string, HostProSubscriptionRow[]>();
  for (const row of (Array.isArray(data) ? (data as JsonRecord[]) : [])) {
    const mapped = mapRow(row);
    if (!mapped) continue;
    rowsByFamilyId.set(mapped.family_id, [...(rowsByFamilyId.get(mapped.family_id) ?? []), mapped]);
  }

  for (const familyId of normalizedFamilyIds) {
    const familyRows = rowsByFamilyId.get(familyId) ?? [];
    familyRows.sort((left, right) => compareRows(left, right, now));
    resultMap[familyId] = toAccessResult(deriveProAccessStatus(familyRows[0] ?? null, { now }));
  }

  return resultMap;
}
