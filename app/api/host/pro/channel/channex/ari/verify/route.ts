import { NextResponse } from "next/server";

import {
  fetchChannexAvailabilitySnapshot,
  fetchChannexRestrictionsSnapshot,
  getChannexConfigSummary,
} from "@/lib/channel-providers/channex/client";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { loadHostProSettings } from "@/lib/host-pro-settings";
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

    const [settings, { data: channelProperty }, { data: roomMappings }, { data: ratePlans }] = await Promise.all([
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
        .select("stay_unit_id,external_rate_plan_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex"),
    ]);

    const externalPropertyId = asString(channelProperty?.external_property_id);
    if (!externalPropertyId) {
      return NextResponse.json({ ok: false, status: "create_property_first", message: "Create provider property first." }, { status: 409 });
    }

    const { from, to } = getDateRange(settings.timezone || "Asia/Kolkata");
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

    const mappedRoomTypeIds = ((roomMappings ?? []) as Array<Record<string, unknown>>)
      .map((row) => asString(row.external_room_type_id))
      .filter((value): value is string => Boolean(value));
    const mappedRatePlanIds = ((ratePlans ?? []) as Array<Record<string, unknown>>)
      .map((row) => asString(row.external_rate_plan_id))
      .filter((value): value is string => Boolean(value));

    const availabilityMatchedCount = mappedRoomTypeIds.filter((id) => Boolean(availabilitySnapshot.data[id])).length;
    const rateMatchedCount = mappedRatePlanIds.filter((id) => Boolean(restrictionsSnapshot.data[id])).length;

    return NextResponse.json({
      ok: availabilitySnapshot.ok && restrictionsSnapshot.ok,
      status: availabilitySnapshot.ok && restrictionsSnapshot.ok ? "completed" : "failed",
      message: availabilitySnapshot.ok && restrictionsSnapshot.ok
        ? "Fetched current Channex staging inventory for mapped rooms and rate plans."
        : `Verification fetch failed. Availability: ${availabilitySnapshot.message} Restrictions: ${restrictionsSnapshot.message}`,
      dateRange: { from, to },
      availabilityMatchedCount,
      rateMatchedCount,
      availabilityHttpStatus: availabilitySnapshot.httpStatus,
      restrictionsHttpStatus: restrictionsSnapshot.httpStatus,
    }, { status: availabilitySnapshot.ok && restrictionsSnapshot.ok ? 200 : 502 });
  } catch (error) {
    console.error("[host.pro.channel.channex.ari.verify] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Failed to verify current Channex inventory.",
      },
      { status: 500 }
    );
  }
}
