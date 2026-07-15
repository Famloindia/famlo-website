import { NextRequest, NextResponse } from "next/server";

import { hasReadOnlyAdminAccess } from "@/lib/admin-auth";
import { compareBookingListWithIndex } from "@/lib/booking-calendar-index";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const hasAccess = await hasReadOnlyAdminAccess();
    if (!hasAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const familyId = String(request.nextUrl.searchParams.get("familyId") ?? "").trim();
    const dateFrom = String(request.nextUrl.searchParams.get("dateFrom") ?? "").trim() || null;
    const dateTo = String(request.nextUrl.searchParams.get("dateTo") ?? "").trim() || null;

    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const comparison = await compareBookingListWithIndex(supabase, {
      familyId,
      dateFrom,
      dateTo,
    });

    return NextResponse.json({ ok: true, ...comparison });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to validate booking_calendar_index.",
      },
      { status: 500 }
    );
  }
}
