"use client";

import { useUser } from "@/components/auth/UserContext";
import { GuestVerificationForm } from "@/components/account/GuestVerificationForm";
import { SavedHomesSection } from "@/components/account/SavedHomesSection";

function ProfileSummaryCard(): React.JSX.Element | null {
  const { user, profile } = useUser();

  if (!user && !profile) return null;

  const contactLine = profile?.phone || user?.phone || profile?.email || user?.email || "Add your contact details";
  const locationLine = [profile?.city, profile?.state].filter(Boolean).join(", ") || "Location not added yet";
  const displayInitial = (profile?.name || user?.email || "U").charAt(0).toUpperCase();

  return (
    <section
      className="panel"
      style={{
        padding: "24px",
        display: "grid",
        gap: "18px",
        border: "1px solid #e0ecff",
        background: "linear-gradient(180deg,#ffffff,#f8fbff)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div
          style={{
            width: "72px",
            height: "72px",
            borderRadius: "50%",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#eaf3ff",
            color: "#1A56DB",
            border: "1px solid #dbeafe",
            fontSize: "28px",
            fontWeight: 800,
          }}
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile?.name || "Profile"}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            displayInitial
          )}
        </div>

        <div style={{ display: "grid", gap: "6px" }}>
          <h2 style={{ margin: 0, fontSize: "clamp(24px, 4vw, 32px)" }}>Welcome</h2>
          {profile?.name ? <p style={{ margin: 0, color: "#0f172a", fontWeight: 700 }}>{profile.name}</p> : null}
          <p style={{ margin: 0, color: "#475569", fontWeight: 600 }}>{contactLine}</p>
          <p style={{ margin: 0, color: "#64748b" }}>{locationLine}</p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
        }}
      >
        <div style={{ padding: "14px 16px", borderRadius: "16px", background: "#fff", border: "1px solid #e2e8f0" }}>
          <span style={{ display: "block", fontSize: "11px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>Phone</span>
          <strong style={{ display: "block", marginTop: "8px", color: "#0f172a" }}>{profile?.phone || user?.phone || "Not added"}</strong>
        </div>
        <div style={{ padding: "14px 16px", borderRadius: "16px", background: "#fff", border: "1px solid #e2e8f0" }}>
          <span style={{ display: "block", fontSize: "11px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>Email</span>
          <strong style={{ display: "block", marginTop: "8px", color: "#0f172a" }}>{profile?.email || user?.email || "Not added"}</strong>
        </div>
        <div style={{ padding: "14px 16px", borderRadius: "16px", background: "#fff", border: "1px solid #e2e8f0" }}>
          <span style={{ display: "block", fontSize: "11px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>Gender</span>
          <strong style={{ display: "block", marginTop: "8px", color: "#0f172a" }}>{profile?.gender || "Not added"}</strong>
        </div>
        <div style={{ padding: "14px 16px", borderRadius: "16px", background: "#fff", border: "1px solid #e2e8f0" }}>
          <span style={{ display: "block", fontSize: "11px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>Date of birth</span>
          <strong style={{ display: "block", marginTop: "8px", color: "#0f172a" }}>{profile?.date_of_birth || "Not added"}</strong>
        </div>
      </div>
    </section>
  );
}

export default function ProfilePage(): React.JSX.Element {
  return (
    <main className="shell account-page-shell" style={{ paddingTop: "40px", paddingBottom: "60px" }}>
      <section
        className="panel account-page-panel"
        style={{
          padding: "clamp(24px, 4vw, 48px)",
          display: "grid",
          gap: "24px",
        }}
      >
        <div className="account-page-header" style={{ display: "grid", gap: "10px" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#1A56DB",
            }}
          >
            Account
          </span>
          <h1 style={{ margin: 0 }}>Your Profile</h1>
          <p style={{ margin: 0, color: "#5A6A85", fontSize: "16px", maxWidth: "72ch" }}>
            Save your profile once here. If you add ID verification, Famlo can approve you for bookings across homes and hommies.
          </p>
        </div>

        <ProfileSummaryCard />

        <GuestVerificationForm
          title="Profile and verification"
          description="Save your basic profile first. Add Aadhaar-with-face verification if you want Famlo to review your booking identity."
          buttonLabel="Save profile"
        />

        <SavedHomesSection />
      </section>
    </main>
  );
}
