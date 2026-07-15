import { isTdsEnabledFlag } from "@/lib/finance/feature-flags";
import {
  SECTION_9_5_CALCULATION_VERSION,
  SECTION_9_5_GST_SLAB_THRESHOLD,
  SECTION_9_5_HIGHER_GST_RATE_BPS,
  SECTION_9_5_LOWER_GST_RATE_BPS,
  SECTION_9_5_PLATFORM_FEE_RATE_BPS,
  SECTION_9_5_TCS_RATE_BPS,
  type Section95FinanceContract,
  type Section95FinanceInput,
  type Section95NightBreakdown,
} from "@/lib/finance/finance-contracts";
import { calculateGatewayFeeBreakdown } from "@/lib/finance/gateway-fee-engine";
import { applyRateBps, clampMoney } from "@/lib/finance/money";
import { calculateTdsBreakdown } from "@/lib/finance/tds-engine";

function normalizeNightBreakdown(input: Section95FinanceInput["nights"][number]): Section95NightBreakdown {
  const actualValue = clampMoney(input.actualValue);
  const listedValue = clampMoney(input.listedValue ?? actualValue);
  const gstRateBps =
    actualValue <= SECTION_9_5_GST_SLAB_THRESHOLD
      ? SECTION_9_5_LOWER_GST_RATE_BPS
      : SECTION_9_5_HIGHER_GST_RATE_BPS;

  return {
    roomId: input.roomId ?? null,
    date: input.date ?? null,
    listedValue,
    actualValue,
    gstRateBps,
    gstAmount: clampMoney(applyRateBps(actualValue, gstRateBps)),
  };
}

export function calculateSection95FinanceContract(input: Section95FinanceInput): Section95FinanceContract {
  const taxMode = input.taxMode ?? "PENDING_COMPLIANCE";
  const accommodationGstBreakdown = input.nights.map(normalizeNightBreakdown);

  const roomBaseAmount = clampMoney(
    accommodationGstBreakdown.reduce((sum, night) => sum + night.actualValue, 0)
  );
  const accommodationGstAmount = clampMoney(
    accommodationGstBreakdown.reduce((sum, night) => sum + night.gstAmount, 0)
  );
  const guestPayableAmount = clampMoney(roomBaseAmount + accommodationGstAmount);

  const famloPlatformFeeInclGst = clampMoney(applyRateBps(roomBaseAmount, SECTION_9_5_PLATFORM_FEE_RATE_BPS));
  const famloPlatformFeeTaxable = clampMoney(famloPlatformFeeInclGst / 1.18);
  const famloPlatformFeeGst = clampMoney(famloPlatformFeeInclGst - famloPlatformFeeTaxable);
  const hostGrossPayout = clampMoney(roomBaseAmount - famloPlatformFeeInclGst);

  const tds = calculateTdsBreakdown(hostGrossPayout, {
    ...input.tds,
    enabled: input.tds?.enabled ?? isTdsEnabledFlag(),
  });
  const gateway = calculateGatewayFeeBreakdown(guestPayableAmount, input.gatewayFee);

  return {
    taxMode,
    calculationVersion: SECTION_9_5_CALCULATION_VERSION,
    roomBaseAmount,
    accommodationGstAmount,
    guestPayableAmount,
    famloPlatformFeeInclGst,
    famloPlatformFeeTaxable,
    famloPlatformFeeGst,
    hostGrossPayout,
    tcsAmount: SECTION_9_5_TCS_RATE_BPS,
    tdsApplicable: tds.tdsApplicable,
    tdsRate: tds.tdsRate,
    tdsAmount: tds.tdsAmount,
    hostNetPayout: tds.hostNetPayout,
    gatewayFeeBase: gateway.gatewayFeeBase,
    gatewayFeeGst: gateway.gatewayFeeGst,
    gatewayFeeTotal: gateway.gatewayFeeTotal,
    payoutBlocked: tds.payoutBlocked,
    payoutBlockReason: tds.payoutBlockReason,
    liveTdsDeductionEnabled: tds.liveTdsDeductionEnabled,
    tdsTrackedAmount: tds.tdsTrackedAmount,
    accommodationGstBreakdown,
  };
}
