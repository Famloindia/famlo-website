import { NextResponse } from "next/server";

import { createChannexRoomType, getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { loadStayUnitsForSelector } from "@/lib/stay-units";

type RoomsBody = {
  familyId?: string;
};

type RoomResult = {
  stayUnitId: string;
  name: string;
  status: "already_mapped" | "created" | "failed" | "missing_fields" | "skipped_inactive";
  externalRoomTypeId: string | null;
  missingFields: string[];
  message: string;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function addMissing(list: string[], value: unknown, label: string): void {
  if (!value) {
    list.push(label);
  }
}

function asPositiveInteger(value: unknown, fallback = 1): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.trunc(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : fallback;
  }
  return fallback;
}

function mapRoomKind(unitType: string | null): "room" | "dorm" {
  const normalized = unitType?.trim().toLowerCase() ?? "";
  return normalized.includes("dorm") ? "dorm" : "room";
}

async function logRoomTypeEvent(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  status: "success" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: "create_room_type",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[host.pro.channel.channex.rooms] log failed:", error);
    }
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as RoomsBody;
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

    const [{ data: channelProperty }, rooms] = await Promise.all([
      supabase
        .from("channel_properties")
        .select("id,family_id,provider_code,external_property_id,sync_status,metadata")
        .eq("family_id", familyId)
        .eq("provider_code", "channex")
        .maybeSingle(),
      loadStayUnitsForSelector(supabase, {
        hostId: authorizedResource.hostId,
        legacyFamilyId: familyId,
      }),
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

    const activeRooms = rooms.filter((room) => room.isActive);
    const { data: existingMappings } = await supabase
      .from("channel_room_mappings")
      .select("id,family_id,stay_unit_id,provider_code,external_room_type_id,count_of_rooms,sync_status,metadata")
      .eq("family_id", familyId)
      .eq("provider_code", "channex");

    const mappingsByRoomId = new Map(
      ((existingMappings ?? []) as Array<Record<string, unknown>>).map((row) => [
        asString(row.stay_unit_id) ?? "",
        row,
      ])
    );

    const results: RoomResult[] = [];

    for (const room of activeRooms) {
      const roomId = room.id;
      const existingMapping = mappingsByRoomId.get(roomId);
      const existingExternalRoomTypeId = asString(existingMapping?.external_room_type_id);

      if (existingExternalRoomTypeId) {
        results.push({
          stayUnitId: roomId,
          name: room.name,
          status: "already_mapped",
          externalRoomTypeId: existingExternalRoomTypeId,
          missingFields: [],
          message: "already_mapped",
        });
        continue;
      }

      const roomName = asString(room.name);
      const roomType = asString(room.unitType);
      const maxGuests = Math.max(0, room.maxGuests);
      const basePrice = room.priceFullday;
      const countOfRooms = asPositiveInteger(
        (existingMapping?.count_of_rooms as number | string | undefined) ??
        (existingMapping?.metadata && typeof existingMapping.metadata === "object"
          ? (existingMapping.metadata as Record<string, unknown>).count_of_rooms
          : undefined),
        1
      );

      const missingFields: string[] = [];
      addMissing(missingFields, roomName, "room_name");
      addMissing(missingFields, roomType, "room_type");
      addMissing(missingFields, maxGuests > 0 ? String(maxGuests) : null, "max_guests");
      addMissing(missingFields, basePrice > 0 ? String(basePrice) : null, "base_price");
      addMissing(missingFields, countOfRooms > 0 ? String(countOfRooms) : null, "count_of_rooms");

      if (missingFields.length > 0) {
        const message = `Room is missing required fields: ${missingFields.join(", ")}.`;
        results.push({
          stayUnitId: roomId,
          name: room.name,
          status: "missing_fields",
          externalRoomTypeId: null,
          missingFields,
          message,
        });

        await logRoomTypeEvent({
          supabase,
          familyId,
          status: "failed",
          message,
          payload: {
            room_id: roomId,
            missing_fields: missingFields,
          },
        });
        continue;
      }

      const occAdults = Math.max(1, maxGuests);
      const occChildren = 0;
      const occInfants = 0;
      const defaultOccupancy = occAdults;

      const result = await createChannexRoomType({
        propertyId: externalPropertyId,
        title: roomName ?? "Famlo Room",
        countOfRooms,
        occAdults,
        occChildren,
        occInfants,
        defaultOccupancy,
        roomKind: mapRoomKind(roomType),
        description: asString(room.description),
      });

      if (!result.ok || !result.externalRoomTypeId) {
        results.push({
          stayUnitId: roomId,
          name: room.name,
          status: "failed",
          externalRoomTypeId: null,
          missingFields: [],
          message: result.message,
        });

        if (existingMapping?.id) {
          await supabase
            .from("channel_room_mappings")
            .update({
              external_property_id: externalPropertyId,
              sync_status: "failed",
              metadata: {
                ...((existingMapping.metadata as Record<string, unknown> | null) ?? {}),
                last_error: result.message,
                last_error_at: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            } as never)
            .eq("id", existingMapping.id);
        }

        await logRoomTypeEvent({
          supabase,
          familyId,
          status: "failed",
          message: result.message,
          payload: {
            room_id: roomId,
            http_status: result.httpStatus,
            provider_validation: result.rawValidation,
          },
        });
        continue;
      }

      const upsertPayload = {
        id: asString(existingMapping?.id) ?? undefined,
        family_id: familyId,
        stay_unit_id: roomId,
        provider_code: "channex",
        external_property_id: externalPropertyId,
        external_room_type_id: result.externalRoomTypeId,
        count_of_rooms: countOfRooms,
        sync_status: "mapped",
        metadata: {
          ...((existingMapping?.metadata as Record<string, unknown> | null) ?? {}),
          last_created_at: new Date().toISOString(),
          created_via: "channex_staging_room_type_route",
        },
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from("channel_room_mappings")
        .upsert(upsertPayload as never, { onConflict: "family_id,stay_unit_id,provider_code" });

      if (upsertError) {
        throw upsertError;
      }

      results.push({
        stayUnitId: roomId,
        name: room.name,
        status: "created",
        externalRoomTypeId: result.externalRoomTypeId,
        missingFields: [],
        message: result.message,
      });

      await logRoomTypeEvent({
        supabase,
        familyId,
        status: "success",
        message: result.message,
        payload: {
          room_id: roomId,
          external_room_type_id: result.externalRoomTypeId,
          http_status: result.httpStatus,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      status: "completed",
      propertyStatus: "created",
      results,
    });
  } catch (error) {
    console.error("[host.pro.channel.channex.rooms] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Failed to create Channex staging room types.",
      },
      { status: 500 }
    );
  }
}
