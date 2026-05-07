import { NextResponse } from "next/server";

import { fetchChannexBookingFeed, getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type FeedBody = {
  familyId?: string;
};

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

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function asNumericStringOrNull(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
  }
  return null;
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
    return {
      matched: false,
      reason: "unsupported_shape",
      discoveredPropertyIds,
      hasRoomTypeId,
    };
  }

  if (discoveredPropertyIds.length === 0) {
    return {
      matched: false,
      reason: "property_id_missing",
      discoveredPropertyIds,
      hasRoomTypeId,
    };
  }

  if (!discoveredPropertyIds.includes(expectedPropertyId)) {
    return {
      matched: false,
      reason: "property_id_mismatch",
      discoveredPropertyIds,
      hasRoomTypeId,
    };
  }

  if (!hasRoomTypeId) {
    return {
      matched: false,
      reason: "room_type_id_missing",
      discoveredPropertyIds,
      hasRoomTypeId,
    };
  }

  return {
    matched: true,
    reason: null,
    discoveredPropertyIds,
    hasRoomTypeId,
  };
}

async function logFeedResult(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  status: "success" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: "fetch_booking_feed",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[host.pro.channel.channex.bookings.feed] log failed:", error);
    }
  }
}

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
  raw_payload: Record<string, unknown>;
  import_status: string;
  ack_status: string;
  updated_at: string;
  source: string;
};

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
  supabase: ReturnType<typeof createAdminSupabaseClient>;
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

  const { data: existingRows, error: existingRowsError } = await input.supabase
    .from("channel_booking_revisions")
    .select("id,external_revision_id,import_status,ack_status,linked_booking_id,raw_payload,source")
    .eq("family_id", input.familyId)
    .eq("provider_code", "channex")
    .in("external_revision_id", revisionIds);

  if (existingRowsError) {
    throw existingRowsError;
  }

  const existingByRevisionId = new Map(
    ((existingRows ?? []) as Array<Record<string, unknown>>)
      .map((row) => {
        const revisionId = asStringOrNull(row.external_revision_id);
        return revisionId ? [revisionId, row] : null;
      })
      .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry))
  );

  let insertedCount = 0;
  let updatedCount = 0;

  for (const [revisionId, preparedRow] of dedupedRows.entries()) {
    const existingRow = existingByRevisionId.get(revisionId);

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

  return {
    insertedCount,
    updatedCount,
    storedCount: revisionIds.length,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as FeedBody;
    const familyId = asString(body.familyId);

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });

    if (!authorizedResource?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await loadHostProAccess(supabase, familyId);
    if (!access.allowed) {
      return NextResponse.json({ error: "Famlo Pro is not active for this property." }, { status: 403 });
    }

    const config = getChannexConfigSummary();
    if (!config.configured) {
      return NextResponse.json(
        {
          ok: false,
          status: "missing_config",
          message: "Channex staging configuration is incomplete.",
          configured: false,
          revisions: [],
        },
        { status: 503 }
      );
    }

    const [{ data: propertyRow }, { data: roomMappingRows }] = await Promise.all([
      supabase
        .from("channel_properties")
        .select("external_property_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("channel_room_mappings")
        .select("external_room_type_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex"),
    ]);

    const externalPropertyId = asStringOrNull(propertyRow?.external_property_id);
    if (!externalPropertyId) {
      return NextResponse.json(
        {
          ok: false,
          status: "create_property_first",
          message: "Create provider property first before checking the Channex booking feed.",
          revisions: [],
        },
        { status: 409 }
      );
    }

    const result = await fetchChannexBookingFeed();
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
            supabase,
            familyId,
            externalPropertyId,
            matchedRevisions,
            normalizedRevisions,
          })
        : { insertedCount: 0, updatedCount: 0, storedCount: 0 };

    const { data: storedRevisionRows } = await supabase
      .from("channel_booking_revisions")
      .select("external_booking_id,external_revision_id,status,ota_name,arrival_date,departure_date,guest_name,external_room_type_id,external_rate_plan_id,amount,currency,payment_collect,import_status,ack_status,updated_at")
      .eq("family_id", familyId)
      .eq("provider_code", "channex")
      .order("updated_at", { ascending: false })
      .limit(20);

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
      unmatchedRoom: asStringOrNull(row.external_room_type_id) ? !mappedRoomTypeIds.has(asStringOrNull(row.external_room_type_id) as string) : true,
      insertedAt: asStringOrNull(row.updated_at),
      importStatus: asStringOrNull(row.import_status) ?? "preview",
      ackStatus: asStringOrNull(row.ack_status) ?? "not_acknowledged",
    }));
    const unmatchedRoomCount = normalizedRevisions.filter((revision) => revision.unmatchedRoom).length;
    const unmatchedCount = unmatchedPreviews.length;
    const message = result.ok
      ? totalFetched === 0
        ? "0 returned by Channex feed. Preview only; nothing was imported or acknowledged."
        : normalizedRevisions.length > 0
          ? `Fetched ${totalFetched} Channex staging booking revision${totalFetched === 1 ? "" : "s"}, matched ${normalizedRevisions.length} to this property, and stored matched previews only. Nothing was imported or acknowledged.`
          : `Fetched ${totalFetched} Channex staging booking revision${totalFetched === 1 ? "" : "s"}, but 0 matched this property. Preview only; nothing was imported or acknowledged.`
      : result.message;

    await logFeedResult({
      supabase,
      familyId,
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
        checked_by: authorizedResource.isAdmin ? "admin" : "host",
      },
    });

    return NextResponse.json(
      {
        ok: result.ok,
        status: result.ok ? "completed" : "failed",
        configured: config.configured,
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
          .filter(Boolean),
        lastCheckedAt: new Date().toISOString(),
        revisions: storedRevisions,
        requiresAcknowledgement: true,
        acknowledged: false,
      },
      { status: result.ok ? 200 : 502 }
    );
  } catch (error) {
    console.error("[host.pro.channel.channex.bookings.feed] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Failed to fetch the Channex booking feed.",
        revisions: [],
      },
      { status: 500 }
    );
  }
}
