import { NextResponse } from "next/server";

import {
  pushChannexAvailability,
  pushChannexRestrictions,
  fetchChannexAvailabilitySnapshot,
  fetchChannexRestrictionsSnapshot,
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

type VerificationSummary = {
  verifiedAvailabilityCount: number;
  verifiedRateCount: number;
  availabilityMismatches: Array<{ roomTypeId: string; date: string; expected: number; actual: number | null }>;
  rateMismatches: Array<{ ratePlanId: string; date: string; expected: string; actual: string | null }>;
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

function getLocalDateString(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getDateRange(timeZone: string): { from: string; to: string } {
  const now = new Date();
  const from = getLocalDateString(now, timeZone);
  const toDate = new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000);
  const to = getLocalDateString(toDate, timeZone);
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

function normalizeWarningMessages(warnings: unknown[]): string[] {
  return warnings.flatMap((warning) => {
    if (typeof warning === "string" && warning.trim().length > 0) {
      return [warning.trim()];
    }
    if (warning && typeof warning === "object" && !Array.isArray(warning)) {
      return Object.entries(warning as Record<string, unknown>).flatMap(([key, value]) => {
        if (typeof value === "string" && value.trim().length > 0) return [`${key}: ${value.trim()}`];
        if (Array.isArray(value)) return value.map((entry) => `${key}: ${String(entry)}`);
        return [`${key}: ${JSON.stringify(value)}`];
      });
    }
    return [String(warning)];
  });
}

function verifySnapshots(input: {
  availabilitySnapshot: Record<string, Record<string, number>>;
  restrictionsSnapshot: Record<string, Record<string, Record<string, unknown>>>;
  availabilityValues: ChannexAvailabilityChange[];
  restrictionValues: ChannexRestrictionChange[];
}): VerificationSummary {
  const availabilityMismatches: VerificationSummary["availabilityMismatches"] = [];
  const rateMismatches: VerificationSummary["rateMismatches"] = [];
  let verifiedAvailabilityCount = 0;
  let verifiedRateCount = 0;

  for (const value of input.availabilityValues) {
    for (const date of enumerateDateRange(value.dateFrom, value.dateTo)) {
      const actual = input.availabilitySnapshot[value.roomTypeId]?.[date];
      if (actual === value.availability) {
        verifiedAvailabilityCount += 1;
      } else {
        availabilityMismatches.push({
          roomTypeId: value.roomTypeId,
          date,
          expected: value.availability,
          actual: typeof actual === "number" ? actual : null,
        });
      }
    }
  }

  for (const value of input.restrictionValues) {
    for (const date of enumerateDateRange(value.dateFrom, value.dateTo)) {
      const actualRestrictions = input.restrictionsSnapshot[value.ratePlanId]?.[date] ?? null;
      const actualRate = actualRestrictions?.rate;
      const actualMinStayThrough = actualRestrictions?.min_stay_through;
      const normalizedActual =
        typeof actualRate === "string"
          ? actualRate
          : typeof actualRate === "number"
            ? actualRate.toFixed(2)
            : null;
      const normalizedMinStayThrough =
        typeof actualMinStayThrough === "number"
          ? actualMinStayThrough
          : typeof actualMinStayThrough === "string" && actualMinStayThrough.trim().length > 0
            ? Number(actualMinStayThrough)
            : null;
      if (normalizedActual === value.rate && normalizedMinStayThrough === value.minStayThrough) {
        verifiedRateCount += 1;
      } else {
        rateMismatches.push({
          ratePlanId: value.ratePlanId,
          date,
          expected: `${value.rate} / min_stay_through=${value.minStayThrough}`,
          actual:
            normalizedActual != null || normalizedMinStayThrough != null
              ? `${normalizedActual ?? "null"} / min_stay_through=${normalizedMinStayThrough ?? "null"}`
              : null,
        });
      }
    }
  }

  return {
    verifiedAvailabilityCount,
    verifiedRateCount,
    availabilityMismatches,
    rateMismatches,
  };
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
    const { from, to } = getDateRange(settings.timezone || "Asia/Kolkata");

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
          minStayThrough: 1,
        });
      }
    }

    const [availabilityResult, restrictionsResult] = await Promise.all([
      pushChannexAvailability(availabilityValues),
      pushChannexRestrictions(restrictionValues),
    ]);
    const [availabilitySnapshot, restrictionsSnapshot] = await Promise.all([
      fetchChannexAvailabilitySnapshot({
        propertyId: externalPropertyId,
        dateFrom: from,
        dateTo: to,
      }),
      fetchChannexRestrictionsSnapshot({
        propertyId: externalPropertyId,
        dateFrom: from,
        dateTo: to,
      }),
    ]);
    const availabilityWarnings = normalizeWarningMessages(availabilityResult.warnings);
    const restrictionsWarnings = normalizeWarningMessages(restrictionsResult.warnings);
    const verification = availabilitySnapshot.ok && restrictionsSnapshot.ok
      ? verifySnapshots({
          availabilitySnapshot: availabilitySnapshot.data,
          restrictionsSnapshot: restrictionsSnapshot.data,
          availabilityValues,
          restrictionValues,
        })
      : {
          verifiedAvailabilityCount: 0,
          verifiedRateCount: 0,
          availabilityMismatches: [],
          rateMismatches: [],
        };
    const verificationOk =
      availabilitySnapshot.ok &&
      restrictionsSnapshot.ok &&
      verification.availabilityMismatches.length === 0 &&
      verification.rateMismatches.length === 0;
    const ok =
      availabilityResult.ok &&
      restrictionsResult.ok &&
      availabilityWarnings.length === 0 &&
      restrictionsWarnings.length === 0 &&
      verificationOk;
    const missingRoomSummaries = roomSummaries.filter((room) => room.status === "missing_fields");
    const summaryMessage = ok
      ? `30-day staging sync pushed and verified for ${eligibleRooms.length} rooms from ${from} to ${to}.`
      : verificationOk
        ? `30-day staging sync was accepted by Channex but returned warnings. Availability: ${availabilityResult.message} Restrictions: ${restrictionsResult.message}`
        : `Pushed but not verified in Channex. Availability: ${availabilityResult.message} Restrictions: ${restrictionsResult.message}`;

    await logAriPush({
      supabase,
      familyId,
      status: ok ? "success" : "failed",
      message: summaryMessage,
      payload: {
        date_range: { from, to },
        property_id: externalPropertyId,
        room_count: eligibleRooms.length,
        rate_count: eligibleRooms.length,
        room_type_ids: eligibleRooms.map((room) => room.externalRoomTypeId),
        rate_plan_ids: eligibleRooms.map((room) => room.externalRatePlanId),
        availability_response: {
          http_status: availabilityResult.httpStatus,
          message: availabilityResult.message,
          meta: availabilityResult.meta,
          warnings: availabilityWarnings,
        },
        restrictions_response: {
          http_status: restrictionsResult.httpStatus,
          message: restrictionsResult.message,
          meta: restrictionsResult.meta,
          warnings: restrictionsWarnings,
        },
        verification_summary: {
          availability_http_status: availabilitySnapshot.httpStatus,
          restrictions_http_status: restrictionsSnapshot.httpStatus,
          verified_availability_count: verification.verifiedAvailabilityCount,
          verified_rate_count: verification.verifiedRateCount,
          availability_mismatch_count: verification.availabilityMismatches.length,
          rate_mismatch_count: verification.rateMismatches.length,
        },
        skipped_rooms: missingRoomSummaries,
      },
    });

    return NextResponse.json({
      ok,
      status: ok ? "completed" : verificationOk ? "warning" : "verification_failed",
      message: summaryMessage,
      dateRange: { from, to },
      eligibleRooms: eligibleRooms.length,
      availabilityChanges: availabilityValues.length,
      restrictionChanges: restrictionValues.length,
      verifiedAvailabilityCount: verification.verifiedAvailabilityCount,
      verifiedRateCount: verification.verifiedRateCount,
      warnings: [...availabilityWarnings, ...restrictionsWarnings],
      availabilityVerificationOk: availabilitySnapshot.ok,
      restrictionsVerificationOk: restrictionsSnapshot.ok,
      verificationFailed: !verificationOk,
      verificationSummary: {
        availabilityMismatchCount: verification.availabilityMismatches.length,
        rateMismatchCount: verification.rateMismatches.length,
        availabilityMismatches: verification.availabilityMismatches.slice(0, 10),
        rateMismatches: verification.rateMismatches.slice(0, 10),
      },
      rooms: roomSummaries,
      availabilityMessage: availabilityResult.message,
      restrictionsMessage: restrictionsResult.message,
      availabilityWarnings,
      restrictionsWarnings,
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
