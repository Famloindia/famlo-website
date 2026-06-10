import { NextResponse } from "next/server";

import { applyHostBookingStatusUpdate } from "@/lib/host-booking-status";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

const ALLOWED_STATUSES = new Set(["accepted", "confirmed", "rejected"]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      bookingId?: string;
      familyId?: string;
      status?: string;
    };

    const bookingId = String(body.bookingId ?? "").trim();
    const familyId = String(body.familyId ?? "").trim();
    const status = String(body.status ?? "").trim();

    if (!bookingId || !familyId || !status) {
      return NextResponse.json({ error: "bookingId, familyId, and status are required." }, { status: 400 });
    }

    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: "Unsupported booking status." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (!hostAccess) {
      return NextResponse.json({ error: "You do not have access to this host listing." }, { status: 403 });
    }

    const { data: host } = await supabase
      .from("hosts")
      .select("id")
      .eq("legacy_family_id", familyId)
      .maybeSingle();
    const resolvedHostId = typeof host?.id === "string" ? host.id : null;

    const updated = await applyHostBookingStatusUpdate(supabase, {
      bookingId,
      familyId,
      hostId: resolvedHostId,
      status,
    });

    if (!updated) {
      return NextResponse.json({ error: "Booking not found for this listing." }, { status: 404 });
    }

    return NextResponse.json({ success: true, booking: updated });
  } catch (error) {
    console.error("Host booking status update failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update booking status." },
      { status: 500 }
    );
  }
}
