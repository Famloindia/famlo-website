import {
  PRO_BILLING_GST_PCT,
  PRO_BILLING_MIN_SUBTOTAL,
  PRO_BILLING_PRICING_VERSION,
  PRO_BILLING_PROPERTY_PRICE,
  PRO_BILLING_ROOM_PRICE,
  normalizeProBillingDurationMonths,
  roundInr,
} from "@/lib/pro-billing/config";
import type { ProBillingChargeQuote, ProBillingPricingBreakdown, ProBillingValidatedProperty } from "@/lib/pro-billing/types";

export function buildProBillingPricingBreakdown(
  properties: ProBillingValidatedProperty[]
): ProBillingPricingBreakdown {
  const propertyCount = properties.length;
  const roomCount = properties.reduce((sum, property) => sum + property.roomIds.length, 0);
  const rawSubtotalAmount = propertyCount * PRO_BILLING_PROPERTY_PRICE + roomCount * PRO_BILLING_ROOM_PRICE;
  const subtotalAmount = Math.max(rawSubtotalAmount, PRO_BILLING_MIN_SUBTOTAL);
  const gstAmount = roundInr((subtotalAmount * PRO_BILLING_GST_PCT) / 100);
  const totalAmount = roundInr(subtotalAmount + gstAmount);

  return {
    propertyCount,
    roomCount,
    rawSubtotalAmount,
    subtotalAmount,
    gstAmount,
    totalAmount,
    propertyUnitPrice: PRO_BILLING_PROPERTY_PRICE,
    roomUnitPrice: PRO_BILLING_ROOM_PRICE,
    minimumSubtotal: PRO_BILLING_MIN_SUBTOTAL,
    gstPct: PRO_BILLING_GST_PCT,
    pricingVersion: PRO_BILLING_PRICING_VERSION,
  };
}

export function buildProBillingChargeQuote(
  pricing: ProBillingPricingBreakdown,
  durationMonthsInput: number
): ProBillingChargeQuote {
  const durationMonths = normalizeProBillingDurationMonths(durationMonthsInput);
  const payableSubtotalAmount = pricing.subtotalAmount * durationMonths;
  const payableGstAmount = roundInr((payableSubtotalAmount * pricing.gstPct) / 100);
  const payableTotalAmount = payableSubtotalAmount + payableGstAmount;

  return {
    durationMonths,
    monthlySubtotalAmount: pricing.subtotalAmount,
    monthlyGstAmount: pricing.gstAmount,
    monthlyTotalAmount: pricing.totalAmount,
    payableSubtotalAmount,
    payableGstAmount,
    payableTotalAmount,
    gstPct: pricing.gstPct,
  };
}
