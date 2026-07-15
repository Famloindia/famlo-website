import type { FinanceTaxMode } from "@/lib/finance/settings";

export const SECTION_9_5_CALCULATION_VERSION = "section_9_5_v1";
export const SECTION_9_5_PLATFORM_FEE_RATE_BPS = 1600;
export const SECTION_9_5_PLATFORM_FEE_GST_RATE_BPS = 1800;
export const SECTION_9_5_LOWER_GST_RATE_BPS = 500;
export const SECTION_9_5_HIGHER_GST_RATE_BPS = 1800;
export const SECTION_9_5_GST_SLAB_THRESHOLD = 7500;
export const SECTION_9_5_TCS_RATE_BPS = 0;
export const TDS_194_O_THRESHOLD_AMOUNT = 500000;
export const TDS_194_O_WITH_PAN_RATE_BPS = 10;
export const TDS_194_O_WITHOUT_PAN_RATE_BPS = 500;

export type Section95NightInput = {
  roomId?: string | null;
  date?: string | null;
  listedValue?: number | null;
  actualValue: number;
};

export type Section95NightBreakdown = {
  roomId: string | null;
  date: string | null;
  listedValue: number;
  actualValue: number;
  gstRateBps: number;
  gstAmount: number;
};

export type Section95GatewayFeeInput = {
  rateBps?: number;
  fixedFeeAmount?: number;
  gstRateBps?: number;
};

export type Section95TdsInput = {
  enabled?: boolean;
  hostPanVerified?: boolean;
  fyHostPayoutBeforeThisBooking?: number;
  thresholdAmount?: number;
  withPanRateBps?: number;
  withoutPanRateBps?: number;
  blockPayoutIfPanMissing?: boolean;
};

export type Section95FinanceInput = {
  taxMode?: FinanceTaxMode;
  nights: Section95NightInput[];
  gatewayFee?: Section95GatewayFeeInput;
  tds?: Section95TdsInput;
};

export type Section95FinanceContract = {
  taxMode: FinanceTaxMode;
  calculationVersion: string;
  roomBaseAmount: number;
  accommodationGstAmount: number;
  guestPayableAmount: number;
  famloPlatformFeeInclGst: number;
  famloPlatformFeeTaxable: number;
  famloPlatformFeeGst: number;
  hostGrossPayout: number;
  tcsAmount: number;
  tdsApplicable: boolean;
  tdsRate: number;
  tdsAmount: number;
  hostNetPayout: number;
  gatewayFeeBase: number;
  gatewayFeeGst: number;
  gatewayFeeTotal: number;
  payoutBlocked: boolean;
  payoutBlockReason: string | null;
  liveTdsDeductionEnabled: boolean;
  tdsTrackedAmount: number;
  accommodationGstBreakdown: Section95NightBreakdown[];
};

export function isSection95TaxMode(mode: string | null | undefined): boolean {
  const normalized = String(mode ?? "").trim().toUpperCase();
  return normalized === "ECO_SECTION_9_5" || normalized === "SECTION_9_5";
}
