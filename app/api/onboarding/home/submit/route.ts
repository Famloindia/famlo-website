import { NextResponse } from "next/server";

import { maskCoordinates } from "@/lib/location-utils";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  const next = asString(value);
  return next.length > 0 ? next : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}

function pickObject(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return {};
}

function getValue(source: JsonRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }
  return undefined;
}

function buildLegacyRoomDraft(row: JsonRecord, payload: JsonRecord): JsonRecord | null {
  const hasSignals =
    asNullableString(getValue(payload, ["roomType", "room_type", "unitType", "unit_type"])) != null ||
    asNumber(getValue(payload, ["maxGuests", "max_guests"])) != null ||
    asNumber(getValue(payload, ["priceFullday", "price_fullday", "fullDayRate", "baseNightlyRate"])) != null ||
    asNumber(getValue(payload, ["morningRate", "priceMorning", "price_morning"])) != null ||
    asNumber(getValue(payload, ["eveningRate", "priceEvening", "price_evening"])) != null ||
    asStringArray(getValue(payload, ["photo_urls", "photos"])) .length > 0 ||
    asStringArray(getValue(payload, ["roomPhotos", "room_photos"])) .length > 0 ||
    asNullableString(getValue(payload, ["bathroomType", "bathroom_type"])) != null ||
    asNullableString(getValue(payload, ["bedConfiguration", "bed_configuration", "bedInfo", "bed_info"])) != null;

  if (!hasSignals) {
    return null;
  }

  const standardPrice = asNumber(getValue(payload, ["priceFullday", "price_fullday", "fullDayRate", "baseNightlyRate"])) ?? null;
  const lowDemandPrice = asNumber(getValue(payload, ["morningRate", "priceMorning", "price_morning"])) ?? null;
  const highDemandPrice = asNumber(getValue(payload, ["eveningRate", "priceEvening", "price_evening"])) ?? null;
  return {
    id: asString(getValue(payload, ["roomId", "room_id", "id"])) || "primary",
    roomName:
      asString(getValue(payload, ["roomName", "room_name", "propertyName", "property_name", "listingTitle", "name"])) ||
      asString(getValue(row, ["property_name", "primary_host_name"])) ||
      "Primary room",
    roomType: asString(getValue(payload, ["roomType", "room_type", "unitType", "unit_type"])) || "Private room",
    maxGuests: asNumber(getValue(payload, ["maxGuests", "max_guests"])) ?? 1,
    bedConfiguration: asString(getValue(payload, ["bedConfiguration", "bed_configuration", "bedInfo", "bed_info"])),
    roomConfiguration: asString(getValue(payload, ["roomConfiguration", "room_configuration"])),
    balcony: asString(getValue(payload, ["balcony"])),
    roomVibe: asString(getValue(payload, ["roomVibe", "room_vibe"])),
    roomAmenities: asStringArray(getValue(payload, ["roomAmenities", "room_amenities", "amenities"])),
    roomPhotos: asStringArray(getValue(payload, ["roomPhotos", "room_photos", "photo_urls", "photos"])),
    lat: asNumber(getValue(payload, ["lat", "latitude"])),
    lng: asNumber(getValue(payload, ["lng", "longitude"])),
    standardPrice: standardPrice,
    lowDemandPrice: lowDemandPrice,
    highDemandPrice: highDemandPrice,
    smartPricingEnabled:
      Boolean(getValue(payload, ["smartPricingEnabled", "smart_pricing_enabled"])) ||
      Boolean(lowDemandPrice != null || highDemandPrice != null),
  };
}

function generateTemporaryPassword(length = 14): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from({ length }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join("");
}

function generateProfileCode(prefix: "FAM"): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${suffix}`;
}

type DraftInput = {
  full_name: string;
  email: string;
  phone: string;
  whatsapp_number: string;
  street_address: string;
  city: string;
  state: string;
  country: string;
  family_composition: string;
  host_bio: string;
  languages: string[];
  cultural_offerings: string[];
  famlo_experience: string;
  photo_urls: string[];
  host_photo_url: string | null;
  property_name: string;
  locality?: string;
  phone_verified: boolean;
  upi_id: string;
  password?: string;
  included_items: string[];
  house_rules: string[];
  amenities: string[];
  room_type?: string;
  price_morning?: number | null;
  price_afternoon?: number | null;
  price_evening?: number | null;
  price_fullday?: number | null;
  
  // Bank Details
  bank_account_holder_name?: string;
  bank_account_number?: string;
  ifsc_code?: string;
  bank_name?: string;

  bathroom_type?: string;
  common_areas?: string[];
  
  pricing_present?: boolean;
  max_guests?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
  google_maps_link?: string | null;
  rooms?: Array<Record<string, unknown>>;
};

function normalizeDraftRow(row: JsonRecord): DraftInput {
  const payload = pickObject(row.payload);
  const compliance = pickObject(row.compliance);
  const pricing = pickObject(payload.pricing);
  const photoUrlsRaw = row.images ?? row.photo_urls ?? [];
  const photo_urls = Array.isArray(photoUrlsRaw) ? photoUrlsRaw : [];
  const rooms = Array.isArray(payload.rooms)
    ? payload.rooms.filter((room): room is Record<string, unknown> => Boolean(room && typeof room === "object" && !Array.isArray(room)))
    : Array.isArray(row.rooms)
      ? row.rooms.filter((room): room is Record<string, unknown> => Boolean(room && typeof room === "object" && !Array.isArray(room)))
      : (() => {
          const legacyRoom = buildLegacyRoomDraft(row, payload);
          return legacyRoom ? [legacyRoom] : [];
        })();
  const baseNightlyRate =
    asNumber(getValue(payload, ["priceFullday", "fullDayRate", "baseNightlyRate"])) ??
    asNumber(pricing.baseRate);

  return {
    full_name: asString(row.primary_host_name) || asString(getValue(payload, ["fullName"])),
    email: asString(row.email) || asString(getValue(payload, ["email"])),
    phone: asString(row.mobile_number) || asString(getValue(payload, ["mobileNumber"])),
    whatsapp_number: asString(row.mobile_number) || asString(getValue(payload, ["mobileNumber"])),
    street_address: asString(row.street_address) || asString(getValue(payload, ["streetAddress", "propertyAddress"])),
    city: asString(getValue(row, ["city_name", "city"])) || asString(getValue(payload, ["city", "cityName"])) || asString(getValue(row, ["city_neighbourhood"])) || asString(getValue(payload, ["cityNeighbourhood", "areaName"])),
    state: asString(row.state) || asString(getValue(payload, ["state"])),
    country: asString(row.country) || asString(getValue(payload, ["country"])),
    family_composition: asString(row.family_composition) || asString(getValue(payload, ["familyComposition"])),
    host_bio: asString(row.host_bio) || asString(getValue(payload, ["hostBio"])),
    languages:
      Array.isArray(row.languages_spoken)
        ? row.languages_spoken
        : asStringArray(getValue(payload, ["languagesSpoken", "languages"])),
    cultural_offerings: Array.isArray(row.amenities) ? row.amenities : asStringArray(getValue(payload, ["amenities"])),
    famlo_experience: asString(row.famlo_experience) || asString(getValue(payload, ["culturalActivity", "famloExperience"])),
    photo_urls,
    host_photo_url: asNullableString(row.host_photo_url) ?? asNullableString(getValue(payload, ["hostPhoto"])),
    property_name: asString(getValue(payload, ["propertyName"])) || `${asString(row.primary_host_name) || "Famlo"}'s Home`,
    locality:
      asString(getValue(payload, ["cityNeighbourhood", "areaName", "villageName"])) ||
      asString(getValue(row, ["city_neighbourhood"])),
    phone_verified: true, // If they reached submit, they are verified
    upi_id: asString(row.upi_id) || asString(getValue(payload, ["upiId"])) || asString(getValue(compliance, ["upiId"])),
    password: asString(row.password),
    included_items: asStringArray(getValue(payload, ["includedItems"])),
    house_rules: asStringArray(getValue(payload, ["customRules"])),
    amenities: Array.isArray(row.amenities) ? row.amenities : asStringArray(getValue(payload, ["amenities"])),
    room_type: asNullableString(getValue(payload, ["roomType"])) ?? undefined,
    price_morning:
      asNumber(getValue(payload, ["morningRate"])) ??
      (pricing.morning === true ? baseNightlyRate : null),
    price_afternoon:
      asNumber(getValue(payload, ["afternoonRate"])) ??
      (pricing.afternoon === true ? baseNightlyRate : null),
    price_evening:
      asNumber(getValue(payload, ["eveningRate"])) ??
      (pricing.evening === true ? baseNightlyRate : null),
    price_fullday:
      asNumber(getValue(payload, ["priceFullday", "fullDayRate"])) ??
      baseNightlyRate,
    
    // Bank Details
    bank_account_holder_name:
      asString(row.bank_account_holder_name) ||
      asString(getValue(payload, ["accountHolderName"])) ||
      asString(getValue(compliance, ["accountHolderName"])),
    bank_account_number:
      asString(row.bank_account_number) ||
      asString(getValue(payload, ["accountNumber"])) ||
      asString(getValue(compliance, ["accountNumber"])),
    ifsc_code:
      asString(row.ifsc_code) ||
      asString(getValue(payload, ["ifscCode"])) ||
      asString(getValue(compliance, ["ifscCode"])),
    bank_name:
      asString(row.bank_name) ||
      asString(getValue(payload, ["bankName"])) ||
      asString(getValue(compliance, ["bankName"])),
    
    bathroom_type: asString(row.bathroom_type) || asString(getValue(payload, ["bathroomType"])),
    common_areas: Array.isArray(row.common_areas) ? row.common_areas : asStringArray(getValue(payload, ["commonAreas"])),
    latitude: asNumber(row.lat_exact) ?? asNumber(row.latitude) ?? asNumber(getValue(payload, ["latitude"])),
    longitude: asNumber(row.lng_exact) ?? asNumber(row.longitude) ?? asNumber(getValue(payload, ["longitude"])),
    lat: asNumber(row.lat),
    lng: asNumber(row.lng),
    google_maps_link:
      asNullableString(row.google_maps_link) ?? asNullableString(getValue(payload, ["googleMapsLink"])),
    rooms,
  };
}

type PublishCheck = {
  canPublish: boolean;
  missing: string[];
};

function getPublishCheck(input: DraftInput): PublishCheck {
  const missing: string[] = [];
  const hasAnyPricing = [input.price_morning, input.price_afternoon, input.price_evening, input.price_fullday]
    .some((value) => typeof value === "number" && Number.isFinite(value) && value > 0);

  if (!input.full_name) missing.push("full_name");
  if (!input.email) missing.push("email");
  if (!input.phone) missing.push("phone");
  if (!input.host_bio) missing.push("host_bio");
  if (!input.city) missing.push("city");
  if (!input.state) missing.push("state");
  if (input.photo_urls.length < 5) missing.push("at least 5 photos");
  if (!input.rooms || input.rooms.length === 0) missing.push("rooms");
  // Password is now mandatory as we generate it in step 1
  if (!input.password) missing.push("password");
  if (!input.street_address) missing.push("home_address");
  if (!hasAnyPricing) missing.push("pricing");

  return {
    canPublish: missing.length === 0,
    missing,
  };
}

async function findExistingPublicUserByEmail(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  email: string
): Promise<JsonRecord | null> {
  const { data, error } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
  if (error) throw error;
  return (data as JsonRecord | null) ?? null;
}

async function findExistingAuthUserIdByEmail(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  email: string
): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function ensurePublicUser(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  payload: JsonRecord
): Promise<void> {
  const { error } = await supabase.from("users").upsert(payload as never);
  if (error) throw error;
}

async function ensureFamilyProfile(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  application: DraftInput,
  userId: string,
  password: string | null
): Promise<{ profileId: string | null; profileCode: string | null }> {
  const { data: existing, error: existingError } = await supabase
    .from("families")
    .select("id,host_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) throw existingError;

  const profileCode =
    existing && typeof existing.host_id === "string" ? existing.host_id : generateProfileCode("FAM");
  const exactLat = application.latitude ?? application.lat ?? null;
  const exactLng = application.longitude ?? application.lng ?? null;
  const publicCoords =
    exactLat != null && exactLng != null
      ? maskCoordinates(exactLat, exactLng, String(existing?.id ?? userId ?? profileCode))
      : null;

  const payload: any = {
    user_id: userId,
    host_id: profileCode,
    name: application.full_name,
    email: application.email,
    street_address: application.street_address,
    city: application.city,
    state: application.state,
    village: application.locality ?? null,
    country: application.country,
    family_composition: application.family_composition,
    about: application.host_bio,
    description: application.host_bio,
    languages_spoken: application.languages,
    languages: application.languages,
    famlo_experience: application.famlo_experience,
    images: application.photo_urls,
    bathroom_type: application.bathroom_type,
    common_areas: application.common_areas,
    amenities: application.cultural_offerings,
    
    // Bank details
    bank_account_holder_name: application.bank_account_holder_name,
    bank_account_number: application.bank_account_number,
    ifsc_code: application.ifsc_code,
    bank_name: application.bank_name,
    upi_id: application.upi_id,

    // Auth & Status
    password: password,
    host_password: password,
    host_phone: application.phone,
    lat: publicCoords?.lat ?? null,
    lng: publicCoords?.lng ?? null,
    lat_exact: exactLat,
    lng_exact: exactLng,
    google_maps_link: application.google_maps_link ?? null,
    is_verified: true,
    is_active: true,
    is_accepting: true,
    family_type: "cultural"
  };

  if (existing && typeof existing.id === "string") {
    const { error } = await supabase.from("families").update(payload as never).eq("id", existing.id);
    if (error) throw error;

    return {
      profileId: existing.id,
      profileCode,
    };
  }

  const { data, error } = await supabase
    .from("families")
    .insert(payload as never)
    .select("id,host_id")
    .single();

  if (error) throw error;

  return {
    profileId: typeof data.id === "string" ? data.id : null,
    profileCode: typeof data.host_id === "string" ? data.host_id : null,
  };
}

async function upsertFamilyApplication(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  draftId: string,
  input: DraftInput,
  publishCheck: PublishCheck
): Promise<JsonRecord> {
  const { data: existing, error: existingError } = await supabase
    .from("family_applications")
    .select("*")
    .eq("onboarding_draft_id", draftId)
    .maybeSingle();

  if (existingError) throw existingError;

  const status = "pending";

  const buildPayload = () => ({
    onboarding_draft_id: draftId,
    full_name: input.full_name,
    email: input.email,
    phone: input.phone,
    whatsapp_number: input.phone || null,
    property_name: input.property_name,
    property_address: input.street_address || "",
    village: input.locality || input.city || null,
    state: input.state || null,
    house_type: input.family_composition || null,
    about_family: input.host_bio || null,
    max_guests: input.max_guests ?? 4,
    upi_id: input.upi_id || null,
    cultural_offerings: input.cultural_offerings,
    languages: input.languages,
    photo_url: input.host_photo_url || null,
    rooms: Array.isArray(input.rooms) ? input.rooms : [],
    payload: {
      fullName: input.full_name,
      email: input.email,
      mobileNumber: input.phone,
      city: input.city,
      state: input.state,
      country: input.country,
      streetAddress: input.street_address,
      propertyAddress: input.street_address,
      familyComposition: input.family_composition,
      hostBio: input.host_bio,
      languages: input.languages,
      famloExperience: input.famlo_experience,
      photos: input.photo_urls,
      hostPhoto: input.host_photo_url || null,
      propertyName: input.property_name,
      locality: input.locality ?? null,
      upiId: input.upi_id || null,
      includedItems: input.included_items,
      houseRules: input.house_rules,
      amenities: input.amenities,
      roomType: input.room_type ?? null,
      priceMorning: input.price_morning ?? null,
      priceAfternoon: input.price_afternoon ?? null,
      priceEvening: input.price_evening ?? null,
      priceFullday: input.price_fullday ?? null,
      maxGuests: input.max_guests ?? 4,
      googleMapsLink: input.google_maps_link ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      bathroomType: input.bathroom_type ?? null,
      commonAreas: input.common_areas ?? [],
      rooms: Array.isArray(input.rooms) ? input.rooms : [],
    },
    status,
  });

  const writeApplication = async (payload: Record<string, unknown>) => {
    if (existing && typeof existing.id === "string") {
      return supabase
        .from("family_applications")
        .update(payload as never)
        .eq("id", existing.id)
        .select("*")
        .single();
    }

    return supabase
      .from("family_applications")
      .insert(payload as never)
      .select("*")
      .single();
  };

  const firstAttempt = await writeApplication(buildPayload());
  if (!firstAttempt.error) {
    return (firstAttempt.data as JsonRecord) ?? {};
  }

  const firstError = firstAttempt.error as { code?: string; message?: string };
  if (firstError.code === "42703" || firstError.code === "PGRST204") {
    const fallbackAttempt = await writeApplication(buildPayload());
    if (fallbackAttempt.error) throw fallbackAttempt.error;
    return (fallbackAttempt.data as JsonRecord) ?? {};
  }

  throw firstAttempt.error;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { draftId?: string };
    const draftId = String(body.draftId ?? "").trim();

    if (!draftId) {
      return NextResponse.json({ error: "Draft ID is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    const { data: draft, error: draftError } = await supabase
      .from("host_onboarding_drafts")
      .select("*")
      .eq("id", draftId)
      .single();

    if (draftError || !draft) {
      return NextResponse.json(
        { error: draftError?.message ?? "Unable to load Home onboarding draft." },
        { status: 404 }
      );
    }

    const normalized = normalizeDraftRow((draft as JsonRecord) ?? {});
    const publishCheck = getPublishCheck(normalized);

    const application = await upsertFamilyApplication(supabase, draftId, normalized, publishCheck);

    const nextMode = publishCheck.missing.length > 0 ? "missing_details" : "review_required";
    const nextReviewNote =
      publishCheck.missing.length > 0
        ? `Pending review. Missing: ${publishCheck.missing.join(", ")}`
        : "Submitted to Famlo review queue.";

    const { error: pendingDraftUpdateError } = await supabase
      .from("host_onboarding_drafts")
      .update({
        listing_status: "submitted",
        review_notes: nextReviewNote,
        family_application_id: application.id ?? null,
      } as never)
      .eq("id", draftId);

    if (pendingDraftUpdateError) {
      throw pendingDraftUpdateError;
    }

    return NextResponse.json({
      ok: true,
      draftId,
      mode: nextMode,
      applicationId: application.id ?? null,
      userId: null,
      familyId: null,
      missingFields: publishCheck.missing,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to submit Home onboarding.",
      },
      { status: 500 }
    );
  }
}
