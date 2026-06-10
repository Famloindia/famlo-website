export const PRO_BILLING_PRICING_VERSION = "pro_v1";
export const PRO_BILLING_PROPERTY_PRICE = 199;
export const PRO_BILLING_ROOM_PRICE = 100;
export const PRO_BILLING_ADDON_PROPERTY_PRICE = 199;
export const PRO_BILLING_ADDON_ROOM_PRICE = 100;
export const PRO_BILLING_MIN_SUBTOTAL = 499;
export const PRO_BILLING_GST_PCT = 18;
export const PRO_BILLING_PERIOD_DAYS = 30;
export const PRO_BILLING_GRACE_PERIOD_DAYS = 7;
export const PRO_BILLING_ALLOWED_DURATIONS = [1, 3, 6] as const;
export const PRO_BILLING_AUTOPAY_TOTAL_COUNT = Number.parseInt(
  process.env.FAMLO_PRO_SUBSCRIPTION_TOTAL_COUNT ?? "120",
  10
);

export function roundInr(value: number): number {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

export function roundInrDisplay(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function isAllowedProBillingDuration(value: unknown): value is (typeof PRO_BILLING_ALLOWED_DURATIONS)[number] {
  return PRO_BILLING_ALLOWED_DURATIONS.includes(value as (typeof PRO_BILLING_ALLOWED_DURATIONS)[number]);
}

export function normalizeProBillingDurationMonths(value: unknown): (typeof PRO_BILLING_ALLOWED_DURATIONS)[number] {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (isAllowedProBillingDuration(parsed)) {
    return parsed;
  }
  throw new Error("Famlo Pro prepaid duration must be 1, 3, or 6 months.");
}

export function isFamloProAutopayEnabled(): boolean {
  return String(process.env.FAMLO_PRO_AUTOPAY_ENABLED ?? "")
    .trim()
    .toLowerCase() === "true";
}

export function resolveProBillingPlanDays(durationMonths: 1 | 3 | 6): number {
  return durationMonths * PRO_BILLING_PERIOD_DAYS;
}

export function requiresFamloProSubscriptionAutopay(): boolean {
  return String(process.env.FAMLO_PRO_AUTOPAY_REQUIRE_SUBSCRIPTION ?? "true")
    .trim()
    .toLowerCase() === "true";
}
