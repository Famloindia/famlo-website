import { createHash } from "node:crypto";

import { normalizeGuestEmail } from "@/lib/guest-identity";
import { normalizeGuestUsername, validateGuestUsername } from "@/lib/guest-username";

const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 12;
const attempts = new Map<string, { count: number; resetAt: number }>();

export const GENERIC_AUTH_ERROR = "The email, username, or password is incorrect.";
export function validateGuestPassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must contain at least 8 characters.";
  }
  if (password.length > 128) return "Password is too long.";
  return null;
}

export function resolveLoginIdentifier(input: unknown): {
  kind: "email" | "username";
  normalized: string;
} | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  const email = normalizeGuestEmail(trimmed);
  if (trimmed.includes("@") && email) return { kind: "email", normalized: email };
  const username = normalizeGuestUsername(trimmed);
  return validateGuestUsername(username) ? null : { kind: "username", normalized: username };
}

function attemptKey(identifier: string, address: string): string {
  return createHash("sha256").update(`${identifier}:${address}`).digest("hex");
}

export function consumeGuestAuthAttempt(identifier: string, address: string, now = Date.now()): boolean {
  const key = attemptKey(identifier, address);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    return true;
  }
  if (current.count >= AUTH_MAX_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

export function getAuthClientAddress(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export function resetGuestAuthRateLimitsForTests(): void {
  attempts.clear();
}
