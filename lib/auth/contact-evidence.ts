import type { User } from "@supabase/supabase-js";

import { normalizeGuestEmail, normalizeGuestPhone } from "@/lib/guest-identity";
import type { UserProfileRecord } from "@/lib/user-profile";

export type ContactEvidence = {
  email: {
    value: string | null;
    verified: boolean;
    readOnly: boolean;
    source: "google" | "auth" | "profile" | "none";
  };
  phone: {
    value: string | null;
    verified: boolean;
    source: "auth" | "profile" | "none";
  };
  providers: string[];
};

export function deriveContactEvidence(
  authUser: User | null,
  profile: UserProfileRecord | null
): ContactEvidence {
  const providers = Array.from(
    new Set(
      [
        ...(authUser?.identities ?? []).map((identity) => identity.provider),
        typeof authUser?.app_metadata?.provider === "string"
          ? authUser.app_metadata.provider
          : null,
      ].filter((provider): provider is string => Boolean(provider))
    )
  );
  const googleIdentity = (authUser?.identities ?? []).find(
    (identity) => identity.provider === "google"
  );
  const authEmail = normalizeGuestEmail(authUser?.email);
  const googleEmail = normalizeGuestEmail(
    typeof googleIdentity?.identity_data?.email === "string"
      ? googleIdentity.identity_data.email
      : null
  );
  const profileEmail = normalizeGuestEmail(profile?.email);
  const canonicalGoogleEmail = googleEmail ?? authEmail;
  const hasVerifiedGoogleEmail = Boolean(
    canonicalGoogleEmail &&
      authUser?.email_confirmed_at &&
      authEmail === canonicalGoogleEmail
  );
  const authPhone = normalizeGuestPhone(authUser?.phone);
  const profilePhone = normalizeGuestPhone(profile?.phone);

  return {
    email: hasVerifiedGoogleEmail
      ? {
          value: canonicalGoogleEmail,
          verified: true,
          readOnly: true,
          source: "google",
        }
      : authEmail && authUser?.email_confirmed_at
        ? {
            value: authEmail,
            verified: true,
            readOnly: false,
            source: "auth",
          }
        : profileEmail
          ? {
              value: profileEmail,
              verified: Boolean(profile?.email_verified_at),
              readOnly: false,
              source: "profile",
            }
          : {
              value: null,
              verified: false,
              readOnly: false,
              source: "none",
            },
    phone: authPhone && authUser?.phone_confirmed_at
      ? {
          value: authPhone,
          verified: true,
          source: "auth",
        }
      : profilePhone
        ? {
            value: profilePhone,
            verified: Boolean(profile?.phone_verified_at),
            source: "profile",
          }
        : {
            value: null,
            verified: false,
            source: "none",
          },
    providers,
  };
}
