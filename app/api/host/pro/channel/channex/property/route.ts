import { NextResponse } from "next/server";

import { createChannexProperty, fetchChannexGroups, getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import { ensureChannexMutationAllowed } from "@/lib/channel-providers/channex/mutation-guard";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { loadHostProSettings } from "@/lib/host-pro-settings";
import { createAdminSupabaseClient } from "@/lib/supabase";

type CreateBody = {
  familyId?: string;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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

    if (!authorizedResource?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await loadHostProAccess(supabase, familyId);
    if (!access.allowed) {
      return NextResponse.json({ error: "Famlo Pro is not active for this property." }, { status: 403 });
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

    const [{ data: family }, settings, { data: existingChannelProperty }] = await Promise.all([
      supabase
        .from("families")
        .select("id,name,property_name")
        .eq("id", familyId)
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
    if (existingExternalPropertyId) {
      return NextResponse.json({
        ok: true,
        status: "already_created",
        externalPropertyId: existingExternalPropertyId,
        message: "already_created",
      });
    }

    const title =
      asString(settings.otaTitle) ??
      asString((family as Record<string, unknown> | null)?.property_name) ??
      asString((family as Record<string, unknown> | null)?.name);
    const propertyType = mapChannexPropertyType(settings.propertyModel, settings.propertyType);
    const currency = asUpperToken(asString(settings.currency));
    const country = resolveCountryAlpha2(asString(settings.country));
    const city = asString(settings.city);
    const addressLine = asString(settings.addressLine);
    const timezone = asString(settings.timezone);
    const checkInTime = asString(settings.checkInTime);
    const checkOutTime = asString(settings.checkOutTime);
    const contactEmail = asString(settings.contactEmail);
    const contactPhone = asString(settings.contactPhone);
    const missingFields: string[] = [];
    const invalidFields: string[] = [];

    addMissing(missingFields, title, "ota_title_or_property_name");
    addMissing(missingFields, asString(settings.propertyModel), "property_model");
    addMissing(missingFields, asString(settings.propertyType), "property_type");
    addMissing(missingFields, settings.exists ? timezone : null, "timezone");
    addMissing(missingFields, settings.exists && currency && currency.length === 3 ? currency : null, "currency");
    addMissing(missingFields, settings.exists ? country : null, "country");
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
      const message = [
        missingFields.length > 0 ? `Complete these Famlo Pro fields before creating a Channex staging property: ${missingFields.join(", ")}.` : null,
        invalidFields.length > 0 ? `Fix these invalid fields: ${invalidFields.join(", ")}.` : null,
      ].filter(Boolean).join(" ");
      await logCreatePropertyEvent({
        supabase,
        familyId,
        status: "failed",
        message,
        payload: {
          environment: config.environment,
          stage: "pre_validation",
          missing_fields: missingFields,
          invalid_fields: invalidFields,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          status: "validation_failed",
          message,
          missingFields,
          invalidFields,
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
      zipCode: asString(settings.postalCode),
      country: country ?? "IN",
      state: asString(settings.state),
      city: city ?? "",
      address: addressLine ?? "",
      longitude: settings.longitude != null ? String(settings.longitude) : null,
      latitude: settings.latitude != null ? String(settings.latitude) : null,
      timezone: timezone ?? "Asia/Kolkata",
      propertyType: propertyType ?? "apartment",
      groupId: selectedGroupId,
      website: asString(settings.website),
      description: asString(settings.propertyDescription),
      importantInformation: buildImportantInformation({
        checkInTime,
        checkOutTime,
        checkInInstructions: asString(settings.checkInInstructions),
        houseRules: asString(settings.houseRules),
        cancellationPolicyLabel: asString(settings.cancellationPolicyLabel),
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
      property_model: settings.propertyModel,
      property_type: settings.propertyType,
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
        payload_summary: result.payloadSummary,
        group_fetch: {
          ok: groupsResult.ok,
          count: groupsResult.groups.length,
          selected_group_id: selectedGroupId,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      status: "created",
      externalPropertyId: result.externalPropertyId,
      message: result.message,
      payloadSummary: result.payloadSummary,
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
