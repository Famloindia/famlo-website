import { NextRequest, NextResponse } from "next/server";

import { generateIcs, loadCanonicalCalendar } from "@/lib/calendar";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const ownerType = searchParams.get("ownerType") || "host";
    const ownerId = searchParams.get("ownerId") || "";
    const from = searchParams.get("from") || new Date().toISOString().split("T")[0] || "";
    const to = searchParams.get("to") || new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0] || "";

    if (!ownerId) {
      return NextResponse.json({ error: "ownerId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { ownerType, ownerId });
    if (!hostAccess) {
      return NextResponse.json({ error: "You do not have access to this calendar." }, { status: 403 });
    }
    const events = await loadCanonicalCalendar(supabase, { ownerType, ownerId, from, to });
    const ics = generateIcs(events);

    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"famlo-${ownerType}-${ownerId}.ics\"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export calendar." },
      { status: 500 }
    );
  }
}
