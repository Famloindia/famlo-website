import { NextResponse } from "next/server";

import { syncChannexAriForFamily } from "@/lib/channex-ari-sync";
import { getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import {
  getChannelProviderCapabilities,
  resolveChannelStorageProviderCode,
} from "@/lib/channel-providers/provider-capabilities";
import { ensureChannexMutationAllowed } from "@/lib/channel-providers/channex/mutation-guard";
import { getChannelProviderDefinition } from "@/lib/channel-providers/provider-registry";
import { isChannelProviderKey, mergeChannelSetupMetadata, readChannelSetupMetadata } from "@/lib/channel-setup-state";
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

    if (!isChannelProviderKey(providerKey)) {
      return NextResponse.json({ error: "providerKey is invalid." }, { status: 400 });
    }

    const capabilities = getChannelProviderCapabilities(providerKey);
    if (!capabilities.supportsAriSync || capabilities.mode === "feed_only") {
      return NextResponse.json(
        {
          error: "This provider does not currently support ARI sync in this Famlo flow.",
          providerStatus: capabilities.displayStatus,
        },
        { status: 409 }
      );
    }

    if (!capabilities.supportsSelectedPropertySyncTest) {
      return NextResponse.json(
        {
          ok: false,
          status: "assisted_only",
          message: "This provider can use Channex sync, but the limited test route still requires operator-assisted review in Famlo.",
          providerStatus: capabilities.displayStatus,
        },
        { status: 409 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const storageProviderCode = resolveChannelStorageProviderCode(providerKey);
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

    const [{ data: providerRow }, { data: channexRow }, rooms, { data: roomMappings }, { data: ratePlans }] = await Promise.all([
      supabase
        .from("channel_properties")
        .select("id,metadata")
        .eq("family_id", familyId)
        .eq("provider_code", providerKey)
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
        .eq("provider_code", storageProviderCode),
      supabase
        .from("channel_rate_plans")
        .select("stay_unit_id,external_rate_plan_id")
        .eq("family_id", familyId)
        .eq("provider_code", storageProviderCode),
    ]);

    const setupMetadata = readChannelSetupMetadata(providerRow?.metadata ?? {});
    const providerVerified =
      providerKey === "booking"
        ? setupMetadata.operator_verified_booking_connection === true ||
          setupMetadata.booking_connection_status === "verified" ||
          setupMetadata.booking_connection_status === "ready_for_assisted_go_live"
        : setupMetadata.provider_structure_verified === true &&
          setupMetadata.provider_ready_for_test_sync_review === true;

    if (!providerVerified) {
      return NextResponse.json(
        {
          ok: false,
          status: "blocked",
          message:
            providerKey === "booking"
              ? "Booking.com connection must be operator-verified before a limited ARI test sync can run."
              : `${getChannelProviderDefinition(providerKey).displayName} mapped structure must be verified before a limited ARI test sync can run.`,
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
      providerKey,
      hostId: authorizedResource.hostId,
      windowDays,
      action: "push_ari_limited_test",
      route: "/api/host/pro/channel/channex/operator/ari-test",
      requireActiveChannel: true,
    });

    if (providerKey !== "booking" && providerRow?.id) {
      const nowIso = new Date().toISOString();
      const metadata = mergeChannelSetupMetadata(providerRow.metadata ?? {}, {
        status: result.ok ? "needs_review" : "ready_for_test_sync",
        currentStep: "test_sync",
        lastError: result.ok ? null : result.message,
        metadataPatch: {
          operator_notes: result.ok
            ? `${getChannelProviderDefinition(providerKey).displayName} limited ARI sync passed for ${result.windowDays} day(s). Booking feed verification should run before assisted go-live review.`
            : `${getChannelProviderDefinition(providerKey).displayName} limited ARI sync failed or needs review: ${result.message}`,
        },
        updatedAt: nowIso,
      });

      const { error: updateError } = await supabase
        .from("channel_properties")
        .update({
          metadata,
          updated_at: nowIso,
        } as never)
        .eq("id", providerRow.id);

      if (updateError) throw updateError;
    }

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
