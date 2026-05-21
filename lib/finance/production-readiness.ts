import type { SupabaseClient } from "@supabase/supabase-js";

import { getFinanceRuntimeConfig, type FinanceRuntimeConfig } from "@/lib/finance/finance-runtime-config";
import { buildFinanceReconciliationSnapshot } from "@/lib/finance/reconciliation";
import { type FinanceSettings, getFinanceSettings } from "@/lib/finance/settings";

type ReadinessState = "ready" | "blocking" | "warning";

export type ReadinessCheck = {
  key: string;
  label: string;
  state: ReadinessState;
  message: string;
};

export type ReadinessGroup = {
  state: ReadinessState;
  checks: ReadinessCheck[];
};

export type ProductionReadinessReport = {
  generatedAt: string;
  tax: ReadinessGroup;
  payments: ReadinessGroup;
  refunds: ReadinessGroup;
  payouts: ReadinessGroup;
  invoices: ReadinessGroup;
  email: ReadinessGroup;
  reconciliation: ReadinessGroup;
  flags: FinanceRuntimeConfig["flags"];
  dbSettings: Pick<
    FinanceSettings,
    | "taxMode"
    | "gstCollectionEnabled"
    | "gstInvoiceGenerationEnabled"
    | "gstExportEnabled"
    | "approvedBy"
    | "approvedAt"
    | "payoutReleasePolicy"
  >;
};

function hasValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function mergeState(current: ReadinessState, next: ReadinessState): ReadinessState {
  if (current === "blocking" || next === "blocking") return "blocking";
  if (current === "warning" || next === "warning") return "warning";
  return "ready";
}

function summarizeGroup(checks: ReadinessCheck[]): ReadinessGroup {
  return {
    state: checks.reduce<ReadinessState>((state, check) => mergeState(state, check.state), "ready"),
    checks,
  };
}

function evaluateTaxChecks(runtime: FinanceRuntimeConfig, settings: FinanceSettings): ReadinessCheck[] {
  const dbSection95 = settings.taxMode === "ECO_SECTION_9_5";
  const envSection95 = runtime.flags.taxMode === "ECO_SECTION_9_5";
  return [
    {
      key: "tax_mode_env",
      label: "TAX_MODE",
      state: envSection95 ? "ready" : "blocking",
      message: envSection95 ? "Runtime tax mode is set for Section 9(5)." : "TAX_MODE must be SECTION_9_5 before GST collection.",
    },
    {
      key: "tax_mode_db",
      label: "Finance settings tax mode",
      state: dbSection95 ? "ready" : "blocking",
      message: dbSection95 ? "DB finance settings are on Section 9(5)." : "Finance settings tax mode is not yet Section 9(5).",
    },
    {
      key: "gstin",
      label: "Famlo GSTIN",
      state: hasValue(runtime.secrets.famloGstin) ? "ready" : "blocking",
      message: hasValue(runtime.secrets.famloGstin) ? "GSTIN is configured." : "Famlo GSTIN is missing.",
    },
    {
      key: "legal_entity",
      label: "Legal entity details",
      state:
        hasValue(runtime.secrets.famloLegalEntityName) && hasValue(runtime.secrets.famloLegalAddress) ? "ready" : "blocking",
      message:
        hasValue(runtime.secrets.famloLegalEntityName) && hasValue(runtime.secrets.famloLegalAddress)
          ? "Legal entity name and address are configured."
          : "Famlo legal entity name/address must be configured.",
    },
    {
      key: "tax_lock",
      label: "Compliance lock",
      state: runtime.flags.taxComplianceLockEnabled ? "warning" : "ready",
      message: runtime.flags.taxComplianceLockEnabled
        ? "Compliance lock is still enabled; tax actions remain guarded until explicitly cleared."
        : "Compliance lock is disabled.",
    },
  ];
}

function evaluatePaymentChecks(runtime: FinanceRuntimeConfig): ReadinessCheck[] {
  return [
    {
      key: "razorpay_keys",
      label: "Razorpay live API credentials",
      state: hasValue(runtime.secrets.razorpayKeyId) && hasValue(runtime.secrets.razorpayKeySecret) ? "ready" : "blocking",
      message:
        hasValue(runtime.secrets.razorpayKeyId) && hasValue(runtime.secrets.razorpayKeySecret)
          ? "Razorpay API credentials are configured."
          : "Razorpay live key/secret must be present before live payment or refund execution.",
    },
    {
      key: "razorpay_webhook",
      label: "Razorpay webhook secret",
      state: hasValue(runtime.secrets.razorpayWebhookSecret) ? "ready" : "blocking",
      message: hasValue(runtime.secrets.razorpayWebhookSecret)
        ? "Razorpay webhook secret is configured."
        : "Razorpay webhook secret is missing.",
    },
    {
      key: "checkout_section95",
      label: "Checkout Section 9(5) pricing flag",
      state: runtime.flags.checkoutSection95PricingEnabled ? "warning" : "ready",
      message: runtime.flags.checkoutSection95PricingEnabled
        ? "Checkout Section 9(5) pricing is enabled and should be verified carefully before rollout."
        : "Checkout Section 9(5) pricing remains disabled.",
    },
  ];
}

function evaluateRefundChecks(runtime: FinanceRuntimeConfig): ReadinessCheck[] {
  return [
    {
      key: "refund_provider_flag",
      label: "Refund provider execution",
      state:
        runtime.flags.refundProviderExecutionEnabled && runtime.flags.razorpayRefundsEnabled
          ? "warning"
          : "ready",
      message:
        runtime.flags.refundProviderExecutionEnabled && runtime.flags.razorpayRefundsEnabled
          ? "Refund execution flags are enabled; keep admin approval and reconciliation in place."
          : "Refund provider execution remains disabled by flags.",
    },
    {
      key: "refund_auto_flag",
      label: "Automatic refund flag",
      state: runtime.flags.autoRefundEnabled ? "warning" : "ready",
      message: runtime.flags.autoRefundEnabled
        ? "Automatic refunds are enabled; verify safe-case thresholds before rollout."
        : "Automatic refunds remain disabled.",
    },
  ];
}

function evaluatePayoutChecks(runtime: FinanceRuntimeConfig, reconciliationCriticalCount: number): ReadinessCheck[] {
  return [
    {
      key: "razorpayx_keys",
      label: "RazorpayX credentials",
      state:
        hasValue(runtime.secrets.razorpayxKeyId) &&
        hasValue(runtime.secrets.razorpayxKeySecret) &&
        hasValue(runtime.secrets.razorpayxAccountNumber)
          ? "ready"
          : "blocking",
      message:
        hasValue(runtime.secrets.razorpayxKeyId) &&
        hasValue(runtime.secrets.razorpayxKeySecret) &&
        hasValue(runtime.secrets.razorpayxAccountNumber)
          ? "RazorpayX credentials and account number are configured."
          : "RazorpayX key/secret/account number must be configured before payout account or payout execution.",
    },
    {
      key: "razorpayx_webhook",
      label: "RazorpayX webhook secret",
      state: hasValue(runtime.secrets.razorpayxWebhookSecret) ? "ready" : "blocking",
      message: hasValue(runtime.secrets.razorpayxWebhookSecret)
        ? "RazorpayX webhook secret is configured."
        : "RazorpayX webhook secret is missing.",
    },
    {
      key: "current_account",
      label: "Current account configuration",
      state:
        hasValue(runtime.secrets.currentAccountName) &&
        hasValue(runtime.secrets.currentAccountNumber) &&
        hasValue(runtime.secrets.currentAccountIfsc)
          ? "ready"
          : "blocking",
      message:
        hasValue(runtime.secrets.currentAccountName) &&
        hasValue(runtime.secrets.currentAccountNumber) &&
        hasValue(runtime.secrets.currentAccountIfsc)
          ? "Current account configuration is present."
          : "Current account / settlement bank configuration is incomplete.",
    },
    {
      key: "payout_execution_flag",
      label: "Settlement payout execution flag",
      state: runtime.flags.settlementPayoutExecutionEnabled ? "warning" : "ready",
      message: runtime.flags.settlementPayoutExecutionEnabled
        ? "Payout execution flag is enabled; keep explicit admin trigger and webhook confirmation in place."
        : "Payout execution remains disabled by flag.",
    },
    {
      key: "reconciliation_critical",
      label: "Critical reconciliation issues",
      state: reconciliationCriticalCount === 0 ? "ready" : "blocking",
      message:
        reconciliationCriticalCount === 0
          ? "No critical reconciliation issues are blocking payout execution."
          : `${reconciliationCriticalCount} critical reconciliation issue(s) must be resolved before payout execution.`,
    },
  ];
}

function evaluateInvoiceChecks(runtime: FinanceRuntimeConfig, settings: FinanceSettings): ReadinessCheck[] {
  return [
    {
      key: "gst_invoice_prefix",
      label: "GST invoice numbering",
      state: hasValue(runtime.secrets.gstInvoiceNumberPrefix) ? "ready" : "blocking",
      message: hasValue(runtime.secrets.gstInvoiceNumberPrefix)
        ? "GST invoice numbering prefix is configured."
        : "GST invoice numbering config is missing.",
    },
    {
      key: "credit_note_prefix",
      label: "Credit note numbering",
      state: hasValue(runtime.secrets.creditNoteNumberPrefix) ? "ready" : "blocking",
      message: hasValue(runtime.secrets.creditNoteNumberPrefix)
        ? "Credit note numbering prefix is configured."
        : "Credit note numbering config is missing.",
    },
    {
      key: "db_invoice_setting",
      label: "DB invoice generation approval",
      state: settings.gstInvoiceGenerationEnabled ? "warning" : "ready",
      message: settings.gstInvoiceGenerationEnabled
        ? "Finance settings permit GST invoice generation once env flags are also enabled."
        : "Finance settings still keep GST invoice generation disabled.",
    },
    {
      key: "pdf_generation_flag",
      label: "Invoice PDF generation",
      state: runtime.flags.invoicePdfGenerationEnabled ? "warning" : "ready",
      message: runtime.flags.invoicePdfGenerationEnabled
        ? "Invoice PDF generation is enabled; verify storage and legal templates before rollout."
        : "Invoice PDF generation remains disabled.",
    },
  ];
}

function evaluateEmailChecks(runtime: FinanceRuntimeConfig): ReadinessCheck[] {
  return [
    {
      key: "email_provider",
      label: "Email provider configuration",
      state:
        hasValue(runtime.secrets.emailProvider) &&
        hasValue(runtime.secrets.emailFromAddress)
          ? "ready"
          : "blocking",
      message:
        hasValue(runtime.secrets.emailProvider) &&
        hasValue(runtime.secrets.emailFromAddress)
          ? "Email provider and sender address are configured."
          : "Email provider config must be present before finance email sending.",
    },
    {
      key: "invoice_email_flag",
      label: "Invoice email delivery flag",
      state: runtime.flags.invoiceEmailDeliveryEnabled ? "warning" : "ready",
      message: runtime.flags.invoiceEmailDeliveryEnabled
        ? "Invoice email delivery is enabled; verify PDFs and resend controls before rollout."
        : "Invoice email delivery remains disabled.",
    },
  ];
}

function evaluateReconciliationChecks(summary: {
  total: number;
  critical: number;
  warning: number;
  info: number;
}): ReadinessCheck[] {
  return [
    {
      key: "critical_issues",
      label: "Critical reconciliation issues",
      state: summary.critical === 0 ? "ready" : "blocking",
      message:
        summary.critical === 0
          ? "No critical reconciliation issues are open."
          : `${summary.critical} critical reconciliation issue(s) are open.`,
    },
    {
      key: "warning_issues",
      label: "Warning reconciliation issues",
      state: summary.warning === 0 ? "ready" : "warning",
      message:
        summary.warning === 0
          ? "No reconciliation warnings are open."
          : `${summary.warning} reconciliation warning(s) are open.`,
    },
  ];
}

export async function buildProductionFinanceReadinessReport(
  supabase: SupabaseClient
): Promise<ProductionReadinessReport> {
  const runtime = getFinanceRuntimeConfig();
  const settings = await getFinanceSettings({}, supabase);
  const reconciliationSnapshot = await buildFinanceReconciliationSnapshot(supabase);

  const tax = summarizeGroup(evaluateTaxChecks(runtime, settings));
  const payments = summarizeGroup(evaluatePaymentChecks(runtime));
  const refunds = summarizeGroup(evaluateRefundChecks(runtime));
  const payouts = summarizeGroup(evaluatePayoutChecks(runtime, reconciliationSnapshot.overall.critical));
  const invoices = summarizeGroup(evaluateInvoiceChecks(runtime, settings));
  const email = summarizeGroup(evaluateEmailChecks(runtime));
  const reconciliation = summarizeGroup(evaluateReconciliationChecks(reconciliationSnapshot.overall));

  return {
    generatedAt: new Date().toISOString(),
    tax,
    payments,
    refunds,
    payouts,
    invoices,
    email,
    reconciliation,
    flags: runtime.flags,
    dbSettings: {
      taxMode: settings.taxMode,
      gstCollectionEnabled: settings.gstCollectionEnabled,
      gstInvoiceGenerationEnabled: settings.gstInvoiceGenerationEnabled,
      gstExportEnabled: settings.gstExportEnabled,
      approvedBy: settings.approvedBy,
      approvedAt: settings.approvedAt,
      payoutReleasePolicy: settings.payoutReleasePolicy,
    },
  };
}
