import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  sendHostWhatsappOtp,
  verifyHostWhatsappOtp,
  type HostWhatsAppOtpProvider,
} from "@/lib/host-whatsapp-otp-provider";
import { isStagingExplicitWhatsAppDeliveryAllowed } from "@/lib/whatsapp-config";

type JsonRecord = Record<string, unknown>;

export type HostWhatsappSettingsResponse = {
  phoneMasked: string | null;
  hasPhone: boolean;
  verified: boolean;
  enabled: boolean;
  optedIn: boolean;
  source: string | null;
  language: string;
  lastDeliveryStatus: string | null;
  lastDeliveryAt: string | null;
  hasDeliveryIssue: boolean;
  deliveryGloballyEnabled: boolean;
  testMessageAvailable: boolean;
};

const SETTINGS_SELECT =
  "id,host_user_id,phone_e164,enabled,ownership_verified_at,opted_in_at,source,language,last_delivery_status,last_delivery_at,last_delivery_error";
const CHALLENGE_SELECT =
  "id,host_user_id,phone_e164,provider,provider_session_id,code_hash,status,consent_requested,attempts,max_attempts,expires_at,resend_available_at";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function normalizeHostWhatsappPhone(value: unknown): string {
  if (typeof value !== "string") throw new Error("Phone number is required.");
  const digits = value.replace(/\D/g, "");
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  if (!/^91[6-9]\d{9}$/.test(normalized)) {
    throw new Error("Enter a valid Indian mobile number.");
  }
  return `+${normalized}`;
}

export function maskHostWhatsappPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return "••••";
  return `+${digits.slice(0, 2)} ${digits.slice(2, 4)}••••••${digits.slice(-2)}`;
}

export function whatsappDeliveryEnabled(): boolean {
  return String(process.env.FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS ?? "").trim().toLowerCase() === "true";
}

export function hashRequestIp(value: string): string {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() || "famlo-ip-rate-limit";
  return createHash("sha256").update(`${secret}:${value}`).digest("hex");
}

function responseFromRow(row: JsonRecord | null): HostWhatsappSettingsResponse {
  const phone = asString(row?.phone_e164);
  const lastDeliveryStatus = asString(row?.last_delivery_status);
  const hasDeliveryIssue =
    Boolean(asString(row?.last_delivery_error)) ||
    Boolean(lastDeliveryStatus && ["failed", "undelivered"].includes(lastDeliveryStatus.toLowerCase()));
  return {
    phoneMasked: maskHostWhatsappPhone(phone),
    hasPhone: Boolean(phone),
    verified: Boolean(row?.ownership_verified_at),
    enabled: Boolean(row?.enabled),
    optedIn: Boolean(row?.opted_in_at),
    source: asString(row?.source),
    language: asString(row?.language) ?? "en",
    lastDeliveryStatus,
    lastDeliveryAt: asString(row?.last_delivery_at),
    hasDeliveryIssue,
    deliveryGloballyEnabled: whatsappDeliveryEnabled(),
    testMessageAvailable:
      whatsappDeliveryEnabled() || isStagingExplicitWhatsAppDeliveryAllowed(),
  };
}

async function audit(
  supabase: SupabaseClient,
  input: {
    hostUserId: string;
    action: string;
    outcome: "success" | "failure" | "blocked";
    phoneE164?: string | null;
    reasonCode?: string | null;
    ipHash?: string | null;
    actorType?: "host" | "onboarding" | "system";
    metadata?: JsonRecord;
  }
): Promise<void> {
  const { error } = await supabase.from("host_whatsapp_audit_log").insert({
    host_user_id: input.hostUserId,
    action: input.action,
    actor_type: input.actorType ?? "host",
    phone_masked: maskHostWhatsappPhone(input.phoneE164),
    outcome: input.outcome,
    reason_code: input.reasonCode ?? null,
    ip_hash: input.ipHash ?? null,
    metadata: input.metadata ?? {},
  } as never);
  if (error) throw error;
}

export async function getHostWhatsappSettings(
  supabase: SupabaseClient,
  hostUserId: string
): Promise<HostWhatsappSettingsResponse> {
  const { data, error } = await supabase
    .from("host_whatsapp_settings")
    .select(SETTINGS_SELECT)
    .eq("host_user_id", hostUserId)
    .maybeSingle();
  if (error) throw error;
  return responseFromRow((data as JsonRecord | null) ?? null);
}

export async function seedHostWhatsappSettings(
  supabase: SupabaseClient,
  input: {
    hostUserId: string;
    phone: string | null | undefined;
    verifiedAt?: string | null;
    consent: boolean;
    source: "onboarding_consent" | "auth_phone_verified" | "users_phone";
  }
): Promise<void> {
  let phoneE164: string | null = null;
  try {
    phoneE164 = input.phone ? normalizeHostWhatsappPhone(input.phone) : null;
  } catch {
    phoneE164 = null;
  }
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await supabase
    .from("host_whatsapp_settings")
    .select("id")
    .eq("host_user_id", input.hostUserId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return;

  const { error } = await supabase.from("host_whatsapp_settings").insert({
    host_user_id: input.hostUserId,
    phone_e164: phoneE164,
    phone_country_code: phoneE164?.startsWith("+91") ? "+91" : null,
    enabled: Boolean(phoneE164 && input.verifiedAt && input.consent),
    ownership_verified_at: input.verifiedAt ?? null,
    opted_in_at: input.consent ? now : null,
    source: input.source,
  } as never);
  if (error) throw error;
  await audit(supabase, {
    hostUserId: input.hostUserId,
    action: "settings_seeded",
    actorType: input.source === "onboarding_consent" ? "onboarding" : "system",
    outcome: "success",
    phoneE164,
    reasonCode: input.source,
    metadata: { verified: Boolean(input.verifiedAt), consent: input.consent },
  });
}

export async function resolveVerifiedAuthPhone(
  supabase: SupabaseClient,
  input: { hostUserId: string; expectedPhone?: string | null }
): Promise<{ phoneE164: string; verifiedAt: string } | null> {
  const { data, error } = await supabase.auth.admin.getUserById(input.hostUserId);
  if (error) throw error;
  const authPhone = data.user?.phone;
  const confirmedAt = data.user?.phone_confirmed_at;
  if (!authPhone || !confirmedAt) return null;
  let phoneE164: string;
  try {
    phoneE164 = normalizeHostWhatsappPhone(authPhone);
  } catch {
    return null;
  }
  if (input.expectedPhone) {
    try {
      if (normalizeHostWhatsappPhone(input.expectedPhone) !== phoneE164) return null;
    } catch {
      return null;
    }
  }
  return { phoneE164, verifiedAt: confirmedAt };
}

async function countChallenges(
  supabase: SupabaseClient,
  column: "host_user_id" | "phone_e164" | "ip_hash",
  value: string,
  since: string
): Promise<number> {
  const { count, error } = await supabase
    .from("host_whatsapp_otp_challenges")
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .gte("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

export async function requestHostWhatsappOtp(
  supabase: SupabaseClient,
  input: {
    hostUserId: string;
    phone: unknown;
    consent: boolean;
    ipHash: string;
    now?: Date;
  }
): Promise<{ challengeId: string; expiresAt: string; resendAvailableAt: string }> {
  const phoneE164 = normalizeHostWhatsappPhone(input.phone);
  const now = input.now ?? new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const [hostCount, phoneCount, ipCount] = await Promise.all([
    countChallenges(supabase, "host_user_id", input.hostUserId, hourAgo),
    countChallenges(supabase, "phone_e164", phoneE164, hourAgo),
    countChallenges(supabase, "ip_hash", input.ipHash, hourAgo),
  ]);
  if (hostCount >= 5 || phoneCount >= 5 || ipCount >= 10) {
    await audit(supabase, {
      hostUserId: input.hostUserId,
      action: "otp_requested",
      outcome: "blocked",
      phoneE164,
      reasonCode: "rate_limited",
      ipHash: input.ipHash,
    });
    throw Object.assign(new Error("Too many verification requests. Please try again later."), { code: "rate_limited" });
  }

  const { data: latest, error: latestError } = await supabase
    .from("host_whatsapp_otp_challenges")
    .select("resend_available_at")
    .eq("host_user_id", input.hostUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  const resendAt = asString((latest as JsonRecord | null)?.resend_available_at);
  if (resendAt && Date.parse(resendAt) > now.getTime()) {
    throw Object.assign(new Error("Please wait before requesting another code."), { code: "resend_cooldown" });
  }

  const challengeId = randomUUID();
  const sent = await sendHostWhatsappOtp({ challengeId, phoneE164 });
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const resendAvailableAt = new Date(now.getTime() + 60 * 1000).toISOString();

  await supabase
    .from("host_whatsapp_otp_challenges")
    .update({ status: "invalidated", invalidated_at: now.toISOString() } as never)
    .eq("host_user_id", input.hostUserId)
    .eq("status", "pending");

  const { error } = await supabase.from("host_whatsapp_otp_challenges").insert({
    id: challengeId,
    host_user_id: input.hostUserId,
    phone_e164: phoneE164,
    provider: sent.provider,
    provider_session_id: sent.providerSessionId,
    code_hash: sent.codeHash,
    status: "pending",
    consent_requested: input.consent,
    attempts: 0,
    max_attempts: 5,
    expires_at: expiresAt,
    resend_available_at: resendAvailableAt,
    ip_hash: input.ipHash,
  } as never);
  if (error) throw error;
  await audit(supabase, {
    hostUserId: input.hostUserId,
    action: "otp_requested",
    outcome: "success",
    phoneE164,
    ipHash: input.ipHash,
    reasonCode: sent.provider,
  });
  return { challengeId, expiresAt, resendAvailableAt };
}

export async function completeHostWhatsappOtp(
  supabase: SupabaseClient,
  input: {
    hostUserId: string;
    challengeId: string;
    code: unknown;
    ipHash: string;
    now?: Date;
  }
): Promise<HostWhatsappSettingsResponse> {
  const code = typeof input.code === "string" ? input.code.trim() : "";
  if (!/^\d{6}$/.test(code)) throw Object.assign(new Error("Enter the six-digit code."), { code: "invalid_otp" });
  const now = input.now ?? new Date();
  const { data, error } = await supabase
    .from("host_whatsapp_otp_challenges")
    .select(CHALLENGE_SELECT)
    .eq("id", input.challengeId)
    .eq("host_user_id", input.hostUserId)
    .maybeSingle();
  if (error) throw error;
  const challenge = (data as JsonRecord | null) ?? null;
  if (!challenge || challenge.status !== "pending") {
    throw Object.assign(new Error("This verification code is no longer active."), { code: "otp_not_active" });
  }
  if (Date.parse(String(challenge.expires_at)) <= now.getTime()) {
    await supabase
      .from("host_whatsapp_otp_challenges")
      .update({ status: "expired", last_error_code: "expired" } as never)
      .eq("id", input.challengeId)
      .eq("status", "pending");
    throw Object.assign(new Error("This verification code has expired."), { code: "otp_expired" });
  }
  const attempts = Number(challenge.attempts ?? 0);
  const maxAttempts = Number(challenge.max_attempts ?? 5);
  if (attempts >= maxAttempts) {
    throw Object.assign(new Error("Too many incorrect attempts."), { code: "otp_locked" });
  }

  const nextAttempts = attempts + 1;
  const verified = await verifyHostWhatsappOtp({
    challengeId: String(challenge.id),
    phoneE164: String(challenge.phone_e164),
    code,
    provider: String(challenge.provider) as HostWhatsAppOtpProvider,
    providerSessionId: asString(challenge.provider_session_id),
    codeHash: asString(challenge.code_hash),
  });
  if (!verified) {
    const locked = nextAttempts >= maxAttempts;
    await supabase
      .from("host_whatsapp_otp_challenges")
      .update({
        attempts: nextAttempts,
        status: locked ? "locked" : "pending",
        last_error_code: "incorrect",
      } as never)
      .eq("id", input.challengeId)
      .eq("status", "pending")
      .eq("attempts", attempts);
    await audit(supabase, {
      hostUserId: input.hostUserId,
      action: "otp_failed",
      outcome: "failure",
      phoneE164: String(challenge.phone_e164),
      reasonCode: locked ? "max_attempts" : "incorrect",
      ipHash: input.ipHash,
    });
    throw Object.assign(new Error(locked ? "Too many incorrect attempts." : "Incorrect verification code."), {
      code: locked ? "otp_locked" : "incorrect_otp",
    });
  }

  const verifiedAt = now.toISOString();
  const consent = Boolean(challenge.consent_requested);
  const { data: current } = await supabase
    .from("host_whatsapp_settings")
    .select("phone_e164")
    .eq("host_user_id", input.hostUserId)
    .maybeSingle();
  const previousPhone = asString((current as JsonRecord | null)?.phone_e164);
  const { error: settingsError } = await supabase.from("host_whatsapp_settings").upsert({
    host_user_id: input.hostUserId,
    phone_e164: String(challenge.phone_e164),
    phone_country_code: "+91",
    enabled: consent,
    ownership_verified_at: verifiedAt,
    opted_in_at: consent ? verifiedAt : null,
    source: "canonical_otp",
    last_delivery_status: null,
    last_delivery_at: null,
    last_delivery_error: null,
  } as never, { onConflict: "host_user_id" });
  if (settingsError) throw settingsError;

  const { data: completed, error: completionError } = await supabase
    .from("host_whatsapp_otp_challenges")
    .update({
      status: "consumed",
      attempts: nextAttempts,
      verified_at: verifiedAt,
      consumed_at: verifiedAt,
      code_hash: null,
      provider_session_id: null,
      last_error_code: null,
    } as never)
    .eq("id", input.challengeId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (completionError) throw completionError;
  if (!completed) throw Object.assign(new Error("This verification code was already used."), { code: "otp_not_active" });

  await audit(supabase, {
    hostUserId: input.hostUserId,
    action: "otp_verified",
    outcome: "success",
    phoneE164: String(challenge.phone_e164),
    ipHash: input.ipHash,
  });
  if (previousPhone !== String(challenge.phone_e164)) {
    await audit(supabase, {
      hostUserId: input.hostUserId,
      action: "phone_changed",
      outcome: "success",
      phoneE164: String(challenge.phone_e164),
      ipHash: input.ipHash,
    });
  }
  if (consent) {
    await audit(supabase, {
      hostUserId: input.hostUserId,
      action: "consent_granted",
      outcome: "success",
      phoneE164: String(challenge.phone_e164),
      ipHash: input.ipHash,
    });
  }
  return getHostWhatsappSettings(supabase, input.hostUserId);
}

export async function updateHostWhatsappEnabled(
  supabase: SupabaseClient,
  input: {
    hostUserId: string;
    enabled: boolean;
    ipHash: string;
  }
): Promise<HostWhatsappSettingsResponse> {
  const { data: current, error } = await supabase
    .from("host_whatsapp_settings")
    .select(SETTINGS_SELECT)
    .eq("host_user_id", input.hostUserId)
    .maybeSingle();
  if (error) throw error;
  const row = (current as JsonRecord | null) ?? null;
  if (!row) throw Object.assign(new Error("Add and verify a WhatsApp number first."), { code: "settings_missing" });
  if (input.enabled && !row.ownership_verified_at) {
    throw Object.assign(new Error("Verify this WhatsApp number before enabling alerts."), { code: "verification_required" });
  }
  if (input.enabled && !row.opted_in_at) {
    throw Object.assign(new Error("WhatsApp consent is required before enabling alerts."), { code: "consent_required" });
  }
  const { error: updateError } = await supabase
    .from("host_whatsapp_settings")
    .update({ enabled: input.enabled } as never)
    .eq("host_user_id", input.hostUserId);
  if (updateError) throw updateError;
  await audit(supabase, {
    hostUserId: input.hostUserId,
    action: input.enabled ? "alerts_enabled" : "alerts_disabled",
    outcome: "success",
    phoneE164: asString(row.phone_e164),
    ipHash: input.ipHash,
  });
  return getHostWhatsappSettings(supabase, input.hostUserId);
}

export async function recordBlockedTestMessage(
  supabase: SupabaseClient,
  input: { hostUserId: string; ipHash: string }
): Promise<void> {
  const { data } = await supabase
    .from("host_whatsapp_settings")
    .select("phone_e164")
    .eq("host_user_id", input.hostUserId)
    .maybeSingle();
  await audit(supabase, {
    hostUserId: input.hostUserId,
    action: "test_message_blocked",
    outcome: "blocked",
    phoneE164: asString((data as JsonRecord | null)?.phone_e164),
    reasonCode: "whatsapp_delivery_disabled",
    ipHash: input.ipHash,
  });
}
