import { applyRateBps, clampMoney } from "@/lib/finance/money";

import type { Section95GatewayFeeInput } from "@/lib/finance/finance-contracts";

export type GatewayFeeBreakdown = {
  gatewayFeeBase: number;
  gatewayFeeGst: number;
  gatewayFeeTotal: number;
};

export function calculateGatewayFeeBreakdown(
  guestPayableAmount: number,
  input: Section95GatewayFeeInput = {}
): GatewayFeeBreakdown {
  const baseAmount = clampMoney(guestPayableAmount);
  const rateBps = Math.max(0, Math.trunc(input.rateBps ?? 0));
  const fixedFeeAmount = clampMoney(input.fixedFeeAmount ?? 0);
  const gstRateBps = Math.max(0, Math.trunc(input.gstRateBps ?? 1800));

  const gatewayFeeBase = clampMoney(applyRateBps(baseAmount, rateBps) + fixedFeeAmount);
  const gatewayFeeGst = clampMoney(applyRateBps(gatewayFeeBase, gstRateBps));

  return {
    gatewayFeeBase,
    gatewayFeeGst,
    gatewayFeeTotal: clampMoney(gatewayFeeBase + gatewayFeeGst),
  };
}
