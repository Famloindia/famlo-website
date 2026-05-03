import type { SupabaseClient } from "@supabase/supabase-js";

export const PRO_PROPERTY_MODEL_OPTIONS = [
  { value: "vacation_rental", label: "Vacation Rental" },
  { value: "hotel", label: "Hotel" },
] as const;

export const PRO_PROPERTY_TYPE_OPTIONS = [
  { value: "homestay", label: "Homestay" },
  { value: "guest_house", label: "Guest House" },
  { value: "farm_stay", label: "Farm Stay" },
  { value: "villa", label: "Villa" },
  { value: "apartment", label: "Apartment" },
  { value: "hotel_bnb", label: "Hotel/B&B" },
] as const;

export const PRO_DEFAULT_TIMEZONE = "Asia/Kolkata";
export const PRO_DEFAULT_CURRENCY = "INR";
export const PRO_DEFAULT_MEAL_PLAN = "room_only";
export const PRO_DEFAULT_RATE_PLAN_NAME = "Standard Rate";

export type HostProPropertyModel = (typeof PRO_PROPERTY_MODEL_OPTIONS)[number]["value"];
export type HostProPropertyType = (typeof PRO_PROPERTY_TYPE_OPTIONS)[number]["value"];

type JsonRecord = Record<string, unknown>;

export type HostProSettings = {
  id: string | null;
  familyId: string;
  exists: boolean;
  propertyModel: HostProPropertyModel | null;
  propertyType: HostProPropertyType | null;
  timezone: string;
  currency: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  defaultMealPlan: string;
  standardRatePlanName: string;
  metadata: JsonRecord;
  createdAt: string | null;
  updatedAt: string | null;
};

export type HostProSettingsInput = {
  propertyModel: string | null;
  propertyType: string | null;
  timezone: string | null;
  currency: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  defaultMealPlan: string | null;
  standardRatePlanName: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asPropertyModel(value: unknown): HostProPropertyModel | null {
  const normalized = asString(value);
  return normalized === "vacation_rental" || normalized === "hotel" ? normalized : null;
}

function asPropertyType(value: unknown): HostProPropertyType | null {
  const normalized = asString(value);
  return normalized === "homestay" ||
    normalized === "guest_house" ||
    normalized === "farm_stay" ||
    normalized === "villa" ||
    normalized === "apartment" ||
    normalized === "hotel_bnb"
    ? normalized
    : null;
}

function normalizeMetadata(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export function createDefaultHostProSettings(familyId: string): HostProSettings {
  return {
    id: null,
    familyId,
    exists: false,
    propertyModel: null,
    propertyType: null,
    timezone: PRO_DEFAULT_TIMEZONE,
    currency: PRO_DEFAULT_CURRENCY,
    checkInTime: null,
    checkOutTime: null,
    defaultMealPlan: PRO_DEFAULT_MEAL_PLAN,
    standardRatePlanName: PRO_DEFAULT_RATE_PLAN_NAME,
    metadata: {},
    createdAt: null,
    updatedAt: null,
  };
}

function mapHostProSettingsRow(row: Record<string, unknown>, familyId: string): HostProSettings {
  return {
    id: asString(row.id),
    familyId,
    exists: true,
    propertyModel: asPropertyModel(row.property_model),
    propertyType: asPropertyType(row.property_type),
    timezone: asString(row.timezone) ?? PRO_DEFAULT_TIMEZONE,
    currency: asString(row.currency) ?? PRO_DEFAULT_CURRENCY,
    checkInTime: asString(row.check_in_time),
    checkOutTime: asString(row.check_out_time),
    defaultMealPlan: asString(row.default_meal_plan) ?? PRO_DEFAULT_MEAL_PLAN,
    standardRatePlanName: asString(row.standard_rate_plan_name) ?? PRO_DEFAULT_RATE_PLAN_NAME,
    metadata: normalizeMetadata(row.metadata),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

export async function loadHostProSettings(
  supabase: SupabaseClient,
  familyId: string
): Promise<HostProSettings> {
  const normalizedFamilyId = familyId.trim();
  if (!normalizedFamilyId) {
    return createDefaultHostProSettings("");
  }

  const { data, error } = await supabase
    .from("host_pro_settings")
    .select("id,family_id,property_model,property_type,timezone,currency,check_in_time,check_out_time,default_meal_plan,standard_rate_plan_name,metadata,created_at,updated_at")
    .eq("family_id", normalizedFamilyId)
    .maybeSingle();

  if (error) {
    const message = String(error.message ?? "");
    if (/relation|does not exist|schema cache/i.test(message)) {
      return createDefaultHostProSettings(normalizedFamilyId);
    }
    throw error;
  }

  if (!data) {
    return createDefaultHostProSettings(normalizedFamilyId);
  }

  return mapHostProSettingsRow(data as Record<string, unknown>, normalizedFamilyId);
}

export function sanitizeHostProSettingsInput(input: HostProSettingsInput): HostProSettingsInput {
  return {
    propertyModel: asPropertyModel(input.propertyModel),
    propertyType: asPropertyType(input.propertyType),
    timezone: asString(input.timezone) ?? PRO_DEFAULT_TIMEZONE,
    currency: asString(input.currency) ?? PRO_DEFAULT_CURRENCY,
    checkInTime: asString(input.checkInTime),
    checkOutTime: asString(input.checkOutTime),
    defaultMealPlan: asString(input.defaultMealPlan) ?? PRO_DEFAULT_MEAL_PLAN,
    standardRatePlanName: asString(input.standardRatePlanName) ?? PRO_DEFAULT_RATE_PLAN_NAME,
  };
}

export function buildHostProSettingsUpsert(
  familyId: string,
  input: HostProSettingsInput,
  options?: {
    existingMetadata?: JsonRecord;
    metadataPatch?: JsonRecord;
    nowIso?: string;
  }
): Record<string, unknown> {
  const sanitized = sanitizeHostProSettingsInput(input);
  const metadata = {
    ...(options?.existingMetadata ?? {}),
    ...(options?.metadataPatch ?? {}),
  };

  return {
    family_id: familyId,
    property_model: sanitized.propertyModel,
    property_type: sanitized.propertyType,
    timezone: sanitized.timezone,
    currency: sanitized.currency,
    check_in_time: sanitized.checkInTime,
    check_out_time: sanitized.checkOutTime,
    default_meal_plan: sanitized.defaultMealPlan,
    standard_rate_plan_name: sanitized.standardRatePlanName,
    metadata,
    updated_at: options?.nowIso ?? new Date().toISOString(),
  };
}

export function propertyModelLabel(value: string | null | undefined): string {
  return PRO_PROPERTY_MODEL_OPTIONS.find((item) => item.value === value)?.label ?? "Not set";
}

export function propertyTypeLabel(value: string | null | undefined): string {
  return PRO_PROPERTY_TYPE_OPTIONS.find((item) => item.value === value)?.label ?? "Not set";
}
