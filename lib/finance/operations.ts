import type { SupabaseClient } from "@supabase/supabase-js";

import { appendLedgerEntryIfMissing } from "@/lib/finance/runtime";

type JsonRecord = Record<string, unknown>;

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function appendFinanceAuditLog(
  supabase: SupabaseClient,
  params: {
    actorUserId?: string | null;
    actionType: string;
    resourceType: string;
    resourceId?: string | null;
    beforeValue?: JsonRecord | null;
    afterValue?: JsonRecord | null;
    reason: string;
  }
): Promise<void> {
  try {
    await supabase.from("finance_audit_logs").insert({
      actor_user_id: params.actorUserId ?? null,
      action_type: params.actionType,
      resource_type: params.resourceType,
      resource_id: params.resourceId ?? null,
      before_value: params.beforeValue ?? null,
      after_value: params.afterValue ?? null,
      reason: params.reason,
    });
  } catch (error) {
    console.error("[finance] finance_audit_logs insert failed:", error);
  }
}

function issueCode(prefix: string, entityId: string): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `${prefix}-${stamp}-${entityId.slice(0, 6).toUpperCase()}`;
}

export async function ensureInvoiceForBooking(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    actorUserId?: string | null;
  }
): Promise<string | null> {
  const { data: existing, error: existingError } = await supabase
    .from("invoices_v2")
    .select("id")
    .eq("booking_id", input.bookingId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return existing.id as string;

  const { data: booking, error: bookingError } = await supabase
    .from("bookings_v2")
    .select("id,user_id,guest_name,payment_status,payment_id")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) throw new Error("Booking not found.");

  const { data: payment, error: paymentError } = await supabase
    .from("payments_v2")
    .select("id,amount_total,tax_amount,status")
    .eq("booking_id", input.bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment) throw new Error("Payment not found for invoice generation.");

  const invoiceNumber = issueCode("INV", input.bookingId);
  const payload = {
    booking_id: input.bookingId,
    payment_id: payment.id,
    invoice_number: invoiceNumber,
    invoice_type: "tax_invoice",
    status: payment.status === "paid" ? "issued" : "draft",
    issued_to_user_id: booking.user_id ?? null,
    amount_total: asNumber(payment.amount_total),
    tax_amount: asNumber(payment.tax_amount),
    payload: {
      booking_id: input.bookingId,
      guest_name: booking.guest_name,
      payment_status: booking.payment_status,
    },
    issued_at: payment.status === "paid" ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase.from("invoices_v2").insert(payload).select("id").single();
  if (error) throw error;

  await appendFinanceAuditLog(supabase, {
    actorUserId: input.actorUserId ?? null,
    actionType: "invoice_created",
    resourceType: "invoice",
    resourceId: data.id,
    afterValue: payload,
    reason: "manual_invoice_generation",
  });

  return data.id as string;
}

export async function ensureCreditNoteForRefund(
  supabase: SupabaseClient,
  input: {
    refundId: string;
    actorUserId?: string | null;
  }
): Promise<string | null> {
  const { data: existing, error: existingError } = await supabase
    .from("credit_notes_v2")
    .select("id")
    .eq("refund_id", input.refundId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return existing.id as string;

  const { data: refund, error: refundError } = await supabase
    .from("refunds_v2")
    .select("id,booking_id,payment_id,amount_total,processed_at,status")
    .eq("id", input.refundId)
    .maybeSingle();
  if (refundError) throw refundError;
  if (!refund) throw new Error("Refund not found.");

  const { data: invoice } = await supabase
    .from("invoices_v2")
    .select("id,tax_amount")
    .eq("booking_id", refund.booking_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const creditNoteNumber = issueCode("CN", input.refundId);
  const payload = {
    refund_id: refund.id,
    invoice_id: invoice?.id ?? null,
    credit_note_number: creditNoteNumber,
    status: refund.status === "processed" ? "issued" : "draft",
    amount_total: asNumber(refund.amount_total),
    tax_amount: asNumber(invoice?.tax_amount),
    payload: {
      booking_id: refund.booking_id,
      payment_id: refund.payment_id,
    },
    issued_at: refund.status === "processed" ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase.from("credit_notes_v2").insert(payload).select("id").single();
  if (error) throw error;

  await appendFinanceAuditLog(supabase, {
    actorUserId: input.actorUserId ?? null,
    actionType: "credit_note_created",
    resourceType: "credit_note",
    resourceId: data.id,
    afterValue: payload,
    reason: "manual_credit_note_generation",
  });

  return data.id as string;
}

export async function appendPayoutCompletionLedger(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    payoutId: string;
    amount: number;
    referenceId: string;
    metadata?: JsonRecord;
  }
): Promise<void> {
  await appendLedgerEntryIfMissing(supabase, {
    bookingId: input.bookingId,
    payoutId: input.payoutId,
    entryType: "payout_completed",
    accountCode: "partner_payouts_payable",
    direction: "debit",
    amount: input.amount,
    referenceType: "payout_execution",
    referenceId: input.referenceId,
    metadata: input.metadata ?? {},
  });
}
