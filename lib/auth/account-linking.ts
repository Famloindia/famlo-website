import { createHash } from "node:crypto";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { normalizeGuestEmail, normalizeGuestPhone } from "@/lib/guest-identity";
import { getSafeGuestAuthReturnPath } from "@/lib/site-url";

export type AccountLinkStatus =
  | "pending_phone_proof"
  | "ownership_verified"
  | "blocked_business_data"
  | "awaiting_target_session"
  | "awaiting_identity_link"
  | "linked"
  | "manual_review"
  | "cancelled"
  | "failed";

export type AccountLinkDecision = {
  status: AccountLinkStatus;
  automaticMergeAllowed: boolean;
  blockedReason: string | null;
};

type UserBusinessReference = {
  table: string;
  column: string;
};

const USER_BUSINESS_REFERENCES: readonly UserBusinessReference[] = [
  { table: "bookings", column: "user_id" },
  { table: "bookings_v2", column: "user_id" },
  { table: "booking_checkin_attempts_v2", column: "guest_user_id" },
  { table: "guest_feedback_v2", column: "guest_user_id" },
  { table: "reservations_v2", column: "primary_guest_user_id" },
  { table: "families", column: "user_id" },
  { table: "hosts", column: "user_id" },
  { table: "hommie_profiles_v2", column: "user_id" },
  { table: "stories_v2", column: "author_user_id" },
  { table: "reviews_v2", column: "guest_user_id" },
  { table: "host_interaction_events_v2", column: "user_id" },
] as const;

export function fingerprintIdentityContact(type: "phone" | "email", value: string): string {
  const normalized = type === "phone" ? normalizeGuestPhone(value) : normalizeGuestEmail(value);
  if (!normalized) throw new Error(`Invalid ${type}.`);
  return createHash("sha256").update(`${type}:${normalized}`).digest("hex");
}

export function buildAccountLinkIdempotencyKey(input: {
  sourceUserId: string;
  targetUserId: string;
  contactFingerprint: string;
}): string {
  return createHash("sha256")
    .update(`${input.sourceUserId}:${input.targetUserId}:${input.contactFingerprint}`)
    .digest("hex");
}

export function decideAccountLink(input: {
  ownershipVerified: boolean;
  sourceHasBusinessData: boolean;
  targetHasBusinessData: boolean;
  targetSupabaseSessionVerified: boolean;
  identityLinked: boolean;
}): AccountLinkDecision {
  if (!input.ownershipVerified) {
    return {
      status: "pending_phone_proof",
      automaticMergeAllowed: false,
      blockedReason: null,
    };
  }
  if (input.sourceHasBusinessData) {
    return {
      status: "blocked_business_data",
      automaticMergeAllowed: false,
      blockedReason: input.targetHasBusinessData
        ? "both_accounts_have_business_data"
        : "source_account_requires_data_transfer",
    };
  }
  if (!input.targetSupabaseSessionVerified) {
    return {
      status: "awaiting_target_session",
      automaticMergeAllowed: !input.sourceHasBusinessData,
      blockedReason: null,
    };
  }
  if (!input.identityLinked) {
    return {
      status: "awaiting_identity_link",
      automaticMergeAllowed: !input.sourceHasBusinessData,
      blockedReason: null,
    };
  }
  return {
    status: "linked",
    automaticMergeAllowed: !input.sourceHasBusinessData,
    blockedReason: null,
  };
}

export function createSafeAccountLinkResponse(input: {
  requestId: string;
  status: AccountLinkStatus;
  intendedReturnPath: string;
  sourceHasBusinessData: boolean;
  targetHasBusinessData: boolean;
}): {
  requestId: string;
  status: AccountLinkStatus;
  returnTo: string;
  automaticMergeBlocked: boolean;
} {
  return {
    requestId: input.requestId,
    status: input.status,
    returnTo: getSafeGuestAuthReturnPath(input.intendedReturnPath),
    automaticMergeBlocked: input.sourceHasBusinessData,
  };
}

export async function findAuthUserByPhone(
  supabase: SupabaseClient,
  phone: string
): Promise<User | null> {
  const normalizedPhone = normalizeGuestPhone(phone);
  if (!normalizedPhone) return null;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => normalizeGuestPhone(user.phone) === normalizedPhone);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  throw new Error("Unable to resolve the verified account.");
}

export async function findAuthUserByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<User | null> {
  const normalizedEmail = normalizeGuestEmail(email);
  if (!normalizedEmail) return null;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => normalizeGuestEmail(user.email) === normalizedEmail);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  throw new Error("Unable to resolve the verified account.");
}

export async function hasUserBusinessData(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  for (const reference of USER_BUSINESS_REFERENCES) {
    const { count, error } = await supabase
      .from(reference.table)
      .select("id", { count: "exact", head: true })
      .eq(reference.column, userId);
    if (error) {
      const missingRelation =
        error.message.toLowerCase().includes("does not exist") ||
        error.message.toLowerCase().includes("schema cache");
      if (missingRelation) continue;
      throw error;
    }
    if ((count ?? 0) > 0) return true;
  }
  return false;
}

export function hasGoogleIdentity(user: User): boolean {
  return (user.identities ?? []).some((identity) => identity.provider === "google");
}

export function findGoogleProviderId(user: User): string | null {
  const identity = (user.identities ?? []).find((item) => item.provider === "google");
  const providerId = identity?.identity_id ?? identity?.id;
  return typeof providerId === "string" && providerId.length > 0 ? providerId : null;
}

export function fingerprintProviderIdentity(providerId: string): string {
  return createHash("sha256").update(`google:${providerId}`).digest("hex");
}

export async function recordAccountLinkEvent(
  supabase: SupabaseClient,
  input: {
    requestId: string;
    eventType: string;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from("account_link_events").insert({
    request_id: input.requestId,
    event_type: input.eventType,
    actor_user_id: input.actorUserId ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) throw error;
}
