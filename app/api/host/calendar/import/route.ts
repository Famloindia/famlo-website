import { NextRequest, NextResponse } from "next/server";

import { syncImportedCalendar } from "@/lib/booking-platform";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      ownerType?: string;
      ownerId?: string;
      provider?: string;
      sourceLabel?: string;
      externalUrl?: string | null;
      icsContent?: string;
    };

    const ownerType = String(body.ownerType ?? "host").trim();
    const ownerId = String(body.ownerId ?? "").trim();
    const provider = String(body.provider ?? "manual_ics").trim();
    const sourceLabel = String(body.sourceLabel ?? provider).trim();
    const icsContent = String(body.icsContent ?? "").trim();

    if (!ownerId || !icsContent) {
      return NextResponse.json({ error: "ownerId and icsContent are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { ownerType, ownerId });
    if (!hostAccess) {
      return NextResponse.json({ error: "You do not have access to this calendar." }, { status: 403 });
    }
    const result = await syncImportedCalendar(supabase, {
      ownerType,
      ownerId,
      provider,
      sourceLabel,
      externalUrl: body.externalUrl ?? null,
      icsContent,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import ICS feed." },
      { status: 500 }
    );
  }
}
