import type { SupabaseClient } from "@supabase/supabase-js";

import {
  approveAndMaybeInitiateRefund,
  canExecuteRefundProvider,
} from "@/lib/finance/refund-requests";
import { appendFinanceAuditLog } from "@/lib/finance/operations";
import { asNumber, asRecord, asString } from "@/lib/finance/reports/report-exporter";

type JsonRecord = Record<string, unknown>;

export type RefundAdminListRow = {
  id: string;
  bookingId: string;
  paymentId: string;
  reason: string;
  refundAmount: number;
  refundBaseAmount: number;
  refundGstAmount: number;
  status: string;
  requiresAdminApproval: boolean;
  approvedAt: string | null;
  bookingStatus: string;
  paymentStatus: string;
  providerStatus: string;
  creditNoteStatus: string;
  payoutLinkStatus: string;
  attemptsCount: number;
  latestAttemptStatus: string;
  createdAt: string;
};

export async function listRefundRequestsForAdmin(supabase: SupabaseClient): Promise<RefundAdminListRow[]> {
  const [
    { data: requests, error: requestsError },
    { data: payments, error: paymentsError },
    { data: bookings, error: bookingsError },
    { data: attempts, error: attemptsError },
    { data: creditNotes, error: creditNotesError },
    { data: payouts, error: payoutsError },
  ] =
    await Promise.all([
      supabase
        .from("refund_requests")
        .select("id,booking_id,payment_id,reason,refund_amount,refund_base_amount,refund_gst_amount,status,requires_admin_approval,approved_at,created_at")
        .order("created_at", { ascending: false }),
      supabase.from("payments_v2").select("id,status,refund_status"),
      supabase.from("bookings_v2").select("id,status,payment_status"),
      supabase.from("refund_attempts").select("id,refund_request_id,status,created_at").order("created_at", { ascending: false }),
      supabase.from("credit_notes").select("booking_id,status"),
      supabase.from("payouts_v2").select("booking_id,status"),
    ]);

  if (requestsError) throw requestsError;
  if (paymentsError) throw paymentsError;
  if (bookingsError) throw bookingsError;
  if (attemptsError) throw attemptsError;
  if (creditNotesError) throw creditNotesError;
  if (payoutsError) throw payoutsError;

  const paymentById = new Map(((payments ?? []) as JsonRecord[]).map((row) => [asString(row.id) ?? "", row]));
  const bookingById = new Map(((bookings ?? []) as JsonRecord[]).map((row) => [asString(row.id) ?? "", row]));
  const creditNoteByBookingId = new Map(((creditNotes ?? []) as JsonRecord[]).map((row) => [asString(row.booking_id) ?? "", row]));
  const payoutByBookingId = new Map(((payouts ?? []) as JsonRecord[]).map((row) => [asString(row.booking_id) ?? "", row]));
  const attemptsByRequestId = new Map<string, JsonRecord[]>();
  for (const attempt of (attempts ?? []) as JsonRecord[]) {
    const requestId = asString(attempt.refund_request_id);
    if (!requestId) continue;
    const next = attemptsByRequestId.get(requestId) ?? [];
    next.push(attempt);
    attemptsByRequestId.set(requestId, next);
  }

  return ((requests ?? []) as JsonRecord[]).map((request) => {
    const bookingId = asString(request.booking_id) ?? "";
    const paymentId = asString(request.payment_id) ?? "";
    const payment = paymentById.get(paymentId) ?? null;
    const booking = bookingById.get(bookingId) ?? null;
    const creditNote = creditNoteByBookingId.get(bookingId) ?? null;
    const payout = payoutByBookingId.get(bookingId) ?? null;
    const requestAttempts = attemptsByRequestId.get(asString(request.id) ?? "") ?? [];
    return {
      id: asString(request.id) ?? "",
      bookingId,
      paymentId,
      reason: asString(request.reason) ?? "",
      refundAmount: asNumber(request.refund_amount),
      refundBaseAmount: asNumber(request.refund_base_amount),
      refundGstAmount: asNumber(request.refund_gst_amount),
      status: asString(request.status) ?? "",
      requiresAdminApproval: Boolean(request.requires_admin_approval),
      approvedAt: asString(request.approved_at),
      bookingStatus: asString(booking?.status) ?? "",
      paymentStatus: asString(payment?.status) ?? "",
      providerStatus: asString(payment?.refund_status) ?? "none",
      creditNoteStatus: asString(creditNote?.status) ?? "not_issued",
      payoutLinkStatus: asString(payout?.status) ?? "no_linked_payout",
      attemptsCount: requestAttempts.length,
      latestAttemptStatus: asString(requestAttempts[0]?.status) ?? "",
      createdAt: asString(request.created_at) ?? "",
    };
  });
}

export async function getRefundRequestDetailForAdmin(supabase: SupabaseClient, refundRequestId: string): Promise<Record<string, unknown> | null> {
  const [{ data: request, error: requestError }, { data: attempts, error: attemptsError }] = await Promise.all([
    supabase
      .from("refund_requests")
      .select("*")
      .eq("id", refundRequestId)
      .maybeSingle(),
    supabase.from("refund_attempts").select("*").eq("refund_request_id", refundRequestId).order("created_at", { ascending: false }),
  ]);

  if (requestError) throw requestError;
  if (attemptsError) throw attemptsError;
  if (!request) return null;

  const paymentId = asString((request as JsonRecord).payment_id);
  const bookingId = asString((request as JsonRecord).booking_id);
  const [{ data: payment, error: paymentError }, { data: booking, error: bookingError }, { data: providerEvents, error: providerEventsError }] = await Promise.all([
    paymentId ? supabase.from("payments_v2").select("*").eq("id", paymentId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    bookingId ? supabase.from("bookings_v2").select("*").eq("id", bookingId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase
      .from("payment_provider_events")
      .select("id,event_type,processing_status,created_at,error_message,entity_id,raw_payload")
      .eq("provider", "RAZORPAY")
      .eq("entity_type", "refund")
      .order("created_at", { ascending: false }),
  ]);

  if (paymentError) throw paymentError;
  if (bookingError) throw bookingError;
  if (providerEventsError) throw providerEventsError;

  const providerRefundIds = new Set(
    ((attempts ?? []) as JsonRecord[])
      .map((attempt) => asString(attempt.provider_refund_id))
      .filter((value): value is string => Boolean(value))
  );

  return {
    request,
    booking,
    payment,
    attempts: attempts ?? [],
    providerEvents: ((providerEvents ?? []) as JsonRecord[]).filter((event) => providerRefundIds.has(asString(event.entity_id) ?? "")),
    providerExecutionEnabled: canExecuteRefundProvider(),
  };
}

export async function rejectRefundRequest(
  supabase: SupabaseClient,
  input: { refundRequestId: string; actorUserId?: string | null; reason?: string | null }
): Promise<{ refundRequestId: string; status: string }> {
  const { data: request, error: requestError } = await supabase
    .from("refund_requests")
    .select("id,status")
    .eq("id", input.refundRequestId)
    .maybeSingle();
  if (requestError) throw requestError;
  if (!request) throw new Error("Refund request not found.");

  const currentStatus = asString((request as JsonRecord).status) ?? "";
  if (!["requested", "approved"].includes(currentStatus)) {
    throw new Error("Only requested or approved refund requests can be rejected.");
  }

  const { error } = await supabase
    .from("refund_requests")
    .update({
      status: "rejected",
    } as never)
    .eq("id", input.refundRequestId);
  if (error) throw error;

  await appendFinanceAuditLog(supabase, {
    actorUserId: input.actorUserId ?? null,
    actionType: "refund_rejected",
    resourceType: "refund_request",
    resourceId: input.refundRequestId,
    afterValue: { status: "rejected", reason: input.reason ?? null },
    reason: input.reason ?? "manual_refund_rejection",
  });

  return {
    refundRequestId: input.refundRequestId,
    status: "rejected",
  };
}

export async function executeApprovedRefundRequest(
  supabase: SupabaseClient,
  input: { refundRequestId: string; actorUserId?: string | null }
): Promise<Record<string, unknown>> {
  const { data: request, error } = await supabase
    .from("refund_requests")
    .select("id,status")
    .eq("id", input.refundRequestId)
    .maybeSingle();
  if (error) throw error;
  if (!request) throw new Error("Refund request not found.");
  if (asString((request as JsonRecord).status) !== "approved") {
    throw new Error("Only approved refund requests can be executed.");
  }

  return approveAndMaybeInitiateRefund(supabase, {
    refundRequestId: input.refundRequestId,
    actorUserId: input.actorUserId ?? null,
  });
}
