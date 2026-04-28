export type PgFeeBorneBy = "platform" | "host";

function asBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function asIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function asStringEnv(value: string | undefined, fallback: string): string {
  const next = typeof value === "string" ? value.trim() : "";
  return next.length > 0 ? next : fallback;
}

export type WithholdingConfig = {
  tdsEnabled: boolean;
  tdsRateBps: number;
  tcsEnabled: boolean;
  tcsRateBps: number;
};

export type PaymentGatewayFeeConfig = {
  pgFeeEnabled: boolean;
  pgFeeRateBps: number;
  pgFeeFixedAmount: number;
  pgFeeBorneBy: PgFeeBorneBy;
};

export function getWithholdingConfig(): WithholdingConfig {
  return {
    // Default OFF until legal/tax review is finalized.
    tdsEnabled: asBooleanEnv(process.env.FINANCE_TDS_ENABLED),
    tdsRateBps: Math.max(0, asIntEnv(process.env.FINANCE_TDS_RATE_BPS, 0)),
    tcsEnabled: asBooleanEnv(process.env.FINANCE_TCS_ENABLED),
    tcsRateBps: Math.max(0, asIntEnv(process.env.FINANCE_TCS_RATE_BPS, 0)),
  };
}

export function getPaymentGatewayFeeConfig(): PaymentGatewayFeeConfig {
  const borneBy = asStringEnv(process.env.FINANCE_PG_FEE_BORNE_BY, "platform").toLowerCase();
  const pgFeeBorneBy: PgFeeBorneBy = borneBy === "host" ? "host" : "platform";

  return {
    // Default OFF until gateway pricing + policy is configured.
    pgFeeEnabled: asBooleanEnv(process.env.FINANCE_PG_FEE_ENABLED),
    pgFeeRateBps: Math.max(0, asIntEnv(process.env.FINANCE_PG_FEE_RATE_BPS, 0)),
    pgFeeFixedAmount: Math.max(0, asIntEnv(process.env.FINANCE_PG_FEE_FIXED_AMOUNT, 0)),
    pgFeeBorneBy,
  };
}

export function isClientPricingFallbackEnabled(): boolean {
  // Emergency escape hatch only. Keep disabled in production.
  return asBooleanEnv(process.env.FINANCE_ALLOW_CLIENT_PRICING_FALLBACK);
}

