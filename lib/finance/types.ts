import type {
  FinanceCalculationMode,
  FinanceProductType,
  PaymentEventProcessingStatus,
  PaymentIntentStatus,
  PayoutStatus,
  PayoutTiming,
  TaxSplitMode,
} from "@/lib/finance/constants";

export interface FinanceRuleReference {
  id: string;
  code?: string | null;
  version?: number | null;
}

export interface AppliedRuleIds {
  ruleSetId: string | null;
  commissionRuleId: string | null;
  taxRuleIds: string[];
  payoutRuleId: string | null;
  overrideIds: string[];
}

export interface FinanceGeographySnapshot {
  guestCountry: string;
  guestState: string | null;
  hostCountry: string;
  hostState: string | null;
  listingCountry: string;
  listingState: string | null;
}

export interface FinanceCalculationWarning {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
}

export interface FinanceCalculationInput {
  bookingAmount: number;
  discountAmount?: number;
  commissionPct: number;
  currency?: string;
  productType: FinanceProductType;
  calculationMode?: FinanceCalculationMode;
  gatewayFeeEstimate?: number;
  withholdingEstimate?: number;
  geography?: Partial<FinanceGeographySnapshot>;
  appliedRuleIds?: Partial<AppliedRuleIds>;
}

export interface TaxBreakdown {
  splitMode: TaxSplitMode;
  platformFeeTaxRatePct: number;
  platformFeeTaxAmount: number;
  stayTaxRatePct: number;
  stayTaxAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
}

export interface FinanceCalculationResult {
  bookingAmount: number;
  discountAmount: number;
  taxableBaseForServiceFee: number;
  platformFee: number;
  platformFeeTax: number;
  stayTax: number;
  guestTotal: number;
  hostPayout: number;
  gatewayFeeEstimate: number;
  withholdingEstimate: number;
  roundingAdjustment: number;
  netPlatformRevenue: number;
  totalTaxLiability: number;
  appliedRuleIds: AppliedRuleIds;
  calculationMode: FinanceCalculationMode;
  warnings: FinanceCalculationWarning[];
  taxBreakdown: TaxBreakdown;
}

export interface FinanceRuleSelectionContext {
  bookingOverrideId?: string | null;
  hostUserId?: string | null;
  listingId?: string | null;
  productType: FinanceProductType;
  countryCode?: string | null;
  effectiveAt: string;
}

export interface PaymentIntentAuditInput {
  bookingId: string;
  paymentId: string | null;
  provider: string;
  amountTotal: number;
  currency: string;
  providerOrderId?: string | null;
  idempotencyKey: string;
  status: PaymentIntentStatus;
  metadata?: Record<string, unknown>;
}

export interface PaymentEventAuditInput {
  paymentId: string | null;
  paymentIntentId?: string | null;
  provider: string;
  eventName: string;
  providerEventId?: string | null;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  processingStatus: PaymentEventProcessingStatus;
}

export interface FinanceOverviewMetrics {
  totalPaid: number;
  totalPlatformFee: number;
  totalTaxLiability: number;
  totalPartnerPayout: number;
  paidBookingCount: number;
  pendingPayoutAmount: number;
  pendingRefundAmount: number;
  unreconciledPaymentCount: number;
  activeRuleSetCode: string | null;
}

export interface FinanceRecentBookingRow {
  bookingId: string;
  paymentId: string | null;
  payoutId?: string | null;
  bookingType: string | null;
  bookingStatus: string | null;
  paymentStatus: string | null;
  guestName: string | null;
  partnerName: string | null;
  propertyName?: string | null;
  propertyLocation?: string | null;
  amountTotal: number;
  platformFee: number;
  taxAmount: number;
  partnerPayoutAmount: number;
  createdAt: string | null;
  checkIn: string | null;
  checkOut: string | null;
}

export interface PayoutPreviewResult {
  payoutTiming: PayoutTiming;
  payoutStatus: PayoutStatus;
  grossBookingValue: number;
  platformFee: number;
  platformFeeTax: number;
  gatewayFeeBurdenAmount: number;
  withholdingAmount: number;
  reserveAmount: number;
  netTransferableAmount: number;
}
