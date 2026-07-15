import { NextRequest, NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/admin-auth";
import { buildHostBookingStatementDocument } from "@/lib/booking-platform";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const bookingId = String(request.nextUrl.searchParams.get("bookingId") ?? "").trim();
    const shouldDownload = request.nextUrl.searchParams.get("download") === "1";
    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    let isAdmin = false;
    try {
      isAdmin = await hasValidAdminSession();
    } catch {
      isAdmin = false;
    }

    if (!isAdmin) {
      const { data: booking, error: bookingError } = await supabase
        .from("bookings_v2")
        .select("id,host_id")
        .eq("id", bookingId)
        .maybeSingle();
      if (bookingError) throw bookingError;
      if (!booking) {
        return NextResponse.json({ error: "Booking not found." }, { status: 404 });
      }

      const hostAccess = await resolveAuthorizedHostResource(supabase, request, {
        hostId: typeof booking.host_id === "string" ? booking.host_id : null,
      });

      if (!hostAccess) {
        return NextResponse.json({ error: "You do not have access to this host statement." }, { status: 403 });
      }
    }

    const document = await buildHostBookingStatementDocument(supabase, bookingId);
    return new NextResponse(document.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...(shouldDownload
          ? {
              "Content-Disposition": `attachment; filename="famlo-host-statement-${bookingId}.html"`,
            }
          : {}),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build host statement." },
      { status: 500 }
    );
  }
}
