import Link from "next/link";

import ProAddPropertyForm from "@/components/partners/pro/ProAddPropertyForm";
import { resolveAuthorizedHostSession } from "@/lib/chat-access";
import { isFamloProDashboardEnabled, loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: 24,
  background:
    "radial-gradient(circle at top right, rgba(59,130,246,0.14), transparent 26%), linear-gradient(180deg, #071120 0%, #0b1730 100%)",
};

const cardStyle: React.CSSProperties = {
  width: "min(640px, 100%)",
  borderRadius: 28,
  border: "1px solid rgba(148,163,184,0.14)",
  background: "rgba(7, 18, 34, 0.84)",
  boxShadow: "0 28px 60px rgba(2, 6, 23, 0.34)",
  padding: 28,
  color: "#e5eefb",
};

export default async function ProNewPropertyPage(): Promise<React.JSX.Element> {
  const supabase = createAdminSupabaseClient();
  const hostSession = await resolveAuthorizedHostSession(supabase);

  if (!hostSession?.hostUserId) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#93c5fd" }}>
            Famlo Pro
          </div>
          <h1 style={{ margin: "10px 0 8px", fontSize: 34, lineHeight: 1.05 }}>Partner login required</h1>
          <p style={{ margin: 0, color: "rgba(219,234,254,0.72)", lineHeight: 1.7 }}>
            Sign in with a host account to add another property inside Famlo Pro.
          </p>
          <div style={{ marginTop: 18 }}>
            <Link
              href="/partners/login"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 48,
                padding: "0 18px",
                borderRadius: 999,
                textDecoration: "none",
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                color: "white",
                fontWeight: 900,
              }}
            >
              Go to Partner Login
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const activeFamilyId = typeof hostSession.familyId === "string" && hostSession.familyId.trim().length > 0
    ? hostSession.familyId
    : null;
  const famloProEnabled = isFamloProDashboardEnabled();
  const access = activeFamilyId ? await loadHostProAccess(supabase, activeFamilyId) : null;
  const backHref = activeFamilyId
    ? `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(activeFamilyId)}&section=properties-home`
    : "/partnerslogin/home/pro/dashboard";

  if (!famloProEnabled || !access?.allowed) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#93c5fd" }}>
            Famlo Pro
          </div>
          <h1 style={{ margin: "10px 0 8px", fontSize: 34, lineHeight: 1.05 }}>Famlo Pro is locked</h1>
          <p style={{ margin: 0, color: "rgba(219,234,254,0.72)", lineHeight: 1.7 }}>
            Only active Pro host sessions can create another property from this route.
          </p>
          <div style={{ marginTop: 18 }}>
            <Link
              href={backHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 48,
                padding: "0 18px",
                borderRadius: 999,
                textDecoration: "none",
                background: "rgba(255,255,255,0.08)",
                color: "#dbeafe",
                border: "1px solid rgba(148,163,184,0.16)",
                fontWeight: 800,
              }}
            >
              Back to Pro
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return <ProAddPropertyForm backHref={backHref} />;
}
