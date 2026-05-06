import { NextResponse } from "next/server";

import {
  fetchChannexBookingFeed,
  fetchChannexBookingRevisions,
  getChannexConfigSummary,
} from "@/lib/channel-providers/channex/client";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type RevisionVisibilityBody = {
  familyId?: string;
  uniqueId?: string;
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

function extractPropertyIds(record: Record<string, unknown>): string[] {
  const attributes = getAttributes(record);
  const relationships = getRelationships(record);
  const relationshipData = asObject(asObject(relationships?.data)?.property);
  const rooms = asArray(attributes?.rooms ?? record.rooms);
  const roomPropertyIds = rooms
    .map((room) => asObject(room))
    .map((room) => asStringOrNull(room?.property_id))
    .filter((value): value is string => Boolean(value));

  return [...new Set([
    asStringOrNull(record.property_id),
    asStringOrNull(attributes?.property_id),
    asStringOrNull(relationshipData?.id),
    ...roomPropertyIds,
  ].filter((value): value is string => Boolean(value)))];
}

function extractGuestName(record: Record<string, unknown>): string | null {
  const attributes = getAttributes(record);
  const customer = asObject(attributes?.customer ?? record.customer);
  const name = asStringOrNull(customer?.name);
  const surname = asStringOrNull(customer?.surname);
  const combined = [name, surname].filter(Boolean).join(" ");
  return combined || null;
}

function extractFirstRoom(record: Record<string, unknown>): Record<string, unknown> | null {
  const attributes = getAttributes(record);
  const rooms = asArray(attributes?.rooms ?? record.rooms);
  return asObject(rooms.find((room) => room && typeof room === "object" && !Array.isArray(room)));
}

function extractRevisionSummary(record: Record<string, unknown>) {
  const attributes = getAttributes(record);
  const firstRoom = extractFirstRoom(record);
  return {
    revisionId: asStringOrNull(record.id) ?? asStringOrNull(attributes?.id),
    externalBookingId:
      asStringOrNull(record.unique_id) ??
      asStringOrNull(attributes?.unique_id) ??
      asStringOrNull(record.booking_id) ??
      asStringOrNull(attributes?.booking_id),
    bookingId: asStringOrNull(record.booking_id) ?? asStringOrNull(attributes?.booking_id),
    propertyId: extractPropertyIds(record)[0] ?? null,
    status: asStringOrNull(record.status) ?? asStringOrNull(attributes?.status),
    otaName: asStringOrNull(record.ota_name) ?? asStringOrNull(attributes?.ota_name),
    arrivalDate: asStringOrNull(record.arrival_date) ?? asStringOrNull(attributes?.arrival_date) ?? asStringOrNull(firstRoom?.checkin_date),
    departureDate: asStringOrNull(record.departure_date) ?? asStringOrNull(attributes?.departure_date) ?? asStringOrNull(firstRoom?.checkout_date),
    guestName: extractGuestName(record),
    externalRoomTypeId: asStringOrNull(firstRoom?.room_type_id),
    externalRatePlanId: asStringOrNull(firstRoom?.rate_plan_id),
    amount: asStringOrNull(record.amount) ?? asStringOrNull(attributes?.amount) ?? asStringOrNull(firstRoom?.amount),
    currency: asStringOrNull(record.currency) ?? asStringOrNull(attributes?.currency),
    paymentCollect: asStringOrNull(record.payment_collect) ?? asStringOrNull(attributes?.payment_collect),
    paymentType: asStringOrNull(record.payment_type) ?? asStringOrNull(attributes?.payment_type),
    channelId: asStringOrNull(record.channel_id) ?? asStringOrNull(attributes?.channel_id),
    isCrsRevision: Boolean(attributes?.is_crs_revision),
    acknowledgeStatus: asStringOrNull(attributes?.acknowledge_status),
    insertedAt: asStringOrNull(record.inserted_at) ?? asStringOrNull(attributes?.inserted_at),
  };
}

async function logRevisionVisibilityResult(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  status: "success" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: "verify_booking_revision_visibility",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[host.pro.channel.channex.bookings.revisions] log failed:", error);
    }
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as RevisionVisibilityBody;
    const familyId = asString(body.familyId);
    const uniqueId = asString(body.uniqueId);

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
      return NextResponse.json({ ok: false, status: "missing_config", message: "Channex staging configuration is incomplete." }, { status: 503 });
    }

    const { data: propertyRow } = await supabase
      .from("channel_properties")
      .select("external_property_id")
      .eq("family_id", familyId)
      .eq("provider_code", "channex")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const externalPropertyId = asStringOrNull(propertyRow?.external_property_id);
    if (!externalPropertyId) {
      return NextResponse.json({ ok: false, status: "create_property_first", message: "Create provider property first." }, { status: 409 });
    }

    const [revisionsResult, feedResult] = await Promise.all([
      fetchChannexBookingRevisions({
        propertyId: externalPropertyId,
        uniqueId: uniqueId || null,
        limit: 20,
      }),
      fetchChannexBookingFeed(),
    ]);

    const normalizedHistory = revisionsResult.revisions
      .map((record) => extractRevisionSummary(record as Record<string, unknown>))
      .filter((record) => record.propertyId === externalPropertyId)
      .filter((record) => !uniqueId || record.externalBookingId === uniqueId);

    const feedMatches = feedResult.revisions
      .map((record) => extractRevisionSummary(record as Record<string, unknown>))
      .filter((record) => record.propertyId === externalPropertyId)
      .filter((record) => !uniqueId || record.externalBookingId === uniqueId);

    const feedStatus = !feedResult.ok ? "failed" : feedMatches.length > 0 ? "found" : "empty";
    const message = revisionsResult.ok
      ? uniqueId
        ? `Booking revisions visibility found ${normalizedHistory.length} revision history row${normalizedHistory.length === 1 ? "" : "s"} for ${uniqueId}. Feed status is ${feedStatus}.`
        : `Booking revisions visibility returned ${normalizedHistory.length} revision history row${normalizedHistory.length === 1 ? "" : "s"} for this property. Feed status is ${feedStatus}.`
      : revisionsResult.message;

    await logRevisionVisibilityResult({
      supabase,
      familyId,
      status: revisionsResult.ok ? "success" : "failed",
      message,
      payload: {
        environment: revisionsResult.environment,
        endpoint: revisionsResult.endpoint,
        feed_endpoint: feedResult.endpoint,
        http_status: revisionsResult.httpStatus,
        feed_http_status: feedResult.httpStatus,
        external_property_id: externalPropertyId,
        searched_unique_id: uniqueId || null,
        revisions_found_count: normalizedHistory.length,
        feed_status: feedStatus,
        feed_match_count: feedMatches.length,
        revision_ids: normalizedHistory.map((revision) => revision.revisionId).filter(Boolean),
        external_booking_ids: normalizedHistory.map((revision) => revision.externalBookingId).filter(Boolean).slice(0, 10),
        crs_only_count: normalizedHistory.filter((revision) => revision.isCrsRevision || !revision.channelId).length,
      },
    });

    return NextResponse.json(
      {
        ok: revisionsResult.ok,
        status: revisionsResult.ok ? "completed" : "failed",
        message,
        environment: revisionsResult.environment,
        externalPropertyId,
        searchedUniqueId: uniqueId || null,
        feedStatus,
        feedMatchCount: feedMatches.length,
        feedRevisionIds: feedMatches.map((revision) => revision.revisionId).filter(Boolean),
        revisionsFound: normalizedHistory.length,
        revisions: normalizedHistory,
      },
      { status: revisionsResult.ok ? 200 : 502 }
    );
  } catch (error) {
    console.error("[host.pro.channel.channex.bookings.revisions] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Failed to verify Channex booking revisions visibility.",
      },
      { status: 500 }
    );
  }
}
