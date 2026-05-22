import { POST as confirmMappingsRoute } from "@/app/api/host/pro/channel/confirm-mapping/route";
import { POST as createChannelRoute } from "@/app/api/host/pro/channel/create/route";
import { POST as providerStructureRoute } from "@/app/api/host/pro/channel/provider-structure/route";
import { POST as channelSetupRoute } from "@/app/api/host/pro/channel/setup/route";
import { buildInternalJsonRequest, readJsonResponse } from "@/lib/channel-api-bridge";
import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";
import { enqueueChannexAriSyncJobs } from "@/lib/channex-ari-jobs";
import { readChannelSetupState } from "@/lib/channel-setup-state";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { loadStayUnitsForSelector } from "@/lib/stay-units";

import { getOtaConnectConfig, type OtaConnectConfig, type OtaConnectId } from "./ota-connect-config";

type PreviewFields = Record<string, string | undefined>;

type AirbnbAuthorizationState = {
  propertyId: string;
  roomId: string;
  otaId: OtaConnectId;
};

type ProviderStructurePayload = {
  ok?: boolean;
  status?: string;
  message?: string;
  error?: string;
  verification?: {
    propertyTitle?: string | null;
    hotelId?: string | null;
    activeChannelTitle?: string | null;
  } | null;
  catalog?: {
    room_types?: Array<{ id?: string; title?: string | null }>;
    rate_plans?: Array<{ id?: string; title?: string | null; room_type_id?: string | null }>;
  } | null;
  suggestions?: Array<{
    roomId?: string;
    famloRoomName?: string;
    suggestedRoomTypeId?: string | null;
    suggestedRoomTypeTitle?: string | null;
    suggestedRatePlanId?: string | null;
    suggestedRatePlanTitle?: string | null;
    autoApplicable?: boolean;
    confidence?: string | null;
  }>;
  autoApplicableCount?: number;
  state?: Record<string, unknown> | null;
};

type CreateChannelPayload = {
  ok?: boolean;
  message?: string;
  error?: string;
  fallbackRequired?: boolean;
  state?: Record<string, unknown> | null;
};

type ConfirmMappingsPayload = {
  ok?: boolean;
  message?: string;
  error?: string;
  state?: Record<string, unknown> | null;
};

type AuthorizedRoomContext = {
  hostUserId: string | null;
  hostId: string | null;
  room: {
    id: string;
    name: string;
    priceFullday: number;
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function redactSecretFields(fields: PreviewFields): Record<string, string> {
  return Object.entries(fields).reduce<Record<string, string>>((acc, [key, value]) => {
    if (!value || value.trim().length === 0) return acc;
    acc[key] = /token|secret|password/i.test(key) ? "[redacted]" : value.trim();
    return acc;
  }, {});
}

function encodeAuthorizationState(state: AirbnbAuthorizationState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

function decodeAuthorizationState(value: string): AirbnbAuthorizationState | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<AirbnbAuthorizationState>;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.otaId !== "airbnb") return null;
    if (!asString(parsed.propertyId) || !asString(parsed.roomId)) return null;
    return {
      propertyId: asString(parsed.propertyId),
      roomId: asString(parsed.roomId),
      otaId: "airbnb",
    };
  } catch {
    return null;
  }
}

async function writeOtaAuditLog(input: {
  propertyId: string;
  otaId: OtaConnectId;
  action: string;
  status: "success" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createAdminSupabaseClient();
    await supabase.from("channel_sync_logs").insert({
      family_id: input.propertyId,
      provider_code: getOtaConnectConfig(input.otaId).providerKey,
      action: input.action,
      status: input.status,
      message: input.message,
      payload: input.payload,
    } as never);
  } catch (error) {
    console.error("[ota-connect.audit] failed:", error);
  }
}

async function authorizeRoomAccess(request: Request, propertyId: string, roomId: string): Promise<AuthorizedRoomContext> {
  const supabase = createAdminSupabaseClient();
  const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId: propertyId });
  if (!authorizedResource?.familyId) {
    throw new Error("Unauthorized");
  }

  const access = await loadHostProAccess(supabase, propertyId);
  if (!access.allowed) {
    throw new Error("Famlo Pro is not active for this property.");
  }

  const rooms = await loadStayUnitsForSelector(supabase, {
    hostId: authorizedResource.hostId,
    legacyFamilyId: propertyId,
  });
  const room = rooms.find((item) => item.id === roomId);
  if (!room) {
    throw new Error("Room not found for this property.");
  }

  return {
    hostUserId: authorizedResource.hostUserId ?? null,
    hostId: authorizedResource.hostId ?? null,
    room: {
      id: room.id,
      name: room.name,
      priceFullday: room.priceFullday,
    },
  };
}

export function getOtaConfig(otaId: OtaConnectId): OtaConnectConfig {
  return getOtaConnectConfig(otaId);
}

export function validateOtaFields(otaId: OtaConnectId, fields: PreviewFields): {
  ok: boolean;
  missingFields: string[];
} {
  const config = getOtaConnectConfig(otaId);
  const missingFields = config.requiredFields
    .filter((field) => field.required && asString(fields[field.key]).length === 0)
    .map((field) => field.label);

  return {
    ok: missingFields.length === 0,
    missingFields,
  };
}

export async function createAirbnbAuthorizationUrl(input: {
  request: Request;
  propertyId: string;
  roomId: string;
}): Promise<{ authorizationUrl: string; callbackUrl: string }> {
  await authorizeRoomAccess(input.request, input.propertyId, input.roomId);

  const origin = new URL(input.request.url).origin;
  const callbackUrl = `${origin}/api/partners/pro/channels/ota/airbnb/callback`;
  const state = encodeAuthorizationState({
    propertyId: input.propertyId,
    roomId: input.roomId,
    otaId: "airbnb",
  });
  const configuredAuthorizationUrl = process.env.CHANNEX_AIRBNB_AUTHORIZE_URL?.trim() ?? "";

  if (configuredAuthorizationUrl.length > 0) {
    const authorizationUrl = new URL(configuredAuthorizationUrl);
    authorizationUrl.searchParams.set("redirect_uri", callbackUrl);
    authorizationUrl.searchParams.set("state", state);
    return {
      authorizationUrl: authorizationUrl.toString(),
      callbackUrl,
    };
  }

  // TODO(channex-airbnb): replace this fallback redirect with the real Channex Airbnb OAuth endpoint
  // once the private authorization URL and required credentials are available in this environment.
  const fallbackUrl = new URL(callbackUrl);
  fallbackUrl.searchParams.set("state", state);
  fallbackUrl.searchParams.set("status", "authorized");

  return {
    authorizationUrl: fallbackUrl.toString(),
    callbackUrl,
  };
}

export async function handleAirbnbAuthorizationCallback(input: {
  request: Request;
}): Promise<{
  redirectUrl: string;
  propertyId: string;
  roomId: string;
  status: "authorized" | "failed";
}> {
  const url = new URL(input.request.url);
  const state = decodeAuthorizationState(asString(url.searchParams.get("state")));
  if (!state) {
    throw new Error("Airbnb authorization state is invalid.");
  }

  await authorizeRoomAccess(input.request, state.propertyId, state.roomId);

  const status = asString(url.searchParams.get("status")) === "failed" ? "failed" : "authorized";
  const redirectUrl = new URL("/partnerslogin/home/pro/dashboard", url.origin);
  redirectUrl.searchParams.set("family", state.propertyId);
  redirectUrl.searchParams.set("section", "rooms-units");
  redirectUrl.searchParams.set("roomId", state.roomId);
  redirectUrl.searchParams.set("otaAuthProvider", "airbnb");
  redirectUrl.searchParams.set("otaAuthStatus", status);

  return {
    redirectUrl: redirectUrl.toString(),
    propertyId: state.propertyId,
    roomId: state.roomId,
    status,
  };
}

export async function fetchAirbnbListingsPreview(input: {
  request: Request;
  propertyId: string;
  roomId: string;
  fields: PreviewFields;
}) {
  // TODO(channex-airbnb): if Airbnb requires a dedicated post-OAuth listings endpoint, swap this
  // preview helper from the generic provider-structure fetch to that Airbnb-specific Channex call.
  return createOtaPreview({
    request: input.request,
    propertyId: input.propertyId,
    roomId: input.roomId,
    otaId: "airbnb",
    fields: input.fields,
  });
}

function buildChannelCreateBody(config: OtaConnectConfig, fields: PreviewFields, propertyId: string) {
  return {
    familyId: propertyId,
    providerKey: config.providerKey,
    bookingHotelId: asString(fields.bookingHotelId),
    bookingPropertyCode: asString(fields.bookingPropertyCode),
    bookingExtranetRequested: asString(fields.channelManagerConfirmed).toLowerCase() === "yes" || fields.channelManagerConfirmed === "true",
    providerListingId: asString(fields.providerListingId),
    providerPropertyCode: asString(fields.providerPropertyCode),
    providerListingUrl: asString(fields.providerListingUrl),
    providerExtranetRequested: asString(fields.channelManagerConfirmed).toLowerCase() === "yes" || fields.channelManagerConfirmed === "true",
    providerAccessToken: asString(fields.providerAccessToken),
  };
}

export async function sendOtaDetailsToChannex(input: {
  request: Request;
  propertyId: string;
  otaId: OtaConnectId;
  fields: PreviewFields;
}): Promise<{
  createPayload: CreateChannelPayload;
  providerStructurePayload: ProviderStructurePayload;
}> {
  const config = getOtaConnectConfig(input.otaId);
  const createRequest = buildInternalJsonRequest({
    request: input.request,
    pathname: "/api/host/pro/channel/create",
    body: buildChannelCreateBody(config, input.fields, input.propertyId),
  });
  const createResponse = await createChannelRoute(createRequest);
  const createPayload = await readJsonResponse<CreateChannelPayload>(createResponse);
  if (!createResponse.ok || createPayload.ok === false) {
    throw new Error(createPayload.error ?? "Unable to send OTA details to Channex.");
  }

  const providerStructureRequest = buildInternalJsonRequest({
    request: input.request,
    pathname: "/api/host/pro/channel/provider-structure",
    body: {
      familyId: input.propertyId,
      providerKey: config.providerKey,
    },
  });
  const providerStructureResponse = await providerStructureRoute(providerStructureRequest);
  const providerStructurePayload = await readJsonResponse<ProviderStructurePayload>(providerStructureResponse);
  if (!providerStructureResponse.ok || providerStructurePayload.ok === false) {
    throw new Error(providerStructurePayload.error ?? "Unable to load OTA preview from Channex.");
  }

  return {
    createPayload,
    providerStructurePayload,
  };
}

export function normalizeChannexPreview(input: {
  propertyId: string;
  roomId: string;
  roomName: string;
  otaId: OtaConnectId;
  fields: PreviewFields;
  providerStructurePayload: ProviderStructurePayload;
}) {
  const propertyName = asString(input.providerStructurePayload.verification?.propertyTitle) || null;
  const propertyReference =
    asString(input.providerStructurePayload.verification?.hotelId) ||
    asString(input.fields.bookingHotelId) ||
    asString(input.fields.bookingPropertyCode) ||
    asString(input.fields.providerListingId) ||
    asString(input.fields.providerPropertyCode) ||
    null;
  const suggestions = input.providerStructurePayload.suggestions ?? [];
  const selectedSuggestion = suggestions.find((item) => item.roomId === input.roomId) ?? null;
  const roomTypes = (input.providerStructurePayload.catalog?.room_types ?? []).map((room) => ({
    title: asString(room.title) || "Unnamed OTA room",
  }));
  const ratePlans = (input.providerStructurePayload.catalog?.rate_plans ?? []).map((ratePlan) => ({
    title: asString(ratePlan.title) || "Unnamed OTA rate plan",
  }));
  const warnings: string[] = [];

  if (!propertyName) {
    warnings.push("Famlo could not read the OTA property name from Channex yet. Double-check the OTA details and try preview again.");
  }
  if (!selectedSuggestion?.suggestedRoomTypeId) {
    warnings.push("Famlo could not suggest an OTA room match for this room yet.");
  }
  if (!selectedSuggestion?.suggestedRatePlanId) {
    warnings.push("Famlo could not suggest an OTA rate plan for this room yet.");
  }

  return {
    propertyName,
    propertyReference,
    roomList: roomTypes,
    ratePlans,
    suggestedMapping: selectedSuggestion
      ? {
          otaRoomName: asString(selectedSuggestion.suggestedRoomTypeTitle) || null,
          otaRatePlanName: asString(selectedSuggestion.suggestedRatePlanTitle) || null,
          externalRoomTypeId: asString(selectedSuggestion.suggestedRoomTypeId) || null,
          externalRatePlanId: asString(selectedSuggestion.suggestedRatePlanId) || null,
        }
      : null,
    warnings,
  };
}

export async function createOtaPreview(input: {
  request: Request;
  propertyId: string;
  roomId: string;
  otaId: OtaConnectId;
  fields: PreviewFields;
}) {
  try {
    const validation = validateOtaFields(input.otaId, input.fields);
    if (!validation.ok) {
      throw new Error(`Missing required OTA fields: ${validation.missingFields.join(", ")}`);
    }

    if (asString(input.fields.channelManagerConfirmed).toLowerCase() !== "yes") {
      throw new Error("Confirm the Channex channel-manager setup before previewing this OTA.");
    }

    const auth = await authorizeRoomAccess(input.request, input.propertyId, input.roomId);
    const { providerStructurePayload } = await sendOtaDetailsToChannex(input);
    const normalizedPreview = normalizeChannexPreview({
      propertyId: input.propertyId,
      roomId: input.roomId,
      roomName: auth.room.name,
      otaId: input.otaId,
      fields: input.fields,
      providerStructurePayload,
    });

    const supabase = createAdminSupabaseClient();
    const previewPayload = {
      room_id: input.roomId,
      room_name: auth.room.name,
      ota_id: input.otaId,
      ota_provider_key: getOtaConnectConfig(input.otaId).providerKey,
      fields: redactSecretFields(input.fields),
      preview: normalizedPreview,
    };
    const { data: previewLog, error: previewLogError } = await supabase
      .from("channel_sync_logs")
      .insert({
        family_id: input.propertyId,
        provider_code: getOtaConnectConfig(input.otaId).providerKey,
        action: "ota_connection_preview",
        status: "success",
        message: "OTA preview created from the unified OTA connection flow.",
        payload: previewPayload,
      } as never)
      .select("id")
      .single();
    if (previewLogError) throw previewLogError;

    return {
      previewId: asString((previewLog as Record<string, unknown> | null)?.id),
      preview: {
        propertyName: normalizedPreview.propertyName,
        propertyReference: normalizedPreview.propertyReference,
        roomList: normalizedPreview.roomList,
        ratePlans: normalizedPreview.ratePlans,
        suggestedFamloRoomMapping: auth.room.name,
        suggestedOtaRoomMapping: normalizedPreview.suggestedMapping?.otaRoomName ?? null,
        suggestedOtaRatePlanMapping: normalizedPreview.suggestedMapping?.otaRatePlanName ?? null,
        warnings: normalizedPreview.warnings,
      },
    };
  } catch (error) {
    await writeOtaAuditLog({
      propertyId: input.propertyId,
      otaId: input.otaId,
      action: "ota_connection_preview",
      status: "failed",
      message: error instanceof Error ? error.message : "Unable to create OTA preview.",
      payload: {
        room_id: input.roomId,
        fields: redactSecretFields(input.fields),
      },
    });
    throw error;
  }
}

export async function saveOtaMapping(input: {
  request: Request;
  propertyId: string;
  roomId: string;
  otaId: OtaConnectId;
  externalRoomTypeId: string | null;
  externalRatePlanId: string | null;
}) {
  const config = getOtaConnectConfig(input.otaId);
  const confirmRequest = buildInternalJsonRequest({
    request: input.request,
    pathname: "/api/host/pro/channel/confirm-mapping",
    body: {
      familyId: input.propertyId,
      providerKey: config.providerKey,
      mode: "manual",
      stayUnitId: input.roomId,
      externalRoomTypeId: input.externalRoomTypeId,
      externalRatePlanId: input.externalRatePlanId,
    },
  });
  const response = await confirmMappingsRoute(confirmRequest);
  const payload = await readJsonResponse<ConfirmMappingsPayload>(response);
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error ?? "Unable to save OTA mapping.");
  }
  return payload;
}

export async function enqueueInitialAriSync(input: {
  propertyId: string;
  roomId: string;
  otaId: OtaConnectId;
  actorUserId?: string | null;
}) {
  const supabase = createAdminSupabaseClient();
  const today = new Date();
  const start = today.toISOString().slice(0, 10);
  const end = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return enqueueChannexAriSyncJobs(supabase, {
    familyId: input.propertyId,
    dateFrom: start,
    dateTo: end,
    jobTypes: ["full_sync"],
    certificationScenario: "ota_unified_connect",
    sourceUiAction: "ota_unified_connect_confirm",
    sourceRoute: "/api/partners/pro/channels/ota/confirm",
    stayUnitIds: [input.roomId],
    actorUserId: input.actorUserId ?? null,
    actorRole: "host",
    providerKeys: [getOtaConnectConfig(input.otaId).providerKey],
  });
}

export async function confirmOtaConnection(input: {
  request: Request;
  propertyId: string;
  roomId: string;
  otaId: OtaConnectId;
  previewId: string;
  mappings: {
    externalRoomTypeId?: string | null;
    externalRatePlanId?: string | null;
  };
  confirmationAccepted: boolean;
}) {
  try {
    if (!input.confirmationAccepted) {
      throw new Error("Confirmation is required before sync can start.");
    }

    const auth = await authorizeRoomAccess(input.request, input.propertyId, input.roomId);
    const supabase = createAdminSupabaseClient();
    const config = getOtaConnectConfig(input.otaId);
    const { data: previewRow, error: previewError } = await supabase
      .from("channel_sync_logs")
      .select("id,payload")
      .eq("id", input.previewId)
      .eq("family_id", input.propertyId)
      .eq("provider_code", config.providerKey)
      .eq("action", "ota_connection_preview")
      .maybeSingle();
    if (previewError) throw previewError;
    if (!previewRow?.id) {
      throw new Error("Preview not found. Run preview again before confirming.");
    }

    const previewPayload = asObject(previewRow.payload);
    if (asString(previewPayload.room_id) !== input.roomId) {
      throw new Error("Preview does not belong to this room.");
    }

    const preview = asObject(previewPayload.preview);
    const suggestedMapping = asObject(preview.suggestedMapping);
    const externalRoomTypeId =
      asString(input.mappings.externalRoomTypeId) ||
      asString(suggestedMapping.externalRoomTypeId) ||
      null;
    const externalRatePlanId =
      asString(input.mappings.externalRatePlanId) ||
      asString(suggestedMapping.externalRatePlanId) ||
      null;

    await saveOtaMapping({
      request: input.request,
      propertyId: input.propertyId,
      roomId: input.roomId,
      otaId: input.otaId,
      externalRoomTypeId,
      externalRatePlanId,
    });

    await channelSetupRoute(
      buildInternalJsonRequest({
        request: input.request,
        pathname: "/api/host/pro/channel/setup",
        body: {
          familyId: input.propertyId,
          providerKey: config.providerKey,
          metadataPatch: {
            provider_channel_attached: true,
            provider_channel_active: true,
            provider_structure_verified: true,
            provider_structure_verified_at: new Date().toISOString(),
            provider_ready_for_test_sync_review: true,
            provider_ready_for_test_sync_review_at: new Date().toISOString(),
            room_matching_reviewed: true,
            price_matching_reviewed: true,
            provider_connection_status: "channel_visible_in_channex",
            booking_connection_status: "channel_visible_in_channex",
          },
        },
      })
    );

    await writeOtaAuditLog({
      propertyId: input.propertyId,
      otaId: input.otaId,
      action: "ota_connection_mapping_saved",
      status: "success",
      message: "OTA room and rate-plan mapping saved from the unified OTA connection flow.",
      payload: {
        room_id: input.roomId,
        mapping_saved: true,
      },
    });

    const syncQueueIds = await enqueueInitialAriSync({
      propertyId: input.propertyId,
      roomId: input.roomId,
      otaId: input.otaId,
      actorUserId: auth.hostUserId,
    });

    await writeOtaAuditLog({
      propertyId: input.propertyId,
      otaId: input.otaId,
      action: "ota_connection_sync_enqueued",
      status: "success",
      message: "Initial OTA ARI sync was queued from the unified OTA connection flow.",
      payload: {
        room_id: input.roomId,
        queued_job_count: syncQueueIds.length,
      },
    });

    await writeOtaAuditLog({
      propertyId: input.propertyId,
      otaId: input.otaId,
      action: "ota_connection_confirm",
      status: "success",
      message: "OTA connection confirmed and queued for sync.",
      payload: {
        room_id: input.roomId,
        preview_id: input.previewId,
      },
    });

    const { data: stateRow, error: stateError } = await supabase
      .from("channel_properties")
      .select("id,family_id,provider_code,external_property_id,sync_status,metadata,created_at,updated_at")
      .eq("family_id", input.propertyId)
      .eq("provider_code", config.providerKey)
      .maybeSingle();
    if (stateError) throw stateError;

    return {
      connected: true,
      syncQueued: syncQueueIds.length > 0,
      queuedJobIds: syncQueueIds,
      status: "connected",
      message: "This OTA is connected. Famlo is now syncing availability, rates, inventory, and bookings for this room.",
      state: stateRow
        ? readChannelSetupState({
            id: asString(stateRow.id),
            familyId: input.propertyId,
            providerCode: config.providerKey as ChannelProviderKey,
            externalPropertyId: asString(stateRow.external_property_id) || null,
            propertyModel: null,
            propertyType: null,
            syncStatus: asString(stateRow.sync_status) || "connected",
            lastSyncedAt: null,
            metadata: asObject(stateRow.metadata),
            createdAt: asString(stateRow.created_at) || null,
            updatedAt: asString(stateRow.updated_at) || null,
          })
        : null,
    };
  } catch (error) {
    await writeOtaAuditLog({
      propertyId: input.propertyId,
      otaId: input.otaId,
      action: "ota_connection_confirm",
      status: "failed",
      message: error instanceof Error ? error.message : "Unable to confirm OTA connection.",
      payload: {
        room_id: input.roomId,
        preview_id: input.previewId,
      },
    });
    throw error;
  }
}
