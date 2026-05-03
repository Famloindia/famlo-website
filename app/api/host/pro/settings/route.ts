import { NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/supabase";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import {
  buildHostProSettingsUpsert,
  loadHostProSettings,
  sanitizeHostProSettingsInput,
} from "@/lib/host-pro-settings";

type SettingsRequestBody = {
  familyId?: string;
  propertyModel?: string | null;
  propertyType?: string | null;
  timezone?: string | null;
  currency?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  defaultMealPlan?: string | null;
  standardRatePlanName?: string | null;
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

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as SettingsRequestBody;
    const familyId = asString(body.familyId);

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });

    if (!authorizedResource?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentSettings = await loadHostProSettings(supabase, familyId);
    const sanitizedInput = sanitizeHostProSettingsInput({
      propertyModel: body.propertyModel !== undefined ? body.propertyModel : currentSettings.propertyModel,
      propertyType: body.propertyType !== undefined ? body.propertyType : currentSettings.propertyType,
      timezone: body.timezone !== undefined ? body.timezone : currentSettings.timezone,
      currency: body.currency !== undefined ? body.currency : currentSettings.currency,
      checkInTime: body.checkInTime !== undefined ? body.checkInTime : currentSettings.checkInTime,
      checkOutTime: body.checkOutTime !== undefined ? body.checkOutTime : currentSettings.checkOutTime,
      defaultMealPlan: body.defaultMealPlan !== undefined ? body.defaultMealPlan : currentSettings.defaultMealPlan,
      standardRatePlanName: body.standardRatePlanName !== undefined ? body.standardRatePlanName : currentSettings.standardRatePlanName,
      otaTitle: body.otaTitle !== undefined ? body.otaTitle : currentSettings.otaTitle,
      contactEmail: body.contactEmail !== undefined ? body.contactEmail : currentSettings.contactEmail,
      contactPhone: body.contactPhone !== undefined ? body.contactPhone : currentSettings.contactPhone,
      website: body.website !== undefined ? body.website : currentSettings.website,
      country: body.country !== undefined ? body.country : currentSettings.country,
      state: body.state !== undefined ? body.state : currentSettings.state,
      city: body.city !== undefined ? body.city : currentSettings.city,
      postalCode: body.postalCode !== undefined ? body.postalCode : currentSettings.postalCode,
      addressLine: body.addressLine !== undefined ? body.addressLine : currentSettings.addressLine,
      latitude: body.latitude !== undefined ? body.latitude : currentSettings.latitude,
      longitude: body.longitude !== undefined ? body.longitude : currentSettings.longitude,
      propertyDescription: body.propertyDescription !== undefined ? body.propertyDescription : currentSettings.propertyDescription,
      checkInInstructions: body.checkInInstructions !== undefined ? body.checkInInstructions : currentSettings.checkInInstructions,
      houseRules: body.houseRules !== undefined ? body.houseRules : currentSettings.houseRules,
      cancellationPolicyLabel: body.cancellationPolicyLabel !== undefined ? body.cancellationPolicyLabel : currentSettings.cancellationPolicyLabel,
    });

    const nowIso = new Date().toISOString();
    const metadataPatch = authorizedResource.isAdmin
      ? { updated_by: "admin", updated_via: "host_pro_settings_api" }
      : {
          updated_by: "host",
          updated_via: "host_pro_settings_api",
          updated_by_host_user_id: authorizedResource.hostSession?.hostUserId ?? null,
        };

    const payload = buildHostProSettingsUpsert(familyId, sanitizedInput, {
      existingMetadata: currentSettings.metadata,
      metadataPatch,
      nowIso,
    });

    const { error: upsertError } = await supabase
      .from("host_pro_settings")
      .upsert(payload as never, { onConflict: "family_id" });

    if (upsertError) {
      throw upsertError;
    }

    const savedSettings = await loadHostProSettings(supabase, familyId);

    return NextResponse.json({
      success: true,
      settings: savedSettings,
    });
  } catch (error) {
    console.error("[host.pro.settings] save failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save Pro settings." },
      { status: 500 }
    );
  }
}
