import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

export type ChannelProviderRecord = {
  id: string;
  code: string;
  name: string;
  status: string;
  metadata: JsonRecord;
  createdAt: string | null;
};

export type ChannelPropertyRecord = {
  id: string;
  familyId: string;
  providerCode: string;
  externalPropertyId: string | null;
  propertyModel: string | null;
  propertyType: string | null;
  syncStatus: string;
  lastSyncedAt: string | null;
  metadata: JsonRecord;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ChannelRoomMappingRecord = {
  id: string;
  familyId: string;
  stayUnitId: string;
  providerCode: string;
  externalPropertyId: string | null;
  externalRoomTypeId: string | null;
  countOfRooms: number;
  syncStatus: string;
  metadata: JsonRecord;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ChannelRatePlanRecord = {
  id: string;
  familyId: string;
  stayUnitId: string | null;
  providerCode: string;
  externalRatePlanId: string | null;
  title: string;
  mealPlan: string;
  syncStatus: string;
  metadata: JsonRecord;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ChannelSyncLogRecord = {
  id: string;
  familyId: string;
  providerCode: string;
  action: string;
  status: string;
  message: string | null;
  payload: JsonRecord;
  createdAt: string | null;
};

export type ChannelBookingRevisionRecord = {
  id: string;
  familyId: string;
  providerCode: string;
  externalPropertyId: string | null;
  externalBookingId: string | null;
  externalRevisionId: string | null;
  externalRoomTypeId: string | null;
  externalRatePlanId: string | null;
  otaName: string | null;
  status: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  guestName: string | null;
  amount: number | null;
  currency: string | null;
  paymentCollect: string | null;
  importStatus: string;
  ackStatus: string;
  rawPayload: JsonRecord;
  createdAt: string | null;
  updatedAt: string | null;
};

export type HostProChannelFoundation = {
  providers: ChannelProviderRecord[];
  properties: ChannelPropertyRecord[];
  roomMappings: ChannelRoomMappingRecord[];
  ratePlans: ChannelRatePlanRecord[];
  syncLogs: ChannelSyncLogRecord[];
  bookingRevisions: ChannelBookingRevisionRecord[];
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function missingTableError(error: unknown): boolean {
  const message =
    error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return /relation|does not exist|schema cache/i.test(message);
}

export async function loadHostProChannelFoundation(
  supabase: SupabaseClient,
  familyId: string
): Promise<HostProChannelFoundation> {
  const normalizedFamilyId = familyId.trim();
  if (!normalizedFamilyId) {
    return {
      providers: [],
      properties: [],
      roomMappings: [],
      ratePlans: [],
      syncLogs: [],
      bookingRevisions: [],
    };
  }

  const [providersResult, propertiesResult, roomMappingsResult, ratePlansResult, syncLogsResult, bookingRevisionsResult] = await Promise.all([
    supabase.from("channel_providers").select("id,code,name,status,metadata,created_at").order("name", { ascending: true }),
    supabase
      .from("channel_properties")
      .select("id,family_id,provider_code,external_property_id,property_model,property_type,sync_status,last_synced_at,metadata,created_at,updated_at")
      .eq("family_id", normalizedFamilyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("channel_room_mappings")
      .select("id,family_id,stay_unit_id,provider_code,external_property_id,external_room_type_id,count_of_rooms,sync_status,metadata,created_at,updated_at")
      .eq("family_id", normalizedFamilyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("channel_rate_plans")
      .select("id,family_id,stay_unit_id,provider_code,external_rate_plan_id,title,meal_plan,sync_status,metadata,created_at,updated_at")
      .eq("family_id", normalizedFamilyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("channel_sync_logs")
      .select("id,family_id,provider_code,action,status,message,payload,created_at")
      .eq("family_id", normalizedFamilyId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("channel_booking_revisions")
      .select("id,family_id,provider_code,external_property_id,external_booking_id,external_revision_id,external_room_type_id,external_rate_plan_id,ota_name,status,arrival_date,departure_date,guest_name,amount,currency,payment_collect,raw_payload,import_status,ack_status,created_at,updated_at")
      .eq("family_id", normalizedFamilyId)
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);

  const errors = [
    providersResult.error,
    propertiesResult.error,
    roomMappingsResult.error,
    ratePlansResult.error,
    syncLogsResult.error,
    bookingRevisionsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    const firstError = errors[0];
    if (missingTableError(firstError)) {
      return {
        providers: [],
        properties: [],
        roomMappings: [],
        ratePlans: [],
        syncLogs: [],
        bookingRevisions: [],
      };
    }
    throw firstError;
  }

  return {
    providers: (providersResult.data ?? []).map((row) => ({
      id: asString(row.id) ?? "",
      code: asString(row.code) ?? "",
      name: asString(row.name) ?? "Provider",
      status: asString(row.status) ?? "available",
      metadata: asObject(row.metadata),
      createdAt: asString(row.created_at),
    })),
    properties: (propertiesResult.data ?? []).map((row) => ({
      id: asString(row.id) ?? "",
      familyId: asString(row.family_id) ?? normalizedFamilyId,
      providerCode: asString(row.provider_code) ?? "",
      externalPropertyId: asString(row.external_property_id),
      propertyModel: asString(row.property_model),
      propertyType: asString(row.property_type),
      syncStatus: asString(row.sync_status) ?? "not_connected",
      lastSyncedAt: asString(row.last_synced_at),
      metadata: asObject(row.metadata),
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
    })),
    roomMappings: (roomMappingsResult.data ?? []).map((row) => ({
      id: asString(row.id) ?? "",
      familyId: asString(row.family_id) ?? normalizedFamilyId,
      stayUnitId: asString(row.stay_unit_id) ?? "",
      providerCode: asString(row.provider_code) ?? "",
      externalPropertyId: asString(row.external_property_id),
      externalRoomTypeId: asString(row.external_room_type_id),
      countOfRooms: Math.max(1, asNumber(row.count_of_rooms, 1)),
      syncStatus: asString(row.sync_status) ?? "not_mapped",
      metadata: asObject(row.metadata),
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
    })),
    ratePlans: (ratePlansResult.data ?? []).map((row) => ({
      id: asString(row.id) ?? "",
      familyId: asString(row.family_id) ?? normalizedFamilyId,
      stayUnitId: asString(row.stay_unit_id),
      providerCode: asString(row.provider_code) ?? "",
      externalRatePlanId: asString(row.external_rate_plan_id),
      title: asString(row.title) ?? "Standard Rate",
      mealPlan: asString(row.meal_plan) ?? "room_only",
      syncStatus: asString(row.sync_status) ?? "not_mapped",
      metadata: asObject(row.metadata),
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
    })),
    syncLogs: (syncLogsResult.data ?? []).map((row) => ({
      id: asString(row.id) ?? "",
      familyId: asString(row.family_id) ?? normalizedFamilyId,
      providerCode: asString(row.provider_code) ?? "",
      action: asString(row.action) ?? "unknown",
      status: asString(row.status) ?? "unknown",
      message: asString(row.message),
      payload: asObject(row.payload),
      createdAt: asString(row.created_at),
    })),
    bookingRevisions: (bookingRevisionsResult.data ?? []).map((row) => ({
      id: asString(row.id) ?? "",
      familyId: asString(row.family_id) ?? normalizedFamilyId,
      providerCode: asString(row.provider_code) ?? "",
      externalPropertyId: asString(row.external_property_id),
      externalBookingId: asString(row.external_booking_id),
      externalRevisionId: asString(row.external_revision_id),
      externalRoomTypeId: asString(row.external_room_type_id),
      externalRatePlanId: asString(row.external_rate_plan_id),
      otaName: asString(row.ota_name),
      status: asString(row.status),
      arrivalDate: asString(row.arrival_date),
      departureDate: asString(row.departure_date),
      guestName: asString(row.guest_name),
      amount: row.amount == null ? null : asNumber(row.amount, 0),
      currency: asString(row.currency),
      paymentCollect: asString(row.payment_collect),
      importStatus: asString(row.import_status) ?? "preview",
      ackStatus: asString(row.ack_status) ?? "not_acknowledged",
      rawPayload: asObject(row.raw_payload),
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
    })),
  };
}
