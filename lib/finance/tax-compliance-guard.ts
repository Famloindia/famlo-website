import {
  isGstCollectionEnabledFlag,
  isGstExportEnabledFlag,
  isGstInvoiceGenerationEnabled,
  isTaxComplianceLockEnabled,
  isTaxComplianceRequiresAdminConfirmation,
  isTaxCopySafetyEnabled,
  isTcsEnabledFlag,
  isTdsEnabledFlag,
} from "@/lib/finance/feature-flags";
import type { FinanceSettings } from "@/lib/finance/settings";

export type TaxArtifactAction =
  | "CREATE_GST_INVOICE"
  | "CREATE_TAX_INVOICE"
  | "CREATE_CREDIT_NOTE"
  | "EXPORT_GST";

export type SafeTaxDisplayState = {
  taxMode: string;
  gstCollectionLabel: string;
  tcsLabel: string;
  tdsLabel: string;
  gstExportLabel: string;
  gstInvoiceLabel: string;
  hostTaxMessage: string;
  adminTaxMessage: string;
  complianceStatus: "locked" | "configured_but_disabled" | "eligible_but_disabled" | "enabled";
};

function requiresApproval(settings: FinanceSettings): boolean {
  return isTaxComplianceRequiresAdminConfirmation() && (!settings.approvedBy || !settings.approvedAt);
}

function isPendingCompliance(settings: FinanceSettings): boolean {
  return settings.taxMode === "PENDING_COMPLIANCE";
}

function buildError(message: string): Error {
  const error = new Error(message);
  error.name = "TaxComplianceGuardError";
  return error;
}

export function isTaxComplianceGuardError(error: unknown): error is Error {
  return error instanceof Error && error.name === "TaxComplianceGuardError";
}

export function assertTaxArtifactAllowed(
  settings: FinanceSettings,
  action: TaxArtifactAction
): void {
  if (action === "EXPORT_GST") {
    assertGstExportAllowed(settings);
    return;
  }

  if (isTaxComplianceLockEnabled() && isPendingCompliance(settings)) {
    switch (action) {
      case "CREATE_GST_INVOICE":
        throw buildError("GST invoice creation is locked because tax_mode is PENDING_COMPLIANCE.");
      case "CREATE_TAX_INVOICE":
        throw buildError("Tax invoice creation is locked because tax_mode is PENDING_COMPLIANCE.");
      case "CREATE_CREDIT_NOTE":
        throw buildError("Tax-bearing credit note creation is locked because tax_mode is PENDING_COMPLIANCE.");
      default:
        throw buildError("Tax artifact creation is locked because tax_mode is PENDING_COMPLIANCE.");
    }
  }

  if (action === "CREATE_GST_INVOICE") {
    assertGstInvoiceAllowed(settings);
    return;
  }

  if (requiresApproval(settings)) {
    throw buildError("Tax artifact generation requires explicit admin approval before it can be enabled.");
  }

  if (
    action === "CREATE_TAX_INVOICE" &&
    (!settings.gstInvoiceGenerationEnabled || !isGstInvoiceGenerationEnabled())
  ) {
    throw buildError("Tax invoice generation is disabled by finance settings or feature flags.");
  }
}

export function assertTaxCollectionAllowed(settings: FinanceSettings): void {
  if (isTaxComplianceLockEnabled() && isPendingCompliance(settings)) {
    throw buildError("Tax collection is locked because tax_mode is PENDING_COMPLIANCE.");
  }
  if (!settings.gstCollectionEnabled || !isGstCollectionEnabledFlag()) {
    throw buildError("GST collection is disabled by finance settings or feature flags.");
  }
  if (requiresApproval(settings)) {
    throw buildError("GST collection requires explicit admin approval before it can be enabled.");
  }
}

export function assertGstExportAllowed(settings: FinanceSettings): void {
  if (isTaxComplianceLockEnabled() && isPendingCompliance(settings)) {
    throw buildError("GST export is locked because tax_mode is PENDING_COMPLIANCE.");
  }
  if (!settings.gstExportEnabled || !isGstExportEnabledFlag()) {
    throw buildError("GST export is disabled by finance settings or feature flags.");
  }
  if (requiresApproval(settings)) {
    throw buildError("GST export requires explicit admin approval before it can be enabled.");
  }
}

export function assertGstInvoiceAllowed(settings: FinanceSettings): void {
  if (isTaxComplianceLockEnabled() && isPendingCompliance(settings)) {
    throw buildError("GST invoice generation is locked because tax_mode is PENDING_COMPLIANCE.");
  }
  if (!settings.gstInvoiceGenerationEnabled || !isGstInvoiceGenerationEnabled()) {
    throw buildError("GST invoice generation is disabled by finance settings or feature flags.");
  }
  if (requiresApproval(settings)) {
    throw buildError("GST invoice generation requires explicit admin approval before it can be enabled.");
  }
}

export function getSafeTaxDisplayState(settings: FinanceSettings): SafeTaxDisplayState {
  const lockActive = isTaxComplianceLockEnabled() && isPendingCompliance(settings);
  const gstEnabled = !lockActive && settings.gstCollectionEnabled && isGstCollectionEnabledFlag() && !requiresApproval(settings);
  const tcsEnabled = !lockActive && settings.tcsEnabled && isTcsEnabledFlag() && !requiresApproval(settings);
  const tdsEnabled = !lockActive && settings.tdsEnabled && isTdsEnabledFlag() && !requiresApproval(settings);
  const gstExportEnabled = !lockActive && settings.gstExportEnabled && isGstExportEnabledFlag() && !requiresApproval(settings);
  const gstInvoiceEnabled = !lockActive && settings.gstInvoiceGenerationEnabled && isGstInvoiceGenerationEnabled() && !requiresApproval(settings);

  let complianceStatus: SafeTaxDisplayState["complianceStatus"] = "locked";
  if (!lockActive && (settings.gstCollectionEnabled || settings.tcsEnabled || settings.tdsEnabled || settings.gstExportEnabled || settings.gstInvoiceGenerationEnabled)) {
    complianceStatus = requiresApproval(settings) ? "eligible_but_disabled" : "configured_but_disabled";
  }
  if (gstEnabled || tcsEnabled || tdsEnabled || gstExportEnabled || gstInvoiceEnabled) {
    complianceStatus = "enabled";
  }

  if (!isTaxCopySafetyEnabled()) {
    return {
      taxMode: settings.taxMode,
      gstCollectionLabel: gstEnabled ? "Enabled" : "Disabled",
      tcsLabel: tcsEnabled ? "Enabled" : "Disabled",
      tdsLabel: tdsEnabled ? "Enabled" : "Disabled",
      gstExportLabel: gstExportEnabled ? "Enabled" : "Disabled",
      gstInvoiceLabel: gstInvoiceEnabled ? "Enabled" : "Disabled",
      hostTaxMessage: "Tax configuration is controlled by finance settings.",
      adminTaxMessage: "Tax configuration is controlled by finance settings.",
      complianceStatus,
    };
  }

  return {
    taxMode: settings.taxMode,
    gstCollectionLabel: "Disabled",
    tcsLabel: "Disabled",
    tdsLabel: "Disabled",
    gstExportLabel: "Disabled",
    gstInvoiceLabel: "Disabled",
    hostTaxMessage: "GST collection is disabled. TCS is disabled. TDS is disabled. No GST invoice is generated by Famlo at this stage.",
    adminTaxMessage: "Tax collection and reporting remain locked until compliance is explicitly approved. GST collection, GST export, and GST invoices are disabled by default.",
    complianceStatus,
  };
}
