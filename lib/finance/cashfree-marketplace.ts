import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isCashfreeDeferredSettlementEnabled,
  isCashfreeEasySplitEnabled,
} from "@/lib/finance/feature-flags";

type JsonRecord = Record<string, unknown>;

export type MarketplaceSplitMinor = {
  grossBookingAmountMinor: number;
  famloCommissionAmountMinor: number;
  hostGrossShareMinor: number;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function computeFamloMarketplaceSplitMinor(grossBookingAmountMinor: number): MarketplaceSplitMinor {
  const gross = Math.max(0, Math.round(grossBookingAmountMinor));
  const famloCommissionAmountMinor = Math.round((gross * 16) / 100);
  const hostGrossShareMinor = gross - famloCommissionAmountMinor;
  return {
    grossBookingAmountMinor: gross,
    famloCommissionAmountMinor,
    hostGrossShareMinor,
  };
}

export function computePayoutEligibleAt(checkoutAt: string | null | undefined): string | null {
  const parsed = Date.parse(String(checkoutAt ?? ""));
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed + 24 * 60 * 60 * 1000).toISOString();
}

export function resolveIndiaCheckoutAt(
  checkoutDate: string | null | undefined,
  checkoutTime: string | null | undefined
): string | null {
  const dateMatch = String(checkoutDate ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const rawTime = String(checkoutTime ?? "").trim().toUpperCase();
  const timeMatch = rawTime.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] ?? 0);
  const meridiem = timeMatch[3];

  if (minute > 59 || hour > (meridiem ? 12 : 23) || hour < 0) return null;
  if (meridiem === "AM") hour = hour === 12 ? 0 : hour;
  if (meridiem === "PM") hour = hour === 12 ? 12 : hour + 12;

  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return null;
  }

  const utcMillis = Date.UTC(year, month - 1, day, hour, minute) - (5 * 60 + 30) * 60 * 1000;
  return new Date(utcMillis).toISOString();
}

export async function recordCashfreeSplitReadiness(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    paymentId: string;
    cashfreeOrderId: string;
    amountMinor: number;
    rawResponse?: JsonRecord;
  }
): Promise<{ recorded: boolean; status: string; reason?: string }> {
  const easySplitEnabled = isCashfreeEasySplitEnabled();
  const deferredSettlementEnabled = isCashfreeDeferredSettlementEnabled();
  const { data: booking, error: bookingError } = await supabase
    .from("bookings_v2")
    .select("id,host_id,end_date,pricing_snapshot,hosts(check_out_time)")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;

  const hostId = asString((booking as JsonRecord | null)?.host_id);
  if (!hostId) {
    return { recorded: false, status: "blocked", reason: "missing_host_id" };
  }

  const { data: vendor } = await supabase
    .from("cashfree_marketplace_vendors")
    .select("cashfree_vendor_id,is_active,activation_status,verification_status")
    .eq("host_id", hostId)
    .eq("provider", "cashfree")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cashfreeVendorId = asString((vendor as JsonRecord | null)?.cashfree_vendor_id);
  const hostRelation = Array.isArray((booking as JsonRecord | null)?.hosts)
    ? ((booking as JsonRecord).hosts as JsonRecord[])[0]
    : ((booking as JsonRecord | null)?.hosts as JsonRecord | null | undefined);
  const checkoutAt = resolveIndiaCheckoutAt(
    asString((booking as JsonRecord | null)?.end_date),
    asString(hostRelation?.check_out_time)
  );
  const split = computeFamloMarketplaceSplitMinor(input.amountMinor);
  const payoutEligibleAt = computePayoutEligibleAt(checkoutAt);
  const status = !easySplitEnabled
    ? "feature_disabled"
    : !deferredSettlementEnabled
      ? "deferred_settlement_disabled"
      : !cashfreeVendorId
        ? "vendor_missing"
        : !checkoutAt
          ? "checkout_time_missing"
        : "ready";

  await supabase.from("cashfree_marketplace_splits").upsert(
    {
      booking_id: input.bookingId,
      payment_id: input.paymentId,
      host_id: hostId,
      cashfree_vendor_id: cashfreeVendorId ?? `pending_host_${hostId}`,
      cashfree_order_id: input.cashfreeOrderId,
      gross_booking_amount_minor: split.grossBookingAmountMinor,
      famlo_commission_amount_minor: split.famloCommissionAmountMinor,
      host_gross_share_minor: split.hostGrossShareMinor,
      gateway_fee_minor: 0,
      gateway_fee_tax_minor: 0,
      refund_adjustment_minor: 0,
      host_net_payable_minor: split.hostGrossShareMinor,
      checkout_at: checkoutAt,
      payout_eligible_at: payoutEligibleAt,
      settlement_status: status,
      failure_reason: status === "ready" ? null : status,
      raw_response: {
        ...(input.rawResponse ?? {}),
        easy_split_enabled: easySplitEnabled,
        deferred_settlement_enabled: deferredSettlementEnabled,
        vendor_activation_status: asString((vendor as JsonRecord | null)?.activation_status),
        vendor_verification_status: asString((vendor as JsonRecord | null)?.verification_status),
        host_gross_share_rupees: asNumber(split.hostGrossShareMinor) / 100,
      },
    },
    { onConflict: "booking_id,cashfree_vendor_id" }
  );

  return { recorded: true, status };
}
