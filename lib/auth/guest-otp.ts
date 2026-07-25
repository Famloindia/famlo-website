import { createHash } from "node:crypto";

const OTP_WINDOW_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS_PER_WINDOW = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

export const GENERIC_OTP_ERROR = "The verification code is invalid or expired.";
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export function normalizeIndianOtpPhone(input: unknown): string {
  const clean = typeof input === "string" ? input.replace(/[^\d+]/g, "").trim() : "";
  const withoutPlus = clean.startsWith("+") ? clean.slice(1) : clean;
  const normalized = withoutPlus.startsWith("91") ? withoutPlus : `91${withoutPlus}`;

  if (!/^91\d{10}$/.test(normalized)) {
    throw new Error("Please enter a valid Indian mobile number.");
  }

  return normalized;
}

export function requireTwoFactorApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const apiKey = env.TWO_FACTOR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Phone verification is temporarily unavailable.");
  }
  return apiKey;
}

export function isUsableOtpChallenge(
  challenge: { otp_session_id?: unknown; expires_at?: unknown; verified?: unknown } | null,
  expectedSessionId: string,
  now = Date.now()
): boolean {
  if (!challenge || challenge.verified === true) return false;
  if (typeof challenge.otp_session_id !== "string" || challenge.otp_session_id !== expectedSessionId) {
    return false;
  }
  if (typeof challenge.expires_at !== "string") return false;
  const expiresAt = Date.parse(challenge.expires_at);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export async function verifyTwoFactorOtp(input: {
  apiKey: string;
  sessionId: string;
  otp: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url =
    `https://2factor.in/API/V1/${encodeURIComponent(input.apiKey)}/SMS/VERIFY/` +
    `${encodeURIComponent(input.sessionId)}/${encodeURIComponent(input.otp)}`;
  const postResponse = await fetchImpl(url, { method: "POST", cache: "no-store" });
  const postJson = await postResponse.json().catch(() => null);
  if (postResponse.ok && postJson?.Status === "Success") return;

  const getResponse = await fetchImpl(url, { method: "GET", cache: "no-store" });
  const getJson = await getResponse.json().catch(() => null);
  if (getResponse.ok && getJson?.Status === "Success") return;
  throw new Error(GENERIC_OTP_ERROR);
}

export function getOtpClientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function rateLimitKey(phone: string, clientAddress: string): string {
  return createHash("sha256").update(`${phone}:${clientAddress}`).digest("hex");
}

export function consumeOtpVerificationAttempt(
  phone: string,
  clientAddress: string,
  now = Date.now()
): boolean {
  const key = rateLimitKey(phone, clientAddress);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + OTP_WINDOW_MS });
    return true;
  }
  if (current.count >= OTP_MAX_ATTEMPTS_PER_WINDOW) {
    return false;
  }
  current.count += 1;
  return true;
}

export function resetOtpRateLimitsForTests(): void {
  attempts.clear();
}
