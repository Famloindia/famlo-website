import type { SupabaseClient } from "@supabase/supabase-js";

import { isCompletedStayStatus, isGuestNetworkUnlocked, isStayedWithHostStatus } from "@/lib/chat-access";

type HostBookingRow = {
  bookingId: string;
  dedupeKey: string;
  userId: string | null;
  status: string | null;
  source: "v2" | "legacy";
  createdAt: string | null;
};

type GuestProfileRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  avatar_url: string | null;
  about: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function compareIsoDesc(left: string | null, right: string | null): number {
  return new Date(right ?? 0).getTime() - new Date(left ?? 0).getTime();
}

async function loadHostBookingRows(
  supabase: SupabaseClient,
  familyId: string
): Promise<{ hostUserId: string | null; rows: HostBookingRow[] }> {
  const { data: host } = await supabase
    .from("hosts")
    .select("id,user_id,legacy_family_id")
    .eq("legacy_family_id", familyId)
    .maybeSingle();

  const hostId = asString(host?.id);
  const hostUserId = asString(host?.user_id);

  const [v2Result, legacyResult] = await Promise.all([
    hostId
      ? supabase
          .from("bookings_v2")
          .select("id,legacy_booking_id,user_id,status,created_at")
          .eq("host_id", hostId)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("bookings")
      .select("id,user_id,status,created_at")
      .eq("family_id", familyId),
  ]);

  if (v2Result.error) throw v2Result.error;
  if (legacyResult.error) throw legacyResult.error;

  const deduped = new Map<string, HostBookingRow>();

  for (const row of (legacyResult.data ?? []) as Array<Record<string, unknown>>) {
    const bookingId = asString(row.id);
    if (!bookingId) continue;
    deduped.set(`legacy:${bookingId}`, {
      bookingId,
      dedupeKey: `legacy:${bookingId}`,
      userId: asString(row.user_id),
      status: asString(row.status),
      source: "legacy",
      createdAt: asString(row.created_at),
    });
  }

  for (const row of (v2Result.data ?? []) as Array<Record<string, unknown>>) {
    const bookingId = asString(row.id);
    if (!bookingId) continue;
    const legacyBookingId = asString(row.legacy_booking_id);
    const dedupeKey = legacyBookingId ? `legacy:${legacyBookingId}` : `v2:${bookingId}`;
    deduped.set(dedupeKey, {
      bookingId,
      dedupeKey,
      userId: asString(row.user_id),
      status: asString(row.status),
      source: "v2",
      createdAt: asString(row.created_at),
    });
  }

  return {
    hostUserId,
    rows: [...deduped.values()].sort((left, right) => compareIsoDesc(left.createdAt, right.createdAt)),
  };
}

export type HostGuestNetworkGuest = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  avatarUrl: string | null;
  about: string | null;
  completedStayCount: number;
  lastStayAt: string | null;
};

export type HostGuestNetworkSummary = {
  familyId: string;
  hostUserId: string | null;
  guestCount: number;
  viewerCanAccessPeerChat: boolean;
  guests: HostGuestNetworkGuest[];
};

export async function loadHostGuestNetworkSummary(
  supabase: SupabaseClient,
  params: {
    familyId: string;
    viewerUserId?: string | null;
    limit?: number;
  }
): Promise<HostGuestNetworkSummary> {
  const familyId = params.familyId.trim();
  const viewerUserId = asString(params.viewerUserId);
  const limit = typeof params.limit === "number" && params.limit > 0 ? params.limit : 12;

  const { hostUserId, rows } = await loadHostBookingRows(supabase, familyId);
  const stayedRows = rows.filter((row) => isStayedWithHostStatus(row.status) && row.userId);
  const completedRows = rows.filter((row) => isCompletedStayStatus(row.status) && row.userId);
  const guestCount = new Set(stayedRows.map((row) => row.userId)).size;
  const viewerCanAccessPeerChat = viewerUserId
    ? rows.some((row) => row.userId === viewerUserId && isGuestNetworkUnlocked(row.status))
    : false;

  const completedCounts = new Map<string, { count: number; lastStayAt: string | null }>();
  for (const row of completedRows) {
    if (!row.userId) continue;
    const current = completedCounts.get(row.userId) ?? { count: 0, lastStayAt: null };
    completedCounts.set(row.userId, {
      count: current.count + 1,
      lastStayAt:
        compareIsoDesc(row.createdAt, current.lastStayAt) > 0 ? current.lastStayAt : row.createdAt,
    });
  }

  const guestIds = [...completedCounts.keys()].filter((id) => id !== viewerUserId).slice(0, limit);
  const { data: guestProfiles, error: guestError } =
    guestIds.length > 0
      ? await supabase
          .from("users")
          .select("id,name,city,state,avatar_url,about")
          .in("id", guestIds)
      : { data: [], error: null };

  if (guestError) throw guestError;

  const profileMap = new Map(
    ((guestProfiles ?? []) as GuestProfileRow[]).map((row) => [
      row.id,
      {
        name: row.name ?? "Famlo guest",
        city: row.city ?? null,
        state: row.state ?? null,
        avatarUrl: row.avatar_url ?? null,
        about: row.about ?? null,
      },
    ])
  );

  const guests = guestIds
    .map((guestId) => {
      const counts = completedCounts.get(guestId);
      if (!counts) return null;
      const profile = profileMap.get(guestId);
      return {
        id: guestId,
        name: profile?.name ?? "Famlo guest",
        city: profile?.city ?? null,
        state: profile?.state ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        about: profile?.about ?? null,
        completedStayCount: counts.count,
        lastStayAt: counts.lastStayAt,
      };
    })
    .filter((guest): guest is HostGuestNetworkGuest => Boolean(guest));

  return {
    familyId,
    hostUserId,
    guestCount,
    viewerCanAccessPeerChat,
    guests,
  };
}

export async function ensureGuestNetworkConversation(
  supabase: SupabaseClient,
  params: {
    familyId: string;
    viewerUserId: string;
    peerUserId: string;
  }
): Promise<string> {
  const { familyId, viewerUserId, peerUserId } = params;

  const existingQueries = [
    supabase
      .from("conversations")
      .select("id")
      .is("booking_id", null)
      .eq("family_id", familyId)
      .eq("guest_id", viewerUserId)
      .eq("host_user_id", peerUserId)
      .maybeSingle(),
    supabase
      .from("conversations")
      .select("id")
      .is("booking_id", null)
      .eq("family_id", familyId)
      .eq("guest_id", peerUserId)
      .eq("host_user_id", viewerUserId)
      .maybeSingle(),
  ];

  const [forward, reverse] = await Promise.all(existingQueries);
  const existingId = asString(forward.data?.id) ?? asString(reverse.data?.id);
  if (existingId) return existingId;

  const now = new Date().toISOString();
  const openingMessage = "Famlo guest network opened. Please keep this space respectful and booking-relevant.";
  const { data: conversation, error } = await supabase
    .from("conversations")
    .insert({
      booking_id: null,
      family_id: familyId,
      guest_id: viewerUserId,
      host_id: null,
      host_user_id: peerUserId,
      guest_unread: 0,
      host_unread: 1,
      last_message: openingMessage,
      last_message_at: now,
      created_at: now,
    } as never)
    .select("id")
    .single();

  if (error || !conversation?.id) {
    throw new Error(error?.message ?? "Could not open the guest network channel.");
  }

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    booking_id: null,
    sender_id: null,
    receiver_id: peerUserId,
    sender_type: "system",
    text: openingMessage,
    created_at: now,
  } as never);

  return conversation.id;
}
