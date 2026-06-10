import type { SupabaseClient } from "@supabase/supabase-js";

import { buildListingFromFamily, parseFamilyMeta } from "@/lib/family-profile-editor";
import { resolveHostDisplayProfile } from "@/lib/host/resolve-host-display-profile";
import {
  PRO_DEFAULT_COUNTRY,
  PRO_DEFAULT_CURRENCY,
  PRO_DEFAULT_TIMEZONE,
  type HostProPropertyModel,
  type HostProPropertyType,
  type HostProSettings,
} from "@/lib/host-pro-settings";

type JsonRecord = Record<string, unknown>;

type AuthUserLike = {
  id: string;
  email: string | null;
  phone?: string | null;
} | null;

type ResolvedValue<T> = {
  value: T;
  source: string;
};

export type ResolvedChannexPropertyCreateContext = {
  selectedFamilyId: string;
  title: string | null;
  propertyModel: HostProPropertyModel | null;
  propertyType: HostProPropertyType | null;
  timezone: string | null;
  currency: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  addressLine: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  propertyDescription: string | null;
  checkInInstructions: string | null;
  houseRules: string | null;
  cancellationPolicyLabel: string | null;
  sources: Record<string, string>;
  debugSummary: {
    selectedFamilyId: string;
    loadedFamilyRow: boolean;
    loadedHostRow: boolean;
    loadedOnboardingDraft: boolean;
    loadedOnboardingPayload: boolean;
    loadedHostDisplayProfile: boolean;
    loadedProSettings: boolean;
  };
};

export async function resolveChannexPropertyCreateContext(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    settings: HostProSettings;
    familyRow: JsonRecord | null;
    hostRow: JsonRecord | null;
    authUser: AuthUserLike;
    onboardingDraftPayload?: unknown;
  }
): Promise<ResolvedChannexPropertyCreateContext> {
  const familyRow = normalizeFamilyRow(input.familyRow);
  const onboardingDraftPayload = parseLooseJsonObject(input.onboardingDraftPayload);
  const onboardingPayload = {
    ...parseLooseJsonObject(familyRow.latest_onboarding_payload),
    ...onboardingDraftPayload,
  };
  const familySeed: JsonRecord = {
    ...familyRow,
    latest_onboarding_payload: onboardingPayload,
    host_display_name: firstString(input.hostRow?.display_name, familyRow.host_display_name),
    locality: firstString(input.hostRow?.locality, familyRow.locality),
  };
  const meta = parseFamilyMeta(familyRow.admin_notes);
  const listing = buildListingFromFamily(familySeed, meta);
  const display = await resolveHostDisplayProfile(supabase, {
    hostUserId: firstString(input.authUser?.id, input.hostRow?.user_id, familyRow.user_id),
    familyId: input.familyId,
    hostRow: input.hostRow,
    familyRow: familySeed,
    authUser: input.authUser,
    onboardingPayload,
  });

  const providerOverrides = extractProviderOverrides(input.settings.metadata);

  const title = pickString(
    ["provider_settings.ota_title", providerOverrides.ota_title],
    ["provider_settings.otaTitle", providerOverrides.otaTitle],
    ["provider_settings.title", providerOverrides.title],
    ["host_pro_settings.otaTitle", input.settings.exists ? input.settings.otaTitle : null],
    ["listing.listingTitle", listing.listingTitle],
    ["listing.propertyName", listing.propertyName],
    ["display.propertyName", nonPlaceholder(display.propertyName, "Property")],
    ["family.property_name", familySeed.property_name],
    ["family.name", familySeed.name],
    ["latest_onboarding_payload.propertyName", onboardingPayload.propertyName],
    ["latest_onboarding_payload.homeName", onboardingPayload.homeName],
    ["latest_onboarding_payload.listingTitle", onboardingPayload.listingTitle],
    ["meta.listingTitle", meta.listingTitle],
  );

  const propertyType = pickPropertyType(
    ["provider_settings.property_type", providerOverrides.property_type],
    ["provider_settings.propertyType", providerOverrides.propertyType],
    ["host_pro_settings.propertyType", input.settings.exists ? input.settings.propertyType : null],
    ["latest_onboarding_payload.propertyType", onboardingPayload.propertyType],
    ["latest_onboarding_payload.property_type", onboardingPayload.property_type],
    ["latest_onboarding_payload.homeType", onboardingPayload.homeType],
    ["latest_onboarding_payload.houseType", onboardingPayload.houseType],
    ["meta.houseType", meta.houseType],
  );

  const propertyModel = pickPropertyModel(
    ["provider_settings.property_model", providerOverrides.property_model],
    ["provider_settings.propertyModel", providerOverrides.propertyModel],
    ["host_pro_settings.propertyModel", input.settings.exists ? input.settings.propertyModel : null],
    ["latest_onboarding_payload.propertyModel", onboardingPayload.propertyModel],
    ["latest_onboarding_payload.property_model", onboardingPayload.property_model],
    ["derived.from_property_type", propertyType?.value],
    ["fallback.default_vacation_rental", "vacation_rental"],
  );

  const timezone = pickString(
    ["provider_settings.timezone", providerOverrides.timezone],
    ["host_pro_settings.timezone", input.settings.exists ? input.settings.timezone : null],
    ["latest_onboarding_payload.timezone", onboardingPayload.timezone],
    ["fallback.default_timezone", PRO_DEFAULT_TIMEZONE],
  );

  const currency = pickUpperToken(
    ["provider_settings.currency", providerOverrides.currency],
    ["host_pro_settings.currency", input.settings.exists ? input.settings.currency : null],
    ["latest_onboarding_payload.currency", onboardingPayload.currency],
    ["fallback.default_currency", PRO_DEFAULT_CURRENCY],
  );

  const country = pickString(
    ["provider_settings.country", providerOverrides.country],
    ["host_pro_settings.country", input.settings.exists ? input.settings.country : null],
    ["latest_onboarding_payload.country", onboardingPayload.country],
    ["latest_onboarding_payload.countryCode", onboardingPayload.countryCode],
    ["fallback.default_country", PRO_DEFAULT_COUNTRY],
  );

  const state = pickString(
    ["provider_settings.state", providerOverrides.state],
    ["host_pro_settings.state", input.settings.exists ? input.settings.state : null],
    ["display.state", nonPlaceholder(display.state, "Not added")],
    ["listing.meta_state", firstString(onboardingPayload.state, familySeed.state)],
  );

  const city = pickString(
    ["provider_settings.city", providerOverrides.city],
    ["host_pro_settings.city", input.settings.exists ? input.settings.city : null],
    ["display.city", nonPlaceholder(display.city, "Not added")],
    ["family.city", familySeed.city],
    ["latest_onboarding_payload.city", onboardingPayload.city],
    ["family.locality", familySeed.locality],
    ["family.village", familySeed.village],
    ["meta.neighbourhood", meta.neighbourhood],
    ["meta.neighborhoodDesc", meta.neighborhoodDesc],
  );

  const addressLine = pickString(
    ["provider_settings.address_line", providerOverrides.address_line],
    ["provider_settings.addressLine", providerOverrides.addressLine],
    ["host_pro_settings.addressLine", input.settings.exists ? input.settings.addressLine : null],
    ["display.propertyAddress", nonPlaceholder(display.propertyAddress, "Not added")],
    ["listing.propertyAddress", listing.propertyAddress],
    ["meta.propertyAddress", meta.propertyAddress],
    ["family.street_address", familySeed.street_address],
    ["latest_onboarding_payload.propertyAddress", onboardingPayload.propertyAddress],
    ["latest_onboarding_payload.address", onboardingPayload.address],
    ["family.locality_fallback", joinParts(familySeed.street_address, familySeed.locality, familySeed.village)],
  );

  const postalCode = pickString(
    ["provider_settings.postal_code", providerOverrides.postal_code],
    ["provider_settings.postalCode", providerOverrides.postalCode],
    ["host_pro_settings.postalCode", input.settings.exists ? input.settings.postalCode : null],
    ["latest_onboarding_payload.pincode", onboardingPayload.pincode],
    ["meta.pincode", meta.pincode],
  );

  const latitude = pickNumber(
    ["provider_settings.latitude", providerOverrides.latitude],
    ["host_pro_settings.latitude", input.settings.exists ? input.settings.latitude : null],
    ["family.lat", familySeed.lat],
    ["latest_onboarding_payload.latitude", onboardingPayload.latitude],
  );

  const longitude = pickNumber(
    ["provider_settings.longitude", providerOverrides.longitude],
    ["host_pro_settings.longitude", input.settings.exists ? input.settings.longitude : null],
    ["family.lng", familySeed.lng],
    ["latest_onboarding_payload.longitude", onboardingPayload.longitude],
  );

  const checkInTime = pickString(
    ["provider_settings.check_in_time", providerOverrides.check_in_time],
    ["provider_settings.checkInTime", providerOverrides.checkInTime],
    ["host_pro_settings.checkInTime", input.settings.exists ? input.settings.checkInTime : null],
    ["listing.checkInTime", listing.checkInTime],
    ["family.check_in_time", familySeed.check_in_time],
    ["latest_onboarding_payload.checkInTime", onboardingPayload.checkInTime],
    ["meta.checkInTime", meta.checkInTime],
  );

  const checkOutTime = pickString(
    ["provider_settings.check_out_time", providerOverrides.check_out_time],
    ["provider_settings.checkOutTime", providerOverrides.checkOutTime],
    ["host_pro_settings.checkOutTime", input.settings.exists ? input.settings.checkOutTime : null],
    ["listing.checkOutTime", listing.checkOutTime],
    ["family.check_out_time", familySeed.check_out_time],
    ["latest_onboarding_payload.checkOutTime", onboardingPayload.checkOutTime],
    ["meta.checkOutTime", meta.checkOutTime],
  );

  const contactEmail = pickString(
    ["provider_settings.contact_email", providerOverrides.contact_email],
    ["provider_settings.contactEmail", providerOverrides.contactEmail],
    ["host_pro_settings.contactEmail", input.settings.exists ? input.settings.contactEmail : null],
    ["display.hostEmail", nonPlaceholder(display.hostEmail, "Not added")],
    ["auth_user.email", input.authUser?.email],
    ["family.email", familySeed.email],
    ["family.host_email", familySeed.host_email],
    ["latest_onboarding_payload.email", onboardingPayload.email],
    ["latest_onboarding_payload.hostEmail", onboardingPayload.hostEmail],
  );

  const contactPhone = pickString(
    ["provider_settings.contact_phone", providerOverrides.contact_phone],
    ["provider_settings.contactPhone", providerOverrides.contactPhone],
    ["host_pro_settings.contactPhone", input.settings.exists ? input.settings.contactPhone : null],
    ["display.hostPhone", nonPlaceholder(display.hostPhone, "Not added")],
    ["auth_user.phone", input.authUser?.phone],
    ["family.host_phone", familySeed.host_phone],
    ["family.phone", familySeed.phone],
    ["latest_onboarding_payload.phone", onboardingPayload.phone],
    ["latest_onboarding_payload.phoneNumber", onboardingPayload.phoneNumber],
    ["latest_onboarding_payload.hostPhone", onboardingPayload.hostPhone],
  );

  const website = pickString(
    ["provider_settings.website", providerOverrides.website],
    ["host_pro_settings.website", input.settings.exists ? input.settings.website : null],
    ["latest_onboarding_payload.website", onboardingPayload.website],
  );

  const propertyDescription = pickString(
    ["provider_settings.property_description", providerOverrides.property_description],
    ["provider_settings.propertyDescription", providerOverrides.propertyDescription],
    ["host_pro_settings.propertyDescription", input.settings.exists ? input.settings.propertyDescription : null],
    ["family.about", familySeed.about],
    ["family.description", familySeed.description],
    ["latest_onboarding_payload.hostBio", onboardingPayload.hostBio],
  );

  const checkInInstructions = pickString(
    ["provider_settings.check_in_instructions", providerOverrides.check_in_instructions],
    ["provider_settings.checkInInstructions", providerOverrides.checkInInstructions],
    ["host_pro_settings.checkInInstructions", input.settings.exists ? input.settings.checkInInstructions : null],
    ["latest_onboarding_payload.checkInInstructions", onboardingPayload.checkInInstructions],
  );

  const houseRules = pickString(
    ["provider_settings.house_rules", providerOverrides.house_rules],
    ["provider_settings.houseRules", providerOverrides.houseRules],
    ["host_pro_settings.houseRules", input.settings.exists ? input.settings.houseRules : null],
    ["listing.houseRules", listing.houseRules],
    ["family.house_rules", listToString(familySeed.house_rules)],
    ["latest_onboarding_payload.houseRules", listToString(onboardingPayload.houseRules)],
  );

  const cancellationPolicyLabel = pickString(
    ["provider_settings.cancellation_policy_label", providerOverrides.cancellation_policy_label],
    ["provider_settings.cancellationPolicyLabel", providerOverrides.cancellationPolicyLabel],
    ["host_pro_settings.cancellationPolicyLabel", input.settings.exists ? input.settings.cancellationPolicyLabel : null],
    ["latest_onboarding_payload.cancellationPolicyLabel", onboardingPayload.cancellationPolicyLabel],
  );

  return {
    selectedFamilyId: input.familyId,
    title: title?.value ?? null,
    propertyModel: propertyModel?.value ?? null,
    propertyType: propertyType?.value ?? null,
    timezone: timezone?.value ?? null,
    currency: currency?.value ?? null,
    country: country?.value ?? null,
    state: state?.value ?? null,
    city: city?.value ?? null,
    addressLine: addressLine?.value ?? null,
    postalCode: postalCode?.value ?? null,
    latitude: latitude?.value ?? null,
    longitude: longitude?.value ?? null,
    checkInTime: checkInTime?.value ?? null,
    checkOutTime: checkOutTime?.value ?? null,
    contactEmail: contactEmail?.value ?? null,
    contactPhone: contactPhone?.value ?? null,
    website: website?.value ?? null,
    propertyDescription: propertyDescription?.value ?? null,
    checkInInstructions: checkInInstructions?.value ?? null,
    houseRules: houseRules?.value ?? null,
    cancellationPolicyLabel: cancellationPolicyLabel?.value ?? null,
    sources: {
      title: title?.source ?? "missing",
      propertyModel: propertyModel?.source ?? "missing",
      propertyType: propertyType?.source ?? "missing",
      timezone: timezone?.source ?? "missing",
      currency: currency?.source ?? "missing",
      country: country?.source ?? "missing",
      state: state?.source ?? "missing",
      city: city?.source ?? "missing",
      addressLine: addressLine?.source ?? "missing",
      postalCode: postalCode?.source ?? "missing",
      latitude: latitude?.source ?? "missing",
      longitude: longitude?.source ?? "missing",
      checkInTime: checkInTime?.source ?? "missing",
      checkOutTime: checkOutTime?.source ?? "missing",
      contactEmail: contactEmail?.source ?? "missing",
      contactPhone: contactPhone?.source ?? "missing",
      website: website?.source ?? "missing",
      propertyDescription: propertyDescription?.source ?? "missing",
      checkInInstructions: checkInInstructions?.source ?? "missing",
      houseRules: houseRules?.source ?? "missing",
      cancellationPolicyLabel: cancellationPolicyLabel?.source ?? "missing",
    },
    debugSummary: {
      selectedFamilyId: input.familyId,
      loadedFamilyRow: Boolean(input.familyRow),
      loadedHostRow: Boolean(input.hostRow),
      loadedOnboardingDraft: Object.keys(onboardingDraftPayload).length > 0,
      loadedOnboardingPayload: Object.keys(onboardingPayload).length > 0,
      loadedHostDisplayProfile: Boolean(display),
      loadedProSettings: input.settings.exists,
    },
  };
}

function normalizeFamilyRow(value: JsonRecord | null): JsonRecord {
  const row = value ? { ...value } : {};
  row.latest_onboarding_payload = parseLooseJsonObject(row.latest_onboarding_payload);
  return row;
}

function extractProviderOverrides(metadata: unknown): JsonRecord {
  const root = asObject(metadata);
  return {
    ...asObject(root.provider_settings),
    ...asObject(root.ota),
    ...asObject(root.channex),
    ...asObject(asObject(root.channex).property_create),
    ...asObject(asObject(root.provider_settings).channex),
  };
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function parseLooseJsonObject(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonRecord) : {};
    } catch {
      return {};
    }
  }
  return {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

function nonPlaceholder(value: string | null, placeholder: string): string | null {
  const normalized = firstString(value);
  if (!normalized || normalized === placeholder) return null;
  return normalized;
}

function listToString(value: unknown): string | null {
  if (Array.isArray(value)) {
    const joined = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .join(", ");
    return joined || null;
  }
  return firstString(value);
}

function joinParts(...values: unknown[]): string | null {
  const parts = values
    .map((value) => firstString(value))
    .filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(", ") : null;
}

function pickString(...pairs: Array<[string, unknown]>): ResolvedValue<string> | null {
  for (const [source, value] of pairs) {
    const normalized = firstString(value);
    if (normalized) return { value: normalized, source };
  }
  return null;
}

function pickUpperToken(...pairs: Array<[string, unknown]>): ResolvedValue<string> | null {
  for (const [source, value] of pairs) {
    const normalized = firstString(value);
    if (normalized) return { value: normalized.toUpperCase(), source };
  }
  return null;
}

function pickNumber(...pairs: Array<[string, unknown]>): ResolvedValue<number> | null {
  for (const [source, value] of pairs) {
    const normalized = asNumber(value);
    if (normalized != null) return { value: normalized, source };
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickPropertyModel(...pairs: Array<[string, unknown]>): ResolvedValue<HostProPropertyModel> | null {
  for (const [source, value] of pairs) {
    const normalized = normalizePropertyModel(value);
    if (normalized) return { value: normalized, source };
  }
  return null;
}

function pickPropertyType(...pairs: Array<[string, unknown]>): ResolvedValue<HostProPropertyType> | null {
  for (const [source, value] of pairs) {
    const normalized = normalizePropertyType(value);
    if (normalized) return { value: normalized, source };
  }
  return null;
}

function normalizePropertyModel(value: unknown): HostProPropertyModel | null {
  const normalized = firstString(value)?.toLowerCase();
  if (!normalized) return null;
  if (normalized === "hotel") return "hotel";
  if (normalized === "vacation_rental" || normalized === "vacation rental") return "vacation_rental";
  if (normalized.includes("hotel") || normalized.includes("bnb") || normalized.includes("resort") || normalized.includes("inn")) {
    return "hotel";
  }
  if (
    normalized.includes("home") ||
    normalized.includes("stay") ||
    normalized.includes("villa") ||
    normalized.includes("apartment") ||
    normalized.includes("rental") ||
    normalized.includes("guest house")
  ) {
    return "vacation_rental";
  }
  return null;
}

function normalizePropertyType(value: unknown): HostProPropertyType | null {
  const normalized = firstString(value)?.toLowerCase();
  if (!normalized) return null;
  if (normalized === "homestay" || normalized === "home_stay" || normalized === "home stay") return "homestay";
  if (normalized === "guest_house" || normalized === "guest house" || normalized === "guesthouse") return "guest_house";
  if (normalized === "farm_stay" || normalized === "farm stay" || normalized === "farmstay") return "farm_stay";
  if (normalized === "villa") return "villa";
  if (normalized === "apartment" || normalized === "flat") return "apartment";
  if (normalized === "hotel_bnb" || normalized === "hotel/b&b" || normalized === "hotel b&b" || normalized === "bnb" || normalized === "hotel") {
    return "hotel_bnb";
  }
  if (normalized.includes("home") || normalized.includes("stay")) return "homestay";
  if (normalized.includes("guest")) return "guest_house";
  if (normalized.includes("farm")) return "farm_stay";
  if (normalized.includes("villa")) return "villa";
  if (normalized.includes("apartment")) return "apartment";
  if (normalized.includes("hotel") || normalized.includes("bnb") || normalized.includes("inn")) return "hotel_bnb";
  return null;
}
