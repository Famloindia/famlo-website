"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useUser } from "@/components/auth/UserContext";
import { ProfileCompletionForm } from "@/components/account/ProfileCompletionForm";
import { PasswordManagementCard } from "@/components/account/PasswordManagementCard";
import { SavedHomesSection } from "@/components/account/SavedHomesSection";
import { getSafeReturnPath } from "@/lib/site-url";
import { getMissingGuestProfileRequirements, isGuestProfileComplete } from "@/lib/user-profile";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function ProfilePage(): React.JSX.Element {
  const { user, profile, loading } = useUser();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = getSafeReturnPath(searchParams.get("next"));
  const authReturn = searchParams.get("auth_return");
  const isGoogleOnboarding = authReturn === "google";
  const linkRequestId = searchParams.get("link_request");
  const profileComplete = isGuestProfileComplete(profile);
  const [phoneConflict, setPhoneConflict] = useState(false);
  const displayedProfileComplete = profileComplete && !phoneConflict;
  const missingRequiredFields = phoneConflict
    ? ["Verified phone"]
    : getMissingGuestProfileRequirements(profile);
  const accountHasPassword = user?.app_metadata?.provider === "email";
  const [linkStatus, setLinkStatus] = useState<{
    status: string;
    targetSupabaseSessionVerified: boolean;
  } | null>(null);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const [linkingGoogle, setLinkingGoogle] = useState(false);

  const refreshLinkStatus = useCallback(async (): Promise<void> => {
    if (!linkRequestId) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const response = await fetch(
      `/api/user/account-link/status?requestId=${encodeURIComponent(linkRequestId)}`,
      {
        cache: "no-store",
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      }
    );
    const payload = await response.json().catch(() => null);
    if (response.ok && payload) {
      setLinkStatus({
        status: String(payload.status ?? ""),
        targetSupabaseSessionVerified:
          payload.targetSupabaseSessionVerified === true,
      });
    }
  }, [linkRequestId, supabase]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void refreshLinkStatus();
    }, 0);
    return () => window.clearTimeout(handle);
  }, [refreshLinkStatus, user?.id]);

  async function linkGoogleIdentity(): Promise<void> {
    if (!linkRequestId || !linkStatus?.targetSupabaseSessionVerified) return;
    setLinkingGoogle(true);
    setLinkMessage(null);
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", nextPath);
    callbackUrl.searchParams.set("link_request", linkRequestId);
    callbackUrl.searchParams.set("link_mode", "google");
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });
    if (error) {
      setLinkingGoogle(false);
      setLinkMessage(
        "Google linking could not be completed. Your existing account remains unchanged."
      );
    }
  }

  if (loading && !user && !profile) {
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
    <main className="profile-page">
      <div className="profile-page-inner">
        <header className="profile-heading">
          <span>Account</span>
          <h1>Your Profile</h1>
          <p>Keep your guest details accurate so hosts know who is arriving.</p>
        </header>

        <section className={`profile-status ${displayedProfileComplete ? "complete" : "incomplete"}`} role="status">
          <div className="profile-status-icon">
            {displayedProfileComplete ? <CheckCircle2 size={22} /> : <AlertCircle size={22} />}
          </div>
          <div>
            <h2>{displayedProfileComplete ? "Profile complete. You can now book stays." : "Complete your profile to book stays"}</h2>
            {!displayedProfileComplete ? (
              <>
                <p>Booking is blocked until your required details and contact verification are complete.</p>
                {missingRequiredFields.length > 0 ? (
                  <p className="missing-summary">
                    Missing: {missingRequiredFields.join(", ")}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </section>

        {linkRequestId && linkStatus?.status !== "linked" ? (
          <section className="identity-link-panel">
            <div>
              <h2>Link your Google sign-in</h2>
              <p>
                Phone ownership is confirmed. Verify this account&apos;s email, then
                link Google to use either sign-in method.
              </p>
            </div>
            <button
              type="button"
              disabled={
                !linkStatus?.targetSupabaseSessionVerified || linkingGoogle
              }
              onClick={() => void linkGoogleIdentity()}
            >
              {linkingGoogle ? "Opening Google..." : "Link Google"}
            </button>
            {linkMessage ? <p className="link-error">{linkMessage}</p> : null}
          </section>
        ) : null}

        <ProfileCompletionForm
          title="Profile details"
          description="Your verified contact details help Famlo keep every booking secure."
          buttonLabel={isGoogleOnboarding ? "Save and continue" : "Save profile"}
          returnTo={nextPath}
          accountLinkRequestId={linkRequestId}
          onPhoneConflictChange={setPhoneConflict}
          onSuccess={async () => {
            router.replace(nextPath);
          }}
        />

        {isGoogleOnboarding ? null : <PasswordManagementCard initialHasPassword={accountHasPassword} />}
        {isGoogleOnboarding ? null : <SavedHomesSection />}
      </div>

      <style jsx>{`
        .profile-page {
          min-height: 100vh;
          padding: 36px 20px 64px;
          background: #f7f9fc;
        }
        .profile-page-inner {
          width: min(100%, 1060px);
          margin: 0 auto;
          display: grid;
          gap: 20px;
        }
        .profile-heading {
          display: grid;
          gap: 6px;
          padding: 4px 2px 8px;
        }
        .profile-heading span {
          color: #1a56db;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0;
        }
        .profile-heading h1 {
          margin: 0;
          color: #0f172a;
          font-size: clamp(30px, 5vw, 42px);
          line-height: 1.15;
        }
        .profile-heading p {
          margin: 0;
          color: #64748b;
          font-size: 15px;
          line-height: 1.6;
        }
        .profile-status {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 18px 20px;
          border: 1px solid;
          border-radius: 16px;
        }
        .profile-status.incomplete {
          border-color: #f8d58b;
          background: #fffaf0;
          color: #8a4b08;
        }
        .profile-status.complete {
          border-color: #b9e6cd;
          background: #f2fbf6;
          color: #17663a;
        }
        .profile-status-icon {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          margin-top: 1px;
        }
        .profile-status h2 {
          margin: 0;
          font-size: 16px;
          line-height: 1.35;
        }
        .profile-status p {
          margin: 5px 0 0;
          color: #64748b;
          font-size: 13px;
          line-height: 1.5;
        }
        .identity-link-panel {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px 20px;
          align-items: center;
          padding: 18px 20px;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          background: #eff6ff;
        }
        .identity-link-panel h2 { margin: 0; color: #1e3a8a; font-size: 16px; }
        .identity-link-panel p { margin: 5px 0 0; color: #475569; font-size: 13px; line-height: 1.5; }
        .identity-link-panel button {
          min-height: 42px;
          padding: 0 16px;
          border: 0;
          border-radius: 8px;
          background: #1d4ed8;
          color: #fff;
          font-weight: 800;
          cursor: pointer;
        }
        .identity-link-panel button:disabled { cursor: not-allowed; opacity: 0.55; }
        .identity-link-panel .link-error { grid-column: 1 / -1; color: #b91c1c; font-weight: 700; }
        @media (max-width: 640px) {
          .identity-link-panel { grid-template-columns: 1fr; }
          .identity-link-panel button { width: 100%; }
        }
        .profile-status .missing-summary {
          color: inherit;
          font-weight: 700;
        }
        @media (max-width: 640px) {
          .profile-page {
            padding: 24px 14px 44px;
          }
          .profile-page-inner {
            gap: 16px;
          }
          .profile-status {
            padding: 16px;
          }
        }
      `}</style>
    </main>
  );
}
