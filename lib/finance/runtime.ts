import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

type EnsureSnapshotInput = {
  bookingId: string;
  paymentId?: string | null;
  currency?: string;
  bookingType?: string | null;
  pricingSnapshot?: JsonRecord | null;
  totalPrice?: number;
  partnerPayoutAmount?: number;
};

export async function ensureBookingFinancialSnapshot(
  supabase: SupabaseClient,
  input: EnsureSnapshotInput
): Promise<string | null> {
  try {
    const financeSnapshot = ((input.pricingSnapshot?.finance_snapshot as JsonRecord | null) ?? {}) as JsonRecord;
    const contract = (financeSnapshot.contract_v1 as JsonRecord | null) ?? null;
    const couponCode = asString(input.pricingSnapshot?.coupon_code);
    const discountAmount = asNumber(contract?.discount_amount ?? financeSnapshot.discount_amount ?? input.pricingSnapshot?.discount_amount);
    const bookingAmount = asNumber(
      contract?.booking_amount ??
        financeSnapshot.booking_amount ??
        input.pricingSnapshot?.subtotal ??
        input.pricingSnapshot?.taxable_amount ??
        input.totalPrice,
      0
    );
    const taxableBaseForServiceFee = asNumber(
      contract?.amount_after_discount ??
        financeSnapshot.taxable_base_for_service_fee ??
        input.pricingSnapshot?.taxable_amount ??
        bookingAmount - discountAmount
    );
    const platformFee = asNumber(contract?.platform_fee ?? financeSnapshot.platform_fee ?? input.pricingSnapshot?.platform_fee);
    const platformFeeTax = asNumber(
      contract?.gst_on_platform_fee ??
        financeSnapshot.platform_fee_tax ??
        financeSnapshot.tax_amount ??
        input.pricingSnapshot?.tax_amount
    );
    const guestTotal = asNumber(contract?.guest_total ?? financeSnapshot.guest_total ?? input.totalPrice);
    const hostPayout = asNumber(contract?.host_payout ?? financeSnapshot.host_payout ?? input.partnerPayoutAmount);
    const commissionRateBps = Math.max(
      0,
      Math.trunc(
        asNumber(
          contract?.commission_rate_bps ??
            input.pricingSnapshot?.commission_rate_bps ??
            (asNumber(input.pricingSnapshot?.commission_pct, 0) * 100),
          0
        )
      )
    );
    const snapshotPayload = {
      booking_id: input.bookingId,
      payment_id: input.paymentId ?? null,
      snapshot_kind: "checkout",
      snapshot_version: 1,
      calculation_mode: asString(financeSnapshot.calculation_mode) ?? "commission_gst_only",
      currency: input.currency ?? "INR",
      booking_amount: bookingAmount,
      discount_amount: discountAmount,
      taxable_base_for_service_fee: taxableBaseForServiceFee,
      platform_fee: platformFee,
      platform_fee_tax: platformFeeTax,
      stay_tax: asNumber(contract?.stay_tax_amount ?? financeSnapshot.stay_tax),
      guest_total: guestTotal,
      host_payout: hostPayout,
      gateway_fee_estimate: asNumber(contract?.platform_borne_pg_fee_amount ?? financeSnapshot.gateway_fee_estimate),
      withholding_estimate: contract
        ? asNumber(contract.tds_amount) + asNumber(contract.tcs_amount)
        : asNumber(financeSnapshot.withholding_estimate),
      rounding_adjustment: asNumber(financeSnapshot.rounding_adjustment),
      net_platform_revenue: asNumber(contract?.famlo_net_revenue ?? financeSnapshot.net_platform_revenue ?? platformFee),
      total_tax_liability: asNumber(financeSnapshot.total_tax_liability ?? platformFeeTax),
      commission_rate_bps: commissionRateBps,
      applied_rule_ids: (financeSnapshot.applied_rule_ids as JsonRecord | null) ?? {},
      geography_snapshot: (financeSnapshot.geography as JsonRecord | null) ?? {},
      coupon_snapshot: couponCode
        ? {
            code: couponCode,
            discount_amount: discountAmount,
          }
        : {},
      tax_breakdown: (financeSnapshot.tax_breakdown as JsonRecord | null) ?? {},
      payout_breakdown: (financeSnapshot.payout_breakdown as JsonRecord | null) ?? { host_payout: hostPayout },
      display_breakdown: {
        booking_amount: bookingAmount,
        platform_fee_tax: platformFeeTax,
        guest_total: guestTotal,
        host_payout: hostPayout,
      },
      formulas: {
        mode: asString(financeSnapshot.calculation_mode) ?? "commission_gst_only",
        booking_type: input.bookingType ?? null,
      },
      warnings: Array.isArray(financeSnapshot.warnings) ? financeSnapshot.warnings : [],
    };

    const { data, error } = await supabase
      .from("booking_financial_snapshots")
      .upsert(snapshotPayload, { onConflict: "booking_id,snapshot_kind,snapshot_version" })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    const snapshotId = asString(data?.id);
    if (snapshotId) {
      await supabase
        .from("payments_v2")
        .update({
          finance_snapshot_id: snapshotId,
          calculation_mode: snapshotPayload.calculation_mode,
        } as never)
        .eq("booking_id", input.bookingId);
    }

    return snapshotId;
  } catch (error) {
    console.error("[finance] booking snapshot write failed:", error);
    return null;
  }
}

type LedgerEntryInput = {
  bookingId?: string | null;
  paymentId?: string | null;
  payoutId?: string | null;
  refundId?: string | null;
  entryType: string;
  accountCode: string;
  direction: "debit" | "credit";
  amount: number;
  currency?: string;
  effectiveAt?: string;
  referenceType: string;
  referenceId: string;
  metadata?: JsonRecord;
};

export async function appendLedgerEntryIfMissing(
  supabase: SupabaseClient,
  input: LedgerEntryInput
): Promise<void> {
  try {
    const { data: existing, error: existingError } = await supabase
      .from("ledger_entries")
      .select("id")
      .eq("entry_type", input.entryType)
      .eq("account_code", input.accountCode)
      .eq("direction", input.direction)
      .eq("reference_type", input.referenceType)
      .eq("reference_id", input.referenceId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing?.id) {
      return;
    }

    const { error } = await supabase.from("ledger_entries").insert({
      booking_id: input.bookingId ?? null,
      payment_id: input.paymentId ?? null,
      payout_id: input.payoutId ?? null,
      refund_id: input.refundId ?? null,
      entry_type: input.entryType,
      account_code: input.accountCode,
      direction: input.direction,
      amount: Math.max(0, Math.round(input.amount)),
      currency: input.currency ?? "INR",
      effective_at: input.effectiveAt ?? new Date().toISOString(),
      reference_type: input.referenceType,
      reference_id: input.referenceId,
      metadata: input.metadata ?? {},
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("[finance] ledger insert failed:", error);
  }
}

type SchedulePayoutInput = {
  bookingId: string;
  paymentId?: string | null;
  partnerUserId: string;
  partnerProfileId: string;
  partnerType: "host" | "hommie";
  amount: number;
  pricingSnapshot?: JsonRecord | null;
  paymentTaxAmount?: number;
  method?: string;
};

export async function ensureScheduledPayout(
  supabase: SupabaseClient,
  input: SchedulePayoutInput
): Promise<string | null> {
  try {
    const { data: existing, error: existingError } = await supabase
      .from("payouts_v2")
      .select("id")
      .eq("booking_id", input.bookingId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing?.id) {
      return asString(existing.id);
    }

    const financeSnapshot = (input.pricingSnapshot?.finance_snapshot as JsonRecord | null) ?? null;
    const contract = (financeSnapshot?.contract_v1 as JsonRecord | null) ?? null;
    const appliedRuleIds = (financeSnapshot?.applied_rule_ids as JsonRecord | null) ?? null;
    const payoutRuleId =
      asString((contract?.rule_source as JsonRecord | null)?.payoutRuleId) ??
      asString(appliedRuleIds?.payoutRuleId);
    const grossBookingValue = asNumber(contract?.booking_amount ?? input.pricingSnapshot?.booking_amount ?? input.pricingSnapshot?.subtotal ?? input.amount);
    const platformFee = asNumber(contract?.platform_fee ?? input.pricingSnapshot?.platform_fee);
    const payoutPayload = {
      booking_id: input.bookingId,
      partner_type: input.partnerType,
      partner_user_id: input.partnerUserId,
      partner_profile_id: input.partnerProfileId,
      amount: Math.max(0, Math.round(input.amount)),
      method: input.method ?? "upi",
      status: "scheduled",
      finance_rule_id: payoutRuleId,
      gross_booking_value: grossBookingValue,
      platform_fee: platformFee,
      platform_fee_tax: asNumber(contract?.gst_on_platform_fee ?? input.pricingSnapshot?.platform_fee_tax ?? input.paymentTaxAmount),
      gateway_fee_burden_amount: asNumber(contract?.platform_borne_pg_fee_amount ?? input.pricingSnapshot?.gateway_fee_estimate),
      withholding_amount: contract ? asNumber(contract.tds_amount) + asNumber(contract.tcs_amount) : asNumber(input.pricingSnapshot?.withholding_estimate),
      reserve_amount: 0,
      net_transferable_amount: Math.max(0, Math.round(input.amount)),
      notes: "Scheduled automatically after verified payment.",
    };

    let insertResult = await supabase.from("payouts_v2").insert(payoutPayload as never).select("id").single();

    if (insertResult.error) {
      const message = String((insertResult.error as any)?.message ?? "");
      // Backward-compatible fallback if the column isn't present in an older DB.
      if (message.toLowerCase().includes("finance_rule_id")) {
        const { finance_rule_id: _omit, ...fallbackPayload } = payoutPayload as any;
        insertResult = await supabase.from("payouts_v2").insert(fallbackPayload as never).select("id").single();
      }
    }

    const { data, error } = insertResult;
    if (error) throw error;

    return asString(data?.id);
  } catch (error) {
    console.error("[finance] payout scheduling failed:", error);
    return null;
  }
}
