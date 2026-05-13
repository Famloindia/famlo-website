import { NextResponse } from "next/server";

import { syncChannexAriForFamily } from "@/lib/channex-ari-sync";
import { getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import { ensureChannexMutationAllowed } from "@/lib/channel-providers/channex/mutation-guard";
import { readChannelSetupMetadata } from "@/lib/channel-setup-state";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { loadStayUnitsForSelector } from "@/lib/stay-units";
import { createAdminSupabaseClient } from "@/lib/supabase";

type OperatorAriTestBody = {
  familyId?: string;
  providerKey?: string;
  windowDays?: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampWindowDays(value: unknown): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 7;
  return Math.max(1, Math.min(14, parsed));
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as OperatorAriTestBody;
    const familyId = asString(body.familyId);
    const providerKey = asString(body.providerKey) || "booking";
    const windowDays = clampWindowDays(body.windowDays);

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    if (providerKey !== "booking") {
      return NextResponse.json(
        { error: "Limited ARI test sync is currently available only for Booking.com through Channex." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });

    if (!authorizedResource?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!authorizedResource.isAdmin) {
      return NextResponse.json({ error: "Operator access is required." }, { status: 403 });
    }

    const access = await loadHostProAccess(supabase, familyId);
    if (!access.allowed) {
      return NextResponse.json({ error: "Famlo Pro is not active for this property." }, { status: 403 });
    }

    const [{ data: bookingRow }, { data: channexRow }, rooms, { data: roomMappings }, { data: ratePlans }] = await Promise.all([
      supabase
        .from("channel_properties")
        .select("id,metadata")
        .eq("family_id", familyId)
        .eq("provider_code", "booking")
        .maybeSingle(),
      supabase
        .from("channel_properties")
        .select("id,external_property_id,metadata")
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

    const setupMetadata = readChannelSetupMetadata(bookingRow?.metadata ?? {});
    const bookingVerified =
      setupMetadata.operator_verified_booking_connection === true ||
      setupMetadata.booking_connection_status === "verified" ||
      setupMetadata.booking_connection_status === "ready_for_assisted_go_live";

    if (!bookingVerified) {
      return NextResponse.json(
        {
          ok: false,
          status: "blocked",
          message: "Booking.com connection must be operator-verified before a limited ARI test sync can run.",
        },
        { status: 409 }
      );
    }

    const externalPropertyId = asString(channexRow?.external_property_id);
    if (!externalPropertyId) {
      return NextResponse.json(
        {
          ok: false,
          status: "create_property_first",
          message: "Create or link the Channex property before running a limited ARI test sync.",
        },
        { status: 409 }
      );
    }

    const activeRooms = rooms.filter((room) => room.isActive);
    const mappedRoomIds = new Set(
      (roomMappings ?? [])
        .filter((row) => asString(row.external_room_type_id))
        .map((row) => asString(row.stay_unit_id))
    );
    const mappedRateIds = new Set(
      (ratePlans ?? [])
        .filter((row) => asString(row.external_rate_plan_id))
        .map((row) => asString(row.stay_unit_id))
    );
    const missingRoomMappings = activeRooms.filter((room) => !mappedRoomIds.has(room.id)).map((room) => room.name);
    const missingRatePlans = activeRooms.filter((room) => !mappedRateIds.has(room.id)).map((room) => room.name);

    if (activeRooms.length === 0 || missingRoomMappings.length > 0 || missingRatePlans.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          status: "blocked",
          message: "Complete active room, room-type, and rate-plan mappings before running a limited ARI test sync.",
          activeRooms: activeRooms.length,
          missingRoomMappings,
          missingRatePlans,
        },
        { status: 409 }
      );
    }

    const blockedMutation = await ensureChannexMutationAllowed({
      supabase,
      familyId,
      action: "push_ari_limited_test",
      route: "/api/host/pro/channel/channex/operator/ari-test",
    });
    if (blockedMutation) return blockedMutation;

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

    const result = await syncChannexAriForFamily({
      supabase,
      familyId,
      hostId: authorizedResource.hostId,
      windowDays,
      action: "push_ari_limited_test",
      route: "/api/host/pro/channel/channex/operator/ari-test",
      requireActiveChannel: true,
    });

    return NextResponse.json(
      {
        ...result,
        limitedTest: true,
        providerKey,
      },
      { status: result.ok ? 200 : 502 }
    );
  } catch (error) {
    console.error("[host.pro.channel.channex.operator.ari-test] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Unable to run limited ARI test sync.",
      },
      { status: 500 }
    );
  }
}
