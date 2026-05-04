import { NextResponse } from "next/server";

import {
  pushChannexAvailability,
  pushChannexRestrictions,
  getChannexConfigSummary,
  type ChannexAvailabilityChange,
  type ChannexRestrictionChange,
} from "@/lib/channel-providers/channex/client";
import { loadCanonicalCalendar } from "@/lib/calendar";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import {
  loadHostProSettings,
  PRO_DEFAULT_CURRENCY,
  PRO_DEFAULT_MEAL_PLAN,
} from "@/lib/host-pro-settings";
import { enumerateDateRange } from "@/lib/platform-utils";
import { loadStayUnitsForSelector } from "@/lib/stay-units";
import { createAdminSupabaseClient } from "@/lib/supabase";

type AriPushBody = {
  familyId?: string;
};

type RoomSummary = {
  stayUnitId: string;
  name: string;
  status: "eligible" | "missing_fields";
  missingFields: string[];
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeCurrency(value: string | null): string | null {
  return value ? value.trim().toUpperCase() : null;
}

function addMissing(list: string[], value: unknown, label: string): void {
  if (!value) list.push(label);
}

function formatPriceForChannex(value: number): string {
  return value.toFixed(2);
}

function getDateRange(): { from: string; to: string } {
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const toDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 29));
  const to = toDate.toISOString().slice(0, 10);
  return { from, to };
}

function buildSegments(
  dates: string[],
  availabilityByDate: Record<string, number>,
  rateByDate: Record<string, string>,
  stopSellByDate: Record<string, boolean>
): Array<{
  dateFrom: string;
  dateTo: string;
  availability: number;
  rate: string;
  stopSell: boolean;
}> {
  const segments: Array<{
    dateFrom: string;
    dateTo: string;
    availability: number;
    rate: string;
    stopSell: boolean;
  }> = [];

  for (const date of dates) {
    const availability = availabilityByDate[date] ?? 0;
    const rate = rateByDate[date] ?? "0.00";
    const stopSell = stopSellByDate[date] ?? availability <= 0;
    const last = segments[segments.length - 1];

    if (
      last &&
      last.availability === availability &&
      last.rate === rate &&
      last.stopSell === stopSell
    ) {
      last.dateTo = date;
      continue;
    }

    segments.push({
      dateFrom: date,
      dateTo: date,
      availability,
      rate,
      stopSell,
    });
  }

  return segments;
}

async function logAriPush(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  status: "success" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: "push_ari_30_day",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[host.pro.channel.channex.ari.push] log failed:", error);
    }
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as AriPushBody;
    const familyId = asString(body.familyId) ?? "";

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
          status: "failed",
          configured: false,
          message: "Channex staging configuration is incomplete.",
        },
        { status: 400 }
      );
    }

    const { from, to } = getDateRange();
    const [settings, { data: channelProperty }, rooms, { data: roomMappings }, { data: ratePlans }] = await Promise.all([
      loadHostProSettings(supabase, familyId),
      supabase
        .from("channel_properties")
        .select("external_property_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex")
        .maybeSingle(),
      loadStayUnitsForSelector(supabase, {
        hostId: authorizedResource.hostId,
        legacyFamilyId: familyId,
      }),
      supabase
        .from("channel_room_mappings")
        .select("stay_unit_id,external_room_type_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex"),
      supabase
        .from("channel_rate_plans")
        .select("stay_unit_id,external_rate_plan_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex"),
    ]);

    const externalPropertyId = asString(channelProperty?.external_property_id);
    if (!externalPropertyId) {
      return NextResponse.json(
        {
          ok: false,
          status: "create_property_first",
          message: "Create provider property first.",
        },
        { status: 409 }
      );
    }

    const roomMappingsByRoomId = new Map(
      ((roomMappings ?? []) as Array<Record<string, unknown>>).map((row) => [
        asString(row.stay_unit_id) ?? "",
        asString(row.external_room_type_id),
      ])
    );
    const ratePlansByRoomId = new Map(
      ((ratePlans ?? []) as Array<Record<string, unknown>>).map((row) => [
        asString(row.stay_unit_id) ?? "",
        asString(row.external_rate_plan_id),
      ])
    );

    const currency = normalizeCurrency(asString(settings.currency) ?? PRO_DEFAULT_CURRENCY);
    const activeRooms = rooms.filter((room) => room.isActive);
    const roomSummaries: RoomSummary[] = [];
    const eligibleRooms: Array<{
      roomId: string;
      roomName: string;
      externalRoomTypeId: string;
      externalRatePlanId: string;
      basePrice: number;
    }> = [];

    for (const room of activeRooms) {
      const externalRoomTypeId = roomMappingsByRoomId.get(room.id) ?? null;
      const externalRatePlanId = ratePlansByRoomId.get(room.id) ?? null;
      const missingFields: string[] = [];

      addMissing(missingFields, externalPropertyId, "external_property_id");
      addMissing(missingFields, externalRoomTypeId, "external_room_type_id");
      addMissing(missingFields, externalRatePlanId, "external_rate_plan_id");
      addMissing(missingFields, room.priceFullday > 0 ? String(room.priceFullday) : null, "base_price");
      addMissing(missingFields, currency && currency.length === 3 ? currency : null, "currency");
      addMissing(missingFields, from && to ? `${from}:${to}` : null, "date_range");

      if (missingFields.length > 0) {
        roomSummaries.push({
          stayUnitId: room.id,
          name: room.name,
          status: "missing_fields",
          missingFields,
        });
        continue;
      }

      roomSummaries.push({
        stayUnitId: room.id,
        name: room.name,
        status: "eligible",
        missingFields: [],
      });
      eligibleRooms.push({
        roomId: room.id,
        roomName: room.name,
        externalRoomTypeId: externalRoomTypeId ?? "",
        externalRatePlanId: externalRatePlanId ?? "",
        basePrice: room.priceFullday,
      });
    }

    if (eligibleRooms.length === 0) {
      const missingRoomSummaries = roomSummaries.filter((room) => room.status === "missing_fields");
      const message = "No eligible active mapped rooms were ready for 30-day staging sync.";
      await logAriPush({
        supabase,
        familyId,
        status: "failed",
        message,
        payload: {
          date_range: { from, to },
          room_count: 0,
          rate_count: 0,
          skipped_rooms: missingRoomSummaries,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          status: "no_eligible_rooms",
          message,
          dateRange: { from, to },
          rooms: roomSummaries,
        },
        { status: 422 }
      );
    }

    const dates = enumerateDateRange(from, to);
    const roomCalendars = await Promise.all(
      eligibleRooms.map(async (room) => ({
        room,
        events: await loadCanonicalCalendar(supabase, {
          ownerType: "stay_unit",
          ownerId: room.roomId,
          from,
          to,
        }),
      }))
    );

    const availabilityValues: ChannexAvailabilityChange[] = [];
    const restrictionValues: ChannexRestrictionChange[] = [];

    for (const item of roomCalendars) {
      const blockedDates = new Set<string>();
      for (const event of item.events) {
        if (!event.isBlocking) continue;
        for (const date of enumerateDateRange(event.startDate, event.endDate)) {
          if (date >= from && date <= to) {
            blockedDates.add(date);
          }
        }
      }

      const availabilityByDate: Record<string, number> = {};
      const rateByDate: Record<string, string> = {};
      const stopSellByDate: Record<string, boolean> = {};
      for (const date of dates) {
        const blocked = blockedDates.has(date);
        availabilityByDate[date] = blocked ? 0 : 1;
        rateByDate[date] = formatPriceForChannex(item.room.basePrice);
        stopSellByDate[date] = blocked;
      }

      const segments = buildSegments(dates, availabilityByDate, rateByDate, stopSellByDate);
      for (const segment of segments) {
        availabilityValues.push({
          propertyId: externalPropertyId,
          roomTypeId: item.room.externalRoomTypeId,
          dateFrom: segment.dateFrom,
          dateTo: segment.dateTo,
          availability: segment.availability,
        });
        restrictionValues.push({
          propertyId: externalPropertyId,
          ratePlanId: item.room.externalRatePlanId,
          dateFrom: segment.dateFrom,
          dateTo: segment.dateTo,
          rate: segment.rate,
          stopSell: segment.stopSell,
          minStay: 1,
        });
      }
    }

    const [availabilityResult, restrictionsResult] = await Promise.all([
      pushChannexAvailability(availabilityValues),
      pushChannexRestrictions(restrictionValues),
    ]);

    const ok = availabilityResult.ok && restrictionsResult.ok;
    const missingRoomSummaries = roomSummaries.filter((room) => room.status === "missing_fields");
    const summaryMessage = ok
      ? `30-day staging sync pushed for ${eligibleRooms.length} rooms from ${from} to ${to}.`
      : `30-day staging sync failed. Availability: ${availabilityResult.message} Restrictions: ${restrictionsResult.message}`;

    await logAriPush({
      supabase,
      familyId,
      status: ok ? "success" : "failed",
      message: summaryMessage,
      payload: {
        date_range: { from, to },
        room_count: eligibleRooms.length,
        rate_count: eligibleRooms.length,
        availability_http_status: availabilityResult.httpStatus,
        restrictions_http_status: restrictionsResult.httpStatus,
        skipped_rooms: missingRoomSummaries,
      },
    });

    return NextResponse.json({
      ok,
      status: ok ? "completed" : "failed",
      message: summaryMessage,
      dateRange: { from, to },
      eligibleRooms: eligibleRooms.length,
      availabilityChanges: availabilityValues.length,
      restrictionChanges: restrictionValues.length,
      rooms: roomSummaries,
      availabilityMessage: availabilityResult.message,
      restrictionsMessage: restrictionsResult.message,
    }, { status: ok ? 200 : 502 });
  } catch (error) {
    console.error("[host.pro.channel.channex.ari.push] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Failed to push Channex staging ARI.",
      },
      { status: 500 }
    );
  }
}
