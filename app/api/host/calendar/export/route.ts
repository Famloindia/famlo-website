import { NextRequest, NextResponse } from "next/server";

import { generateIcs, loadCanonicalCalendar } from "@/lib/calendar";
import { resolveCalendarExportByToken } from "@/lib/calendar-export";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get("token") || "";
    let ownerType = searchParams.get("ownerType") || "host";
    let ownerId = searchParams.get("ownerId") || "";
    const from = searchParams.get("from") || new Date().toISOString().split("T")[0] || "";
    const to = searchParams.get("to") || new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0] || "";

    const supabase = createAdminSupabaseClient();
    if (token) {
      const resolved = await resolveCalendarExportByToken(supabase, token);
      if (!resolved) {
        return NextResponse.json({ error: "Calendar not found." }, { status: 404 });
      }
      ownerType = resolved.ownerType;
      ownerId = resolved.ownerId;
    } else {
      if (!ownerId) {
        return NextResponse.json({ error: "ownerId is required." }, { status: 400 });
      }

      const hostAccess = await resolveAuthorizedHostResource(supabase, request, { ownerType, ownerId });
      if (!hostAccess) {
        return NextResponse.json({ error: "You do not have access to this calendar." }, { status: 403 });
      }
    }

    const events = await loadCanonicalCalendar(supabase, { ownerType, ownerId, from, to });
    const ics = generateIcs(events, token ? { summary: "Reserved" } : undefined);

    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": token
          ? 'inline; filename="famlo-calendar.ics"'
          : `attachment; filename=\"famlo-${ownerType}-${ownerId}.ics\"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export calendar." },
      { status: 500 }
    );
  }
}
