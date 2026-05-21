import type { SupabaseClient } from "@supabase/supabase-js";

import {
  asNumber,
  asRecord,
  asString,
  type DateRange,
  isDateWithinRange,
  splitGstByPlaceOfSupply,
} from "@/lib/finance/reports/report-exporter";

type JsonRecord = Record<string, unknown>;

type GuestTaxInvoiceRow = {
  invoice_number?: string | null;
  booking_id?: string | null;
  reservation_id?: string | null;
  status?: string | null;
  taxable_amount?: number | null;
  gst_amount?: number | null;
  total_amount?: number | null;
  issued_at?: string | null;
  created_at?: string | null;
  payload?: JsonRecord | null;
};

export type GstAccommodationReportRow = {
  invoice_number: string;
  invoice_date: string;
  booking_id: string;
  reservation_id: string;
  sac_code: "9963";
  taxable_value: number;
  gst_rate: string;
  cgst: number;
  sgst: number;
  igst: number;
  total_gst: number;
  total_invoice_amount: number;
  place_of_supply: string;
  guest_gstin: string;
};

export const GST_ACCOMMODATION_REPORT_COLUMNS = [
  { key: "invoice_number", header: "invoice_number" },
  { key: "invoice_date", header: "invoice_date" },
  { key: "booking_id", header: "booking_id" },
  { key: "reservation_id", header: "reservation_id" },
  { key: "sac_code", header: "SAC 9963" },
  { key: "taxable_value", header: "taxable_value" },
  { key: "gst_rate", header: "GST rate" },
  { key: "cgst", header: "CGST" },
  { key: "sgst", header: "SGST" },
  { key: "igst", header: "IGST" },
  { key: "total_gst", header: "total GST" },
  { key: "total_invoice_amount", header: "total invoice amount" },
  { key: "place_of_supply", header: "place of supply" },
  { key: "guest_gstin", header: "guest GSTIN if B2B" },
] as const;

function resolveInvoiceDate(row: GuestTaxInvoiceRow, payload: JsonRecord): string {
  return (
    asString(payload.invoiceDate) ??
    asString(payload.invoice_date) ??
    asString(row.issued_at)?.slice(0, 10) ??
    asString(row.created_at)?.slice(0, 10) ??
    ""
  );
}

function resolveGstRateLabel(payload: JsonRecord): string {
  const lineItems = Array.isArray(payload.lineItems) ? payload.lineItems : [];
  const rates = Array.from(
    new Set(
      lineItems
        .map((item) => {
          const record = asRecord(item);
          const rateBps = asNumber(record.gstRateBps);
          return rateBps > 0 ? `${rateBps / 100}%` : null;
        })
        .filter((value): value is string => Boolean(value))
    )
  );
  return rates.join("; ");
}

export function buildGstAccommodationReportRows(
  invoices: GuestTaxInvoiceRow[],
  range: DateRange
): GstAccommodationReportRow[] {
  return invoices
    .filter((row) => String(row.status ?? "").toLowerCase() === "issued")
    .map((row) => {
      const payload = asRecord(row.payload);
      const invoiceDate = resolveInvoiceDate(row, payload);
      if (!isDateWithinRange(invoiceDate, range)) return null;

      const totalGst = asNumber(payload.gstAmount, asNumber(row.gst_amount));
      const placeOfSupply = asString(payload.placeOfSupply) ?? "";
      const split = splitGstByPlaceOfSupply({
        gstAmount: totalGst,
        placeOfSupply,
        supplierGstin: asString(payload.famloGstin),
      });

      return {
        invoice_number: asString(row.invoice_number) ?? "",
        invoice_date: invoiceDate,
        booking_id: asString(row.booking_id) ?? "",
        reservation_id: asString(row.reservation_id) ?? "",
        sac_code: "9963",
        taxable_value: asNumber(payload.roomBaseAmount, asNumber(row.taxable_amount)),
        gst_rate: resolveGstRateLabel(payload),
        cgst: split.cgst,
        sgst: split.sgst,
        igst: split.igst,
        total_gst: totalGst,
        total_invoice_amount: asNumber(payload.totalInvoiceAmount, asNumber(row.total_amount)),
        place_of_supply: placeOfSupply,
        guest_gstin: asString(payload.guestGstin) ?? "",
      };
    })
    .filter((row): row is GstAccommodationReportRow => Boolean(row));
}

export async function loadGstAccommodationReport(
  supabase: SupabaseClient,
  range: DateRange
): Promise<GstAccommodationReportRow[]> {
  const { data, error } = await supabase
    .from("guest_tax_invoices")
    .select("invoice_number,booking_id,reservation_id,status,taxable_amount,gst_amount,total_amount,issued_at,created_at,payload")
    .eq("status", "issued")
    .gte("issued_at", `${range.startDate}T00:00:00.000Z`)
    .lte("issued_at", `${range.endDate}T23:59:59.999Z`)
    .order("issued_at", { ascending: true });

  if (error) throw error;
  return buildGstAccommodationReportRows((data ?? []) as GuestTaxInvoiceRow[], range);
}
