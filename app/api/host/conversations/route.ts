import { NextResponse } from "next/server";

import { isBookingChatUnlocked, resolveAuthorizedHostSession } from "@/lib/chat-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type ConversationRow = {
  id: string;
  booking_id: string | null;
  last_message: string | null;
  last_message_at: string | null;
  host_unread: number | null;
  guest_unread: number | null;
  guest_id: string | null;
  family_id: string | null;
  host_user_id: string | null;
  typing_user_id: string | null;
  typing_updated_at: string | null;
};

type LightweightConversationRow = Pick<ConversationRow, "id" | "last_message_at" | "host_unread" | "guest_unread" | "typing_user_id" | "typing_updated_at">;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedFamilyId = searchParams.get("familyId");
  const requestedHostUserId = searchParams.get("hostUserId");
  const requestedConversationId = searchParams.get("conversationId");
  const lightweight = searchParams.get("lightweight") === "1" || searchParams.get("lightweight") === "true";

  try {
    const supabase = createAdminSupabaseClient();
    const hostSession = await resolveAuthorizedHostSession(supabase, request);
    if (!hostSession?.familyId && !hostSession?.hostUserId) {
      return NextResponse.json({ error: "Host session required." }, { status: 401 });
    }

    if (requestedFamilyId && hostSession.familyId && requestedFamilyId !== hostSession.familyId) {
      return NextResponse.json({ error: "You can only load your own guest inbox." }, { status: 403 });
    }
    if (requestedHostUserId && hostSession.hostUserId && requestedHostUserId !== hostSession.hostUserId) {
      return NextResponse.json({ error: "You can only load your own guest inbox." }, { status: 403 });
    }

    if (lightweight && requestedConversationId) {
      const { data: lightweightConversations, error: lightweightError } = await supabase
        .from("conversations")
        .select("id,last_message_at,host_unread,guest_unread,typing_user_id,typing_updated_at")
        .eq("id", requestedConversationId)
        .or(hostSession.hostUserId ? `host_user_id.eq.${hostSession.hostUserId}` : `family_id.eq.${hostSession.familyId}`)
        .limit(1);

      if (lightweightError) throw lightweightError;

      return NextResponse.json((lightweightConversations ?? []) as LightweightConversationRow[]);
    }

    const filters = [hostSession.familyId ? `family_id.eq.${hostSession.familyId}` : null, hostSession.hostUserId ? `host_user_id.eq.${hostSession.hostUserId}` : null]
      .filter(Boolean)
      .join(",");

    const { data: conversations, error } = await supabase
      .from("conversations")
      .select(`
        id,
        booking_id,
        last_message,
        last_message_at,
        host_unread,
        guest_unread,
        guest_id,
        family_id,
        host_user_id,
        typing_user_id,
        typing_updated_at
      `)
      .or(filters)
      .order("last_message_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const conversationRows = ((conversations ?? []) as ConversationRow[]).filter((conversation) => {
      if (!conversation.booking_id) return false;
      if (hostSession.hostUserId && conversation.host_user_id) {
        return conversation.host_user_id === hostSession.hostUserId;
      }
      return hostSession.familyId ? conversation.family_id === hostSession.familyId : false;
    });

    const bookingRefs = [...new Set(conversationRows.map((conversation) => conversation.booking_id).filter((value): value is string => Boolean(value)))];
    const [bookingV2ById, bookingV2ByLegacy, legacyBookings] = await Promise.all([
      bookingRefs.length > 0
        ? supabase.from("bookings_v2").select("id,legacy_booking_id,status").in("id", bookingRefs)
        : Promise.resolve({ data: [], error: null }),
      bookingRefs.length > 0
        ? supabase.from("bookings_v2").select("id,legacy_booking_id,status").in("legacy_booking_id", bookingRefs)
        : Promise.resolve({ data: [], error: null }),
      bookingRefs.length > 0
        ? supabase.from("bookings").select("id,status").in("id", bookingRefs)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (bookingV2ById.error) throw bookingV2ById.error;
    if (bookingV2ByLegacy.error) throw bookingV2ByLegacy.error;
    if (legacyBookings.error) throw legacyBookings.error;

    const bookingStatusByRef = new Map<string, string | null>();
    for (const row of [...(bookingV2ById.data ?? []), ...(bookingV2ByLegacy.data ?? [])] as Array<Record<string, unknown>>) {
      const id = typeof row.id === "string" ? row.id : null;
      const legacyId = typeof row.legacy_booking_id === "string" ? row.legacy_booking_id : null;
      const status = typeof row.status === "string" ? row.status : null;
      if (id) bookingStatusByRef.set(id, status);
      if (legacyId) bookingStatusByRef.set(legacyId, status);
    }
    for (const row of (legacyBookings.data ?? []) as Array<Record<string, unknown>>) {
      const id = typeof row.id === "string" ? row.id : null;
      if (id && !bookingStatusByRef.has(id)) {
        bookingStatusByRef.set(id, typeof row.status === "string" ? row.status : null);
      }
    }

    const visibleConversations = conversationRows.filter((conversation) =>
      isBookingChatUnlocked(bookingStatusByRef.get(conversation.booking_id ?? "") ?? null)
    );

    const guestIds = [...new Set(visibleConversations.map((c) => c.guest_id).filter(Boolean))];

    let guestMap: Record<
      string,
      {
        name: string;
        avatar_url: string | null;
        city: string | null;
        state: string | null;
        gender: string | null;
        about: string | null;
        kyc_status: string | null;
      }
    > = {};

    if (guestIds.length > 0) {
      const { data: guests } = await supabase
        .from("users")
        .select("id, name, avatar_url, city, state, gender, about, kyc_status")
        .in("id", guestIds);

      guestMap = Object.fromEntries(
        (guests ?? []).map((g) => [
          g.id,
          {
            name: g.name ?? "Guest",
            avatar_url: g.avatar_url,
            city: g.city ?? null,
            state: g.state ?? null,
            gender: g.gender ?? null,
            about: g.about ?? null,
            kyc_status: g.kyc_status ?? null,
          },
        ])
      );
    }

    const result = visibleConversations.map((conversation) => ({
      ...conversation,
      guest: guestMap[conversation.guest_id ?? ""] ?? {
        name: "Guest",
        avatar_url: null,
        city: null,
        state: null,
        gender: null,
        about: null,
        kyc_status: null,
      },
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("[conversations] Error:", err);
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
  }
}
