import { NextResponse } from "next/server";

import { isBookingChatUnlocked } from "@/lib/chat-access";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

function isSchemaCompatibilityError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("column") ||
    lower.includes("schema cache") ||
    lower.includes("does not exist") ||
    lower.includes("relation")
  );
}

function buildMapsUrl(params: { lat?: number | string | null; lng?: number | string | null; label?: string | null }): string | null {
  const lat = typeof params.lat === "number" ? params.lat : typeof params.lat === "string" ? Number(params.lat) : null;
  const lng = typeof params.lng === "number" ? params.lng : typeof params.lng === "string" ? Number(params.lng) : null;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  const label = typeof params.label === "string" ? params.label.trim() : "";
  return label ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}` : null;
}

function parseHostListingMeta(input: string | null): { listingTitle: string | null; hostDisplayName: string | null; hostSelfieUrl: string | null } {
  if (!input) {
    return { listingTitle: null, hostDisplayName: null, hostSelfieUrl: null };
  }

  try {
    const parsed = JSON.parse(input) as Record<string, unknown>;
    return {
      listingTitle: typeof parsed.listingTitle === "string" ? parsed.listingTitle : null,
      hostDisplayName: typeof parsed.hostDisplayName === "string" ? parsed.hostDisplayName : null,
      hostSelfieUrl: typeof parsed.hostSelfieUrl === "string" ? parsed.hostSelfieUrl : null,
    };
  } catch {
    return { listingTitle: null, hostDisplayName: null, hostSelfieUrl: null };
  }
}

type ConversationRow = {
  id: string;
  booking_id: string | null;
  family_id: string | null;
  host_id: string | null;
  host_user_id: string | null;
  guest_id: string | null;
  last_message: string | null;
  last_message_at: string | null;
  guest_unread: number | null;
  host_unread: number | null;
  typing_user_id: string | null;
  typing_updated_at: string | null;
};

type LightweightConversationRow = Pick<ConversationRow, "id" | "last_message_at" | "guest_unread" | "host_unread" | "typing_user_id" | "typing_updated_at">;

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const requestedUserId = searchParams.get("userId");
  const requestedConversationId = searchParams.get("conversationId");
  const lightweight = searchParams.get("lightweight") === "1" || searchParams.get("lightweight") === "true";

  try {
    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (requestedUserId && requestedUserId !== authUser.id) {
      return NextResponse.json({ error: "You can only load your own conversations." }, { status: 403 });
    }

    console.info("[guest.conversations] load:start", { userId: authUser.id, lightweight, requestedConversationId });

    if (lightweight && requestedConversationId) {
      const { data: lightweightConversations, error: lightweightError } = await supabase
        .from("conversations")
        .select("id,last_message_at,guest_unread,host_unread,typing_user_id,typing_updated_at")
        .eq("id", requestedConversationId)
        .or(`guest_id.eq.${authUser.id},host_user_id.eq.${authUser.id}`)
        .limit(1);

      if (lightweightError) throw lightweightError;

      return NextResponse.json((lightweightConversations ?? []) as LightweightConversationRow[]);
    }

    const { data: conversations, error } = await supabase
      .from("conversations")
      .select(`
        id,
        booking_id,
        family_id,
        host_id,
        host_user_id,
        guest_id,
        last_message,
        last_message_at,
        guest_unread,
        host_unread,
        typing_user_id,
        typing_updated_at
      `)
      .or(`guest_id.eq.${authUser.id},host_user_id.eq.${authUser.id}`)
      .order("last_message_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    const conversationRows = ((conversations ?? []) as ConversationRow[]).filter((conversation) => {
      if (!conversation.booking_id) {
        return conversation.guest_id === authUser.id || conversation.host_user_id === authUser.id;
      }
      return true;
    });

    const bookingRefs = [...new Set(conversationRows.map((row) => row.booking_id).filter((value): value is string => Boolean(value)))];
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

    const visibleConversations = conversationRows.filter((conversation) => {
      if (!conversation.booking_id) return true;
      return isBookingChatUnlocked(bookingStatusByRef.get(conversation.booking_id) ?? null);
    });

    const familyIds = [...new Set(visibleConversations.map((item) => item.family_id).filter(Boolean))];
    const hostIds = [...new Set(visibleConversations.map((item) => item.host_id).filter(Boolean))];

    const [familiesResult, hostsResult, hostMediaResult] = await Promise.all([
      familyIds.length > 0
        ? await (async () => {
            const fullResult = await supabase
              .from("families")
              .select("id,name,admin_notes,city,state,lat_exact,lng_exact,lat,lng,host_photo_url,host_id,user_id")
              .in("id", familyIds);

            if (!fullResult.error) return fullResult;
            if (!isSchemaCompatibilityError(fullResult.error.message)) return fullResult;

            return supabase.from("families").select("id,name,admin_notes,city,state,lat,lng,host_id,user_id").in("id", familyIds);
          })()
        : Promise.resolve({ data: [], error: null }),
      hostIds.length > 0
        ? supabase.from("hosts").select("id,user_id,display_name,city,state,lat_exact,lng_exact,lat,lng,legacy_family_id").in("id", hostIds)
        : Promise.resolve({ data: [], error: null }),
      hostIds.length > 0
        ? supabase.from("host_media").select("host_id,media_url,is_primary").in("host_id", hostIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (familiesResult.error) throw familiesResult.error;
    if (hostsResult.error) throw hostsResult.error;
    if (hostMediaResult.error) throw hostMediaResult.error;

    const familyMap = Object.fromEntries((familiesResult.data ?? []).map((row) => [row.id, row]));
    const hostMap = Object.fromEntries((hostsResult.data ?? []).map((row) => [row.id, row]));
    const hostUserIds = [
      ...new Set(
        (hostsResult.data ?? [])
          .map((row) => row.user_id)
          .concat(visibleConversations.map((item) => item.host_user_id))
          .filter(Boolean)
      ),
    ];

    const hostProfilesResult =
      hostUserIds.length > 0
        ? await supabase.from("users").select("id,name,avatar_url,city,state").in("id", hostUserIds)
        : { data: [], error: null };

    if (hostProfilesResult.error) throw hostProfilesResult.error;

    const hostProfileMap = Object.fromEntries((hostProfilesResult.data ?? []).map((row) => [row.id, row]));
    const hostMediaMap = Object.fromEntries(
      Object.entries(
        (hostMediaResult.data ?? [])
          .filter((row) => row?.host_id)
          .reduce<Record<string, unknown[]>>((acc, row) => {
            const hostId = String(row.host_id);
            acc[hostId] = [...(acc[hostId] ?? []), row];
            return acc;
          }, {})
      )
    );

    const payload = visibleConversations.map((conversation) => {
      const family = conversation.family_id ? familyMap[conversation.family_id] : null;
      const hostProfile = conversation.host_id ? hostMap[conversation.host_id] : null;
      const hostUser =
        (conversation.host_user_id ? hostProfileMap[conversation.host_user_id] : null) ??
        (hostProfile?.user_id ? hostProfileMap[hostProfile.user_id] : null);
      const hostMedia = conversation.host_id ? (hostMediaMap[conversation.host_id] as Array<{ media_url?: string | null }> | undefined) : undefined;
      const familyMeta = parseHostListingMeta(typeof family?.admin_notes === "string" ? family.admin_notes : null);
      const isGuestNetworkConversation = !conversation.booking_id && Boolean(conversation.family_id);
      const propertyName = isGuestNetworkConversation
        ? "Famlo guest network"
        : familyMeta.listingTitle ?? family?.name ?? hostProfile?.display_name ?? "Famlo stay";
      const hostDisplayName = isGuestNetworkConversation
        ? hostUser?.name ?? "Famlo member"
        : familyMeta.hostDisplayName ?? hostUser?.name ?? hostProfile?.display_name ?? "Host";
      const hostAvatarUrl = isGuestNetworkConversation
        ? hostUser?.avatar_url ?? null
        : familyMeta.hostSelfieUrl ??
          family?.host_photo_url ??
          hostUser?.avatar_url ??
          hostMedia?.find((media) => media?.media_url)?.media_url ??
          null;
      const propertyLocation = [family?.city ?? hostProfile?.city, family?.state ?? hostProfile?.state].filter(Boolean).join(", ");
      const locationUrl =
        buildMapsUrl({
          lat: family?.lat_exact ?? family?.lat ?? hostProfile?.lat_exact ?? hostProfile?.lat,
          lng: family?.lng_exact ?? family?.lng ?? hostProfile?.lng_exact ?? hostProfile?.lng,
          label: propertyLocation || propertyName,
        }) ?? null;
      return {
        ...conversation,
        family,
        host: hostUser
          ? {
              id: String(hostUser.id),
              name: hostDisplayName,
              avatar_url: hostAvatarUrl,
              city: hostUser.city ?? hostProfile?.city ?? null,
              state: hostUser.state ?? hostProfile?.state ?? null,
            }
          : hostProfile
            ? {
                id: String(hostProfile.user_id ?? hostProfile.id),
                name: hostDisplayName,
                avatar_url: hostAvatarUrl,
                city: hostProfile.city ?? null,
                state: hostProfile.state ?? null,
              }
            : null,
        host_display_name: hostDisplayName,
        host_avatar_url: hostAvatarUrl,
        host_location_url: isGuestNetworkConversation ? null : locationUrl,
        host_location_label: isGuestNetworkConversation ? "Famlo guest network" : propertyLocation || propertyName,
        property_name: propertyName,
        property_location: isGuestNetworkConversation ? null : propertyLocation,
        conversation_scope: isGuestNetworkConversation ? "guest_network" : "booking",
      };
    });

    console.info("[guest.conversations] load:success", {
      userId: authUser.id,
      count: payload.length,
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[guest.conversations] load:error", { requestedUserId, error });
    return NextResponse.json({ error: "Failed to load conversations." }, { status: 500 });
  }
}
