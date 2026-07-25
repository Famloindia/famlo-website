"use client";

import Image from "next/image";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useUser } from "@/components/auth/UserContext";
import { ProfileCompletionForm } from "@/components/account/ProfileCompletionForm";
import { PasswordManagementCard } from "@/components/account/PasswordManagementCard";
import { SavedHomesSection } from "@/components/account/SavedHomesSection";
import { getSafeReturnPath } from "@/lib/site-url";
import { isGuestProfileComplete } from "@/lib/user-profile";

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
            <Image
              src={profile.avatar_url}
              alt={profile?.name || "Profile"}
              width={144}
              height={144}
              sizes="72px"
              unoptimized
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            displayInitial
          )}
        </div>

        <div style={{ display: "grid", gap: "6px" }}>
          <h2 style={{ margin: 0, fontSize: "clamp(24px, 4vw, 32px)" }}>Welcome</h2>
          {profile?.name ? <p style={{ margin: 0, color: "#0f172a", fontWeight: 700 }}>{profile.name}</p> : null}
          {profile?.username ? <p style={{ margin: 0, color: "#1d4ed8", fontWeight: 700 }}>@{profile.username}</p> : null}
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
          <strong style={{ display: "block", marginTop: "8px", color: "#0f172a" }}>
            {profile?.date_of_birth
              ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
                  .format(new Date(`${profile.date_of_birth}T00:00:00Z`))
              : "Not added"}
          </strong>
        </div>
      </div>
    </section>
  );
}

export default function ProfilePage(): React.JSX.Element {
  const { profile, loading } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = getSafeReturnPath(searchParams.get("next"));
  const authReturn = searchParams.get("auth_return");
  const isGoogleOnboarding = authReturn === "google";
  const profileComplete = isGuestProfileComplete(profile);

  useEffect(() => {
    if (!isGoogleOnboarding || loading) {
      return;
    }

    if (!profileComplete) {
      return;
    }

    router.replace(nextPath);
  }, [isGoogleOnboarding, loading, nextPath, profileComplete, router]);

  if (isGoogleOnboarding && loading) {
    return (
      <main
        className="shell account-page-shell"
        style={{ minHeight: "100vh", display: "grid", placeItems: "center", paddingTop: "40px", paddingBottom: "60px" }}
      >
        <section
          className="panel account-page-panel"
          style={{
            width: "100%",
            maxWidth: "720px",
            padding: "32px",
            display: "grid",
            gap: "12px",
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0 }}>Opening your profile</h1>
          <p style={{ margin: 0, color: "#5A6A85", fontSize: "16px" }}>
            Just a moment while we load your account details.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main
      className="shell account-page-shell"
      style={{
        minHeight: isGoogleOnboarding ? "100vh" : undefined,
        paddingTop: "40px",
        paddingBottom: "60px",
        display: isGoogleOnboarding ? "grid" : undefined,
        placeItems: isGoogleOnboarding ? "center" : undefined,
      }}
    >
      <section
        className="panel account-page-panel"
        style={{
          width: "100%",
          maxWidth: isGoogleOnboarding ? "760px" : undefined,
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
            Save your guest profile once here. Hosts will see these details when you book a stay.
          </p>
        </div>

        {isGoogleOnboarding ? null : <ProfileSummaryCard />}

        <ProfileCompletionForm
          title={isGoogleOnboarding ? "Complete your profile" : "Guest profile"}
          description={
            isGoogleOnboarding
              ? "Add your photo, username, contact details, location, gender, date of birth, and about section before continuing."
              : "Fill in your professional guest profile to unlock booking."
          }
          buttonLabel={isGoogleOnboarding ? "Save and continue" : "Save profile"}
          onSuccess={async () => {
            if (isGoogleOnboarding) {
              router.replace(nextPath);
            }
          }}
        />

        {isGoogleOnboarding ? null : <PasswordManagementCard />}
        {isGoogleOnboarding ? null : <SavedHomesSection />}
      </section>
    </main>
  );
}
