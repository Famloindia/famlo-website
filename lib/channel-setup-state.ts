import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";
import type { ChannelPropertyRecord } from "@/lib/host-pro-channel-foundation";

type JsonRecord = Record<string, unknown>;

export type ChannelSetupStatus =
  | "not_started"
  | "setup_started"
  | "needs_details"
  | "connection_requested"
  | "matching_needed"
  | "ready_for_test_sync"
  | "needs_review"
  | "live";

export type ChannelSetupMode = "existing_listing" | "prepare_listing" | null;

export type ChannelSetupStep =
  | "listing"
  | "requirements"
  | "connection"
  | "room_matching"
  | "price_matching"
  | "test_sync"
  | "activate";

export type ChannelSetupMetadata = {
  has_existing_listing: boolean | null;
  required_items_acknowledged: boolean | null;
  hotel_id_entered: boolean | null;
  operator_notes: string | null;
  requested_at: string | null;
  setup_requested_at: string | null;
  updated_at: string | null;
};

export type ChannelSetupState = {
  familyId: string;
  providerKey: ChannelProviderKey;
  status: ChannelSetupStatus;
  setupMode: ChannelSetupMode;
  currentStep: ChannelSetupStep | null;
  lastError: string | null;
  metadata: ChannelSetupMetadata;
  createdAt: string | null;
  updatedAt: string | null;
  externalPropertyId: string | null;
  syncStatus: string;
};

const CHANNEL_SETUP_STATUSES: readonly ChannelSetupStatus[] = [
  "not_started",
  "setup_started",
  "needs_details",
  "connection_requested",
  "matching_needed",
  "ready_for_test_sync",
  "needs_review",
  "live",
];

const CHANNEL_SETUP_STEPS: readonly ChannelSetupStep[] = [
  "listing",
  "requirements",
  "connection",
  "room_matching",
  "price_matching",
  "test_sync",
  "activate",
];

const CHANNEL_SETUP_MODE_VALUES = new Set<NonNullable<ChannelSetupMode>>(["existing_listing", "prepare_listing"]);

const CHANNEL_PROVIDER_KEYS = new Set<ChannelProviderKey>(["booking", "mmt", "airbnb", "agoda", "expedia", "google-hotel"]);

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function normalizeStep(value: unknown): ChannelSetupStep | null {
  const candidate = asString(value);
  return candidate && (CHANNEL_SETUP_STEPS as readonly string[]).includes(candidate) ? (candidate as ChannelSetupStep) : null;
}

export function isChannelProviderKey(value: string): value is ChannelProviderKey {
  return CHANNEL_PROVIDER_KEYS.has(value as ChannelProviderKey);
}

export function isChannelSetupStatus(value: string): value is ChannelSetupStatus {
  return CHANNEL_SETUP_STATUSES.includes(value as ChannelSetupStatus);
}

export function sanitizeChannelSetupStatus(value: unknown): ChannelSetupStatus | null {
  const candidate = asString(value);
  return candidate && isChannelSetupStatus(candidate) ? candidate : null;
}

export function sanitizeChannelSetupMode(value: unknown): ChannelSetupMode | null {
  const candidate = asString(value);
  if (!candidate) return null;
  return CHANNEL_SETUP_MODE_VALUES.has(candidate as NonNullable<ChannelSetupMode>) ? (candidate as ChannelSetupMode) : null;
}

export function sanitizeChannelSetupStep(value: unknown): ChannelSetupStep | null {
  return normalizeStep(value);
}

export function getChannelSetupStatusLabel(status: ChannelSetupStatus): string {
  switch (status) {
    case "setup_started":
      return "Setup started";
    case "needs_details":
      return "Needs details";
    case "connection_requested":
      return "Assisted setup requested";
    case "matching_needed":
      return "Matching needed";
    case "ready_for_test_sync":
      return "Ready for test sync";
    case "needs_review":
      return "Needs review";
    case "live":
      return "Live";
    case "not_started":
    default:
      return "Not started";
  }
}

export function getChannelSetupStepLabel(step: ChannelSetupStep | null): string {
  switch (step) {
    case "listing":
      return "Already listed on this OTA?";
    case "requirements":
      return "Requirements";
    case "connection":
      return "Connection details / instructions";
    case "room_matching":
      return "Room matching";
    case "price_matching":
      return "Price matching";
    case "test_sync":
      return "Test sync readiness";
    case "activate":
      return "Activate";
    default:
      return "Setup not started";
  }
}

export function readChannelSetupMetadata(value: unknown): ChannelSetupMetadata {
  const metadata = asObject(value);
  const setup = asObject(metadata.channel_setup ?? metadata.setup_state ?? metadata.channelSetup ?? {});

  return {
    has_existing_listing: asBoolean(setup.has_existing_listing),
    required_items_acknowledged: asBoolean(setup.required_items_acknowledged),
    hotel_id_entered: asBoolean(setup.hotel_id_entered),
    operator_notes: asString(setup.operator_notes),
    requested_at: asString(setup.requested_at),
    setup_requested_at: asString(setup.setup_requested_at),
    updated_at: asString(setup.updated_at),
  };
}

export function readChannelSetupState(property: ChannelPropertyRecord): ChannelSetupState {
  const metadata = readChannelSetupMetadata(property.metadata);
  const setup = asObject(property.metadata);
  const nestedSetup = asObject(setup.channel_setup ?? setup.setup_state ?? setup.channelSetup ?? {});
  const status = sanitizeChannelSetupStatus(nestedSetup.status) ?? "not_started";

  return {
    familyId: property.familyId,
    providerKey: property.providerCode as ChannelProviderKey,
    status,
    setupMode: sanitizeChannelSetupMode(nestedSetup.setup_mode) ?? null,
    currentStep: sanitizeChannelSetupStep(nestedSetup.current_step),
    lastError: asString(nestedSetup.last_error),
    metadata,
    createdAt: property.createdAt,
    updatedAt: property.updatedAt,
    externalPropertyId: property.externalPropertyId,
    syncStatus: property.syncStatus,
  };
}

export function createDefaultChannelSetupState(familyId: string, providerKey: ChannelProviderKey): ChannelSetupState {
  return {
    familyId,
    providerKey,
    status: "not_started",
    setupMode: null,
    currentStep: "listing",
    lastError: null,
    metadata: {
      has_existing_listing: null,
      required_items_acknowledged: null,
      hotel_id_entered: null,
      operator_notes: null,
      requested_at: null,
      setup_requested_at: null,
      updated_at: null,
    },
    createdAt: null,
    updatedAt: null,
    externalPropertyId: null,
    syncStatus: "not_connected",
  };
}

export function mergeChannelSetupMetadata(
  existingMetadata: unknown,
  patch: {
    status?: ChannelSetupStatus | null;
    setupMode?: ChannelSetupMode | null;
    currentStep?: ChannelSetupStep | null;
    lastError?: string | null;
    requestedAt?: string | null;
    setupRequestedAt?: string | null;
    metadataPatch?: unknown;
    updatedAt?: string | null;
  }
): JsonRecord {
  const currentMetadata = asObject(existingMetadata);
  const currentSetup = asObject(currentMetadata.channel_setup ?? currentMetadata.setup_state ?? currentMetadata.channelSetup ?? {});
  const patchMetadata = asObject(patch.metadataPatch);
  const safePatch = {
    has_existing_listing: asBoolean(patchMetadata.has_existing_listing),
    required_items_acknowledged: asBoolean(patchMetadata.required_items_acknowledged),
    hotel_id_entered: asBoolean(patchMetadata.hotel_id_entered),
    operator_notes: asString(patchMetadata.operator_notes),
  };

  const nextSetup: JsonRecord = {
    ...currentSetup,
    ...safePatch,
    status: patch.status ?? currentSetup.status ?? "not_started",
    setup_mode: patch.setupMode ?? currentSetup.setup_mode ?? null,
    current_step: patch.currentStep ?? currentSetup.current_step ?? "listing",
    last_error: patch.lastError ?? currentSetup.last_error ?? null,
    requested_at: patch.requestedAt ?? currentSetup.requested_at ?? null,
    setup_requested_at: patch.setupRequestedAt ?? currentSetup.setup_requested_at ?? null,
    updated_at: patch.updatedAt ?? currentSetup.updated_at ?? null,
  };

  return {
    ...currentMetadata,
    channel_setup: nextSetup,
  };
}

