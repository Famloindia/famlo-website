function isEnabled(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string" || value.trim().length === 0) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

export function isFinanceEventPipelineEnabled(): boolean {
  return isEnabled(process.env.FINANCE_EVENT_PIPELINE_ENABLED, false);
}

export function isFinanceEventDryRunEnabled(): boolean {
  return isEnabled(process.env.FINANCE_EVENT_DRY_RUN, true);
}

export function isFinanceFolioLinePostingEnabled(): boolean {
  return isEnabled(process.env.FINANCE_FOLIO_LINE_POSTING_ENABLED, false);
}

export function isFinanceDirectBookingFolioWritesEnabled(): boolean {
  return isEnabled(process.env.FINANCE_DIRECT_BOOKING_FOLIO_WRITES_ENABLED, false);
}

export function isOtaFinanceEngineEnabled(): boolean {
  return isEnabled(process.env.OTA_FINANCE_ENGINE_ENABLED, false);
}

export function isOtaFolioLineWritesEnabled(): boolean {
  return isEnabled(process.env.OTA_FOLIO_LINE_WRITES_ENABLED, false);
}

export function isOtaPaymentCollectModeEnforcementEnabled(): boolean {
  return isEnabled(process.env.OTA_PAYMENT_COLLECT_MODE_ENFORCEMENT_ENABLED, true);
}

export function isOtaUnknownCollectModeSettlementBlockEnabled(): boolean {
  return isEnabled(process.env.OTA_UNKNOWN_COLLECT_MODE_SETTLEMENT_BLOCK_ENABLED, true);
}

export function isFinanceSettlementEngineEnabled(): boolean {
  return isEnabled(process.env.FINANCE_SETTLEMENT_ENGINE_ENABLED, false);
}

export function isSettlementDraftGenerationEnabled(): boolean {
  return isEnabled(process.env.SETTLEMENT_DRAFT_GENERATION_ENABLED, false);
}

export function isSettlementApprovalFlowEnabled(): boolean {
  return isEnabled(process.env.SETTLEMENT_APPROVAL_FLOW_ENABLED, false);
}

export function isSettlementPayoutExecutionEnabled(): boolean {
  return isEnabled(process.env.SETTLEMENT_PAYOUT_EXECUTION_ENABLED, false);
}

export function isSettlementDebugApiEnabled(): boolean {
  return isEnabled(process.env.SETTLEMENT_DEBUG_API_ENABLED, false);
}

export function isSettlementIncludeOtaEnabled(): boolean {
  return isEnabled(process.env.SETTLEMENT_INCLUDE_OTA_ENABLED, false);
}

export function isSettlementRequireCheckoutCompleted(): boolean {
  return isEnabled(process.env.SETTLEMENT_REQUIRE_CHECKOUT_COMPLETED, true);
}

export function isAdminFinanceFolioUiEnabled(): boolean {
  return isEnabled(process.env.ADMIN_FINANCE_FOLIO_UI_ENABLED, false);
}

export function isAdminSettlementActionsEnabled(): boolean {
  return isEnabled(process.env.ADMIN_SETTLEMENT_ACTIONS_ENABLED, false);
}

export function isHostFinanceUiEnabled(): boolean {
  return isEnabled(process.env.HOST_FINANCE_UI_ENABLED, false);
}

export function isHostFinanceStatementsV2Enabled(): boolean {
  return isEnabled(process.env.HOST_FINANCE_STATEMENTS_V2_ENABLED, false);
}

export function isAdminSettlementCancelEnabled(): boolean {
  return isEnabled(process.env.ADMIN_SETTLEMENT_CANCEL_ENABLED, false);
}

export function isHostSettlementReadEnabled(): boolean {
  return isEnabled(process.env.HOST_SETTLEMENT_READ_ENABLED, false);
}

export function isFinanceExportsEnabled(): boolean {
  return isEnabled(process.env.FINANCE_EXPORTS_ENABLED, false);
}

export function isTaxComplianceLockEnabled(): boolean {
  return isEnabled(process.env.TAX_COMPLIANCE_LOCK_ENABLED, true);
}

export function isTaxSettingsUiEnabled(): boolean {
  return isEnabled(process.env.TAX_SETTINGS_UI_ENABLED, false);
}

export function isTaxComplianceRequiresAdminConfirmation(): boolean {
  return isEnabled(process.env.TAX_COMPLIANCE_REQUIRES_ADMIN_CONFIRMATION, true);
}

export function isTaxCopySafetyEnabled(): boolean {
  return isEnabled(process.env.TAX_COPY_SAFETY_ENABLED, true);
}

export function isGstInvoiceGenerationEnabled(): boolean {
  return isEnabled(process.env.GST_INVOICE_GENERATION_ENABLED, false);
}

export function isTaxReportingExportsEnabled(): boolean {
  return isEnabled(process.env.TAX_REPORTING_EXPORTS_ENABLED, false);
}

export function isGstCollectionEnabledFlag(): boolean {
  return isEnabled(process.env.GST_COLLECTION_ENABLED, false);
}

export function isTcsEnabledFlag(): boolean {
  return isEnabled(process.env.TCS_ENABLED, false);
}

export function isTdsEnabledFlag(): boolean {
  return isEnabled(process.env.TDS_ENABLED, false);
}

export function isGstExportEnabledFlag(): boolean {
  return isEnabled(process.env.GST_EXPORT_ENABLED, false);
}
