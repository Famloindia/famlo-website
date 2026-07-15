import type { SupabaseClient } from "@supabase/supabase-js";

import { isCreditNoteGenerationEnabled } from "@/lib/finance/feature-flags";
import { calculateRefundPolicy, type RefundPolicyCase, type RefundPolicyInput } from "@/lib/finance/refund-policy";
import { getFinanceSettings } from "@/lib/finance/settings";
import { assertTaxArtifactAllowed } from "@/lib/finance/tax-compliance-guard";

type JsonRecord = Record<string, unknown>;

export type CreditNoteArtifact = {
  creditNoteNumber: string;
  originalInvoiceId: string;
  originalInvoiceType: "guest_tax_invoice" | "platform_fee_invoice";
  bookingId: string;
  reservationId: string | null;
  status: "draft" | "issued" | "cancelled";
  taxableReversalAmount: number;
  gstReversalAmount: number;
  totalReversalAmount: number;
  reason: string;
  policyCase: RefundPolicyCase;
  calculationVersion: string;
  issuerRole: "FAMLO";
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function issueNumber(prefix: string, entityId: string, calculationVersion: string): string {
  const clean = entityId.replace(/-/g, "").slice(0, 8).toUpperCase();
  const version = calculationVersion.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8) || "V1";
  return `${prefix}-${clean}-${version}`;
}

export function buildCreditNoteArtifact(input: {
  originalInvoiceId: string | null;
  originalInvoiceType: "guest_tax_invoice" | "platform_fee_invoice";
  bookingId: string;
  reservationId: string | null;
  reason: string;
  policyInput: RefundPolicyInput;
  calculationVersion: string;
}): CreditNoteArtifact | null {
  if (!input.originalInvoiceId) {
    throw new Error("Credit note requires an original invoice.");
  }

  const policy = calculateRefundPolicy(input.policyInput);
  if (policy.policyCase === "NO_SHOW") return null;

  return {
    creditNoteNumber: issueNumber("CN", input.bookingId, input.calculationVersion),
    originalInvoiceId: input.originalInvoiceId,
    originalInvoiceType: input.originalInvoiceType,
    bookingId: input.bookingId,
    reservationId: input.reservationId,
    status: "issued",
    taxableReversalAmount: policy.refundBaseAmount,
    gstReversalAmount: policy.refundGstAmount,
    totalReversalAmount: policy.refundAmount,
    reason: input.reason,
    policyCase: policy.policyCase,
    calculationVersion: input.calculationVersion,
    issuerRole: "FAMLO",
  };
}

export async function generateCreditNote(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    refundId: string;
    policyInput: RefundPolicyInput;
    reason: string;
    actorUserId?: string | null;
  }
): Promise<string | null> {
  const settings = await getFinanceSettings({}, supabase);
  assertTaxArtifactAllowed(settings, "CREATE_CREDIT_NOTE");
  if (!isCreditNoteGenerationEnabled()) {
    throw new Error("Credit note generation is disabled by feature flag.");
  }

  const [{ data: existing }, { data: reservation }, { data: guestInvoice }] = await Promise.all([
    supabase.from("credit_notes").select("id").eq("booking_id", input.bookingId).maybeSingle(),
    supabase.from("reservations_v2").select("id").eq("booking_id", input.bookingId).maybeSingle(),
    supabase.from("guest_tax_invoices").select("id,calculation_version").eq("booking_id", input.bookingId).maybeSingle(),
  ]);

  if (existing?.id) return String(existing.id);

  const artifact = buildCreditNoteArtifact({
    originalInvoiceId: asString((guestInvoice as JsonRecord | null)?.id),
    originalInvoiceType: "guest_tax_invoice",
    bookingId: input.bookingId,
    reservationId: asString((reservation as JsonRecord | null)?.id),
    reason: input.reason,
    policyInput: input.policyInput,
    calculationVersion: asString((guestInvoice as JsonRecord | null)?.calculation_version) ?? "section_9_5_v1",
  });

  if (!artifact) return null;

  const { data, error } = await supabase
    .from("credit_notes")
    .insert({
      credit_note_number: artifact.creditNoteNumber,
      original_invoice_id: artifact.originalInvoiceId,
      original_invoice_type: artifact.originalInvoiceType,
      booking_id: input.bookingId,
      reservation_id: artifact.reservationId,
      status: artifact.status,
      taxable_reversal_amount: artifact.taxableReversalAmount,
      gst_reversal_amount: artifact.gstReversalAmount,
      total_reversal_amount: artifact.totalReversalAmount,
      reason: artifact.reason,
      payload: {
        ...artifact,
        refundId: input.refundId,
      } as unknown as JsonRecord,
      issued_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}
