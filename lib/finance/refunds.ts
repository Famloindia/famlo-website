import { allocateProRata, clampMoney } from "@/lib/finance/money";

export type RefundAllocationBreakdown = {
  guest_principal: number;
  platform_fee_reversal: number;
  platform_tax_reversal: number;
  // Optional: if a coupon reversal policy is adopted, track it explicitly.
  coupon_reversal: number;
  rounding_adjustment: number;
  metadata: Record<string, unknown>;
};

export function computeRefundAllocationBreakdown(input: {
  refundAmount: number;
  guestTotal: number;
  amountAfterDiscount: number;
  platformFee: number;
  platformFeeTax: number;
  stayTaxAmount?: number;
}): RefundAllocationBreakdown {
  const refundAmount = clampMoney(input.refundAmount);
  const guestTotal = clampMoney(input.guestTotal);
  const amountAfterDiscount = clampMoney(input.amountAfterDiscount);
  const platformFee = clampMoney(input.platformFee);
  const platformFeeTax = clampMoney(input.platformFeeTax);
  const stayTaxAmount = clampMoney(input.stayTaxAmount ?? 0);

  // Under current model guest_total = amount_after_discount + platform_fee_tax + stay_tax
  const impliedGuestTotal = clampMoney(amountAfterDiscount + platformFeeTax + stayTaxAmount);
  const effectiveTotal = guestTotal > 0 ? guestTotal : impliedGuestTotal;

  // Principal contains both host payout portion + platform fee portion.
  const hostPrincipalBase = clampMoney(amountAfterDiscount - platformFee);

  const { allocations, roundingAdjustment } = allocateProRata(
    {
      guest_principal: hostPrincipalBase,
      platform_fee_reversal: platformFee,
      platform_tax_reversal: clampMoney(platformFeeTax + stayTaxAmount),
    },
    Math.min(refundAmount, effectiveTotal > 0 ? effectiveTotal : refundAmount)
  );

  // If the gateway refunds more than our effectiveTotal, we keep the extra inside guest_principal for now.
  // TODO(LEGAL_REVIEW_REQUIRED): decide how to treat excess refunds (manual adjustments / goodwill / error handling).
  const allocatedSum =
    clampMoney(allocations.guest_principal) +
    clampMoney(allocations.platform_fee_reversal) +
    clampMoney(allocations.platform_tax_reversal);
  const excess = clampMoney(refundAmount - allocatedSum);

  return {
    guest_principal: clampMoney((allocations.guest_principal ?? 0) + excess),
    platform_fee_reversal: clampMoney(allocations.platform_fee_reversal ?? 0),
    platform_tax_reversal: clampMoney(allocations.platform_tax_reversal ?? 0),
    coupon_reversal: 0,
    rounding_adjustment: clampMoney(roundingAdjustment),
    metadata: {
      guest_total: effectiveTotal,
      implied_guest_total: impliedGuestTotal,
      refund_amount: refundAmount,
      bases: {
        host_principal_base: hostPrincipalBase,
        platform_fee_base: platformFee,
        platform_tax_base: clampMoney(platformFeeTax + stayTaxAmount),
      },
      rounding_adjustment: roundingAdjustment,
      excess_refund_amount: excess,
    },
  };
}

