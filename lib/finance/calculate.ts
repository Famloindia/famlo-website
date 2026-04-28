import {
  DEFAULT_COMMISSION_PCT,
  PLATFORM_DEFAULT_GST_PCT,
  type FinanceCalculationMode,
} from "@/lib/finance/constants";
import type { AppliedRuleIds, FinanceCalculationInput, FinanceCalculationResult, PayoutPreviewResult } from "@/lib/finance/types";

function roundCurrency(value: number): number {
  return Math.round(Number.isFinite(value) ? value : 0);
}

function clampCurrency(value: number): number {
  return Math.max(0, roundCurrency(value));
}

function resolveAppliedRuleIds(partial?: Partial<AppliedRuleIds>): AppliedRuleIds {
  return {
    ruleSetId: partial?.ruleSetId ?? null,
    commissionRuleId: partial?.commissionRuleId ?? null,
    taxRuleIds: partial?.taxRuleIds ?? [],
    payoutRuleId: partial?.payoutRuleId ?? null,
    overrideIds: partial?.overrideIds ?? [],
  };
}

export function calculateFinanceQuote(input: FinanceCalculationInput): FinanceCalculationResult {
  const bookingAmount = clampCurrency(input.bookingAmount);
  const discountAmount = clampCurrency(Math.min(input.discountAmount ?? 0, bookingAmount));
  const taxableBaseForServiceFee = clampCurrency(bookingAmount - discountAmount);
  const commissionPct = Math.max(0, Number.isFinite(input.commissionPct) ? input.commissionPct : DEFAULT_COMMISSION_PCT);
  const calculationMode: FinanceCalculationMode = input.calculationMode ?? "commission_gst_only";

  const platformFee = clampCurrency(taxableBaseForServiceFee * (commissionPct / 100));
  const platformFeeTax = clampCurrency(platformFee * (PLATFORM_DEFAULT_GST_PCT / 100));
  const stayTax = calculationMode === "commission_gst_only" ? 0 : 0;
  const gatewayFeeEstimate = clampCurrency(input.gatewayFeeEstimate ?? 0);
  const withholdingEstimate = clampCurrency(input.withholdingEstimate ?? 0);
  const guestTotal = clampCurrency(taxableBaseForServiceFee + platformFeeTax + stayTax);
  const hostPayout = clampCurrency(taxableBaseForServiceFee - platformFee);
  const netPlatformRevenue = clampCurrency(platformFee - gatewayFeeEstimate - withholdingEstimate);
  const totalTaxLiability = clampCurrency(platformFeeTax + stayTax);
  const warnings =
    calculationMode === "commission_gst_only"
      ? []
      : [
          {
            code: "FULL_TAX_MODE_NOT_LIVE",
            message: "Full-tax mode is scaffolded but still requires legal/tax rollout validation.",
            severity: "warning" as const,
          },
        ];

  return {
    bookingAmount,
    discountAmount,
    taxableBaseForServiceFee,
    platformFee,
    platformFeeTax,
    stayTax,
    guestTotal,
    hostPayout,
    gatewayFeeEstimate,
    withholdingEstimate,
    roundingAdjustment: 0,
    netPlatformRevenue,
    totalTaxLiability,
    appliedRuleIds: resolveAppliedRuleIds(input.appliedRuleIds),
    calculationMode,
    warnings,
    taxBreakdown: {
      splitMode: "none",
      platformFeeTaxRatePct: PLATFORM_DEFAULT_GST_PCT,
      platformFeeTaxAmount: platformFeeTax,
      stayTaxRatePct: 0,
      stayTaxAmount: stayTax,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: platformFeeTax,
    },
  };
}

export function buildBookingPricingSnapshot(
  input: FinanceCalculationInput,
  result: FinanceCalculationResult
): Record<string, unknown> {
  return {
    booking_amount: result.bookingAmount,
    discount_amount: result.discountAmount,
    taxable_base_for_service_fee: result.taxableBaseForServiceFee,
    platform_fee: result.platformFee,
    platform_fee_tax: result.platformFeeTax,
    stay_tax: result.stayTax,
    guest_total: result.guestTotal,
    host_payout: result.hostPayout,
    gateway_fee_estimate: result.gatewayFeeEstimate,
    withholding_estimate: result.withholdingEstimate,
    rounding_adjustment: result.roundingAdjustment,
    net_platform_revenue: result.netPlatformRevenue,
    total_tax_liability: result.totalTaxLiability,
    applied_rule_ids: result.appliedRuleIds,
    calculation_mode: result.calculationMode,
    warnings: result.warnings,
    currency: input.currency ?? "INR",
    product_type: input.productType,
    geography: input.geography ?? null,
    tax_breakdown: result.taxBreakdown,
  };
}

export function previewPayoutFromCalculation(result: FinanceCalculationResult): PayoutPreviewResult {
  return {
    payoutTiming: "after_completion",
    payoutStatus: "pending",
    grossBookingValue: result.bookingAmount,
    platformFee: result.platformFee,
    platformFeeTax: result.platformFeeTax,
    gatewayFeeBurdenAmount: result.gatewayFeeEstimate,
    withholdingAmount: result.withholdingEstimate,
    reserveAmount: 0,
    netTransferableAmount: result.hostPayout,
  };
}
