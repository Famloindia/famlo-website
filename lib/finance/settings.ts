import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminSupabaseClient } from "@/lib/supabase";

export type FinanceTaxMode =
  | "PENDING_COMPLIANCE"
  | "HOST_MARKETPLACE"
  | "ECO_SECTION_9_5"
  | "HOST_DIRECT_NO_TCS";

export type FinanceSettingsScope = {
  scopeType?: string | null;
  scopeId?: string | null;
};

export type FinanceSettings = {
  id: string | null;
  scopeType: string;
  scopeId: string | null;
  taxMode: FinanceTaxMode;
  gstCollectionEnabled: boolean;
  tcsEnabled: boolean;
  tdsEnabled: boolean;
  gstExportEnabled: boolean;
  gstInvoiceGenerationEnabled: boolean;
  defaultPlatformFeeBps: number;
  payoutReleasePolicy: string;
  complianceNotes: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  metadata: Record<string, unknown>;
};

type FinanceSettingsRow = {
  id?: string | null;
  scope_type?: string | null;
  scope_id?: string | null;
  tax_mode?: string | null;
  gst_collection_enabled?: boolean | null;
  tcs_enabled?: boolean | null;
  tds_enabled?: boolean | null;
  gst_export_enabled?: boolean | null;
  gst_invoice_generation_enabled?: boolean | null;
  default_platform_fee_bps?: number | null;
  payout_release_policy?: string | null;
  compliance_notes?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  id: null,
  scopeType: "GLOBAL",
  scopeId: null,
  taxMode: "PENDING_COMPLIANCE",
  gstCollectionEnabled: false,
  tcsEnabled: false,
  tdsEnabled: false,
  gstExportEnabled: false,
  gstInvoiceGenerationEnabled: false,
  defaultPlatformFeeBps: 1600,
  payoutReleasePolicy: "AFTER_CHECKOUT",
  complianceNotes: null,
  approvedBy: null,
  approvedAt: null,
  metadata: {},
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeTaxMode(value: unknown): FinanceTaxMode {
  const normalized = String(value ?? "").trim().toUpperCase();
  switch (normalized) {
    case "HOST_MARKETPLACE":
    case "ECO_SECTION_9_5":
    case "HOST_DIRECT_NO_TCS":
      return normalized;
    default:
      return "PENDING_COMPLIANCE";
  }
}

function mapRowToSettings(row: FinanceSettingsRow | null | undefined): FinanceSettings {
  if (!row) return { ...DEFAULT_FINANCE_SETTINGS };

  return {
    id: asString(row.id),
    scopeType: asString(row.scope_type) ?? "GLOBAL",
    scopeId: asString(row.scope_id),
    taxMode: normalizeTaxMode(row.tax_mode),
    gstCollectionEnabled: asBoolean(row.gst_collection_enabled, false),
    tcsEnabled: asBoolean(row.tcs_enabled, false),
    tdsEnabled: asBoolean(row.tds_enabled, false),
    gstExportEnabled: asBoolean(row.gst_export_enabled, false),
    gstInvoiceGenerationEnabled: asBoolean(row.gst_invoice_generation_enabled, false),
    defaultPlatformFeeBps: Math.max(0, asNumber(row.default_platform_fee_bps, 1600)),
    payoutReleasePolicy: asString(row.payout_release_policy) ?? "AFTER_CHECKOUT",
    complianceNotes: asString(row.compliance_notes),
    approvedBy: asString(row.approved_by),
    approvedAt: asString(row.approved_at),
    metadata: row.metadata ?? {},
  };
}

async function loadScopedSettings(
  supabase: SupabaseClient,
  scope: FinanceSettingsScope
): Promise<FinanceSettingsRow | null> {
  const scopeType = asString(scope.scopeType) ?? "GLOBAL";
  const scopeId = asString(scope.scopeId);

  let query = supabase
    .from("finance_settings")
    .select("*")
    .eq("scope_type", scopeType);

  query = scopeId ? query.eq("scope_id", scopeId) : query.is("scope_id", null);
  const { data, error } = await query.maybeSingle();

  if (error) {
    const message = String((error as { message?: string }).message ?? "").toLowerCase();
    const code = String((error as { code?: string }).code ?? "");
    if (code === "42P01" || code === "42703" || message.includes("does not exist") || message.includes("schema cache")) {
      return null;
    }
    throw error;
  }

  return (data as FinanceSettingsRow | null) ?? null;
}

export async function getFinanceSettings(
  scope: FinanceSettingsScope = {},
  supabase: SupabaseClient = createAdminSupabaseClient()
): Promise<FinanceSettings> {
  const scoped = await loadScopedSettings(supabase, scope);
  if (scoped) return mapRowToSettings(scoped);

  if ((asString(scope.scopeType) ?? "GLOBAL") !== "GLOBAL" || asString(scope.scopeId)) {
    const global = await loadScopedSettings(supabase, { scopeType: "GLOBAL", scopeId: null });
    if (global) return mapRowToSettings(global);
  }

  return { ...DEFAULT_FINANCE_SETTINGS };
}

export function getDefaultFinanceSettings(): FinanceSettings {
  return { ...DEFAULT_FINANCE_SETTINGS };
}
