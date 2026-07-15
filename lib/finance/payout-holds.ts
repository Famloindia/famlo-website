import type { SupabaseClient } from "@supabase/supabase-js";

import { appendFinanceAuditLog } from "@/lib/finance/operations";
import { asString, type JsonRecord } from "@/lib/platform-utils";

export type PayoutHoldStatus = "active" | "on_hold" | "paused";
export type PayoutHoldTargetType = "host" | "property" | "settlement" | "payout_execution";

export type PayoutHoldSnapshot = {
  status: PayoutHoldStatus;
  reason: string | null;
  isHostActionable: boolean;
  source: PayoutHoldTargetType | null;
};

type HoldMutationInput = {
  targetType: PayoutHoldTargetType;
  targetId: string;
  actorUserId?: string | null;
  reason?: string | null;
  isHostActionable?: boolean;
  pause?: boolean;
};

function normalizeStatus(value: unknown): PayoutHoldStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "on_hold") return "on_hold";
  if (normalized === "paused") return "paused";
  return "active";
}

function getTargetConfig(targetType: PayoutHoldTargetType): {
  table: string;
  resourceType: string;
} {
  if (targetType === "host") return { table: "hosts", resourceType: "host" };
  if (targetType === "property") return { table: "families", resourceType: "property" };
  if (targetType === "settlement") return { table: "host_settlements_v2", resourceType: "host_settlement" };
  return { table: "host_payout_executions", resourceType: "host_payout_execution" };
}

function maskAdminOnlyReason(reason: string | null, isHostActionable: boolean): string | null {
  if (!reason) return null;
  return isHostActionable ? reason : null;
}

export function describeHostSafePayoutBlock(input: {
  payoutHoldStatus?: string | null;
  payoutHoldReason?: string | null;
  payoutHoldIsHostActionable?: boolean | null;
  complianceBlocked?: boolean;
}): string | null {
  const holdStatus = normalizeStatus(input.payoutHoldStatus);
  if (holdStatus === "on_hold" || holdStatus === "paused") {
    if (input.payoutHoldIsHostActionable) {
      return maskAdminOnlyReason(input.payoutHoldReason ?? "Action required", true) ?? "Action required";
    }
    return "Payout on hold";
  }
  if (input.complianceBlocked) return "Action required";
  return null;
}

export async function loadPayoutHoldSnapshot(
  supabase: SupabaseClient,
  input: {
    hostId: string;
    propertyId?: string | null;
    settlementId?: string | null;
    payoutExecutionId?: string | null;
  }
): Promise<PayoutHoldSnapshot> {
  const [hostResult, propertyResult, settlementResult, executionResult] = await Promise.all([
    supabase
      .from("hosts")
      .select("payout_hold_status,payout_hold_reason,payout_hold_is_host_actionable")
      .eq("id", input.hostId)
      .maybeSingle(),
    input.propertyId
      ? supabase
          .from("families")
          .select("payout_hold_status,payout_hold_reason,payout_hold_is_host_actionable")
          .eq("id", input.propertyId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.settlementId
      ? supabase
          .from("host_settlements_v2")
          .select("payout_hold_status,payout_hold_reason,payout_hold_is_host_actionable")
          .eq("id", input.settlementId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.payoutExecutionId
      ? supabase
          .from("host_payout_executions")
          .select("payout_hold_status,payout_hold_reason,payout_hold_is_host_actionable")
          .eq("id", input.payoutExecutionId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (hostResult.error) throw hostResult.error;
  if (propertyResult.error) throw propertyResult.error;
  if (settlementResult.error) throw settlementResult.error;
  if (executionResult.error) throw executionResult.error;

  const ordered = [
    { source: "payout_execution" as const, row: executionResult.data as JsonRecord | null },
    { source: "settlement" as const, row: settlementResult.data as JsonRecord | null },
    { source: "property" as const, row: propertyResult.data as JsonRecord | null },
    { source: "host" as const, row: hostResult.data as JsonRecord | null },
  ];

  for (const entry of ordered) {
    const status = normalizeStatus(entry.row?.payout_hold_status);
    if (status === "on_hold" || status === "paused") {
      return {
        status,
        reason: asString(entry.row?.payout_hold_reason),
        isHostActionable: entry.row?.payout_hold_is_host_actionable === true,
        source: entry.source,
      };
    }
  }

  return {
    status: "active",
    reason: null,
    isHostActionable: false,
    source: null,
  };
}

export async function holdPayoutTarget(
  supabase: SupabaseClient,
  input: HoldMutationInput
): Promise<{ targetType: PayoutHoldTargetType; targetId: string; status: PayoutHoldStatus }> {
  const config = getTargetConfig(input.targetType);
  const { data: existing, error: existingError } = await supabase
    .from(config.table)
    .select("*")
    .eq("id", input.targetId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error("Payout hold target not found.");

  const now = new Date().toISOString();
  const nextStatus: PayoutHoldStatus = input.pause ? "paused" : "on_hold";
  const { error } = await supabase
    .from(config.table)
    .update({
      payout_hold_status: nextStatus,
      payout_hold_reason: input.reason ?? null,
      payout_hold_is_host_actionable: input.isHostActionable === true,
      payout_hold_created_by: input.actorUserId ?? null,
      payout_hold_created_at: now,
      payout_hold_released_by: null,
      payout_hold_released_at: null,
      updated_at: now,
    } as never)
    .eq("id", input.targetId);
  if (error) throw error;

  await appendFinanceAuditLog(supabase, {
    actorUserId: input.actorUserId ?? null,
    actionType: nextStatus === "paused" ? "payout_hold_paused" : "payout_hold_applied",
    resourceType: config.resourceType,
    resourceId: input.targetId,
    beforeValue: existing as JsonRecord,
    afterValue: {
      payout_hold_status: nextStatus,
      payout_hold_reason: input.reason ?? null,
      payout_hold_is_host_actionable: input.isHostActionable === true,
    },
    reason: input.reason ?? (nextStatus === "paused" ? "manual_payout_pause" : "manual_payout_hold"),
  });

  return { targetType: input.targetType, targetId: input.targetId, status: nextStatus };
}

export async function releasePayoutHold(
  supabase: SupabaseClient,
  input: {
    targetType: PayoutHoldTargetType;
    targetId: string;
    actorUserId?: string | null;
    reason?: string | null;
  }
): Promise<{ targetType: PayoutHoldTargetType; targetId: string; status: "active" }> {
  const config = getTargetConfig(input.targetType);
  const { data: existing, error: existingError } = await supabase
    .from(config.table)
    .select("*")
    .eq("id", input.targetId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error("Payout hold target not found.");

  const now = new Date().toISOString();
  const { error } = await supabase
    .from(config.table)
    .update({
      payout_hold_status: "active",
      payout_hold_reason: null,
      payout_hold_is_host_actionable: false,
      payout_hold_released_by: input.actorUserId ?? null,
      payout_hold_released_at: now,
      updated_at: now,
    } as never)
    .eq("id", input.targetId);
  if (error) throw error;

  await appendFinanceAuditLog(supabase, {
    actorUserId: input.actorUserId ?? null,
    actionType: "payout_hold_released",
    resourceType: config.resourceType,
    resourceId: input.targetId,
    beforeValue: existing as JsonRecord,
    afterValue: { payout_hold_status: "active" },
    reason: input.reason ?? "manual_payout_hold_release",
  });

  return { targetType: input.targetType, targetId: input.targetId, status: "active" };
}
