import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";

import AdminLayout from "@/components/admin/AdminLayout";
import SettlementDraftButton from "@/components/admin/SettlementDraftButton";
import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import {
  isAdminSettlementActionsEnabled,
  isFinanceExportsEnabled,
  isSettlementDraftGenerationEnabled,
  isSettlementIncludeOtaEnabled,
} from "@/lib/finance/feature-flags";
import { listSettlementCandidates } from "@/lib/finance/settlement-engine";
import { createAdminSupabaseClient } from "@/lib/supabase";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function asString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

export default async function AdminSettlementCandidatesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
  if (!isAuthenticated) redirect("/admin");

  const params = (await searchParams) ?? {};
  const hostId = asString(params.hostId).trim();
  const propertyId = asString(params.propertyId).trim() || null;
  const periodStart = asString(params.periodStart).trim() || "2026-01-01";
  const periodEnd = asString(params.periodEnd).trim() || "2026-12-31";
  const includeOtaRequested = asString(params.includeOta).trim().toLowerCase() === "true";
  const statusFilter = asString(params.status).trim().toLowerCase();
  const sourceFilter = asString(params.source).trim().toLowerCase();
  const collectFilter = asString(params.collectMode).trim().toLowerCase();

  const supabase = createAdminSupabaseClient();
  const { data: killSwitchData } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "kill_switch_active")
    .single();
  const killSwitchActive = killSwitchData?.value === "true";

  const { data: hostOptions } = await supabase.from("hosts").select("id,display_name").order("display_name", { ascending: true }).limit(100);

  const candidateData = hostId
    ? await listSettlementCandidates(supabase, {
        hostId,
        propertyId,
        periodStart,
        periodEnd,
        includeOta: includeOtaRequested,
      })
    : null;

  const filteredEligible =
    candidateData?.eligibleFolios.filter((candidate) => {
      if (sourceFilter && !(candidate.sourceChannel ?? "").toLowerCase().includes(sourceFilter)) return false;
      if (collectFilter && String(candidate.paymentCollectMode).toLowerCase() !== collectFilter) return false;
      return true;
    }) ?? [];

  const filteredExcluded =
    candidateData?.excludedFolios.filter((candidate) => {
      if (statusFilter && !candidate.reasons.some((reason) => reason.toLowerCase().includes(statusFilter))) return false;
      if (sourceFilter && !(candidate.sourceChannel ?? "").toLowerCase().includes(sourceFilter)) return false;
      if (collectFilter && String(candidate.paymentCollectMode).toLowerCase() !== collectFilter) return false;
      return true;
    }) ?? [];

  return (
    <AdminLayout
      admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }}
      activeTab="finance"
      killSwitchActive={killSwitchActive}
    >
      <div style={{ maxWidth: "1280px", margin: "0 auto", display: "grid", gap: "18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "18px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "12px", color: "#93c5fd", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Settlement Candidates
            </div>
            <h1 style={{ margin: "10px 0 0", fontSize: "30px", fontWeight: 900, color: "white" }}>Draft Settlement Review</h1>
            <p style={{ marginTop: "8px", color: "rgba(255,255,255,0.45)", fontSize: "13px" }}>
              Eligible folios come from proof lines only. UNKNOWN collect mode OTA bookings stay excluded and non-payable.
            </p>
          </div>
          <Link href="/admin/finance" style={pillStyle("#e2e8f0", "rgba(255,255,255,0.08)")}>
            Back to Finance
          </Link>
        </div>

        <form style={panelStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
            <label style={labelStyle}>
              Host
              <select name="hostId" defaultValue={hostId} style={inputStyle}>
                <option value="">Select host</option>
                {(hostOptions ?? []).map((host) => (
                  <option key={host.id} value={host.id}>
                    {host.display_name ?? host.id}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Property
              <input name="propertyId" defaultValue={propertyId ?? ""} style={inputStyle} placeholder="Optional property id" />
            </label>
            <label style={labelStyle}>
              Period start
              <input name="periodStart" type="date" defaultValue={periodStart} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Period end
              <input name="periodEnd" type="date" defaultValue={periodEnd} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Source filter
              <input name="source" defaultValue={sourceFilter} style={inputStyle} placeholder="booking_com / famlo_direct" />
            </label>
            <label style={labelStyle}>
              Collect mode
              <select name="collectMode" defaultValue={collectFilter} style={inputStyle}>
                <option value="">All</option>
                <option value="famlo_collect">FAMLO_COLLECT</option>
                <option value="ota_collect">OTA_COLLECT</option>
                <option value="property_collect">PROPERTY_COLLECT</option>
                <option value="unknown">UNKNOWN</option>
              </select>
            </label>
            <label style={labelStyle}>
              Exclusion reason
              <input name="status" defaultValue={statusFilter} style={inputStyle} placeholder="refund / proof / unknown" />
            </label>
            <label style={{ ...labelStyle, justifyContent: "flex-end" }}>
              <span style={{ color: "#cbd5e1", fontSize: "13px" }}>Include OTA</span>
              <input name="includeOta" type="checkbox" value="true" defaultChecked={includeOtaRequested} disabled={!isSettlementIncludeOtaEnabled()} />
            </label>
          </div>
          <div style={{ marginTop: "14px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button type="submit" style={primaryButtonStyle}>
              Load Candidates
            </button>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px" }}>
              Exports: {isFinanceExportsEnabled() ? "Enabled" : "Disabled"}
            </span>
          </div>
        </form>

        {candidateData ? (
          <>
            <section style={panelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 900, color: "white" }}>Candidate Summary</div>
                  <div style={{ marginTop: "6px", color: "rgba(255,255,255,0.45)", fontSize: "13px" }}>
                    Host {hostId} · {periodStart} to {periodEnd} · Currency {candidateData.currency}
                  </div>
                </div>
                <SettlementDraftButton
                  hostId={hostId}
                  propertyId={propertyId}
                  periodStart={periodStart}
                  periodEnd={periodEnd}
                  includeOta={includeOtaRequested}
                  actionsEnabled={isAdminSettlementActionsEnabled()}
                  generationEnabled={isSettlementDraftGenerationEnabled()}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginTop: "16px" }}>
                <MetricCard label="Eligible" value={String(filteredEligible.length)} accent="#86efac" />
                <MetricCard label="Excluded" value={String(filteredExcluded.length)} accent="#fca5a5" />
                <MetricCard label="Gross" value={formatCurrency(candidateData.totals.grossBookingValue)} accent="#ffffff" />
                <MetricCard label="Net payable" value={formatCurrency(candidateData.totals.netPayableAmount)} accent="#93c5fd" />
              </div>
            </section>

            <section style={panelStyle}>
              <div style={sectionTitleStyle}>Eligible Candidates</div>
              <CandidatesTable rows={filteredEligible} />
            </section>

            <section style={panelStyle}>
              <div style={sectionTitleStyle}>Excluded Candidates</div>
              <CandidatesTable rows={filteredExcluded} excluded />
            </section>
          </>
        ) : (
          <section style={panelStyle}>
            <div style={{ color: "#cbd5e1", fontSize: "14px" }}>Pick a host and period to inspect settlement candidates.</div>
          </section>
        )}
      </div>
    </AdminLayout>
  );
}

function CandidatesTable({
  rows,
  excluded = false,
}: {
  rows: Array<{
    folioId: string;
    bookingId: string | null;
    sourceKind: string;
    sourceChannel: string | null;
    paymentCollectMode: string;
    bookingStatus: string | null;
    paymentStatus: string | null;
    guestTotalAmount: number;
    hostPayoutAmount: number;
    reasons: string[];
    existingActiveSettlementId: string | null;
  }>;
  excluded?: boolean;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1080px" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {["Booking", "Folio", "Direct/OTA", "Source", "Collect Mode", "Booking Status", "Payment Status", "Guest Total", "Host Payout", excluded ? "Exclusion Reasons" : "Active Settlement"].map((label) => (
              <th key={label} style={tableHeadStyle}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.folioId}:${row.bookingId ?? "none"}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <td style={tableBodyStyle}>
                {row.bookingId ? <Link href={`/admin/finance/bookings/${row.bookingId}`} style={linkStyle}>{row.bookingId.slice(0, 8)}</Link> : "N/A"}
              </td>
              <td style={tableBodyStyle}>{row.folioId.slice(0, 8)}</td>
              <td style={tableBodyStyle}>{row.sourceKind}</td>
              <td style={tableBodyStyle}>{row.sourceChannel ?? "N/A"}</td>
              <td style={tableBodyStyle}>{row.paymentCollectMode}</td>
              <td style={tableBodyStyle}>{row.bookingStatus ?? "N/A"}</td>
              <td style={tableBodyStyle}>{row.paymentStatus ?? "N/A"}</td>
              <td style={{ ...tableBodyStyle, color: "white" }}>{formatCurrency(row.guestTotalAmount)}</td>
              <td style={{ ...tableBodyStyle, color: "#93c5fd" }}>{formatCurrency(row.hostPayoutAmount)}</td>
              <td style={tableBodyStyle}>
                {excluded
                  ? row.reasons.join(", ") || "N/A"
                  : row.existingActiveSettlementId
                    ? row.existingActiveSettlementId.slice(0, 8)
                    : "None"}
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={10} style={{ padding: "16px 10px", color: "rgba(255,255,255,0.45)", fontSize: "13px" }}>
                No rows found for the current filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "16px" }}>
      <div style={{ fontSize: "11px", fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 900, color: accent }}>{value}</div>
    </div>
  );
}

const panelStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "18px",
  padding: "22px",
} satisfies CSSProperties;

const inputStyle = {
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(2,6,23,0.6)",
  color: "white",
  padding: "10px 12px",
} satisfies CSSProperties;

const labelStyle = {
  display: "grid",
  gap: "8px",
  color: "#cbd5e1",
  fontSize: "13px",
} satisfies CSSProperties;

const primaryButtonStyle = {
  borderRadius: "999px",
  border: "1px solid rgba(147,197,253,0.2)",
  background: "rgba(147,197,253,0.16)",
  color: "#bfdbfe",
  padding: "10px 14px",
  fontSize: "12px",
  fontWeight: 800,
  cursor: "pointer",
} satisfies CSSProperties;

const tableHeadStyle = {
  padding: "12px 10px",
  fontSize: "11px",
  color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase",
} satisfies CSSProperties;

const tableBodyStyle = {
  padding: "12px 10px",
  color: "#cbd5e1",
  fontSize: "13px",
} satisfies React.CSSProperties;

const linkStyle = {
  color: "#bfdbfe",
  textDecoration: "none",
  fontWeight: 700,
} satisfies React.CSSProperties;

const sectionTitleStyle = {
  fontSize: "15px",
  fontWeight: 900,
  color: "white",
  marginBottom: "14px",
} satisfies React.CSSProperties;

function pillStyle(color: string, background: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    background,
    color,
    padding: "8px 12px",
    fontSize: "12px",
    fontWeight: 800,
    textDecoration: "none",
  };
}
