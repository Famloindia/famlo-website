import { NextResponse } from "next/server";

import { hasAdminPermission } from "@/lib/admin-auth";
import {
  fetchChannexAvailabilitySnapshot,
  fetchChannexRestrictionsSnapshot,
} from "@/lib/channel-providers/channex/client";
import { extractOtaSyncSnapshotPayload } from "@/lib/inventory";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isIsoDate(value: string | null): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function canUseLocalDiagnostics(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_ADMIN_DIAGNOSTICS === "true";
}

async function canAccessDiagnostics(): Promise<boolean> {
  if (canUseLocalDiagnostics() && process.env.NODE_ENV !== "production") return true;
  return hasAdminPermission("channels");
}

function eventAppliesToDate(event: JsonRecord, date: string): boolean {
  const start = asString(event.effective_date_start);
  const end = asString(event.effective_date_end) ?? start;
  return Boolean(start && end && date >= start && date <= end);
}

function summarizeInventoryEvent(event: JsonRecord | null): JsonRecord | null {
  if (!event) return null;
  const payload =
    event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? (event.payload as JsonRecord)
      : {};
  const snapshot = extractOtaSyncSnapshotPayload(payload);
  return {
    eventType: asString(event.event_type),
    eventSource: asString(event.event_source),
    createdAt: asString(event.created_at),
    effectiveDateStart: asString(event.effective_date_start),
    effectiveDateEnd: asString(event.effective_date_end),
    updatedVia: asString(payload.updated_via),
    availability: snapshot.availability,
    rate: snapshot.amount,
    restrictions: {
      stopSell: snapshot.stopSell,
      cta: snapshot.cta,
      ctd: snapshot.ctd,
      minStayThrough: snapshot.minStayThrough,
      minStayArrival: snapshot.minStayArrival,
      maxStay: snapshot.maxStay,
    },
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!(await canAccessDiagnostics())) {
    return NextResponse.json({ error: "Admin channel access is required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const familyId = asString(url.searchParams.get("familyId"));
  const dateFrom = asString(url.searchParams.get("dateFrom"));
  const dateTo = asString(url.searchParams.get("dateTo"));
  const roomIds = url.searchParams.getAll("roomId").map((value) => value.trim()).filter(Boolean);

  if (!familyId || !isIsoDate(dateFrom) || !isIsoDate(dateTo) || dateTo < dateFrom) {
    return NextResponse.json({ error: "Valid familyId, dateFrom, and dateTo are required." }, { status: 400 });
  }

  try {
    const supabase = createAdminSupabaseClient();
    let roomsQuery = supabase
      .from("stay_units_v2")
      .select("id,name,legacy_family_id")
      .eq("legacy_family_id", familyId)
      .order("name", { ascending: true });
    if (roomIds.length > 0) {
      roomsQuery = roomsQuery.in("id", roomIds);
    }

    const [roomsResult, propertyResult, roomMappingsResult, ratePlansResult, projectionResult, eventsResult] = await Promise.all([
      roomsQuery,
      supabase
        .from("channel_properties")
        .select("id,external_property_id,last_synced_at,metadata")
        .eq("family_id", familyId)
        .eq("provider_code", "channex")
        .maybeSingle(),
      supabase
        .from("channel_room_mappings")
        .select("stay_unit_id,external_room_type_id,sync_status")
        .eq("family_id", familyId)
        .eq("provider_code", "channex"),
      supabase
        .from("channel_rate_plans")
        .select("stay_unit_id,external_rate_plan_id,title,sync_status")
        .eq("family_id", familyId)
        .eq("provider_code", "channex"),
      supabase
        .from("inventory_day_projection")
        .select("stay_unit_id,date,effective_rate,available_units,cta,ctd,min_stay,max_stay,stop_sell,last_projected_at,updated_at,metadata")
        .eq("family_id", familyId)
        .gte("date", dateFrom)
        .lte("date", dateTo),
      supabase
        .from("inventory_event_log")
        .select("stay_unit_id,effective_date_start,effective_date_end,event_type,event_source,created_at,payload")
        .eq("family_id", familyId)
        .lte("effective_date_start", dateTo)
        .gte("effective_date_end", dateFrom)
        .order("created_at", { ascending: false }),
    ]);

    if (roomsResult.error) throw roomsResult.error;
    if (propertyResult.error) throw propertyResult.error;
    if (roomMappingsResult.error) throw roomMappingsResult.error;
    if (ratePlansResult.error) throw ratePlansResult.error;
    if (projectionResult.error) throw projectionResult.error;
    if (eventsResult.error) throw eventsResult.error;

    const property = (propertyResult.data as JsonRecord | null) ?? null;
    const propertyMetadata =
      property?.metadata && typeof property.metadata === "object" && !Array.isArray(property.metadata)
        ? (property.metadata as JsonRecord)
        : {};
    const externalPropertyId = asString(property?.external_property_id);
    if (!externalPropertyId) {
      return NextResponse.json({
        ok: false,
        error: "No Channex property is mapped for this family.",
        rows: [],
      });
    }

    const [availabilitySnapshot, restrictionsSnapshot] = await Promise.all([
      fetchChannexAvailabilitySnapshot({
        propertyId: externalPropertyId,
        dateFrom,
        dateTo,
      }),
      fetchChannexRestrictionsSnapshot({
        propertyId: externalPropertyId,
        dateFrom,
        dateTo,
      }),
    ]);

    const roomMappings = new Map(
      ((roomMappingsResult.data ?? []) as JsonRecord[]).map((row) => [
        asString(row.stay_unit_id) ?? "",
        {
          externalRoomTypeId: asString(row.external_room_type_id),
          syncStatus: asString(row.sync_status) ?? "not_mapped",
        },
      ])
    );
    const ratePlans = new Map(
      ((ratePlansResult.data ?? []) as JsonRecord[]).map((row) => [
        asString(row.stay_unit_id) ?? "",
        {
          externalRatePlanId: asString(row.external_rate_plan_id),
          title: asString(row.title) ?? "Standard Rate",
          syncStatus: asString(row.sync_status) ?? "not_mapped",
        },
      ])
    );
    const projections = new Map(
      ((projectionResult.data ?? []) as JsonRecord[]).map((row) => [
        `${asString(row.stay_unit_id)}:${asString(row.date)}`,
        row,
      ])
    );
    const events = (eventsResult.data ?? []) as JsonRecord[];
    const latestEventByRoomDate = new Map<string, JsonRecord>();
    const latestOtaEventByRoomDate = new Map<string, JsonRecord>();
    for (const row of (eventsResult.data ?? []) as JsonRecord[]) {
      const roomId = asString(row.stay_unit_id);
      if (!roomId) continue;
      for (const date of enumerateDates(dateFrom, dateTo)) {
        if (!eventAppliesToDate(row, date)) continue;
        const key = `${roomId}:${date}`;
        if (!latestEventByRoomDate.has(key)) {
          latestEventByRoomDate.set(key, row);
        }
        if (asString(row.event_type) === "ota_sync_applied" && !latestOtaEventByRoomDate.has(key)) {
          latestOtaEventByRoomDate.set(key, row);
        }
      }
    }

    const rows = ((roomsResult.data ?? []) as JsonRecord[]).flatMap((room) => {
      const roomId = asString(room.id);
      const roomName = asString(room.name) ?? "Room";
      if (!roomId) return [];
      const roomMapping = roomMappings.get(roomId) ?? null;
      const ratePlan = ratePlans.get(roomId) ?? null;

      return enumerateDates(dateFrom, dateTo).map((date) => {
        const projection = projections.get(`${roomId}:${date}`) ?? null;
        const latestEvent = latestEventByRoomDate.get(`${roomId}:${date}`) ?? null;
        const latestOtaEvent = latestOtaEventByRoomDate.get(`${roomId}:${date}`) ?? null;
        const channexAvailability = roomMapping?.externalRoomTypeId
          ? availabilitySnapshot.data[roomMapping.externalRoomTypeId]?.[date] ?? null
          : null;
        const channexRestrictionsRaw =
          ratePlan?.externalRatePlanId
            ? (restrictionsSnapshot.data[ratePlan.externalRatePlanId]?.[date] as JsonRecord | undefined) ?? null
            : null;
        const channexRestrictions = extractOtaSyncSnapshotPayload(channexRestrictionsRaw);
        const projectedMetadata =
          projection?.metadata && typeof projection.metadata === "object" && !Array.isArray(projection.metadata)
            ? (projection.metadata as JsonRecord)
            : {};
        const projectedRestrictions = {
          stopSell: Boolean(projection?.stop_sell),
          cta: Boolean(projection?.cta),
          ctd: Boolean(projection?.ctd),
          minStayThrough: asNumber(projection?.min_stay),
          minStayArrival: asNumber(projectedMetadata.min_stay_arrival),
          maxStay: asNumber(projection?.max_stay),
        };

        const mismatchReasons: string[] = [];
        if (!roomMapping?.externalRoomTypeId) mismatchReasons.push("missing_room_mapping");
        if (!ratePlan?.externalRatePlanId) mismatchReasons.push("missing_rate_plan_mapping");
        if (!projection) mismatchReasons.push("missing_projection_row");
        if (projection && channexAvailability != null && asNumber(projection.available_units) !== channexAvailability) {
          mismatchReasons.push("availability_mismatch");
        }
        if (projection && channexRestrictions.amount != null && asNumber(projection.effective_rate) !== channexRestrictions.amount) {
          mismatchReasons.push("rate_mismatch");
        }
        if (projection && channexRestrictions.stopSell != null && Boolean(projection.stop_sell) !== channexRestrictions.stopSell) {
          mismatchReasons.push("stop_sell_mismatch");
        }
        if (projection && channexRestrictions.cta != null && Boolean(projection.cta) !== channexRestrictions.cta) {
          mismatchReasons.push("cta_mismatch");
        }
        if (projection && channexRestrictions.ctd != null && Boolean(projection.ctd) !== channexRestrictions.ctd) {
          mismatchReasons.push("ctd_mismatch");
        }
        if (projection && channexRestrictions.minStayThrough != null && asNumber(projection.min_stay) !== channexRestrictions.minStayThrough) {
          mismatchReasons.push("min_stay_through_mismatch");
        }
        if (
          projection &&
          channexRestrictions.minStayArrival != null &&
          asNumber(projectedMetadata.min_stay_arrival) !== channexRestrictions.minStayArrival
        ) {
          mismatchReasons.push("min_stay_arrival_mismatch");
        }
        if (projection && channexRestrictions.maxStay != null && asNumber(projection.max_stay) !== channexRestrictions.maxStay) {
          mismatchReasons.push("max_stay_mismatch");
        }

        return {
          roomId,
          roomName,
          date,
          mappingStatus: roomMapping?.externalRoomTypeId && ratePlan?.externalRatePlanId ? "mapped" : "not_mapped",
          channexRatePlanTitle: ratePlan?.title ?? null,
          channexAvailability,
          famloProjectedAvailability: projection ? asNumber(projection.available_units) : null,
          channexRate: channexRestrictions.amount,
          famloProjectedRate: projection ? asNumber(projection.effective_rate) : null,
          channexRestrictions: {
            stopSell: channexRestrictions.stopSell,
            cta: channexRestrictions.cta,
            ctd: channexRestrictions.ctd,
            minStayThrough: channexRestrictions.minStayThrough,
            minStayArrival: channexRestrictions.minStayArrival,
            maxStay: channexRestrictions.maxStay,
          },
          famloProjectedRestrictions: projectedRestrictions,
          matches: mismatchReasons.length === 0,
          mismatchReasons,
          latestOtaSyncAppliedEvent: summarizeInventoryEvent(latestOtaEvent),
          lastInventoryEvent: summarizeInventoryEvent(latestEvent),
          projectionUpdatedAt: projection ? asString(projection.last_projected_at) ?? asString(projection.updated_at) : null,
        };
      });
    });

    return NextResponse.json({
      ok: true,
      familyId,
      dateFrom,
      dateTo,
      availabilitySnapshotOk: availabilitySnapshot.ok,
      restrictionsSnapshotOk: restrictionsSnapshot.ok,
      lastSync: {
        lastSyncedAt: asString(property?.last_synced_at),
        lastCalendarPullAttemptAt: asString(propertyMetadata.last_calendar_pull_attempt_at),
        lastCalendarPullSuccessAt: asString(propertyMetadata.last_calendar_pull_success_at),
        lastCalendarPullStatus: asString(propertyMetadata.last_calendar_pull_status),
      },
      eventCount: events.length,
      rows,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compare Channex and projection state." },
      { status: 500 }
    );
  }
}
