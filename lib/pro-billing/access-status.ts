import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

export type ProSubscriptionLifecycleStatus =
  | "inactive"
  | "active"
  | "grace"
  | "halted"
  | "paused"
  | "cancelled"
  | "payment_failed"
  | "expired";

export type ProSubscriptionRecord = {
  id?: string | null;
  family_id?: string | null;
  host_user_id?: string | null;
  billing_order_id?: string | null;
  status?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  paid_until?: string | null;
  active_until?: string | null;
  grace_until?: string | null;
  last_payment_at?: string | null;
  next_charge_at?: string | null;
  last_charge_at?: string | null;
  cancelled_at?: string | null;
  halted_at?: string | null;
  paused_at?: string | null;
  resumed_at?: string | null;
  payment_failed_at?: string | null;
  payment_failure_reason?: string | null;
  provider_subscription_id?: string | null;
  razorpay_plan_id?: string | null;
  razorpay_subscription_id?: string | null;
  billing_mode?: string | null;
  autopay_enabled?: boolean | null;
  autopay_status?: string | null;
  subscription_status?: string | null;
  mandate_status?: string | null;
  last_provider_event_id?: string | null;
  cancel_at_period_end?: boolean | null;
  provider_metadata?: JsonRecord | null;
  metadata?: JsonRecord | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type FamloProEntitlementReason = "active" | "grace" | "expired" | "no_subscription" | "paused" | "locked";

export type FamloProEntitlement = {
  paidActive: boolean;
  inGrace: boolean;
  graceUntil: string | null;
  expiresAt: string | null;
  defaultWorkspace: "pro" | "free";
  proActionsAllowed: boolean;
  reason: FamloProEntitlementReason;
};

export type ProAccessStatusResult = {
  allowed: boolean;
  status: ProSubscriptionLifecycleStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  paidUntil: string | null;
  activeUntil: string | null;
  graceUntil: string | null;
} & FamloProEntitlement;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function addDaysIso(now: Date, days: number): string {
  const copy = new Date(now);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy.toISOString();
}

function toMillis(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function pickLatestIso(...values: (string | null)[]): string | null {
  let latest: { value: string; millis: number } | null = null;
  for (const value of values) {
    const millis = toMillis(value);
    if (value && millis !== null && (!latest || millis > latest.millis)) {
      latest = { value, millis };
    }
  }
  return latest?.value ?? null;
}

export function normalizeProSubscriptionStatus(value: unknown): ProSubscriptionLifecycleStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "active" ||
    normalized === "grace" ||
    normalized === "halted" ||
    normalized === "paused" ||
    normalized === "cancelled" ||
    normalized === "payment_failed" ||
    normalized === "expired"
  ) {
    return normalized;
  }
  return "inactive";
}

function statusRank(value: ProSubscriptionLifecycleStatus): number {
  if (value === "active") return 7;
  if (value === "grace") return 6;
  if (value === "payment_failed") return 5;
  if (value === "halted") return 4;
  if (value === "paused") return 3;
  if (value === "inactive") return 2;
  if (value === "cancelled") return 1;
  return 1;
}

export function computeProRenewalWindow(
  input: {
    paidAtIso: string;
    previousCurrentPeriodEnd?: string | null;
    durationMonths?: 1 | 3 | 6;
  },
  config?: { periodDays?: number; graceDays?: number }
): {
  currentPeriodStart: string;
  currentPeriodEnd: string;
  graceUntil: string;
  nextChargeAt: string;
} {
  const paidAt = new Date(input.paidAtIso);
  const previousEndMillis = toMillis(asString(input.previousCurrentPeriodEnd) ?? null);
  const anchorMillis =
    previousEndMillis !== null && previousEndMillis > paidAt.getTime()
      ? previousEndMillis
      : paidAt.getTime();
  const anchorDate = new Date(anchorMillis);
  const durationMonths = input.durationMonths ?? 1;
  const periodDays = config?.periodDays ?? durationMonths * 30;
  const graceDays = config?.graceDays ?? 7;
  const currentPeriodEnd = addDaysIso(anchorDate, periodDays);
  return {
    currentPeriodStart: input.paidAtIso,
    currentPeriodEnd,
    graceUntil: addDaysIso(new Date(currentPeriodEnd), graceDays),
    nextChargeAt: currentPeriodEnd,
  };
}

export function deriveProAccessStatus(
  subscription: ProSubscriptionRecord | null | undefined,
  options?: { now?: Date }
): ProAccessStatusResult {
  const entitlement = getFamloProEntitlement(subscription, options);
  if (!subscription) {
    return {
      ...entitlement,
      allowed: entitlement.paidActive,
      status: "inactive",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      paidUntil: null,
      activeUntil: null,
      graceUntil: null,
    };
  }

  const explicitStatus = normalizeProSubscriptionStatus(subscription.status);
  const currentPeriodStart = asString(subscription.current_period_start) ?? null;
  const currentPeriodEnd = asString(subscription.current_period_end) ?? null;
  const paidUntil = asString(subscription.paid_until) ?? null;
  const activeUntil = asString(subscription.active_until) ?? null;
  const graceUntil = asString(subscription.grace_until) ?? null;
  const nowMillis = (options?.now ?? new Date()).getTime();
  const periodMillis = toMillis(currentPeriodEnd);
  const graceMillis = toMillis(graceUntil);
  const base = {
    ...entitlement,
    allowed: entitlement.paidActive,
    currentPeriodStart,
    currentPeriodEnd,
    paidUntil,
    activeUntil,
    graceUntil,
  };

  if (explicitStatus === "cancelled") {
    if (periodMillis !== null && nowMillis <= periodMillis) {
      return {
        ...base,
        status: "cancelled",
      };
    }

    return {
      ...base,
      status: "cancelled",
    };
  }

  if (explicitStatus === "payment_failed" || explicitStatus === "halted") {
    const failedStatus = explicitStatus === "halted" ? "halted" : "payment_failed";
    if (periodMillis !== null && nowMillis <= periodMillis) {
      return {
        ...base,
        status: failedStatus,
      };
    }

    if (graceMillis !== null && nowMillis <= graceMillis) {
      return {
        ...base,
        status: failedStatus,
      };
    }

    return {
      ...base,
      status: "paused",
    };
  }

  if (entitlement.paidActive) {
    return {
      ...base,
      status: "active",
    };
  }

  if (graceMillis !== null && nowMillis <= graceMillis) {
    return {
      ...base,
      status: "grace",
    };
  }

  if (currentPeriodEnd || graceUntil || explicitStatus === "expired" || explicitStatus === "paused") {
    return {
      ...base,
      status: "paused",
    };
  }

  return {
    ...base,
    status: explicitStatus,
  };
}

export function getFamloProEntitlement(
  subscription: ProSubscriptionRecord | null | undefined,
  options?: { now?: Date }
): FamloProEntitlement {
  const nowMillis = (options?.now ?? new Date()).getTime();
  if (!subscription) {
    return {
      paidActive: false,
      inGrace: false,
      graceUntil: null,
      expiresAt: null,
      defaultWorkspace: "free",
      proActionsAllowed: false,
      reason: "no_subscription",
    };
  }

  const explicitStatus = normalizeProSubscriptionStatus(subscription.status);
  const currentPeriodEnd = asString(subscription.current_period_end) ?? null;
  const paidUntil = asString(subscription.paid_until) ?? null;
  const activeUntil = asString(subscription.active_until) ?? null;
  const graceUntil = asString(subscription.grace_until) ?? null;
  const expiresAt = pickLatestIso(currentPeriodEnd, paidUntil, activeUntil);
  const expiresAtMillis = toMillis(expiresAt);
  const graceMillis = toMillis(graceUntil);
  const paidActive =
    (explicitStatus === "active" || explicitStatus === "cancelled") &&
    expiresAtMillis !== null &&
    nowMillis <= expiresAtMillis;
  const inGrace = !paidActive && graceMillis !== null && nowMillis <= graceMillis;
  const proActionsAllowed = paidActive;

  let reason: FamloProEntitlementReason;
  if (paidActive) reason = "active";
  else if (explicitStatus === "inactive") reason = "no_subscription";
  else if (explicitStatus === "halted" || explicitStatus === "cancelled") reason = "locked";
  else if (explicitStatus === "paused" || explicitStatus === "payment_failed") reason = "paused";
  else if (inGrace) reason = "grace";
  else if (expiresAt || graceUntil || explicitStatus === "expired") reason = "expired";
  else reason = "no_subscription";

  return {
    paidActive,
    inGrace,
    graceUntil,
    expiresAt,
    defaultWorkspace: paidActive ? "pro" : "free",
    proActionsAllowed,
    reason,
  };
}

export function canUseProFeature(input: {
  subscription?: ProSubscriptionRecord | null;
  now?: Date;
}): boolean {
  return getFamloProEntitlement(input.subscription ?? null, { now: input.now }).proActionsAllowed;
}

function compareSubscriptionPriority(left: ProSubscriptionRecord, right: ProSubscriptionRecord, now: Date): number {
  const rankDiff =
    statusRank(deriveProAccessStatus(right, { now }).status) -
    statusRank(deriveProAccessStatus(left, { now }).status);
  if (rankDiff !== 0) return rankDiff;

  const rightBoundary =
    toMillis(asString(right.current_period_end) ?? null) ??
    toMillis(asString(right.grace_until) ?? null) ??
    toMillis(asString(right.created_at) ?? null) ??
    0;
  const leftBoundary =
    toMillis(asString(left.current_period_end) ?? null) ??
    toMillis(asString(left.grace_until) ?? null) ??
    toMillis(asString(left.created_at) ?? null) ??
    0;

  return rightBoundary - leftBoundary;
}

async function loadSubscriptionsForAccessLookup(
  supabase: SupabaseClient,
  input: { hostUserId?: string | null; familyId?: string | null; roomId?: string | null }
): Promise<ProSubscriptionRecord[]> {
  if (input.roomId) {
    const { data, error } = await supabase
      .from("host_pro_subscription_rooms")
      .select(
        "subscription_id,family_id,status,host_pro_subscriptions!inner(id,family_id,host_user_id,billing_order_id,status,current_period_start,current_period_end,grace_until,last_payment_at,next_charge_at,last_charge_at,cancelled_at,halted_at,paused_at,resumed_at,payment_failed_at,payment_failure_reason,provider_subscription_id,razorpay_plan_id,razorpay_subscription_id,billing_mode,autopay_enabled,autopay_status,subscription_status,mandate_status,last_provider_event_id,cancel_at_period_end,provider_metadata,metadata,created_at,updated_at)"
      )
      .eq("stay_unit_id", input.roomId);
    if (error) throw error;

    return ((data ?? []) as JsonRecord[])
      .map((row) => ((row.host_pro_subscriptions as JsonRecord | null) ?? null))
      .filter((row): row is JsonRecord => Boolean(row))
      .map((row) => ({
        id: asString(row.id),
        family_id: asString(row.family_id),
        host_user_id: asString(row.host_user_id),
        billing_order_id: asString(row.billing_order_id),
        status: asString(row.status),
        current_period_start: asString(row.current_period_start),
        current_period_end: asString(row.current_period_end),
        grace_until: asString(row.grace_until),
        last_payment_at: asString(row.last_payment_at),
        next_charge_at: asString(row.next_charge_at),
        last_charge_at: asString(row.last_charge_at),
        cancelled_at: asString(row.cancelled_at),
        halted_at: asString(row.halted_at),
        paused_at: asString(row.paused_at),
        resumed_at: asString(row.resumed_at),
        payment_failed_at: asString(row.payment_failed_at),
        payment_failure_reason: asString(row.payment_failure_reason),
        provider_subscription_id: asString(row.provider_subscription_id),
        razorpay_plan_id: asString(row.razorpay_plan_id),
        razorpay_subscription_id: asString(row.razorpay_subscription_id),
        billing_mode: asString(row.billing_mode),
        autopay_enabled: row.autopay_enabled === true,
        autopay_status: asString(row.autopay_status),
        subscription_status: asString(row.subscription_status),
        mandate_status: asString(row.mandate_status),
        last_provider_event_id: asString(row.last_provider_event_id),
        cancel_at_period_end: row.cancel_at_period_end === true,
        provider_metadata: (row.provider_metadata as JsonRecord | null) ?? null,
        metadata: (row.metadata as JsonRecord | null) ?? null,
        created_at: asString(row.created_at),
        updated_at: asString(row.updated_at),
      }));
  }

  let query = supabase
    .from("host_pro_subscriptions")
    .select(
      "id,family_id,host_user_id,billing_order_id,status,current_period_start,current_period_end,grace_until,last_payment_at,next_charge_at,last_charge_at,cancelled_at,halted_at,paused_at,resumed_at,payment_failed_at,payment_failure_reason,provider_subscription_id,razorpay_plan_id,razorpay_subscription_id,billing_mode,autopay_enabled,autopay_status,subscription_status,mandate_status,last_provider_event_id,cancel_at_period_end,provider_metadata,metadata,created_at,updated_at"
    );
  if (input.hostUserId) query = query.eq("host_user_id", input.hostUserId);
  if (input.familyId) query = query.eq("family_id", input.familyId);

  const { data, error } = await query.order("created_at", { ascending: false }).limit(20);
  if (error) throw error;

  return ((data ?? []) as JsonRecord[]).map((row) => ({
    id: asString(row.id),
    family_id: asString(row.family_id),
    host_user_id: asString(row.host_user_id),
    billing_order_id: asString(row.billing_order_id),
    status: asString(row.status),
    current_period_start: asString(row.current_period_start),
    current_period_end: asString(row.current_period_end),
    grace_until: asString(row.grace_until),
    last_payment_at: asString(row.last_payment_at),
    next_charge_at: asString(row.next_charge_at),
    last_charge_at: asString(row.last_charge_at),
    cancelled_at: asString(row.cancelled_at),
    halted_at: asString(row.halted_at),
    paused_at: asString(row.paused_at),
    resumed_at: asString(row.resumed_at),
    payment_failed_at: asString(row.payment_failed_at),
    payment_failure_reason: asString(row.payment_failure_reason),
    provider_subscription_id: asString(row.provider_subscription_id),
    razorpay_plan_id: asString(row.razorpay_plan_id),
    razorpay_subscription_id: asString(row.razorpay_subscription_id),
    billing_mode: asString(row.billing_mode),
    autopay_enabled: row.autopay_enabled === true,
    autopay_status: asString(row.autopay_status),
    subscription_status: asString(row.subscription_status),
    mandate_status: asString(row.mandate_status),
    last_provider_event_id: asString(row.last_provider_event_id),
    cancel_at_period_end: row.cancel_at_period_end === true,
    provider_metadata: (row.provider_metadata as JsonRecord | null) ?? null,
    metadata: (row.metadata as JsonRecord | null) ?? null,
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
  }));
}

export async function getProAccessStatus(
  supabase: SupabaseClient,
  input: {
    hostUserId?: string | null;
    familyId?: string | null;
    roomId?: string | null;
    now?: Date;
  }
): Promise<ProAccessStatusResult> {
  const rows = await loadSubscriptionsForAccessLookup(supabase, input);
  if (rows.length === 0) {
    return deriveProAccessStatus(null, { now: input.now });
  }

  const now = input.now ?? new Date();
  rows.sort((left, right) => compareSubscriptionPriority(left, right, now));
  return deriveProAccessStatus(rows[0], { now });
}

export async function markExpiredProSubscriptionsPaused(
  supabase: SupabaseClient,
  now = new Date()
): Promise<{ updatedCount: number }> {
  const { data, error } = await supabase
    .from("host_pro_subscriptions")
    .select("id,status,current_period_start,current_period_end,grace_until,metadata")
    .in("status", ["active", "grace", "paused", "expired", "payment_failed", "halted", "cancelled"]);
  if (error) throw error;

  let updatedCount = 0;
  for (const row of (data ?? []) as JsonRecord[]) {
    const nextStatus = deriveProAccessStatus(
      {
        id: asString(row.id),
        status: asString(row.status),
        current_period_start: asString(row.current_period_start),
        current_period_end: asString(row.current_period_end),
        grace_until: asString(row.grace_until),
        metadata: (row.metadata as JsonRecord | null) ?? null,
      },
      { now }
    ).status;
    const currentStatus = normalizeProSubscriptionStatus(row.status);
    if (nextStatus === currentStatus) continue;

    const { error: updateError } = await supabase
      .from("host_pro_subscriptions")
      .update({
        status: nextStatus,
        updated_at: now.toISOString(),
      } as never)
      .eq("id", String(row.id));
    if (updateError) throw updateError;
    updatedCount += 1;
  }

  return { updatedCount };
}
