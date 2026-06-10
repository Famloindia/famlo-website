import { NextResponse } from "next/server";

import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createPropertyReelUploadTarget } from "@/lib/property-reel-upload";
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

type PropertyReelUploadUrlRouteDeps = {
  createAdminSupabaseClient: typeof createAdminSupabaseClient;
  resolveAuthorizedHostResource: typeof resolveAuthorizedHostResource;
  createPropertyReelUploadTarget: typeof createPropertyReelUploadTarget;
};

const defaultRouteDeps: PropertyReelUploadUrlRouteDeps = {
  createAdminSupabaseClient,
  resolveAuthorizedHostResource,
  createPropertyReelUploadTarget,
};

export function createPropertyReelUploadUrlRouteHandlers(
  deps: PropertyReelUploadUrlRouteDeps = defaultRouteDeps
) {
  return {
    async POST(request: Request): Promise<NextResponse> {
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

        const supabase = deps.createAdminSupabaseClient();
        const access = await deps.resolveAuthorizedHostResource(supabase, request, { familyId });
        if (!access?.familyId) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const target = await deps.createPropertyReelUploadTarget({
          familyId: access.familyId,
          fileName: asString(body.fileName),
          mimeType: asString(body.fileType),
          sizeBytes: asNumber(body.fileSize),
        });

        return NextResponse.json({ ok: true, ...target });
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Unable to prepare reel upload." },
          { status: 500 }
        );
      }
    },
  };
}
