import { NextResponse } from "next/server";

import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";
import { isChannelProviderKey } from "@/lib/channel-setup-state";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { loadStayUnitsForSelector } from "@/lib/stay-units";
import { createAdminSupabaseClient } from "@/lib/supabase";

type MappingCatalogRoomType = {
  id: string;
  title: string | null;
  property_id: string | null;
  count_of_rooms: number | null;
};

type MappingCatalogRatePlan = {
  id: string;
  title: string | null;
  property_id: string | null;
  room_type_id: string | null;
};

type MappingSaveBody = {
  familyId?: string;
  providerKey?: string;
  stayUnitId?: string;
  externalRoomTypeId?: string | null;
  externalRatePlanId?: string | null;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  const text = asString(value);
  return text.length > 0 ? text : null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asCatalogRoomTypes(value: unknown): MappingCatalogRoomType[] {
  return Array.isArray(value)
    ? value
        .map((item) => {
          const record = asObject(item);
          const id = asNullableString(record.id);
          if (!id) return null;
          return {
            id,
            title: asNullableString(record.title),
            property_id: asNullableString(record.property_id),
            count_of_rooms: typeof record.count_of_rooms === "number" && Number.isFinite(record.count_of_rooms)
              ? record.count_of_rooms
              : typeof record.count_of_rooms === "string" && record.count_of_rooms.trim().length > 0
                ? Number(record.count_of_rooms)
                : null,
          };
        })
        .filter((item): item is MappingCatalogRoomType => Boolean(item))
    : [];
}

function asCatalogRatePlans(value: unknown): MappingCatalogRatePlan[] {
  return Array.isArray(value)
    ? value
        .map((item) => {
          const record = asObject(item);
          const id = asNullableString(record.id);
          if (!id) return null;
          return {
            id,
            title: asNullableString(record.title),
            property_id: asNullableString(record.property_id),
            room_type_id: asNullableString(record.room_type_id),
          };
        })
        .filter((item): item is MappingCatalogRatePlan => Boolean(item))
    : [];
}

function resolveStorageProviderCode(providerKey: ChannelProviderKey): string {
  return providerKey === "booking" ? "channex" : providerKey;
}

async function logMappingEvent(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  providerCode: string;
  status: "success" | "failed";
  message: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: input.providerCode,
    action: "save_provider_mapping",
    status: input.status,
    message: input.message,
    payload: input.payload ?? {},
  } as never);

  if (error) {
    console.error("[host.pro.channel.mappings] log failed:", error);
  }
}

async function authorize(request: Request, familyId: string) {
  const supabase = createAdminSupabaseClient();
  const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });
  if (!authorizedResource?.familyId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), supabase, authorizedResource: null };
  }

  const access = await loadHostProAccess(supabase, familyId);
  if (!access.allowed) {
    return { error: NextResponse.json({ error: "Famlo Pro is not active for this property." }, { status: 403 }), supabase, authorizedResource };
  }

  return { error: null, supabase, authorizedResource };
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const familyId = asString(url.searchParams.get("familyId"));
    const providerKeyInput = asString(url.searchParams.get("providerKey"));

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    if (!isChannelProviderKey(providerKeyInput)) {
      return NextResponse.json({ error: "providerKey is invalid." }, { status: 400 });
    }
    const providerKey = providerKeyInput;
    const storageProviderCode = resolveStorageProviderCode(providerKey);

    const auth = await authorize(request, familyId);
    if (auth.error) return auth.error;
    const { supabase, authorizedResource } = auth;

    const [{ data: providerRow, error: providerError }, { data: mappingRows, error: mappingError }, { data: ratePlanRows, error: ratePlanError }, rooms] = await Promise.all([
      supabase
        .from("channel_properties")
        .select("metadata")
        .eq("family_id", familyId)
        .eq("provider_code", providerKey)
        .maybeSingle(),
      supabase
        .from("channel_room_mappings")
        .select("stay_unit_id,external_room_type_id,sync_status,metadata")
        .eq("family_id", familyId)
        .eq("provider_code", storageProviderCode),
      supabase
        .from("channel_rate_plans")
        .select("stay_unit_id,external_rate_plan_id,title,meal_plan,sync_status,metadata")
        .eq("family_id", familyId)
        .eq("provider_code", storageProviderCode),
      loadStayUnitsForSelector(supabase, {
        hostId: authorizedResource?.hostId,
        legacyFamilyId: familyId,
      }),
    ]);

    if (providerError) throw providerError;
    if (mappingError) throw mappingError;
    if (ratePlanError) throw ratePlanError;

    const metadata = asObject(providerRow?.metadata);
    const catalog = asObject(metadata.provider_mapping_catalog);
    const roomTypes = asCatalogRoomTypes(catalog.room_types);
    const ratePlans = asCatalogRatePlans(catalog.rate_plans);

    const mappingByRoom = new Map(
      (mappingRows ?? []).map((row) => [
        asString(row.stay_unit_id),
        {
          externalRoomTypeId: asNullableString(row.external_room_type_id),
          syncStatus: asNullableString(row.sync_status),
        },
      ])
    );

    const ratePlanByRoom = new Map(
      (ratePlanRows ?? []).map((row) => [
        asString(row.stay_unit_id),
        {
          externalRatePlanId: asNullableString(row.external_rate_plan_id),
          title: asNullableString(row.title),
          mealPlan: asNullableString(row.meal_plan),
          syncStatus: asNullableString(row.sync_status),
        },
      ])
    );

    return NextResponse.json({
      ok: true,
      providerKey,
      storageProviderCode,
      catalog: {
        refreshedAt: asNullableString(catalog.refreshed_at),
        roomTypes,
        ratePlans,
      },
      rooms: rooms
        .filter((room) => room.id && room.id !== "placeholder")
        .map((room) => ({
          id: room.id,
          name: room.name,
          unitType: room.unitType,
          isActive: room.isActive,
          basePrice: room.priceFullday,
          currentRoomTypeId: mappingByRoom.get(room.id)?.externalRoomTypeId ?? null,
          currentRatePlanId: ratePlanByRoom.get(room.id)?.externalRatePlanId ?? null,
        })),
    });
  } catch (error) {
    console.error("[host.pro.channel.mappings] load failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load provider mappings." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let familyId = "";
  let storageProviderCode = "";

  try {
    const body = (await request.json()) as MappingSaveBody;
    familyId = asString(body.familyId);
    const providerKeyInput = asString(body.providerKey);
    const stayUnitId = asString(body.stayUnitId);
    const externalRoomTypeId = body.externalRoomTypeId === undefined ? undefined : asNullableString(body.externalRoomTypeId);
    const externalRatePlanId = body.externalRatePlanId === undefined ? undefined : asNullableString(body.externalRatePlanId);

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    if (!isChannelProviderKey(providerKeyInput)) {
      return NextResponse.json({ error: "providerKey is invalid." }, { status: 400 });
    }
    const providerKey = providerKeyInput;
    storageProviderCode = resolveStorageProviderCode(providerKey);

    if (!stayUnitId) {
      return NextResponse.json({ error: "stayUnitId is required." }, { status: 400 });
    }

    const auth = await authorize(request, familyId);
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const [{ data: providerRow, error: providerError }, { data: channexRow, error: channexError }, { data: existingRoomMapping, error: existingRoomMappingError }, { data: existingRatePlan, error: existingRatePlanError }] = await Promise.all([
      supabase
        .from("channel_properties")
        .select("metadata")
        .eq("family_id", familyId)
        .eq("provider_code", providerKey)
        .maybeSingle(),
      supabase
        .from("channel_properties")
        .select("external_property_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex")
        .maybeSingle(),
      supabase
        .from("channel_room_mappings")
        .select("id")
        .eq("family_id", familyId)
        .eq("provider_code", storageProviderCode)
        .eq("stay_unit_id", stayUnitId)
        .maybeSingle(),
      supabase
        .from("channel_rate_plans")
        .select("id,title,meal_plan")
        .eq("family_id", familyId)
        .eq("provider_code", storageProviderCode)
        .eq("stay_unit_id", stayUnitId)
        .maybeSingle(),
    ]);

    if (providerError) throw providerError;
    if (channexError) throw channexError;
    if (existingRoomMappingError) throw existingRoomMappingError;
    if (existingRatePlanError) throw existingRatePlanError;

    const metadata = asObject(providerRow?.metadata);
    const catalog = asObject(metadata.provider_mapping_catalog);
    const roomTypes = asCatalogRoomTypes(catalog.room_types);
    const ratePlans = asCatalogRatePlans(catalog.rate_plans);

    const selectedRoomType =
      externalRoomTypeId === undefined
        ? null
        : externalRoomTypeId === null
          ? null
          : roomTypes.find((roomType) => roomType.id === externalRoomTypeId) ?? null;
    const selectedRatePlan =
      externalRatePlanId === undefined
        ? null
        : externalRatePlanId === null
          ? null
          : ratePlans.find((ratePlan) => ratePlan.id === externalRatePlanId) ?? null;

    if (externalRoomTypeId !== undefined && externalRoomTypeId !== null && !selectedRoomType) {
      return NextResponse.json({ error: "Selected room type is not available in the current Channex catalog." }, { status: 400 });
    }

    if (externalRatePlanId !== undefined && externalRatePlanId !== null && !selectedRatePlan) {
      return NextResponse.json({ error: "Selected rate plan is not available in the current Channex catalog." }, { status: 400 });
    }

    if (
      selectedRoomType &&
      selectedRatePlan &&
      selectedRatePlan.room_type_id &&
      selectedRatePlan.room_type_id !== selectedRoomType.id
    ) {
      return NextResponse.json({ error: "Selected rate plan does not belong to the selected room type." }, { status: 400 });
    }

    const externalPropertyId = asNullableString(channexRow?.external_property_id);
    const nowIso = new Date().toISOString();

    if (externalRoomTypeId !== undefined) {
      const roomPayload = {
        id: asNullableString(existingRoomMapping?.id) ?? undefined,
        family_id: familyId,
        stay_unit_id: stayUnitId,
        provider_code: storageProviderCode,
        external_property_id: externalPropertyId,
        external_room_type_id: externalRoomTypeId,
        count_of_rooms: 1,
        sync_status: externalRoomTypeId ? "mapped" : "not_mapped",
        metadata: {
          source: "wizard_mapping",
          updated_at: nowIso,
          provider_key: providerKey,
        },
        updated_at: nowIso,
      };

      const { error } = await supabase
        .from("channel_room_mappings")
        .upsert(roomPayload as never, { onConflict: "family_id,provider_code,stay_unit_id" });
      if (error) throw error;
    }

    if (externalRatePlanId !== undefined) {
      const ratePayload = {
        id: asNullableString(existingRatePlan?.id) ?? undefined,
        family_id: familyId,
        stay_unit_id: stayUnitId,
        provider_code: storageProviderCode,
        external_rate_plan_id: externalRatePlanId,
        title: selectedRatePlan?.title ?? asNullableString(existingRatePlan?.title) ?? "Standard Rate",
        meal_plan: asNullableString(existingRatePlan?.meal_plan) ?? "room_only",
        sync_status: externalRatePlanId ? "mapped" : "not_mapped",
        metadata: {
          source: "wizard_mapping",
          updated_at: nowIso,
          provider_key: providerKey,
        },
        updated_at: nowIso,
      };

      const { error } = await supabase
        .from("channel_rate_plans")
        .upsert(ratePayload as never, { onConflict: "family_id,provider_code,stay_unit_id" });
      if (error) throw error;
    }

    await logMappingEvent({
      supabase,
      familyId,
      providerCode: storageProviderCode,
      status: "success",
      message: "Saved provider room/rate mapping from wizard.",
      payload: {
        provider_key: providerKey,
        stay_unit_id: stayUnitId,
        external_room_type_id: externalRoomTypeId ?? null,
        external_rate_plan_id: externalRatePlanId ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Mapping saved.",
    });
  } catch (error) {
    if (familyId && storageProviderCode) {
      await logMappingEvent({
        supabase: createAdminSupabaseClient(),
        familyId,
        providerCode: storageProviderCode,
        status: "failed",
        message: error instanceof Error ? error.message : "Unable to save provider mapping.",
      });
    }

    console.error("[host.pro.channel.mappings] save failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to save provider mapping." },
      { status: 500 }
    );
  }
}
