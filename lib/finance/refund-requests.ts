import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isCashfreeRefundsEnabled,
  isRazorpayRefundsEnabled,
  isRefundAdminApprovalRequired,
  isRefundProviderExecutionEnabled,
} from "@/lib/finance/feature-flags";
import { calculateRefundPolicy, type RefundPolicyCase, type RefundPolicyInput } from "@/lib/finance/refund-policy";
import { clampMoney } from "@/lib/finance/money";
import { createCashfreeRefund, isCashfreeConfigured } from "@/lib/cashfree";
import { createRazorpayRefund, isRazorpayConfigured } from "@/lib/razorpay";

type JsonRecord = Record<string, unknown>;

export type RefundablePaymentRecord = {
  id: string;
  booking_id: string;
  amount_total: number;
  tax_amount?: number | null;
  gateway?: string | null;
  gateway_order_id?: string | null;
  gateway_payment_id?: string | null;
  refund_status?: string | null;
  status?: string | null;
};

export type RefundRequestDraftInput = {
  bookingId: string;
  paymentId: string;
  reason: string;
  policyInput: RefundPolicyInput;
  actorUserId?: string | null;
  requiresAdminApproval?: boolean;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isCapturedPaymentStatus(status: unknown): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "paid" || normalized === "captured";
}

export function assertRefundableCapturedPayment(payment: RefundablePaymentRecord): void {
  if (!payment?.id || !payment?.booking_id) {
    throw new Error("Refund requires a valid payment and booking reference.");
  }
  if (!isCapturedPaymentStatus(payment.status)) {
    throw new Error("Only captured or paid payments can be refunded.");
  }
}

export function shouldRequireAdminRefundApproval(): boolean {
  return isRefundAdminApprovalRequired();
}

export function canExecuteRefundProvider(): boolean {
  return isRefundProviderExecutionEnabled() && (isRazorpayRefundsEnabled() || isCashfreeRefundsEnabled());
}

export function resolveRefundWebhookTransition(eventName: string): {
  refundStatus: "pending" | "processed" | "failed";
  attemptStatus: "submitted" | "processed" | "failed";
  requestStatus: "processing" | "processed" | "failed";
  shouldFinalizeFolio: boolean;
} {
  switch (eventName) {
    case "refund.processed":
      return {
        refundStatus: "processed",
        attemptStatus: "processed",
        requestStatus: "processed",
        shouldFinalizeFolio: true,
      };
    case "refund.failed":
      return {
        refundStatus: "failed",
        attemptStatus: "failed",
        requestStatus: "failed",
        shouldFinalizeFolio: false,
      };
    case "refund.created":
    default:
      return {
        refundStatus: "pending",
        attemptStatus: "submitted",
        requestStatus: "processing",
        shouldFinalizeFolio: false,
      };
  }
}

export async function createRefundRequestDraft(
  supabase: SupabaseClient,
  payment: RefundablePaymentRecord,
  input: RefundRequestDraftInput
): Promise<{
  refundRequestId: string;
  policy: ReturnType<typeof calculateRefundPolicy>;
  requiresAdminApproval: boolean;
}> {
  assertRefundableCapturedPayment(payment);
  const policy = calculateRefundPolicy(input.policyInput);
  const requiresAdminApproval =
    typeof input.requiresAdminApproval === "boolean" ? input.requiresAdminApproval : shouldRequireAdminRefundApproval();

  const { data, error } = await supabase
    .from("refund_requests")
    .insert({
      booking_id: input.bookingId,
      payment_id: input.paymentId,
      reason: input.reason,
      refund_amount: policy.refundAmount,
      refund_base_amount: policy.refundBaseAmount,
      refund_gst_amount: policy.refundGstAmount,
      status: requiresAdminApproval ? "requested" : "approved",
      requires_admin_approval: requiresAdminApproval,
      approved_by: requiresAdminApproval ? null : input.actorUserId ?? null,
      approved_at: requiresAdminApproval ? null : new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw error;

  return {
    refundRequestId: String(data.id),
    policy,
    requiresAdminApproval,
  };
}

export function resolveRefundPolicyInputFromRequest(input: {
  policyCase: RefundPolicyCase;
  bookingAmount: number;
  paymentTaxAmount?: number;
  roomBaseAmount?: number;
  accommodationGstAmount?: number;
  retentionPercent?: number;
  nights?: Array<{ actualValue: number }>;
}): RefundPolicyInput {
  const roomBaseAmount =
    typeof input.roomBaseAmount === "number" ? clampMoney(input.roomBaseAmount) : clampMoney(input.bookingAmount - (input.paymentTaxAmount ?? 0));
  const accommodationGstAmount =
    typeof input.accommodationGstAmount === "number" ? clampMoney(input.accommodationGstAmount) : clampMoney(input.paymentTaxAmount ?? 0);

  return {
    policyCase: input.policyCase,
    roomBaseAmount,
    accommodationGstAmount,
    guestPayableAmount: clampMoney(input.bookingAmount),
    retentionPercent: input.retentionPercent,
    nights: input.nights,
  };
}

export async function approveAndMaybeInitiateRefund(
  supabase: SupabaseClient,
  input: {
    refundRequestId: string;
    actorUserId?: string | null;
    createProviderRefund?: typeof createRazorpayRefund;
    providerExecutionEnabledOverride?: boolean;
    providerConfiguredOverride?: boolean;
  }
): Promise<{
  refundRequestId: string;
  status: string;
  providerExecutionAttempted: boolean;
  providerExecutionBlocked: boolean;
  refundAttemptId: string | null;
  providerRefundId: string | null;
}> {
  const { data: request, error: requestError } = await supabase
    .from("refund_requests")
    .select("id,booking_id,payment_id,reason,refund_amount,status")
    .eq("id", input.refundRequestId)
    .maybeSingle();
  if (requestError) throw requestError;
  if (!request) throw new Error("Refund request not found.");

  const { data: payment, error: paymentError } = await supabase
    .from("payments_v2")
    .select("id,booking_id,amount_total,tax_amount,gateway,gateway_order_id,gateway_payment_id,refund_status,status")
    .eq("id", request.payment_id)
    .maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment) throw new Error("Refund payment not found.");

  assertRefundableCapturedPayment(payment as RefundablePaymentRecord);

  const approvedAt = new Date().toISOString();
  const providerExecutionBlocked =
    typeof input.providerExecutionEnabledOverride === "boolean"
      ? !input.providerExecutionEnabledOverride
      : !canExecuteRefundProvider();
  const providerExecutionOverrideEnabled = input.providerExecutionEnabledOverride === true;

  if (providerExecutionBlocked) {
    const { error } = await supabase
      .from("refund_requests")
      .update({
        status: "approved",
        approved_by: input.actorUserId ?? null,
        approved_at: approvedAt,
      } as never)
      .eq("id", request.id);
    if (error) throw error;

    return {
      refundRequestId: String(request.id),
      status: "approved",
      providerExecutionAttempted: false,
      providerExecutionBlocked: true,
      refundAttemptId: null,
      providerRefundId: null,
    };
  }

  const paymentGateway = String(payment.gateway ?? "").trim().toLowerCase();
  const providerConfigured =
    typeof input.providerConfiguredOverride === "boolean"
      ? input.providerConfiguredOverride
      : paymentGateway === "cashfree"
        ? isCashfreeConfigured()
        : isRazorpayConfigured();

  if (paymentGateway === "cashfree") {
    if (!payment.gateway_order_id || !providerConfigured || (!providerExecutionOverrideEnabled && !isCashfreeRefundsEnabled())) {
      throw new Error("Cashfree refund execution is not available for this payment.");
    }

    const merchantRefundId = `refund_${String(request.id).replace(/-/g, "").slice(0, 32)}`;
    const refund = await createCashfreeRefund({
      orderId: String(payment.gateway_order_id),
      refundId: merchantRefundId,
      amountMinor: Number(request.refund_amount ?? 0) * 100,
      note: asString(request.reason) ?? "admin_refund_request",
      idempotencyKey: String(request.id),
    });

    const providerRefundId = String(refund.cf_refund_id ?? refund.refund_id);
    const { data: attempt, error: attemptError } = await supabase
      .from("refund_attempts")
      .insert({
        refund_request_id: request.id,
        provider: "cashfree",
        provider_refund_id: providerRefundId,
        amount: Number(request.refund_amount ?? 0),
        status: "submitted",
        raw_response: refund as unknown as JsonRecord,
      })
      .select("id")
      .single();
    if (attemptError) throw attemptError;

    const { error: requestUpdateError } = await supabase
      .from("refund_requests")
      .update({
        status: "processing",
        approved_by: input.actorUserId ?? null,
        approved_at: approvedAt,
      } as never)
      .eq("id", request.id);
    if (requestUpdateError) throw requestUpdateError;

    return {
      refundRequestId: String(request.id),
      status: "processing",
      providerExecutionAttempted: true,
      providerExecutionBlocked: false,
      refundAttemptId: String(attempt.id),
      providerRefundId,
    };
  }

  if (paymentGateway !== "razorpay" || !payment.gateway_payment_id || !providerConfigured || (!providerExecutionOverrideEnabled && !isRazorpayRefundsEnabled())) {
    throw new Error("Razorpay refund execution is not available for this payment.");
  }

  const refund = await (input.createProviderRefund ?? createRazorpayRefund)({
    paymentId: String(payment.gateway_payment_id),
    amountRupees: Number(request.refund_amount ?? 0),
    notes: {
      booking_id: String(request.booking_id),
      payment_id: String(request.payment_id),
      refund_request_id: String(request.id),
      reason: asString(request.reason) ?? "admin_refund_request",
    },
  });

  const { data: attempt, error: attemptError } = await supabase
    .from("refund_attempts")
    .insert({
      refund_request_id: request.id,
      provider: "razorpay",
      provider_refund_id: refund.id,
      amount: Number(request.refund_amount ?? 0),
      status: "submitted",
      raw_response: refund as unknown as JsonRecord,
    })
    .select("id")
    .single();
  if (attemptError) throw attemptError;

  const { error: requestUpdateError } = await supabase
    .from("refund_requests")
    .update({
      status: "processing",
      approved_by: input.actorUserId ?? null,
      approved_at: approvedAt,
    } as never)
    .eq("id", request.id);
  if (requestUpdateError) throw requestUpdateError;

  return {
    refundRequestId: String(request.id),
    status: "processing",
    providerExecutionAttempted: true,
    providerExecutionBlocked: false,
    refundAttemptId: String(attempt.id),
    providerRefundId: refund.id,
  };
}
