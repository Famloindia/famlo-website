import type { CreditNoteReportRow } from "@/lib/finance/reports/credit-note-report";
import type { GstAccommodationReportRow } from "@/lib/finance/reports/gst-accommodation-report";
import type { PlatformFeeGstReportRow } from "@/lib/finance/reports/platform-fee-gst-report";

export type CombinedGstExportRow = {
  report_type: "accommodation" | "platform_fee" | "credit_note";
  document_number: string;
  document_date: string;
  booking_id: string;
  reservation_or_host: string;
  taxable_amount: number;
  gst_amount: number;
  total_amount: number;
  place_of_supply_or_reason: string;
};

export const COMBINED_GST_EXPORT_COLUMNS = [
  { key: "report_type", header: "report_type" },
  { key: "document_number", header: "document_number" },
  { key: "document_date", header: "document_date" },
  { key: "booking_id", header: "booking_id" },
  { key: "reservation_or_host", header: "reservation_or_host" },
  { key: "taxable_amount", header: "taxable_amount" },
  { key: "gst_amount", header: "gst_amount" },
  { key: "total_amount", header: "total_amount" },
  { key: "place_of_supply_or_reason", header: "place_of_supply_or_reason" },
] as const;

export function buildCombinedGstExportRows(input: {
  accommodation: GstAccommodationReportRow[];
  platformFee: PlatformFeeGstReportRow[];
  creditNotes: CreditNoteReportRow[];
}): CombinedGstExportRow[] {
  return [
    ...input.accommodation.map((row) => ({
      report_type: "accommodation" as const,
      document_number: row.invoice_number,
      document_date: row.invoice_date,
      booking_id: row.booking_id,
      reservation_or_host: row.reservation_id,
      taxable_amount: row.taxable_value,
      gst_amount: row.total_gst,
      total_amount: row.total_invoice_amount,
      place_of_supply_or_reason: row.place_of_supply,
    })),
    ...input.platformFee.map((row) => ({
      report_type: "platform_fee" as const,
      document_number: row.invoice_number,
      document_date: row.invoice_date,
      booking_id: row.booking_id,
      reservation_or_host: row.host_id,
      taxable_amount: row.taxable_value,
      gst_amount: row.gst_at_18_percent,
      total_amount: row.total_invoice_amount,
      place_of_supply_or_reason: row.host_gstin,
    })),
    ...input.creditNotes.map((row) => ({
      report_type: "credit_note" as const,
      document_number: row.credit_note_number,
      document_date: row.credit_note_date,
      booking_id: row.booking_id,
      reservation_or_host: row.original_invoice_number,
      taxable_amount: row.reversal_taxable_amount,
      gst_amount: row.reversal_gst_amount,
      total_amount: row.total_reversal_amount,
      place_of_supply_or_reason: row.reason,
    })),
  ].sort((left, right) => left.document_date.localeCompare(right.document_date));
}
