import { NextRequest, NextResponse } from "next/server";

import { generateIcs, loadCanonicalCalendar } from "@/lib/calendar";
import { resolveCalendarExportByToken } from "@/lib/calendar-export";
import { createAdminSupabaseClient } from "@/lib/supabase";

type RouteContext = {
  params: Promise<{
    hostId: string;
    token: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { hostId, token } = await context.params;
    const cleanHostId = String(hostId ?? "").trim();
    const cleanToken = String(token ?? "").replace(/\.ics$/i, "").trim();
    const from = request.nextUrl.searchParams.get("from") || new Date().toISOString().split("T")[0] || "";
    const to =
      request.nextUrl.searchParams.get("to") || new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0] || "";

    if (!cleanHostId || !cleanToken) {
      return NextResponse.json({ error: "Calendar not found." }, { status: 404 });
    }

    const supabase = createAdminSupabaseClient();
    const resolved = await resolveCalendarExportByToken(supabase, cleanToken);
    if (!resolved || resolved.ownerType !== "host" || resolved.ownerId !== cleanHostId) {
      return NextResponse.json({ error: "Calendar not found." }, { status: 404 });
    }

    const events = await loadCanonicalCalendar(supabase, {
      ownerType: resolved.ownerType,
      ownerId: resolved.ownerId,
      from,
      to,
    });
    const ics = generateIcs(events, { summary: "Reserved" });

    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="famlo-calendar.ics"',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export calendar." },
      { status: 500 }
    );
  }
}
