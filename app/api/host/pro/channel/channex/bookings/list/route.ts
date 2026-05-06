import { NextResponse } from "next/server";

import { fetchChannexBookingList, getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type ListBody = {
  familyId?: string;
  uniqueId?: string;
};

type BookingListSummary = {
  bookingId: string | null;
  uniqueId: string | null;
  bookingListRevisionId: string | null;
  status: string | null;
  propertyId: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  roomTypeId: string | null;
  ratePlanId: string | null;
  amount: string | null;
  currency: string | null;
  otaName: string | null;
  channelId: string | null;
  hasUnackedRevisions: boolean;
  acknowledgeStatus: string | null;
  isCrsRevision: boolean;
  source: "booking_list_api";
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

function extractPropertyIds(booking: Record<string, unknown>): string[] {
  const attributes = getAttributes(booking);
  const relationships = getRelationships(booking);
  const relationshipProperty = asObject(relationships?.property);
  const relationshipPropertyData = asObject(relationshipProperty?.data);
  const rooms = asArray(attributes?.rooms ?? booking.rooms);
  const roomPropertyIds = rooms
    .map((room) => asObject(room))
    .map((room) => asStringOrNull(room?.property_id))
    .filter(Boolean);

  return [...new Set([
    asStringOrNull(booking.property_id),
    asStringOrNull(attributes?.property_id),
    asStringOrNull(relationshipPropertyData?.id),
    ...roomPropertyIds,
  ].filter((value): value is string => Boolean(value)))];
}

function summarizeBooking(booking: Record<string, unknown>): BookingListSummary {
  const attributes = getAttributes(booking);
  const rooms = asArray(attributes?.rooms ?? booking.rooms);
  const firstRoom = asObject(rooms.find((room) => room && typeof room === "object" && !Array.isArray(room)));
  const propertyIds = extractPropertyIds(booking);

  return {
    bookingId: asStringOrNull(booking.booking_id) ?? asStringOrNull(attributes?.booking_id) ?? asStringOrNull(booking.id),
    uniqueId:
      asStringOrNull(booking.unique_id) ??
      asStringOrNull(attributes?.unique_id) ??
      asStringOrNull(booking.ota_reservation_code) ??
      asStringOrNull(attributes?.ota_reservation_code),
    bookingListRevisionId: asStringOrNull(booking.revision_id) ?? asStringOrNull(attributes?.revision_id),
    status: asStringOrNull(booking.status) ?? asStringOrNull(attributes?.status),
    propertyId: propertyIds[0] ?? null,
    arrivalDate: asStringOrNull(booking.arrival_date) ?? asStringOrNull(attributes?.arrival_date) ?? asStringOrNull(firstRoom?.checkin_date),
    departureDate: asStringOrNull(booking.departure_date) ?? asStringOrNull(attributes?.departure_date) ?? asStringOrNull(firstRoom?.checkout_date),
    roomTypeId: asStringOrNull(firstRoom?.room_type_id),
    ratePlanId: asStringOrNull(firstRoom?.rate_plan_id),
    amount: asStringOrNull(booking.amount) ?? asStringOrNull(attributes?.amount) ?? asStringOrNull(firstRoom?.amount),
    currency: asStringOrNull(booking.currency) ?? asStringOrNull(attributes?.currency),
    otaName: asStringOrNull(booking.ota_name) ?? asStringOrNull(attributes?.ota_name),
    channelId: asStringOrNull(attributes?.channel_id) ?? asStringOrNull(booking.channel_id),
    hasUnackedRevisions: Boolean(attributes?.has_unacked_revisions),
    acknowledgeStatus: asStringOrNull(attributes?.acknowledge_status),
    isCrsRevision: Boolean(attributes?.is_crs_revision),
    source: "booking_list_api",
  };
}

async function logListResult(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  status: "success" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: "verify_booking_list",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[host.pro.channel.channex.bookings.list] log failed:", error);
    }
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as ListBody;
    const familyId = asString(body.familyId);
    const searchedUniqueId = asString(body.uniqueId);

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

    const result = await fetchChannexBookingList();
    const totalFetched = result.bookings.length;
    const propertyMatched = (result.bookings as Array<Record<string, unknown>>).filter((booking) =>
      extractPropertyIds(booking).includes(externalPropertyId)
    );
    const propertySummaries = propertyMatched.map((booking) => summarizeBooking(booking));
    const searchedMatch = searchedUniqueId
      ? propertySummaries.filter((booking) => booking.uniqueId === searchedUniqueId)
      : propertySummaries;

    if (searchedMatch.length > 0) {
      const upsertRows = searchedMatch.map((booking) => ({
        family_id: familyId,
        provider_code: "channex",
        external_property_id: externalPropertyId,
        external_booking_id: booking.uniqueId ?? booking.bookingId,
        external_revision_id: null,
        external_room_type_id: booking.roomTypeId,
        external_rate_plan_id: booking.ratePlanId,
        ota_name: booking.otaName,
        status: booking.status,
        arrival_date: booking.arrivalDate,
        departure_date: booking.departureDate,
        guest_name: null,
        amount: booking.amount,
        currency: booking.currency,
        payment_collect: null,
        source: "booking_list_api",
        raw_payload: {
          booking_id: booking.bookingId,
          unique_id: booking.uniqueId,
          booking_list_revision_id: booking.bookingListRevisionId,
          property_id: booking.propertyId,
          arrival_date: booking.arrivalDate,
          departure_date: booking.departureDate,
          room_type_id: booking.roomTypeId,
          rate_plan_id: booking.ratePlanId,
          amount: booking.amount,
          currency: booking.currency,
          ota_name: booking.otaName,
          status: booking.status,
          channel_id: booking.channelId,
          has_unacked_revisions: booking.hasUnackedRevisions,
          acknowledge_status: booking.acknowledgeStatus,
          is_crs_revision: booking.isCrsRevision,
        },
        import_status: "preview",
        ack_status: "not_acknowledged",
        updated_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabase
        .from("channel_booking_revisions")
        .upsert(upsertRows as never, { onConflict: "provider_code,external_booking_id,source" });

      if (upsertError) {
        const message = String(upsertError.message ?? "");
        if (!/relation|does not exist|schema cache/i.test(message)) {
          throw upsertError;
        }
      }
    }

    const message = result.ok
      ? searchedUniqueId
        ? searchedMatch.length > 0
          ? `Booking List API found ${searchedMatch.length} booking${searchedMatch.length === 1 ? "" : "s"} for unique ID ${searchedUniqueId} and stored preview rows only. Nothing was imported or acknowledged.`
          : `Booking List API did not find ${searchedUniqueId} for this property. Feed may still be empty or delayed.`
        : `Booking List API returned ${propertySummaries.length} booking${propertySummaries.length === 1 ? "" : "s"} for this property. Preview rows were stored only; nothing was imported or acknowledged.`
      : result.message;

    await logListResult({
      supabase,
      familyId,
      status: result.ok ? "success" : "failed",
      message,
      payload: {
        external_property_id: externalPropertyId,
        searched_unique_id: searchedUniqueId || null,
        total_fetched: totalFetched,
        property_matched_count: propertySummaries.length,
        found_count: searchedUniqueId ? searchedMatch.length : propertySummaries.length,
        latest_safe_booking_ids: propertySummaries.slice(0, 10).map((booking) => booking.uniqueId).filter(Boolean),
      },
    });

    return NextResponse.json(
      {
        ok: result.ok,
        status: result.ok ? "completed" : "failed",
        message,
        externalPropertyId,
        totalFetched,
        propertyMatchedCount: propertySummaries.length,
        foundCount: searchedUniqueId ? searchedMatch.length : propertySummaries.length,
        searchedUniqueId: searchedUniqueId || null,
        bookings: searchedUniqueId ? searchedMatch : propertySummaries.slice(0, 20),
      },
      { status: result.ok ? 200 : 502 }
    );
  } catch (error) {
    console.error("[host.pro.channel.channex.bookings.list] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Failed to verify Channex booking list.",
      },
      { status: 500 }
    );
  }
}
