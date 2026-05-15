import { NextResponse } from "next/server";

import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";
import { isChannelProviderKey, mergeChannelSetupMetadata, readChannelSetupState } from "@/lib/channel-setup-state";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { loadStayUnitsForSelector } from "@/lib/stay-units";
import { createAdminSupabaseClient } from "@/lib/supabase";

type CatalogRoomType = {
  id: string;
  title: string | null;
};

type CatalogRatePlan = {
  id: string;
  title: string | null;
  room_type_id: string | null;
};

type ApplyPreviewBody = {
  familyId?: string;
  providerKey?: string;
  roomIds?: string[];
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

function asCatalogRoomTypes(value: unknown): CatalogRoomType[] {
  return Array.isArray(value)
    ? value
        .map((item) => {
          const record = asObject(item);
          const id = asNullableString(record.id);
          if (!id) return null;
          return {
            id,
            title: asNullableString(record.title),
          };
        })
        .filter((item): item is CatalogRoomType => Boolean(item))
    : [];
}

function asCatalogRatePlans(value: unknown): CatalogRatePlan[] {
  return Array.isArray(value)
    ? value
        .map((item) => {
          const record = asObject(item);
          const id = asNullableString(record.id);
          if (!id) return null;
          return {
            id,
            title: asNullableString(record.title),
            room_type_id: asNullableString(record.room_type_id),
          };
        })
        .filter((item): item is CatalogRatePlan => Boolean(item))
    : [];
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function storageProviderCode(providerKey: ChannelProviderKey): string {
  return providerKey === "booking" ? "channex" : providerKey;
}

function scoreRoomMatch(roomName: string, roomType: string, optionTitle: string | null): number {
  const roomHaystack = normalize(`${roomName} ${roomType}`);
  const option = normalize(optionTitle);
  if (!roomHaystack || !option) return 0;
  if (roomHaystack === option) return 100;
  if (roomHaystack.includes(option) || option.includes(roomHaystack)) return 88;

  const roomTokens = new Set(roomHaystack.split(" ").filter(Boolean));
  const optionTokens = option.split(" ").filter(Boolean);
  const overlap = optionTokens.filter((token) => roomTokens.has(token)).length;
  if (overlap === 0) return 0;
  return Math.round((overlap / Math.max(roomTokens.size, optionTokens.length)) * 80);
}

function confidenceFromScore(score: number): "high" | "medium" | "low" {
  if (score >= 95) return "high";
  if (score >= 60) return "medium";
  return "low";
}

function pickRoomType(roomName: string, roomType: string, roomTypes: CatalogRoomType[]): { roomType: CatalogRoomType | null; score: number } {
  let winner: CatalogRoomType | null = null;
  let bestScore = 0;
  for (const option of roomTypes) {
    const score = scoreRoomMatch(roomName, roomType, option.title);
    if (score > bestScore) {
      bestScore = score;
      winner = option;
    }
  }
  return { roomType: winner, score: bestScore };
}

function pickRatePlan(roomTypeId: string | null, ratePlans: CatalogRatePlan[]): CatalogRatePlan | null {
  const scoped = roomTypeId ? ratePlans.filter((ratePlan) => !ratePlan.room_type_id || ratePlan.room_type_id === roomTypeId) : ratePlans;
  if (scoped.length === 0) return null;
  return (
    scoped.find((ratePlan) => normalize(ratePlan.title).includes("standard")) ??
    scoped.find((ratePlan) => normalize(ratePlan.title).includes("room only")) ??
    scoped[0] ??
    null
  );
}

function buildPreviewRows(rooms: Awaited<ReturnType<typeof loadStayUnitsForSelector>>, roomTypes: CatalogRoomType[], ratePlans: CatalogRatePlan[]) {
  return rooms
    .filter((room) => room.id && room.id !== "placeholder")
    .map((room) => {
      const roomMatch = pickRoomType(room.name, room.unitType, roomTypes);
      const ratePlan = pickRatePlan(roomMatch.roomType?.id ?? null, ratePlans);
      const confidence = confidenceFromScore(roomMatch.score);
      return {
        roomId: room.id,
        famloRoomName: room.name,
        famloRoomType: room.unitType,
        suggestedRoomTypeId: roomMatch.roomType?.id ?? null,
        suggestedRoomTypeTitle: roomMatch.roomType?.title ?? null,
        suggestedRatePlanId: ratePlan?.id ?? null,
        suggestedRatePlanTitle: ratePlan?.title ?? null,
        confidence,
        autoApplicable: Boolean(roomMatch.roomType?.id && ratePlan?.id && confidence !== "low"),
      };
    });
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

    const auth = await authorize(request, familyId);
    if (auth.error) return auth.error;
    const { supabase, authorizedResource } = auth;

    const [{ data: providerRow, error: providerError }, rooms] = await Promise.all([
      supabase
        .from("channel_properties")
        .select("metadata")
        .eq("family_id", familyId)
        .eq("provider_code", providerKey)
        .maybeSingle(),
      loadStayUnitsForSelector(supabase, {
        hostId: authorizedResource?.hostId,
        legacyFamilyId: familyId,
      }),
    ]);

    if (providerError) throw providerError;

    const metadata = asObject(providerRow?.metadata);
    const catalog = asObject(metadata.provider_mapping_catalog);
    const roomTypes = asCatalogRoomTypes(catalog.room_types);
    const ratePlans = asCatalogRatePlans(catalog.rate_plans);

    const rows = buildPreviewRows(rooms, roomTypes, ratePlans);

    return NextResponse.json({
      ok: true,
      refreshedAt: asNullableString(catalog.refreshed_at),
      suggestions: rows,
      autoApplicableCount: rows.filter((row) => row.autoApplicable).length,
    });
  } catch (error) {
    console.error("[host.pro.channel.preview] load failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to build provider preview." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as ApplyPreviewBody;
    const familyId = asString(body.familyId);
    const providerKeyInput = asString(body.providerKey);
    const roomIds = Array.isArray(body.roomIds) ? body.roomIds.map((item) => asString(item)).filter(Boolean) : [];

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }
    if (!isChannelProviderKey(providerKeyInput)) {
      return NextResponse.json({ error: "providerKey is invalid." }, { status: 400 });
    }
    const providerKey = providerKeyInput;

    const auth = await authorize(request, familyId);
    if (auth.error) return auth.error;
    const { supabase, authorizedResource } = auth;

    const [{ data: providerRow, error: providerError }, { data: channexRow, error: channexError }, rooms] = await Promise.all([
      supabase
        .from("channel_properties")
        .select("id,metadata,sync_status,external_property_id,created_at,updated_at")
        .eq("family_id", familyId)
        .eq("provider_code", providerKey)
        .maybeSingle(),
      supabase
        .from("channel_properties")
        .select("external_property_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex")
        .maybeSingle(),
      loadStayUnitsForSelector(supabase, {
        hostId: authorizedResource?.hostId,
        legacyFamilyId: familyId,
      }),
    ]);

    if (providerError) throw providerError;
    if (channexError) throw channexError;

    const metadata = asObject(providerRow?.metadata);
    const catalog = asObject(metadata.provider_mapping_catalog);
    const roomTypes = asCatalogRoomTypes(catalog.room_types);
    const ratePlans = asCatalogRatePlans(catalog.rate_plans);
    const previewRows = buildPreviewRows(rooms, roomTypes, ratePlans);
    const selectedRows = previewRows.filter((row) => row.autoApplicable && (roomIds.length === 0 || roomIds.includes(row.roomId)));

    if (selectedRows.length === 0) {
      return NextResponse.json({ error: "No preview rows are ready to apply yet." }, { status: 400 });
    }

    const providerCode = storageProviderCode(providerKey);
    const externalPropertyId = asNullableString(channexRow?.external_property_id);
    const nowIso = new Date().toISOString();

    for (const row of selectedRows) {
      const roomPayload = {
        family_id: familyId,
        stay_unit_id: row.roomId,
        provider_code: providerCode,
        external_property_id: externalPropertyId,
        external_room_type_id: row.suggestedRoomTypeId,
        count_of_rooms: 1,
        sync_status: "mapped",
        metadata: {
          source: "preview_auto_mapping",
          updated_at: nowIso,
          confidence: row.confidence,
          provider_key: providerKey,
        },
        updated_at: nowIso,
      };

      const ratePayload = {
        family_id: familyId,
        stay_unit_id: row.roomId,
        provider_code: providerCode,
        external_rate_plan_id: row.suggestedRatePlanId,
        title: row.suggestedRatePlanTitle ?? "Standard Rate",
        meal_plan: "room_only",
        sync_status: "mapped",
        metadata: {
          source: "preview_auto_mapping",
          updated_at: nowIso,
          confidence: row.confidence,
          provider_key: providerKey,
        },
        updated_at: nowIso,
      };

      const { error: roomError } = await supabase
        .from("channel_room_mappings")
        .upsert(roomPayload as never, { onConflict: "family_id,provider_code,stay_unit_id" });
      if (roomError) throw roomError;

      const { error: rateError } = await supabase
        .from("channel_rate_plans")
        .upsert(ratePayload as never, { onConflict: "family_id,provider_code,stay_unit_id" });
      if (rateError) throw rateError;
    }

    const nextMetadata = mergeChannelSetupMetadata(metadata, {
      status: "matching_needed",
      currentStep: "price_matching",
      updatedAt: nowIso,
      metadataPatch: {
        room_matching_reviewed: true,
        price_matching_reviewed: true,
        provider_structure_blockers: [],
      },
    });

    const { error: stateError } = await supabase
      .from("channel_properties")
      .upsert(
        {
          family_id: familyId,
          provider_code: providerKey,
          external_property_id: typeof providerRow?.external_property_id === "string" ? providerRow.external_property_id : null,
          sync_status: typeof providerRow?.sync_status === "string" ? providerRow.sync_status : "not_connected",
          metadata: nextMetadata,
          updated_at: nowIso,
        } as never,
        { onConflict: "family_id,provider_code" }
      );
    if (stateError) throw stateError;

    const { data: savedRow, error: savedError } = await supabase
      .from("channel_properties")
      .select("id,external_property_id,sync_status,metadata,created_at,updated_at")
      .eq("family_id", familyId)
      .eq("provider_code", providerKey)
      .maybeSingle();
    if (savedError) throw savedError;

    const state = savedRow
      ? readChannelSetupState({
          id: typeof savedRow.id === "string" ? savedRow.id : "",
          familyId,
          providerCode: providerKey,
          externalPropertyId: typeof savedRow.external_property_id === "string" ? savedRow.external_property_id : null,
          propertyModel: null,
          propertyType: null,
          syncStatus: typeof savedRow.sync_status === "string" ? savedRow.sync_status : "not_connected",
          lastSyncedAt: null,
          metadata: asObject(savedRow.metadata),
          createdAt: typeof savedRow.created_at === "string" ? savedRow.created_at : null,
          updatedAt: typeof savedRow.updated_at === "string" ? savedRow.updated_at : null,
        })
      : null;

    return NextResponse.json({
      ok: true,
      appliedCount: selectedRows.length,
      message: "Suggested mappings were confirmed and applied.",
      state,
    });
  } catch (error) {
    console.error("[host.pro.channel.preview] apply failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to apply preview mappings." },
      { status: 500 }
    );
  }
}
