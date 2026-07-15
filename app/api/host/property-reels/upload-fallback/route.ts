import { NextResponse } from "next/server";

import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { uploadFileToR2 } from "@/lib/r2-upload";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { validateHostReelFile } from "@/lib/host-reel-shared";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractStorageKey(publicUrl: string): string {
  const publicBase = String(process.env.R2_PUBLIC_URL ?? "").trim().replace(/\/$/, "");
  if (publicBase && publicUrl.startsWith(`${publicBase}/`)) {
    return publicUrl.slice(publicBase.length + 1);
  }

  try {
    const { pathname } = new URL(publicUrl);
    return pathname.replace(/^\/+/, "");
  } catch {
    return publicUrl;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const familyId = asString(formData.get("familyId"));
    const file = formData.get("file");

    if (!familyId) {
      return NextResponse.json({ error: "Family ID is required before uploading a host reel." }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a valid host reel video before uploading." }, { status: 400 });
    }

    const validationError = validateHostReelFile({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const access = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!access?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const publicUrl = await uploadFileToR2(file, `property-media/${access.familyId}/reels`);

    return NextResponse.json({
      ok: true,
      publicUrl,
      storageKey: extractStorageKey(publicUrl),
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to upload the host reel." },
      { status: 500 }
    );
  }
}
