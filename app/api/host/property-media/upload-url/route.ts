import { NextResponse } from "next/server";

import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createPropertyMediaUploadTarget } from "@/lib/property-media-upload";
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
      familyId?: string;
      fileName?: string;
      fileType?: string;
      fileSize?: number | string;
    };

    const familyId = asString(body.familyId);
    if (!familyId) {
      return NextResponse.json({ error: "Family ID is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const access = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!access?.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const target = await createPropertyMediaUploadTarget({
      familyId: access.familyId,
      fileName: asString(body.fileName),
      mimeType: asString(body.fileType),
      sizeBytes: asNumber(body.fileSize),
    });

    return NextResponse.json({ ok: true, ...target });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to prepare gallery upload." },
      { status: 500 }
    );
  }
}
