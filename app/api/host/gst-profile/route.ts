import { NextResponse } from "next/server";

import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { isValidGstin, normalizeGstin } from "@/lib/host-onboarding-legal";
import { mapHostGstProfileRow, upsertHostGstProfile } from "@/lib/host-gst-profile";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const familyId = asString(url.searchParams.get("familyId"));
    if (!familyId) {
      return NextResponse.json({ error: "Family ID is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const access = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!access?.familyId || !access.hostId || !access.hostUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data } = await supabase
      .from("host_gst_profiles")
      .select("*")
      .eq("host_id", access.hostId)
      .maybeSingle();

    if (data) {
      return NextResponse.json({ profile: mapHostGstProfileRow((data ?? null) as JsonRecord | null) });
    }

    const [{ data: family }, { data: latestDraft }] = await Promise.all([
      supabase.from("families").select("gstin").eq("id", access.familyId).maybeSingle(),
      supabase
        .from("host_onboarding_drafts")
        .select("gstin,compliance,payload")
        .eq("family_id", access.familyId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const payload =
      latestDraft?.payload && typeof latestDraft.payload === "object" && !Array.isArray(latestDraft.payload)
        ? (latestDraft.payload as JsonRecord)
        : {};
    const compliance =
      latestDraft?.compliance && typeof latestDraft.compliance === "object" && !Array.isArray(latestDraft.compliance)
        ? (latestDraft.compliance as JsonRecord)
        : {};
    const gstin =
      normalizeGstin((family as JsonRecord | null)?.gstin) ||
      normalizeGstin((latestDraft as JsonRecord | null)?.gstin) ||
      normalizeGstin(payload.gstin) ||
      normalizeGstin(payload.gstNumber) ||
      normalizeGstin(compliance.gstin) ||
      normalizeGstin(compliance.gstNumber);

    return NextResponse.json({
      profile: {
        id: null,
        hostId: access.hostId,
        userId: access.hostUserId,
        familyId: access.familyId,
        gstin,
        verificationStatus: gstin ? "pending_review" : "not_provided",
        rejectionReason: null,
        verifiedAt: null,
        createdAt: null,
        updatedAt: null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load GST profile." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      familyId?: string;
      gstin?: string;
    };
    const familyId = asString(body.familyId);
    const gstin = normalizeGstin(body.gstin);
    if (!familyId) {
      return NextResponse.json({ error: "Family ID is required." }, { status: 400 });
    }

    if (!isValidGstin(gstin)) {
      return NextResponse.json({ error: "Enter a valid GSTIN or leave it blank." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const access = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!access?.familyId || !access.hostId || !access.hostUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await upsertHostGstProfile(supabase, {
      hostId: access.hostId,
      userId: access.hostUserId,
      familyId: access.familyId,
      gstin,
    });

    await Promise.all([
      supabase.from("families").update({ gstin: gstin || null } as never).eq("id", access.familyId),
      supabase
        .from("host_onboarding_drafts")
        .update({ gstin: gstin || null } as never)
        .eq("family_id", access.familyId),
    ]);

    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update GST profile." },
      { status: 500 }
    );
  }
}
