"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useUser } from "@/components/auth/UserContext";
import { ProfileCompletionForm } from "@/components/account/ProfileCompletionForm";
import { PasswordManagementCard } from "@/components/account/PasswordManagementCard";
import { SavedHomesSection } from "@/components/account/SavedHomesSection";
import { getSafeReturnPath } from "@/lib/site-url";
import { getMissingGuestProfileRequirements, isGuestProfileComplete } from "@/lib/user-profile";

export default function ProfilePage(): React.JSX.Element {
  const { user, profile, loading } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = getSafeReturnPath(searchParams.get("next"));
  const authReturn = searchParams.get("auth_return");
  const isGoogleOnboarding = authReturn === "google";
  const profileComplete = isGuestProfileComplete(profile);
  const missingRequiredFields = getMissingGuestProfileRequirements(profile);
  const accountHasPassword = user?.app_metadata?.provider === "email";

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
    <main className="profile-page">
      <div className="profile-page-inner">
        <header className="profile-heading">
          <span>Account</span>
          <h1>Your Profile</h1>
          <p>Keep your guest details accurate so hosts know who is arriving.</p>
        </header>

        <section className={`profile-status ${profileComplete ? "complete" : "incomplete"}`} role="status">
          <div className="profile-status-icon">
            {profileComplete ? <CheckCircle2 size={22} /> : <CircleAlert size={22} />}
          </div>
          <div>
            <h2>{profileComplete ? "Profile complete. You can now book stays." : "Complete your profile to book stays"}</h2>
            {!profileComplete ? (
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

        <ProfileCompletionForm
          title="Profile details"
          description="Your verified contact details help Famlo keep every booking secure."
          buttonLabel={isGoogleOnboarding ? "Save and continue" : "Save profile"}
          onSuccess={async () => {
            if (isGoogleOnboarding) {
              router.replace(nextPath);
            }
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
