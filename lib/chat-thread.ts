import type { SupabaseClient } from "@supabase/supabase-js";

type ConversationRow = {
  id: string;
  booking_id: string | null;
  guest_id: string | null;
  host_user_id: string | null;
};

type BookingV2Row = {
  id: string;
  conversation_id: string | null;
  legacy_booking_id: string | null;
  user_id: string;
  host_id: string | null;
};

type HostRow = {
  user_id: string | null;
  legacy_family_id: string | null;
};

type LegacyBookingRow = {
  id: string;
  conversation_id: string | null;
  user_id: string | null;
  family_id: string | null;
};

type UniqueRef = string | null | undefined;

export type MessageThreadResolution = {
  conversationId: string | null;
  bookingId: string | null;
  legacyBookingId: string | null;
  guestId: string | null;
  hostUserId: string | null;
  relatedConversationIds: string[];
};

function uniqueStrings(values: UniqueRef[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

async function fetchConversationByReference(
  supabase: SupabaseClient,
  referenceId: string
): Promise<ConversationRow | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id,booking_id,guest_id,host_user_id")
    .or(`id.eq.${referenceId},booking_id.eq.${referenceId}`)
    .limit(1);

  if (error) {
    console.error("[chat-thread] conversation lookup failed", error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : null;
  return row ? (row as ConversationRow) : null;
}

async function fetchBookingV2ByReference(
  supabase: SupabaseClient,
  referenceId: string
): Promise<BookingV2Row | null> {
  const { data, error } = await supabase
    .from("bookings_v2")
    .select("id,conversation_id,legacy_booking_id,user_id,host_id")
    .or(`id.eq.${referenceId},legacy_booking_id.eq.${referenceId}`)
    .limit(1);

  if (error) {
    console.error("[chat-thread] booking_v2 lookup failed", error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : null;
  return row ? (row as BookingV2Row) : null;
}

async function fetchLegacyBookingByReference(
  supabase: SupabaseClient,
  referenceId: string
): Promise<LegacyBookingRow | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("id,conversation_id,user_id,family_id")
    .or(`id.eq.${referenceId},conversation_id.eq.${referenceId}`)
    .limit(1);

  if (error) {
    console.error("[chat-thread] legacy booking lookup failed", error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : null;
  return row ? (row as LegacyBookingRow) : null;
}

async function findConversationForBooking(
  supabase: SupabaseClient,
  input: {
    bookingId: string | null;
    guestId: string | null;
    hostUserId: string | null;
    legacyBookingId: string | null;
  }
): Promise<ConversationRow | null> {
  const directCandidates = uniqueStrings([input.bookingId, input.legacyBookingId]);
  for (const candidate of directCandidates) {
    const { data, error } = await supabase
      .from("conversations")
      .select("id,booking_id,guest_id,host_user_id")
      .or(`id.eq.${candidate},booking_id.eq.${candidate}`)
      .limit(1);

    if (error) {
      console.error("[chat-thread] booking conversation lookup failed", error);
      continue;
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (row) return row as ConversationRow;
  }

  const parts: string[] = [];
  if (input.bookingId) parts.push(`booking_id.eq.${input.bookingId}`);
  if (input.legacyBookingId) parts.push(`booking_id.eq.${input.legacyBookingId}`);
  if (input.guestId) parts.push(`guest_id.eq.${input.guestId}`);
  if (input.hostUserId) parts.push(`host_user_id.eq.${input.hostUserId}`);

  if (parts.length < 2) return null;

  const { data, error } = await supabase
    .from("conversations")
    .select("id,booking_id,guest_id,host_user_id")
    .or(parts.join(","))
    .limit(1);

  if (error) {
    console.error("[chat-thread] participant conversation lookup failed", error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : null;
  return row ? (row as ConversationRow) : null;
}

async function resolveHostUserId(
  supabase: SupabaseClient,
  hostProfileId: string | null
): Promise<string | null> {
  if (!hostProfileId) return null;

  const { data, error } = await supabase.from("hosts").select("user_id,legacy_family_id").eq("id", hostProfileId).maybeSingle();
  if (error) {
    console.error("[chat-thread] host lookup failed", error);
    return null;
  }

  return typeof (data as HostRow | null)?.user_id === "string" ? (data as HostRow).user_id : null;
}

async function resolveFamilyIdForHost(
  supabase: SupabaseClient,
  hostProfileId: string | null
): Promise<string | null> {
  if (!hostProfileId) return null;

  const { data, error } = await supabase.from("hosts").select("legacy_family_id").eq("id", hostProfileId).maybeSingle();
  if (error) {
    console.error("[chat-thread] family lookup failed", error);
    return null;
  }

  return typeof (data as HostRow | null)?.legacy_family_id === "string"
    ? (data as HostRow).legacy_family_id
    : null;
}

async function resolveUserIdForFamily(
  supabase: SupabaseClient,
  familyId: string | null
): Promise<string | null> {
  if (!familyId) return null;

  const { data, error } = await supabase.from("families").select("user_id").eq("id", familyId).maybeSingle();
  if (error) {
    console.error("[chat-thread] family user lookup failed", error);
    return null;
  }

  return typeof data?.user_id === "string" ? data.user_id : null;
}

async function backfillConversationParticipants(
  supabase: SupabaseClient,
  conversationId: string,
  data: {
    guestId: string | null;
    hostUserId: string | null;
    hostProfileId: string | null;
    familyId: string | null;
    bookingId: string | null;
  }
): Promise<void> {
  const patch: Record<string, string> = {};
  if (data.guestId) patch.guest_id = data.guestId;
  if (data.hostUserId) patch.host_user_id = data.hostUserId;
  if (data.hostProfileId) patch.host_id = data.hostProfileId;
  if (data.familyId) patch.family_id = data.familyId;
  if (data.bookingId) patch.booking_id = data.bookingId;

  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("conversations").update(patch as never).eq("id", conversationId);
  if (error) {
    console.error("[chat-thread] conversation backfill failed", error);
  }
}

async function createConversationForBooking(
  supabase: SupabaseClient,
  booking: BookingV2Row,
  referenceId: string
): Promise<ConversationRow | null> {
  const hostUserId = await resolveHostUserId(supabase, booking.host_id);
  const familyId = await resolveFamilyIdForHost(supabase, booking.host_id);
  const bookingId = booking.legacy_booking_id ?? booking.id;
  const now = new Date().toISOString();

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      booking_id: bookingId,
      family_id: familyId,
      guest_id: booking.user_id,
      host_id: booking.host_id,
      host_user_id: hostUserId,
      guest_unread: 0,
      host_unread: 0,
      last_message: null,
      last_message_at: now,
      created_at: now,
    } as never)
    .select("id,booking_id,guest_id,host_user_id")
    .single();

  if (error || !created) {
    console.error("[chat-thread] conversation create failed", error);
    return null;
  }

  const conversation = created as ConversationRow;

  const threadIds = uniqueStrings([referenceId, booking.id, booking.legacy_booking_id, bookingId]);
  if (threadIds.length > 0) {
    const { error: migrateError } = await supabase
      .from("messages")
      .update({ conversation_id: conversation.id } as never)
      .in("conversation_id", threadIds as never);

    if (migrateError) {
      console.error("[chat-thread] legacy message migration failed", migrateError);
    }
  }

  const { error: patchError } = await supabase
    .from("bookings_v2")
    .update({ conversation_id: conversation.id } as never)
    .eq("id", booking.id);

  if (patchError) {
    console.error("[chat-thread] booking patch failed", patchError);
  }

  if (booking.legacy_booking_id) {
    const { error: legacyPatchError } = await supabase
      .from("bookings")
      .update({ conversation_id: conversation.id } as never)
      .eq("id", booking.legacy_booking_id);

    if (legacyPatchError) {
      console.error("[chat-thread] legacy booking patch failed", legacyPatchError);
    }
  }

  await backfillConversationParticipants(supabase, conversation.id, {
    guestId: booking.user_id,
    hostUserId,
    hostProfileId: booking.host_id,
    familyId,
    bookingId,
  });

  return conversation;
}

export async function resolveMessageThread(
  supabase: SupabaseClient,
  referenceId: string,
  options?: { createIfMissing?: boolean }
): Promise<MessageThreadResolution | null> {
  const cleanReference = referenceId.trim();
  if (!cleanReference) return null;

  let conversation = await fetchConversationByReference(supabase, cleanReference);
  let bookingV2: BookingV2Row | null = null;
  let legacyBooking: LegacyBookingRow | null = null;

  if (!conversation) {
    bookingV2 = await fetchBookingV2ByReference(supabase, cleanReference);
    if (bookingV2?.conversation_id) {
      conversation = await fetchConversationByReference(supabase, bookingV2.conversation_id);
    }

    if (!conversation && bookingV2) {
      conversation = await fetchConversationByReference(
        supabase,
        bookingV2.legacy_booking_id ?? bookingV2.id
      );
    }

    if (!conversation && bookingV2) {
      conversation = await findConversationForBooking(supabase, {
        bookingId: bookingV2.id,
        guestId: bookingV2.user_id,
        hostUserId: bookingV2.host_id ? await resolveHostUserId(supabase, bookingV2.host_id) : null,
        legacyBookingId: bookingV2.legacy_booking_id,
      });
    }

    if (!conversation && bookingV2 && options?.createIfMissing) {
      conversation = await createConversationForBooking(supabase, bookingV2, cleanReference);
    }
  }

  if (!conversation) {
    legacyBooking = await fetchLegacyBookingByReference(supabase, cleanReference);
    if (legacyBooking?.conversation_id) {
      conversation = await fetchConversationByReference(supabase, legacyBooking.conversation_id);
    }

    if (!conversation && legacyBooking) {
      conversation = await fetchConversationByReference(supabase, legacyBooking.id);
    }

    if (!conversation && legacyBooking) {
      conversation = await findConversationForBooking(supabase, {
        bookingId: legacyBooking.id,
        guestId: legacyBooking.user_id,
        hostUserId: legacyBooking.family_id ? await resolveUserIdForFamily(supabase, legacyBooking.family_id) : null,
        legacyBookingId: legacyBooking.id,
      });
    }
  }

  if (!conversation && legacyBooking && options?.createIfMissing) {
    const familyLookup = legacyBooking.family_id
      ? await supabase.from("families").select("user_id").eq("id", legacyBooking.family_id).maybeSingle()
      : { data: null, error: null };
    const hostUserId = typeof familyLookup.data?.user_id === "string" ? familyLookup.data.user_id : null;
    const now = new Date().toISOString();
    const { data: created, error } = await supabase
      .from("conversations")
      .insert({
        booking_id: legacyBooking.id,
        family_id: legacyBooking.family_id,
        guest_id: legacyBooking.user_id,
        host_user_id: hostUserId,
        guest_unread: 0,
        host_unread: 0,
        last_message: null,
        last_message_at: now,
        created_at: now,
      } as never)
      .select("id,booking_id,guest_id,host_user_id")
      .single();

    if (!error && created) {
      conversation = created as ConversationRow;
      const { error: patchError } = await supabase
        .from("bookings")
        .update({ conversation_id: conversation.id } as never)
        .eq("id", legacyBooking.id);

      if (patchError) {
        console.error("[chat-thread] legacy booking patch failed", patchError);
      }
    }
  }

  if (!conversation) return null;

  if (!bookingV2) {
    bookingV2 = await fetchBookingV2ByReference(supabase, cleanReference);
    if (!bookingV2 && conversation.booking_id) {
      bookingV2 = await fetchBookingV2ByReference(supabase, conversation.booking_id);
    }
  }

  if (!legacyBooking) {
    legacyBooking = await fetchLegacyBookingByReference(supabase, cleanReference);
    if (!legacyBooking && conversation.booking_id) {
      legacyBooking = await fetchLegacyBookingByReference(supabase, conversation.booking_id);
    }
  }

  const bookingV2HostUserId = bookingV2?.host_id ? await resolveHostUserId(supabase, bookingV2.host_id) : null;
  const bookingV2FamilyId = bookingV2?.host_id ? await resolveFamilyIdForHost(supabase, bookingV2.host_id) : null;
  const legacyHostUserId = legacyBooking?.family_id ? await resolveUserIdForFamily(supabase, legacyBooking.family_id) : null;
  const resolvedGuestId = conversation.guest_id ?? bookingV2?.user_id ?? legacyBooking?.user_id ?? null;
  const resolvedHostUserId = conversation.host_user_id ?? bookingV2HostUserId ?? legacyHostUserId ?? null;
  const resolvedFamilyId = legacyBooking?.family_id ?? bookingV2FamilyId ?? null;
  const resolvedBookingId = conversation.booking_id ?? bookingV2?.legacy_booking_id ?? bookingV2?.id ?? legacyBooking?.id ?? null;

  const currentFamilyId = (conversation as ConversationRow & { family_id?: string | null }).family_id ?? null;
  if (
    resolvedGuestId !== conversation.guest_id ||
    resolvedHostUserId !== conversation.host_user_id ||
    resolvedFamilyId !== currentFamilyId ||
    resolvedBookingId !== conversation.booking_id
  ) {
    await backfillConversationParticipants(supabase, conversation.id, {
      guestId: resolvedGuestId,
      hostUserId: resolvedHostUserId,
      hostProfileId: bookingV2?.host_id ?? null,
      familyId: resolvedFamilyId,
      bookingId: resolvedBookingId,
    });
  }

  const relatedConversationIds = uniqueStrings([
    conversation.id,
    cleanReference,
    conversation.booking_id,
    bookingV2?.id,
    bookingV2?.legacy_booking_id,
    bookingV2?.conversation_id,
    legacyBooking?.id,
    legacyBooking?.conversation_id,
  ]);

  return {
    conversationId: conversation.id,
    bookingId: bookingV2?.id ?? legacyBooking?.id ?? conversation.booking_id ?? null,
    legacyBookingId: conversation.booking_id ?? bookingV2?.legacy_booking_id ?? legacyBooking?.id ?? null,
    guestId: resolvedGuestId,
    hostUserId: resolvedHostUserId,
    relatedConversationIds,
  };
}
