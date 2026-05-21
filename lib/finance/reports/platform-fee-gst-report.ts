import type { SupabaseClient } from "@supabase/supabase-js";

import { asNumber, asRecord, asString, type DateRange, isDateWithinRange } from "@/lib/finance/reports/report-exporter";

type JsonRecord = Record<string, unknown>;

type PlatformFeeInvoiceRow = {
  invoice_number?: string | null;
  booking_id?: string | null;
  host_id?: string | null;
  status?: string | null;
  taxable_amount?: number | null;
  gst_amount?: number | null;
  total_amount?: number | null;
  issued_at?: string | null;
  created_at?: string | null;
  payload?: JsonRecord | null;
};

export type PlatformFeeGstReportRow = {
  invoice_number: string;
  invoice_date: string;
  host_id: string;
  host_gstin: string;
  booking_id: string;
  taxable_value: number;
  gst_at_18_percent: number;
  total_invoice_amount: number;
};

export const PLATFORM_FEE_GST_REPORT_COLUMNS = [
  { key: "invoice_number", header: "invoice_number" },
  { key: "invoice_date", header: "invoice_date" },
  { key: "host_id", header: "host_id" },
  { key: "host_gstin", header: "host GSTIN if available" },
  { key: "booking_id", header: "booking_id" },
  { key: "taxable_value", header: "taxable_value" },
  { key: "gst_at_18_percent", header: "GST @18%" },
  { key: "total_invoice_amount", header: "total invoice amount" },
] as const;

function resolveInvoiceDate(row: PlatformFeeInvoiceRow, payload: JsonRecord): string {
  return (
    asString(payload.invoiceDate) ??
    asString(payload.invoice_date) ??
    asString(row.issued_at)?.slice(0, 10) ??
    asString(row.created_at)?.slice(0, 10) ??
    ""
  );
}

export function buildPlatformFeeGstReportRows(
  invoices: PlatformFeeInvoiceRow[],
  range: DateRange
): PlatformFeeGstReportRow[] {
  return invoices
    .filter((row) => String(row.status ?? "").toLowerCase() === "issued")
    .map((row) => {
      const payload = asRecord(row.payload);
      const invoiceDate = resolveInvoiceDate(row, payload);
      if (!isDateWithinRange(invoiceDate, range)) return null;

      return {
        invoice_number: asString(row.invoice_number) ?? "",
        invoice_date: invoiceDate,
        host_id: asString(row.host_id) ?? "",
        host_gstin: asString(payload.hostGstin) ?? "",
        booking_id: asString(row.booking_id) ?? "",
        taxable_value: asNumber(payload.taxableValue, asNumber(row.taxable_amount)),
        gst_at_18_percent: asNumber(payload.gstAmount, asNumber(row.gst_amount)),
        total_invoice_amount: asNumber(payload.totalAmount, asNumber(row.total_amount)),
      };
    })
    .filter((row): row is PlatformFeeGstReportRow => Boolean(row));
}

export async function loadPlatformFeeGstReport(
  supabase: SupabaseClient,
  range: DateRange
): Promise<PlatformFeeGstReportRow[]> {
  const { data, error } = await supabase
    .from("platform_fee_invoices")
    .select("invoice_number,booking_id,host_id,status,taxable_amount,gst_amount,total_amount,issued_at,created_at,payload")
    .eq("status", "issued")
    .gte("issued_at", `${range.startDate}T00:00:00.000Z`)
    .lte("issued_at", `${range.endDate}T23:59:59.999Z`)
    .order("issued_at", { ascending: true });

  if (error) throw error;
  return buildPlatformFeeGstReportRows((data ?? []) as PlatformFeeInvoiceRow[], range);
}
