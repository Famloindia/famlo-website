import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { resolveMessageThread, type MessageThreadResolution } from "@/lib/chat-thread";
import { resolveAuthenticatedUser } from "@/lib/request-user";

type ConversationRecord = {
  id: string;
  booking_id: string | null;
  guest_id: string | null;
  host_user_id: string | null;
  family_id: string | null;
  host_id: string | null;
};

type BookingV2Record = {
  id: string;
  legacy_booking_id: string | null;
  user_id: string | null;
  host_id: string | null;
  status: string | null;
  payment_status: string | null;
};

type LegacyBookingRecord = {
  id: string;
  user_id: string | null;
  family_id: string | null;
  status: string | null;
};

type HostRecord = {
  id: string | null;
  user_id: string | null;
  legacy_family_id: string | null;
};

type FamilyRecord = {
  id: string | null;
  user_id: string | null;
};

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

export function normalizeBookingStatus(status: string | null | undefined): string {
  return String(status ?? "").trim().toLowerCase();
}

export function isBookingChatUnlocked(status: string | null | undefined): boolean {
  const normalized = normalizeBookingStatus(status);
  return normalized === "accepted" || normalized === "confirmed" || normalized === "checked_in" || normalized === "completed";
}

export function isGuestNetworkUnlocked(status: string | null | undefined): boolean {
  const normalized = normalizeBookingStatus(status);
  return normalized === "accepted" || normalized === "confirmed" || normalized === "checked_in" || normalized === "completed";
}

export function isStayedWithHostStatus(status: string | null | undefined): boolean {
  const normalized = normalizeBookingStatus(status);
  return normalized === "checked_in" || normalized === "completed";
}

export function isCompletedStayStatus(status: string | null | undefined): boolean {
  return normalizeBookingStatus(status) === "completed";
}

async function fetchConversationRecord(
  supabase: SupabaseClient,
  conversationId: string | null
): Promise<ConversationRecord | null> {
  if (!conversationId) return null;

  const { data, error } = await supabase
    .from("conversations")
    .select("id,booking_id,guest_id,host_user_id,family_id,host_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (error) {
    console.error("[chat-access] conversation lookup failed", error);
    return null;
  }

  return (data as ConversationRecord | null) ?? null;
}

async function fetchBookingContext(
  supabase: SupabaseClient,
  refs: string[]
): Promise<{ bookingV2: BookingV2Record | null; legacyBooking: LegacyBookingRecord | null }> {
  for (const ref of refs) {
    const { data: v2ById } = await supabase
      .from("bookings_v2")
      .select("id,legacy_booking_id,user_id,host_id,status,payment_status")
      .eq("id", ref)
      .maybeSingle();

    if (v2ById) {
      return {
        bookingV2: v2ById as BookingV2Record,
        legacyBooking: null,
      };
    }

    const { data: v2ByLegacy } = await supabase
      .from("bookings_v2")
      .select("id,legacy_booking_id,user_id,host_id,status,payment_status")
      .eq("legacy_booking_id", ref)
      .maybeSingle();

    if (v2ByLegacy) {
      return {
        bookingV2: v2ByLegacy as BookingV2Record,
        legacyBooking: null,
      };
    }

    const { data: legacy } = await supabase
      .from("bookings")
      .select("id,user_id,family_id,status")
      .eq("id", ref)
      .maybeSingle();

    if (legacy) {
      return {
        bookingV2: null,
        legacyBooking: legacy as LegacyBookingRecord,
      };
    }
  }

  return {
    bookingV2: null,
    legacyBooking: null,
  };
}

async function fetchHostRecord(
  supabase: SupabaseClient,
  params: { hostId?: string | null; familyId?: string | null; hostUserId?: string | null }
): Promise<HostRecord | null> {
  const { hostId, familyId, hostUserId } = params;

  if (hostId) {
    const { data } = await supabase
      .from("hosts")
      .select("id,user_id,legacy_family_id")
      .eq("id", hostId)
      .maybeSingle();
    if (data) return data as HostRecord;
  }

  if (familyId) {
    const { data } = await supabase
      .from("hosts")
      .select("id,user_id,legacy_family_id")
      .eq("legacy_family_id", familyId)
      .maybeSingle();
    if (data) return data as HostRecord;
  }

  if (hostUserId) {
    const { data } = await supabase
      .from("hosts")
      .select("id,user_id,legacy_family_id")
      .eq("user_id", hostUserId)
      .maybeSingle();
    if (data) return data as HostRecord;
  }

  return null;
}

async function fetchFamilyRecord(
  supabase: SupabaseClient,
  familyId: string | null,
  hostUserId: string | null
): Promise<FamilyRecord | null> {
  if (familyId) {
    const { data } = await supabase.from("families").select("id,user_id").eq("id", familyId).maybeSingle();
    if (data) return data as FamilyRecord;
  }

  if (hostUserId) {
    const { data } = await supabase.from("families").select("id,user_id").eq("user_id", hostUserId).maybeSingle();
    if (data) return data as FamilyRecord;
  }

  return null;
}

export type ConversationAccess = {
  thread: MessageThreadResolution;
  conversationId: string;
  bookingId: string | null;
  legacyBookingId: string | null;
  bookingStatus: string | null;
  paymentStatus: string | null;
  familyId: string | null;
  hostId: string | null;
  guestId: string | null;
  hostUserId: string | null;
  kind: "booking" | "network";
  chatUnlocked: boolean;
};

export async function resolveConversationAccess(
  supabase: SupabaseClient,
  referenceId: string,
  options?: { createIfMissing?: boolean }
): Promise<ConversationAccess | null> {
  const thread = await resolveMessageThread(supabase, referenceId, options);
  if (!thread?.conversationId) return null;

  const conversation = await fetchConversationRecord(supabase, thread.conversationId);
  const { bookingV2, legacyBooking } = await fetchBookingContext(
    supabase,
    uniqueStrings([thread.bookingId, thread.legacyBookingId, conversation?.booking_id])
  );

  const hostRecord = await fetchHostRecord(supabase, {
    hostId: normalizeString(bookingV2?.host_id) ?? normalizeString(conversation?.host_id),
    familyId: normalizeString(conversation?.family_id) ?? normalizeString(legacyBooking?.family_id),
    hostUserId: normalizeString(thread.hostUserId) ?? normalizeString(conversation?.host_user_id),
  });

  const familyRecord = await fetchFamilyRecord(
    supabase,
    normalizeString(conversation?.family_id) ?? normalizeString(legacyBooking?.family_id) ?? normalizeString(hostRecord?.legacy_family_id),
    normalizeString(thread.hostUserId) ?? normalizeString(conversation?.host_user_id) ?? normalizeString(hostRecord?.user_id)
  );

  const kind =
    bookingV2 || legacyBooking || normalizeString(conversation?.booking_id) || normalizeString(thread.bookingId) || normalizeString(thread.legacyBookingId)
      ? "booking"
      : "network";

  const bookingStatus = normalizeString(bookingV2?.status) ?? normalizeString(legacyBooking?.status);
  const paymentStatus = normalizeString(bookingV2?.payment_status);
  const familyId =
    normalizeString(conversation?.family_id) ??
    normalizeString(legacyBooking?.family_id) ??
    normalizeString(hostRecord?.legacy_family_id) ??
    normalizeString(familyRecord?.id);
  const hostUserId =
    normalizeString(thread.hostUserId) ??
    normalizeString(conversation?.host_user_id) ??
    normalizeString(hostRecord?.user_id) ??
    normalizeString(familyRecord?.user_id);
  const guestId =
    normalizeString(thread.guestId) ??
    normalizeString(conversation?.guest_id) ??
    normalizeString(bookingV2?.user_id) ??
    normalizeString(legacyBooking?.user_id);
  const bookingId = normalizeString(bookingV2?.id) ?? normalizeString(thread.bookingId);
  const legacyBookingId = normalizeString(bookingV2?.legacy_booking_id) ?? normalizeString(legacyBooking?.id) ?? normalizeString(thread.legacyBookingId);
  const hostId = normalizeString(bookingV2?.host_id) ?? normalizeString(conversation?.host_id) ?? normalizeString(hostRecord?.id);

  return {
    thread,
    conversationId: thread.conversationId,
    bookingId,
    legacyBookingId,
    bookingStatus,
    paymentStatus,
    familyId,
    hostId,
    guestId,
    hostUserId,
    kind,
    chatUnlocked: kind === "network" ? true : isBookingChatUnlocked(bookingStatus),
  };
}

export type AuthorizedHostSession = {
  familyId: string | null;
  hostUserId: string | null;
  authUserId: string | null;
};

export async function resolveAuthorizedHostSession(
  supabase: SupabaseClient,
  request?: Request
): Promise<AuthorizedHostSession | null> {
  const authUser = await resolveAuthenticatedUser(supabase, request);

  if (authUser?.id) {
    const hostRecord = await fetchHostRecord(supabase, { hostUserId: authUser.id });
    if (hostRecord?.user_id) {
      return {
        familyId: normalizeString(hostRecord.legacy_family_id),
        hostUserId: normalizeString(hostRecord.user_id),
        authUserId: authUser.id,
      };
    }

    const familyRecord = await fetchFamilyRecord(supabase, null, authUser.id);
    if (familyRecord?.user_id) {
      return {
        familyId: normalizeString(familyRecord.id),
        hostUserId: normalizeString(familyRecord.user_id),
        authUserId: authUser.id,
      };
    }
  }

  const cookieStore = await cookies();
  const cookieFamilyId = cookieStore.get("famlo_host_family_id")?.value ?? "";
  if (!cookieFamilyId) return null;

  const hostRecord = await fetchHostRecord(supabase, { familyId: cookieFamilyId });
  const familyRecord = await fetchFamilyRecord(supabase, cookieFamilyId, normalizeString(hostRecord?.user_id));

  return {
    familyId: normalizeString(familyRecord?.id) ?? cookieFamilyId,
    hostUserId: normalizeString(hostRecord?.user_id) ?? normalizeString(familyRecord?.user_id),
    authUserId: authUser?.id ?? null,
  };
}

export function canGuestAccessConversation(access: ConversationAccess, userId: string): boolean {
  if (access.kind === "network") {
    return access.guestId === userId || access.hostUserId === userId;
  }
  return access.guestId === userId;
}

export function canHostAccessConversation(access: ConversationAccess, hostSession: AuthorizedHostSession | null): boolean {
  if (!hostSession || access.kind !== "booking") return false;
  if (hostSession.hostUserId && access.hostUserId) {
    return hostSession.hostUserId === access.hostUserId;
  }
  if (hostSession.familyId && access.familyId) {
    return hostSession.familyId === access.familyId;
  }
  return false;
}
