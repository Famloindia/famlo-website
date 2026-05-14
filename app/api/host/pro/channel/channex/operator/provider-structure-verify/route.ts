import { NextResponse } from "next/server";

import {
  buildProviderRefreshState,
  inspectProviderConnectionInChannex,
} from "@/lib/channel-providers/provider-adapter";
import { CHANNEL_PROVIDER_REGISTRY } from "@/lib/channel-providers/provider-registry";
import { isChannelProviderKey, mergeChannelSetupMetadata, readChannelSetupMetadata } from "@/lib/channel-setup-state";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { loadStayUnitsForSelector } from "@/lib/stay-units";
import { createAdminSupabaseClient } from "@/lib/supabase";

type ProviderStructureVerifyBody = {
  familyId?: string;
  providerKey?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function resolveStorageProviderCode(providerKey: string): string {
  return providerKey === "booking" ? "channex" : providerKey;
}

async function logStructureVerification(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  providerCode: string;
  status: "success" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: input.providerCode,
    action: "verify_provider_mapped_structure",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[host.pro.channel.channex.operator.provider-structure-verify] log failed:", error);
    }
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as ProviderStructureVerifyBody;
    const familyId = asString(body.familyId);
    const providerKeyInput = asString(body.providerKey);

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    if (!isChannelProviderKey(providerKeyInput) || providerKeyInput === "booking") {
      return NextResponse.json({ error: "A non-Booking providerKey is required." }, { status: 400 });
    }

    const providerKey = providerKeyInput;
    const storageProviderCode = resolveStorageProviderCode(providerKey);
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

    const [
      { data: providerRow, error: providerError },
      { data: channexRow, error: channexError },
      rooms,
      { data: roomMappings, error: roomMappingsError },
      { data: ratePlans, error: ratePlansError },
    ] = await Promise.all([
      supabase
        .from("channel_properties")
        .select("id,external_property_id,sync_status,metadata")
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
        hostId: authorizedResource.hostId,
        legacyFamilyId: familyId,
      }),
      supabase
        .from("channel_room_mappings")
        .select("stay_unit_id,external_room_type_id")
        .eq("family_id", familyId)
        .eq("provider_code", storageProviderCode),
      supabase
        .from("channel_rate_plans")
        .select("stay_unit_id,external_rate_plan_id")
        .eq("family_id", familyId)
        .eq("provider_code", storageProviderCode),
    ]);

    if (providerError) throw providerError;
    if (channexError) throw channexError;
    if (roomMappingsError) throw roomMappingsError;
    if (ratePlansError) throw ratePlansError;

    const externalPropertyId = asString(channexRow?.external_property_id);
    const providerDefinition = CHANNEL_PROVIDER_REGISTRY.find((provider) => provider.key === providerKey);

    if (!externalPropertyId) {
      return NextResponse.json(
        {
          ok: false,
          status: "unavailable",
          message: "Create or link the Channex property before verifying mapped structure.",
          blockers: ["Channex property is missing."],
          nextAction: "Create or link the Channex property first.",
        },
        { status: 409 }
      );
    }

    const inspectionResult = await inspectProviderConnectionInChannex(providerKey, externalPropertyId);
    if (!inspectionResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          message: inspectionResult.message,
        },
        { status: 502 }
      );
    }

    const inspection = inspectionResult.inspection;
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
    const setupMetadata = readChannelSetupMetadata(providerRow?.metadata ?? {});
    const blockers = [
      inspection.channelAttached ? null : `${providerDefinition?.displayName ?? providerKey} channel is not attached in Channex yet.`,
      inspection.channelActive || inspection.channelAttached ? null : `${providerDefinition?.displayName ?? providerKey} channel is not active or visible yet.`,
      inspection.roomTypesFoundCount > 0 ? null : "No provider room types are visible in Channex yet.",
      inspection.ratePlansFoundCount > 0 ? null : "No provider rate plans are visible in Channex yet.",
      activeRooms.length > 0 ? null : "No active Famlo room is available.",
      missingRoomMappings.length === 0 ? null : `Room mappings missing for ${missingRoomMappings.join(", ")}.`,
      missingRatePlans.length === 0 ? null : `Rate plan mappings missing for ${missingRatePlans.join(", ")}.`,
      providerKey === "mmt" && !setupMetadata.provider_access_token_stored && !inspection.channelAttached
        ? "MMT access token is not stored securely yet."
        : null,
    ].filter((item): item is string => Boolean(item));

    const readyForTestSyncReview = blockers.length === 0;
    const nowIso = new Date().toISOString();
    const refreshState = buildProviderRefreshState({
      providerKey,
      currentMetadata: asObject(providerRow?.metadata),
      inspection,
    });
    const nextMetadata = mergeChannelSetupMetadata(refreshState.metadata, {
      status: readyForTestSyncReview ? "ready_for_test_sync" : inspection.channelAttached ? "needs_review" : "connection_requested",
      currentStep: readyForTestSyncReview ? "test_sync" : inspection.channelAttached ? "test_sync" : "connection",
      lastError: readyForTestSyncReview ? null : blockers.join(" "),
      metadataPatch: {
        provider_structure_verified: readyForTestSyncReview,
        provider_structure_verified_at: readyForTestSyncReview ? nowIso : null,
        provider_structure_blockers: blockers,
        provider_ready_for_test_sync_review: readyForTestSyncReview,
        provider_ready_for_test_sync_review_at: readyForTestSyncReview ? nowIso : null,
        operator_notes: readyForTestSyncReview
          ? `${providerDefinition?.displayName ?? providerKey} mapped structure verified for operator test sync review. No sync was run.`
          : `${providerDefinition?.displayName ?? providerKey} mapped structure check found blockers. No sync was run.`,
      },
      updatedAt: nowIso,
    });

    const { error: upsertError } = await supabase
      .from("channel_properties")
      .upsert(
        {
          id: typeof providerRow?.id === "string" ? providerRow.id : undefined,
          family_id: familyId,
          provider_code: providerKey,
          external_property_id: typeof providerRow?.external_property_id === "string" ? providerRow.external_property_id : null,
          sync_status: refreshState.syncStatus,
          metadata: nextMetadata,
          updated_at: nowIso,
        } as never,
        { onConflict: "family_id,provider_code" }
      );

    if (upsertError) throw upsertError;

    const nextAction = readyForTestSyncReview
      ? "Ready for operator test sync review."
      : blockers[0] ?? "Review the mapped structure blockers before continuing.";
    const message = readyForTestSyncReview
      ? `${providerDefinition?.displayName ?? providerKey} mapped structure is verified for operator test sync review.`
      : `${providerDefinition?.displayName ?? providerKey} mapped structure is not ready yet.`;

    await logStructureVerification({
      supabase,
      familyId,
      providerCode: providerKey,
      status: readyForTestSyncReview ? "success" : "failed",
      message,
      payload: {
        external_property_id: externalPropertyId,
        channel_attached: inspection.channelAttached,
        channel_active: inspection.channelActive,
        active_rooms: activeRooms.length,
        room_types_found_count: inspection.roomTypesFoundCount,
        rate_plans_found_count: inspection.ratePlansFoundCount,
        room_mappings_ready: mappedRoomIds.size,
        rate_mappings_ready: mappedRateIds.size,
        missing_room_mappings: missingRoomMappings,
        missing_rate_plans: missingRatePlans,
        blockers,
      },
    });

    return NextResponse.json(
      {
        ok: readyForTestSyncReview,
        status: readyForTestSyncReview ? "ready" : inspection.channelAttached ? "blocked" : "assisted_only",
        message,
        nextAction,
        readyForTestSyncReview,
        blockers,
        inspection: {
          propertyTitle: inspection.propertyTitle,
          hotelId: inspection.hotelId,
          activeChannelId: inspection.activeChannelId,
          discoveredChannelTitle: inspection.discoveredChannelTitle,
          channelAttached: inspection.channelAttached,
          channelActive: inspection.channelActive,
          matchedChannelCount: inspection.matchedChannelCount,
          roomTypesFoundCount: inspection.roomTypesFoundCount,
          ratePlansFoundCount: inspection.ratePlansFoundCount,
        },
        mappingCounts: {
          activeRooms: activeRooms.length,
          roomMappingsReady: activeRooms.length - missingRoomMappings.length,
          rateMappingsReady: activeRooms.length - missingRatePlans.length,
        },
      },
      { status: readyForTestSyncReview ? 200 : 409 }
    );
  } catch (error) {
    console.error("[host.pro.channel.channex.operator.provider-structure-verify] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Unable to verify provider mapped structure.",
      },
      { status: 500 }
    );
  }
}
