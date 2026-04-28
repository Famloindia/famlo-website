export const FINANCE_CALCULATION_MODES = [
  "commission_gst_only",
  "full_tax_preview",
  "full_tax_live",
] as const;

export type FinanceCalculationMode = (typeof FINANCE_CALCULATION_MODES)[number];

export const FINANCE_PRODUCT_TYPES = [
  "host_stay",
  "hommie_session",
  "activity",
  "family_meal",
  "addon",
] as const;

export type FinanceProductType = (typeof FINANCE_PRODUCT_TYPES)[number];

export const FINANCE_RULE_STATUSES = ["draft", "active", "archived"] as const;
export type FinanceRuleStatus = (typeof FINANCE_RULE_STATUSES)[number];

export const PAYMENT_INTENT_STATUSES = [
  "draft",
  "created",
  "authorized",
  "paid",
  "failed",
  "cancelled",
] as const;
export type PaymentIntentStatus = (typeof PAYMENT_INTENT_STATUSES)[number];

export const PAYMENT_EVENT_PROCESSING_STATUSES = ["received", "processed", "ignored", "failed"] as const;
export type PaymentEventProcessingStatus = (typeof PAYMENT_EVENT_PROCESSING_STATUSES)[number];

export const PAYOUT_TIMINGS = [
  "immediate",
  "after_check_in",
  "after_completion",
  "manual_release",
] as const;
export type PayoutTiming = (typeof PAYOUT_TIMINGS)[number];

export const PAYOUT_STATUSES = [
  "pending",
  "scheduled",
  "on_hold",
  "processing",
  "paid",
  "failed",
  "reversed",
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const REFUND_STATUSES = [
  "draft",
  "pending",
  "processing",
  "processed",
  "failed",
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const LEDGER_ENTRY_TYPES = [
  "payment_captured",
  "booking_confirmed",
  "payout_scheduled",
  "payout_completed",
  "refund_initiated",
  "refund_completed",
  "dispute_hold",
  "manual_adjustment",
  "tax_liability",
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const TAX_SPLIT_MODES = ["none", "cgst_sgst", "igst"] as const;
export type TaxSplitMode = (typeof TAX_SPLIT_MODES)[number];

export const FINANCE_RULE_PRECEDENCE = [
  "booking_override",
  "host_override",
  "listing_override",
  "product_default",
  "country_default",
  "global_default",
] as const;

export const DEFAULT_FINANCE_RULESET_CODE = "famlo_default_mvp";
export const DEFAULT_FINANCE_RULESET_NAME = "Famlo Default MVP Finance Rules";
export const DEFAULT_COMMISSION_PCT = 18;
export const PLATFORM_DEFAULT_GST_PCT = 18;
