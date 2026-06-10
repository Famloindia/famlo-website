import { NextResponse } from "next/server";

import {
  getChannexConfigSummary,
} from "@/lib/channel-providers/channex/client";
import {
  buildProviderRefreshState,
  inspectProviderConnectionInChannex,
} from "@/lib/channel-providers/provider-adapter";
import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";
import { isChannelProviderKey, readChannelSetupState } from "@/lib/channel-setup-state";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type ProviderRefreshBody = {
  familyId?: string;
  providerKey?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function logRefreshEvent(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  providerKey: ChannelProviderKey;
  status: "success" | "failed";
  message: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: input.providerKey,
    action: "refresh_provider_connection",
    status: input.status,
    message: input.message,
    payload: input.payload ?? {},
  } as never);

  if (error) {
    console.error("[host.pro.channel.channex.provider-refresh] log failed:", error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = createAdminSupabaseClient();
  let familyId = "";
  let providerKeyForLog: ChannelProviderKey | null = null;

  try {
    const body = (await request.json()) as ProviderRefreshBody;
    familyId = asString(body.familyId);
    const providerKeyInput = asString(body.providerKey);

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    if (!isChannelProviderKey(providerKeyInput)) {
      return NextResponse.json({ error: "providerKey is invalid." }, { status: 400 });
    }
    const providerKey = providerKeyInput;
    providerKeyForLog = providerKey;

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
      return NextResponse.json({ ok: false, status: "failed", error: "Channex configuration is incomplete." }, { status: 503 });
    }

    const [{ data: channexRow, error: channexLookupError }, { data: providerRow, error: providerLookupError }] = await Promise.all([
      supabase
        .from("channel_properties")
        .select("id,external_property_id,metadata,sync_status,created_at,updated_at")
        .eq("family_id", familyId)
        .eq("provider_code", "channex")
        .maybeSingle(),
      supabase
        .from("channel_properties")
        .select("id,external_property_id,metadata,sync_status,created_at,updated_at")
        .eq("family_id", familyId)
        .eq("provider_code", providerKey)
        .maybeSingle(),
    ]);

    if (channexLookupError) throw channexLookupError;
    if (providerLookupError) throw providerLookupError;

    const externalPropertyId =
      typeof channexRow?.external_property_id === "string" && channexRow.external_property_id.trim().length > 0
        ? channexRow.external_property_id.trim()
        : null;

    if (!externalPropertyId) {
      return NextResponse.json(
        {
          ok: false,
          status: "missing_property",
          error: "Create the Channex property first before refreshing provider connection state.",
        },
        { status: 409 }
      );
    }

    const inspectionResult = await inspectProviderConnectionInChannex(providerKey, externalPropertyId);
    if (!inspectionResult.ok) {
      throw new Error(inspectionResult.message);
    }
    const inspection = inspectionResult.inspection;
    const currentMetadata = asRecord(providerRow?.metadata);
    const refreshState = buildProviderRefreshState({
      providerKey,
      currentMetadata,
      inspection,
    });
    const nextMetadata = refreshState.metadata;
    const nowIso = inspection.structureRefreshedAt;

    const payload = {
      family_id: familyId,
      provider_code: providerKey,
      external_property_id: typeof providerRow?.external_property_id === "string" ? providerRow.external_property_id : null,
      sync_status: refreshState.syncStatus,
      metadata: nextMetadata,
      updated_at: nowIso,
    };

    const { error: upsertError } = await supabase
      .from("channel_properties")
      .upsert(payload as never, { onConflict: "family_id,provider_code" });
    if (upsertError) throw upsertError;

    const { data: savedRow, error: savedError } = await supabase
      .from("channel_properties")
      .select("id,family_id,provider_code,external_property_id,sync_status,metadata,created_at,updated_at")
      .eq("family_id", familyId)
      .eq("provider_code", providerKey)
      .maybeSingle();
    if (savedError) throw savedError;

    await logRefreshEvent({
      supabase,
      familyId,
      providerKey,
      status: "success",
      message: inspection.channelAttached
        ? "Refreshed provider connection state from Channex."
        : "Refreshed Channex structure, but a matching provider channel was not detected yet.",
      payload: {
        external_property_id: externalPropertyId,
        matched_channel_count: inspection.matchedChannelCount,
        active_channel_id: inspection.activeChannelId,
        room_types_found_count: inspection.roomTypesFoundCount,
        rate_plans_found_count: inspection.ratePlansFoundCount,
      },
    });

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
          metadata: asRecord(savedRow.metadata),
          createdAt: typeof savedRow.created_at === "string" ? savedRow.created_at : null,
          updatedAt: typeof savedRow.updated_at === "string" ? savedRow.updated_at : null,
        })
      : null;

    return NextResponse.json({
      ok: true,
      status: inspection.channelAttached ? "channel_visible" : "channel_not_detected",
      message: inspection.channelAttached
        ? "Real Channex channel state was loaded for this property."
        : "No matching provider channel was detected yet on this Channex property.",
      verification: {
        propertyTitle: inspection.propertyTitle,
        hotelId: inspection.hotelId,
        activeChannelId: inspection.activeChannelId,
        activeChannelTitle: inspection.activeChannelTitle,
        channelAttached: inspection.channelAttached,
        channelActive: inspection.channelActive,
        matchedChannelCount: inspection.matchedChannelCount,
        roomTypesFoundCount: inspection.roomTypesFoundCount,
        ratePlansFoundCount: inspection.ratePlansFoundCount,
        structureRefreshedAt: inspection.structureRefreshedAt,
      },
      catalog: (nextMetadata.provider_mapping_catalog as Record<string, unknown>) ?? null,
      state,
    });
  } catch (error) {
    if (familyId && providerKeyForLog) {
      await logRefreshEvent({
        supabase,
        familyId,
        providerKey: providerKeyForLog,
        status: "failed",
        message: error instanceof Error ? error.message : "Unable to refresh provider connection state.",
      });
    }

    console.error("[host.pro.channel.channex.provider-refresh] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        error: error instanceof Error ? error.message : "Unable to refresh provider connection state.",
      },
      { status: 500 }
    );
  }
}
