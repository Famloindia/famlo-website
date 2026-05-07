import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchChannexBookingFeed,
  fetchChannexChannelsForProperty,
  fetchChannexPropertyById,
  type ChannexEnvironment,
} from "@/lib/channel-providers/channex/client";

type JsonRecord = Record<string, unknown>;

type BookingFeedSummary = {
  externalBookingId: string | null;
  revisionId: string | null;
  status: string | null;
  otaName: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  guestName: string | null;
  externalRoomTypeId: string | null;
  externalRatePlanId: string | null;
  amount: string | null;
  currency: string | null;
  paymentCollect: string | null;
  paymentType: string | null;
  unmatchedRoom: boolean;
  insertedAt: string | null;
  importStatus: string;
  ackStatus: string;
};

type UnmatchedRevisionPreview = {
  externalBookingId: string | null;
  revisionId: string | null;
  otaName: string | null;
  status: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  reason: "property_id_missing" | "property_id_mismatch" | "room_type_id_missing" | "unsupported_shape";
  discoveredPropertyIds: string[];
};

type PreparedFeedRow = {
  family_id: string;
  provider_code: "channex";
  external_property_id: string;
  external_booking_id: string | null;
  external_revision_id: string;
  external_room_type_id: string | null;
  external_rate_plan_id: string | null;
  ota_name: string | null;
  status: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  guest_name: string | null;
  amount: string | null;
  currency: string | null;
  payment_collect: string | null;
  raw_payload: JsonRecord;
  import_status: string;
  ack_status: string;
  updated_at: string;
  source: string;
};

type RevisionRow = {
  id: string;
  importStatus: string;
  ackStatus: string;
  status: string | null;
  source: string;
  externalBookingId: string | null;
  externalRevisionId: string | null;
};

export type ChannexFeedHealthSnapshot = {
  environment: ChannexEnvironment;
  externalPropertyId: string;
  lastPollAt: string;
  lastSuccessfulPollAt: string | null;
  lastFeedSeenAt: string;
  lastError: string | null;
  lastErrorAt: string | null;
  consecutiveFailures: number;
  totalFetched: number;
  matchedRevisionCount: number;
  unmatchedRevisionCount: number;
  storedRevisionCount: number;
  insertedRevisionCount: number;
  updatedRevisionCount: number;
  unmatchedRoomCount: number;
  accChannelsCount: number | null;
  channelAttached: boolean;
  channelActive: boolean;
  activeChannelId: string | null;
  activeChannelTitle: string | null;
  hotelId: string | null;
  attachedChannelIds: string[];
  unackedRevisionsCount: number;
  failedImportCount: number;
  pendingApplyCount: number;
  lastPollAction: string;
};

export type PollChannexBookingFeedResult = {
  ok: boolean;
  status: "completed" | "failed";
  configured: boolean;
  environment: ChannexEnvironment;
  message: string;
  totalFetched: number;
  revisionsFound: number;
  storedCount: number;
  insertedCount: number;
  updatedCount: number;
  unmatchedCount: number;
  unmatchedRoomCount: number;
  externalPropertyId: string;
  discoveredPropertyIds: string[];
  unmatchedRevisions: UnmatchedRevisionPreview[];
  latestSafeBookingIds: string[];
  lastCheckedAt: string;
  revisions: BookingFeedSummary[];
  requiresAcknowledgement: true;
  acknowledged: false;
  channelHealth: ChannexFeedHealthSnapshot;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asObject(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumericStringOrNull(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
  }
  return null;
}

function getAttributes(value: Record<string, unknown>): Record<string, unknown> | null {
  return asObject(value.attributes);
}

function getRelationships(value: Record<string, unknown>): Record<string, unknown> | null {
  return asObject(value.relationships);
}

function collectUniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim().length > 0)).map((value) => value.trim()))];
}

function summarizeGuestName(customer: unknown): string | null {
  const record = asObject(customer);
  if (!record) return null;
  const name = asStringOrNull(record.name);
  const surname = asStringOrNull(record.surname);
  const combined = [name, surname].filter(Boolean).join(" ");
  return combined || null;
}

function extractDiscoveredPropertyIds(revision: Record<string, unknown>): string[] {
  const attributes = getAttributes(revision);
  const relationships = getRelationships(revision);
  const relationshipProperty = asObject(relationships?.property);
  const relationshipPropertyData = asObject(relationshipProperty?.data);
  const booking = asObject(attributes?.booking);
  const bookingProperty = asObject(booking?.property);
  const rooms = asArray(attributes?.rooms ?? revision.rooms);

  const roomPropertyIds = rooms
    .map((room) => asObject(room))
    .map((room) => asStringOrNull(room?.property_id))
    .filter(Boolean);

  return collectUniqueStrings([
    asStringOrNull(revision.property_id),
    asStringOrNull(attributes?.property_id),
    asStringOrNull(booking?.property_id),
    asStringOrNull(bookingProperty?.id),
    asStringOrNull(relationshipPropertyData?.id),
    ...roomPropertyIds,
  ]);
}

function extractFirstRoom(revision: Record<string, unknown>): Record<string, unknown> | null {
  const attributes = getAttributes(revision);
  const rooms = asArray(attributes?.rooms ?? revision.rooms);
  const first = rooms.find((room) => room && typeof room === "object" && !Array.isArray(room));
  return asObject(first);
}

function extractExternalBookingId(revision: Record<string, unknown>): string | null {
  const attributes = getAttributes(revision);
  return (
    asStringOrNull(revision.unique_id) ??
    asStringOrNull(attributes?.unique_id) ??
    asStringOrNull(revision.booking_id) ??
    asStringOrNull(attributes?.booking_id) ??
    asStringOrNull(revision.ota_reservation_code) ??
    asStringOrNull(attributes?.ota_reservation_code)
  );
}

function extractRevisionId(revision: Record<string, unknown>): string | null {
  return asStringOrNull(revision.id);
}

function extractStatus(revision: Record<string, unknown>): string | null {
  const attributes = getAttributes(revision);
  return asStringOrNull(revision.status) ?? asStringOrNull(attributes?.status);
}

function extractOtaName(revision: Record<string, unknown>): string | null {
  const attributes = getAttributes(revision);
  return asStringOrNull(revision.ota_name) ?? asStringOrNull(attributes?.ota_name);
}

function summarizeRevision(
  revision: Record<string, unknown>,
  mappedRoomTypeIds: Set<string>
): BookingFeedSummary {
  const attributes = getAttributes(revision);
  const firstRoom = extractFirstRoom(revision);
  const externalRoomTypeId = asStringOrNull(firstRoom?.room_type_id);
  const externalRatePlanId = asStringOrNull(firstRoom?.rate_plan_id);

  return {
    externalBookingId: extractExternalBookingId(revision),
    revisionId: extractRevisionId(revision),
    status: extractStatus(revision),
    otaName: extractOtaName(revision),
    arrivalDate: asStringOrNull(revision.arrival_date) ?? asStringOrNull(attributes?.arrival_date) ?? asStringOrNull(firstRoom?.checkin_date),
    departureDate: asStringOrNull(revision.departure_date) ?? asStringOrNull(attributes?.departure_date) ?? asStringOrNull(firstRoom?.checkout_date),
    guestName: summarizeGuestName(revision.customer ?? attributes?.customer),
    externalRoomTypeId,
    externalRatePlanId,
    amount: asStringOrNull(revision.amount) ?? asStringOrNull(attributes?.amount) ?? asStringOrNull(firstRoom?.amount),
    currency: asStringOrNull(revision.currency) ?? asStringOrNull(attributes?.currency),
    paymentCollect: asStringOrNull(revision.payment_collect) ?? asStringOrNull(attributes?.payment_collect),
    paymentType: asStringOrNull(revision.payment_type) ?? asStringOrNull(attributes?.payment_type),
    unmatchedRoom: externalRoomTypeId ? !mappedRoomTypeIds.has(externalRoomTypeId) : true,
    insertedAt: asStringOrNull(revision.inserted_at) ?? asStringOrNull(attributes?.inserted_at),
    importStatus: "preview",
    ackStatus: "not_acknowledged",
  };
}

function classifyRevisionForPropertyMatch(
  revision: Record<string, unknown>,
  expectedPropertyId: string
): {
  matched: boolean;
  reason: UnmatchedRevisionPreview["reason"] | null;
  discoveredPropertyIds: string[];
  hasRoomTypeId: boolean;
} {
  const discoveredPropertyIds = extractDiscoveredPropertyIds(revision);
  const firstRoom = extractFirstRoom(revision);
  const hasRoomTypeId = Boolean(asStringOrNull(firstRoom?.room_type_id));
  const hasAnyUsefulShape =
    Boolean(extractRevisionId(revision)) ||
    Boolean(extractExternalBookingId(revision)) ||
    discoveredPropertyIds.length > 0;

  if (!hasAnyUsefulShape) {
    return { matched: false, reason: "unsupported_shape", discoveredPropertyIds, hasRoomTypeId };
  }
  if (discoveredPropertyIds.length === 0) {
    return { matched: false, reason: "property_id_missing", discoveredPropertyIds, hasRoomTypeId };
  }
  if (!discoveredPropertyIds.includes(expectedPropertyId)) {
    return { matched: false, reason: "property_id_mismatch", discoveredPropertyIds, hasRoomTypeId };
  }
  if (!hasRoomTypeId) {
    return { matched: false, reason: "room_type_id_missing", discoveredPropertyIds, hasRoomTypeId };
  }
  return { matched: true, reason: null, discoveredPropertyIds, hasRoomTypeId };
}

function mergeRevisionPayload(
  existingPayload: unknown,
  latestRevision: Record<string, unknown>,
  observedAt: string
): Record<string, unknown> {
  const existingRecord = asObject(existingPayload) ?? {};
  return {
    ...existingRecord,
    ...latestRevision,
    last_feed_seen_at: observedAt,
  };
}

async function storeMatchedFeedRevisions(input: {
  supabase: SupabaseClient;
  familyId: string;
  externalPropertyId: string;
  matchedRevisions: Array<Record<string, unknown>>;
  normalizedRevisions: BookingFeedSummary[];
}): Promise<{
  insertedCount: number;
  updatedCount: number;
  storedCount: number;
}> {
  const observedAt = new Date().toISOString();
  const dedupedRows = new Map<string, PreparedFeedRow>();

  input.matchedRevisions.forEach((revision, index) => {
    const summary = input.normalizedRevisions[index];
    const revisionId = summary.revisionId;
    if (!revisionId) return;

    dedupedRows.set(revisionId, {
      family_id: input.familyId,
      provider_code: "channex",
      external_property_id: input.externalPropertyId,
      external_booking_id: summary.externalBookingId,
      external_revision_id: revisionId,
      external_room_type_id: summary.externalRoomTypeId,
      external_rate_plan_id: summary.externalRatePlanId,
      ota_name: summary.otaName,
      status: summary.status,
      arrival_date: summary.arrivalDate,
      departure_date: summary.departureDate,
      guest_name: summary.guestName,
      amount: asNumericStringOrNull(summary.amount),
      currency: summary.currency,
      payment_collect: summary.paymentCollect,
      raw_payload: mergeRevisionPayload(null, revision, observedAt),
      import_status: "preview",
      ack_status: "not_acknowledged",
      updated_at: observedAt,
      source: "booking_revision_feed",
    });
  });

  const revisionIds = [...dedupedRows.keys()];
  if (revisionIds.length === 0) {
    return { insertedCount: 0, updatedCount: 0, storedCount: 0 };
  }

  const externalBookingIds = [...new Set(
    [...dedupedRows.values()]
      .map((row) => asStringOrNull(row.external_booking_id))
      .filter((value): value is string => Boolean(value))
  )];

  const [existingByRevisionResult, existingByBookingResult] = await Promise.all([
    input.supabase
      .from("channel_booking_revisions")
      .select("id,external_booking_id,external_revision_id,import_status,ack_status,linked_booking_id,raw_payload,source")
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex")
      .eq("source", "booking_revision_feed")
      .in("external_revision_id", revisionIds),
    externalBookingIds.length > 0
      ? input.supabase
          .from("channel_booking_revisions")
          .select("id,external_booking_id,external_revision_id,import_status,ack_status,linked_booking_id,raw_payload,source")
          .eq("family_id", input.familyId)
          .eq("provider_code", "channex")
          .eq("source", "booking_revision_feed")
          .in("external_booking_id", externalBookingIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
  ]);

  if (existingByRevisionResult.error) throw existingByRevisionResult.error;
  if (existingByBookingResult.error) throw existingByBookingResult.error;

  const existingRows = [
    ...((existingByRevisionResult.data ?? []) as Array<Record<string, unknown>>),
    ...((existingByBookingResult.data ?? []) as Array<Record<string, unknown>>),
  ];

  const existingByRevisionId = new Map(
    existingRows
      .map((row) => {
        const revisionId = asStringOrNull(row.external_revision_id);
        return revisionId ? [revisionId, row] : null;
      })
      .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry))
  );
  const existingByBookingId = new Map(
    existingRows
      .map((row) => {
        const bookingId = asStringOrNull(row.external_booking_id);
        return bookingId ? [bookingId, row] : null;
      })
      .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry))
  );

  let insertedCount = 0;
  let updatedCount = 0;

  for (const [revisionId, preparedRow] of dedupedRows.entries()) {
    const existingRow =
      existingByRevisionId.get(revisionId) ??
      (preparedRow.external_booking_id ? existingByBookingId.get(preparedRow.external_booking_id) : undefined);

    if (!existingRow?.id) {
      const { error } = await input.supabase.from("channel_booking_revisions").insert(preparedRow as never);
      if (error) throw error;
      insertedCount += 1;
      continue;
    }

    const { error } = await input.supabase
      .from("channel_booking_revisions")
      .update({
        external_property_id: preparedRow.external_property_id,
        external_booking_id: preparedRow.external_booking_id,
        external_revision_id: preparedRow.external_revision_id,
        external_room_type_id: preparedRow.external_room_type_id,
        external_rate_plan_id: preparedRow.external_rate_plan_id,
        ota_name: preparedRow.ota_name,
        status: preparedRow.status,
        arrival_date: preparedRow.arrival_date,
        departure_date: preparedRow.departure_date,
        guest_name: preparedRow.guest_name,
        amount: preparedRow.amount,
        currency: preparedRow.currency,
        payment_collect: preparedRow.payment_collect,
        raw_payload: mergeRevisionPayload(existingRow.raw_payload, preparedRow.raw_payload, observedAt),
        source: asStringOrNull(existingRow.source) ?? preparedRow.source,
        import_status: asStringOrNull(existingRow.import_status) ?? preparedRow.import_status,
        ack_status: asStringOrNull(existingRow.ack_status) ?? preparedRow.ack_status,
        linked_booking_id: asStringOrNull(existingRow.linked_booking_id),
        updated_at: observedAt,
      } as never)
      .eq("id", existingRow.id);

    if (error) throw error;
    updatedCount += 1;
  }

  return { insertedCount, updatedCount, storedCount: revisionIds.length };
}

async function logFeedResult(input: {
  supabase: SupabaseClient;
  familyId: string;
  action: string;
  status: "success" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: input.action,
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[channex-booking-feed-sync] log failed:", error);
    }
  }
}

function parseIsoDate(value: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function buildHealthMetadata(input: {
  previous: JsonRecord | null;
  environment: ChannexEnvironment;
  externalPropertyId: string;
  resultOk: boolean;
  observedAt: string;
  message: string;
  totalFetched: number;
  matchedRevisionCount: number;
  unmatchedRevisionCount: number;
  storedRevisionCount: number;
  insertedRevisionCount: number;
  updatedRevisionCount: number;
  unmatchedRoomCount: number;
  accChannelsCount: number | null;
  channelAttached: boolean;
  channelActive: boolean;
  activeChannelId: string | null;
  activeChannelTitle: string | null;
  hotelId: string | null;
  attachedChannelIds: string[];
  unackedRevisionsCount: number;
  failedImportCount: number;
  pendingApplyCount: number;
  action: string;
}): ChannexFeedHealthSnapshot {
  const previousHealth = asObject(input.previous?.channexFeedHealth);
  const previousSuccess = asStringOrNull(previousHealth?.lastSuccessfulPollAt);
  const previousErrorAt = asStringOrNull(previousHealth?.lastErrorAt);
  const previousFailuresRaw = previousHealth?.consecutiveFailures;
  const previousFailures =
    typeof previousFailuresRaw === "number" && Number.isFinite(previousFailuresRaw)
      ? previousFailuresRaw
      : typeof previousFailuresRaw === "string" && previousFailuresRaw.trim().length > 0
        ? Number(previousFailuresRaw)
        : 0;

  return {
    environment: input.environment,
    externalPropertyId: input.externalPropertyId,
    lastPollAt: input.observedAt,
    lastSuccessfulPollAt: input.resultOk ? input.observedAt : previousSuccess,
    lastFeedSeenAt: input.observedAt,
    lastError: input.resultOk ? null : input.message,
    lastErrorAt: input.resultOk ? previousErrorAt : input.observedAt,
    consecutiveFailures: input.resultOk ? 0 : Math.max(1, previousFailures + 1),
    totalFetched: input.totalFetched,
    matchedRevisionCount: input.matchedRevisionCount,
    unmatchedRevisionCount: input.unmatchedRevisionCount,
    storedRevisionCount: input.storedRevisionCount,
    insertedRevisionCount: input.insertedRevisionCount,
    updatedRevisionCount: input.updatedRevisionCount,
    unmatchedRoomCount: input.unmatchedRoomCount,
    accChannelsCount: input.accChannelsCount,
    channelAttached: input.channelAttached,
    channelActive: input.channelActive,
    activeChannelId: input.activeChannelId,
    activeChannelTitle: input.activeChannelTitle,
    hotelId: input.hotelId,
    attachedChannelIds: input.attachedChannelIds,
    unackedRevisionsCount: input.unackedRevisionsCount,
    failedImportCount: input.failedImportCount,
    pendingApplyCount: input.pendingApplyCount,
    lastPollAction: input.action,
  };
}

export function shouldSkipChannexFeedPoll(metadata: JsonRecord | null, now: Date): {
  skip: boolean;
  reason: "recent_success" | "backoff";
  nextEligibleAt: string | null;
} | null {
  const health = asObject(metadata?.channexFeedHealth);
  if (!health) return null;
  const lastPollAt = asStringOrNull(health.lastPollAt);
  if (!lastPollAt) return null;
  const lastPollTs = parseIsoDate(lastPollAt);
  if (!lastPollTs) return null;

  const nowTs = now.getTime();
  const consecutiveFailuresRaw = health.consecutiveFailures;
  const consecutiveFailures =
    typeof consecutiveFailuresRaw === "number" && Number.isFinite(consecutiveFailuresRaw)
      ? consecutiveFailuresRaw
      : typeof consecutiveFailuresRaw === "string" && consecutiveFailuresRaw.trim().length > 0
        ? Number(consecutiveFailuresRaw)
        : 0;

  if (consecutiveFailures > 0) {
    const backoffMinutes = Math.min(60, 5 * Math.pow(2, Math.max(0, consecutiveFailures - 1)));
    const nextEligibleTs = lastPollTs + backoffMinutes * 60_000;
    if (nowTs < nextEligibleTs) {
      return {
        skip: true,
        reason: "backoff",
        nextEligibleAt: new Date(nextEligibleTs).toISOString(),
      };
    }
    return null;
  }

  const nextEligibleTs = lastPollTs + 5 * 60_000;
  if (nowTs < nextEligibleTs) {
    return {
      skip: true,
      reason: "recent_success",
      nextEligibleAt: new Date(nextEligibleTs).toISOString(),
    };
  }

  return null;
}

export async function pollChannexBookingFeedForFamily(input: {
  supabase: SupabaseClient;
  familyId: string;
  action?: string;
}): Promise<PollChannexBookingFeedResult> {
  const action = input.action ?? "fetch_booking_feed";
  const observedAt = new Date().toISOString();

  const [{ data: propertyRow }, { data: roomMappingRows }] = await Promise.all([
    input.supabase
      .from("channel_properties")
      .select("id,external_property_id,metadata")
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    input.supabase
      .from("channel_room_mappings")
      .select("external_room_type_id")
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex"),
  ]);

  const externalPropertyId = asStringOrNull(propertyRow?.external_property_id);
  if (!externalPropertyId) {
    throw new Error("Create provider property first before polling the Channex booking feed.");
  }

  const result = await fetchChannexBookingFeed();
  const [propertyHealthResult, channelResult] = await Promise.all([
    fetchChannexPropertyById(externalPropertyId),
    fetchChannexChannelsForProperty(externalPropertyId),
  ]);

  const mappedRoomTypeIds = new Set(
    (roomMappingRows ?? [])
      .map((row) => asStringOrNull(row.external_room_type_id))
      .filter((value): value is string => Boolean(value))
  );

  const totalFetched = result.revisions.length;
  const matchedRevisions: Array<Record<string, unknown>> = [];
  const unmatchedPreviews: UnmatchedRevisionPreview[] = [];
  const discoveredPropertyIds = new Set<string>();

  for (const revision of result.revisions as Array<Record<string, unknown>>) {
    const classification = classifyRevisionForPropertyMatch(revision, externalPropertyId);
    classification.discoveredPropertyIds.forEach((id) => discoveredPropertyIds.add(id));
    const summary = summarizeRevision(revision, mappedRoomTypeIds);

    if (classification.matched) {
      matchedRevisions.push(revision);
      continue;
    }

    unmatchedPreviews.push({
      externalBookingId: summary.externalBookingId,
      revisionId: summary.revisionId,
      otaName: summary.otaName,
      status: summary.status,
      arrivalDate: summary.arrivalDate,
      departureDate: summary.departureDate,
      reason: classification.reason ?? "unsupported_shape",
      discoveredPropertyIds: classification.discoveredPropertyIds,
    });
  }

  const normalizedRevisions = matchedRevisions.map((revision) => summarizeRevision(revision, mappedRoomTypeIds));
  const storageResult =
    normalizedRevisions.length > 0
      ? await storeMatchedFeedRevisions({
          supabase: input.supabase,
          familyId: input.familyId,
          externalPropertyId,
          matchedRevisions,
          normalizedRevisions,
        })
      : { insertedCount: 0, updatedCount: 0, storedCount: 0 };

  const [{ data: storedRevisionRows }, { data: allRevisionRows }] = await Promise.all([
    input.supabase
      .from("channel_booking_revisions")
      .select("external_booking_id,external_revision_id,status,ota_name,arrival_date,departure_date,guest_name,external_room_type_id,external_rate_plan_id,amount,currency,payment_collect,import_status,ack_status,updated_at")
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex")
      .order("updated_at", { ascending: false })
      .limit(20),
    input.supabase
      .from("channel_booking_revisions")
      .select("id,source,status,import_status,ack_status,external_booking_id,external_revision_id")
      .eq("family_id", input.familyId)
      .eq("provider_code", "channex"),
  ]);

  const storedRevisions = ((storedRevisionRows ?? []) as Array<Record<string, unknown>>).map((row) => ({
    externalBookingId: asStringOrNull(row.external_booking_id),
    revisionId: asStringOrNull(row.external_revision_id),
    status: asStringOrNull(row.status),
    otaName: asStringOrNull(row.ota_name),
    arrivalDate: asStringOrNull(row.arrival_date),
    departureDate: asStringOrNull(row.departure_date),
    guestName: asStringOrNull(row.guest_name),
    externalRoomTypeId: asStringOrNull(row.external_room_type_id),
    externalRatePlanId: asStringOrNull(row.external_rate_plan_id),
    amount: asNumericStringOrNull(row.amount),
    currency: asStringOrNull(row.currency),
    paymentCollect: asStringOrNull(row.payment_collect),
    paymentType: null,
    unmatchedRoom: asStringOrNull(row.external_room_type_id)
      ? !mappedRoomTypeIds.has(asStringOrNull(row.external_room_type_id) as string)
      : true,
    insertedAt: asStringOrNull(row.updated_at),
    importStatus: asStringOrNull(row.import_status) ?? "preview",
    ackStatus: asStringOrNull(row.ack_status) ?? "not_acknowledged",
  }));

  const allRevisions: RevisionRow[] = ((allRevisionRows ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: asString(row.id),
    source: asStringOrNull(row.source) ?? "unknown",
    status: asStringOrNull(row.status),
    importStatus: asStringOrNull(row.import_status) ?? "preview",
    ackStatus: asStringOrNull(row.ack_status) ?? "not_acknowledged",
    externalBookingId: asStringOrNull(row.external_booking_id),
    externalRevisionId: asStringOrNull(row.external_revision_id),
  }));

  const feedRows = allRevisions.filter((revision) => revision.source === "booking_revision_feed");
  const unackedRevisionsCount = feedRows.filter((revision) => revision.ackStatus !== "acknowledged").length;
  const failedImportCount = feedRows.filter((revision) => revision.importStatus === "failed").length;
  const pendingApplyCount = feedRows.filter((revision) => {
    if (revision.ackStatus === "acknowledged") return false;
    const status = (revision.status ?? "").toLowerCase();
    if (status === "cancelled") return revision.importStatus !== "cancelled_applied";
    if (status === "new") return revision.importStatus !== "imported";
    return revision.importStatus === "preview" || revision.importStatus === "failed";
  }).length;

  const attachedChannelIds = channelResult.data.map((channel) => channel.id);
  const activeChannel = channelResult.data.find((channel) => channel.isActive) ?? channelResult.data[0] ?? null;
  const accChannelsCount = propertyHealthResult.data?.accChannelsCount ?? null;
  const channelAttached = (accChannelsCount ?? 0) > 0 || attachedChannelIds.length > 0;
  const channelActive = channelResult.data.some((channel) => channel.isActive);
  const unmatchedRoomCount = normalizedRevisions.filter((revision) => revision.unmatchedRoom).length;
  const unmatchedCount = unmatchedPreviews.length;
  const message = result.ok
    ? totalFetched === 0
      ? "0 returned by Channex feed. Preview only; nothing was imported or acknowledged."
      : normalizedRevisions.length > 0
        ? `Fetched ${totalFetched} Channex booking revision${totalFetched === 1 ? "" : "s"}, matched ${normalizedRevisions.length} to this property, and stored matched previews only.`
        : `Fetched ${totalFetched} Channex booking revision${totalFetched === 1 ? "" : "s"}, but 0 matched this property.`
    : result.message;

  const nextHealth = buildHealthMetadata({
    previous: asObject(propertyRow?.metadata),
    environment: result.environment,
    externalPropertyId,
    resultOk: result.ok,
    observedAt,
    message,
    totalFetched,
    matchedRevisionCount: normalizedRevisions.length,
    unmatchedRevisionCount: unmatchedCount,
    storedRevisionCount: storageResult.storedCount,
    insertedRevisionCount: storageResult.insertedCount,
    updatedRevisionCount: storageResult.updatedCount,
    unmatchedRoomCount,
    accChannelsCount,
    channelAttached,
    channelActive,
    activeChannelId: activeChannel?.id ?? null,
    activeChannelTitle: activeChannel?.title ?? null,
    hotelId: activeChannel?.hotelId ?? null,
    attachedChannelIds,
    unackedRevisionsCount,
    failedImportCount,
    pendingApplyCount,
    action,
  });

  if (propertyRow?.id) {
    const nextMetadata = {
      ...(asObject(propertyRow.metadata) ?? {}),
      channexFeedHealth: nextHealth,
    };
    await input.supabase
      .from("channel_properties")
      .update({ metadata: nextMetadata, updated_at: observedAt } as never)
      .eq("id", propertyRow.id);
  }

  await logFeedResult({
    supabase: input.supabase,
    familyId: input.familyId,
    action,
    status: result.ok ? "success" : "failed",
    message,
    payload: {
      environment: result.environment,
      endpoint: result.endpoint,
      http_status: result.httpStatus,
      external_property_id: externalPropertyId,
      total_fetched: totalFetched,
      matched_revision_count: normalizedRevisions.length,
      unmatched_revision_count: unmatchedCount,
      revision_ids: normalizedRevisions.map((revision) => revision.revisionId).filter(Boolean),
      stored_revision_count: storageResult.storedCount,
      inserted_revision_count: storageResult.insertedCount,
      updated_revision_count: storageResult.updatedCount,
      latest_safe_booking_ids: result.revisions
        .slice(0, 10)
        .map((revision) => extractExternalBookingId(revision as Record<string, unknown>))
        .filter(Boolean),
      discovered_property_ids: [...discoveredPropertyIds],
      unmatched_reasons: unmatchedPreviews.slice(0, 10).map((revision) => ({
        revision_id: revision.revisionId,
        external_booking_id: revision.externalBookingId,
        reason: revision.reason,
        discovered_property_ids: revision.discoveredPropertyIds,
      })),
      unmatched_room_count: unmatchedRoomCount,
      channel_health: nextHealth,
    },
  });

  return {
    ok: result.ok,
    status: result.ok ? "completed" : "failed",
    configured: true,
    environment: result.environment,
    message,
    totalFetched,
    revisionsFound: normalizedRevisions.length,
    storedCount: storageResult.storedCount,
    insertedCount: storageResult.insertedCount,
    updatedCount: storageResult.updatedCount,
    unmatchedCount,
    unmatchedRoomCount,
    externalPropertyId,
    discoveredPropertyIds: [...discoveredPropertyIds],
    unmatchedRevisions: unmatchedPreviews.slice(0, 20),
    latestSafeBookingIds: result.revisions
      .slice(0, 10)
      .map((revision) => extractExternalBookingId(revision as Record<string, unknown>))
      .filter((value): value is string => Boolean(value)),
    lastCheckedAt: observedAt,
    revisions: storedRevisions,
    requiresAcknowledgement: true,
    acknowledged: false,
    channelHealth: nextHealth,
  };
}
