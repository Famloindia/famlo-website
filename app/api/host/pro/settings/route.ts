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
      propertyModel: body.propertyModel ?? null,
      propertyType: body.propertyType ?? null,
      timezone: body.timezone ?? null,
      currency: body.currency ?? null,
      checkInTime: body.checkInTime ?? null,
      checkOutTime: body.checkOutTime ?? null,
      defaultMealPlan: body.defaultMealPlan ?? null,
      standardRatePlanName: body.standardRatePlanName ?? null,
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
