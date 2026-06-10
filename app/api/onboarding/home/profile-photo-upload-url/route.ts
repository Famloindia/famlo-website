import { NextResponse } from "next/server";

import { createHostProfileUploadTarget } from "@/lib/host-profile-upload";
import { validateHostProfileDirectUpload } from "@/lib/host-profile-upload-shared";

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
      fileName?: string;
      fileType?: string;
      fileSize?: number | string;
    };

    const fileName = asString(body.fileName);
    const fileType = asString(body.fileType);
    const fileSize = asNumber(body.fileSize);
    const validationError = validateHostProfileDirectUpload({
      fileName,
      mimeType: fileType,
      sizeBytes: fileSize,
    });

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const target = await createHostProfileUploadTarget({
      fileName,
      mimeType: fileType,
      sizeBytes: fileSize,
    });

    return NextResponse.json({ ok: true, ...target });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to prepare profile photo upload." },
      { status: 500 }
    );
  }
}
