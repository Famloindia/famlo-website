import type { SupabaseClient } from "@supabase/supabase-js";

import { asNumber, asString, type DateRange, getFinancialYearLabel, isDateWithinRange, maskPan } from "@/lib/finance/reports/report-exporter";

type PayoutRow = {
  id?: string | null;
  booking_id?: string | null;
  partner_profile_id?: string | null;
  gross_booking_value?: number | null;
  platform_fee?: number | null;
  withholding_amount?: number | null;
  status?: string | null;
  processed_at?: string | null;
  created_at?: string | null;
};

type SettlementLineRow = {
  payout_id?: string | null;
  settlement_id?: string | null;
};

type HostRow = {
  id?: string | null;
  user_id?: string | null;
  display_name?: string | null;
};

type HostTaxRow = {
  user_id?: string | null;
  pan_holder_name?: string | null;
  pan_last_four?: string | null;
};

export type TdsReportRow = {
  host_id: string;
  host_legal_name: string;
  pan_masked: string;
  financial_year: string;
  settlement_id: string;
  payout_id: string;
  host_gross_payout: number;
  tds_rate: string;
  tds_amount: number;
  threshold_status: string;
};

export const TDS_REPORT_COLUMNS = [
  { key: "host_id", header: "host_id" },
  { key: "host_legal_name", header: "host legal name" },
  { key: "pan_masked", header: "PAN masked" },
  { key: "financial_year", header: "financial year" },
  { key: "settlement_id", header: "settlement_id" },
  { key: "payout_id", header: "payout_id if available" },
  { key: "host_gross_payout", header: "host gross payout" },
  { key: "tds_rate", header: "TDS rate" },
  { key: "tds_amount", header: "TDS amount" },
  { key: "threshold_status", header: "threshold status" },
] as const;

function resolvePayoutDate(row: PayoutRow): string {
  return asString(row.processed_at)?.slice(0, 10) ?? asString(row.created_at)?.slice(0, 10) ?? "";
}

export function buildTdsReportRows(input: {
  payouts: PayoutRow[];
  settlementLines: SettlementLineRow[];
  hosts: HostRow[];
  hostTaxes: HostTaxRow[];
  range: DateRange;
}): TdsReportRow[] {
  const settlementIdByPayoutId = new Map<string, string>();
  for (const line of input.settlementLines) {
    const payoutId = asString(line.payout_id);
    const settlementId = asString(line.settlement_id);
    if (payoutId && settlementId && !settlementIdByPayoutId.has(payoutId)) {
      settlementIdByPayoutId.set(payoutId, settlementId);
    }
  }

  const hostById = new Map(input.hosts.map((host) => [asString(host.id) ?? "", host]));
  const hostTaxByUserId = new Map(input.hostTaxes.map((hostTax) => [asString(hostTax.user_id) ?? "", hostTax]));

  return input.payouts
    .map((payout) => {
      const payoutDate = resolvePayoutDate(payout);
      if (!isDateWithinRange(payoutDate, input.range)) return null;

      const hostId = asString(payout.partner_profile_id) ?? "";
      const host = hostById.get(hostId) ?? null;
      const hostTax = host ? hostTaxByUserId.get(asString(host.user_id) ?? "") ?? null : null;
      const hostGrossPayout = Math.max(0, asNumber(payout.gross_booking_value) - asNumber(payout.platform_fee));
      const tdsAmount = asNumber(payout.withholding_amount);
      const tdsRate = hostGrossPayout > 0 && tdsAmount > 0 ? ((tdsAmount / hostGrossPayout) * 100).toFixed(2) : "0.00";

      return {
        host_id: hostId,
        host_legal_name: asString(hostTax?.pan_holder_name) ?? asString(host?.display_name) ?? "",
        pan_masked: maskPan(asString(hostTax?.pan_last_four)),
        financial_year: getFinancialYearLabel(payoutDate),
        settlement_id: settlementIdByPayoutId.get(asString(payout.id) ?? "") ?? "",
        payout_id: asString(payout.id) ?? "",
        host_gross_payout: hostGrossPayout,
        tds_rate: `${tdsRate}%`,
        tds_amount: tdsAmount,
        threshold_status: tdsAmount > 0 ? "threshold_crossed" : "threshold_not_crossed_or_tds_not_deducted",
      };
    })
    .filter((row): row is TdsReportRow => Boolean(row));
}

export async function loadTdsReport(supabase: SupabaseClient, range: DateRange): Promise<TdsReportRow[]> {
  const [{ data: payouts, error: payoutsError }, { data: settlementLines, error: settlementLinesError }, { data: hosts, error: hostsError }, { data: hostTaxes, error: hostTaxesError }] =
    await Promise.all([
      supabase
        .from("payouts_v2")
        .select("id,booking_id,partner_profile_id,gross_booking_value,platform_fee,withholding_amount,status,processed_at,created_at")
        .gte("created_at", `${range.startDate}T00:00:00.000Z`)
        .lte("created_at", `${range.endDate}T23:59:59.999Z`)
        .order("created_at", { ascending: true }),
      supabase.from("settlement_line_items_v2").select("payout_id,settlement_id"),
      supabase.from("hosts").select("id,user_id,display_name"),
      supabase.from("host_tax_details").select("user_id,pan_holder_name,pan_last_four"),
    ]);

  if (payoutsError) throw payoutsError;
  if (settlementLinesError) throw settlementLinesError;
  if (hostsError) throw hostsError;
  if (hostTaxesError) throw hostTaxesError;

  return buildTdsReportRows({
    payouts: (payouts ?? []) as PayoutRow[],
    settlementLines: (settlementLines ?? []) as SettlementLineRow[],
    hosts: (hosts ?? []) as HostRow[],
    hostTaxes: (hostTaxes ?? []) as HostTaxRow[],
    range,
  });
}
