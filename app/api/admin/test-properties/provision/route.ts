import { NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { logAuditAction } from "@/lib/audit";
import {
  buildHostProSettingsUpsert,
  PRO_DEFAULT_MEAL_PLAN,
  PRO_DEFAULT_RATE_PLAN_NAME,
} from "@/lib/host-pro-settings";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;
type ActivationDuration = "1_month" | "3_months" | "1_year" | "custom";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  const normalized = asString(value);
  return normalized.length > 0 ? normalized : null;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function extractMissingColumnFromSchemaError(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
}

async function insertSingleRowWithSchemaFallback(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  table: string,
  payload: JsonRecord,
  selectClause: string
): Promise<JsonRecord> {
  const workingPayload: JsonRecord = { ...payload };

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { data, error } = await supabase
      .from(table)
      .insert(workingPayload as never)
      .select(selectClause)
      .single();

    if (!error && data) {
      return data as JsonRecord;
    }

    const missingColumn = extractMissingColumnFromSchemaError(error);
    if (!missingColumn || !(missingColumn in workingPayload)) {
      throw error;
    }

    delete workingPayload[missingColumn];
  }

  throw new Error(`Schema fallback exhausted for ${table}.`);
}

async function updateSingleRowWithSchemaFallback(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  table: string,
  payload: JsonRecord,
  keyColumn: string,
  keyValue: string
): Promise<void> {
  const workingPayload: JsonRecord = { ...payload };

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { error } = await supabase.from(table).update(workingPayload as never).eq(keyColumn, keyValue);

    if (!error) {
      return;
    }

    const missingColumn = extractMissingColumnFromSchemaError(error);
    if (!missingColumn || !(missingColumn in workingPayload)) {
      throw error;
    }

    delete workingPayload[missingColumn];
  }

  throw new Error(`Schema fallback exhausted for ${table}.`);
}

async function generateUniqueFamilyCode(
  supabase: ReturnType<typeof createAdminSupabaseClient>
): Promise<string> {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const candidate = `FAM-${suffix}`;
    const { data, error } = await supabase
      .from("families")
      .select("id")
      .eq("host_id", candidate)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return candidate;
  }

  throw new Error("Unable to generate a unique partner code.");
}

function makeUnitKey(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `room-${slug || "unit"}-${Date.now().toString(36)}`;
}

function addUtcDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function addUtcMonths(date: Date, months: number): Date {
  const copy = new Date(date);
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
}

function resolveEndDate(duration: ActivationDuration, customEndDate: string | null, now: Date): Date | null {
  if (duration === "1_month") return addUtcMonths(now, 1);
  if (duration === "3_months") return addUtcMonths(now, 3);
  if (duration === "1_year") return addUtcMonths(now, 12);

  if (duration === "custom" && customEndDate) {
    const parsed = new Date(`${customEndDate}T23:59:59.999Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

async function activateFamloPlus(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  familyId: string,
  duration: ActivationDuration,
  customEndDate: string | null
): Promise<void> {
  const now = new Date();
  const endDate = resolveEndDate(duration, customEndDate, now);

  if (!endDate) {
    throw new Error("A valid Famlo+ end date is required.");
  }

  const nowIso = now.toISOString();
  const endDateIso = endDate.toISOString();
  const graceUntilIso = addUtcDays(endDate, 4).toISOString();

  await insertSingleRowWithSchemaFallback(
    supabase,
    "host_pro_subscriptions",
    {
      family_id: familyId,
      plan_code: "famlo_plus",
      status: "active",
      current_period_start: nowIso,
      current_period_end: endDateIso,
      grace_until: graceUntilIso,
      activated_at: nowIso,
      cancelled_at: null,
      provider: "manual",
      last_payment_at: null,
      metadata: {
        activated_by: "system-admin",
        activation_source: "test_property_provision",
        activation_duration: duration,
        custom_end_date: customEndDate,
      },
      updated_at: nowIso,
    },
    "id"
  );
}

async function createInitialRoom(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  params: {
    familyId: string;
    hostId: string | null;
    roomName: string;
    basePrice: number;
    maxGuests: number;
  }
): Promise<JsonRecord> {
  return insertSingleRowWithSchemaFallback(
    supabase,
    "stay_units_v2",
    {
      host_id: params.hostId,
      legacy_family_id: params.familyId,
      unit_key: makeUnitKey(params.roomName),
      name: params.roomName,
      unit_type: "private_room",
      description: "Staging-only Booking.com GBP test room",
      max_guests: Math.max(1, Math.trunc(params.maxGuests)),
      bed_info: "1 double bed",
      bathroom_type: "private",
      price_morning: 0,
      price_afternoon: 0,
      price_evening: 0,
      price_fullday: Math.max(0, Math.trunc(params.basePrice)),
      quarter_enabled: false,
      is_active: true,
      is_primary: true,
      amenities: ["wifi"],
      photos: [],
      locality_photos: [],
      sort_order: 0,
      updated_at: new Date().toISOString(),
    },
    "id,unit_key,name,price_fullday"
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      sourceFamilyId?: string;
      propertyName?: string;
      timezone?: string;
      currency?: string;
      country?: string;
      state?: string;
      city?: string;
      addressLine?: string;
      contactPhone?: string;
      roomName?: string;
      basePrice?: number | string;
      maxGuests?: number | string;
      duration?: ActivationDuration;
      customEndDate?: string;
    };

    const sourceFamilyId = asString(body.sourceFamilyId);
    const propertyName = asString(body.propertyName) || "Famlo Booking.com Test GBP";
    const timezone = asString(body.timezone) || "Europe/London";
    const currency = asString(body.currency).toUpperCase() || "GBP";
    const country = asString(body.country) || "United Kingdom";
    const state = asString(body.state) || "England";
    const city = asString(body.city) || "London";
    const addressLine = asString(body.addressLine) || "Staging test property";
    const roomName = asString(body.roomName) || "Booking.com Test Room";
    const basePrice = Math.max(50, Math.trunc(asNumber(body.basePrice, 100)));
    const maxGuests = Math.max(1, Math.trunc(asNumber(body.maxGuests, 2)));
    const duration = body.duration ?? "1_year";
    const customEndDate = asNullableString(body.customEndDate);

    if (!sourceFamilyId) {
      return NextResponse.json({ error: "sourceFamilyId is required." }, { status: 400 });
    }

    if (currency !== "GBP") {
      return NextResponse.json(
        { error: "This provisioning flow is locked to GBP test properties only." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const { data: sourceFamily, error: sourceFamilyError } = await supabase
      .from("families")
      .select("id,user_id,host_id,name,email,host_phone,host_password,password,village")
      .eq("id", sourceFamilyId)
      .maybeSingle();

    if (sourceFamilyError) {
      throw sourceFamilyError;
    }

    if (!sourceFamily?.id || typeof sourceFamily.user_id !== "string" || sourceFamily.user_id.trim().length === 0) {
      return NextResponse.json({ error: "Source family is missing a real owner linkage." }, { status: 400 });
    }

    const hostCode = await generateUniqueFamilyCode(supabase);
    const nowIso = new Date().toISOString();

    const insertedFamily = await insertSingleRowWithSchemaFallback(
      supabase,
      "families",
      {
        user_id: sourceFamily.user_id,
        host_id: hostCode,
        name: propertyName,
        email: asNullableString(sourceFamily.email),
        host_phone: asNullableString(body.contactPhone) ?? asNullableString(sourceFamily.host_phone),
        host_password: asNullableString(sourceFamily.host_password) ?? asNullableString(sourceFamily.password),
        password: asNullableString(sourceFamily.password) ?? asNullableString(sourceFamily.host_password),
        street_address: addressLine,
        city,
        state,
        village: asNullableString(sourceFamily.village),
        country,
        about: "Staging-only GBP test property for Booking.com feed validation.",
        description: "Staging-only GBP test property for Booking.com feed validation.",
        family_composition: "test_property",
        languages_spoken: [],
        languages: [],
        famlo_experience: "Internal staging test setup",
        images: [],
        amenities: [],
        common_areas: [],
        is_verified: true,
        is_active: true,
        is_accepting: true,
        family_type: "cultural",
        created_at: nowIso,
        updated_at: nowIso,
      },
      "id,user_id,host_id,name,email"
    );

    const familyId = asString(insertedFamily.id);
    if (!familyId) {
      throw new Error("Family provisioning did not return an id.");
    }

    const insertedHost = await insertSingleRowWithSchemaFallback(
      supabase,
      "hosts",
      {
        user_id: sourceFamily.user_id,
        legacy_family_id: familyId,
        status: "published",
        display_name: propertyName,
        city,
        state,
        locality: asNullableString(sourceFamily.village),
        address_private: addressLine,
        about: "Staging-only GBP test property for Booking.com feed validation.",
        family_story: "Internal staging test setup",
        family_composition: "test_property",
        languages: [],
        amenities: [],
        house_rules: [],
        bathroom_type: "private",
        max_guests: maxGuests,
        pricing_mode: "quarterly",
        price_morning: 0,
        price_afternoon: 0,
        price_evening: 0,
        price_fullday: basePrice,
        blocked_dates: [],
        active_quarters: [],
        is_featured: false,
        is_accepting: true,
        published_at: nowIso,
        updated_at: nowIso,
      },
      "id,legacy_family_id,display_name"
    );

    const hostId = asNullableString(insertedHost.id);

    const settingsPayload = buildHostProSettingsUpsert(
      familyId,
      {
        propertyModel: "vacation_rental",
        propertyType: "homestay",
        timezone,
        currency,
        checkInTime: "15:00",
        checkOutTime: "11:00",
        defaultMealPlan: PRO_DEFAULT_MEAL_PLAN,
        standardRatePlanName: PRO_DEFAULT_RATE_PLAN_NAME,
        otaTitle: propertyName,
        contactEmail: asNullableString(sourceFamily.email),
        contactPhone: asNullableString(body.contactPhone) ?? asNullableString(sourceFamily.host_phone),
        website: null,
        country,
        state,
        city,
        postalCode: null,
        addressLine,
        latitude: null,
        longitude: null,
        propertyDescription: "Staging-only GBP property for Booking.com channel feed and acknowledgement testing.",
        checkInInstructions: "Internal staging property. Do not connect to live channels.",
        houseRules: "Internal test property only.",
        cancellationPolicyLabel: "Flexible",
      },
      {
        metadataPatch: {
          provisioned_by: "system-admin",
          provision_source_family_id: sourceFamilyId,
          test_property: true,
          test_currency: "GBP",
          purpose: "booking_com_feed_validation",
        },
        nowIso,
      }
    );

    const { error: settingsError } = await supabase
      .from("host_pro_settings")
      .upsert(settingsPayload as never, { onConflict: "family_id" });

    if (settingsError) {
      throw settingsError;
    }

    await activateFamloPlus(supabase, familyId, duration, customEndDate);

    const room = await createInitialRoom(supabase, {
      familyId,
      hostId,
      roomName,
      basePrice,
      maxGuests,
    });

    await updateSingleRowWithSchemaFallback(
      supabase,
      "families",
      {
        max_guests: maxGuests,
        price_fullday: basePrice,
        updated_at: new Date().toISOString(),
      },
      "id",
      familyId
    );

    await logAuditAction({
      actorId: "system-admin",
      actorRole: "admin",
      actionType: "test_property_provision",
      targetUserId: sourceFamily.user_id,
      resourceType: "families",
      newValue: {
        source_family_id: sourceFamilyId,
        new_family_id: familyId,
        new_host_id: hostId,
        partner_code: hostCode,
        property_name: propertyName,
        currency,
        timezone,
        room_name: roomName,
        room_price: basePrice,
      },
      reason: "isolated_booking_com_test_property",
    });

    return NextResponse.json({
      success: true,
      property: {
        familyId,
        hostId,
        hostCode,
        name: propertyName,
        currency,
        timezone,
        roomId: asNullableString(room.id),
        roomName: asNullableString(room.name) ?? roomName,
        proDashboardUrl: `/partnerslogin/home/pro/dashboard?family=${familyId}`,
        basicDashboardUrl: `/partnerslogin/home/dashboard?family=${familyId}`,
      },
    });
  } catch (error) {
    console.error("[admin.test-properties.provision] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to provision test property." },
      { status: 500 }
    );
  }
}
