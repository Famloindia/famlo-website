import crypto from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isPayoutAdminApprovalRequired,
  isPayoutAutoRetryEnabled,
  isRazorpayXEnabled,
  isSettlementPayoutExecutionEnabled,
} from "@/lib/finance/feature-flags";
import { appendFinanceAuditLog } from "@/lib/finance/operations";
import type { HostPayoutExecutionStatus } from "@/lib/finance/provider-contracts";
import { createRazorpayXPayout, isRazorpayXConfigured } from "@/lib/razorpay";

type JsonRecord = Record<string, unknown>;

type SettlementRow = {
  id: string;
  host_id: string;
  host_user_id?: string | null;
  status?: string | null;
  net_payable_amount?: number | null;
  currency?: string | null;
  transfer_reference?: string | null;
  provider?: string | null;
};

type SettlementLineItemRow = {
  booking_id?: string | null;
  metadata?: JsonRecord | null;
};

type HostPayoutAccountRow = {
  id: string;
  host_id: string;
  provider: string;
  provider_fund_account_id?: string | null;
  validation_status?: string | null;
  is_active?: boolean | null;
};

type HostTaxDetailsRow = {
  verification_status?: string | null;
  is_verified?: boolean | null;
};

type BookingSummaryRow = {
  id: string;
  status?: string | null;
  payment_status?: string | null;
  legacy_booking_id?: string | null;
};

type RefundRequestRow = {
  booking_id?: string | null;
  status?: string | null;
};

type ExistingExecutionRow = {
  id: string;
  status?: string | null;
  provider_payout_id?: string | null;
  amount?: number | null;
  reference_id?: string | null;
};

type DisputeRow = {
  payout_frozen?: boolean | null;
  status?: string | null;
};

export type SettlementPayoutExecutionResult = {
  payoutExecutionId: string;
  settlementId: string;
  settlementStatus: string;
  payoutStatus: HostPayoutExecutionStatus;
  provider: "RAZORPAYX";
  providerPayoutId: string | null;
  referenceId: string;
  amount: number;
  providerExecutionAttempted: boolean;
};

export type PayoutWebhookTransitionResult = {
  payoutExecutionId: string | null;
  settlementId: string | null;
  payoutStatus: HostPayoutExecutionStatus | null;
  settlementStatus: string | null;
  ignored: boolean;
};

export type PayoutExecutionDependencies = {
  isSettlementPayoutExecutionEnabled?: () => boolean;
  isPayoutAdminApprovalRequired?: () => boolean;
  isPayoutAutoRetryEnabled?: () => boolean;
  isRazorpayXEnabled?: () => boolean;
  isRazorpayXConfigured?: () => boolean;
  createPayout?: typeof createRazorpayXPayout;
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

function isPanApproved(row: HostTaxDetailsRow | null): boolean {
  if (!row) return false;
  if (row.is_verified === true) return true;
  const status = normalizeStatus(row.verification_status);
  return status === "verified" || status === "approved";
}

function isActiveExecutionStatus(status: unknown): boolean {
  const normalized = normalizeStatus(status);
  return normalized === "created" || normalized === "submitted" || normalized === "processing";
}

function mapProviderSubmissionStatus(status: string | null | undefined): HostPayoutExecutionStatus {
  const normalized = normalizeStatus(status);
  if (normalized === "processing" || normalized === "queued" || normalized === "pending") return "processing";
  if (normalized === "failed" || normalized === "rejected") return "failed";
  return "submitted";
}

export function resolvePayoutWebhookOutcome(eventName: string, payoutStatus: string | null | undefined): {
  payoutStatus: HostPayoutExecutionStatus;
  settlementStatus: string;
  markProcessedAt: boolean;
} {
  const normalizedEvent = normalizeStatus(eventName);
  const normalizedStatus = normalizeStatus(payoutStatus);

  if (normalizedEvent === "payout.processed" || normalizedStatus === "processed") {
    return { payoutStatus: "processed", settlementStatus: "paid", markProcessedAt: true };
  }
  if (normalizedEvent === "payout.reversed" || normalizedStatus === "reversed") {
    return { payoutStatus: "reversed", settlementStatus: "needs_review", markProcessedAt: true };
  }
  if (normalizedEvent === "payout.failed" || normalizedStatus === "failed" || normalizedStatus === "rejected") {
    return { payoutStatus: "failed", settlementStatus: "payout_failed", markProcessedAt: true };
  }
  if (normalizedEvent === "payout.cancelled" || normalizedStatus === "cancelled") {
    return { payoutStatus: "cancelled", settlementStatus: "needs_review", markProcessedAt: true };
  }
  return { payoutStatus: "processing", settlementStatus: "payout_processing", markProcessedAt: false };
}

async function loadSettlement(supabase: SupabaseClient, settlementId: string): Promise<SettlementRow> {
  const { data, error } = await supabase.from("host_settlements_v2").select("*").eq("id", settlementId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Settlement not found.");
  return data as SettlementRow;
}

async function loadSettlementLineItems(supabase: SupabaseClient, settlementId: string): Promise<SettlementLineItemRow[]> {
  const { data, error } = await supabase
    .from("settlement_line_items_v2")
    .select("booking_id,metadata")
    .eq("settlement_id", settlementId);
  if (error) throw error;
  return (data as SettlementLineItemRow[] | null) ?? [];
}

async function loadActivePayoutAccount(supabase: SupabaseClient, hostId: string): Promise<HostPayoutAccountRow | null> {
  const { data, error } = await supabase
    .from("host_payout_accounts")
    .select("*")
    .eq("host_id", hostId)
    .eq("provider", "RAZORPAYX")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .maybeSingle();
  if (error) throw error;
  return (data as HostPayoutAccountRow | null) ?? null;
}

async function loadHostTaxDetails(supabase: SupabaseClient, hostUserId: string | null): Promise<HostTaxDetailsRow | null> {
  if (!hostUserId) return null;
  const { data, error } = await supabase
    .from("host_tax_details")
    .select("verification_status,is_verified")
    .eq("user_id", hostUserId)
    .maybeSingle();
  if (error) throw error;
  return (data as HostTaxDetailsRow | null) ?? null;
}

async function loadBookingSummaries(supabase: SupabaseClient, bookingIds: string[]): Promise<BookingSummaryRow[]> {
  if (bookingIds.length === 0) return [];
  const { data, error } = await supabase
    .from("bookings_v2")
    .select("id,status,payment_status,legacy_booking_id")
    .in("id", bookingIds);
  if (error) throw error;
  return (data as BookingSummaryRow[] | null) ?? [];
}

async function loadOpenRefundRequests(supabase: SupabaseClient, bookingIds: string[]): Promise<RefundRequestRow[]> {
  if (bookingIds.length === 0) return [];
  const { data, error } = await supabase
    .from("refund_requests")
    .select("booking_id,status")
    .in("booking_id", bookingIds)
    .in("status", ["requested", "approved", "processing"]);
  if (error) throw error;
  return (data as RefundRequestRow[] | null) ?? [];
}

async function loadOpenDisputes(supabase: SupabaseClient, legacyBookingIds: string[]): Promise<DisputeRow[]> {
  if (legacyBookingIds.length === 0) return [];
  const { data, error } = await supabase
    .from("disputes")
    .select("payout_frozen,status")
    .in("booking_id", legacyBookingIds);
  if (error) throw error;
  return (data as DisputeRow[] | null) ?? [];
}

async function loadExistingActiveExecution(supabase: SupabaseClient, settlementId: string): Promise<ExistingExecutionRow | null> {
  const { data, error } = await supabase
    .from("host_payout_executions")
    .select("id,status,provider_payout_id,amount,reference_id")
    .eq("settlement_id", settlementId)
    .in("status", ["created", "submitted", "processing"])
    .order("created_at", { ascending: false })
    .maybeSingle();
  if (error) throw error;
  return (data as ExistingExecutionRow | null) ?? null;
}

function assertSettlementReadyForPayout(
  settlement: SettlementRow,
  bookingSummaries: BookingSummaryRow[],
  refundRequests: RefundRequestRow[],
  disputes: DisputeRow[],
  payoutAccount: HostPayoutAccountRow | null,
  hostTaxDetails: HostTaxDetailsRow | null
): void {
  if (normalizeStatus(settlement.status) !== "approved") {
    throw new Error("Only approved settlements can initiate payout execution.");
  }
  if (asNumber(settlement.net_payable_amount) <= 0) {
    throw new Error("Settlement payout requires a positive net payable amount.");
  }
  if (!payoutAccount || payoutAccount.is_active !== true || !asString(payoutAccount.provider_fund_account_id)) {
    throw new Error("Active RazorpayX payout account is required before payout execution.");
  }
  if (!isPanApproved(hostTaxDetails)) {
    throw new Error("Host PAN/KYC approval is required before payout execution.");
  }
  if (refundRequests.length > 0) {
    throw new Error("Settlement payout is blocked while a refund request is pending review or processing.");
  }
  if (disputes.some((row) => row.payout_frozen === true)) {
    throw new Error("Settlement payout is blocked due to an active dispute or payout hold.");
  }
  if (
    bookingSummaries.some((row) => {
      const bookingStatus = normalizeStatus(row.status);
      const paymentStatus = normalizeStatus(row.payment_status);
      return (
        bookingStatus === "cancelled" ||
        bookingStatus === "canceled" ||
        paymentStatus === "refund_pending" ||
        paymentStatus === "partially_refunded" ||
        paymentStatus === "refunded"
      );
    })
  ) {
    throw new Error("Settlement payout is blocked because one or more included bookings have cancellation or refund hold state.");
  }
}

export async function initiateApprovedSettlementPayout(
  supabase: SupabaseClient,
  input: {
    settlementId: string;
    actorUserId?: string | null;
    explicitAdminAction?: boolean;
  },
  dependencies: PayoutExecutionDependencies = {}
): Promise<SettlementPayoutExecutionResult> {
  const payoutExecutionEnabled = (dependencies.isSettlementPayoutExecutionEnabled ?? isSettlementPayoutExecutionEnabled)();
  const adminApprovalRequired = (dependencies.isPayoutAdminApprovalRequired ?? isPayoutAdminApprovalRequired)();
  const razorpayXEnabled = (dependencies.isRazorpayXEnabled ?? isRazorpayXEnabled)();
  const razorpayXConfigured = (dependencies.isRazorpayXConfigured ?? isRazorpayXConfigured)();

  if (!payoutExecutionEnabled || !razorpayXEnabled) {
    throw new Error("Settlement payout execution is disabled.");
  }
  if (adminApprovalRequired && !input.explicitAdminAction) {
    throw new Error("Explicit admin payout action is required.");
  }

  const settlement = await loadSettlement(supabase, input.settlementId);
  const existingExecution = await loadExistingActiveExecution(supabase, input.settlementId);
  if (existingExecution && isActiveExecutionStatus(existingExecution.status)) {
    throw new Error("An active payout execution already exists for this settlement.");
  }

  const lineItems = await loadSettlementLineItems(supabase, input.settlementId);
  const bookingIds = Array.from(new Set(lineItems.map((row) => asString(row.booking_id)).filter(Boolean))) as string[];
  const [payoutAccount, hostTaxDetails, bookingSummaries, refundRequests] = await Promise.all([
    loadActivePayoutAccount(supabase, settlement.host_id),
    loadHostTaxDetails(supabase, asString(settlement.host_user_id)),
    loadBookingSummaries(supabase, bookingIds),
    loadOpenRefundRequests(supabase, bookingIds),
  ]);
  const legacyBookingIds = bookingSummaries.map((row) => asString(row.legacy_booking_id)).filter(Boolean) as string[];
  const disputes = await loadOpenDisputes(supabase, legacyBookingIds);

  assertSettlementReadyForPayout(settlement, bookingSummaries, refundRequests, disputes, payoutAccount, hostTaxDetails);

  if (!razorpayXConfigured) {
    throw new Error("RazorpayX is not configured.");
  }

  const payoutExecutionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const amount = asNumber(settlement.net_payable_amount);
  const referenceId = payoutExecutionId;

  const { error: createError } = await supabase.from("host_payout_executions").insert({
    id: payoutExecutionId,
    settlement_id: settlement.id,
    host_id: settlement.host_id,
    provider: "RAZORPAYX",
    provider_fund_account_id: payoutAccount?.provider_fund_account_id ?? null,
    amount,
    currency: asString(settlement.currency) ?? "INR",
    reference_id: referenceId,
    status: "created",
    failure_reason: null,
    raw_response: {},
    initiated_by: input.actorUserId ?? null,
    initiated_at: now,
    processed_at: null,
    created_at: now,
    updated_at: now,
  } as never);
  if (createError) throw createError;

  await supabase
    .from("host_settlements_v2")
    .update({
      status: "payout_pending",
      provider: "razorpayx",
      updated_at: now,
    } as never)
    .eq("id", settlement.id);

  try {
    const payout = await (dependencies.createPayout ?? createRazorpayXPayout)({
      fundAccountId: String(payoutAccount?.provider_fund_account_id ?? ""),
      amountRupees: amount,
      referenceId,
      narration: "Famlo host settlement payout",
      purpose: "payout",
      notes: {
        settlement_id: settlement.id,
        payout_execution_id: payoutExecutionId,
        host_id: settlement.host_id,
      },
    });

    const payoutStatus = mapProviderSubmissionStatus(payout.status);
    await supabase
      .from("host_payout_executions")
      .update({
        provider_payout_id: payout.id,
        raw_response: payout as unknown as JsonRecord,
        status: payoutStatus,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", payoutExecutionId);

    const settlementStatus = payoutStatus === "processing" ? "payout_processing" : "payout_pending";
    await supabase
      .from("host_settlements_v2")
      .update({
        status: settlementStatus,
        transfer_reference: payout.id,
        provider: "razorpayx",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", settlement.id);

    await appendFinanceAuditLog(supabase, {
      actorUserId: input.actorUserId ?? null,
      actionType: "settlement_payout_initiated",
      resourceType: "host_settlement",
      resourceId: settlement.id,
      beforeValue: settlement as unknown as JsonRecord,
      afterValue: {
        payoutExecutionId,
        providerPayoutId: payout.id,
        payoutStatus,
        settlementStatus,
      },
      reason: "manual_settlement_payout_execution",
    });

    return {
      payoutExecutionId,
      settlementId: settlement.id,
      settlementStatus,
      payoutStatus,
      provider: "RAZORPAYX",
      providerPayoutId: payout.id,
      referenceId,
      amount,
      providerExecutionAttempted: true,
    };
  } catch (error) {
    const failedAt = new Date().toISOString();
    await supabase
      .from("host_payout_executions")
      .update({
        status: "failed",
        failure_reason: error instanceof Error ? error.message : "Payout provider execution failed.",
        updated_at: failedAt,
        raw_response: {},
      } as never)
      .eq("id", payoutExecutionId);

    await supabase
      .from("host_settlements_v2")
      .update({
        status: "payout_failed",
        failed_at: failedAt,
        provider: "razorpayx",
        updated_at: failedAt,
      } as never)
      .eq("id", settlement.id);

    throw error;
  }
}

export async function applyRazorpayXPayoutWebhook(
  supabase: SupabaseClient,
  input: {
    eventName: string;
    providerPayoutId?: string | null;
    referenceId?: string | null;
    providerStatus?: string | null;
    rawPayload: JsonRecord;
  }
): Promise<PayoutWebhookTransitionResult> {
  const providerPayoutId = asString(input.providerPayoutId);
  const referenceId = asString(input.referenceId);

  const lookup = providerPayoutId
    ? await supabase
        .from("host_payout_executions")
        .select("*")
        .eq("provider", "RAZORPAYX")
        .eq("provider_payout_id", providerPayoutId)
        .maybeSingle()
    : referenceId
      ? await supabase
          .from("host_payout_executions")
          .select("*")
          .eq("reference_id", referenceId)
          .maybeSingle()
      : { data: null, error: null };
  if (lookup.error) throw lookup.error;

  const execution = lookup.data as (JsonRecord & {
    id?: string;
    settlement_id?: string;
    status?: string;
    amount?: number;
  }) | null;
  if (!execution?.id || !execution.settlement_id) {
    return {
      payoutExecutionId: null,
      settlementId: null,
      payoutStatus: null,
      settlementStatus: null,
      ignored: true,
    };
  }

  const outcome = resolvePayoutWebhookOutcome(input.eventName, input.providerStatus);
  const currentStatus = normalizeStatus(execution.status);
  if (currentStatus === outcome.payoutStatus) {
    return {
      payoutExecutionId: String(execution.id),
      settlementId: String(execution.settlement_id),
      payoutStatus: outcome.payoutStatus,
      settlementStatus: outcome.settlementStatus,
      ignored: true,
    };
  }

  const now = new Date().toISOString();
  await supabase
    .from("host_payout_executions")
    .update({
      status: outcome.payoutStatus,
      provider_payout_id: providerPayoutId ?? asString(execution.provider_payout_id) ?? null,
      processed_at: outcome.markProcessedAt ? now : null,
      failure_reason:
        outcome.payoutStatus === "failed"
          ? asString((input.rawPayload?.payload as JsonRecord | undefined)?.payout)
          : null,
      raw_response: input.rawPayload,
      updated_at: now,
    } as never)
    .eq("id", execution.id);

  const settlementUpdate: Record<string, unknown> = {
    status: outcome.settlementStatus,
    provider: "razorpayx",
    transfer_reference: providerPayoutId ?? referenceId ?? null,
    updated_at: now,
  };
  if (outcome.settlementStatus === "paid") settlementUpdate.paid_at = now;
  if (outcome.settlementStatus === "payout_failed") settlementUpdate.failed_at = now;
  if (outcome.settlementStatus === "needs_review") settlementUpdate.failed_at = now;

  await supabase.from("host_settlements_v2").update(settlementUpdate as never).eq("id", execution.settlement_id);

  return {
    payoutExecutionId: String(execution.id),
    settlementId: String(execution.settlement_id),
    payoutStatus: outcome.payoutStatus,
    settlementStatus: outcome.settlementStatus,
    ignored: false,
  };
}

export function isPayoutAutoRetryAllowed(dependencies: Pick<PayoutExecutionDependencies, "isPayoutAutoRetryEnabled"> = {}): boolean {
  return (dependencies.isPayoutAutoRetryEnabled ?? isPayoutAutoRetryEnabled)();
}
