import Link from "next/link";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";

import { resolveAuthorizedHostSession } from "@/lib/chat-access";
import { isFamloProDashboardEnabled, loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

interface FamloProDashboardPageProps {
  searchParams?: Promise<{
    family?: string;
  }>;
}

export const dynamic = "force-dynamic";

function buildBasicFamloPlusUrl(familyId: string): string {
  const base = "/partnerslogin/home/dashboard?tab=famlo-plus";
  return familyId ? `${base}&family=${encodeURIComponent(familyId)}` : base;
}

async function canCurrentHostAccessFamily(
  familyId: string
): Promise<boolean> {
  const supabase = createAdminSupabaseClient();
  const hostSession = await resolveAuthorizedHostSession(supabase);

  if (!hostSession) {
    return false;
  }

  if (hostSession.familyId === familyId) {
    return true;
  }

  const [{ data: host }, { data: family }] = await Promise.all([
    supabase
      .from("hosts")
      .select("user_id")
      .eq("legacy_family_id", familyId)
      .maybeSingle(),
    supabase
      .from("families")
      .select("user_id")
      .eq("id", familyId)
      .maybeSingle(),
  ]);

  const familyHostUserId =
    typeof host?.user_id === "string" && host.user_id.trim().length > 0
      ? host.user_id
      : typeof family?.user_id === "string" && family.user_id.trim().length > 0
        ? family.user_id
        : null;

  return Boolean(hostSession.hostUserId && familyHostUserId && hostSession.hostUserId === familyHostUserId);
}

export default async function FamloProDashboardPage({
  searchParams,
}: Readonly<FamloProDashboardPageProps>): Promise<React.JSX.Element> {
  const params = await searchParams;
  const cookieStore = await cookies();
  const familyId = params?.family ?? cookieStore.get("famlo_host_family_id")?.value ?? "";
  const basicDashboardUrl = buildBasicFamloPlusUrl(familyId);

  if (!familyId) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>
          <h1 style={titleStyle}>Famlo Pro is locked</h1>
          <p style={copyStyle}>Open the Basic Dashboard first to review Famlo+ and request activation.</p>
          <div style={buttonRowStyle}>
            <Link href="/partners/login" style={primaryLinkStyle}>Back to Partner Login</Link>
          </div>
        </section>
      </main>
    );
  }

  const famloProEnabled = isFamloProDashboardEnabled();
  const authorized = await canCurrentHostAccessFamily(familyId);

  if (!authorized) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>
          <div style={eyebrowStyle}>Famlo Pro</div>
          <h1 style={titleStyle}>Famlo Pro is locked</h1>
          <p style={copyStyle}>
            This host session is not authorized to access the requested property.
          </p>
          <div style={buttonRowStyle}>
            <Link href={basicDashboardUrl} style={primaryLinkStyle}>Back to Famlo+</Link>
          </div>
        </section>
      </main>
    );
  }

  const supabase = createAdminSupabaseClient();
  const access = await loadHostProAccess(supabase, familyId);

  if (!famloProEnabled || !access.allowed) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>
          <div style={eyebrowStyle}>Famlo Pro</div>
          <h1 style={titleStyle}>Famlo Pro is locked</h1>
          <p style={copyStyle}>
            Upgrade or renew Famlo+ to access PMS and Channel Manager features.
          </p>
          <div style={statusBoxStyle}>
            <strong style={{ color: "#0e2b57" }}>Status:</strong> <span style={{ textTransform: "capitalize" }}>{access.status}</span>
            <span style={{ color: "rgba(14,43,87,0.68)" }}>Reason: {famloProEnabled ? access.reason : "pro_dashboard_disabled"}</span>
          </div>
          <div style={buttonRowStyle}>
            <Link href={basicDashboardUrl} style={primaryLinkStyle}>Back to Famlo+</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <section style={{ ...cardStyle, gap: "18px" }}>
        <div style={eyebrowStyle}>Famlo Pro</div>
        <h1 style={titleStyle}>Famlo Pro Dashboard</h1>
        <p style={copyStyle}>Advanced PMS + Channel Manager coming soon.</p>
        <div style={statusBoxStyle}>
          <strong style={{ color: "#0e2b57" }}>Access active</strong>
          <span style={{ color: "rgba(14,43,87,0.68)" }}>
            Your Famlo+ entitlement is valid, so this separate Pro workspace is unlocked.
          </span>
        </div>
        <div style={buttonRowStyle}>
          <Link href={basicDashboardUrl} style={secondaryLinkStyle}>Back to Basic Dashboard</Link>
        </div>
      </section>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f8fafc",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 20px",
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: "720px",
  background: "white",
  borderRadius: "24px",
  padding: "32px",
  border: "1px solid rgba(14,43,87,0.08)",
  boxShadow: "0 20px 48px rgba(15, 23, 42, 0.06)",
  display: "grid",
  gap: "16px",
};

const eyebrowStyle: CSSProperties = {
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#165dcc",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "36px",
  lineHeight: 1.05,
  fontWeight: 900,
  color: "#0e2b57",
};

const copyStyle: CSSProperties = {
  margin: 0,
  color: "rgba(14,43,87,0.72)",
  lineHeight: 1.8,
  fontSize: "16px",
  fontWeight: 600,
};

const statusBoxStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  padding: "18px",
  borderRadius: "18px",
  background: "#f8fafc",
  border: "1px solid rgba(14,43,87,0.06)",
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  marginTop: "8px",
};

const primaryLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "14px 20px",
  borderRadius: "14px",
  background: "#165dcc",
  color: "white",
  fontWeight: 800,
  textDecoration: "none",
};

const secondaryLinkStyle: CSSProperties = {
  ...primaryLinkStyle,
  background: "#e0ebff",
  color: "#0e2b57",
};
