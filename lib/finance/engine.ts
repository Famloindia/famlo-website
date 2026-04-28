import type { PgFeeBorneBy, PaymentGatewayFeeConfig, WithholdingConfig } from "@/lib/finance/config";
import { clampMoney, applyRateBps } from "@/lib/finance/money";

export type FinanceCalculationVersion = 1;

export type FinanceRuleSource = {
  ruleSetId: string | null;
  commissionRuleId: string | null;
  taxRuleIds: string[];
  payoutRuleId: string | null;
  overrideIds: string[];
  warnings: string[];
};

export type FinanceEngineInput = {
  bookingAmount: number;
  discountAmount: number;
  commissionRateBps: number;
  gstRateBps: number;
  stayTaxAmount: number;
  payoutGatewayFeeBurden: PgFeeBorneBy;
  paymentGatewayFee: PaymentGatewayFeeConfig;
  withholding: WithholdingConfig;
};

export type FinanceContractV1 = {
  calculation_version: FinanceCalculationVersion;
  booking_amount: number;
  discount_amount: number;
  amount_after_discount: number;
  commission_rate_bps: number;
  platform_fee: number;
  gst_rate_bps: number;
  gst_on_platform_fee: number;
  stay_tax_amount: number;
  guest_total: number;
  pg_fee_enabled: boolean;
  pg_fee_rate_bps: number;
  pg_fee_fixed_amount: number;
  pg_fee_base_amount: number;
  pg_fee_amount: number;
  pg_fee_borne_by: PgFeeBorneBy;
  platform_borne_pg_fee_amount: number;
  host_borne_pg_fee_amount: number;
  tds_enabled: boolean;
  tds_rate_bps: number;
  tds_base_amount: number;
  tds_amount: number;
  tcs_enabled: boolean;
  tcs_rate_bps: number;
  tcs_base_amount: number;
  tcs_amount: number;
  host_payout: number;
  famlo_net_revenue: number;
  rule_source: FinanceRuleSource;
};

export function computeFinanceContractV1(input: FinanceEngineInput & { ruleSource: FinanceRuleSource }): FinanceContractV1 {
  const bookingAmount = clampMoney(input.bookingAmount);
  const discountAmount = clampMoney(Math.min(input.discountAmount, bookingAmount));
  const amountAfterDiscount = clampMoney(bookingAmount - discountAmount);

  const commissionRateBps = Math.max(0, Math.trunc(input.commissionRateBps));
  const platformFee = applyRateBps(amountAfterDiscount, commissionRateBps);

  const gstRateBps = Math.max(0, Math.trunc(input.gstRateBps));
  const gstOnPlatformFee = applyRateBps(platformFee, gstRateBps);
  const stayTaxAmount = clampMoney(input.stayTaxAmount);

  const guestTotal = clampMoney(amountAfterDiscount + gstOnPlatformFee + stayTaxAmount);

  const pgFeeConfig = input.paymentGatewayFee;
  const pgFeeEnabled = Boolean(pgFeeConfig.pgFeeEnabled);
  const pgFeeBaseAmount = guestTotal;
  const pgFeeAmount = pgFeeEnabled
    ? clampMoney(applyRateBps(pgFeeBaseAmount, pgFeeConfig.pgFeeRateBps) + clampMoney(pgFeeConfig.pgFeeFixedAmount))
    : 0;

  const pgFeeBorneBy: PgFeeBorneBy = input.payoutGatewayFeeBurden === "host" ? "host" : "platform";
  const platformBornePgFeeAmount = pgFeeEnabled && pgFeeBorneBy === "platform" ? pgFeeAmount : 0;
  const hostBornePgFeeAmount = pgFeeEnabled && pgFeeBorneBy === "host" ? pgFeeAmount : 0;

  const withholding = input.withholding;
  // TODO(LEGAL_REVIEW_REQUIRED): confirm withholding bases and applicability per partner type and law.
  // For now, base is the post-commission principal that would otherwise transfer to the host.
  const preWithholdingPayoutBase = clampMoney(amountAfterDiscount - platformFee - hostBornePgFeeAmount);

  const tdsEnabled = Boolean(withholding.tdsEnabled);
  const tdsRateBps = Math.max(0, Math.trunc(withholding.tdsRateBps));
  const tdsBaseAmount = preWithholdingPayoutBase;
  const tdsAmount = tdsEnabled ? applyRateBps(tdsBaseAmount, tdsRateBps) : 0;

  const tcsEnabled = Boolean(withholding.tcsEnabled);
  const tcsRateBps = Math.max(0, Math.trunc(withholding.tcsRateBps));
  const tcsBaseAmount = preWithholdingPayoutBase;
  const tcsAmount = tcsEnabled ? applyRateBps(tcsBaseAmount, tcsRateBps) : 0;

  const hostPayout = clampMoney(preWithholdingPayoutBase - tdsAmount - tcsAmount);

  const famloNetRevenue = clampMoney(platformFee - platformBornePgFeeAmount);

  return {
    calculation_version: 1,
    booking_amount: bookingAmount,
    discount_amount: discountAmount,
    amount_after_discount: amountAfterDiscount,
    commission_rate_bps: commissionRateBps,
    platform_fee: platformFee,
    gst_rate_bps: gstRateBps,
    gst_on_platform_fee: gstOnPlatformFee,
    stay_tax_amount: stayTaxAmount,
    guest_total: guestTotal,
    pg_fee_enabled: pgFeeEnabled,
    pg_fee_rate_bps: Math.max(0, Math.trunc(pgFeeConfig.pgFeeRateBps)),
    pg_fee_fixed_amount: clampMoney(pgFeeConfig.pgFeeFixedAmount),
    pg_fee_base_amount: pgFeeBaseAmount,
    pg_fee_amount: pgFeeAmount,
    pg_fee_borne_by: pgFeeBorneBy,
    platform_borne_pg_fee_amount: platformBornePgFeeAmount,
    host_borne_pg_fee_amount: hostBornePgFeeAmount,
    tds_enabled: tdsEnabled,
    tds_rate_bps: tdsRateBps,
    tds_base_amount: tdsBaseAmount,
    tds_amount: tdsAmount,
    tcs_enabled: tcsEnabled,
    tcs_rate_bps: tcsRateBps,
    tcs_base_amount: tcsBaseAmount,
    tcs_amount: tcsAmount,
    host_payout: hostPayout,
    famlo_net_revenue: famloNetRevenue,
    rule_source: input.ruleSource,
  };
}

