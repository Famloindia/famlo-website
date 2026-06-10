import { NextResponse } from "next/server";

import {
  buildProviderRefreshState,
  inspectProviderConnectionInChannex,
} from "@/lib/channel-providers/provider-adapter";
import { CHANNEL_PROVIDER_REGISTRY, type ChannelProviderKey } from "@/lib/channel-providers/provider-registry";
import { isChannelProviderKey, mergeChannelSetupMetadata, readChannelSetupState } from "@/lib/channel-setup-state";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type ProviderVerifyAction = "check_channel_attachment" | "mark_ota_approved" | "mark_failed";

type ProviderVerifyBody = {
  familyId?: string;
  providerKey?: string;
  action?: ProviderVerifyAction;
  reason?: string | null;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isProviderVerifyAction(value: string): value is ProviderVerifyAction {
  return value === "check_channel_attachment" || value === "mark_ota_approved" || value === "mark_failed";
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as ProviderVerifyBody;
    const familyId = asString(body.familyId);
    const providerKey = asString(body.providerKey);
    const action = asString(body.action);
    const reason = asString(body.reason);

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    if (!isChannelProviderKey(providerKey)) {
      return NextResponse.json({ error: "providerKey is invalid." }, { status: 400 });
    }

    if (providerKey === "booking") {
      return NextResponse.json({ error: "Use the Booking.com Channex verification route for Booking.com." }, { status: 400 });
    }

    if (!isProviderVerifyAction(action)) {
      return NextResponse.json({ error: "action is invalid." }, { status: 400 });
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

    const { data: existingRow, error: lookupError } = await supabase
      .from("channel_properties")
      .select("id,family_id,provider_code,external_property_id,sync_status,metadata,created_at,updated_at")
      .eq("family_id", familyId)
      .eq("provider_code", providerKey)
      .maybeSingle();

    if (lookupError) throw lookupError;

    const { data: channexRow, error: channexLookupError } = await supabase
      .from("channel_properties")
      .select("external_property_id")
      .eq("family_id", familyId)
      .eq("provider_code", "channex")
      .maybeSingle();

    if (channexLookupError) throw channexLookupError;

    const externalPropertyId =
      typeof channexRow?.external_property_id === "string" && channexRow.external_property_id.trim().length > 0
        ? channexRow.external_property_id.trim()
        : null;

    const nowIso = new Date().toISOString();
    let inspectionPayload: Record<string, unknown> | null = null;

    if (action === "check_channel_attachment") {
      if (!externalPropertyId) {
        return NextResponse.json(
          {
            ok: false,
            status: "missing_property",
            error: "Create or link the Channex property first.",
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
            error: inspectionResult.message,
          },
          { status: 502 }
        );
      }

      const refreshState = buildProviderRefreshState({
        providerKey,
        currentMetadata: asRecord(existingRow?.metadata),
        inspection: inspectionResult.inspection,
      });

      const { error: refreshError } = await supabase
        .from("channel_properties")
        .upsert(
          {
            family_id: familyId,
            provider_code: providerKey,
            external_property_id: typeof existingRow?.external_property_id === "string" ? existingRow.external_property_id : null,
            sync_status: refreshState.syncStatus,
            metadata: refreshState.metadata,
            updated_at: nowIso,
          } as never,
          { onConflict: "family_id,provider_code" }
        );

      if (refreshError) throw refreshError;
      inspectionPayload = inspectionResult.inspection as unknown as Record<string, unknown>;
    }

    const metadataPatch =
      action === "mark_ota_approved"
        ? {
            provider_connection_status: "ota_approval_verified",
            provider_connection_error: null,
            provider_approval_verified_at: nowIso,
            provider_approval_verified_by: authorizedResource.hostUserId ?? "operator",
            operator_setup_requested: true,
            operator_notes: reason || "OTA approval verified by Famlo operator.",
          }
        : {
            provider_connection_status: "verification_failed",
            provider_connection_error: reason || "Provider approval could not be verified.",
            operator_setup_requested: true,
            operator_notes: reason || "Provider approval verification failed.",
          };

    const nextMetadata = mergeChannelSetupMetadata(asRecord(existingRow?.metadata), {
      status: action === "mark_ota_approved" ? "matching_needed" : "needs_review",
      currentStep: action === "mark_ota_approved" ? "room_matching" : "connection",
      lastError: action === "mark_failed" ? metadataPatch.provider_connection_error : null,
      metadataPatch,
      updatedAt: nowIso,
    });

    const payload = {
      family_id: familyId,
      provider_code: providerKey,
      external_property_id: typeof existingRow?.external_property_id === "string" ? existingRow.external_property_id : null,
      sync_status: typeof existingRow?.sync_status === "string" ? existingRow.sync_status : "not_connected",
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

    const state = savedRow
      ? readChannelSetupState({
          id: typeof savedRow.id === "string" ? savedRow.id : "",
          familyId,
          providerCode: providerKey as ChannelProviderKey,
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

    const provider = CHANNEL_PROVIDER_REGISTRY.find((entry) => entry.key === providerKey);

    return NextResponse.json({
      ok: true,
      status:
        action === "check_channel_attachment"
          ? "channel_checked"
          : action === "mark_ota_approved"
            ? "ota_approval_verified"
            : "verification_failed",
      message:
        action === "check_channel_attachment"
          ? `${provider?.displayName ?? providerKey} channel state refreshed from Channex.`
          : action === "mark_ota_approved"
          ? `${provider?.displayName ?? providerKey} approval verified. Continue with room/rate mapping before sync.`
          : `${provider?.displayName ?? providerKey} verification marked failed.`,
      state,
      inspection: inspectionPayload,
    });
  } catch (error) {
    console.error("[host.pro.channel.operator.provider-verify] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        error: error instanceof Error ? error.message : "Unable to update provider verification.",
      },
      { status: 500 }
    );
  }
}
