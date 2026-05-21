import type { SupabaseClient } from "@supabase/supabase-js";

import { asNumber, asRecord, asString, type DateRange, isDateWithinRange } from "@/lib/finance/reports/report-exporter";

type JsonRecord = Record<string, unknown>;

type GuestTaxInvoiceRow = {
  booking_id?: string | null;
  invoice_number?: string | null;
  status?: string | null;
  taxable_amount?: number | null;
  gst_amount?: number | null;
  issued_at?: string | null;
  created_at?: string | null;
  payload?: JsonRecord | null;
};

type PlatformFeeInvoiceRow = {
  booking_id?: string | null;
  status?: string | null;
  taxable_amount?: number | null;
  gst_amount?: number | null;
  issued_at?: string | null;
  payload?: JsonRecord | null;
};

type CreditNoteRow = {
  booking_id?: string | null;
  status?: string | null;
  total_reversal_amount?: number | null;
};

type PayoutRow = {
  booking_id?: string | null;
  status?: string | null;
  gross_booking_value?: number | null;
  platform_fee?: number | null;
};

export type RevenueReportRow = {
  booking_id: string;
  room_base: number;
  accommodation_gst: number;
  famlo_platform_fee_taxable: number;
  platform_fee_gst: number;
  host_gross_payout: number;
  refund_adjustments: number;
  payout_status: string;
  invoice_status: string;
};

export const REVENUE_REPORT_COLUMNS = [
  { key: "booking_id", header: "booking_id" },
  { key: "room_base", header: "room base" },
  { key: "accommodation_gst", header: "accommodation GST" },
  { key: "famlo_platform_fee_taxable", header: "Famlo platform fee taxable" },
  { key: "platform_fee_gst", header: "platform fee GST" },
  { key: "host_gross_payout", header: "host gross payout" },
  { key: "refund_adjustments", header: "refund adjustments" },
  { key: "payout_status", header: "payout status" },
  { key: "invoice_status", header: "invoice status" },
] as const;

function resolveInvoiceDate(row: GuestTaxInvoiceRow): string {
  const payload = asRecord(row.payload);
  return (
    asString(payload.invoiceDate) ??
    asString(payload.invoice_date) ??
    asString(row.issued_at)?.slice(0, 10) ??
    asString(row.created_at)?.slice(0, 10) ??
    ""
  );
}

export function buildRevenueReportRows(input: {
  guestInvoices: GuestTaxInvoiceRow[];
  platformInvoices: PlatformFeeInvoiceRow[];
  creditNotes: CreditNoteRow[];
  payouts: PayoutRow[];
  range: DateRange;
}): RevenueReportRow[] {
  const platformInvoiceByBookingId = new Map<string, PlatformFeeInvoiceRow>();
  for (const invoice of input.platformInvoices) {
    const bookingId = asString(invoice.booking_id);
    if (!bookingId || String(invoice.status ?? "").toLowerCase() !== "issued") continue;
    platformInvoiceByBookingId.set(bookingId, invoice);
  }

  const payoutByBookingId = new Map<string, PayoutRow>();
  for (const payout of input.payouts) {
    const bookingId = asString(payout.booking_id);
    if (!bookingId) continue;
    payoutByBookingId.set(bookingId, payout);
  }

  const refundAdjustmentsByBookingId = new Map<string, number>();
  for (const creditNote of input.creditNotes) {
    const bookingId = asString(creditNote.booking_id);
    if (!bookingId || String(creditNote.status ?? "").toLowerCase() !== "issued") continue;
    refundAdjustmentsByBookingId.set(
      bookingId,
      (refundAdjustmentsByBookingId.get(bookingId) ?? 0) + asNumber(creditNote.total_reversal_amount)
    );
  }

  return input.guestInvoices
    .filter((invoice) => String(invoice.status ?? "").toLowerCase() === "issued")
    .map((invoice) => {
      const invoiceDate = resolveInvoiceDate(invoice);
      if (!isDateWithinRange(invoiceDate, input.range)) return null;

      const payload = asRecord(invoice.payload);
      const bookingId = asString(invoice.booking_id) ?? "";
      const platformInvoice = platformInvoiceByBookingId.get(bookingId) ?? null;
      const payout = payoutByBookingId.get(bookingId) ?? null;
      const roomBase = asNumber(payload.roomBaseAmount, asNumber(invoice.taxable_amount));
      const accommodationGst = asNumber(payload.gstAmount, asNumber(invoice.gst_amount));
      const platformTaxable = asNumber(platformInvoice?.taxable_amount);
      const platformGst = asNumber(platformInvoice?.gst_amount);
      const hostGrossPayout = payout
        ? Math.max(0, asNumber(payout.gross_booking_value) - asNumber(payout.platform_fee))
        : Math.max(0, roomBase - (platformTaxable + platformGst));
      const hasCreditNote = (refundAdjustmentsByBookingId.get(bookingId) ?? 0) > 0;
      const invoiceStatus = platformInvoice
        ? hasCreditNote
          ? "issued_with_credit_note"
          : "issued"
        : hasCreditNote
          ? "guest_issued_with_credit_note_platform_fee_missing"
          : "guest_issued_platform_fee_missing";

      return {
        booking_id: bookingId,
        room_base: roomBase,
        accommodation_gst: accommodationGst,
        famlo_platform_fee_taxable: platformTaxable,
        platform_fee_gst: platformGst,
        host_gross_payout: hostGrossPayout,
        refund_adjustments: refundAdjustmentsByBookingId.get(bookingId) ?? 0,
        payout_status: asString(payout?.status) ?? "",
        invoice_status: invoiceStatus,
      };
    })
    .filter((row): row is RevenueReportRow => Boolean(row));
}

export async function loadRevenueReport(supabase: SupabaseClient, range: DateRange): Promise<RevenueReportRow[]> {
  const [{ data: guestInvoices, error: guestInvoicesError }, { data: platformInvoices, error: platformInvoicesError }, { data: creditNotes, error: creditNotesError }, { data: payouts, error: payoutsError }] =
    await Promise.all([
      supabase
        .from("guest_tax_invoices")
        .select("booking_id,invoice_number,status,taxable_amount,gst_amount,issued_at,created_at,payload")
        .eq("status", "issued")
        .gte("issued_at", `${range.startDate}T00:00:00.000Z`)
        .lte("issued_at", `${range.endDate}T23:59:59.999Z`)
        .order("issued_at", { ascending: true }),
      supabase.from("platform_fee_invoices").select("booking_id,status,taxable_amount,gst_amount,issued_at,payload").eq("status", "issued"),
      supabase.from("credit_notes").select("booking_id,status,total_reversal_amount").eq("status", "issued"),
      supabase.from("payouts_v2").select("booking_id,status,gross_booking_value,platform_fee"),
    ]);

  if (guestInvoicesError) throw guestInvoicesError;
  if (platformInvoicesError) throw platformInvoicesError;
  if (creditNotesError) throw creditNotesError;
  if (payoutsError) throw payoutsError;

  return buildRevenueReportRows({
    guestInvoices: (guestInvoices ?? []) as GuestTaxInvoiceRow[],
    platformInvoices: (platformInvoices ?? []) as PlatformFeeInvoiceRow[],
    creditNotes: (creditNotes ?? []) as CreditNoteRow[],
    payouts: (payouts ?? []) as PayoutRow[],
    range,
  });
}
