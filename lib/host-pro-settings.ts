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
export const PRO_DEFAULT_COUNTRY = "India";

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
  otaTitle: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  country: string;
  state: string | null;
  city: string | null;
  postalCode: string | null;
  addressLine: string | null;
  latitude: number | null;
  longitude: number | null;
  propertyDescription: string | null;
  checkInInstructions: string | null;
  houseRules: string | null;
  cancellationPolicyLabel: string | null;
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
  otaTitle?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  website?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  postalCode?: string | null;
  addressLine?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  propertyDescription?: string | null;
  checkInInstructions?: string | null;
  houseRules?: string | null;
  cancellationPolicyLabel?: string | null;
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

function asNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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
    otaTitle: null,
    contactEmail: null,
    contactPhone: null,
    website: null,
    country: PRO_DEFAULT_COUNTRY,
    state: null,
    city: null,
    postalCode: null,
    addressLine: null,
    latitude: null,
    longitude: null,
    propertyDescription: null,
    checkInInstructions: null,
    houseRules: null,
    cancellationPolicyLabel: null,
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
    otaTitle: asString(row.ota_title),
    contactEmail: asString(row.contact_email),
    contactPhone: asString(row.contact_phone),
    website: asString(row.website),
    country: asString(row.country) ?? PRO_DEFAULT_COUNTRY,
    state: asString(row.state),
    city: asString(row.city),
    postalCode: asString(row.postal_code),
    addressLine: asString(row.address_line),
    latitude: asNullableNumber(row.latitude),
    longitude: asNullableNumber(row.longitude),
    propertyDescription: asString(row.property_description),
    checkInInstructions: asString(row.check_in_instructions),
    houseRules: asString(row.house_rules),
    cancellationPolicyLabel: asString(row.cancellation_policy_label),
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
    .select("id,family_id,property_model,property_type,timezone,currency,check_in_time,check_out_time,default_meal_plan,standard_rate_plan_name,ota_title,contact_email,contact_phone,website,country,state,city,postal_code,address_line,latitude,longitude,property_description,check_in_instructions,house_rules,cancellation_policy_label,metadata,created_at,updated_at")
    .eq("family_id", normalizedFamilyId)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (error) {
    const message = String(error.message ?? "");
    if (/relation|does not exist|schema cache/i.test(message)) {
      return createDefaultHostProSettings(normalizedFamilyId);
    }
    throw error;
  }

  if (!Array.isArray(data) || data.length === 0) {
    return createDefaultHostProSettings(normalizedFamilyId);
  }

  return mapHostProSettingsRow(data[0] as Record<string, unknown>, normalizedFamilyId);
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
    otaTitle: asString(input.otaTitle),
    contactEmail: asString(input.contactEmail),
    contactPhone: asString(input.contactPhone),
    website: asString(input.website),
    country: asString(input.country) ?? PRO_DEFAULT_COUNTRY,
    state: asString(input.state),
    city: asString(input.city),
    postalCode: asString(input.postalCode),
    addressLine: asString(input.addressLine),
    latitude: asNullableNumber(input.latitude),
    longitude: asNullableNumber(input.longitude),
    propertyDescription: asString(input.propertyDescription),
    checkInInstructions: asString(input.checkInInstructions),
    houseRules: asString(input.houseRules),
    cancellationPolicyLabel: asString(input.cancellationPolicyLabel),
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
    ota_title: sanitized.otaTitle,
    contact_email: sanitized.contactEmail,
    contact_phone: sanitized.contactPhone,
    website: sanitized.website,
    country: sanitized.country,
    state: sanitized.state,
    city: sanitized.city,
    postal_code: sanitized.postalCode,
    address_line: sanitized.addressLine,
    latitude: sanitized.latitude,
    longitude: sanitized.longitude,
    property_description: sanitized.propertyDescription,
    check_in_instructions: sanitized.checkInInstructions,
    house_rules: sanitized.houseRules,
    cancellation_policy_label: sanitized.cancellationPolicyLabel,
    metadata,
    updated_at: options?.nowIso ?? new Date().toISOString(),
  };
}

export async function saveHostProSettings(
  supabase: SupabaseClient,
  familyId: string,
  payload: Record<string, unknown>
): Promise<HostProSettings> {
  const normalizedFamilyId = familyId.trim();
  if (!normalizedFamilyId) {
    throw new Error("familyId is required to save Pro settings.");
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("host_pro_settings")
    .select("id")
    .eq("family_id", normalizedFamilyId)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (existingError) throw existingError;

  const primaryRowId =
    Array.isArray(existingRows) && existingRows.length > 0
      ? asString((existingRows[0] as Record<string, unknown>).id)
      : null;

  if (primaryRowId) {
    const { error: updateError } = await supabase
      .from("host_pro_settings")
      .update(payload as never)
      .eq("id", primaryRowId);
    if (updateError) throw updateError;

    const staleRowIds = (existingRows ?? [])
      .slice(1)
      .map((row) => asString((row as Record<string, unknown>).id))
      .filter((value): value is string => Boolean(value));
    if (staleRowIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("host_pro_settings")
        .delete()
        .in("id", staleRowIds);
      if (deleteError) throw deleteError;
    }
  } else {
    const { error: insertError } = await supabase
      .from("host_pro_settings")
      .insert(payload as never);
    if (insertError) throw insertError;
  }

  return loadHostProSettings(supabase, normalizedFamilyId);
}

export function propertyModelLabel(value: string | null | undefined): string {
  return PRO_PROPERTY_MODEL_OPTIONS.find((item) => item.value === value)?.label ?? "Not set";
}

export function propertyTypeLabel(value: string | null | undefined): string {
  return PRO_PROPERTY_TYPE_OPTIONS.find((item) => item.value === value)?.label ?? "Not set";
}
