import { applyRateBps, clampMoney } from "@/lib/finance/money";

export const INDIA_HOST_STAY_GST_LOW_RATE_BPS = 1200;
export const INDIA_HOST_STAY_GST_HIGH_RATE_BPS = 1800;
export const INDIA_HOST_STAY_GST_HIGH_RATE_THRESHOLD = 7500;

export type HostStayGstQuote = {
  taxableBase: number;
  rateBps: number;
  amount: number;
  thresholdPerUnitPerDay: number;
};

export function calculateIndiaHostStayGst(input: {
  unitPrice: number;
  taxableBase: number;
}): HostStayGstQuote {
  const unitPrice = clampMoney(input.unitPrice);
  const taxableBase = clampMoney(input.taxableBase);
  const rateBps =
    unitPrice > INDIA_HOST_STAY_GST_HIGH_RATE_THRESHOLD
      ? INDIA_HOST_STAY_GST_HIGH_RATE_BPS
      : INDIA_HOST_STAY_GST_LOW_RATE_BPS;

  return {
    taxableBase,
    rateBps,
    amount: applyRateBps(taxableBase, rateBps),
    thresholdPerUnitPerDay: INDIA_HOST_STAY_GST_HIGH_RATE_THRESHOLD,
  };
}
