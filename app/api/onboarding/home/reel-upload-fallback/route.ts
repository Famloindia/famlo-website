import { NextResponse } from "next/server";

import { uploadFileToR2 } from "@/lib/r2-upload";
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
    const draftId = asString(formData.get("draftId"));
    const file = formData.get("file");

    if (!draftId) {
      return NextResponse.json({ error: "Draft ID is required before uploading a host reel." }, { status: 400 });
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

    const publicUrl = await uploadFileToR2(file, `host-reels/${draftId}`);

    return NextResponse.json({
      ok: true,
      hostReelStorageKey: extractStorageKey(publicUrl),
      hostReelPublicUrl: publicUrl,
      hostReelMimeType: file.type,
      hostReelSizeBytes: file.size,
      hostReelUploadedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to upload the host reel." },
      { status: 500 }
    );
  }
}
