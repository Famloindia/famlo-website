import {
  isAdminFinanceOpsUiEnabled,
  isCheckoutSection95PricingEnabled,
  isCreditNoteGenerationEnabled,
  isGstCollectionEnabledFlag,
  isGstExportEnabledFlag,
  isGstInvoiceGenerationEnabled,
  isHostFinanceUiEnabled,
  isInvoiceEmailDeliveryEnabled,
  isInvoicePdfGenerationEnabled,
  isPayoutAccountCreationEnabled,
  isPayoutAccountValidationEnabled,
  isPayoutAdminApprovalRequired,
  isPayoutAutoRetryEnabled,
  isPlatformFeeInvoiceGenerationEnabled,
  isRazorpayRefundsEnabled,
  isRazorpayXEnabled,
  isRefundProviderExecutionEnabled,
  isSettlementPayoutExecutionEnabled,
  isTaxComplianceLockEnabled,
} from "@/lib/finance/feature-flags";

function asTrimmedString(value: string | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string" || value.trim().length === 0) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function normalizeTaxMode(value: string | undefined): string {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "SECTION_9_5") return "ECO_SECTION_9_5";
  if (normalized === "ECO_SECTION_9_5") return normalized;
  if (normalized === "HOST_MARKETPLACE" || normalized === "HOST_DIRECT_NO_TCS") return normalized;
  return "PENDING_COMPLIANCE";
}

export type FinanceRuntimeSecrets = {
  famloLegalEntityName: string | null;
  famloGstin: string | null;
  famloLegalAddress: string | null;
  gstInvoiceNumberPrefix: string | null;
  creditNoteNumberPrefix: string | null;
  currentAccountName: string | null;
  currentAccountNumber: string | null;
  currentAccountIfsc: string | null;
  emailProvider: string | null;
  emailFromAddress: string | null;
  emailReplyToAddress: string | null;
  razorpayKeyId: string | null;
  razorpayKeySecret: string | null;
  razorpayWebhookSecret: string | null;
  razorpayxKeyId: string | null;
  razorpayxKeySecret: string | null;
  razorpayxAccountNumber: string | null;
  razorpayxWebhookSecret: string | null;
};

export type FinanceRuntimeFlags = {
  taxMode: string;
  gstCollectionEnabled: boolean;
  checkoutSection95PricingEnabled: boolean;
  gstInvoiceGenerationEnabled: boolean;
  platformFeeInvoiceGenerationEnabled: boolean;
  creditNoteGenerationEnabled: boolean;
  gstExportEnabled: boolean;
  razorpayRefundsEnabled: boolean;
  refundProviderExecutionEnabled: boolean;
  autoRefundEnabled: boolean;
  razorpayxEnabled: boolean;
  payoutAccountCreationEnabled: boolean;
  payoutAccountValidationEnabled: boolean;
  settlementPayoutExecutionEnabled: boolean;
  payoutAdminApprovalRequired: boolean;
  payoutAutoRetryEnabled: boolean;
  invoicePdfGenerationEnabled: boolean;
  invoiceEmailDeliveryEnabled: boolean;
  adminFinanceOpsUiEnabled: boolean;
  hostFinanceUiEnabled: boolean;
  taxComplianceLockEnabled: boolean;
};

export type FinanceRuntimeConfig = {
  flags: FinanceRuntimeFlags;
  secrets: FinanceRuntimeSecrets;
};

export function getFinanceRuntimeConfig(): FinanceRuntimeConfig {
  return {
    flags: {
      taxMode: normalizeTaxMode(process.env.TAX_MODE),
      gstCollectionEnabled: isGstCollectionEnabledFlag(),
      checkoutSection95PricingEnabled: isCheckoutSection95PricingEnabled(),
      gstInvoiceGenerationEnabled: isGstInvoiceGenerationEnabled(),
      platformFeeInvoiceGenerationEnabled: isPlatformFeeInvoiceGenerationEnabled(),
      creditNoteGenerationEnabled: isCreditNoteGenerationEnabled(),
      gstExportEnabled: isGstExportEnabledFlag(),
      razorpayRefundsEnabled: isRazorpayRefundsEnabled(),
      refundProviderExecutionEnabled: isRefundProviderExecutionEnabled(),
      autoRefundEnabled: asBoolean(process.env.AUTO_REFUND_ENABLED, false),
      razorpayxEnabled: isRazorpayXEnabled(),
      payoutAccountCreationEnabled: isPayoutAccountCreationEnabled(),
      payoutAccountValidationEnabled: isPayoutAccountValidationEnabled(),
      settlementPayoutExecutionEnabled: isSettlementPayoutExecutionEnabled(),
      payoutAdminApprovalRequired: isPayoutAdminApprovalRequired(),
      payoutAutoRetryEnabled: isPayoutAutoRetryEnabled(),
      invoicePdfGenerationEnabled: isInvoicePdfGenerationEnabled(),
      invoiceEmailDeliveryEnabled: isInvoiceEmailDeliveryEnabled(),
      adminFinanceOpsUiEnabled: isAdminFinanceOpsUiEnabled(),
      hostFinanceUiEnabled: isHostFinanceUiEnabled(),
      taxComplianceLockEnabled: isTaxComplianceLockEnabled(),
    },
    secrets: {
      famloLegalEntityName: asTrimmedString(process.env.FAMLO_LEGAL_ENTITY_NAME),
      famloGstin: asTrimmedString(process.env.FAMLO_GSTIN),
      famloLegalAddress: asTrimmedString(process.env.FAMLO_LEGAL_ADDRESS),
      gstInvoiceNumberPrefix: asTrimmedString(process.env.GST_INVOICE_NUMBER_PREFIX),
      creditNoteNumberPrefix: asTrimmedString(process.env.CREDIT_NOTE_NUMBER_PREFIX),
      currentAccountName: asTrimmedString(process.env.FAMLO_CURRENT_ACCOUNT_NAME),
      currentAccountNumber: asTrimmedString(process.env.FAMLO_CURRENT_ACCOUNT_NUMBER),
      currentAccountIfsc: asTrimmedString(process.env.FAMLO_CURRENT_ACCOUNT_IFSC),
      emailProvider: asTrimmedString(process.env.EMAIL_PROVIDER),
      emailFromAddress: asTrimmedString(process.env.EMAIL_FROM_ADDRESS),
      emailReplyToAddress: asTrimmedString(process.env.EMAIL_REPLY_TO_ADDRESS),
      razorpayKeyId: asTrimmedString(process.env.RAZORPAY_KEY_ID),
      razorpayKeySecret: asTrimmedString(process.env.RAZORPAY_KEY_SECRET),
      razorpayWebhookSecret: asTrimmedString(process.env.RAZORPAY_WEBHOOK_SECRET),
      razorpayxKeyId: asTrimmedString(process.env.RAZORPAYX_KEY_ID),
      razorpayxKeySecret: asTrimmedString(process.env.RAZORPAYX_KEY_SECRET),
      razorpayxAccountNumber: asTrimmedString(process.env.RAZORPAYX_ACCOUNT_NUMBER),
      razorpayxWebhookSecret: asTrimmedString(process.env.RAZORPAYX_WEBHOOK_SECRET),
    },
  };
}
