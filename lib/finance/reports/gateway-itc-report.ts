import type { SupabaseClient } from "@supabase/supabase-js";

import { asNumber, asRecord, asString, type DateRange, isDateWithinRange } from "@/lib/finance/reports/report-exporter";

type JsonRecord = Record<string, unknown>;

type PaymentRow = {
  id?: string | null;
  booking_id?: string | null;
  gateway?: string | null;
  gateway_payment_id?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  raw_response?: JsonRecord | null;
};

type SettlementLineRow = {
  booking_id?: string | null;
  settlement_id?: string | null;
};

export type GatewayItcReportRow = {
  provider: string;
  payment_id: string;
  settlement_id: string;
  gateway_fee_taxable: number;
  gateway_gst: number;
  invoice_or_reference: string;
  booking_id: string;
};

export const GATEWAY_ITC_REPORT_COLUMNS = [
  { key: "provider", header: "provider" },
  { key: "payment_id", header: "payment_id" },
  { key: "settlement_id", header: "settlement_id if available" },
  { key: "gateway_fee_taxable", header: "gateway fee taxable" },
  { key: "gateway_gst", header: "gateway GST" },
  { key: "invoice_or_reference", header: "invoice/reference if available" },
  { key: "booking_id", header: "booking_id" },
] as const;

function resolvePaymentDate(row: PaymentRow): string {
  return asString(row.paid_at)?.slice(0, 10) ?? asString(row.created_at)?.slice(0, 10) ?? "";
}

export function buildGatewayItcReportRows(input: {
  payments: PaymentRow[];
  settlementLines: SettlementLineRow[];
  range: DateRange;
}): GatewayItcReportRow[] {
  const settlementIdByBookingId = new Map<string, string>();
  for (const line of input.settlementLines) {
    const bookingId = asString(line.booking_id);
    const settlementId = asString(line.settlement_id);
    if (bookingId && settlementId && !settlementIdByBookingId.has(bookingId)) {
      settlementIdByBookingId.set(bookingId, settlementId);
    }
  }

  return input.payments
    .map((payment) => {
      const paymentDate = resolvePaymentDate(payment);
      if (!isDateWithinRange(paymentDate, input.range)) return null;

      const rawResponse = asRecord(payment.raw_response);
      const totalFee = asNumber(rawResponse.fee);
      const gatewayGst = asNumber(rawResponse.tax);
      const gatewayFeeTaxable = Math.max(0, totalFee - gatewayGst);
      const bookingId = asString(payment.booking_id) ?? "";

      return {
        provider: asString(payment.gateway) ?? "",
        payment_id: asString(payment.gateway_payment_id) ?? asString(payment.id) ?? "",
        settlement_id: asString(rawResponse.settlement_id) ?? settlementIdByBookingId.get(bookingId) ?? "",
        gateway_fee_taxable: gatewayFeeTaxable,
        gateway_gst: gatewayGst,
        invoice_or_reference:
          asString(rawResponse.tax_invoice_number) ??
          asString(rawResponse.reference_id) ??
          asString(rawResponse.reference) ??
          asString(rawResponse.invoice_id) ??
          "",
        booking_id: bookingId,
      };
    })
    .filter((row): row is GatewayItcReportRow => Boolean(row));
}

export async function loadGatewayItcReport(
  supabase: SupabaseClient,
  range: DateRange
): Promise<GatewayItcReportRow[]> {
  const [{ data: payments, error: paymentsError }, { data: settlementLines, error: settlementLinesError }] = await Promise.all([
    supabase
      .from("payments_v2")
      .select("id,booking_id,gateway,gateway_payment_id,paid_at,created_at,raw_response")
      .in("status", ["paid", "captured"])
      .gte("created_at", `${range.startDate}T00:00:00.000Z`)
      .lte("created_at", `${range.endDate}T23:59:59.999Z`)
      .order("created_at", { ascending: true }),
    supabase.from("settlement_line_items_v2").select("booking_id,settlement_id"),
  ]);

  if (paymentsError) throw paymentsError;
  if (settlementLinesError) throw settlementLinesError;

  return buildGatewayItcReportRows({
    payments: (payments ?? []) as PaymentRow[],
    settlementLines: (settlementLines ?? []) as SettlementLineRow[],
    range,
  });
}
