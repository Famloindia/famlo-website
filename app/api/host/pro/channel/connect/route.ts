import { NextResponse } from "next/server";

import {
  buildChannexIframeUrl,
  createChannexOneTimeToken,
  getChannexConfigSummary,
} from "@/lib/channel-providers/channex/client";
import { getChannelProviderCapabilities } from "@/lib/channel-providers/provider-capabilities";
import { inspectProviderConnectionInChannex } from "@/lib/channel-providers/provider-adapter";
import {
  channelCredentialStorageConfigured,
  encryptChannelCredential,
  mergeEncryptedChannelCredential,
} from "@/lib/channel-credentials";
import {
  isChannelProviderKey,
  mergeChannelSetupMetadata,
  readChannelSetupState,
} from "@/lib/channel-setup-state";
import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type ConnectBody = {
  familyId?: string;
  providerKey?: string;
  bookingHotelId?: string;
  bookingPropertyCode?: string;
  bookingExtranetRequested?: boolean;
  providerListingId?: string;
  providerPropertyCode?: string;
  providerListingUrl?: string;
  providerExtranetRequested?: boolean;
  providerAccessToken?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  const text = asString(value);
  return text.length > 0 ? text : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function iframeCodesForProvider(providerKey: ChannelProviderKey): string[] {
  const code = getChannelProviderCapabilities(providerKey).channexChannelCode;
  return code ? [code] : [];
}

function iframeHint(providerKey: ChannelProviderKey, filteredChannels: string[]): string {
  if (providerKey === "mmt") {
    return "Continue inside the embedded Channex connector. MakeMyTrip / Goibibo create and test-connection still happen there, then come back and refresh for preview.";
  }

  if (filteredChannels.length > 0) {
    return `Continue inside the embedded secure connector. The property workspace is filtered to ${filteredChannels.join(", ")}.`;
  }

  return "Continue inside the embedded secure connector, then refresh provider state for preview.";
}

async function logConnectEvent(input: {
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
    action: "connect_provider_from_wizard",
    status: input.status,
    message: input.message,
    payload: input.payload ?? {},
  } as never);

  if (error) {
    console.error("[host.pro.channel.connect] log failed:", error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = createAdminSupabaseClient();
  let familyId = "";
  let providerKey = "" as ChannelProviderKey | "";

  try {
    const body = (await request.json()) as ConnectBody;
    familyId = asString(body.familyId);
    const providerInput = asString(body.providerKey);

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    if (!isChannelProviderKey(providerInput)) {
      return NextResponse.json({ error: "providerKey is invalid." }, { status: 400 });
    }
    providerKey = providerInput;
    const capabilities = getChannelProviderCapabilities(providerKey);

    if (capabilities.mode === "disabled") {
      return NextResponse.json({ error: "This provider is currently disabled in Famlo." }, { status: 409 });
    }

    if (capabilities.mode === "feed_only") {
      return NextResponse.json(
        {
          error: "This provider is handled as a feed/metasearch workflow, not a direct OTA connect flow.",
          providerStatus: capabilities.displayStatus,
        },
        { status: 409 }
      );
    }

    if (!capabilities.supportsChannexIframe) {
      return NextResponse.json(
        {
          error: "This provider does not currently support the Channex-assisted connection flow in Famlo.",
          providerStatus: capabilities.displayStatus,
        },
        { status: 409 }
      );
    }

    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!authorizedResource?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await loadHostProAccess(supabase, familyId);
    if (!access.allowed) {
      return NextResponse.json({ error: "Famlo Pro is not active for this property." }, { status: 403 });
    }

    const [{ data: existingRow, error: lookupError }, { data: channexRow, error: channexLookupError }] = await Promise.all([
      supabase
        .from("channel_properties")
        .select("id,family_id,provider_code,external_property_id,sync_status,metadata,created_at,updated_at")
        .eq("family_id", familyId)
        .eq("provider_code", providerKey)
        .maybeSingle(),
      supabase
        .from("channel_properties")
        .select("external_property_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex")
        .maybeSingle(),
    ]);

    if (lookupError) throw lookupError;
    if (channexLookupError) throw channexLookupError;

    const currentMetadata = asRecord(existingRow?.metadata);
    const nowIso = new Date().toISOString();
    const channexPropertyId = asNullableString(channexRow?.external_property_id);
    let metadataForSave = currentMetadata;

    if (providerKey === "booking") {
      const bookingHotelId = asString(body.bookingHotelId);
      const bookingPropertyCode = asString(body.bookingPropertyCode);
      const bookingExtranetRequested = asBoolean(body.bookingExtranetRequested);

      if (!bookingHotelId && !bookingPropertyCode) {
        return NextResponse.json({ error: "Add a Booking.com Hotel ID or Property Code first." }, { status: 400 });
      }

      if (!bookingExtranetRequested) {
        return NextResponse.json({ error: "Confirm the Booking.com extranet connectivity-provider request first." }, { status: 400 });
      }

      metadataForSave = mergeChannelSetupMetadata(metadataForSave, {
        status: "connection_requested",
        currentStep: "connection",
        lastError: null,
        requestedAt: nowIso,
        setupRequestedAt: nowIso,
        updatedAt: nowIso,
        metadataPatch: {
          booking_hotel_id: bookingHotelId,
          booking_property_code: bookingPropertyCode,
          booking_extranet_request_acknowledged: true,
          connectivity_provider_requested: true,
          connectivity_provider_requested_at: nowIso,
          booking_connection_status: "verification_requested",
          booking_connection_error: null,
          hotel_id_available: true,
          operator_setup_requested: true,
        },
      });
    } else {
      const providerListingId = asString(body.providerListingId);
      const providerPropertyCode = asString(body.providerPropertyCode);
      const providerListingUrl = asString(body.providerListingUrl);
      const providerExtranetRequested = asBoolean(body.providerExtranetRequested);
      const providerAccessToken = asString(body.providerAccessToken);

      if (!providerListingId && !providerPropertyCode && !providerListingUrl) {
        return NextResponse.json(
          {
            error:
              providerKey === "airbnb"
                ? "Add an Airbnb listing URL, listing id, or owner account reference first."
                : providerKey === "mmt"
                  ? "Add an MMT Hotel ID, Hotel Code, or reference URL first."
                  : "Add the provider listing id, property code, or listing URL first.",
          },
          { status: 400 }
        );
      }

      if (providerAccessToken) {
        if (!channelCredentialStorageConfigured()) {
          return NextResponse.json(
            { error: "Secure credential storage is not configured. Add CHANNEL_CREDENTIALS_ENCRYPTION_KEY first." },
            { status: 503 }
          );
        }

        const encryptedCredential = encryptChannelCredential({
          value: providerAccessToken,
          storedAt: nowIso,
          storedBy: authorizedResource.hostUserId ?? null,
        });

        metadataForSave = mergeEncryptedChannelCredential({
          metadata: metadataForSave,
          providerKey,
          credentialKey: "access_token",
          credential: encryptedCredential,
        });

        metadataForSave = mergeChannelSetupMetadata(metadataForSave, {
          status: "connection_requested",
          currentStep: "connection",
          lastError: null,
          updatedAt: nowIso,
          metadataPatch: {
            provider_access_token_stored: true,
            provider_access_token_last_four: encryptedCredential.lastFour,
            provider_access_token_stored_at: nowIso,
            provider_credential_store_status: "stored_securely",
          },
        });
      }

      metadataForSave = mergeChannelSetupMetadata(metadataForSave, {
        status: "connection_requested",
        currentStep: "connection",
        lastError: null,
        requestedAt: nowIso,
        setupRequestedAt: nowIso,
        updatedAt: nowIso,
        metadataPatch: {
          provider_listing_id: providerListingId,
          provider_property_code: providerPropertyCode,
          provider_listing_url: providerListingUrl,
          provider_extranet_request_acknowledged: providerExtranetRequested,
          provider_connection_status: providerExtranetRequested ? "waiting_for_ota_approval" : "details_submitted",
          provider_connection_error: null,
          provider_verification_requested_at: nowIso,
          hotel_id_available: true,
          operator_setup_requested: true,
        },
      });
    }

    const payload = {
      family_id: familyId,
      provider_code: providerKey,
      external_property_id: typeof existingRow?.external_property_id === "string" ? existingRow.external_property_id : null,
      sync_status: typeof existingRow?.sync_status === "string" ? existingRow.sync_status : "not_connected",
      metadata: metadataForSave,
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

    let iframeUrl: string | null = null;
    let providerHint: string | null = null;
    let verification:
      | {
          hotelId: string | null;
          activeChannelId: string | null;
          channelAttached: boolean;
          channelActive: boolean;
          matchedChannelCount: number;
          roomTypesFoundCount: number;
          ratePlansFoundCount: number;
        }
      | null = null;
    let nextMode: "workspace_required" | "ready_for_preview" = "workspace_required";

    if (channexPropertyId) {
      const inspectionResult = await inspectProviderConnectionInChannex(providerKey, channexPropertyId);
      if (inspectionResult.ok && inspectionResult.inspection.channelAttached) {
        nextMode = "ready_for_preview";
        verification = {
          hotelId: inspectionResult.inspection.hotelId,
          activeChannelId: inspectionResult.inspection.activeChannelId,
          channelAttached: inspectionResult.inspection.channelAttached,
          channelActive: inspectionResult.inspection.channelActive,
          matchedChannelCount: inspectionResult.inspection.matchedChannelCount,
          roomTypesFoundCount: inspectionResult.inspection.roomTypesFoundCount,
          ratePlansFoundCount: inspectionResult.inspection.ratePlansFoundCount,
        };
      } else {
        const config = getChannexConfigSummary();
        if (config.configured) {
          const username =
            authorizedResource.hostSession?.authUserId ||
            authorizedResource.hostUserId ||
            `famlo-${familyId.slice(0, 8)}`;
          const tokenResult = await createChannexOneTimeToken({
            propertyId: channexPropertyId,
            username,
          });
          if (tokenResult.ok && tokenResult.token) {
            const filteredChannels = iframeCodesForProvider(providerKey);
            iframeUrl = buildChannexIframeUrl({
              oneTimeToken: tokenResult.token,
              propertyId: channexPropertyId,
              channels: filteredChannels,
              language: "en",
            });
            providerHint = iframeHint(providerKey, filteredChannels);
          }
        }
      }
    }

    await logConnectEvent({
      supabase,
      familyId,
      providerKey,
      status: "success",
      message:
        nextMode === "ready_for_preview"
          ? "Provider connection details saved and a real attached channel was already visible."
          : "Provider connection details saved. Continue provider create/test in the embedded secure connector.",
      payload: {
        next_mode: nextMode,
        channex_property_id: channexPropertyId,
        has_iframe: Boolean(iframeUrl),
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
      mode: nextMode,
      providerStatus: capabilities.displayStatus,
      providerMode: capabilities.mode,
      message:
        nextMode === "ready_for_preview"
          ? "Provider channel is already visible. Load preview and confirm the mappings."
          : channexPropertyId
            ? "Details saved. Continue inside the embedded secure connector, then refresh to load preview."
            : "Details saved. Create or link the Channex property first, then continue with the secure connector.",
      iframeUrl,
      providerHint,
      verification,
      state,
    });
  } catch (error) {
    if (familyId && providerKey) {
      await logConnectEvent({
        supabase,
        familyId,
        providerKey,
        status: "failed",
        message: error instanceof Error ? error.message : "Unable to start provider connection.",
      });
    }

    console.error("[host.pro.channel.connect] failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to start provider connection." },
      { status: 500 }
    );
  }
}
