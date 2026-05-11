import { NextResponse } from "next/server";

import { resolveAuthorizedHostSession } from "@/lib/chat-access";
import {
  buildHostProSettingsUpsert,
  PRO_DEFAULT_COUNTRY,
  PRO_DEFAULT_CURRENCY,
  PRO_DEFAULT_MEAL_PLAN,
  PRO_DEFAULT_RATE_PLAN_NAME,
  PRO_DEFAULT_TIMEZONE,
  sanitizeHostProSettingsInput,
} from "@/lib/host-pro-settings";
import { parseHostListingMeta, serializeHostListingMeta, type HostListingMeta } from "@/lib/host-listing-meta";
import { isFamloProDashboardEnabled, loadHostProAccess } from "@/lib/host-pro-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;

type CreatePropertyBody = {
  propertyName?: string;
  city?: string;
  state?: string;
  country?: string;
  streetAddress?: string;
  propertyModel?: string;
  propertyType?: string;
  description?: string;
};

type PostgrestLikeError = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

type HostProSubscriptionStatus = "inactive" | "active" | "grace" | "expired" | "cancelled";

type HostProSubscriptionRow = {
  id: string | null;
  family_id: string | null;
  plan_code: string | null;
  status: HostProSubscriptionStatus | null;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_until: string | null;
  activated_at: string | null;
  cancelled_at: string | null;
  provider: string | null;
  last_payment_at: string | null;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  const next = asString(value);
  return next.length > 0 ? next : null;
}

function toErrorLogPayload(error: unknown): PostgrestLikeError & { raw?: unknown } {
  if (error && typeof error === "object") {
    const candidate = error as PostgrestLikeError;
    return {
      message: candidate.message ?? null,
      code: candidate.code ?? null,
      details: candidate.details ?? null,
      hint: candidate.hint ?? null,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: null,
      details: null,
      hint: null,
    };
  }

  return {
    message: typeof error === "string" ? error : null,
    code: null,
    details: null,
    hint: null,
    raw: error,
  };
}

function toClientErrorMessage(error: unknown): string {
  const payload = toErrorLogPayload(error);
  if (process.env.NODE_ENV !== "production") {
    return payload.code ? `${payload.message ?? "Property creation failed."} (${payload.code})` : payload.message ?? "Property creation failed.";
  }
  return "Failed to create property.";
}

function extractMissingColumnFromSchemaError(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
}

function asTimestamp(value: unknown): string | null {
  return asNullableString(value);
}

function asSubscriptionStatus(value: unknown): HostProSubscriptionStatus {
  const normalized = asString(value).toLowerCase();
  if (
    normalized === "active" ||
    normalized === "grace" ||
    normalized === "expired" ||
    normalized === "cancelled"
  ) {
    return normalized;
  }
  return "inactive";
}

function toMillis(value: string | null): number | null {
  if (!value) return null;
  const millis = Date.parse(value);
  return Number.isNaN(millis) ? null : millis;
}

function compareSubscriptionRows(left: HostProSubscriptionRow, right: HostProSubscriptionRow): number {
  const rank = (row: HostProSubscriptionRow): number => {
    const status = asSubscriptionStatus(row.status);
    if (status === "active") return 5;
    if (status === "grace") return 4;
    if (status === "inactive") return 3;
    if (status === "cancelled") return 2;
    return 1;
  };

  const rankDiff = rank(right) - rank(left);
  if (rankDiff !== 0) return rankDiff;

  const rightBoundary =
    toMillis(right.current_period_end) ??
    toMillis(right.grace_until) ??
    toMillis(right.created_at) ??
    0;
  const leftBoundary =
    toMillis(left.current_period_end) ??
    toMillis(left.grace_until) ??
    toMillis(left.created_at) ??
    0;

  return rightBoundary - leftBoundary;
}

function isSubscriptionRowCurrentlyAllowed(row: HostProSubscriptionRow, now: Date): boolean {
  const status = asSubscriptionStatus(row.status);
  const nowMillis = now.getTime();

  if (status === "active") {
    const periodMillis = toMillis(row.current_period_end);
    return periodMillis !== null && nowMillis <= periodMillis;
  }

  if (status === "grace") {
    const graceMillis = toMillis(row.grace_until);
    return graceMillis !== null && nowMillis <= graceMillis;
  }

  return false;
}

function asJsonRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function sanitizeInheritedSubscriptionMetadata(
  metadata: JsonRecord | null,
  sourceFamilyId: string
): JsonRecord {
  const nextMetadata: JsonRecord = { ...(metadata ?? {}) };

  delete nextMetadata.channex_property_id;
  delete nextMetadata.channex_room_type_id;
  delete nextMetadata.channex_rate_plan_id;
  delete nextMetadata.external_property_id;
  delete nextMetadata.external_room_type_id;
  delete nextMetadata.external_rate_plan_id;
  delete nextMetadata.provider_customer_id;
  delete nextMetadata.provider_subscription_id;
  delete nextMetadata.provider_order_id;

  nextMetadata.inherited_from_family_id = sourceFamilyId;
  nextMetadata.created_via = "pro_property_create";

  return nextMetadata;
}

function buildInheritedHostMeta(
  sourceMeta: HostListingMeta
): HostListingMeta | null {
  const inheritedMeta: HostListingMeta = {};

  if (asString(sourceMeta.hostDisplayName)) {
    inheritedMeta.hostDisplayName = asString(sourceMeta.hostDisplayName);
  }

  if (asString(sourceMeta.hostSelfieUrl)) {
    inheritedMeta.hostSelfieUrl = asString(sourceMeta.hostSelfieUrl);
  }

  if (asString(sourceMeta.hostHobbies)) {
    inheritedMeta.hostHobbies = asString(sourceMeta.hostHobbies);
  }

  if (asString(sourceMeta.hostCatchphrase)) {
    inheritedMeta.hostCatchphrase = asString(sourceMeta.hostCatchphrase);
  }

  if (asString(sourceMeta.familyComposition)) {
    inheritedMeta.familyComposition = asString(sourceMeta.familyComposition);
  }

  return Object.keys(inheritedMeta).length > 0 ? inheritedMeta : null;
}

async function loadBestAllowedSubscriptionRow(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  familyId: string
): Promise<HostProSubscriptionRow | null> {
  const { data, error } = await supabase
    .from("host_pro_subscriptions")
    .select(
      "id,family_id,plan_code,status,current_period_start,current_period_end,grace_until,activated_at,cancelled_at,provider,last_payment_at,metadata,created_at,updated_at"
    )
    .eq("family_id", familyId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data)
    ? (data as JsonRecord[]).map((row) => ({
        id: asNullableString(row.id),
        family_id: asNullableString(row.family_id),
        plan_code: asNullableString(row.plan_code),
        status: asSubscriptionStatus(row.status),
        current_period_start: asTimestamp(row.current_period_start),
        current_period_end: asTimestamp(row.current_period_end),
        grace_until: asTimestamp(row.grace_until),
        activated_at: asTimestamp(row.activated_at),
        cancelled_at: asTimestamp(row.cancelled_at),
        provider: asNullableString(row.provider),
        last_payment_at: asTimestamp(row.last_payment_at),
        metadata: asJsonRecord(row.metadata),
        created_at: asTimestamp(row.created_at),
        updated_at: asTimestamp(row.updated_at),
      }))
    : [];

  rows.sort(compareSubscriptionRows);
  const now = new Date();
  return rows.find((row) => isSubscriptionRowCurrentlyAllowed(row, now)) ?? null;
}

async function hasAnySubscriptionRow(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  familyId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("host_pro_subscriptions")
    .select("id")
    .eq("family_id", familyId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.id);
}

async function insertSingleRowWithSchemaFallback(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  table: string,
  payload: JsonRecord,
  selectClause: string
): Promise<JsonRecord> {
  const workingPayload: JsonRecord = { ...payload };

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await supabase
      .from(table)
      .insert(workingPayload as never)
      .select(selectClause)
      .single();

    if (!error && data) {
      return data as unknown as JsonRecord;
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

  throw new Error("Unable to generate a unique property code.");
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const warnings: string[] = [];
    const body = (await request.json()) as CreatePropertyBody;
    const propertyName = asString(body.propertyName);
    const city = asString(body.city);
    const state = asString(body.state);
    const country = asString(body.country) || PRO_DEFAULT_COUNTRY;
    const streetAddress = asString(body.streetAddress);
    const propertyModel = asNullableString(body.propertyModel);
    const propertyType = asNullableString(body.propertyType);
    const description = asNullableString(body.description);

    if (!propertyName || !city || !state || !country || !streetAddress || !propertyType) {
      return NextResponse.json(
        {
          error: "propertyName, city, state, country, streetAddress, and propertyType are required.",
        },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const hostSession = await resolveAuthorizedHostSession(supabase, request);

    if (!hostSession?.hostUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isFamloProDashboardEnabled()) {
      return NextResponse.json({ error: "Famlo Pro is disabled." }, { status: 403 });
    }

    if (!hostSession.familyId) {
      return NextResponse.json({ error: "No active host property context found." }, { status: 403 });
    }

    const access = await loadHostProAccess(supabase, hostSession.familyId);
    if (!access.allowed) {
      return NextResponse.json({ error: "Famlo Pro is not active for this host session." }, { status: 403 });
    }

    const { data: sourceFamily, error: sourceFamilyError } = await supabase
      .from("families")
      .select(
        "id,user_id,host_id,email,host_phone,host_photo_url,password,host_password,languages,languages_spoken,admin_notes,family_composition"
      )
      .eq("id", hostSession.familyId)
      .eq("user_id", hostSession.hostUserId)
      .maybeSingle();

    if (sourceFamilyError) {
      console.error(
        "[host.pro.properties.create] source-family lookup failed:",
        JSON.stringify(toErrorLogPayload(sourceFamilyError))
      );
      throw sourceFamilyError;
    }

    const resolvedUserId =
      asNullableString(sourceFamily?.user_id) ?? hostSession.hostUserId;

    if (!resolvedUserId) {
      return NextResponse.json({ error: "Unable to resolve host user." }, { status: 400 });
    }

    const familyCode = await generateUniqueFamilyCode(supabase);
    const nowIso = new Date().toISOString();
    const sourceMeta = parseHostListingMeta(
      typeof sourceFamily?.admin_notes === "string" ? sourceFamily.admin_notes : null
    );
    const inheritedHostMeta = buildInheritedHostMeta(sourceMeta);
    const insertedFamily = await insertSingleRowWithSchemaFallback(
      supabase,
      "families",
      {
        user_id: resolvedUserId,
        host_id: familyCode,
        name: propertyName,
        city,
        state,
        country,
        street_address: streetAddress,
        family_type: "cultural",
        description,
        about: description,
        email: asNullableString(sourceFamily?.email),
        host_phone: asNullableString(sourceFamily?.host_phone),
        host_photo_url: asNullableString(sourceFamily?.host_photo_url),
        password: asNullableString(sourceFamily?.password),
        host_password: asNullableString(sourceFamily?.host_password),
        languages: Array.isArray(sourceFamily?.languages) ? sourceFamily.languages : [],
        languages_spoken: Array.isArray(sourceFamily?.languages_spoken) ? sourceFamily.languages_spoken : [],
        family_composition:
          asNullableString(sourceFamily?.family_composition) ??
          asNullableString(sourceMeta.familyComposition),
        // Shared host defaults only. Property-specific content stays separate,
        // and we intentionally do not copy any channel, booking, room, or
        // property-level presentation data into the new family.
        admin_notes: inheritedHostMeta ? serializeHostListingMeta(inheritedHostMeta) : null,
        is_active: false,
        is_accepting: false,
        created_at: nowIso,
        updated_at: nowIso,
      },
      "id,user_id"
    );

    const familyId = asNullableString(insertedFamily.id);
    if (!familyId) {
      throw new Error("Created property did not return a family id.");
    }

    const insertedFamilyUserId = asNullableString(insertedFamily.user_id);
    if (!insertedFamilyUserId || insertedFamilyUserId !== resolvedUserId) {
      throw new Error("Created property ownership did not match the current host.");
    }

    const settingsPayload = buildHostProSettingsUpsert(
      familyId,
      sanitizeHostProSettingsInput({
        propertyModel,
        propertyType,
        timezone: PRO_DEFAULT_TIMEZONE,
        currency: PRO_DEFAULT_CURRENCY,
        checkInTime: null,
        checkOutTime: null,
        defaultMealPlan: PRO_DEFAULT_MEAL_PLAN,
        standardRatePlanName: PRO_DEFAULT_RATE_PLAN_NAME,
        otaTitle: propertyName,
        contactEmail: asNullableString(sourceFamily?.email),
        contactPhone: asNullableString(sourceFamily?.host_phone),
        website: null,
        country,
        state,
        city,
        postalCode: null,
        addressLine: streetAddress,
        latitude: null,
        longitude: null,
        propertyDescription: description,
        checkInInstructions: null,
        houseRules: null,
        cancellationPolicyLabel: null,
      }),
      {
        metadataPatch: {
          created_by: "host",
          created_via: "pro_add_property",
          source_family_id: hostSession.familyId,
          source_host_user_id: hostSession.hostUserId,
        },
        nowIso,
      }
    );

    const { error: settingsError } = await supabase
      .from("host_pro_settings")
      .upsert(settingsPayload as never, { onConflict: "family_id" });

    if (settingsError) {
      console.error(
        "[host.pro.properties.create] host_pro_settings seed failed:",
        JSON.stringify(toErrorLogPayload(settingsError))
      );
      warnings.push("host_pro_settings_seed_failed");
    }

    try {
      const sourceSubscription = await loadBestAllowedSubscriptionRow(supabase, hostSession.familyId);

      if (sourceSubscription) {
        const targetAlreadyHasSubscription = await hasAnySubscriptionRow(supabase, familyId);

        if (!targetAlreadyHasSubscription) {
          const inheritedMetadata = sanitizeInheritedSubscriptionMetadata(
            sourceSubscription.metadata,
            hostSession.familyId
          );

          await insertSingleRowWithSchemaFallback(
            supabase,
            "host_pro_subscriptions",
            {
              family_id: familyId,
              plan_code: sourceSubscription.plan_code ?? "famlo_plus",
              status: sourceSubscription.status ?? "inactive",
              current_period_start: sourceSubscription.current_period_start,
              current_period_end: sourceSubscription.current_period_end,
              grace_until: sourceSubscription.grace_until,
              activated_at: sourceSubscription.activated_at,
              cancelled_at: sourceSubscription.cancelled_at,
              provider: sourceSubscription.provider,
              last_payment_at: sourceSubscription.last_payment_at,
              metadata: inheritedMetadata,
              updated_at: nowIso,
            },
            "id"
          );
        }
      }
    } catch (subscriptionError) {
      console.error(
        "[host.pro.properties.create] host_pro_subscriptions inheritance failed:",
        JSON.stringify(toErrorLogPayload(subscriptionError))
      );
      warnings.push("host_pro_subscription_inheritance_failed");
    }

    return NextResponse.json({
      ok: true,
      familyId,
      warnings,
      redirectTo: `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(familyId)}&section=properties-home`,
    });
  } catch (error) {
    console.error(
      "[host.pro.properties.create] failed:",
      JSON.stringify(toErrorLogPayload(error))
    );
    return NextResponse.json(
      { error: toClientErrorMessage(error) },
      { status: 500 }
    );
  }
}
