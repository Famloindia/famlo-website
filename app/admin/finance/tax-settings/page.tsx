import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";

import AdminLayout from "@/components/admin/AdminLayout";
import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { isTaxSettingsUiEnabled } from "@/lib/finance/feature-flags";
import { getFinanceSettings } from "@/lib/finance/settings";
import { getSafeTaxDisplayState } from "@/lib/finance/tax-compliance-guard";
import { createAdminSupabaseClient } from "@/lib/supabase";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ color: "#cbd5e1", fontSize: "14px", lineHeight: 1.6 }}>
      <strong style={{ color: "white" }}>{label}:</strong> {value}
    </div>
  );
}

export default async function AdminFinanceTaxSettingsPage() {
  const cookieStore = await cookies();
  const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
  if (!isAuthenticated) {
    redirect("/admin");
  }

  const supabase = createAdminSupabaseClient();
  const { data: killSwitchData } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "kill_switch_active")
    .single();
  const killSwitchActive = killSwitchData?.value === "true";

  const settings = await getFinanceSettings({ scopeType: "GLOBAL", scopeId: null }, supabase);
  const taxDisplay = getSafeTaxDisplayState(settings);

  return (
    <AdminLayout
      admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }}
      activeTab="finance"
      killSwitchActive={killSwitchActive}
    >
      <div style={{ maxWidth: "960px", margin: "0 auto", display: "grid", gap: "18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "12px", color: "#93c5fd", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Finance Tax Settings
            </div>
            <h1 style={{ margin: "10px 0 0", fontSize: "30px", fontWeight: 900, color: "white" }}>Compliance Lock Status</h1>
            <p style={{ marginTop: "8px", color: "rgba(255,255,255,0.55)", fontSize: "14px", maxWidth: "760px" }}>
              This surface is read-only in Batch 6. Tax collection, GST export, GST invoice generation, TCS, and TDS remain disabled until compliance is explicitly approved.
            </p>
          </div>
          <Link href="/admin/finance" style={pillStyle("#e2e8f0", "rgba(255,255,255,0.08)")}>
            Back to Finance
          </Link>
        </div>

        {!isTaxSettingsUiEnabled() ? (
          <section style={panelStyle}>
            <div style={{ color: "#fde68a", fontSize: "13px", lineHeight: 1.7 }}>
              <code>TAX_SETTINGS_UI_ENABLED</code> is off. This page is still available for internal rollout verification, but tax configuration remains locked and read-only.
            </div>
          </section>
        ) : null}

        <section style={panelStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
            <MetricCard label="Tax mode" value={taxDisplay.taxMode} accent="#ffffff" />
            <MetricCard label="GST collection" value={taxDisplay.gstCollectionLabel} accent="#fde68a" />
            <MetricCard label="GST export" value={taxDisplay.gstExportLabel} accent="#fde68a" />
            <MetricCard label="GST invoice" value={taxDisplay.gstInvoiceLabel} accent="#fde68a" />
            <MetricCard label="TCS" value={taxDisplay.tcsLabel} accent="#fde68a" />
            <MetricCard label="TDS" value={taxDisplay.tdsLabel} accent="#fde68a" />
          </div>
        </section>

        <section style={panelStyle}>
          <div style={{ fontSize: "15px", fontWeight: 900, color: "white", marginBottom: "14px" }}>Global Finance Settings</div>
          <div style={{ display: "grid", gap: "10px" }}>
            <MetaRow label="Scope" value={`${settings.scopeType}${settings.scopeId ? `:${settings.scopeId}` : ""}`} />
            <MetaRow label="Compliance status" value={taxDisplay.complianceStatus} />
            <MetaRow label="Tax mode" value={settings.taxMode} />
            <MetaRow label="GST collection" value={taxDisplay.gstCollectionLabel} />
            <MetaRow label="TCS" value={taxDisplay.tcsLabel} />
            <MetaRow label="TDS" value={taxDisplay.tdsLabel} />
            <MetaRow label="GST export" value={taxDisplay.gstExportLabel} />
            <MetaRow label="GST invoice generation" value={taxDisplay.gstInvoiceLabel} />
            <MetaRow label="Default platform fee" value={`${settings.defaultPlatformFeeBps} bps`} />
            <MetaRow label="Payout release policy" value={settings.payoutReleasePolicy} />
            <MetaRow label="Approved by" value={settings.approvedBy ?? "Not approved"} />
            <MetaRow label="Approved at" value={settings.approvedAt ?? "Not approved"} />
            <MetaRow label="Compliance notes" value={asString(settings.complianceNotes) ?? "No notes saved"} />
          </div>
        </section>

        <section style={panelStyle}>
          <div style={{ fontSize: "15px", fontWeight: 900, color: "white", marginBottom: "10px" }}>Safety Notice</div>
          <div style={{ color: "#cbd5e1", fontSize: "14px", lineHeight: 1.7 }}>
            {taxDisplay.adminTaxMessage}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "16px" }}>
      <div style={{ fontSize: "11px", fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: "8px", fontSize: "22px", fontWeight: 900, color: accent }}>{value}</div>
    </div>
  );
}

const panelStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "18px",
  padding: "22px",
} satisfies CSSProperties;

function pillStyle(color: string, background: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    background,
    color,
    padding: "8px 12px",
    textDecoration: "none",
    fontSize: "13px",
    fontWeight: 800,
  };
}
