import { NextResponse } from "next/server";

import { POST as createRatePlans } from "@/app/api/host/pro/channel/channex/rate-plans/route";
import { POST as createRoomTypes } from "@/app/api/host/pro/channel/channex/rooms/route";
import { enqueueChannexAriSyncJobs, triggerQueuedChannexSyncWorker } from "@/lib/channex-ari-jobs";
import { createChannexProperty, fetchChannexGroups, fetchChannexPropertyById, getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import { ensureChannexMutationAllowed } from "@/lib/channel-providers/channex/mutation-guard";
import { resolveChannexPropertyCreateContext } from "@/lib/channel-providers/channex/resolve-create-property-context";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { loadHostProSettings } from "@/lib/host-pro-settings";
import { createAdminSupabaseClient } from "@/lib/supabase";

type CreateBody = {
  familyId?: string;
};

type BootstrapItem = {
  stayUnitId: string;
  name: string;
  status: string;
  externalRoomTypeId?: string | null;
  externalRatePlanId?: string | null;
  title?: string;
  missingFields?: string[];
  message: string;
};

type BootstrapSummary = {
  roomMappings: BootstrapItem[];
  ratePlans: BootstrapItem[];
  ariSync?: {
    status: "queued" | "skipped";
    queuedJobIds: string[];
    message: string;
  };
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asUpperToken(value: string | null): string | null {
  return value ? value.trim().toUpperCase() : null;
}

function resolveCountryAlpha2(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return null;
  if (normalized.length === 2) return normalized.toUpperCase();

  const lookup: Record<string, string> = {
    india: "IN",
    "united states": "US",
    usa: "US",
    us: "US",
    "united kingdom": "GB",
    uk: "GB",
    england: "GB",
    "united arab emirates": "AE",
    uae: "AE",
    australia: "AU",
    singapore: "SG",
    malaysia: "MY",
    thailand: "TH",
    vietnam: "VN",
    indonesia: "ID",
    nepal: "NP",
    "sri lanka": "LK",
    bhutan: "BT",
    france: "FR",
    germany: "DE",
    italy: "IT",
    spain: "ES",
    japan: "JP",
  };

  return lookup[normalized] ?? null;
}

function isValidTimezone(value: string | null): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isValidEmail(value: string | null): boolean {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function isValidPhone(value: string | null): boolean {
  return Boolean(value && /^[0-9+\-() ]{6,20}$/.test(value));
}

function mapChannexPropertyType(
  propertyModel: string | null,
  propertyType: string | null
): string | null {
  if (propertyType === "homestay") return "homestay";
  if (propertyType === "guest_house") return "guest_house";
  if (propertyType === "farm_stay") return "farm_stay";
  if (propertyType === "villa") return "villa";
  if (propertyType === "apartment") return "apartment";
  if (propertyType === "hotel_bnb") return "guest_house";
  if (propertyModel === "hotel") return "hotel";
  if (propertyModel === "vacation_rental") return "apartment";
  return null;
}

function buildImportantInformation(input: {
  checkInTime: string | null;
  checkOutTime: string | null;
  checkInInstructions: string | null;
  houseRules: string | null;
  cancellationPolicyLabel: string | null;
}): string | null {
  const lines = [
    input.checkInTime ? `Check-in: ${input.checkInTime}` : null,
    input.checkOutTime ? `Check-out: ${input.checkOutTime}` : null,
    input.checkInInstructions ? `Instructions: ${input.checkInInstructions}` : null,
    input.houseRules ? `House rules: ${input.houseRules}` : null,
    input.cancellationPolicyLabel ? `Cancellation: ${input.cancellationPolicyLabel}` : null,
  ].filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : null;
}

function addMissing(list: string[], value: string | null, label: string): void {
  if (!value) list.push(label);
}

function toFriendlyMissingField(label: string): string {
  switch (label) {
    case "ota_title_or_property_name":
      return "property title";
    case "property_model":
      return "property model";
    case "property_type":
      return "property type";
    case "timezone":
      return "timezone";
    case "currency":
      return "currency";
    case "country":
      return "country";
    case "city":
      return "city";
    case "address_line":
      return "address";
    case "mapped_property_type":
      return "property type mapping";
    case "check_in_time":
      return "check-in time";
    case "check_out_time":
      return "check-out time";
    case "contact_email_or_contact_phone":
      return "contact email or phone";
    default:
      return label.replaceAll("_", " ");
  }
}

function toFriendlyInvalidField(label: string): string {
  switch (label) {
    case "timezone":
      return "timezone";
    case "country":
      return "country";
    case "currency":
      return "currency";
    case "contact_email":
      return "contact email";
    case "contact_phone":
      return "contact phone";
    default:
      return label.replaceAll("_", " ");
  }
}

function flattenValidationDetails(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => flattenValidationDetails(entry, prefix ? `${prefix}[${index}]` : String(index)));
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
      flattenValidationDetails(entry, prefix ? `${prefix}.${key}` : key)
    );
  }

  const label = prefix || "validation";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text ? [`${label}: ${text}`] : [];
}

function buildForwardedRequest(request: Request, familyId: string): Request {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");

  return new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ familyId }),
  });
}

async function bootstrapChannexRoomsAndRates(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  request: Request,
  familyId: string,
  actorUserId: string | null,
  actorRole: "admin" | "host"
): Promise<BootstrapSummary> {
  const roomResponse = await createRoomTypes(buildForwardedRequest(request, familyId));
  const roomPayload = (await roomResponse.json()) as {
    results?: BootstrapItem[];
  };

  const roomMappings = Array.isArray(roomPayload.results) ? roomPayload.results : [];

  const rateResponse = await createRatePlans(buildForwardedRequest(request, familyId));
  const ratePayload = (await rateResponse.json()) as {
    results?: BootstrapItem[];
  };

  const ratePlans = Array.isArray(ratePayload.results) ? ratePayload.results : [];
  const mappedRoomIds = new Set(
    roomMappings
      .filter((item) => item.status === "created" || item.status === "already_mapped")
      .map((item) => item.stayUnitId)
  );
  const mappedRateIds = new Set(
    ratePlans
      .filter((item) => item.status === "created" || item.status === "already_mapped")
      .map((item) => item.stayUnitId)
  );
  const hasReadyMappings = [...mappedRoomIds].some((stayUnitId) => mappedRateIds.has(stayUnitId));

  let ariSync: BootstrapSummary["ariSync"] | undefined;
  if (hasReadyMappings) {
    const today = new Date().toISOString().slice(0, 10);
    const queuedJobIds = await enqueueChannexAriSyncJobs(supabase, {
      familyId,
      dateFrom: today,
      dateTo: today,
      jobTypes: ["full_sync"],
      certificationScenario: "host_post_property_bootstrap",
      sourceUiAction: "Famlo host Channex bootstrap sync",
      sourceRoute: "/api/host/pro/channel/channex/property",
      stayUnitIds: null,
      actorUserId,
      actorRole,
    });

    if (queuedJobIds.length > 0) {
      await triggerQueuedChannexSyncWorker({
        requestUrl: request.url,
        workerId: `host-bootstrap-${familyId}`,
        limit: 4,
      });
      ariSync = {
        status: "queued",
        queuedJobIds,
        message: "Queued the current Famlo availability and rates for Channex staging sync.",
      };
    } else {
      ariSync = {
        status: "skipped",
        queuedJobIds: [],
        message: "Skipped ARI sync because no eligible mapped room and rate-plan pair was ready yet.",
      };
    }
  } else {
    ariSync = {
      status: "skipped",
      queuedJobIds: [],
      message: "Skipped ARI sync because room or rate-plan mappings are still incomplete.",
    };
  }

  return {
    roomMappings,
    ratePlans,
    ariSync,
  };
}

async function archiveStaleChannexPropertyState(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  existingChannelPropertyId: string;
  existingExternalPropertyId: string;
  existingPropertyMetadata: unknown;
  reason: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const existingPropertyMetadata = asRecord(input.existingPropertyMetadata);
  const staleHistory = Array.isArray(existingPropertyMetadata.stale_property_history)
    ? existingPropertyMetadata.stale_property_history.slice(-4)
    : [];
  staleHistory.push({
    external_property_id: input.existingExternalPropertyId,
    marked_at: nowIso,
    reason: input.reason,
  });

  await input.supabase
    .from("channel_properties")
    .update({
      external_property_id: null,
      sync_status: "needs_repair",
      metadata: {
        ...existingPropertyMetadata,
        stale_property_history: staleHistory,
        stale_property_detected: true,
        stale_property_detected_at: nowIso,
        stale_property_reason: input.reason,
        last_stale_external_property_id: input.existingExternalPropertyId,
      },
      updated_at: nowIso,
    } as never)
    .eq("id", input.existingChannelPropertyId);

  const { data: roomMappings } = await input.supabase
    .from("channel_room_mappings")
    .select("id,external_room_type_id,metadata")
    .eq("family_id", input.familyId)
    .eq("provider_code", "channex");

  for (const row of (roomMappings ?? []) as Array<Record<string, unknown>>) {
    const mappingId = asString(row.id);
    if (!mappingId) continue;
    const metadata = asRecord(row.metadata);
    const previousExternalRoomTypeId = asString(row.external_room_type_id);
    await input.supabase
      .from("channel_room_mappings")
      .update({
        external_property_id: null,
        external_room_type_id: null,
        sync_status: "needs_repair",
        metadata: {
          ...metadata,
          stale_property_detected: true,
          stale_property_detected_at: nowIso,
          stale_property_reason: input.reason,
          last_stale_external_property_id: input.existingExternalPropertyId,
          last_stale_external_room_type_id: previousExternalRoomTypeId,
        },
        updated_at: nowIso,
      } as never)
      .eq("id", mappingId);
  }

  const { data: ratePlans } = await input.supabase
    .from("channel_rate_plans")
    .select("id,external_rate_plan_id,metadata")
    .eq("family_id", input.familyId)
    .eq("provider_code", "channex");

  for (const row of (ratePlans ?? []) as Array<Record<string, unknown>>) {
    const ratePlanId = asString(row.id);
    if (!ratePlanId) continue;
    const metadata = asRecord(row.metadata);
    const previousExternalRatePlanId = asString(row.external_rate_plan_id);
    await input.supabase
      .from("channel_rate_plans")
      .update({
        external_rate_plan_id: null,
        sync_status: "needs_repair",
        metadata: {
          ...metadata,
          stale_property_detected: true,
          stale_property_detected_at: nowIso,
          stale_property_reason: input.reason,
          last_stale_external_property_id: input.existingExternalPropertyId,
          last_stale_external_rate_plan_id: previousExternalRatePlanId,
        },
        updated_at: nowIso,
      } as never)
      .eq("id", ratePlanId);
  }
}

async function logCreatePropertyEvent(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string;
  status: "success" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: "create_property",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[host.pro.channel.channex.property] log failed:", error);
    }
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as CreateBody;
    const familyId = asString(body.familyId) ?? "";

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });
    const authUser = authorizedResource?.hostUserId
      ? {
          id: authorizedResource.hostUserId,
          email: null,
          phone: null,
          provider: authorizedResource.isAdmin ? "admin" : "host_session",
        }
      : null;

    if (!authorizedResource?.familyId) {
      return NextResponse.json(
        {
          ok: false,
          status: "unauthorized",
          message: "You can only connect a Channex property for your own authenticated Famlo Pro workspace.",
        },
        { status: 401 }
      );
    }

    const access = await loadHostProAccess(supabase, familyId);
    if (!access.allowed) {
      return NextResponse.json(
        {
          ok: false,
          status: "pro_inactive",
          message: "Famlo Pro is not active for this selected property.",
        },
        { status: 403 }
      );
    }

    const blockedMutation = await ensureChannexMutationAllowed({
      supabase,
      familyId,
      action: "create_property",
      route: "/api/host/pro/channel/channex/property",
    });
    if (blockedMutation) return blockedMutation;

    const config = getChannexConfigSummary();
    if (!config.configured) {
      await logCreatePropertyEvent({
        supabase,
        familyId,
        status: "failed",
        message: "Channex staging configuration is incomplete.",
        payload: {
          environment: config.environment,
          configured: false,
          stage: "pre_validation",
        },
      });

      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          configured: false,
          message: "Channex staging configuration is incomplete.",
        },
        { status: 400 }
      );
    }

    const [{ data: family }, { data: host }, { data: latestDraft }, settings, { data: existingChannelProperty }] = await Promise.all([
      supabase
        .from("families")
        .select("id,name,property_name,user_id,email,host_email,host_phone,city,state,street_address,check_in_time,check_out_time,admin_notes,latest_onboarding_payload,lat,lng,about,description,house_rules,locality,village")
        .eq("id", familyId)
        .maybeSingle(),
      supabase
        .from("hosts")
        .select("id,user_id,display_name,legacy_family_id,locality")
        .eq("legacy_family_id", familyId)
        .maybeSingle(),
      supabase
        .from("host_onboarding_drafts")
        .select("payload")
        .eq("family_id", familyId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      loadHostProSettings(supabase, familyId),
      supabase
        .from("channel_properties")
        .select("id,family_id,provider_code,external_property_id,sync_status,metadata")
        .eq("family_id", familyId)
        .eq("provider_code", "channex")
        .maybeSingle(),
    ]);

    const existingExternalPropertyId = asString(existingChannelProperty?.external_property_id);
    let recoveredFromStaleMapping = false;
    if (existingExternalPropertyId) {
      const propertyLookup = await fetchChannexPropertyById(existingExternalPropertyId);
      if (propertyLookup.ok && propertyLookup.data?.id) {
        const bootstrap = await bootstrapChannexRoomsAndRates(
          supabase,
          request,
          familyId,
          authorizedResource.hostUserId ?? null,
          authorizedResource.isAdmin ? "admin" : "host"
        );
        return NextResponse.json({
          ok: true,
          status: "already_created",
          externalPropertyId: existingExternalPropertyId,
          message: "This property is already connected to Channex staging.",
          bootstrap,
        });
      }

      await logCreatePropertyEvent({
        supabase,
        familyId,
        status: "failed",
        message: "Saved Channex property mapping is stale or inaccessible. Recreating the provider property.",
        payload: {
          environment: config.environment,
          stage: "property_lookup_before_recreate",
          stale_external_property_id: existingExternalPropertyId,
          provider_lookup_http_status: propertyLookup.httpStatus,
          provider_lookup_message: propertyLookup.message,
        },
      });

      if (existingChannelProperty?.id) {
        await archiveStaleChannexPropertyState({
          supabase,
          familyId,
          existingChannelPropertyId: existingChannelProperty.id,
          existingExternalPropertyId,
          existingPropertyMetadata: existingChannelProperty.metadata,
          reason: "Saved Channex property was deleted or is no longer accessible.",
        });
      }
      recoveredFromStaleMapping = true;
    }

    const resolved = await resolveChannexPropertyCreateContext(supabase, {
      familyId,
      settings,
      familyRow: (family as Record<string, unknown> | null) ?? null,
      hostRow: (host as Record<string, unknown> | null) ?? null,
      authUser,
      onboardingDraftPayload:
        latestDraft?.payload && typeof latestDraft.payload === "object" && !Array.isArray(latestDraft.payload)
          ? latestDraft.payload
          : latestDraft?.payload ?? null,
    });

    const title = asString(resolved.title);
    const propertyModel = asString(resolved.propertyModel);
    const propertyTypeInput = asString(resolved.propertyType);
    const propertyType = mapChannexPropertyType(propertyModel, propertyTypeInput);
    const currency = asUpperToken(asString(resolved.currency));
    const country = resolveCountryAlpha2(asString(resolved.country));
    const city = asString(resolved.city);
    const addressLine = asString(resolved.addressLine);
    const timezone = asString(resolved.timezone);
    const checkInTime = asString(resolved.checkInTime);
    const checkOutTime = asString(resolved.checkOutTime);
    const contactEmail = asString(resolved.contactEmail);
    const contactPhone = asString(resolved.contactPhone);
    const missingFields: string[] = [];
    const invalidFields: string[] = [];

    addMissing(missingFields, title, "ota_title_or_property_name");
    addMissing(missingFields, propertyModel, "property_model");
    addMissing(missingFields, propertyTypeInput, "property_type");
    addMissing(missingFields, timezone, "timezone");
    addMissing(missingFields, currency && currency.length === 3 ? currency : null, "currency");
    addMissing(missingFields, country, "country");
    addMissing(missingFields, city, "city");
    addMissing(missingFields, addressLine, "address_line");
    addMissing(missingFields, propertyType, "mapped_property_type");
    addMissing(missingFields, checkInTime, "check_in_time");
    addMissing(missingFields, checkOutTime, "check_out_time");
    if (!contactEmail && !contactPhone) {
      missingFields.push("contact_email_or_contact_phone");
    }

    if (timezone && !isValidTimezone(timezone)) invalidFields.push("timezone");
    if (country && country.length !== 2) invalidFields.push("country");
    if (currency && currency.length !== 3) invalidFields.push("currency");
    if (contactEmail && !isValidEmail(contactEmail)) invalidFields.push("contact_email");
    if (contactPhone && !isValidPhone(contactPhone)) invalidFields.push("contact_phone");

    if (missingFields.length > 0 || invalidFields.length > 0) {
      const missingFieldLabels = missingFields.map(toFriendlyMissingField);
      const invalidFieldLabels = invalidFields.map(toFriendlyInvalidField);
      const message = [
        missingFieldLabels.length > 0 ? `Complete these fields before creating a Channex staging property: ${missingFieldLabels.join(", ")}.` : null,
        invalidFieldLabels.length > 0 ? `Fix these invalid fields: ${invalidFieldLabels.join(", ")}.` : null,
      ].filter(Boolean).join(" ");
      await logCreatePropertyEvent({
        supabase,
        familyId,
        status: "failed",
        message,
        payload: {
          environment: config.environment,
          stage: "pre_validation",
          selected_family_id: familyId,
          selected_property_id: familyId,
          selected_property_name:
            asString((family as Record<string, unknown> | null)?.property_name) ??
            asString((family as Record<string, unknown> | null)?.name) ??
            asString((host as Record<string, unknown> | null)?.display_name),
          resolver_debug: resolved.debugSummary,
          resolved_sources: resolved.sources,
          resolved_presence: {
            title: Boolean(title),
            property_model: Boolean(propertyModel),
            property_type: Boolean(propertyTypeInput),
            timezone: Boolean(timezone),
            currency: Boolean(currency),
            country: Boolean(country),
            state: Boolean(resolved.state),
            city: Boolean(city),
            address_line: Boolean(addressLine),
            check_in_time: Boolean(checkInTime),
            check_out_time: Boolean(checkOutTime),
            contact_email: Boolean(contactEmail),
            contact_phone: Boolean(contactPhone),
          },
          missing_fields: missingFields,
          missing_field_labels: missingFieldLabels,
          invalid_fields: invalidFields,
          invalid_field_labels: invalidFieldLabels,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          status: "validation_failed",
          message,
          missingFields: missingFieldLabels,
          invalidFields: invalidFieldLabels,
        },
        { status: 422 }
      );
    }

    const groupsResult = await fetchChannexGroups();
    const selectedGroupId =
      groupsResult.ok && groupsResult.groups.length === 1
        ? groupsResult.groups[0]?.id ?? null
        : null;

    const result = await createChannexProperty({
      title: title ?? "Famlo Property",
      currency: currency ?? "INR",
      email: contactEmail,
      phone: contactPhone,
      zipCode: asString(resolved.postalCode),
      country: country ?? "IN",
      state: asString(resolved.state),
      city: city ?? "",
      address: addressLine ?? "",
      longitude: resolved.longitude != null ? String(resolved.longitude) : null,
      latitude: resolved.latitude != null ? String(resolved.latitude) : null,
      timezone: timezone ?? "Asia/Kolkata",
      propertyType: propertyType ?? "apartment",
      groupId: selectedGroupId,
      website: asString(resolved.website),
      description: asString(resolved.propertyDescription),
      importantInformation: buildImportantInformation({
        checkInTime,
        checkOutTime,
        checkInInstructions: asString(resolved.checkInInstructions),
        houseRules: asString(resolved.houseRules),
        cancellationPolicyLabel: asString(resolved.cancellationPolicyLabel),
      }),
    });

    if (!result.ok || !result.externalPropertyId) {
      const validationDetails = flattenValidationDetails(result.errorDetails);
      if (existingChannelProperty?.id) {
        await supabase
          .from("channel_properties")
          .update({
            sync_status: "failed",
            metadata: {
              ...((existingChannelProperty.metadata as Record<string, unknown> | null) ?? {}),
              last_error: result.message,
              last_error_at: new Date().toISOString(),
              last_validation_details: validationDetails,
            },
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", existingChannelProperty.id);
      }

      await logCreatePropertyEvent({
        supabase,
        familyId,
        status: "failed",
        message: result.message,
        payload: {
          environment: result.environment,
          endpoint: result.endpoint,
          http_status: result.httpStatus,
          error_code: result.errorCode,
          error_title: result.errorTitle,
          selected_family_id: familyId,
          selected_property_id: familyId,
          resolver_debug: resolved.debugSummary,
          resolved_sources: resolved.sources,
          provider_validation: result.rawValidation,
          provider_validation_details: result.errorDetails,
          payload_summary: result.payloadSummary,
          group_fetch: {
            ok: groupsResult.ok,
            count: groupsResult.groups.length,
            selected_group_id: selectedGroupId,
          },
        },
      });

      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          message: result.message,
          validationDetails,
          validationCode: result.errorCode,
          validationTitle: result.errorTitle,
          payloadSummary: result.payloadSummary,
        },
        { status: result.httpStatus === 422 ? 422 : 502 }
      );
    }

    const metadataPatch = {
      created_via: "channex_staging_property_route",
      created_by: authorizedResource.isAdmin ? "admin" : "host",
      last_created_at: new Date().toISOString(),
    };

    const upsertPayload = {
      id: existingChannelProperty?.id ?? undefined,
      family_id: familyId,
      provider_code: "channex",
      external_property_id: result.externalPropertyId,
      property_model: propertyModel,
      property_type: propertyTypeInput,
      sync_status: "created",
      last_synced_at: new Date().toISOString(),
      metadata: {
        ...((existingChannelProperty?.metadata as Record<string, unknown> | null) ?? {}),
        ...metadataPatch,
      },
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("channel_properties")
      .upsert(upsertPayload as never, { onConflict: "family_id,provider_code" });

    if (upsertError) {
      throw upsertError;
    }

    await logCreatePropertyEvent({
      supabase,
      familyId,
      status: "success",
      message: result.message,
      payload: {
        environment: result.environment,
        endpoint: result.endpoint,
        http_status: result.httpStatus,
        external_property_id: result.externalPropertyId,
        selected_family_id: familyId,
        selected_property_id: familyId,
        resolver_debug: resolved.debugSummary,
        resolved_sources: resolved.sources,
        payload_summary: result.payloadSummary,
        group_fetch: {
          ok: groupsResult.ok,
          count: groupsResult.groups.length,
          selected_group_id: selectedGroupId,
        },
      },
    });

    const bootstrap = await bootstrapChannexRoomsAndRates(
      supabase,
      request,
      familyId,
      authorizedResource.hostUserId ?? null,
      authorizedResource.isAdmin ? "admin" : "host"
    );

    return NextResponse.json({
      ok: true,
      status: "created",
      externalPropertyId: result.externalPropertyId,
      message: recoveredFromStaleMapping
        ? "Saved Channex property was deleted or is no longer accessible. Recreated the connection in Channex staging."
        : result.message,
      payloadSummary: result.payloadSummary,
      bootstrap,
    });
  } catch (error) {
    console.error("[host.pro.channel.channex.property] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "Failed to create Channex staging property.",
      },
      { status: 500 }
    );
  }
}
