import { createAdminSupabaseClient } from "@/lib/supabase";

export type FamilyStory = {
  id: string;
  familyId: string;
  authorName: string;
  fromCity: string;
  storyText: string;
  imageUrls: string[];
  rating: number | null;
  createdAt: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isMissingSchemaError(message: string): boolean {
  return (
    message.includes("Could not find the table") ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function normalizeImageUrls(value: unknown, fallbackUrl?: unknown): string[] {
  const urls = Array.isArray(value)
    ? value.filter((url: unknown): url is string => typeof url === "string" && url.trim().length > 0)
    : [];
  if (urls.length > 0) return urls;
  return typeof fallbackUrl === "string" && fallbackUrl.trim().length > 0 ? [fallbackUrl.trim()] : [];
}

async function loadBookingIdsForScope(scope: { hostId: string | null; familyId: string | null }): Promise<string[]> {
  const bookingIds = new Set<string>();
  const supabase = createAdminSupabaseClient();

  if (scope.hostId) {
    const { data: v2Bookings, error: v2Error } = await supabase
      .from("bookings_v2")
      .select("id,legacy_booking_id")
      .eq("host_id", scope.hostId);

    if (v2Error && !isMissingSchemaError(v2Error.message)) {
      console.error("Failed to load bookings_v2 ids for story scope:", v2Error);
    } else {
      for (const row of (v2Bookings ?? []) as Record<string, unknown>[]) {
        const bookingId = asString(row.id);
        const legacyBookingId = asString(row.legacy_booking_id);
        if (bookingId) bookingIds.add(bookingId);
        if (legacyBookingId) bookingIds.add(legacyBookingId);
      }
    }
  }

  if (scope.familyId) {
    const { data: legacyBookings, error: legacyError } = await supabase
      .from("bookings")
      .select("id")
      .eq("family_id", scope.familyId);

    if (legacyError && !isMissingSchemaError(legacyError.message)) {
      console.error("Failed to load legacy booking ids for story scope:", legacyError);
    } else {
      for (const row of (legacyBookings ?? []) as Record<string, unknown>[]) {
        const bookingId = asString(row.id);
        if (bookingId) bookingIds.add(bookingId);
      }
    }
  }

  return [...bookingIds];
}

async function loadStoryRowsForScope(
  routeId: string,
  limit: number,
  options?: { includeImageColumns?: boolean }
): Promise<{ resolvedFamilyId: string | null; resolvedHostId: string | null; resolvedHostUserId: string | null; rows: Record<string, unknown>[] }> {
  const resolved = await resolveRouteIdToHostId(routeId);
  const resolvedHostId = resolved.hostId;
  const resolvedFamilyId = resolved.familyId;
  const resolvedHostUserId = resolved.hostUserId;
  const supabase = createAdminSupabaseClient();
  const bookingIds = await loadBookingIdsForScope({ hostId: resolvedHostId, familyId: resolvedFamilyId });
  const selectColumns = "id,host_id,booking_id,author_user_id,author_name,city,body,rating,created_at,cover_image_url";
  const merged = new Map<string, Record<string, unknown>>();

  const pushRows = (rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      const id = asString(row.id);
      if (!id || merged.has(id)) continue;
      merged.set(id, row);
    }
  };

  if (resolvedHostId) {
    const hostStoriesResult = await supabase
      .from("stories_v2")
      .select(selectColumns)
      .eq("is_published", true)
      .eq("host_id", resolvedHostId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (hostStoriesResult.error && !isMissingSchemaError(hostStoriesResult.error.message)) {
      console.error("Failed to load host stories from stories_v2:", hostStoriesResult.error);
    } else {
      pushRows((hostStoriesResult.data ?? []) as unknown as Record<string, unknown>[]);
    }
  }

  if (resolvedHostUserId) {
    const authorStoriesResult = await supabase
      .from("stories_v2")
      .select(selectColumns)
      .eq("is_published", true)
      .eq("author_user_id", resolvedHostUserId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (authorStoriesResult.error && !isMissingSchemaError(authorStoriesResult.error.message)) {
      console.error("Failed to load author-linked stories from stories_v2:", authorStoriesResult.error);
    } else {
      pushRows((authorStoriesResult.data ?? []) as unknown as Record<string, unknown>[]);
    }
  }

  if (bookingIds.length > 0) {
    const bookingStoriesResult = await supabase
      .from("stories_v2")
      .select(selectColumns)
      .eq("is_published", true)
      .in("booking_id", bookingIds)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (bookingStoriesResult.error && !isMissingSchemaError(bookingStoriesResult.error.message)) {
      console.error("Failed to load booking-linked stories from stories_v2:", bookingStoriesResult.error);
    } else {
      pushRows((bookingStoriesResult.data ?? []) as unknown as Record<string, unknown>[]);
    }
  }

  const rows = [...merged.values()].sort((left, right) => {
    const leftTime = new Date(asString(left.created_at) || 0).getTime();
    const rightTime = new Date(asString(right.created_at) || 0).getTime();
    return rightTime - leftTime;
  });

  console.info("[home-social-proof] loaded story rows", {
    routeId,
    resolvedHostId,
    resolvedFamilyId,
    resolvedHostUserId,
    bookingCount: bookingIds.length,
    rowCount: rows.length,
  });

  return { resolvedFamilyId, resolvedHostId, resolvedHostUserId, rows: rows.slice(0, limit) };
}

async function mapLegacyFamilyIdsToHostIds(
  familyIds: string[]
): Promise<{ hostIds: string[]; familyByHostId: Map<string, string> }> {
  const familyByHostId = new Map<string, string>();
  if (familyIds.length === 0) return { hostIds: [], familyByHostId };

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("hosts")
    .select("id,legacy_family_id")
    .in("legacy_family_id", familyIds);

  if (error) {
    console.error("Failed to map legacy family ids to hosts:", error);
    return { hostIds: [], familyByHostId };
  }

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const hostId = asString(row.id);
    const familyId = asString(row.legacy_family_id);
    if (!hostId || !familyId) continue;
    familyByHostId.set(hostId, familyId);
  }

  return { hostIds: [...familyByHostId.keys()], familyByHostId };
}

async function resolveRouteIdToHostId(routeId: string): Promise<{ hostId: string | null; familyId: string | null; hostUserId: string | null }> {
  if (!routeId) return { hostId: null, familyId: null, hostUserId: null };

  const supabase = createAdminSupabaseClient();
  const { data: hostById, error: hostError } = await supabase
    .from("hosts")
    .select("id,legacy_family_id,user_id")
    .eq("id", routeId)
    .maybeSingle();

  if (hostError && !isMissingSchemaError(hostError.message)) {
    console.error("Failed to resolve host from route id:", hostError);
  }

  if (hostById) {
    return {
      hostId: asString(hostById.id),
      familyId: asString(hostById.legacy_family_id),
      hostUserId: asString(hostById.user_id),
    };
  }

  const { data: hostByFamily, error: familyLookupError } = await supabase
    .from("hosts")
    .select("id,legacy_family_id,user_id")
    .eq("legacy_family_id", routeId)
    .maybeSingle();

  if (familyLookupError && !isMissingSchemaError(familyLookupError.message)) {
    console.error("Failed to resolve host from legacy family id:", familyLookupError);
  }

  return {
    hostId: asString(hostByFamily?.id),
    familyId: asString(hostByFamily?.legacy_family_id) ?? routeId,
    hostUserId: asString(hostByFamily?.user_id),
  };
}

export async function loadFamilyStoryCounts(familyIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (familyIds.length === 0) return counts;

  for (const routeId of familyIds) {
    const { resolvedFamilyId, rows } = await loadStoryRowsForScope(routeId, Number.MAX_SAFE_INTEGER);
    const key = resolvedFamilyId ?? routeId;
    counts.set(key, rows.length);
  }

  return counts;
}

export async function loadFamilyStories(familyId: string, limit = 4): Promise<FamilyStory[]> {
  if (!familyId) return [];

  const { resolvedFamilyId, rows } = await loadStoryRowsForScope(familyId, limit);
  if (rows.length > 0) {
    return rows.map((row) => ({
      id: asString(row.id),
      familyId: resolvedFamilyId ?? asString(row.host_id) ?? familyId,
      authorName: asString(row.author_name) || "Famlo guest",
      fromCity: asString(row.city) || "India",
      storyText: asString(row.body),
      imageUrls: normalizeImageUrls(undefined, row.cover_image_url),
      rating: asNumber(row.rating),
      createdAt: asString(row.created_at),
    }));
  }
  return [];
}

export async function loadLikedGuestCounts(familyIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (familyIds.length === 0) return counts;

  for (const routeId of familyIds) {
    const resolved = await resolveRouteIdToHostId(routeId);
    const bookingIds = await loadBookingIdsForScope({ hostId: resolved.hostId, familyId: resolved.familyId });
    const supabase = createAdminSupabaseClient();
    const likedStoryIds = new Set<string>();

    if (resolved.hostId) {
      const { data: v2Data, error: v2Error } = await supabase
        .from("stories_v2")
        .select("id")
        .eq("liked_host", true)
        .eq("host_id", resolved.hostId);

      if (v2Error && !isMissingSchemaError(v2Error.message)) {
        console.error("Failed to load liked guest counts from stories_v2:", v2Error);
      } else {
        for (const row of (v2Data ?? []) as Record<string, unknown>[]) {
          const storyId = asString(row.id);
          if (storyId) likedStoryIds.add(storyId);
        }
      }
    }

    if (resolved.hostUserId) {
      const { data: authorLikedStories, error: authorLikedStoriesError } = await supabase
        .from("stories_v2")
        .select("id")
        .eq("liked_host", true)
        .eq("author_user_id", resolved.hostUserId);

      if (authorLikedStoriesError && !isMissingSchemaError(authorLikedStoriesError.message)) {
        console.error("Failed to load liked guest counts from author-linked stories:", authorLikedStoriesError);
      } else {
        for (const row of (authorLikedStories ?? []) as Record<string, unknown>[]) {
          const storyId = asString(row.id);
          if (storyId) likedStoryIds.add(storyId);
        }
      }
    }

    if (bookingIds.length > 0) {
      // no-op: live schema does not expose a booking-level like flag
    }

    if (likedStoryIds.size > 0) {
      counts.set(routeId, likedStoryIds.size);
      console.info("[home-social-proof] liked guest count", {
        routeId,
        resolvedHostId: resolved.hostId,
        resolvedHostUserId: resolved.hostUserId,
        likedCount: likedStoryIds.size,
      });
      continue;
    }
    console.info("[home-social-proof] liked guest count", {
      routeId,
      resolvedHostId: resolved.hostId,
      resolvedHostUserId: resolved.hostUserId,
      likedCount: 0,
    });
    counts.set(routeId, 0);
  }

  return counts;
}
