import { NextResponse } from "next/server";

import { createHostReelUploadTarget } from "@/lib/host-reel";
import { createAdminSupabaseClient } from "@/lib/supabase";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      draftId?: string;
      fileName?: string;
      fileType?: string;
      fileSize?: number | string;
    };

    const draftId = asString(body.draftId);
    const fileName = asString(body.fileName);
    const fileType = asString(body.fileType);
    const fileSize = asNumber(body.fileSize);

    if (!draftId) {
      return NextResponse.json({ error: "Draft ID is required before uploading a host reel." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: draft, error: draftError } = await supabase
      .from("host_onboarding_drafts")
      .select("id,family_id")
      .eq("id", draftId)
      .maybeSingle();

    if (draftError) {
      throw draftError;
    }

    if (!draft?.id) {
      return NextResponse.json({ error: "Host onboarding draft not found." }, { status: 404 });
    }

    const target = await createHostReelUploadTarget({
      draftId,
      fileName,
      mimeType: fileType,
      sizeBytes: fileSize,
    });

    console.info("[onboarding-host-reel] upload-url:success", {
      draftId,
      familyId: typeof draft?.family_id === "string" ? draft.family_id : null,
      storageKey: target.storageKey,
      publicUrl: target.publicUrl,
    });

    return NextResponse.json({
      ok: true,
      familyId: typeof draft?.family_id === "string" ? draft.family_id : null,
      ...target,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to prepare host reel upload." },
      { status: 500 }
    );
  }
}
