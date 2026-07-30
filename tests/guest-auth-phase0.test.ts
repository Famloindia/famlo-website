import assert from "node:assert/strict";
import { File } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";

import sharp from "sharp";

import {
  consumeOtpVerificationAttempt,
  GENERIC_OTP_ERROR,
  isUsableOtpChallenge,
  requireTwoFactorApiKey,
  resetOtpRateLimitsForTests,
  verifyTwoFactorOtp,
} from "@/lib/auth/guest-otp";
import {
  clearGuestBrowserSession,
  performGuestLogout,
} from "@/lib/auth/guest-logout-client";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { validateGuestProfilePhoto } from "@/lib/r2-upload";
import {
  isGuestProfileComplete,
  validateGuestProfileInput,
} from "@/lib/user-profile";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  constructor(keys: string[]) {
    for (const key of keys) this.values.set(key, "value");
  }

  get length(): number {
    return this.values.size;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  has(key: string): boolean {
    return this.values.has(key);
  }
}

test("phone OTP fails closed without provider configuration", () => {
  assert.throws(
    () => requireTwoFactorApiKey({} as NodeJS.ProcessEnv),
    /temporarily unavailable/
  );
});

test("fixed 123456 is not accepted when the provider rejects it", async () => {
  const failedResponse = () =>
    new Response(JSON.stringify({ Status: "Error" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(
    verifyTwoFactorOtp({
      apiKey: "configured-provider-key",
      sessionId: "provider-session",
      otp: "123456",
      fetchImpl: (async () => failedResponse()) as typeof fetch,
    }),
    new RegExp(GENERIC_OTP_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
});

test("expired, consumed, or mismatched OTP challenges fail before provider verification", () => {
  const now = Date.parse("2026-07-25T12:00:00.000Z");
  assert.equal(
    isUsableOtpChallenge(
      { otp_session_id: "session-1", expires_at: "2026-07-25T11:59:59.000Z", verified: false },
      "session-1",
      now
    ),
    false
  );
  assert.equal(
    isUsableOtpChallenge(
      { otp_session_id: "session-1", expires_at: "2026-07-25T12:10:00.000Z", verified: true },
      "session-1",
      now
    ),
    false
  );
  assert.equal(
    isUsableOtpChallenge(
      { otp_session_id: "other", expires_at: "2026-07-25T12:10:00.000Z", verified: false },
      "session-1",
      now
    ),
    false
  );
});

test("OTP verification attempts are rate limited by phone and client address", () => {
  resetOtpRateLimitsForTests();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal(consumeOtpVerificationAttempt("+917400000001", "127.0.0.1", 1000), true);
  }
  assert.equal(consumeOtpVerificationAttempt("+917400000001", "127.0.0.1", 1000), false);
});

test("unsigned x-famlo-user-id cannot authenticate a request", async () => {
  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: new Error("invalid token") }),
    },
  };
  const request = new Request("http://localhost/api/user/profile", {
    headers: {
      Authorization: "Bearer invalid",
      "x-famlo-user-id": "victim-user-id",
    },
  });

  assert.equal(await resolveAuthenticatedUser(supabase as never, request), null);
});

test("guest logout clears auth and guest caches while preserving host and saved-home state", () => {
  const localStorage = new MemoryStorage([
    "sb-stagingref-auth-token",
    "sb-stagingref-auth-token-code-verifier",
    "famlo-saved-homes:user-1",
    "famlo-pro-theme",
  ]);
  const sessionStorage = new MemoryStorage([
    "famlo:guest-conversations:user-1",
    "famlo:guest-messages:conversation-1",
    "famlo:host-messages:conversation-2",
  ]);

  clearGuestBrowserSession({
    localStorage: localStorage as never,
    sessionStorage: sessionStorage as never,
    supabaseProjectRef: "stagingref",
  });

  assert.equal(localStorage.has("sb-stagingref-auth-token"), false);
  assert.equal(localStorage.has("famlo-saved-homes:user-1"), true);
  assert.equal(localStorage.has("famlo-pro-theme"), true);
  assert.equal(sessionStorage.has("famlo:guest-conversations:user-1"), false);
  assert.equal(sessionStorage.has("famlo:host-messages:conversation-2"), true);
});

test("logout still clears and redirects when Supabase and server cleanup reject", async () => {
  const calls: string[] = [];
  const result = await performGuestLogout({
    signOutSupabase: async () => {
      calls.push("supabase");
      throw new Error("offline");
    },
    clearServerSessions: async () => {
      calls.push("server");
      throw new Error("offline");
    },
    clearBrowserSession: () => calls.push("browser"),
    redirectHome: () => calls.push("redirect:/"),
  });

  assert.ok(result.supabaseError);
  assert.ok(result.serverError);
  assert.deepEqual(calls, ["supabase", "server", "browser", "redirect:/"]);
});

test("logout still redirects if browser storage cleanup throws", async () => {
  const calls: string[] = [];
  const result = await performGuestLogout({
    signOutSupabase: async () => undefined,
    clearServerSessions: async () => undefined,
    clearBrowserSession: () => {
      calls.push("browser");
      throw new Error("storage unavailable");
    },
    redirectHome: () => calls.push("redirect:/"),
  });

  assert.ok(result.browserError);
  assert.deepEqual(calls, ["browser", "redirect:/"]);
});

test("profile completion is derived from persisted profile data, not draft fields", async () => {
  const component = await readFile("components/account/ProfileCompletionForm.tsx", "utf8");
  const route = await readFile("app/api/user/profile/route.ts", "utf8");
  assert.ok(component.includes("const profileComplete = isGuestProfileComplete(profile);"));
  assert.equal(component.includes("const profileComplete = isGuestProfileComplete({"), false);
  assert.ok(route.includes("profileComplete: isGuestProfileComplete(verifiedProfile)"));
  assert.doesNotMatch(route, /profileComplete:\s*true/);
});

test("profile validation reports field-level errors and accepts a complete persisted profile", () => {
  const input = {
    userId: "user-1",
    name: "",
    email: "invalid",
    phone: "",
    city: "",
    state: "",
    about: "",
    dob: "not-a-date",
    gender: "",
  };
  const errors = validateGuestProfileInput(input);
  assert.ok(errors.name);
  assert.ok(errors.email);
  assert.ok(errors.city);
  assert.ok(errors.dob);

  assert.equal(
    isGuestProfileComplete({
      id: "user-1",
      username: "famlo_guest",
      name: "Famlo Guest",
      phone: "+917400000001",
      phone_verified_at: "2026-07-30T10:00:00.000Z",
      email: "guest@example.com",
      email_verified_at: "2026-07-30T10:00:00.000Z",
      city: "Hisar",
      state: "Haryana",
      onboarding_completed: true,
      avatar_url: "https://images.example.test/avatar.webp",
      about: "I enjoy meeting local hosts.",
      date_of_birth: "2000-01-01",
      gender: "prefer_not_to_say",
      kyc_status: null,
      id_document_url: null,
      id_document_type: null,
    }),
    true
  );
});

test("profile-photo validation checks actual image content and size", async () => {
  const png = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: "#ffffff",
    },
  }).png().toBuffer();
  await validateGuestProfilePhoto(new File([png], "avatar.png", { type: "image/png" }) as never, 1024);

  await assert.rejects(
    validateGuestProfilePhoto(
      new File([Buffer.from("not an image")], "avatar.png", { type: "image/png" }) as never,
      1024
    ),
    /not a valid image/
  );
  await assert.rejects(
    validateGuestProfilePhoto(new File([png], "avatar.txt", { type: "text/plain" }) as never, 1024),
    /JPEG/
  );
  await assert.rejects(
    validateGuestProfilePhoto(new File([png, png], "avatar.png", { type: "image/png" }) as never, 1),
    /too large/
  );
});

test("profile-photo route is strict-auth, user-scoped, and generic onboarding rejects guest folders", async () => {
  const photoRoute = await readFile("app/api/user/profile/photo/route.ts", "utf8");
  const genericRoute = await readFile("app/api/onboarding/home/upload/route.ts", "utf8");
  assert.match(photoRoute, /resolveStrictAuthenticatedUser/);
  assert.ok(photoRoute.includes("uploadGuestProfilePhotoToR2(file, authUser.id)"));
  assert.ok(photoRoute.includes('formData.has("userId") || formData.has("folder")'));
  assert.match(genericRoute, /folder === \"guest-profile\"/);
});

test("phone OTP migration removes direct client access and enables RLS", async () => {
  const migration = await readFile(
    "supabase/migrations/20260725230000_phone_otps_rls_phase0.sql",
    "utf8"
  );
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all privileges.*anon/i);
  assert.match(migration, /revoke all privileges.*authenticated/i);
  assert.match(migration, /grant select, insert, update, delete.*service_role/i);
  assert.match(migration, /cleanup_expired_phone_otps/);
});

test("phone authentication no longer contains deterministic passwords or a fixed OTP bypass", async () => {
  const verifyRoute = await readFile("app/api/auth/otp/verify/route.ts", "utf8");
  const sendRoute = await readFile("app/api/auth/otp/send/route.ts", "utf8");
  const authModal = await readFile("components/auth/AuthModal.tsx", "utf8");
  assert.doesNotMatch(verifyRoute, /FamloPhone|stablePhonePassword|deterministicGuestId/);
  assert.doesNotMatch(`${verifyRoute}\n${sendRoute}`, /otp\s*!==\s*["']123456|Mock Phone OTP|Invalid Mock OTP/);
  assert.doesNotMatch(verifyRoute, /updateUserById[\s\S]{0,300}password/);
  assert.doesNotMatch(authModal, /sessionCredentials|signInWithPassword/);
});

test("OTP routes do not return or log OTP values", async () => {
  const verifyRoute = await readFile("app/api/auth/otp/verify/route.ts", "utf8");
  const sendRoute = await readFile("app/api/auth/otp/send/route.ts", "utf8");
  assert.doesNotMatch(
    `${verifyRoute}\n${sendRoute}`,
    /console\.(?:log|info|warn|error)\([\s\S]{0,250}\botp\s*[,}:]/i
  );
  assert.doesNotMatch(`${verifyRoute}\n${sendRoute}`, /NextResponse\.json\([^\n]*(?:otp|code)\s*:/i);
  assert.match(sendRoute, /otp:\s*\"2FACTOR_MANAGED\"/);
});

test("profile and photo APIs reject client-controlled identity", async () => {
  const profileRoute = await readFile("app/api/user/profile/route.ts", "utf8");
  const photoRoute = await readFile("app/api/user/profile/photo/route.ts", "utf8");
  assert.match(profileRoute, /userId !== authUser\.id/);
  assert.match(profileRoute, /status:\s*403/);
  assert.match(photoRoute, /resolveStrictAuthenticatedUser/);
  assert.match(photoRoute, /uploadGuestProfilePhotoToR2\(file, authUser\.id\)/);
  assert.doesNotMatch(photoRoute, /formData\.get\(["']userId["']\)/);
});

test("booking history never lets a stale guest cookie override the authenticated user", async () => {
  const bookingsRoute = await readFile("app/api/user/bookings/route.ts", "utf8");
  assert.match(bookingsRoute, /guestSession\?\.userId === authUser\.id/);
  assert.match(bookingsRoute, /matchingGuestSession/);
  assert.doesNotMatch(bookingsRoute, /const effectiveAuthUser = guestSession\s*\?/);
});

test("guest logout API clears only the guest compatibility cookie", async () => {
  const sessionRoute = await readFile("app/api/auth/session/route.ts", "utf8");
  assert.match(sessionRoute, /getGuestCookieName\(\)/);
  assert.doesNotMatch(sessionRoute, /famlo_host_session|famlo_host_family_id|sb-access-token/);
});

test("host mutation routes retain signed host authorization after strict guest auth removal", async () => {
  const routes = await Promise.all(
    [
      "app/api/host/bookings/checkout/route.ts",
      "app/api/host/bookings/early-checkout/route.ts",
      "app/api/host/bookings/guest-feedback/route.ts",
      "app/api/host/bookings/no-show/route.ts",
      "app/api/host/pro/bookings/manual/route.ts",
      "app/api/host/pro/channel/channex/property/route.ts",
    ].map((path) => readFile(path, "utf8"))
  );
  for (const source of routes) {
    assert.match(source, /resolveAuthorizedHost(?:Session|Resource)/);
    assert.doesNotMatch(source, /resolveAuthenticatedUser/);
  }
});
