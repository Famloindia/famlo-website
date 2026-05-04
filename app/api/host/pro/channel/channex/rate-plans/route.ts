import { NextResponse } from "next/server";

import { createChannexRatePlan, getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import {
  PRO_DEFAULT_CURRENCY,
  PRO_DEFAULT_MEAL_PLAN,
  PRO_DEFAULT_RATE_PLAN_NAME,
  loadHostProSettings,
} from "@/lib/host-pro-settings";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { loadStayUnitsForSelector } from "@/lib/stay-units";

type RatePlansBody = {
  familyId?: string;
};

type RatePlanResult = {
  stayUnitId: string;
  name: string;
  title: string;
  status: "already_mapped" | "created" | "failed" | "missing_fields";
  externalRatePlanId: string | null;
  missingFields: string[];
  message: string;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function addMissing(list: string[], value: unknown, label: string): void {
  if (!value) list.push(label);
}

function normalizeCurrency(value: string | null): string | null {
  return value ? value.trim().toUpperCase() : null;
}

function normalizeMealType(value: string | null): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  const allowed = new Set([
    "none",
    "all_inclusive",
    "breakfast",
    "lunch",
    "dinner",
    "american",
    "bed_and_breakfast",
    "buffet_breakfast",
    "carribean_breakfast",
    "continental_breakfast",
    "english_breakfast",
    "european_plan",
    "family_plan",
    "full_board",
    "full_breakfast",
    "half_board",
    "room_only",
    "self_catering",
    "bermuda",
    "dinner_bed_and_breakfast_plan",
    "family_american",
    "breakfast_and_lunch",
    "lunch_and_dinner",
  ]);

  return allowed.has(normalized) ? normalized : "room_only";
}

async function logRatePlanEvent(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  status: "success" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: "create_rate_plan",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[host.pro.channel.channex.rate-plans] log failed:", error);
    }
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as RatePlansBody;
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

    const [{ data: channelProperty }, settings, rooms, { data: existingRoomMappings }, { data: existingRatePlans }] = await Promise.all([
      supabase
        .from("channel_properties")
        .select("id,family_id,provider_code,external_property_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex")
        .maybeSingle(),
      loadHostProSettings(supabase, familyId),
      loadStayUnitsForSelector(supabase, {
        hostId: authorizedResource.hostId,
        legacyFamilyId: familyId,
      }),
      supabase
        .from("channel_room_mappings")
        .select("id,family_id,stay_unit_id,provider_code,external_room_type_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex"),
      supabase
        .from("channel_rate_plans")
        .select("id,family_id,stay_unit_id,provider_code,external_rate_plan_id,title,meal_plan,sync_status,metadata")
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

    const activeRooms = rooms.filter((room) => room.isActive);
    const roomMappingsByRoomId = new Map(
      ((existingRoomMappings ?? []) as Array<Record<string, unknown>>).map((row) => [
        asString(row.stay_unit_id) ?? "",
        row,
      ])
    );

    const missingRoomTypeMappings = activeRooms.filter((room) => {
      const mapping = roomMappingsByRoomId.get(room.id);
      return !asString(mapping?.external_room_type_id);
    });

    if (missingRoomTypeMappings.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          status: "create_room_types_first",
          message: "Create room types first.",
        },
        { status: 409 }
      );
    }

    const ratePlansByCompositeKey = new Map(
      ((existingRatePlans ?? []) as Array<Record<string, unknown>>).map((row) => {
        const stayUnitId = asString(row.stay_unit_id) ?? "";
        const title = asString(row.title) ?? "";
        return [`${stayUnitId}::${title}`, row] as const;
      })
    );

    const baseTitle = asString(settings.standardRatePlanName) ?? PRO_DEFAULT_RATE_PLAN_NAME;
    const defaultMealPlan = normalizeMealType(asString(settings.defaultMealPlan) ?? PRO_DEFAULT_MEAL_PLAN);
    const currency = normalizeCurrency(asString(settings.currency) ?? PRO_DEFAULT_CURRENCY) ?? PRO_DEFAULT_CURRENCY;
    const results: RatePlanResult[] = [];

    for (const room of activeRooms) {
      const roomMapping = roomMappingsByRoomId.get(room.id);
      const externalRoomTypeId = asString(roomMapping?.external_room_type_id);
      const roomName = asString(room.name);
      const roomBasePrice = room.priceFullday;
      const effectiveTitle = `${baseTitle} - ${room.name}`.trim();
      const existingRatePlan = ratePlansByCompositeKey.get(`${room.id}::${effectiveTitle}`);
      const existingExternalRatePlanId = asString(existingRatePlan?.external_rate_plan_id);

      if (existingExternalRatePlanId) {
        results.push({
          stayUnitId: room.id,
          name: room.name,
          title: effectiveTitle,
          status: "already_mapped",
          externalRatePlanId: existingExternalRatePlanId,
          missingFields: [],
          message: "already_mapped",
        });
        continue;
      }

      const missingFields: string[] = [];
      addMissing(missingFields, externalRoomTypeId, "external_room_type_id");
      addMissing(missingFields, roomName, "room_name");
      addMissing(missingFields, roomBasePrice > 0 ? String(roomBasePrice) : null, "base_price");
      addMissing(missingFields, baseTitle, "standard_rate_plan_name");
      addMissing(missingFields, defaultMealPlan, "default_meal_plan");
      addMissing(missingFields, currency && currency.length === 3 ? currency : null, "currency");

      if (missingFields.length > 0) {
        const message = `Rate plan is missing required fields: ${missingFields.join(", ")}.`;
        results.push({
          stayUnitId: room.id,
          name: room.name,
          title: effectiveTitle,
          status: "missing_fields",
          externalRatePlanId: null,
          missingFields,
          message,
        });

        await logRatePlanEvent({
          supabase,
          familyId,
          status: "failed",
          message,
          payload: {
            room_id: room.id,
            external_room_type_id: externalRoomTypeId,
            missing_fields: missingFields,
          },
        });
        continue;
      }

      const occupancy = Math.max(1, room.maxGuests);
      const result = await createChannexRatePlan({
        title: effectiveTitle,
        propertyId: externalPropertyId,
        roomTypeId: externalRoomTypeId ?? "",
        currency,
        mealType: defaultMealPlan,
        occupancy,
      });

      if (!result.ok || !result.externalRatePlanId) {
        results.push({
          stayUnitId: room.id,
          name: room.name,
          title: effectiveTitle,
          status: "failed",
          externalRatePlanId: null,
          missingFields: [],
          message: result.message,
        });

        if (existingRatePlan?.id) {
          await supabase
            .from("channel_rate_plans")
            .update({
              sync_status: "failed",
              metadata: {
                ...((existingRatePlan.metadata as Record<string, unknown> | null) ?? {}),
                last_error: result.message,
                last_error_at: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            } as never)
            .eq("id", existingRatePlan.id);
        }

        await logRatePlanEvent({
          supabase,
          familyId,
          status: "failed",
          message: result.message,
          payload: {
            room_id: room.id,
            external_room_type_id: externalRoomTypeId,
            http_status: result.httpStatus,
            provider_validation: result.rawValidation,
          },
        });
        continue;
      }

      const upsertPayload = {
        id: asString(existingRatePlan?.id) ?? undefined,
        family_id: familyId,
        stay_unit_id: room.id,
        provider_code: "channex",
        external_rate_plan_id: result.externalRatePlanId,
        title: effectiveTitle,
        meal_plan: defaultMealPlan,
        sync_status: "mapped",
        metadata: {
          ...((existingRatePlan?.metadata as Record<string, unknown> | null) ?? {}),
          external_room_type_id: externalRoomTypeId,
          property_id: externalPropertyId,
          base_rate_plan_name: baseTitle,
          last_created_at: new Date().toISOString(),
          created_via: "channex_staging_rate_plan_route",
        },
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from("channel_rate_plans")
        .upsert(upsertPayload as never, { onConflict: "family_id,stay_unit_id,provider_code,title" });

      if (upsertError) {
        throw upsertError;
      }

      results.push({
        stayUnitId: room.id,
        name: room.name,
        title: effectiveTitle,
        status: "created",
        externalRatePlanId: result.externalRatePlanId,
        missingFields: [],
        message: result.message,
      });

      await logRatePlanEvent({
        supabase,
        familyId,
        status: "success",
        message: result.message,
        payload: {
          room_id: room.id,
          external_room_type_id: externalRoomTypeId,
          external_rate_plan_id: result.externalRatePlanId,
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
    console.error("[host.pro.channel.channex.rate-plans] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Failed to create Channex staging rate plans.",
      },
      { status: 500 }
    );
  }
}
