import { applyRateBps, clampMoney } from "@/lib/finance/money";

import {
  TDS_194_O_THRESHOLD_AMOUNT,
  TDS_194_O_WITHOUT_PAN_RATE_BPS,
  TDS_194_O_WITH_PAN_RATE_BPS,
  type Section95TdsInput,
} from "@/lib/finance/finance-contracts";

export type TdsBreakdown = {
  tdsApplicable: boolean;
  tdsRate: number;
  tdsAmount: number;
  hostNetPayout: number;
  payoutBlocked: boolean;
  payoutBlockReason: string | null;
  liveTdsDeductionEnabled: boolean;
  tdsTrackedAmount: number;
  tdsThresholdAmount: number;
  fyHostPayoutBeforeThisBooking: number;
  fyHostPayoutAfterThisBooking: number;
};

export function calculateTdsBreakdown(
  hostGrossPayout: number,
  input: Section95TdsInput = {}
): TdsBreakdown {
  const grossPayout = clampMoney(hostGrossPayout);
  const fyHostPayoutBeforeThisBooking = clampMoney(input.fyHostPayoutBeforeThisBooking ?? 0);
  const tdsThresholdAmount = clampMoney(input.thresholdAmount ?? TDS_194_O_THRESHOLD_AMOUNT);
  const fyHostPayoutAfterThisBooking = clampMoney(fyHostPayoutBeforeThisBooking + grossPayout);
  const hostPanVerified = input.hostPanVerified !== false;
  const blockPayoutIfPanMissing = input.blockPayoutIfPanMissing !== false;
  const liveTdsDeductionEnabled = input.enabled === true;
  const tdsApplicable = fyHostPayoutAfterThisBooking > tdsThresholdAmount;
  const rateBps = hostPanVerified
    ? Math.max(0, Math.trunc(input.withPanRateBps ?? TDS_194_O_WITH_PAN_RATE_BPS))
    : Math.max(0, Math.trunc(input.withoutPanRateBps ?? TDS_194_O_WITHOUT_PAN_RATE_BPS));
  const tdsTrackedAmount = tdsApplicable ? clampMoney(applyRateBps(grossPayout, rateBps)) : 0;
  const payoutBlocked = tdsApplicable && !hostPanVerified && blockPayoutIfPanMissing;
  const payoutBlockReason = payoutBlocked ? "PAN verification is required before payout can be released." : null;
  const tdsAmount = liveTdsDeductionEnabled && !payoutBlocked ? tdsTrackedAmount : 0;
  const hostNetPayout = payoutBlocked ? 0 : clampMoney(grossPayout - tdsAmount);

  return {
    tdsApplicable,
    tdsRate: rateBps / 10_000,
    tdsAmount,
    hostNetPayout,
    payoutBlocked,
    payoutBlockReason,
    liveTdsDeductionEnabled,
    tdsTrackedAmount,
    tdsThresholdAmount,
    fyHostPayoutBeforeThisBooking,
    fyHostPayoutAfterThisBooking,
  };
}
