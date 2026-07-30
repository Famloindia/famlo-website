import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { User } from "@supabase/supabase-js";

import {
  buildAccountLinkIdempotencyKey,
  createSafeAccountLinkResponse,
  decideAccountLink,
  fingerprintIdentityContact,
} from "../lib/auth/account-linking";
import { deriveContactEvidence } from "../lib/auth/contact-evidence";
import {
  classifyEmailVerificationRequest,
  consumeEmailVerificationAttempt,
  isEmailVerificationExpired,
  resetEmailVerificationRateLimitsForTests,
} from "../lib/auth/email-verification";
import { getSafeGuestAuthReturnPath } from "../lib/site-url";
import {
  isGuestProfileComplete,
  validateGuestProfileDetailsInput,
  type UserProfileRecord,
} from "../lib/user-profile";
import { migrateSavedHomesAfterIdentityLink } from "../lib/auth/saved-homes-linking";

const completeProfile: UserProfileRecord = {
  id: "target-user",
  username: "verified_guest",
  name: "Verified Guest",
  phone: "+919999999999",
  phone_verified_at: "2026-07-30T10:00:00.000Z",
  email: "verified@example.test",
  email_verified_at: "2026-07-30T10:00:00.000Z",
  city: "Hisar",
  state: "Haryana",
  onboarding_completed: true,
  avatar_url: null,
  about: null,
  date_of_birth: "2000-01-01",
  gender: "prefer_not_to_say",
  kyc_status: null,
  id_document_url: null,
  id_document_type: null,
  account_status: "active",
};

function googleUser(): User {
  return {
    id: "google-user",
    aud: "authenticated",
    created_at: "2026-07-30T10:00:00.000Z",
    email: "google@example.test",
    email_confirmed_at: "2026-07-30T10:00:00.000Z",
    app_metadata: { provider: "google", providers: ["email", "google"] },
    user_metadata: {},
    identities: [
      {
        id: "google-provider-id",
        identity_id: "google-provider-id",
        user_id: "google-user",
        identity_data: { email: "google@example.test" },
        provider: "google",
        created_at: "2026-07-30T10:00:00.000Z",
        updated_at: "2026-07-30T10:00:00.000Z",
        last_sign_in_at: "2026-07-30T10:00:00.000Z",
      },
    ],
  } as User;
}

test("Google user with a new phone keeps Google email canonical", () => {
  const evidence = deriveContactEvidence(googleUser(), {
    ...completeProfile,
    id: "google-user",
    phone: "+918888888888",
    phone_verified_at: null,
    email: null,
    email_verified_at: null,
  });
  assert.deepEqual(evidence.email, {
    value: "google@example.test",
    verified: true,
    readOnly: true,
    source: "google",
  });
  assert.equal(evidence.phone.verified, false);
});

test("Google user entering an existing phone receives a neutral conflict contract", async () => {
  const route = await readFile(
    "app/api/user/profile/phone/send-otp/route.ts",
    "utf8"
  );
  assert.match(route, /PHONE_ALREADY_LINKED/);
  assert.doesNotMatch(route, /target.*(?:name|email|photo|booking)/i);
});

test("existing phone owner failing OTP cannot advance ownership proof", () => {
  const decision = decideAccountLink({
    ownershipVerified: false,
    sourceHasBusinessData: false,
    targetHasBusinessData: true,
    targetSupabaseSessionVerified: false,
    identityLinked: false,
  });
  assert.equal(decision.status, "pending_phone_proof");
});

test("existing phone owner passing OTP advances only to target-session proof", () => {
  const decision = decideAccountLink({
    ownershipVerified: true,
    sourceHasBusinessData: false,
    targetHasBusinessData: true,
    targetSupabaseSessionVerified: false,
    identityLinked: false,
  });
  assert.equal(decision.status, "awaiting_target_session");
});

test("Google identity can complete only after target session and provider link", () => {
  const decision = decideAccountLink({
    ownershipVerified: true,
    sourceHasBusinessData: false,
    targetHasBusinessData: true,
    targetSupabaseSessionVerified: true,
    identityLinked: true,
  });
  assert.equal(decision.status, "linked");
});

test("duplicate Google user with no business data is eligible for safe retirement", () => {
  const decision = decideAccountLink({
    ownershipVerified: true,
    sourceHasBusinessData: false,
    targetHasBusinessData: true,
    targetSupabaseSessionVerified: true,
    identityLinked: false,
  });
  assert.equal(decision.automaticMergeAllowed, true);
  assert.equal(decision.status, "awaiting_identity_link");
});

test("automatic merge is blocked when both accounts have business data", () => {
  const decision = decideAccountLink({
    ownershipVerified: true,
    sourceHasBusinessData: true,
    targetHasBusinessData: true,
    targetSupabaseSessionVerified: true,
    identityLinked: true,
  });
  assert.equal(decision.status, "blocked_business_data");
  assert.equal(decision.blockedReason, "both_accounts_have_business_data");
});

test("private profile data is absent from pre-link responses", () => {
  const response = createSafeAccountLinkResponse({
    requestId: "request-1",
    status: "awaiting_target_session",
    intendedReturnPath: "/homes/example?booking=1",
    sourceHasBusinessData: false,
    targetHasBusinessData: true,
  });
  assert.deepEqual(Object.keys(response).sort(), [
    "automaticMergeBlocked",
    "requestId",
    "returnTo",
    "status",
  ]);
});

test("Google email is verified and read-only from Auth evidence", () => {
  const evidence = deriveContactEvidence(googleUser(), null);
  assert.equal(evidence.email.verified, true);
  assert.equal(evidence.email.readOnly, true);
  assert.equal(evidence.email.source, "google");
});

test("phone-first account can request verification for a manual email", () => {
  assert.equal(
    classifyEmailVerificationRequest({
      requestedEmail: "phone-first@example.test",
      authEmail: null,
      authEmailConfirmed: false,
      googleAuthenticated: false,
      ownedByAnotherAccount: false,
    }),
    "eligible"
  );
});

test("incorrect and expired email OTP attempts stay generic and rate limited", () => {
  resetEmailVerificationRateLimitsForTests();
  assert.equal(isEmailVerificationExpired("2026-07-30T00:00:00.000Z", Date.parse("2026-07-30T01:00:00.000Z")), true);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal(
      consumeEmailVerificationAttempt(
        "user-1",
        "email@example.test",
        "127.0.0.1",
        1
      ),
      true
    );
  }
  assert.equal(
    consumeEmailVerificationAttempt(
      "user-1",
      "email@example.test",
      "127.0.0.1",
      1
    ),
    false
  );
});

test("email already linked to another account enters linking flow", () => {
  assert.equal(
    classifyEmailVerificationRequest({
      requestedEmail: "owned@example.test",
      authEmail: null,
      authEmailConfirmed: false,
      googleAuthenticated: false,
      ownedByAnotherAccount: true,
    }),
    "owned_by_another_account"
  );
});

test("email conflict UI offers ownership login without automatic merging", async () => {
  const form = await readFile(
    "components/account/ProfileCompletionForm.tsx",
    "utf8"
  );
  assert.match(form, /Log in with this email/);
  assert.match(form, /Use another email/);
  assert.match(form, /supabase\.auth\.signOut/);
  assert.doesNotMatch(form, /auth\.admin\.(?:deleteUser|updateUserById)/);
});

test("basic profile details save before contact verification", () => {
  const errors = validateGuestProfileDetailsInput({
    userId: "user-1",
    username: "guest_one",
    name: "Guest One",
    email: null,
    phone: null,
    city: "Hisar",
    state: "Haryana",
    dob: "2000-01-01",
    gender: "prefer_not_to_say",
  });
  assert.deepEqual(errors, {});
});

test("booking remains blocked until both contacts are verified", () => {
  assert.equal(
    isGuestProfileComplete({
      ...completeProfile,
      phone_verified_at: null,
    }),
    false
  );
  assert.equal(isGuestProfileComplete(completeProfile), true);
});

test("booking return destination survives account linking and rejects external URLs", () => {
  assert.equal(
    getSafeGuestAuthReturnPath("/homes/example?dates=2026-08-01"),
    "/homes/example?dates=2026-08-01"
  );
  assert.equal(getSafeGuestAuthReturnPath("//attacker.test/path"), "/");
});

test("repeated account-link requests derive the same idempotency key", () => {
  const contactFingerprint = fingerprintIdentityContact(
    "phone",
    "+919999999999"
  );
  const first = buildAccountLinkIdempotencyKey({
    sourceUserId: "source",
    targetUserId: "target",
    contactFingerprint,
  });
  const second = buildAccountLinkIdempotencyKey({
    sourceUserId: "source",
    targetUserId: "target",
    contactFingerprint,
  });
  assert.equal(first, second);
});

test("saved homes move only after successful identity linking", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  } as unknown as Storage;
  storage.setItem(
    "famlo-saved-homes:source",
    JSON.stringify([{ id: "home-1" }, { id: "home-2" }])
  );
  storage.setItem(
    "famlo-saved-homes:target",
    JSON.stringify([{ id: "home-2" }, { id: "home-3" }])
  );

  assert.equal(
    migrateSavedHomesAfterIdentityLink(storage, "source", "target"),
    3
  );
  assert.equal(storage.getItem("famlo-saved-homes:source"), null);
  assert.equal(
    JSON.parse(storage.getItem("famlo-saved-homes:target") ?? "[]").length,
    3
  );
});
