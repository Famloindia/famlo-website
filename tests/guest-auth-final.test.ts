import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  consumeGuestAuthAttempt,
  resetGuestAuthRateLimitsForTests,
  resolveLoginIdentifier,
  validateGuestPassword,
} from "@/lib/auth/guest-credentials";
import {
  normalizeGuestUsername,
  validateGuestUsername,
} from "@/lib/guest-username";
import { getSafeGuestAuthReturnPath } from "@/lib/site-url";
import { isGuestProfileComplete } from "@/lib/user-profile";

test("guest username normalization and policy are deterministic", () => {
  assert.equal(normalizeGuestUsername("  Aryan_Krishan "), "aryan_krishan");
  assert.equal(validateGuestUsername("aryan_krishan"), null);
  assert.match(validateGuestUsername("2aryan") ?? "", /starting with a letter/);
  assert.match(validateGuestUsername("admin") ?? "", /reserved/);
  assert.match(validateGuestUsername("ab") ?? "", /3-30/);
});

test("login identifier accepts email or canonical username without creating identity", () => {
  assert.deepEqual(resolveLoginIdentifier("Guest@Example.com"), {
    kind: "email",
    normalized: "guest@example.com",
  });
  assert.deepEqual(resolveLoginIdentifier("Aryan_Krishan"), {
    kind: "username",
    normalized: "aryan_krishan",
  });
  assert.equal(resolveLoginIdentifier("not valid!"), null);
});

test("guest auth attempts are rate limited per identifier and address", () => {
  resetGuestAuthRateLimitsForTests();
  for (let index = 0; index < 12; index += 1) {
    assert.equal(consumeGuestAuthAttempt("aryan_krishan", "127.0.0.1", 1000), true);
  }
  assert.equal(consumeGuestAuthAttempt("aryan_krishan", "127.0.0.1", 1000), false);
});

test("password policy rejects weak values", () => {
  assert.match(validateGuestPassword("short") ?? "", /at least 8/);
  assert.equal(validateGuestPassword("long-enough-password"), null);
});

test("external and protocol-relative return paths are rejected", () => {
  assert.equal(getSafeGuestAuthReturnPath("https://evil.example"), "/");
  assert.equal(getSafeGuestAuthReturnPath("//evil.example/path"), "/");
  assert.equal(getSafeGuestAuthReturnPath("/homestay/example"), "/homestay/example");
});

test("profile completion requires every persisted professional field", () => {
  const complete = {
    id: "guest-1",
    username: "famlo_guest",
    name: "Famlo Guest",
    phone: "+917400000001",
    email: "guest@example.com",
    city: "Hisar",
    state: "Haryana",
    onboarding_completed: false,
    avatar_url: "https://images.example.test/avatar.webp",
    about: "I enjoy meeting local hosts.",
    date_of_birth: "2000-01-01",
    gender: "prefer_not_to_say",
    kyc_status: null,
    id_document_url: null,
    id_document_type: null,
  };
  assert.equal(isGuestProfileComplete(complete), true);
  assert.equal(isGuestProfileComplete({ ...complete, username: null }), false);
  assert.equal(isGuestProfileComplete({ ...complete, avatar_url: null }), false);
  assert.equal(isGuestProfileComplete({ ...complete, phone: null }), false);
});

test("login and signup are separate and login never creates an account", async () => {
  const modal = await readFile("components/auth/AuthModal.tsx", "utf8");
  const login = await readFile("app/api/auth/password/login/route.ts", "utf8");
  const signup = await readFile("app/api/auth/signup/email/route.ts", "utf8");
  assert.match(modal, /Log in to Famlo/);
  assert.match(modal, /Create your Famlo account/);
  assert.match(login, /signInWithPassword/);
  assert.doesNotMatch(login, /signUp|createUser/);
  assert.match(signup, /\.auth\.signUp/);
});

test("username login resolves the auth user's confirmed email server-side", async () => {
  const login = await readFile("app/api/auth/password/login/route.ts", "utf8");
  assert.match(login, /auth\.admin\.getUserById/);
  assert.match(login, /email_confirmed_at/);
  assert.doesNotMatch(login, /SERVICE_ROLE.*client/i);
});

test("phone login and signup use distinct purposes and no password bridge", async () => {
  const send = await readFile("app/api/auth/otp/send/route.ts", "utf8");
  const verify = await readFile("app/api/auth/otp/verify/route.ts", "utf8");
  assert.match(send, /guest_phone_signup/);
  assert.match(send, /guest_phone_login/);
  assert.match(verify, /phoneIntent === "login"/);
  assert.doesNotMatch(verify, /password\s*:/);
});

test("password recovery and authenticated change routes use genuine Supabase operations", async () => {
  const forgot = await readFile("app/api/auth/password/forgot/route.ts", "utf8");
  const reset = await readFile("app/auth/reset-password/page.tsx", "utf8");
  const change = await readFile("app/api/auth/password/change/route.ts", "utf8");
  assert.match(forgot, /resetPasswordForEmail/);
  assert.match(reset, /exchangeCodeForSession/);
  assert.match(reset, /auth\.updateUser/);
  assert.match(change, /resolveStrictAuthenticatedUser/);
  assert.match(change, /updateUserById/);
});

test("booking creation enforces persisted completion before side effects", async () => {
  const route = await readFile("app/api/bookings/create/route.ts", "utf8");
  const gateIndex = route.indexOf("isGuestProfileComplete(profile)");
  const createIndex = route.indexOf("await createBookingCompatibility");
  assert.ok(gateIndex > 0);
  assert.ok(createIndex > gateIndex);
  assert.match(route, /profile_incomplete/);
  assert.match(route, /status:\s*428/);
});

test("guest auth migration enforces username uniqueness and server-derived completion", async () => {
  const migration = await readFile(
    "supabase/migrations/20260725233000_guest_auth_username_profile.sql",
    "utf8"
  );
  assert.match(migration, /users_username_normalized_uidx/);
  assert.match(migration, /\^\[a-z\]\[a-z0-9_\]\{2,29\}\$/);
  assert.match(migration, /users_username_reserved_check/);
  assert.match(migration, /users_set_guest_profile_completion/);
  assert.match(migration, /email_verified_at/);
  assert.match(migration, /phone_verified_at/);
});
