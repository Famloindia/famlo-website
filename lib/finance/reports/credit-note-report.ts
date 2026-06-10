import type { SupabaseClient } from "@supabase/supabase-js";

import { asNumber, asRecord, asString, type DateRange, isDateWithinRange } from "@/lib/finance/reports/report-exporter";

type JsonRecord = Record<string, unknown>;

type CreditNoteRow = {
  credit_note_number?: string | null;
  original_invoice_id?: string | null;
  original_invoice_type?: string | null;
  booking_id?: string | null;
  status?: string | null;
  taxable_reversal_amount?: number | null;
  gst_reversal_amount?: number | null;
  total_reversal_amount?: number | null;
  reason?: string | null;
  issued_at?: string | null;
  created_at?: string | null;
  payload?: JsonRecord | null;
};

type InvoiceLookupRow = {
  id?: string | null;
  invoice_number?: string | null;
};

export type CreditNoteReportRow = {
  credit_note_number: string;
  credit_note_date: string;
  original_invoice_number: string;
  booking_id: string;
  reversal_taxable_amount: number;
  reversal_gst_amount: number;
  total_reversal_amount: number;
  reason: string;
};

export const CREDIT_NOTE_REPORT_COLUMNS = [
  { key: "credit_note_number", header: "credit_note_number" },
  { key: "credit_note_date", header: "credit_note_date" },
  { key: "original_invoice_number", header: "original_invoice_number" },
  { key: "booking_id", header: "booking_id" },
  { key: "reversal_taxable_amount", header: "reversal taxable amount" },
  { key: "reversal_gst_amount", header: "reversal GST amount" },
  { key: "total_reversal_amount", header: "total reversal amount" },
  { key: "reason", header: "reason" },
] as const;

function resolveCreditNoteDate(row: CreditNoteRow, payload: JsonRecord): string {
  return (
    asString(payload.creditNoteDate) ??
    asString(payload.credit_note_date) ??
    asString(row.issued_at)?.slice(0, 10) ??
    asString(row.created_at)?.slice(0, 10) ??
    ""
  );
}

export function buildCreditNoteReportRows(
  creditNotes: CreditNoteRow[],
  originalInvoiceNumbers: Map<string, string>,
  range: DateRange
): CreditNoteReportRow[] {
  return creditNotes
    .filter((row) => String(row.status ?? "").toLowerCase() === "issued")
    .map((row) => {
      const payload = asRecord(row.payload);
      const creditNoteDate = resolveCreditNoteDate(row, payload);
      if (!isDateWithinRange(creditNoteDate, range)) return null;

      return {
        credit_note_number: asString(row.credit_note_number) ?? "",
        credit_note_date: creditNoteDate,
        original_invoice_number: originalInvoiceNumbers.get(asString(row.original_invoice_id) ?? "") ?? "",
        booking_id: asString(row.booking_id) ?? "",
        reversal_taxable_amount: asNumber(payload.taxableReversalAmount, asNumber(row.taxable_reversal_amount)),
        reversal_gst_amount: asNumber(payload.gstReversalAmount, asNumber(row.gst_reversal_amount)),
        total_reversal_amount: asNumber(payload.totalReversalAmount, asNumber(row.total_reversal_amount)),
        reason: asString(row.reason) ?? asString(payload.reason) ?? "",
      };
    })
    .filter((row): row is CreditNoteReportRow => Boolean(row));
}

export async function loadCreditNoteReport(
  supabase: SupabaseClient,
  range: DateRange
): Promise<CreditNoteReportRow[]> {
  const [{ data: creditNotes, error: creditNotesError }, { data: guestInvoices, error: guestInvoicesError }, { data: platformInvoices, error: platformInvoicesError }] =
    await Promise.all([
      supabase
        .from("credit_notes")
        .select("credit_note_number,original_invoice_id,original_invoice_type,booking_id,status,taxable_reversal_amount,gst_reversal_amount,total_reversal_amount,reason,issued_at,created_at,payload")
        .eq("status", "issued")
        .gte("issued_at", `${range.startDate}T00:00:00.000Z`)
        .lte("issued_at", `${range.endDate}T23:59:59.999Z`)
        .order("issued_at", { ascending: true }),
      supabase.from("guest_tax_invoices").select("id,invoice_number"),
      supabase.from("platform_fee_invoices").select("id,invoice_number"),
    ]);

  if (creditNotesError) throw creditNotesError;
  if (guestInvoicesError) throw guestInvoicesError;
  if (platformInvoicesError) throw platformInvoicesError;

  const invoiceNumbers = new Map<string, string>();
  for (const row of [...((guestInvoices ?? []) as InvoiceLookupRow[]), ...((platformInvoices ?? []) as InvoiceLookupRow[])]) {
    const id = asString(row.id);
    if (id) invoiceNumbers.set(id, asString(row.invoice_number) ?? "");
  }

  return buildCreditNoteReportRows((creditNotes ?? []) as CreditNoteRow[], invoiceNumbers, range);
}
