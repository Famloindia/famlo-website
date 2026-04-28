import { createHash, randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getPublicSiteUrl } from "@/lib/site-url";
import { asNumber, asString, type JsonRecord } from "@/lib/platform-utils";

export type BookingActionType = "accept_booking" | "reject_booking";

const BOOKING_ACTION_TTL_MINUTES = Number(process.env.FAMLO_HOST_BOOKING_ACTION_TTL_MINUTES ?? "60");

function isSchemaCompatibilityError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("column") || lower.includes("schema cache") || lower.includes("does not exist") || lower.includes("relation");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function resolveBookingActionUrl(token: string, action: BookingActionType): string {
  const url = new URL("/booking-actions/host", getPublicSiteUrl());
  url.searchParams.set("token", token);
  url.searchParams.set("action", action);
  return url.toString();
}

function resolveHostDashboardUrl(familyId: string | null): string {
  const url = new URL("/partnerslogin/home/dashboard", getPublicSiteUrl());
  if (familyId) {
    url.searchParams.set("family", familyId);
  }
  url.searchParams.set("tab", "bookings");
  return url.toString();
}

function resolveActionStatus(action: BookingActionType): "accepted" | "rejected" {
  return action === "accept_booking" ? "accepted" : "rejected";
}

type BookingActionTokenRow = JsonRecord & {
  booking_id?: string | null;
  family_id?: string | null;
  host_id?: string | null;
  host_user_id?: string | null;
  action?: string | null;
  expires_at?: string | null;
  used_at?: string | null;
};

export async function createBookingActionToken(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    familyId?: string | null;
    hostId?: string | null;
    hostUserId?: string | null;
    action: BookingActionType;
    metadata?: JsonRecord;
  }
): Promise<{ token: string; url: string } | null> {
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + BOOKING_ACTION_TTL_MINUTES * 60_000).toISOString();

  const { error } = await supabase.from("whatsapp_action_tokens").insert({
    booking_id: input.bookingId,
    family_id: input.familyId ?? null,
    host_id: input.hostId ?? null,
    host_user_id: input.hostUserId ?? null,
    action: input.action,
    token_hash: hashToken(token),
    expires_at: expiresAt,
    metadata: input.metadata ?? {},
  });

  if (error) {
    if (isSchemaCompatibilityError(error.message)) {
      return null;
    }
    throw error;
  }

  return {
    token,
    url: resolveBookingActionUrl(token, input.action),
  };
}

export async function createHostBookingActionLinks(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    familyId?: string | null;
    hostId?: string | null;
    hostUserId?: string | null;
    metadata?: JsonRecord;
  }
): Promise<{ acceptUrl: string; rejectUrl: string; dashboardUrl: string } | null> {
  const [acceptToken, rejectToken] = await Promise.all([
    createBookingActionToken(supabase, {
      ...input,
      action: "accept_booking",
    }),
    createBookingActionToken(supabase, {
      ...input,
      action: "reject_booking",
    }),
  ]);

  if (!acceptToken || !rejectToken) {
    return null;
  }

  return {
    acceptUrl: acceptToken.url,
    rejectUrl: rejectToken.url,
    dashboardUrl: resolveHostDashboardUrl(input.familyId ?? null),
  };
}

async function loadBookingActionTokenRow(
  supabase: SupabaseClient,
  token: string
): Promise<BookingActionTokenRow | null | "unavailable"> {
  const { data, error } = await supabase
    .from("whatsapp_action_tokens")
    .select("id,booking_id,family_id,host_id,host_user_id,action,expires_at,used_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (error) {
    if (isSchemaCompatibilityError(error.message)) {
      return "unavailable";
    }
    throw error;
  }

  return (data as BookingActionTokenRow | null) ?? null;
}

async function loadBookingActionBooking(
  supabase: SupabaseClient,
  bookingId: string
): Promise<JsonRecord | null> {
  const { data, error } = await supabase
    .from("bookings_v2")
    .select("id,status,start_date,end_date,guests_count,total_price,pricing_snapshot,users!user_id(name),hosts!host_id(display_name,legacy_family_id)")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as JsonRecord | null) ?? null;
}

function resolveBookingActionPropertyName(row: JsonRecord | null): string {
  const pricingSnapshot = (row?.pricing_snapshot as JsonRecord | null) ?? null;
  const host = Array.isArray(row?.hosts) ? row?.hosts[0] : row?.hosts;
  return (
    asString(pricingSnapshot?.listing_name) ??
    asString(pricingSnapshot?.property_name) ??
    asString((host as JsonRecord | null)?.display_name) ??
    "Famlo stay"
  );
}

export async function loadBookingActionPreview(
  supabase: SupabaseClient,
  input: {
    token: string;
    action: BookingActionType;
  }
): Promise<
  | { status: "unavailable" | "invalid" | "used" | "expired" | "mismatch" }
  | {
      status: "ready" | "already_resolved";
      action: BookingActionType;
      bookingId: string;
      bookingStatus: string | null;
      propertyName: string;
      guestName: string | null;
      startDate: string | null;
      endDate: string | null;
      guestsCount: number;
      totalPrice: number;
    }
> {
  const tokenRow = await loadBookingActionTokenRow(supabase, input.token);
  if (tokenRow === "unavailable") {
    return { status: "unavailable" };
  }
  if (!tokenRow) {
    return { status: "invalid" };
  }

  const rowAction = asString(tokenRow.action) as BookingActionType | null;
  if (rowAction !== input.action) {
    return { status: "mismatch" };
  }
  if (asString(tokenRow.used_at)) {
    return { status: "used" };
  }
  if ((asString(tokenRow.expires_at) ?? "") < new Date().toISOString()) {
    return { status: "expired" };
  }

  const bookingId = asString(tokenRow.booking_id);
  if (!bookingId) {
    return { status: "invalid" };
  }

  const booking = await loadBookingActionBooking(supabase, bookingId);
  if (!booking) {
    return { status: "invalid" };
  }

  const currentStatus = asString(booking.status);
  const guest = Array.isArray(booking.users) ? booking.users[0] : booking.users;
  const preview = {
    action: input.action,
    bookingId,
    bookingStatus: currentStatus,
    propertyName: resolveBookingActionPropertyName(booking),
    guestName: asString((guest as JsonRecord | null)?.name),
    startDate: asString(booking.start_date),
    endDate: asString(booking.end_date),
    guestsCount: asNumber(booking.guests_count, 1),
    totalPrice: asNumber(booking.total_price, 0),
  };

  if (currentStatus && currentStatus !== "pending") {
    return {
      status: "already_resolved",
      ...preview,
    };
  }

  return {
    status: "ready",
    ...preview,
  };
}

export async function consumeBookingActionToken(
  supabase: SupabaseClient,
  input: {
    token: string;
    action: BookingActionType;
  }
): Promise<
  | { status: "unavailable" | "invalid" | "used" | "expired" | "mismatch" | "already_resolved" }
  | {
      status: "ready";
      bookingId: string;
      familyId: string | null;
      hostId: string | null;
      hostUserId: string | null;
      nextStatus: "accepted" | "rejected";
    }
> {
  const preview = await loadBookingActionPreview(supabase, input);
  if (preview.status !== "ready") {
    if (preview.status === "already_resolved") {
      return { status: "already_resolved" };
    }
    return { status: preview.status };
  }

  const tokenRow = await loadBookingActionTokenRow(supabase, input.token);
  if (tokenRow === "unavailable") {
    return { status: "unavailable" };
  }
  if (!tokenRow) {
    return { status: "invalid" };
  }

  return {
    status: "ready",
    bookingId: preview.bookingId,
    familyId: asString(tokenRow.family_id),
    hostId: asString(tokenRow.host_id),
    hostUserId: asString(tokenRow.host_user_id),
    nextStatus: resolveActionStatus(input.action),
  };
}

export async function markBookingActionTokensUsed(
  supabase: SupabaseClient,
  input: {
    token: string;
    bookingId: string;
  }
): Promise<void> {
  const tokenHash = hashToken(input.token);
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("whatsapp_action_tokens")
    .update({ used_at: now } as never)
    .eq("booking_id", input.bookingId)
    .or(`token_hash.eq.${tokenHash},used_at.is.null`);

  if (error && !isSchemaCompatibilityError(error.message)) {
    throw error;
  }
}

export function resolveHostActionSuccessUrl(result: "accepted" | "rejected"): string {
  const url = new URL("/booking-actions/host", getPublicSiteUrl());
  url.searchParams.set("result", result);
  return url.toString();
}

export function resolveHostActionFailureUrl(code: string): string {
  const url = new URL("/booking-actions/host", getPublicSiteUrl());
  url.searchParams.set("error", code);
  return url.toString();
}
