import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import { sendWhatsAppAuthenticationOtp } from "@/lib/notifications/providers/whatsapp";

export type HostWhatsAppOtpProvider = "meta_whatsapp" | "twofactor" | "staging_test";

type OtpSendResult = {
  provider: HostWhatsAppOtpProvider;
  providerSessionId: string | null;
  codeHash: string | null;
};

function stagingProjectSelected(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.STAGING_SUPABASE_URL ?? "";
  return url.includes("nsanahmopvwrlwvmxdmf.supabase.co");
}
export function isStagingTestOtpEnabled(): boolean {
  const appEnv = process.env.APP_ENV?.trim().toLowerCase();
  return (
    process.env.NODE_ENV !== "production" &&
    (appEnv === "local" || appEnv === "test") &&
    stagingProjectSelected() &&
    String(process.env.FAMLO_ENABLE_STAGING_TEST_OTP ?? "").trim().toLowerCase() === "true"
  );
}

function testOtpCode(): string {
  const code = process.env.FAMLO_STAGING_TEST_OTP_CODE?.trim() ?? "";
  if (!/^\d{6}$/.test(code)) {
    throw new Error("Staging test OTP is enabled without a valid six-digit secret.");
  }
  return code;
}

function hashSecret(): string {
  const secret =
    process.env.HOST_WHATSAPP_OTP_HASH_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim();
  if (!secret || secret.length < 24) {
    throw new Error("OTP hashing is not configured.");
  }
  return secret;
}

export function hashHostWhatsappOtp(input: {
  challengeId: string;
  phoneE164: string;
  code: string;
}): string {
  return createHmac("sha256", hashSecret())
    .update(`${input.challengeId}:${input.phoneE164}:${input.code}`)
    .digest("hex");
}

function constantTimeMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function callTwoFactor(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method: "POST", cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.ok && payload?.Status === "Success") return payload;
  throw new Error(typeof payload?.Details === "string" ? payload.Details : "OTP provider request failed.");
}

function generateOtpCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

export async function sendHostWhatsappOtp(input: {
  challengeId?: string;
  phoneE164: string;
}): Promise<OtpSendResult & { challengeId: string }> {
  const challengeId = input.challengeId ?? randomUUID();
  if (isStagingTestOtpEnabled()) {
    return {
      challengeId,
      provider: "staging_test",
      providerSessionId: null,
      codeHash: hashHostWhatsappOtp({
        challengeId,
        phoneE164: input.phoneE164,
        code: testOtpCode(),
      }),
    };
  }

  const code = generateOtpCode();
  const result = await sendWhatsAppAuthenticationOtp({
    phone: input.phoneE164,
    code,
  });
  if (result.status !== "processed" || !result.providerMessageId) {
    const error = new Error(result.errorMessage ?? "WhatsApp could not send the verification code.");
    Object.assign(error, { code: result.errorCode ?? "whatsapp_otp_send_failed" });
    throw error;
  }
  return {
    challengeId,
    provider: "meta_whatsapp",
    providerSessionId: result.providerMessageId,
    codeHash: hashHostWhatsappOtp({
      challengeId,
      phoneE164: input.phoneE164,
      code,
    }),
  };
}

export async function verifyHostWhatsappOtp(input: {
  challengeId: string;
  phoneE164: string;
  code: string;
  provider: HostWhatsAppOtpProvider;
  providerSessionId: string | null;
  codeHash: string | null;
}): Promise<boolean> {
  if (!/^\d{6}$/.test(input.code)) return false;

  if (input.provider === "staging_test" || input.provider === "meta_whatsapp") {
    if (input.provider === "staging_test" && !isStagingTestOtpEnabled()) return false;
    if (!input.codeHash) return false;
    return constantTimeMatch(
      hashHostWhatsappOtp({
        challengeId: input.challengeId,
        phoneE164: input.phoneE164,
        code: input.code,
      }),
      input.codeHash
    );
  }

  const apiKey = process.env.TWO_FACTOR_API_KEY?.trim();
  if (!apiKey || !input.providerSessionId) throw new Error("Phone verification is not configured.");
  try {
    await callTwoFactor(
      `https://2factor.in/API/V1/${apiKey}/SMS/VERIFY/${encodeURIComponent(input.providerSessionId)}/${input.code}`
    );
    return true;
  } catch {
    return false;
  }
}
