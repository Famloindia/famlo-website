import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildChannexIframeUrl,
  createChannexOneTimeToken,
  getChannexConfigSummary,
} from "@/lib/channel-providers/channex/client";
import {
  buildProviderRefreshState,
  inspectProviderConnectionInChannex,
  type ProviderAdapterInspection,
} from "@/lib/channel-providers/provider-adapter";
import {
  isChannexAriJobType,
  nextChannexRetryAt,
  processChannexAriSyncJob,
} from "@/lib/channex-ari-jobs";
import { getChannelProviderCapabilities } from "@/lib/channel-providers/provider-capabilities";
import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";
import { getChannelProviderDefinition } from "@/lib/channel-providers/provider-registry";
import { mergeChannelSetupMetadata } from "@/lib/channel-setup-state";
import { asString, type JsonRecord } from "@/lib/platform-utils";

export type ChannelProviderOperationType =
  | "create_provider"
  | "test_provider"
  | "connect_provider"
  | "refresh_provider"
  | "activate_provider"
  | "deactivate_provider"
  | "verify_mappings"
  | "request_review"
  | "reconcile";

export type ChannelProviderOperationResult = {
  ok: boolean;
  status: "succeeded" | "failed" | "blocked" | "replayed";
  operationId: string | null;
  providerKey: ChannelProviderKey;
  familyId: string;
  message: string;
  connection: JsonRecord | null;
  data: JsonRecord;
};

type ChannelPropertyRow = JsonRecord & {
  id?: string | null;
  family_id?: string | null;
  provider_code?: string | null;
  external_property_id?: string | null;
  sync_status?: string | null;
  connection_status?: string | null;
  verification_status?: string | null;
  activation_status?: string | null;
  dry_run?: boolean | null;
  metadata?: JsonRecord | null;
};

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

const HOST_ALLOWED_OPERATION_TYPES = new Set<ChannelProviderOperationType>([
  "create_provider",
  "connect_provider",
  "verify_mappings",
  "request_review",
]);

export class ChannelProviderPermissionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = "ChannelProviderPermissionError";
    this.statusCode = statusCode;
  }
}

export function assertChannelProviderOperationPermission(input: {
  actorRole?: string | null;
  operationType: ChannelProviderOperationType;
  dryRun: boolean;
}): void {
  const actorRole =
    input.actorRole === "admin" || input.actorRole === "system"
      ? input.actorRole
      : "host";
  if (actorRole === "admin") return;
  if (actorRole === "system") return;

  if (input.operationType === "activate_provider") {
    throw new ChannelProviderPermissionError("Operator access is required to activate a provider.");
  }
  if (input.operationType === "deactivate_provider") {
    throw new ChannelProviderPermissionError("Operator access is required to deactivate a provider.");
  }
  if (!input.dryRun) {
    throw new ChannelProviderPermissionError("Host-scoped provider operations must stay in dry-run mode.");
  }
  if (!HOST_ALLOWED_OPERATION_TYPES.has(input.operationType)) {
    throw new ChannelProviderPermissionError("This provider operation requires operator access.");
  }
}

function iframeCodesForProvider(providerKey: ChannelProviderKey): string[] {
  if (providerKey === "booking") return ["BDC"];
  if (providerKey === "airbnb") return ["ABB"];
  if (providerKey === "agoda") return ["AGO"];
  if (providerKey === "expedia") return ["EXP"];
  if (providerKey === "google-hotel") return ["GHA"];
  return [];
}

function normalizeOtaProvider(value: string | null | undefined): ChannelProviderKey | "channex" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (/airbnb/.test(normalized)) return "airbnb";
  if (/agoda|ycs/.test(normalized)) return "agoda";
  if (/expedia/.test(normalized)) return "expedia";
  if (/google/.test(normalized)) return "google-hotel";
  if (/make.?my.?trip|goibibo|\bmmt\b/.test(normalized)) return "mmt";
  if (/booking/.test(normalized)) return "booking";
  return "channex";
}

async function loadConnection(
  supabase: SupabaseClient,
  input: { familyId: string; providerKey: ChannelProviderKey }
): Promise<ChannelPropertyRow | null> {
  const { data, error } = await supabase
    .from("channel_properties")
    .select("*")
    .eq("family_id", input.familyId)
    .eq("provider_code", input.providerKey)
    .maybeSingle();
  if (error) throw error;
  return (data as ChannelPropertyRow | null) ?? null;
}

async function loadChannexPropertyId(supabase: SupabaseClient, familyId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("channel_properties")
    .select("external_property_id")
    .eq("family_id", familyId)
    .eq("provider_code", "channex")
    .maybeSingle();
  if (error) throw error;
  return asString((data as JsonRecord | null)?.external_property_id);
}

async function insertOperation(input: {
  supabase: SupabaseClient;
  familyId: string;
  providerKey: ChannelProviderKey;
  operationType: ChannelProviderOperationType;
  actorUserId?: string | null;
  actorRole?: string | null;
  dryRun: boolean;
  idempotencyKey?: string | null;
  requestPayload?: JsonRecord;
  beforeState?: JsonRecord;
}): Promise<{ id: string; replayed: boolean; row: JsonRecord | null }> {
  if (input.idempotencyKey) {
    const { data: existing, error: existingError } = await input.supabase
      .from("channel_operation_ledger")
      .select("*")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id) {
      return { id: String(existing.id), replayed: true, row: existing as JsonRecord };
    }
  }

  const { data, error } = await input.supabase
    .from("channel_operation_ledger")
    .insert({
      family_id: input.familyId,
      provider_code: input.providerKey,
      operation_type: input.operationType,
      status: "running",
      idempotency_key: input.idempotencyKey ?? null,
      dry_run: input.dryRun,
      actor_user_id: input.actorUserId ?? null,
      actor_role: input.actorRole ?? null,
      request_payload: input.requestPayload ?? {},
      before_state: input.beforeState ?? {},
      attempt_count: 1,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return { id: asString((data as JsonRecord | null)?.id) ?? "", replayed: false, row: null };
}

async function finishOperation(input: {
  supabase: SupabaseClient;
  operationId: string;
  status: "succeeded" | "failed" | "blocked";
  responsePayload?: JsonRecord;
  afterState?: JsonRecord;
  errorMessage?: string | null;
  providerHttpStatus?: number | null;
}): Promise<void> {
  await input.supabase
    .from("channel_operation_ledger")
    .update({
      status: input.status,
      response_payload: input.responsePayload ?? {},
      after_state: input.afterState ?? {},
      provider_http_status: input.providerHttpStatus ?? null,
      error_message: input.errorMessage ?? null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", input.operationId);
}

async function upsertProviderAccount(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    providerKey: ChannelProviderKey;
    payload: JsonRecord;
    actorUserId?: string | null;
  }
): Promise<string | null> {
  const accountReference =
    asString(input.payload.providerListingId) ??
    asString(input.payload.providerPropertyCode) ??
    asString(input.payload.bookingHotelId) ??
    asString(input.payload.providerListingUrl);
  const now = new Date().toISOString();
  const basePayload = {
    family_id: input.familyId,
    provider_code: input.providerKey,
    account_reference: accountReference,
    display_name: asString(input.payload.displayName) ?? getChannelProviderDefinition(input.providerKey).displayName,
    connection_mode: "channex",
    status: "details_submitted",
    credentials_status: asBoolean(input.payload.credentialStored) ? "stored" : "not_required",
    metadata: {
      submitted_payload: input.payload,
      submitted_by: input.actorUserId ?? null,
      submitted_at: now,
    },
    updated_at: now,
  };

  let lookup = supabase
    .from("channel_provider_accounts")
    .select("id")
    .eq("family_id", input.familyId)
    .eq("provider_code", input.providerKey);
  lookup = accountReference ? lookup.eq("account_reference", accountReference) : lookup.is("account_reference", null);
  const { data: existing, error: lookupError } = await lookup.maybeSingle();
  if (lookupError) throw lookupError;

  const existingId = asString((existing as JsonRecord | null)?.id);
  if (existingId) {
    const { data, error } = await supabase
      .from("channel_provider_accounts")
      .update(basePayload as never)
      .eq("id", existingId)
      .select("id")
      .single();
    if (error) throw error;
    return asString((data as JsonRecord | null)?.id);
  }

  const { data, error } = await supabase
    .from("channel_provider_accounts")
    .insert(basePayload as never)
    .select("id")
    .single();
  if (error) throw error;
  return asString((data as JsonRecord | null)?.id);
}

async function saveConnectionState(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    providerKey: ChannelProviderKey;
    patch: JsonRecord;
    metadata: JsonRecord;
    operationId: string;
  }
): Promise<ChannelPropertyRow | null> {
  const now = new Date().toISOString();
  const payload = {
    family_id: input.familyId,
    provider_code: input.providerKey,
    ...input.patch,
    metadata: input.metadata,
    last_operation_id: input.operationId,
    updated_at: now,
  };

  const { error } = await supabase.from("channel_properties").upsert(payload as never, {
    onConflict: "family_id,provider_code",
  });
  if (error) throw error;
  return loadConnection(supabase, input);
}

async function recordDiagnostic(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    providerKey: ChannelProviderKey;
    severity: "info" | "warning" | "critical";
    diagnosticType: string;
    message: string;
    details?: JsonRecord;
    operationId?: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from("channel_provider_diagnostics").insert({
    family_id: input.familyId,
    provider_code: input.providerKey,
    severity: input.severity,
    diagnostic_type: input.diagnosticType,
    status: "open",
    message: input.message,
    details: input.details ?? {},
    operation_id: input.operationId ?? null,
    last_seen_at: new Date().toISOString(),
  } as never);
  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) throw error;
  }
}

async function buildProviderSetupSession(input: {
  familyId: string;
  providerKey: ChannelProviderKey;
  channexPropertyId: string;
  actorUserId?: string | null;
}): Promise<JsonRecord> {
  const config = getChannexConfigSummary();
  if (!config.configured) {
    return {
      setup_session_available: false,
      channex_configured: false,
      message: "Channex configuration is incomplete.",
    };
  }

  const tokenResult = await createChannexOneTimeToken({
    propertyId: input.channexPropertyId,
    username: input.actorUserId ?? `famlo-${input.familyId}`,
  });
  const channelCodes = iframeCodesForProvider(input.providerKey);
  return {
    setup_session_available: Boolean(tokenResult.ok && tokenResult.token),
    channex_configured: true,
    channex_environment: tokenResult.environment,
    setup_url:
      tokenResult.ok && tokenResult.token
        ? buildChannexIframeUrl({
            oneTimeToken: tokenResult.token,
            propertyId: input.channexPropertyId,
            channels: channelCodes,
          })
        : null,
    channel_codes: channelCodes,
    message: tokenResult.message,
  };
}

async function verifyMappings(
  supabase: SupabaseClient,
  input: { familyId: string; providerKey: ChannelProviderKey }
): Promise<JsonRecord> {
  const providerCodes = [input.providerKey, "channex"];
  const [{ data: roomRows }, { data: rateRows }, { count: activeRoomCount }] = await Promise.all([
    supabase
      .from("channel_room_mappings")
      .select("id,stay_unit_id,external_room_type_id,sync_status")
      .eq("family_id", input.familyId)
      .in("provider_code", providerCodes),
    supabase
      .from("channel_rate_plans")
      .select("id,stay_unit_id,external_rate_plan_id,sync_status")
      .eq("family_id", input.familyId)
      .in("provider_code", providerCodes),
    supabase
      .from("stay_units_v2")
      .select("id", { count: "exact", head: true })
      .eq("legacy_family_id", input.familyId)
      .eq("is_active", true),
  ]);

  const mappedRoomIds = new Set(
    ((roomRows ?? []) as JsonRecord[])
      .filter((row) => Boolean(asString(row.external_room_type_id)))
      .map((row) => asString(row.stay_unit_id))
      .filter((value): value is string => Boolean(value))
  );
  const rateMappedRoomIds = new Set(
    ((rateRows ?? []) as JsonRecord[])
      .filter((row) => Boolean(asString(row.external_rate_plan_id)))
      .map((row) => asString(row.stay_unit_id))
      .filter((value): value is string => Boolean(value))
  );
  const activeRooms = activeRoomCount ?? 0;
  const roomMappingsReady = activeRooms > 0 && mappedRoomIds.size >= activeRooms;
  const rateMappingsReady = activeRooms > 0 && rateMappedRoomIds.size >= activeRooms;

  return {
    active_room_count: activeRooms,
    room_mappings_ready_count: mappedRoomIds.size,
    rate_mappings_ready_count: rateMappedRoomIds.size,
    room_mappings_ready: roomMappingsReady,
    rate_mappings_ready: rateMappingsReady,
    ready: roomMappingsReady && rateMappingsReady,
    mapping_provider_codes_checked: providerCodes,
  };
}

async function refreshProviderConnection(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    providerKey: ChannelProviderKey;
    operationId: string;
    currentConnection: ChannelPropertyRow | null;
  }
): Promise<{ connection: ChannelPropertyRow | null; inspection: ProviderAdapterInspection | null; data: JsonRecord }> {
  const channexPropertyId = await loadChannexPropertyId(supabase, input.familyId);
  if (!channexPropertyId) {
    throw new Error("Create the Channex property before refreshing provider state.");
  }

  const inspectionResult = await inspectProviderConnectionInChannex(input.providerKey, channexPropertyId);
  if (!inspectionResult.ok) throw new Error(inspectionResult.message);

  const currentMetadata = asObject(input.currentConnection?.metadata);
  const refreshState = buildProviderRefreshState({
    providerKey: input.providerKey,
    currentMetadata,
    inspection: inspectionResult.inspection,
  });
  const mappingState = await verifyMappings(supabase, input);
  const activationReady = Boolean(inspectionResult.inspection.channelActive && mappingState.ready);
  const metadata = {
    ...refreshState.metadata,
    provider_mapping_verification: mappingState,
    provider_last_inspection: inspectionResult.inspection,
  };

  const connection = await saveConnectionState(supabase, {
    familyId: input.familyId,
    providerKey: input.providerKey,
    operationId: input.operationId,
    patch: {
      external_property_id: input.currentConnection?.external_property_id ?? null,
      sync_status: refreshState.syncStatus,
      connection_status: inspectionResult.inspection.channelAttached ? "channel_visible" : "connection_requested",
      verification_status: activationReady ? "verified" : inspectionResult.inspection.channelAttached ? "mapping_required" : "not_verified",
      activation_status: activationReady ? "ready_for_activation" : "inactive",
      last_reconciled_at: inspectionResult.inspection.structureRefreshedAt,
    },
    metadata,
  });

  await recordDiagnostic(supabase, {
    familyId: input.familyId,
    providerKey: input.providerKey,
    severity: activationReady ? "info" : "warning",
    diagnosticType: activationReady ? "provider_ready" : "provider_not_ready",
    message: activationReady
      ? `${getChannelProviderDefinition(input.providerKey).displayName} is connected and mapped.`
      : `${getChannelProviderDefinition(input.providerKey).displayName} needs connection or mapping work before activation.`,
    details: {
      inspection: inspectionResult.inspection,
      mapping: mappingState,
    },
    operationId: input.operationId,
  });

  return {
    connection,
    inspection: inspectionResult.inspection,
    data: {
      channex_property_id: channexPropertyId,
      inspection: inspectionResult.inspection,
      mapping: mappingState,
      activation_ready: activationReady,
    },
  };
}

async function reconcileProvider(
  supabase: SupabaseClient,
  input: { familyId: string; providerKey: ChannelProviderKey; operationId: string; currentConnection: ChannelPropertyRow | null }
): Promise<{ connection: ChannelPropertyRow | null; data: JsonRecord }> {
  const refresh = await refreshProviderConnection(supabase, input);
  const { count: pendingRevisionCount } = await supabase
    .from("channel_booking_revisions")
    .select("id", { count: "exact", head: true })
    .eq("family_id", input.familyId)
    .eq("provider_code", "channex")
    .in("import_status", ["preview", "modified_pending_review", "failed_import", "failed_cancellation_apply"]);
  const mismatchCount = (refresh.data.activation_ready ? 0 : 1) + (pendingRevisionCount ?? 0);
  await supabase.from("channel_reconciliation_runs").insert({
    family_id: input.familyId,
    provider_code: input.providerKey,
    status: mismatchCount > 0 ? "mismatched" : "matched",
    completed_at: new Date().toISOString(),
    mismatch_count: mismatchCount,
    summary: {
      provider: refresh.data,
      pending_revision_count: pendingRevisionCount ?? 0,
    },
    created_by_operation_id: input.operationId,
  } as never);
  return {
    connection: refresh.connection,
    data: {
      ...refresh.data,
      pending_revision_count: pendingRevisionCount ?? 0,
      mismatch_count: mismatchCount,
    },
  };
}

async function updateBookingRevisionProviderFields(
  supabase: SupabaseClient,
  input: { familyId: string; providerKey: ChannelProviderKey }
): Promise<void> {
  const { data } = await supabase
    .from("channel_booking_revisions")
    .select("id,ota_name,status,external_revision_id,external_booking_id")
    .eq("family_id", input.familyId)
    .eq("provider_code", "channex")
    .is("ota_provider_code", null)
    .limit(100);

  for (const row of (data ?? []) as JsonRecord[]) {
    const otaProviderCode = normalizeOtaProvider(asString(row.ota_name));
    if (otaProviderCode !== input.providerKey && input.providerKey !== "booking") continue;
    const status = String(row.status ?? "").trim().toLowerCase();
    const lifecycleAction =
      status === "cancelled" ? "cancellation" : status === "modified" ? "modification" : "reservation";
    const externalRevisionId = asString(row.external_revision_id);
    const externalBookingId = asString(row.external_booking_id);
    await supabase
      .from("channel_booking_revisions")
      .update({
        ota_provider_code: otaProviderCode,
        lifecycle_action: lifecycleAction,
        idempotency_key: externalRevisionId
          ? `channex:${otaProviderCode}:revision:${externalRevisionId}`
          : externalBookingId
            ? `channex:${otaProviderCode}:booking:${externalBookingId}:${lifecycleAction}`
            : null,
      } as never)
      .eq("id", row.id);
  }
}

export async function executeChannelProviderOperation(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    providerKey: ChannelProviderKey;
    operationType: ChannelProviderOperationType;
    actorUserId?: string | null;
    actorRole?: string | null;
    dryRun?: boolean;
    idempotencyKey?: string | null;
    payload?: JsonRecord;
  }
): Promise<ChannelProviderOperationResult> {
  const dryRun = input.dryRun ?? true;
  assertChannelProviderOperationPermission({
    actorRole: input.actorRole ?? null,
    operationType: input.operationType,
    dryRun,
  });
  const beforeConnection = await loadConnection(supabase, input);
  const beforeState = asObject(beforeConnection);
  const operation = await insertOperation({
    supabase,
    familyId: input.familyId,
    providerKey: input.providerKey,
    operationType: input.operationType,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    dryRun,
    idempotencyKey: input.idempotencyKey ?? null,
    requestPayload: input.payload ?? {},
    beforeState,
  });

  if (operation.replayed) {
    return {
      ok: true,
      status: "replayed",
      operationId: operation.id,
      providerKey: input.providerKey,
      familyId: input.familyId,
      message: "Operation was already processed for this idempotency key.",
      connection: beforeConnection,
      data: asObject(operation.row?.response_payload),
    };
  }

  try {
    let connection: ChannelPropertyRow | null = beforeConnection;
    let data: JsonRecord = {};
    let message = "Provider operation completed.";
    let status: "succeeded" | "blocked" = "succeeded";
    const nowIso = new Date().toISOString();
    const capabilities = getChannelProviderCapabilities(input.providerKey);

    if (input.operationType === "connect_provider") {
      const accountId = await upsertProviderAccount(supabase, {
        familyId: input.familyId,
        providerKey: input.providerKey,
        payload: input.payload ?? {},
        actorUserId: input.actorUserId ?? null,
      });
      const metadata = mergeChannelSetupMetadata(asObject(beforeConnection?.metadata), {
        status: "connection_requested",
        currentStep: "connection",
        lastError: null,
        requestedAt: nowIso,
        setupRequestedAt: nowIso,
        updatedAt: nowIso,
        metadataPatch: {
          provider_connection_status: "details_submitted",
          provider_connection_error: null,
          provider_listing_id: asString(input.payload?.providerListingId),
          provider_property_code: asString(input.payload?.providerPropertyCode),
          provider_listing_url: asString(input.payload?.providerListingUrl),
          provider_account_id: accountId,
        },
      });
      connection = await saveConnectionState(supabase, {
        familyId: input.familyId,
        providerKey: input.providerKey,
        operationId: operation.id,
        patch: {
          provider_account_id: accountId,
          sync_status: "not_connected",
          connection_status: "details_submitted",
          verification_status: "not_verified",
          activation_status: "inactive",
          dry_run: dryRun,
        },
        metadata,
      });
      data = { provider_account_id: accountId };
      message = "Provider connection details were saved in Famlo.";
    }

    if (input.operationType === "create_provider") {
      const channexPropertyId = await loadChannexPropertyId(supabase, input.familyId);
      if (!channexPropertyId) {
        throw new Error("Create the Channex property before starting provider setup.");
      }
      const setupSession = await buildProviderSetupSession({
        familyId: input.familyId,
        providerKey: input.providerKey,
        channexPropertyId,
        actorUserId: input.actorUserId ?? null,
      });
      const metadata = mergeChannelSetupMetadata(asObject(beforeConnection?.metadata), {
        status: "connection_requested",
        currentStep: "connection",
        lastError: null,
        requestedAt: nowIso,
        setupRequestedAt: nowIso,
        updatedAt: nowIso,
        metadataPatch: {
          provider_connection_status: setupSession.setup_session_available
            ? "setup_session_created"
            : "setup_session_unavailable",
          provider_connection_error: setupSession.setup_session_available ? null : asString(setupSession.message),
          provider_channex_property_id: channexPropertyId,
          provider_setup_session_created_at: new Date().toISOString(),
        },
      });
      connection = await saveConnectionState(supabase, {
        familyId: input.familyId,
        providerKey: input.providerKey,
        operationId: operation.id,
        patch: {
          sync_status: "not_connected",
          connection_status: setupSession.setup_session_available ? "setup_session_created" : "details_required",
          verification_status: "not_verified",
          activation_status: "inactive",
          dry_run: dryRun,
        },
        metadata,
      });
      data = setupSession;
      message = setupSession.setup_session_available
        ? "Provider setup session was created from Famlo."
        : "Provider setup session could not be created yet.";
    }

    if (input.operationType === "test_provider" || input.operationType === "refresh_provider") {
      const refresh = await refreshProviderConnection(supabase, {
        familyId: input.familyId,
        providerKey: input.providerKey,
        operationId: operation.id,
        currentConnection: beforeConnection,
      });
      connection = refresh.connection;
      data = refresh.data;
      message = "Provider state was refreshed from Channex.";
    }

    if (input.operationType === "verify_mappings") {
      const mapping = await verifyMappings(supabase, input);
      const metadata = {
        ...asObject(beforeConnection?.metadata),
        provider_mapping_verification: mapping,
        provider_mapping_verified_at: nowIso,
      };
      connection = await saveConnectionState(supabase, {
        familyId: input.familyId,
        providerKey: input.providerKey,
        operationId: operation.id,
        patch: {
          verification_status: mapping.ready ? "mapping_verified" : "mapping_required",
          activation_status: mapping.ready ? "ready_for_activation" : "inactive",
        },
        metadata,
      });
      data = mapping;
      message = mapping.ready ? "Provider mappings are complete." : "Provider mappings still need work.";
    }

    if (input.operationType === "request_review") {
      const metadata = mergeChannelSetupMetadata(asObject(beforeConnection?.metadata), {
        status: "review_requested",
        currentStep: "activate",
        lastError: null,
        updatedAt: nowIso,
        metadataPatch: {
          go_live_review_requested: true,
          go_live_review_requested_at: nowIso,
          operator_review_requested_by: input.actorUserId ?? null,
          operator_review_provider: input.providerKey,
        },
      });
      connection = await saveConnectionState(supabase, {
        familyId: input.familyId,
        providerKey: input.providerKey,
        operationId: operation.id,
        patch: {
          sync_status: asString(beforeConnection?.sync_status) ?? "not_connected",
          connection_status: "review_requested",
          verification_status: asString(beforeConnection?.verification_status) ?? "not_verified",
          activation_status: "ready_for_operator_review",
          dry_run: true,
        },
        metadata,
      });
      data = { review_requested: true };
      message = "Provider was marked ready for operator review without activating it.";
    }

    if (input.operationType === "activate_provider") {
      const refresh = await refreshProviderConnection(supabase, {
        familyId: input.familyId,
        providerKey: input.providerKey,
        operationId: operation.id,
        currentConnection: beforeConnection,
      });
      if (!refresh.data.activation_ready) {
        status = "blocked";
        data = refresh.data;
        message = "Activation is blocked until provider connection and mappings are verified.";
      } else if (dryRun) {
        data = refresh.data;
        message = "Dry-run activation passed. Disable dry-run only after operator review.";
      } else {
        const nextConnectionStatus = capabilities.supportsAutoActivation ? "active" : "assisted_live";
        const nextActivationStatus = capabilities.supportsAutoActivation ? "active" : "assisted_live";
        connection = await saveConnectionState(supabase, {
          familyId: input.familyId,
          providerKey: input.providerKey,
          operationId: operation.id,
          patch: {
            sync_status: "connected",
            connection_status: nextConnectionStatus,
            verification_status: "verified",
            activation_status: nextActivationStatus,
            dry_run: false,
          },
          metadata: {
            ...asObject(refresh.connection?.metadata),
            activated_at: nowIso,
            activated_by: input.actorUserId ?? null,
            activation_mode: capabilities.supportsAutoActivation ? "auto_activation" : "assisted_live",
          },
        });
        data = refresh.data;
        message = capabilities.supportsAutoActivation
          ? "Provider was activated in Famlo after verified connection and mappings."
          : "Provider was moved to assisted live in Famlo after operator activation review.";
      }
    }

    if (input.operationType === "deactivate_provider") {
      connection = await saveConnectionState(supabase, {
        familyId: input.familyId,
        providerKey: input.providerKey,
        operationId: operation.id,
        patch: {
          sync_status: "paused",
          connection_status: "paused",
          activation_status: "inactive",
          dry_run: true,
        },
        metadata: {
          ...asObject(beforeConnection?.metadata),
          deactivated_at: nowIso,
          deactivated_by: input.actorUserId ?? null,
          deactivation_reason: asString(input.payload?.reason),
        },
      });
      data = { deactivated: true };
      message = "Provider was deactivated in Famlo and returned to dry-run mode.";
    }

    if (input.operationType === "reconcile") {
      await updateBookingRevisionProviderFields(supabase, {
        familyId: input.familyId,
        providerKey: input.providerKey,
      });
      const reconciliation = await reconcileProvider(supabase, {
        familyId: input.familyId,
        providerKey: input.providerKey,
        operationId: operation.id,
        currentConnection: beforeConnection,
      });
      connection = reconciliation.connection;
      data = reconciliation.data;
      message = data.mismatch_count === 0 ? "Provider reconciliation matched." : "Provider reconciliation found items needing review.";
    }

    await finishOperation({
      supabase,
      operationId: operation.id,
      status,
      responsePayload: data,
      afterState: asObject(connection),
    });

    await supabase.from("channel_sync_logs").insert({
      family_id: input.familyId,
      provider_code: input.providerKey,
      action: input.operationType,
      status: status === "succeeded" ? "success" : "failed",
      message,
      payload: {
        operation_id: operation.id,
        dry_run: dryRun,
        requested_by: input.actorUserId ?? null,
        actor_role: input.actorRole ?? null,
        property: {
          family_id: input.familyId,
          external_property_id:
            asString(connection?.external_property_id) ??
            asString(beforeConnection?.external_property_id) ??
            null,
        },
        transition:
          input.operationType === "activate_provider" || input.operationType === "deactivate_provider"
            ? {
                requested_at: nowIso,
                provider: input.providerKey,
                old_status: {
                  sync_status: asString(beforeConnection?.sync_status) ?? null,
                  connection_status: asString(beforeConnection?.connection_status) ?? null,
                  activation_status: asString(beforeConnection?.activation_status) ?? null,
                },
                new_status: {
                  sync_status: asString(connection?.sync_status) ?? asString(beforeConnection?.sync_status) ?? null,
                  connection_status: asString(connection?.connection_status) ?? asString(beforeConnection?.connection_status) ?? null,
                  activation_status: asString(connection?.activation_status) ?? asString(beforeConnection?.activation_status) ?? null,
                },
              }
            : null,
        data,
      },
    } as never);

    return {
      ok: status === "succeeded",
      status,
      operationId: operation.id,
      providerKey: input.providerKey,
      familyId: input.familyId,
      message,
      connection,
      data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider operation failed.";
    await finishOperation({
      supabase,
      operationId: operation.id,
      status: "failed",
      errorMessage: message,
      responsePayload: { error: message },
    });
    await recordDiagnostic(supabase, {
      familyId: input.familyId,
      providerKey: input.providerKey,
      severity: "critical",
      diagnosticType: "operation_failed",
      message,
      details: {
        operation_type: input.operationType,
      },
      operationId: operation.id,
    });
    return {
      ok: false,
      status: "failed",
      operationId: operation.id,
      providerKey: input.providerKey,
      familyId: input.familyId,
      message,
      connection: beforeConnection,
      data: { error: message },
    };
  }
}

export async function enqueueChannelSyncJob(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    providerKey: ChannelProviderKey;
    jobType:
      | "provider_refresh"
      | "provider_reconcile"
      | "booking_feed_poll"
      | "booking_acknowledge"
      | "booking_modification_apply"
      | "booking_cancellation_apply"
      | "ari_push"
      | "availability_update"
      | "rate_update"
      | "restriction_update"
      | "full_sync"
      | "diagnostic_check";
    payload?: JsonRecord;
    idempotencyKey?: string | null;
    priority?: number;
    runAfter?: string | null;
    maxAttempts?: number;
  }
): Promise<string | null> {
  const queuedAt = new Date().toISOString();
  const baseJobRow = {
    family_id: input.familyId,
    provider_code: input.providerKey,
    job_type: input.jobType,
    status: "queued",
    priority: input.priority ?? 100,
    idempotency_key: input.idempotencyKey ?? null,
    payload: input.payload ?? {},
    max_attempts: input.maxAttempts ?? 5,
    run_after: input.runAfter ?? queuedAt,
    updated_at: queuedAt,
  } as const;

  const existingJobResult =
    input.idempotencyKey != null
      ? await supabase
          .from("channel_sync_jobs")
          .select("id")
          .eq("idempotency_key", input.idempotencyKey)
          .maybeSingle()
      : { data: null, error: null };
  if (existingJobResult.error) throw existingJobResult.error;

  const { data, error } = existingJobResult.data?.id
    ? await supabase
        .from("channel_sync_jobs")
        .update(baseJobRow as never)
        .eq("id", existingJobResult.data.id)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("channel_sync_jobs")
        .insert(baseJobRow as never)
        .select("id")
        .maybeSingle();
  if (error) throw error;
  return asString((data as JsonRecord | null)?.id);
}

async function deferChannexAriJobForRateLimit(
  supabase: SupabaseClient,
  input: { jobId: string }
): Promise<boolean> {
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await supabase
    .from("channel_sync_jobs")
    .select("id", { count: "exact", head: true })
    .in("job_type", ["availability_update", "rate_update", "restriction_update", "full_sync"])
    .in("status", ["running", "succeeded"])
    .gte("updated_at", oneMinuteAgo);
  if (error) throw error;
  if ((count ?? 0) < 20) return false;

  await supabase
    .from("channel_sync_jobs")
    .update({
      status: "retrying",
      last_error: "Deferred to respect Channex ARI rate limit (20 requests/minute).",
      run_after: new Date(Date.now() + 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", input.jobId);
  return true;
}

export async function processDueChannelSyncJobs(
  supabase: SupabaseClient,
  input?: { limit?: number; workerId?: string }
): Promise<{ processed: number; succeeded: number; failed: number; deadLettered: number; results: JsonRecord[] }> {
  const { data: jobs, error } = await supabase.rpc("claim_channel_sync_jobs", {
    p_limit: input?.limit ?? 10,
    p_worker_id: input?.workerId ?? "channel-sync-worker",
  });
  if (error) throw error;

  const results: JsonRecord[] = [];
  let succeeded = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const job of (jobs ?? []) as JsonRecord[]) {
    const jobId = asString(job.id);
    const familyId = asString(job.family_id);
    const providerKey = asString(job.provider_code) as ChannelProviderKey | null;
    const jobType = asString(job.job_type);
    const attempts = typeof job.attempts === "number" ? job.attempts : Number(job.attempts ?? 1);
    const maxAttempts = typeof job.max_attempts === "number" ? job.max_attempts : Number(job.max_attempts ?? 5);
    if (!jobId || !familyId || !providerKey || !jobType) continue;

    try {
      if (isChannexAriJobType(jobType)) {
        const deferredForRateLimit = await deferChannexAriJobForRateLimit(supabase, { jobId });
        if (deferredForRateLimit) {
          failed += 1;
          results.push({ job_id: jobId, ok: false, deferred: true, reason: "channex_ari_rate_limit" });
          continue;
        }

        const ariResult = await processChannexAriSyncJob(supabase, job);
        const retryable = ariResult.httpStatus === 429 || (ariResult.httpStatus != null && ariResult.httpStatus >= 500);
        const nextStatus = ariResult.ok
          ? "succeeded"
          : retryable
            ? attempts >= maxAttempts
              ? "dead_lettered"
              : "retrying"
            : "failed";

        await supabase
          .from("channel_sync_jobs")
          .update({
            status: nextStatus,
            result: {
              ...ariResult.result,
              task_ids: ariResult.taskIds,
            },
            last_error: ariResult.ok ? null : ariResult.message,
            dead_lettered_at: nextStatus === "dead_lettered" ? new Date().toISOString() : null,
            completed_at: nextStatus === "succeeded" || nextStatus === "failed" ? new Date().toISOString() : null,
            processed_at: ariResult.ok ? new Date().toISOString() : null,
            channex_task_id: ariResult.taskIds[0] ?? null,
            run_after:
              nextStatus === "retrying"
                ? ariResult.retryAfterAt ?? nextChannexRetryAt(attempts, null)
                : new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", jobId);

        if (ariResult.ok) succeeded += 1;
        else if (nextStatus === "dead_lettered") deadLettered += 1;
        else failed += 1;
        results.push({ job_id: jobId, ok: ariResult.ok, result: ariResult.result, task_ids: ariResult.taskIds });
        continue;
      }

      const operationType: ChannelProviderOperationType =
        jobType === "provider_reconcile"
          ? "reconcile"
          : jobType === "diagnostic_check"
            ? "test_provider"
            : "refresh_provider";
      const result = await executeChannelProviderOperation(supabase, {
        familyId,
        providerKey,
        operationType,
        actorRole: "system",
        dryRun: true,
        idempotencyKey: `job:${jobId}:${attempts}`,
        payload: asObject(job.payload),
      });

      await supabase
        .from("channel_sync_jobs")
        .update({
          status: result.ok ? "succeeded" : attempts >= maxAttempts ? "dead_lettered" : "retrying",
          operation_id: result.operationId,
          result: result.data,
          last_error: result.ok ? null : result.message,
          dead_lettered_at: !result.ok && attempts >= maxAttempts ? new Date().toISOString() : null,
          completed_at: result.ok ? new Date().toISOString() : null,
          processed_at: result.ok ? new Date().toISOString() : null,
          run_after: result.ok ? new Date().toISOString() : new Date(Date.now() + Math.min(60, attempts * 10) * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", jobId);

      if (result.ok) succeeded += 1;
      else if (attempts >= maxAttempts) deadLettered += 1;
      else failed += 1;
      results.push({ job_id: jobId, ok: result.ok, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Channel sync job failed.";
      const dead = attempts >= maxAttempts;
      await supabase
        .from("channel_sync_jobs")
        .update({
          status: dead ? "dead_lettered" : "retrying",
          last_error: message,
          dead_lettered_at: dead ? new Date().toISOString() : null,
          run_after: new Date(Date.now() + Math.min(60, attempts * 10) * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", jobId);
      if (dead) deadLettered += 1;
      else failed += 1;
      results.push({ job_id: jobId, ok: false, error: message });
    }
  }

  return {
    processed: results.length,
    succeeded,
    failed,
    deadLettered,
    results,
  };
}
