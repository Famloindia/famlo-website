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

type MessagePreviewRow = {
  conversation_id: string | null;
  text: string | null;
  created_at: string | null;
  sender_type: string | null;
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

    const visibleConversationIds = visibleConversations.map((conversation) => conversation.id);
    const { data: previewMessages, error: previewMessagesError } =
      visibleConversationIds.length > 0
        ? await supabase
            .from("messages")
            .select("conversation_id,text,created_at,sender_type")
            .in("conversation_id", visibleConversationIds)
            .neq("sender_type", "system")
            .order("created_at", { ascending: false })
            .limit(500)
        : { data: [], error: null };

    if (previewMessagesError) throw previewMessagesError;

    const previewByConversationId = new Map<string, { text: string | null; created_at: string | null }>();
    for (const row of (previewMessages ?? []) as MessagePreviewRow[]) {
      if (!row.conversation_id || previewByConversationId.has(row.conversation_id)) {
        continue;
      }
      previewByConversationId.set(row.conversation_id, {
        text: row.text,
        created_at: row.created_at,
      });
    }

    const groupedConversations = new Map<string, Array<ConversationRow>>();
    for (const conversation of visibleConversations) {
      const groupKey = [
        conversation.guest_id ?? "guest",
        conversation.host_user_id ?? "host",
        conversation.family_id ?? "family",
      ].join("::");
      const existing = groupedConversations.get(groupKey) ?? [];
      existing.push(conversation);
      groupedConversations.set(groupKey, existing);
    }

    const result = Array.from(groupedConversations.values())
      .map((group) => {
        const canonicalConversation = [...group].sort(
          (left, right) =>
            new Date(right.last_message_at ?? 0).getTime() - new Date(left.last_message_at ?? 0).getTime()
        )[0];
        const guest = guestMap[canonicalConversation.guest_id ?? ""] ?? {
          name: "Guest",
          avatar_url: null,
          city: null,
          state: null,
          gender: null,
          about: null,
          kyc_status: null,
        };

        let latestPreviewText = canonicalConversation.last_message;
        let latestPreviewAt = canonicalConversation.last_message_at;
        for (const conversation of group) {
          const preview = previewByConversationId.get(conversation.id);
          if (!preview) continue;
          if (
            !latestPreviewAt ||
            new Date(preview.created_at ?? 0).getTime() > new Date(latestPreviewAt ?? 0).getTime()
          ) {
            latestPreviewText = preview.text;
            latestPreviewAt = preview.created_at;
          }
        }

        return {
          ...canonicalConversation,
          merged_conversation_ids: group.map((conversation) => conversation.id),
          host_unread: group.reduce((sum, conversation) => sum + Number(conversation.host_unread ?? 0), 0),
          guest_unread: group.reduce((sum, conversation) => sum + Number(conversation.guest_unread ?? 0), 0),
          last_message: latestPreviewText,
          last_message_at: latestPreviewAt,
          guest,
        };
      })
      .sort(
        (left, right) =>
          new Date(right.last_message_at ?? 0).getTime() - new Date(left.last_message_at ?? 0).getTime()
      );

    return NextResponse.json(result);
  } catch (err) {
    console.error("[conversations] Error:", err);
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
  }
}
