import { NextRequest, NextResponse } from "next/server";

import {
  consumeBookingActionToken,
  markBookingActionTokensUsed,
  resolveHostActionFailureUrl,
  resolveHostActionSuccessUrl,
  type BookingActionType,
} from "@/lib/booking-action-tokens";
import { applyHostBookingDecision, HostBookingDecisionError } from "@/lib/host-booking-decision";
import { createAdminSupabaseClient } from "@/lib/supabase";

function isBookingActionType(value: string): value is BookingActionType {
  return value === "accept_booking" || value === "reject_booking";
}

function redirect(url: string): NextResponse {
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const token = String(formData.get("token") ?? "").trim();
    const action = String(formData.get("action") ?? "").trim();

    if (!token || !isBookingActionType(action)) {
      return redirect(resolveHostActionFailureUrl("invalid_request"));
    }

    const supabase = createAdminSupabaseClient();
    const resolution = await consumeBookingActionToken(supabase, { token, action });

    if (resolution.status !== "ready") {
      return redirect(resolveHostActionFailureUrl(resolution.status));
    }

    let resolvedHostId = resolution.hostId;
    let resolvedFamilyId = resolution.familyId;
    let resolvedHostUserId = resolution.hostUserId;
    if (!resolvedHostId) {
      const { data: booking, error: bookingError } = await supabase
        .from("bookings_v2")
        .select("host_id,hosts(user_id,legacy_family_id)")
        .eq("id", resolution.bookingId)
        .maybeSingle();
      if (bookingError) throw bookingError;
      const host = Array.isArray(booking?.hosts) ? booking.hosts[0] : booking?.hosts;
      resolvedHostId = typeof booking?.host_id === "string" ? booking.host_id : null;
      resolvedFamilyId = resolvedFamilyId ?? (typeof host?.legacy_family_id === "string" ? host.legacy_family_id : null);
      resolvedHostUserId = resolvedHostUserId ?? (typeof host?.user_id === "string" ? host.user_id : null);
    }
    if (!resolvedHostId) {
      return redirect(resolveHostActionFailureUrl("invalid"));
    }

    const decision = resolution.nextStatus === "rejected" ? "decline" : "approve";
    await applyHostBookingDecision(supabase, {
      bookingId: resolution.bookingId,
      familyId: resolvedFamilyId,
      hostId: resolvedHostId,
      decision,
      source: "signed_link",
      actor: {
        userId: resolvedHostUserId,
        role: "host",
      },
      idempotencyKey: `signed_link:${resolution.bookingId}:${decision}`,
    });

    await markBookingActionTokensUsed(supabase, {
      token,
      bookingId: resolution.bookingId,
    });

    return redirect(resolveHostActionSuccessUrl(resolution.nextStatus));
  } catch (error) {
    console.error("[bookings.host-action] failed", error);
    if (error instanceof HostBookingDecisionError) {
      return redirect(
        resolveHostActionFailureUrl(
          error.code === "CONFLICTING_DECISION" || error.code === "INVALID_STATE"
            ? "already_resolved"
            : error.code.toLowerCase()
        )
      );
    }
    return redirect(resolveHostActionFailureUrl("failed"));
  }
}
