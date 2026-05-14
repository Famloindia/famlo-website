import type { ChannelProviderKey } from "@/lib/channel-providers/provider-registry";
import { getChannelProviderDefinition } from "@/lib/channel-providers/provider-registry";
import type { ChannelPropertyRecord } from "@/lib/host-pro-channel-foundation";

type JsonRecord = Record<string, unknown>;

export type ChannelSetupStatus =
  | "not_started"
  | "setup_started"
  | "needs_details"
  | "connection_requested"
  | "matching_needed"
  | "ready_for_test_sync"
  | "review_requested"
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
  existing_listing_confirmed: boolean | null;
  listing_preparation_requested: boolean | null;
  requirements_acknowledged: boolean | null;
  hotel_id_available: boolean | null;
  booking_hotel_id: string | null;
  booking_property_code: string | null;
  provider_listing_id: string | null;
  provider_property_code: string | null;
  provider_listing_url: string | null;
  provider_connection_status: string | null;
  provider_connection_error: string | null;
  provider_extranet_request_acknowledged: boolean | null;
  provider_verification_requested_at: string | null;
  provider_approval_verified_at: string | null;
  provider_approval_verified_by: string | null;
  provider_access_token_stored: boolean | null;
  provider_access_token_last_four: string | null;
  provider_access_token_stored_at: string | null;
  provider_credential_store_status: string | null;
  provider_discovered_hotel_id: string | null;
  provider_discovered_channel_id: string | null;
  provider_discovered_channel_title: string | null;
  provider_channel_attached: boolean | null;
  provider_channel_active: boolean | null;
  provider_room_types_found_count: number | null;
  provider_rate_plans_found_count: number | null;
  provider_structure_refreshed_at: string | null;
  connectivity_provider_requested: boolean | null;
  connectivity_provider_requested_at: string | null;
  booking_extranet_request_acknowledged: boolean | null;
  booking_connection_status: string | null;
  booking_connection_error: string | null;
  operator_verified_booking_connection: boolean | null;
  operator_verified_booking_connection_at: string | null;
  operator_setup_requested: boolean | null;
  room_matching_reviewed: boolean | null;
  price_matching_reviewed: boolean | null;
  test_sync_review_requested: boolean | null;
  test_sync_review_requested_at: string | null;
  go_live_review_requested: boolean | null;
  go_live_review_requested_at: string | null;
  channel_ready_for_assisted_go_live: boolean | null;
  ready_for_assisted_go_live_at: string | null;
  ready_for_assisted_go_live_by: string | null;
  assisted_go_live_blockers: string[];
  operator_notes: string | null;
  requested_at: string | null;
  setup_requested_at: string | null;
  updated_at: string | null;
  has_existing_listing: boolean | null;
  required_items_acknowledged: boolean | null;
  hotel_id_entered: boolean | null;
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

export type ChannelReadinessItemKey =
  | "ota_account_or_listing"
  | "connection_details"
  | "connection_verified"
  | "rooms_available"
  | "room_matching"
  | "price_matching"
  | "calendar_rate_sync"
  | "test_sync"
  | "activation";

export type ChannelReadinessItemStatus =
  | "not_started"
  | "needed"
  | "in_progress"
  | "ready"
  | "blocked"
  | "not_available";

export type ChannelReadinessItem = {
  key: ChannelReadinessItemKey;
  label: string;
  status: ChannelReadinessItemStatus;
  explanation: string;
  operatorNote: string | null;
};

export type ChannelReadinessModel = {
  items: ChannelReadinessItem[];
  progressPercent: number;
  nextRequiredAction: string;
  warningLabel: string | null;
  setupModeLabel: string;
  setupRowExists: boolean;
  actuallyConnected: boolean;
};

export type ChannelReadinessContext = {
  activeRoomsCount: number;
  roomMappingsReadyCount: number;
  rateMappingsReadyCount: number;
  hasRealConnection: boolean;
  channelHealthNeedsAttention: boolean;
  bookingReadyForActivation: boolean;
};

export type ChannelTestSyncReadinessStatus =
  | "ready"
  | "not_ready"
  | "blocked"
  | "assisted_only"
  | "unavailable";

export type ChannelTestSyncChecklistItem = {
  key: string;
  label: string;
  status: ChannelTestSyncReadinessStatus;
  explanation: string;
  operatorNote: string | null;
};

export type ChannelTestSyncReadinessModel = {
  status: ChannelTestSyncReadinessStatus;
  statusLabel: string;
  nextRequiredAction: string;
  checklist: ChannelTestSyncChecklistItem[];
  operatorNote: string | null;
  readyForLimitedTestSync: boolean;
};

export type ChannelTestSyncReadinessContext = ChannelReadinessContext & {
  bookingFeedHealthy: boolean;
  ariSyncHealthy: boolean;
};

export type ChannelGoLiveReadinessStatus =
  | "not_ready"
  | "ready_for_review"
  | "review_requested"
  | "blocked"
  | "assisted_only"
  | "live";

export type ChannelGoLiveChecklistStatus =
  | "ready"
  | "not_ready"
  | "blocked"
  | "assisted_only"
  | "unavailable";

export type ChannelGoLiveChecklistItem = {
  key: string;
  label: string;
  status: ChannelGoLiveChecklistStatus;
  explanation: string;
  operatorNote: string | null;
};

export type ChannelGoLiveReadinessModel = {
  status: ChannelGoLiveReadinessStatus;
  statusLabel: string;
  nextRequiredAction: string;
  checklist: ChannelGoLiveChecklistItem[];
  operatorNote: string | null;
  reviewPending: boolean;
};

const CHANNEL_SETUP_STATUSES: readonly ChannelSetupStatus[] = [
  "not_started",
  "setup_started",
  "needs_details",
  "connection_requested",
  "matching_needed",
  "ready_for_test_sync",
  "review_requested",
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

function asNullableBoolean(value: unknown): boolean | null {
  return value === true ? true : value === false ? false : null;
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function hasOwn(value: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => asString(item)).filter((item): item is string => Boolean(item))
    : [];
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
    case "review_requested":
      return "Go-live review requested";
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
    existing_listing_confirmed: asNullableBoolean(setup.existing_listing_confirmed) ?? asNullableBoolean(setup.has_existing_listing),
    listing_preparation_requested: asNullableBoolean(setup.listing_preparation_requested),
    requirements_acknowledged: asNullableBoolean(setup.requirements_acknowledged) ?? asNullableBoolean(setup.required_items_acknowledged),
    hotel_id_available: asNullableBoolean(setup.hotel_id_available) ?? asNullableBoolean(setup.hotel_id_entered),
    booking_hotel_id: asString(setup.booking_hotel_id),
    booking_property_code: asString(setup.booking_property_code),
    provider_listing_id: asString(setup.provider_listing_id),
    provider_property_code: asString(setup.provider_property_code),
    provider_listing_url: asString(setup.provider_listing_url),
    provider_connection_status: asString(setup.provider_connection_status),
    provider_connection_error: asString(setup.provider_connection_error),
    provider_extranet_request_acknowledged: asNullableBoolean(setup.provider_extranet_request_acknowledged),
    provider_verification_requested_at: asString(setup.provider_verification_requested_at),
    provider_approval_verified_at: asString(setup.provider_approval_verified_at),
    provider_approval_verified_by: asString(setup.provider_approval_verified_by),
    provider_access_token_stored: asNullableBoolean(setup.provider_access_token_stored),
    provider_access_token_last_four: asString(setup.provider_access_token_last_four),
    provider_access_token_stored_at: asString(setup.provider_access_token_stored_at),
    provider_credential_store_status: asString(setup.provider_credential_store_status),
    provider_discovered_hotel_id: asString(setup.provider_discovered_hotel_id),
    provider_discovered_channel_id: asString(setup.provider_discovered_channel_id),
    provider_discovered_channel_title: asString(setup.provider_discovered_channel_title),
    provider_channel_attached: asNullableBoolean(setup.provider_channel_attached),
    provider_channel_active: asNullableBoolean(setup.provider_channel_active),
    provider_room_types_found_count: asNumberOrNull(setup.provider_room_types_found_count),
    provider_rate_plans_found_count: asNumberOrNull(setup.provider_rate_plans_found_count),
    provider_structure_refreshed_at: asString(setup.provider_structure_refreshed_at),
    connectivity_provider_requested: asNullableBoolean(setup.connectivity_provider_requested),
    connectivity_provider_requested_at: asString(setup.connectivity_provider_requested_at),
    booking_extranet_request_acknowledged: asNullableBoolean(setup.booking_extranet_request_acknowledged),
    booking_connection_status: asString(setup.booking_connection_status),
    booking_connection_error: asString(setup.booking_connection_error),
    operator_verified_booking_connection: asNullableBoolean(setup.operator_verified_booking_connection),
    operator_verified_booking_connection_at: asString(setup.operator_verified_booking_connection_at),
    operator_setup_requested: asNullableBoolean(setup.operator_setup_requested),
    room_matching_reviewed: asNullableBoolean(setup.room_matching_reviewed),
    price_matching_reviewed: asNullableBoolean(setup.price_matching_reviewed),
    test_sync_review_requested: asNullableBoolean(setup.test_sync_review_requested),
    test_sync_review_requested_at: asString(setup.test_sync_review_requested_at),
    go_live_review_requested: asNullableBoolean(setup.go_live_review_requested),
    go_live_review_requested_at: asString(setup.go_live_review_requested_at),
    channel_ready_for_assisted_go_live: asNullableBoolean(setup.channel_ready_for_assisted_go_live),
    ready_for_assisted_go_live_at: asString(setup.ready_for_assisted_go_live_at),
    ready_for_assisted_go_live_by: asString(setup.ready_for_assisted_go_live_by),
    assisted_go_live_blockers: asStringArray(setup.assisted_go_live_blockers),
    operator_notes: asString(setup.operator_notes),
    requested_at: asString(setup.requested_at),
    setup_requested_at: asString(setup.setup_requested_at),
    updated_at: asString(setup.updated_at),
    has_existing_listing: asNullableBoolean(setup.has_existing_listing) ?? asNullableBoolean(setup.existing_listing_confirmed),
    required_items_acknowledged: asNullableBoolean(setup.required_items_acknowledged) ?? asNullableBoolean(setup.requirements_acknowledged),
    hotel_id_entered: asNullableBoolean(setup.hotel_id_entered) ?? asNullableBoolean(setup.hotel_id_available),
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
      existing_listing_confirmed: null,
      listing_preparation_requested: null,
      requirements_acknowledged: null,
      hotel_id_available: null,
      booking_hotel_id: null,
      booking_property_code: null,
      provider_listing_id: null,
      provider_property_code: null,
      provider_listing_url: null,
      provider_connection_status: null,
      provider_connection_error: null,
      provider_extranet_request_acknowledged: null,
      provider_verification_requested_at: null,
      provider_approval_verified_at: null,
      provider_approval_verified_by: null,
      provider_access_token_stored: null,
      provider_access_token_last_four: null,
      provider_access_token_stored_at: null,
      provider_credential_store_status: null,
      provider_discovered_hotel_id: null,
      provider_discovered_channel_id: null,
      provider_discovered_channel_title: null,
      provider_channel_attached: null,
      provider_channel_active: null,
      provider_room_types_found_count: null,
      provider_rate_plans_found_count: null,
      provider_structure_refreshed_at: null,
      connectivity_provider_requested: null,
      connectivity_provider_requested_at: null,
      booking_extranet_request_acknowledged: null,
      booking_connection_status: null,
      booking_connection_error: null,
      operator_verified_booking_connection: null,
      operator_verified_booking_connection_at: null,
      operator_setup_requested: null,
      room_matching_reviewed: null,
      price_matching_reviewed: null,
      test_sync_review_requested: null,
      test_sync_review_requested_at: null,
      go_live_review_requested: null,
      go_live_review_requested_at: null,
      channel_ready_for_assisted_go_live: null,
      ready_for_assisted_go_live_at: null,
      ready_for_assisted_go_live_by: null,
      assisted_go_live_blockers: [],
      operator_notes: null,
      requested_at: null,
      setup_requested_at: null,
      updated_at: null,
      has_existing_listing: null,
      required_items_acknowledged: null,
      hotel_id_entered: null,
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
    existing_listing_confirmed: hasOwn(patchMetadata, "existing_listing_confirmed") || hasOwn(patchMetadata, "has_existing_listing")
      ? asBoolean(patchMetadata.existing_listing_confirmed ?? patchMetadata.has_existing_listing)
      : undefined,
    listing_preparation_requested: hasOwn(patchMetadata, "listing_preparation_requested") ? asBoolean(patchMetadata.listing_preparation_requested) : undefined,
    requirements_acknowledged: hasOwn(patchMetadata, "requirements_acknowledged") || hasOwn(patchMetadata, "required_items_acknowledged")
      ? asBoolean(patchMetadata.requirements_acknowledged ?? patchMetadata.required_items_acknowledged)
      : undefined,
    hotel_id_available: hasOwn(patchMetadata, "hotel_id_available") || hasOwn(patchMetadata, "hotel_id_entered")
      ? asBoolean(patchMetadata.hotel_id_available ?? patchMetadata.hotel_id_entered)
      : undefined,
    booking_hotel_id: hasOwn(patchMetadata, "booking_hotel_id") ? asString(patchMetadata.booking_hotel_id) : undefined,
    booking_property_code: hasOwn(patchMetadata, "booking_property_code") ? asString(patchMetadata.booking_property_code) : undefined,
    provider_listing_id: hasOwn(patchMetadata, "provider_listing_id") ? asString(patchMetadata.provider_listing_id) : undefined,
    provider_property_code: hasOwn(patchMetadata, "provider_property_code") ? asString(patchMetadata.provider_property_code) : undefined,
    provider_listing_url: hasOwn(patchMetadata, "provider_listing_url") ? asString(patchMetadata.provider_listing_url) : undefined,
    provider_connection_status: hasOwn(patchMetadata, "provider_connection_status") ? asString(patchMetadata.provider_connection_status) : undefined,
    provider_connection_error: hasOwn(patchMetadata, "provider_connection_error") ? asString(patchMetadata.provider_connection_error) : undefined,
    provider_extranet_request_acknowledged: hasOwn(patchMetadata, "provider_extranet_request_acknowledged") ? asBoolean(patchMetadata.provider_extranet_request_acknowledged) : undefined,
    provider_verification_requested_at: hasOwn(patchMetadata, "provider_verification_requested_at") ? asString(patchMetadata.provider_verification_requested_at) : undefined,
    provider_approval_verified_at: hasOwn(patchMetadata, "provider_approval_verified_at") ? asString(patchMetadata.provider_approval_verified_at) : undefined,
    provider_approval_verified_by: hasOwn(patchMetadata, "provider_approval_verified_by") ? asString(patchMetadata.provider_approval_verified_by) : undefined,
    provider_access_token_stored: hasOwn(patchMetadata, "provider_access_token_stored") ? asBoolean(patchMetadata.provider_access_token_stored) : undefined,
    provider_access_token_last_four: hasOwn(patchMetadata, "provider_access_token_last_four") ? asString(patchMetadata.provider_access_token_last_four) : undefined,
    provider_access_token_stored_at: hasOwn(patchMetadata, "provider_access_token_stored_at") ? asString(patchMetadata.provider_access_token_stored_at) : undefined,
    provider_credential_store_status: hasOwn(patchMetadata, "provider_credential_store_status") ? asString(patchMetadata.provider_credential_store_status) : undefined,
    provider_discovered_hotel_id: hasOwn(patchMetadata, "provider_discovered_hotel_id") ? asString(patchMetadata.provider_discovered_hotel_id) : undefined,
    provider_discovered_channel_id: hasOwn(patchMetadata, "provider_discovered_channel_id") ? asString(patchMetadata.provider_discovered_channel_id) : undefined,
    provider_discovered_channel_title: hasOwn(patchMetadata, "provider_discovered_channel_title") ? asString(patchMetadata.provider_discovered_channel_title) : undefined,
    provider_channel_attached: hasOwn(patchMetadata, "provider_channel_attached") ? asBoolean(patchMetadata.provider_channel_attached) : undefined,
    provider_channel_active: hasOwn(patchMetadata, "provider_channel_active") ? asBoolean(patchMetadata.provider_channel_active) : undefined,
    provider_room_types_found_count: hasOwn(patchMetadata, "provider_room_types_found_count") ? asNumberOrNull(patchMetadata.provider_room_types_found_count) : undefined,
    provider_rate_plans_found_count: hasOwn(patchMetadata, "provider_rate_plans_found_count") ? asNumberOrNull(patchMetadata.provider_rate_plans_found_count) : undefined,
    provider_structure_refreshed_at: hasOwn(patchMetadata, "provider_structure_refreshed_at") ? asString(patchMetadata.provider_structure_refreshed_at) : undefined,
    connectivity_provider_requested: hasOwn(patchMetadata, "connectivity_provider_requested") ? asBoolean(patchMetadata.connectivity_provider_requested) : undefined,
    connectivity_provider_requested_at: hasOwn(patchMetadata, "connectivity_provider_requested_at") ? asString(patchMetadata.connectivity_provider_requested_at) : undefined,
    booking_extranet_request_acknowledged: hasOwn(patchMetadata, "booking_extranet_request_acknowledged") ? asBoolean(patchMetadata.booking_extranet_request_acknowledged) : undefined,
    booking_connection_status: hasOwn(patchMetadata, "booking_connection_status") ? asString(patchMetadata.booking_connection_status) : undefined,
    booking_connection_error: hasOwn(patchMetadata, "booking_connection_error") ? asString(patchMetadata.booking_connection_error) : undefined,
    operator_verified_booking_connection: hasOwn(patchMetadata, "operator_verified_booking_connection") ? asBoolean(patchMetadata.operator_verified_booking_connection) : undefined,
    operator_verified_booking_connection_at: hasOwn(patchMetadata, "operator_verified_booking_connection_at") ? asString(patchMetadata.operator_verified_booking_connection_at) : undefined,
    operator_setup_requested: hasOwn(patchMetadata, "operator_setup_requested") ? asBoolean(patchMetadata.operator_setup_requested) : undefined,
    room_matching_reviewed: hasOwn(patchMetadata, "room_matching_reviewed") ? asBoolean(patchMetadata.room_matching_reviewed) : undefined,
    price_matching_reviewed: hasOwn(patchMetadata, "price_matching_reviewed") ? asBoolean(patchMetadata.price_matching_reviewed) : undefined,
    test_sync_review_requested: hasOwn(patchMetadata, "test_sync_review_requested") ? asBoolean(patchMetadata.test_sync_review_requested) : undefined,
    test_sync_review_requested_at: hasOwn(patchMetadata, "test_sync_review_requested_at") ? asString(patchMetadata.test_sync_review_requested_at) : undefined,
    go_live_review_requested: hasOwn(patchMetadata, "go_live_review_requested") ? asBoolean(patchMetadata.go_live_review_requested) : undefined,
    go_live_review_requested_at: hasOwn(patchMetadata, "go_live_review_requested_at") ? asString(patchMetadata.go_live_review_requested_at) : undefined,
    channel_ready_for_assisted_go_live: hasOwn(patchMetadata, "channel_ready_for_assisted_go_live") ? asBoolean(patchMetadata.channel_ready_for_assisted_go_live) : undefined,
    ready_for_assisted_go_live_at: hasOwn(patchMetadata, "ready_for_assisted_go_live_at") ? asString(patchMetadata.ready_for_assisted_go_live_at) : undefined,
    ready_for_assisted_go_live_by: hasOwn(patchMetadata, "ready_for_assisted_go_live_by") ? asString(patchMetadata.ready_for_assisted_go_live_by) : undefined,
    assisted_go_live_blockers: Array.isArray(patchMetadata.assisted_go_live_blockers)
      ? asStringArray(patchMetadata.assisted_go_live_blockers)
      : undefined,
    operator_notes: hasOwn(patchMetadata, "operator_notes") ? asString(patchMetadata.operator_notes) : undefined,
  };
  const compactSafePatch = Object.fromEntries(
    Object.entries(safePatch).filter(([, value]) => value !== undefined)
  );

  const nextSetup: JsonRecord = {
    ...currentSetup,
    ...compactSafePatch,
    has_existing_listing: safePatch.existing_listing_confirmed ?? currentSetup.has_existing_listing ?? null,
    required_items_acknowledged: safePatch.requirements_acknowledged ?? currentSetup.required_items_acknowledged ?? null,
    hotel_id_entered: safePatch.hotel_id_available ?? currentSetup.hotel_id_entered ?? null,
    assisted_go_live_blockers: safePatch.assisted_go_live_blockers ?? asStringArray(currentSetup.assisted_go_live_blockers),
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

function hasSafeSetupProgress(state: ChannelSetupState): boolean {
  return Boolean(
    state.status !== "not_started" ||
      state.setupMode ||
      state.metadata.existing_listing_confirmed ||
      state.metadata.listing_preparation_requested ||
      state.metadata.requirements_acknowledged ||
      state.metadata.hotel_id_available ||
      state.metadata.booking_hotel_id ||
      state.metadata.booking_property_code ||
      state.metadata.provider_listing_id ||
      state.metadata.provider_property_code ||
      state.metadata.provider_listing_url ||
      state.metadata.provider_connection_status ||
      state.metadata.provider_extranet_request_acknowledged ||
      state.metadata.provider_approval_verified_at ||
      state.metadata.provider_access_token_stored ||
      state.metadata.provider_channel_attached ||
      state.metadata.provider_discovered_channel_id ||
      state.metadata.connectivity_provider_requested ||
      state.metadata.booking_extranet_request_acknowledged ||
      state.metadata.booking_connection_status ||
      state.metadata.operator_verified_booking_connection ||
      state.metadata.operator_setup_requested ||
      state.metadata.room_matching_reviewed ||
      state.metadata.price_matching_reviewed ||
      state.metadata.test_sync_review_requested ||
      state.metadata.go_live_review_requested ||
      state.metadata.channel_ready_for_assisted_go_live
  );
}

function buildItem(
  key: ChannelReadinessItemKey,
  label: string,
  status: ChannelReadinessItemStatus,
  explanation: string,
  operatorNote: string | null = null
): ChannelReadinessItem {
  return { key, label, status, explanation, operatorNote };
}

function progressFromItems(items: ChannelReadinessItem[]): number {
  const actionable = items.filter((item) => item.status !== "not_available");
  if (actionable.length === 0) return 0;
  const readyCount = actionable.filter((item) => item.status === "ready").length;
  return Math.round((readyCount / actionable.length) * 100);
}

function setupModeLabel(state: ChannelSetupState): string {
  if (state.setupMode === "existing_listing") return "Existing listing";
  if (state.setupMode === "prepare_listing") return "Prepare listing";
  return "Assisted setup";
}

function buildTestSyncChecklistItem(
  key: string,
  label: string,
  status: ChannelTestSyncReadinessStatus,
  explanation: string,
  operatorNote: string | null = null
): ChannelTestSyncChecklistItem {
  return { key, label, status, explanation, operatorNote };
}

function testSyncStatusLabel(status: ChannelTestSyncReadinessStatus): string {
  switch (status) {
    case "ready":
      return "Ready for limited test sync";
    case "blocked":
      return "Blocked";
    case "assisted_only":
      return "Assisted only";
    case "unavailable":
      return "Unavailable";
    case "not_ready":
    default:
      return "Not ready";
  }
}

function buildGoLiveChecklistItem(
  key: string,
  label: string,
  status: ChannelGoLiveChecklistStatus,
  explanation: string,
  operatorNote: string | null = null
): ChannelGoLiveChecklistItem {
  return { key, label, status, explanation, operatorNote };
}

function goLiveStatusLabel(status: ChannelGoLiveReadinessStatus): string {
  switch (status) {
    case "ready_for_review":
      return "Ready for review";
    case "review_requested":
      return "Review requested";
    case "blocked":
      return "Blocked";
    case "assisted_only":
      return "Assisted only";
    case "live":
      return "Live";
    case "not_ready":
    default:
      return "Not ready";
  }
}

export function buildChannelGoLiveReadinessModel(
  providerKey: ChannelProviderKey,
  state: ChannelSetupState,
  context: ChannelTestSyncReadinessContext
): ChannelGoLiveReadinessModel {
  const hasRealConnection = context.hasRealConnection;
  const hasSetupRow = hasSafeSetupProgress(state);
  const readyForReview =
    providerKey === "booking" &&
    hasRealConnection &&
    (state.metadata.channel_ready_for_assisted_go_live === true ||
      (context.bookingFeedHealthy && context.ariSyncHealthy && context.bookingReadyForActivation)) &&
    !context.channelHealthNeedsAttention &&
    context.bookingReadyForActivation;
  const reviewRequested = state.status === "review_requested" || state.metadata.go_live_review_requested === true;
  const live = providerKey === "booking" && hasRealConnection && state.status === "live";

  if (providerKey !== "booking") {
    return {
      status: hasSetupRow ? "assisted_only" : "not_ready",
      statusLabel: hasSetupRow ? "Go-live review unavailable until channel connection is completed." : "Go-live review unavailable.",
      nextRequiredAction: hasSetupRow
        ? "Request Famlo setup help and finish provider connection before go-live review."
        : "Request Famlo setup help to begin the assisted setup flow.",
      checklist: [
        buildGoLiveChecklistItem("provider", "Provider connection", hasSetupRow ? "assisted_only" : "not_ready", "This provider stays assisted-only until real connection data exists.", "No live provider state exists yet."),
        buildGoLiveChecklistItem("mapping", "Room and price matching", hasSetupRow ? "assisted_only" : "not_ready", "Go-live review remains unavailable until mapping can be verified.", "Provider data is not available."),
        buildGoLiveChecklistItem("sync", "Test sync readiness", hasSetupRow ? "assisted_only" : "not_ready", "Test sync remains operator-controlled for assisted providers.", "No safe limited test sync can be inferred."),
      ],
      operatorNote: "Assisted providers need a real connection before go-live review can be requested.",
      reviewPending: false,
    };
  }

  const checklist = [
    buildGoLiveChecklistItem(
      "property",
      "Property ready",
      hasRealConnection ? "ready" : "blocked",
      hasRealConnection ? "The Booking.com staging property is loaded." : "Load the real Booking.com property before requesting review.",
      null
    ),
    buildGoLiveChecklistItem(
      "mapping",
      "Room and price matching",
      context.bookingReadyForActivation ? "ready" : "blocked",
      context.bookingReadyForActivation ? "Room and price matching are complete." : "Finish room and price matching before review.",
      null
    ),
    buildGoLiveChecklistItem(
      "sync",
      "Test sync readiness",
      context.bookingReadyForActivation ? "ready" : "blocked",
      context.bookingReadyForActivation ? "Limited test sync is ready for operator review." : "Complete the safe test sync checks first.",
      context.channelHealthNeedsAttention ? "A sync issue is still open." : null
    ),
  ];

  if (live) {
    return {
      status: "live",
      statusLabel: "Live",
      nextRequiredAction: "Live channel state is already present from real data.",
      checklist,
      operatorNote: null,
      reviewPending: false,
    };
  }

  if (reviewRequested) {
    return {
      status: context.channelHealthNeedsAttention ? "blocked" : "review_requested",
      statusLabel: context.channelHealthNeedsAttention ? "Blocked" : "Review requested",
      nextRequiredAction: context.channelHealthNeedsAttention
        ? "Review the open sync issue before a go-live review can proceed."
        : "Famlo review has been requested. Await operator approval.",
      checklist,
      operatorNote: state.metadata.channel_ready_for_assisted_go_live
        ? "Operator marked this channel ready for assisted go-live review. Activation is still disabled."
        : "Go-live review has been requested safely.",
      reviewPending: true,
    };
  }

  return {
      status: readyForReview ? "ready_for_review" : context.channelHealthNeedsAttention ? "blocked" : "not_ready",
      statusLabel: readyForReview ? "Ready for review" : context.channelHealthNeedsAttention ? "Blocked" : "Not ready",
    nextRequiredAction: readyForReview
      ? "Request Go Live Review."
      : !hasRealConnection
        ? "Complete the real Booking.com connection first."
        : !context.bookingReadyForActivation
          ? "Fix the remaining mapping or sync blockers."
          : "Operator review required before go-live.",
    checklist,
    operatorNote: context.channelHealthNeedsAttention ? "A sync issue is still open." : null,
    reviewPending: false,
  };
}

export function buildChannelTestSyncReadinessModel(
  providerKey: ChannelProviderKey,
  state: ChannelSetupState,
  context: ChannelTestSyncReadinessContext
): ChannelTestSyncReadinessModel {
  const hasRealConnection = context.hasRealConnection;
  const hasSetupRow = hasSafeSetupProgress(state);
  const activeRoomsCount = Math.max(0, context.activeRoomsCount);
  const roomMappingsReadyCount = Math.max(0, context.roomMappingsReadyCount);
  const rateMappingsReadyCount = Math.max(0, context.rateMappingsReadyCount);
  const mappedRoomsReady = activeRoomsCount > 0 && roomMappingsReadyCount >= activeRoomsCount;
  const mappedPricesReady = activeRoomsCount > 0 && rateMappingsReadyCount >= activeRoomsCount;
  const propertyExists = activeRoomsCount > 0;
  const hasCriticalSyncIssue = !context.bookingFeedHealthy || !context.ariSyncHealthy || context.channelHealthNeedsAttention;

  if (providerKey !== "booking") {
    const checklist = [
      buildTestSyncChecklistItem(
        "property_exists",
        "Property exists",
        propertyExists ? "not_ready" : "unavailable",
        propertyExists ? "A Famlo property exists, but the provider is still assisted-only." : "Create or select a Famlo property first.",
        null
      ),
      buildTestSyncChecklistItem(
        "active_room",
        "At least one active room",
        activeRoomsCount > 0 ? "not_ready" : "unavailable",
        activeRoomsCount > 0 ? `${activeRoomsCount} active room${activeRoomsCount === 1 ? "" : "s"} are available.` : "At least one active room is needed before readiness can be reviewed.",
        null
      ),
      buildTestSyncChecklistItem(
        "price",
        "Room has price",
        activeRoomsCount > 0 && rateMappingsReadyCount > 0 ? "not_ready" : "unavailable",
        activeRoomsCount > 0 && rateMappingsReadyCount > 0 ? `${rateMappingsReadyCount}/${activeRoomsCount} active rooms have matching prices.` : "Add prices before any sync review can continue.",
        null
      ),
      buildTestSyncChecklistItem(
        "connection",
        "Channel/provider connection",
        hasSetupRow ? "assisted_only" : "unavailable",
        "Test sync is unavailable until the channel connection is completed.",
        hasSetupRow ? "Assisted setup stays on until the provider connection exists." : "Request Famlo setup help to continue the assisted flow."
      ),
      buildTestSyncChecklistItem(
        "room_matching",
        "Room matching",
        mappedRoomsReady ? "not_ready" : activeRoomsCount > 0 ? "blocked" : "unavailable",
        mappedRoomsReady ? "Room matching is ready, but the provider is still assisted-only." : "Room matching remains blocked until provider data exists.",
        "Provider room data is not available yet."
      ),
      buildTestSyncChecklistItem(
        "price_matching",
        "Price matching",
        mappedPricesReady ? "not_ready" : activeRoomsCount > 0 ? "blocked" : "unavailable",
        mappedPricesReady ? "Price matching is ready, but the provider is still assisted-only." : "Price matching remains blocked until provider data exists.",
        "Provider rate data is not available yet."
      ),
      buildTestSyncChecklistItem(
        "calendar",
        "Calendar / availability data",
        "assisted_only",
        "Calendar and availability readiness stays assisted until the provider connection exists.",
        "No safe provider feed is available for this channel yet."
      ),
      buildTestSyncChecklistItem(
        "sync_issue",
        "No critical sync issue",
        "assisted_only",
        "Operator review is required before any test sync can be considered.",
        "Test sync remains operator-controlled for this provider."
      ),
    ];

    return {
      status: hasSetupRow ? "assisted_only" : "unavailable",
      statusLabel: hasSetupRow ? "Test sync unavailable until channel connection is completed." : "Test sync unavailable.",
      nextRequiredAction: hasSetupRow
        ? "Request Famlo setup help, then complete provider connection details before any test sync review."
        : "Request Famlo setup help to begin the assisted setup flow.",
      checklist,
      operatorNote: "This provider remains assisted-only until real channel data exists.",
      readyForLimitedTestSync: false,
    };
  }

  const checklist = [
    buildTestSyncChecklistItem(
      "property_exists",
      "Property exists",
      propertyExists ? "ready" : "not_ready",
      propertyExists ? "A Famlo property exists for this Booking.com setup." : "Select or create the property first.",
      null
    ),
    buildTestSyncChecklistItem(
      "active_room",
      "At least one active room",
      activeRoomsCount > 0 ? "ready" : "not_ready",
      activeRoomsCount > 0 ? `${activeRoomsCount} active room${activeRoomsCount === 1 ? "" : "s"} are available.` : "Add at least one active room before test sync can run.",
      null
    ),
    buildTestSyncChecklistItem(
      "price",
      "Room has price",
      activeRoomsCount > 0 && rateMappingsReadyCount > 0 ? "ready" : "not_ready",
      activeRoomsCount > 0 && rateMappingsReadyCount > 0 ? `${rateMappingsReadyCount}/${activeRoomsCount} active rooms have price mapping.` : "Set base prices and finish price matching.",
      null
    ),
    buildTestSyncChecklistItem(
      "connection",
      "Channel/provider connection",
      hasRealConnection ? "ready" : hasSetupRow ? "assisted_only" : "not_ready",
      hasRealConnection ? "The Booking.com staging connection is loaded." : "The Booking.com connection still needs real provider readiness.",
      hasSetupRow && !hasRealConnection ? "Setup progress exists, but it is not a live channel." : null
    ),
    buildTestSyncChecklistItem(
      "room_matching",
      "Room matching",
      mappedRoomsReady ? "ready" : "not_ready",
      mappedRoomsReady ? "All active rooms are matched." : "Finish room matching before a test sync can be considered.",
      roomMappingsReadyCount > 0 && !mappedRoomsReady ? `${roomMappingsReadyCount}/${activeRoomsCount} active rooms are matched.` : null
    ),
    buildTestSyncChecklistItem(
      "price_matching",
      "Price matching",
      mappedPricesReady ? "ready" : "not_ready",
      mappedPricesReady ? "All active rooms are matched for pricing." : "Finish price matching before a test sync can be considered.",
      rateMappingsReadyCount > 0 && !mappedPricesReady ? `${rateMappingsReadyCount}/${activeRoomsCount} active rooms are matched for pricing.` : null
    ),
    buildTestSyncChecklistItem(
      "calendar",
      "Calendar / availability data",
      context.bookingFeedHealthy && context.ariSyncHealthy ? "ready" : hasCriticalSyncIssue ? "blocked" : "not_ready",
      context.bookingFeedHealthy && context.ariSyncHealthy
        ? "Availability and rate data look safe for a limited review."
        : hasCriticalSyncIssue
          ? "A sync issue still needs review before test sync can proceed."
          : "Calendar and availability data are not ready yet.",
      hasCriticalSyncIssue ? "Review the latest sync issue before proceeding." : null
    ),
    buildTestSyncChecklistItem(
      "sync_issue",
      "No critical sync issue",
      context.bookingFeedHealthy && context.ariSyncHealthy && !context.channelHealthNeedsAttention ? "ready" : "blocked",
      context.bookingFeedHealthy && context.ariSyncHealthy && !context.channelHealthNeedsAttention
        ? "No critical sync issue is currently loaded."
        : "A critical sync issue is still loaded.",
      context.channelHealthNeedsAttention ? "Review the issue in the advanced sync tools." : null
    ),
  ];

  const readyForLimitedTestSync =
    hasRealConnection &&
    mappedRoomsReady &&
    mappedPricesReady &&
    context.bookingFeedHealthy &&
    context.ariSyncHealthy &&
    !context.channelHealthNeedsAttention;

  return {
    status: readyForLimitedTestSync ? "ready" : hasCriticalSyncIssue ? "blocked" : hasSetupRow ? "not_ready" : "not_ready",
    statusLabel: readyForLimitedTestSync
      ? "Ready for limited test sync"
      : hasCriticalSyncIssue
        ? "Blocked by sync review"
        : hasSetupRow
          ? "Not ready for limited test sync"
          : "Not ready",
    nextRequiredAction: readyForLimitedTestSync
      ? "Ready for limited test sync."
      : !hasRealConnection
        ? "Complete the Booking.com connection before test sync."
        : !mappedRoomsReady
          ? "Fix room matching before test sync."
          : !mappedPricesReady
            ? "Fix price matching before test sync."
            : hasCriticalSyncIssue
              ? "Review the latest sync issue before test sync."
              : "Operator test sync required.",
    checklist,
    operatorNote: hasSetupRow && !hasRealConnection
      ? "Setup progress exists, but it is not a live channel."
      : hasCriticalSyncIssue
        ? "A sync issue is still loaded and must be reviewed."
        : null,
    readyForLimitedTestSync,
  };
}

export function buildChannelReadinessModel(
  providerKey: ChannelProviderKey,
  state: ChannelSetupState,
  context: ChannelReadinessContext
): ChannelReadinessModel {
  const provider = getChannelProviderDefinition(providerKey);
  const hasRealConnection = context.hasRealConnection;
  const hasSetupRow = hasSafeSetupProgress(state);
  const activeRoomsCount = Math.max(0, context.activeRoomsCount);
  const roomMappingsReadyCount = Math.max(0, context.roomMappingsReadyCount);
  const rateMappingsReadyCount = Math.max(0, context.rateMappingsReadyCount);
  const mappedRoomsReady = activeRoomsCount > 0 && roomMappingsReadyCount >= activeRoomsCount;
  const mappedPricesReady = activeRoomsCount > 0 && rateMappingsReadyCount >= activeRoomsCount;
  const listingKnown =
    state.metadata.existing_listing_confirmed === true ||
    state.metadata.has_existing_listing === true ||
    state.setupMode === "existing_listing" ||
    hasRealConnection;
  const listingPrepRequested =
    state.metadata.listing_preparation_requested === true || state.setupMode === "prepare_listing";
  const requirementsAcknowledged = state.metadata.requirements_acknowledged === true || state.metadata.required_items_acknowledged === true;
  const providerIdentifierAvailable = Boolean(
    state.metadata.provider_listing_id ||
      state.metadata.provider_property_code ||
      state.metadata.provider_listing_url ||
      state.metadata.provider_connection_status === "verification_requested" ||
      state.metadata.provider_connection_status === "details_submitted" ||
      state.metadata.provider_connection_status === "ota_approval_verified" ||
      state.metadata.provider_extranet_request_acknowledged === true ||
      state.metadata.provider_channel_attached === true ||
      Boolean(state.metadata.provider_discovered_channel_id)
  );
  const hotelIdAvailable = state.metadata.hotel_id_available === true || state.metadata.hotel_id_entered === true || providerIdentifierAvailable;
  const operatorSetupRequested = state.metadata.operator_setup_requested === true || state.status === "connection_requested";
  const roomMatchingReviewed = state.metadata.room_matching_reviewed === true;
  const priceMatchingReviewed = state.metadata.price_matching_reviewed === true;
  const testSyncReviewRequested = state.metadata.test_sync_review_requested === true;
  const connectionBlockedNote =
    providerKey === "booking"
      ? "Booking.com needs a real loaded connection before verification can turn ready."
      : providerKey === "mmt"
        ? "MakeMyTrip / Goibibo setup stays assisted until Hotel ID and connection details are confirmed."
        : providerKey === "airbnb"
          ? "Airbnb needs a real authorization flow before Famlo can mark the connection verified."
          : providerKey === "agoda"
            ? "Agoda setup stays assisted until the channel-manager path is approved."
            : providerKey === "expedia"
              ? "Expedia setup stays assisted until the property/channel setup is approved."
              : "Google Hotel setup stays assisted until feed readiness is approved.";

  const items: ChannelReadinessItem[] = [
    buildItem(
      "ota_account_or_listing",
      "OTA account or listing",
      hasRealConnection || listingKnown ? "ready" : listingPrepRequested ? "in_progress" : "needed",
      hasRealConnection
        ? `${provider.displayName} is already loaded in the real connection view.`
        : providerKey === "mmt"
          ? listingPrepRequested
            ? "Prepare the existing listing or request Famlo help to continue."
            : "Confirm whether the property already exists on MakeMyTrip / Goibibo."
          : providerKey === "airbnb"
            ? "Confirm the Airbnb account or listing that should be connected."
            : providerKey === "google-hotel"
              ? "Prepare the feed or visibility target before publishing to Google Hotel."
              : providerKey === "agoda"
                ? "Confirm the Agoda or YCS account / listing that should be connected."
                : providerKey === "expedia"
                  ? "Confirm the Expedia property or channel setup that should be connected."
                  : "Confirm the Booking.com property or listing before continuing.",
      providerKey === "mmt"
        ? "A listed hotel code or prepared listing is required before assisted setup can continue."
        : providerKey === "airbnb"
          ? "Authorization still depends on the host-owned listing."
          : null
    ),
    buildItem(
      "connection_details",
      "Connection details",
      hasRealConnection
        ? "ready"
        : providerKey === "booking"
          ? operatorSetupRequested || requirementsAcknowledged
            ? "in_progress"
            : "needed"
          : providerKey === "mmt"
            ? hotelIdAvailable
              ? "in_progress"
              : "needed"
            : providerKey === "airbnb"
              ? operatorSetupRequested
                ? "in_progress"
                : "needed"
              : "needed",
      hasRealConnection
        ? "The real connection details are already loaded."
        : providerKey === "mmt"
          ? hotelIdAvailable
            ? "Hotel ID / Hotel Code has been captured safely. Connection details are still assisted."
            : "Provide the Hotel ID / Hotel Code and request Famlo setup help."
          : providerKey === "airbnb"
            ? "Authorization or listing access is required before the connection can move forward."
            : providerKey === "google-hotel"
              ? "Prepare the feed and visibility details before connection can proceed."
              : providerKey === "agoda"
                ? "Use the assisted channel-manager flow to collect the provider details."
                : providerKey === "expedia"
                  ? "Use the assisted Expedia setup flow to collect property/channel details."
                  : "Collect the Booking.com connection details before test sync can begin.",
      providerKey === "mmt"
        ? state.metadata.provider_access_token_stored
          ? "The MMT access token is stored encrypted on the server. Continue with Channex verification and mapping."
          : "Store the MMT access token securely, then continue with Channex verification and mapping."
        : providerKey === "airbnb"
          ? "No OAuth or password is stored in this phase."
          : null
    ),
    buildItem(
      "connection_verified",
      "Connection verified",
      hasRealConnection ? "ready" : hasSetupRow ? "blocked" : "needed",
      hasRealConnection ? "A real channel connection is present." : connectionBlockedNote,
      hasSetupRow && !hasRealConnection ? "Setup progress exists, but it must not be shown as a live channel." : null
    ),
    buildItem(
      "rooms_available",
      "Rooms available",
      activeRoomsCount > 0 ? "ready" : "needed",
      activeRoomsCount > 0 ? `${activeRoomsCount} active room${activeRoomsCount === 1 ? "" : "s"} are available.` : "At least one active room is needed before mapping can be completed.",
      null
    ),
    buildItem(
      "room_matching",
      "Room matching",
      !hasRealConnection && providerKey !== "booking"
        ? roomMatchingReviewed
          ? "in_progress"
          : hasSetupRow
            ? "blocked"
            : "needed"
        : mappedRoomsReady
          ? "ready"
          : roomMatchingReviewed || roomMappingsReadyCount > 0
            ? "in_progress"
            : activeRoomsCount > 0
              ? "needed"
              : "blocked",
      mappedRoomsReady
        ? "All active rooms are matched."
        : activeRoomsCount > 0
          ? roomMatchingReviewed
            ? "Room matching was reviewed and still needs the real connection to complete."
            : `${roomMappingsReadyCount}/${activeRoomsCount} active rooms are matched.`
          : "Room matching waits until at least one active room exists.",
      !hasRealConnection && providerKey !== "booking"
        ? "Room matching is waiting on a verified connection."
        : null
    ),
    buildItem(
      "price_matching",
      "Price matching",
      !hasRealConnection && providerKey !== "booking"
        ? priceMatchingReviewed
          ? "in_progress"
          : hasSetupRow
            ? "blocked"
            : "needed"
        : mappedPricesReady
          ? "ready"
          : priceMatchingReviewed || rateMappingsReadyCount > 0
            ? "in_progress"
            : activeRoomsCount > 0
              ? "needed"
              : "blocked",
      mappedPricesReady
        ? "All active rooms have price mapping."
        : activeRoomsCount > 0
          ? priceMatchingReviewed
            ? "Price matching was reviewed and still needs the real connection to complete."
            : `${rateMappingsReadyCount}/${activeRoomsCount} active rooms have price mapping.`
          : "Price matching waits until at least one active room exists.",
      !hasRealConnection && providerKey !== "booking"
        ? "Price matching is waiting on a verified connection."
        : null
    ),
    buildItem(
      "calendar_rate_sync",
      "Calendar / rate sync",
      provider.supportsCalendarRateSync
        ? hasRealConnection
          ? mappedRoomsReady && mappedPricesReady
            ? "ready"
            : "in_progress"
          : hasSetupRow
            ? "blocked"
            : "needed"
        : "not_available",
      provider.supportsCalendarRateSync
        ? hasRealConnection
          ? mappedRoomsReady && mappedPricesReady
            ? "Calendar and rate sync are ready for an operator review."
            : "Sync waits until rooms and prices are matched."
          : "Sync cannot start until a real connection exists."
        : "This provider does not use calendar / rate sync in Famlo.",
      providerKey === "booking" && hasSetupRow && !hasRealConnection
        ? "Setup-only state must not be confused with a connected channel."
        : null
    ),
    buildItem(
      "test_sync",
      "Test sync",
      providerKey === "booking"
        ? context.bookingReadyForActivation
          ? "ready"
          : hasRealConnection
            ? context.channelHealthNeedsAttention
              ? "blocked"
              : "in_progress"
            : hasSetupRow
              ? "blocked"
              : "needed"
        : hasRealConnection
          ? mappedRoomsReady && mappedPricesReady
            ? "ready"
            : "in_progress"
          : hasSetupRow
            ? "blocked"
            : "needed",
      providerKey === "booking"
        ? context.bookingReadyForActivation
          ? "The Booking.com staging property is ready for a test sync review."
          : context.channelHealthNeedsAttention
            ? "A sync issue still needs review."
            : "Finish room and price matching before test sync."
        : hasRealConnection
          ? mappedRoomsReady && mappedPricesReady
            ? "A test sync can be reviewed once the provider is fully mapped."
            : "Test sync waits until room and price mapping are complete."
          : "Test sync waits until a real connection exists.",
      testSyncReviewRequested
        ? "The host requested a test sync review."
        : providerKey !== "booking" && !hasRealConnection
          ? "This step remains assisted until connection verification exists."
          : null
    ),
    buildItem(
      "activation",
      "Activation",
      providerKey === "booking"
        ? context.bookingReadyForActivation
          ? "ready"
          : "blocked"
        : "blocked",
      providerKey === "booking"
        ? context.bookingReadyForActivation
          ? "Activation is technically ready, but the actual activate action stays disabled in this phase."
          : "Activation stays blocked until real readiness is complete."
        : "Activation stays blocked in Famlo Pro until the provider is genuinely ready.",
      providerKey === "booking" && !hasRealConnection
        ? "A setup-only row is not enough to activate a channel."
        : null
    ),
  ];

  const nextBlockingItem = items.find((item) => item.status === "needed" || item.status === "blocked" || item.status === "in_progress") ?? items[0];
  const warningLabel = hasSetupRow && !hasRealConnection
    ? "Setup progress exists, but this row must not be treated as a live connected channel."
    : null;

  return {
    items,
    progressPercent: progressFromItems(items),
    nextRequiredAction: nextBlockingItem ? `${nextBlockingItem.label}: ${nextBlockingItem.explanation}` : "All safe steps are complete.",
    warningLabel,
    setupModeLabel: setupModeLabel(state),
    setupRowExists: hasSetupRow,
    actuallyConnected: hasRealConnection,
  };
}
