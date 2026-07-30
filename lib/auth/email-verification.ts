import { createHash } from "node:crypto";

import { normalizeGuestEmail } from "@/lib/guest-identity";

const EMAIL_OTP_WINDOW_MS = 10 * 60 * 1000;
const EMAIL_OTP_MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

export const EMAIL_VERIFICATION_COOLDOWN_SECONDS = 60;
export const GENERIC_EMAIL_VERIFICATION_MESSAGE =
  "If this email is eligible, a verification code has been sent.";
export const GENERIC_EMAIL_OTP_ERROR =
  "The verification code is invalid or expired.";

export type EmailVerificationEligibility =
  | "eligible"
  | "google_email_read_only"
  | "verified_email_change_requires_reauthentication"
  | "owned_by_another_account";

export function classifyEmailVerificationRequest(input: {
  requestedEmail: string;
  authEmail: string | null;
  authEmailConfirmed: boolean;
  googleAuthenticated: boolean;
  ownedByAnotherAccount: boolean;
}): EmailVerificationEligibility {
  const requested = normalizeGuestEmail(input.requestedEmail);
  const authEmail = normalizeGuestEmail(input.authEmail);
  if (!requested) return "owned_by_another_account";
  if (input.googleAuthenticated) return "google_email_read_only";
  if (input.ownedByAnotherAccount) return "owned_by_another_account";
  if (input.authEmailConfirmed && authEmail && requested !== authEmail) {
    return "verified_email_change_requires_reauthentication";
  }
  return "eligible";
}

export function consumeEmailVerificationAttempt(
  userId: string,
  email: string,
  clientAddress: string,
  now = Date.now()
): boolean {
  const normalized = normalizeGuestEmail(email) ?? "";
  const key = createHash("sha256")
    .update(`${userId}:${normalized}:${clientAddress}`)
    .digest("hex");
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + EMAIL_OTP_WINDOW_MS });
    return true;
  }
  if (current.count >= EMAIL_OTP_MAX_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

export function isEmailVerificationExpired(
  requestedAt: string | null | undefined,
  now = Date.now(),
  expiryMs = EMAIL_OTP_WINDOW_MS
): boolean {
  if (!requestedAt) return true;
  const parsed = Date.parse(requestedAt);
  return !Number.isFinite(parsed) || parsed + expiryMs <= now;
}

export function resetEmailVerificationRateLimitsForTests(): void {
  attempts.clear();
}
