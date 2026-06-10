import { NextResponse } from "next/server";

import {
  fetchChannexAvailabilitySnapshot,
  fetchChannexPropertyById,
  fetchChannexRatePlansForProperty,
  fetchChannexRestrictionsSnapshot,
  fetchChannexRoomTypesForProperty,
  getChannexConfigSummary,
} from "@/lib/channel-providers/channex/client";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { loadHostProSettings } from "@/lib/host-pro-settings";
import { loadStayUnitsForSelector } from "@/lib/stay-units";
import { createAdminSupabaseClient } from "@/lib/supabase";

type VerifyBody = {
  familyId?: string;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as VerifyBody;
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
      return NextResponse.json({ ok: false, status: "failed", message: "Channex staging configuration is incomplete." }, { status: 400 });
    }

    const [settings, { data: propertyRow }, { data: roomMappingRows }, { data: ratePlanRows }, rooms] = await Promise.all([
      loadHostProSettings(supabase, familyId),
      supabase
        .from("channel_properties")
        .select("external_property_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex")
        .maybeSingle(),
      supabase
        .from("channel_room_mappings")
        .select("stay_unit_id,external_room_type_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex"),
      supabase
        .from("channel_rate_plans")
        .select("stay_unit_id,title,external_rate_plan_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex"),
      loadStayUnitsForSelector(supabase, {
        hostId: authorizedResource.hostId,
        legacyFamilyId: familyId,
      }),
    ]);

    const externalPropertyId = asString(propertyRow?.external_property_id);
    if (!externalPropertyId) {
      return NextResponse.json({ ok: false, status: "create_property_first", message: "Create provider property first." }, { status: 409 });
    }

    const mappedRoomTypeIds = ((roomMappingRows ?? []) as Array<Record<string, unknown>>)
      .map((row) => asString(row.external_room_type_id))
      .filter((value): value is string => Boolean(value));
    const mappedRatePlanIds = ((ratePlanRows ?? []) as Array<Record<string, unknown>>)
      .map((row) => asString(row.external_rate_plan_id))
      .filter((value): value is string => Boolean(value));

    if (mappedRoomTypeIds.length <= 0) {
      return NextResponse.json(
        { ok: false, status: "room_type_missing", message: "Map at least one Channex room type before verification." },
        { status: 409 }
      );
    }

    if (mappedRatePlanIds.length <= 0) {
      return NextResponse.json(
        { ok: false, status: "rate_plan_missing", message: "Map at least one Channex rate plan before verification." },
        { status: 409 }
      );
    }

    const { from, to } = getDateRange(settings.timezone || "Asia/Kolkata");
    const [propertyResult, roomTypesResult, ratePlansResult, availabilityResult, restrictionsResult] = await Promise.all([
      fetchChannexPropertyById(externalPropertyId),
      fetchChannexRoomTypesForProperty(externalPropertyId),
      fetchChannexRatePlansForProperty(externalPropertyId),
      fetchChannexAvailabilitySnapshot({ propertyId: externalPropertyId, dateFrom: from, dateTo: to }),
      fetchChannexRestrictionsSnapshot({ propertyId: externalPropertyId, dateFrom: from, dateTo: to }),
    ]);

    const roomsById = new Map(rooms.map((room) => [room.id, room.name]));
    const roomTypesById = new Map(roomTypesResult.data.map((roomType) => [roomType.id, roomType]));
    const ratePlansById = new Map(ratePlansResult.data.map((ratePlan) => [ratePlan.id, ratePlan]));

    if (!propertyResult.ok || !propertyResult.data?.id) {
      return NextResponse.json(
        {
          ok: false,
          status: "property_not_found",
          message: "Saved Channex property mapping was not found in staging. Re-run Create staging property to repair it.",
        },
        { status: 502 }
      );
    }

    const mappedRoomRows = ((roomMappingRows ?? []) as Array<Record<string, unknown>>).map((row) => {
      const externalRoomTypeId = asString(row.external_room_type_id);
      return {
        famloRoomName: roomsById.get(asString(row.stay_unit_id) ?? "") ?? "Famlo room",
        externalRoomTypeId,
        found: Boolean(externalRoomTypeId && roomTypesById.has(externalRoomTypeId)),
      };
    });

    const mappedRateRows = ((ratePlanRows ?? []) as Array<Record<string, unknown>>).map((row) => {
      const externalRatePlanId = asString(row.external_rate_plan_id);
      return {
        famloRateTitle: asString(row.title) ?? "Standard Rate",
        externalRatePlanId,
        found: Boolean(externalRatePlanId && ratePlansById.has(externalRatePlanId)),
      };
    });

    const availabilityVisibleCount = mappedRoomRows.filter(
      (row) => row.externalRoomTypeId && availabilityResult.data[row.externalRoomTypeId]
    ).length;
    const rateVisibleCount = mappedRateRows.filter(
      (row) => row.externalRatePlanId && restrictionsResult.data[row.externalRatePlanId]
    ).length;

    const status = propertyResult.ok && roomTypesResult.ok && ratePlansResult.ok && availabilityResult.ok && restrictionsResult.ok
      ? "completed"
      : "failed";
    const message =
      status === "completed"
        ? "Verified Channex structure via API. If the API shows room/rate but the Channex UI is empty, check property selector, group, filters, or refresh."
        : "Structure verification hit at least one Channex read error. Review counts and mappings below.";

    const { error: logError } = await supabase.from("channel_sync_logs").insert({
      family_id: familyId,
      provider_code: "channex",
      action: "verify_channex_structure",
      status: status === "completed" ? "success" : "failed",
      message,
      payload: {
        external_property_id: externalPropertyId,
        room_type_ids: mappedRoomRows.map((row) => row.externalRoomTypeId).filter(Boolean),
        rate_plan_ids: mappedRateRows.map((row) => row.externalRatePlanId).filter(Boolean),
        room_types_found_count: roomTypesResult.data.length,
        rate_plans_found_count: ratePlansResult.data.length,
        availability_visible_count: availabilityVisibleCount,
        rate_visible_count: rateVisibleCount,
      },
    } as never);

    if (logError) {
      const messageText = String(logError.message ?? "");
      if (!/relation|does not exist|schema cache/i.test(messageText)) {
        console.error("[host.pro.channel.channex.structure.verify] log failed:", logError);
      }
    }

    return NextResponse.json(
      {
        ok: status === "completed",
        status,
        message,
        externalPropertyId,
        property: propertyResult.data,
        roomTypesFoundCount: roomTypesResult.data.length,
        ratePlansFoundCount: ratePlansResult.data.length,
        roomTypes: roomTypesResult.data,
        ratePlans: ratePlansResult.data,
        mappedRoomRows,
        mappedRateRows,
        availabilityVisibleCount,
        rateVisibleCount,
        dateRange: { from, to },
      },
      { status: status === "completed" ? 200 : 502 }
    );
  } catch (error) {
    console.error("[host.pro.channel.channex.structure.verify] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Failed to verify Channex structure.",
      },
      { status: 500 }
    );
  }
}
