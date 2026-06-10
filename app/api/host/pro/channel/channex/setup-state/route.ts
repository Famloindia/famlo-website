import { NextResponse } from "next/server";

import { fetchChannexPropertyById } from "@/lib/channel-providers/channex/client";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { loadHostProChannelFoundation } from "@/lib/host-pro-channel-foundation";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { loadStayUnitsForSelector } from "@/lib/stay-units";

type SetupStateBody = {
  familyId?: string;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as SetupStateBody;
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

    const [channelFoundation, rooms] = await Promise.all([
      loadHostProChannelFoundation(supabase, familyId),
      loadStayUnitsForSelector(supabase, {
        hostId: authorizedResource.hostId,
        legacyFamilyId: familyId,
      }),
    ]);

    const primaryProperty =
      channelFoundation.properties.find(
        (property) => property.providerCode === "channex" && Boolean(property.externalPropertyId)
      ) ??
      channelFoundation.properties.find((property) => property.providerCode === "channex") ??
      null;
    let activeExternalPropertyId = primaryProperty?.externalPropertyId ?? null;
    let propertyStatus = primaryProperty?.syncStatus ?? "not_created";
    let statusMessage: string | null = null;

    if (activeExternalPropertyId) {
      const propertyLookup = await fetchChannexPropertyById(activeExternalPropertyId);
      if (!propertyLookup.ok || !propertyLookup.data?.id) {
        activeExternalPropertyId = null;
        propertyStatus = "needs_repair";
        statusMessage = "Saved Channex property was deleted or is no longer accessible. Recreate connection.";
      }
    }

    const roomMappingsByRoomId = new Map(
      channelFoundation.roomMappings.map((mapping) => [mapping.stayUnitId, mapping] as const)
    );
    const ratePlansByRoomId = new Map(
      channelFoundation.ratePlans
        .filter((plan) => Boolean(plan.stayUnitId))
        .map((plan) => [plan.stayUnitId as string, plan] as const)
    );
    const activeRooms = rooms.filter((room) => room.isActive);
    const roomMappings = activeRooms.map((room) => {
      const mapping = roomMappingsByRoomId.get(room.id) ?? null;
      return {
        stayUnitId: room.id,
        name: room.name,
        status: mapping?.externalRoomTypeId ? "mapped" : mapping?.syncStatus ?? "not_mapped",
        externalRoomTypeId: mapping?.externalRoomTypeId ?? null,
      };
    });
    const ratePlans = activeRooms.map((room) => {
      const plan = ratePlansByRoomId.get(room.id) ?? null;
      return {
        stayUnitId: room.id,
        name: room.name,
        title: plan?.title ?? `Standard Rate - ${room.name}`,
        status: plan?.externalRatePlanId ? "mapped" : plan?.syncStatus ?? "not_mapped",
        externalRatePlanId: plan?.externalRatePlanId ?? null,
      };
    });

    return NextResponse.json({
      ok: true,
      propertyStatus,
      externalPropertyId: activeExternalPropertyId,
      statusMessage,
      activeRoomsCount: activeRooms.length,
      roomMappingsReadyCount: activeExternalPropertyId
        ? roomMappings.filter((mapping) => Boolean(mapping.externalRoomTypeId)).length
        : 0,
      ratePlansReadyCount: activeExternalPropertyId
        ? ratePlans.filter((plan) => Boolean(plan.externalRatePlanId)).length
        : 0,
      roomMappings: activeExternalPropertyId ? roomMappings : roomMappings.map((mapping) => ({ ...mapping, status: "needs_repair", externalRoomTypeId: null })),
      ratePlans: activeExternalPropertyId ? ratePlans : ratePlans.map((plan) => ({ ...plan, status: "needs_repair", externalRatePlanId: null })),
    });
  } catch (error) {
    console.error("[host.pro.channel.channex.setup-state] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to load the latest Channex setup state.",
      },
      { status: 500 }
    );
  }
}
