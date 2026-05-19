import { NextResponse } from "next/server";

import { getChannelProviderCapabilities } from "@/lib/channel-providers/provider-capabilities";
import { CHANNEL_PROVIDER_REGISTRY } from "@/lib/channel-providers/provider-registry";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createDefaultChannelSetupState, isChannelProviderKey, mergeChannelSetupMetadata, readChannelSetupState, sanitizeChannelSetupMode, sanitizeChannelSetupStatus, sanitizeChannelSetupStep } from "@/lib/channel-setup-state";
import { createAdminSupabaseClient } from "@/lib/supabase";

type SetupRequestBody = {
  familyId?: string;
  providerKey?: string;
  status?: string | null;
  setupMode?: string | null;
  currentStep?: string | null;
  lastError?: string | null;
  metadataPatch?: unknown;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeProviderKey(value: unknown): string {
  return asString(value);
}

async function loadChannelSetupRows(supabase: ReturnType<typeof createAdminSupabaseClient>, familyId: string) {
  const { data, error } = await supabase
    .from("channel_properties")
    .select("id,family_id,provider_code,external_property_id,sync_status,metadata,created_at,updated_at")
    .eq("family_id", familyId);

  if (error) {
    const message = String(error.message ?? "");
    if (/relation|does not exist|schema cache/i.test(message)) {
      return [];
    }
    throw error;
  }

  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const familyId = asString(url.searchParams.get("familyId"));

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });

    if (!authorizedResource?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await loadChannelSetupRows(supabase, familyId);
    const rowsByProvider = new Map<string, Record<string, unknown>>();

    for (const row of rows) {
      const providerKey = normalizeProviderKey(row.provider_code);
      if (providerKey) {
        rowsByProvider.set(providerKey, row);
      }
    }

    const states = CHANNEL_PROVIDER_REGISTRY.map((provider) => {
      const row = rowsByProvider.get(provider.key) ?? null;
      if (!row) {
        return createDefaultChannelSetupState(familyId, provider.key);
      }

      const providerRecord = {
        id: typeof row.id === "string" ? row.id : "",
        familyId,
        providerCode: provider.key,
        externalPropertyId: typeof row.external_property_id === "string" && row.external_property_id.trim().length > 0 ? row.external_property_id.trim() : null,
        propertyModel: null,
        propertyType: null,
        syncStatus: typeof row.sync_status === "string" ? row.sync_status : "not_connected",
        lastSyncedAt: null,
        metadata: asRecord(row.metadata),
        createdAt: typeof row.created_at === "string" ? row.created_at : null,
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
      };

      return readChannelSetupState(providerRecord as Parameters<typeof readChannelSetupState>[0]);
    });

    return NextResponse.json({
      familyId,
      states,
      capabilities: CHANNEL_PROVIDER_REGISTRY.map((provider) => getChannelProviderCapabilities(provider.key)),
    });
  } catch (error) {
    console.error("[host.pro.channel.setup] load failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load channel setup states." },
      { status: 500 }
    );
  }
}

async function updateState(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as SetupRequestBody;
  const familyId = asString(body.familyId);
  const providerKey = normalizeProviderKey(body.providerKey);

  if (!familyId) {
    return NextResponse.json({ error: "familyId is required." }, { status: 400 });
  }

  if (!providerKey || !isChannelProviderKey(providerKey)) {
    return NextResponse.json({ error: "providerKey is invalid." }, { status: 400 });
  }

  const sanitizedStatus = body.status === undefined ? null : sanitizeChannelSetupStatus(body.status);
  const sanitizedSetupMode = body.setupMode === undefined ? null : sanitizeChannelSetupMode(body.setupMode);
  const sanitizedStep = body.currentStep === undefined ? null : sanitizeChannelSetupStep(body.currentStep);
  const sanitizedLastError = typeof body.lastError === "string" && body.lastError.trim().length > 0 ? body.lastError.trim() : null;
  const sanitizedMetadataPatch = asRecord(body.metadataPatch);

  if (body.status !== undefined && (!sanitizedStatus || sanitizedStatus === "live")) {
    return NextResponse.json({ error: "status is invalid." }, { status: 400 });
  }

  if (body.setupMode !== undefined && !sanitizedSetupMode) {
    return NextResponse.json({ error: "setupMode is invalid." }, { status: 400 });
  }

  if (body.currentStep !== undefined && !sanitizedStep) {
    return NextResponse.json({ error: "currentStep is invalid." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });

  if (!authorizedResource?.familyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existingRow, error: lookupError } = await supabase
    .from("channel_properties")
    .select("id,family_id,provider_code,external_property_id,sync_status,metadata,created_at,updated_at")
    .eq("family_id", familyId)
    .eq("provider_code", providerKey)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  const nowIso = new Date().toISOString();
  const existingMetadata = existingRow && typeof existingRow === "object" ? asRecord((existingRow as Record<string, unknown>).metadata) : {};
  const requestedAt = sanitizedStatus === "connection_requested" ? nowIso : null;
  const nextMetadata = mergeChannelSetupMetadata(existingMetadata, {
    status: sanitizedStatus ?? null,
    setupMode: sanitizedSetupMode ?? null,
    currentStep: sanitizedStep ?? null,
    lastError: sanitizedLastError,
    requestedAt,
    setupRequestedAt: requestedAt,
    metadataPatch: sanitizedMetadataPatch,
    updatedAt: nowIso,
  });

  const syncStatus = typeof (existingRow as Record<string, unknown> | null)?.sync_status === "string"
    ? String((existingRow as Record<string, unknown>).sync_status)
    : "not_connected";

  const payload = {
    family_id: familyId,
    provider_code: providerKey,
    external_property_id: typeof (existingRow as Record<string, unknown> | null)?.external_property_id === "string"
      ? String((existingRow as Record<string, unknown>).external_property_id)
      : null,
    sync_status: syncStatus,
    metadata: nextMetadata,
    updated_at: nowIso,
  };

  const { error: upsertError } = await supabase
    .from("channel_properties")
    .upsert(payload as never, { onConflict: "family_id,provider_code" });

  if (upsertError) {
    throw upsertError;
  }

  const { data: savedRow, error: savedError } = await supabase
    .from("channel_properties")
    .select("id,family_id,provider_code,external_property_id,sync_status,metadata,created_at,updated_at")
    .eq("family_id", familyId)
    .eq("provider_code", providerKey)
    .maybeSingle();

  if (savedError) {
    throw savedError;
  }

  const state = savedRow
    ? readChannelSetupState({
        id: typeof (savedRow as Record<string, unknown>).id === "string" ? String((savedRow as Record<string, unknown>).id) : "",
        familyId,
        providerCode: providerKey,
        externalPropertyId: typeof (savedRow as Record<string, unknown>).external_property_id === "string"
          ? String((savedRow as Record<string, unknown>).external_property_id)
          : null,
        propertyModel: null,
        propertyType: null,
        syncStatus: typeof (savedRow as Record<string, unknown>).sync_status === "string"
          ? String((savedRow as Record<string, unknown>).sync_status)
          : "not_connected",
        lastSyncedAt: null,
        metadata: asRecord((savedRow as Record<string, unknown>).metadata),
        createdAt: typeof (savedRow as Record<string, unknown>).created_at === "string" ? String((savedRow as Record<string, unknown>).created_at) : null,
        updatedAt: typeof (savedRow as Record<string, unknown>).updated_at === "string" ? String((savedRow as Record<string, unknown>).updated_at) : null,
      } as never)
    : createDefaultChannelSetupState(familyId, providerKey as never);

  return NextResponse.json({
    success: true,
    state,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return updateState(request);
}

export async function PATCH(request: Request): Promise<NextResponse> {
  return updateState(request);
}
