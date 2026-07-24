import { NextResponse } from "next/server";

import {
  applyHostBookingDecision,
  HostBookingDecisionError,
  type HostBookingDecision,
} from "@/lib/host-booking-decision";
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

    const resolvedHostId = hostAccess.hostId;
    if (!resolvedHostId) {
      return NextResponse.json({ error: "Host profile not found for this listing." }, { status: 404 });
    }
    const decision: HostBookingDecision = status === "rejected" ? "decline" : "approve";
    const requestIdempotencyKey = request.headers.get("idempotency-key")?.trim().slice(0, 160);

    const result = await applyHostBookingDecision(supabase, {
      bookingId,
      familyId,
      hostId: resolvedHostId,
      decision,
      source: "dashboard",
      actor: {
        userId: hostAccess.hostUserId,
        role: hostAccess.isAdmin ? "admin" : "host",
      },
      idempotencyKey: requestIdempotencyKey || `dashboard:${bookingId}:${decision}`,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Host booking status update failed:", error);
    if (error instanceof HostBookingDecisionError) {
      const status = error.code === "BOOKING_NOT_FOUND" ? 404 : error.code === "HOST_MISMATCH" || error.code === "FAMILY_MISMATCH" ? 403 : 409;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update booking status." },
      { status: 500 }
    );
  }
}
