import { NextRequest, NextResponse } from "next/server";

import {
  consumeBookingActionToken,
  markBookingActionTokensUsed,
  resolveHostActionFailureUrl,
  resolveHostActionSuccessUrl,
  type BookingActionType,
} from "@/lib/booking-action-tokens";
import { applyHostBookingStatusUpdate } from "@/lib/host-booking-status";
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

    const updated = await applyHostBookingStatusUpdate(supabase, {
      bookingId: resolution.bookingId,
      familyId: resolution.familyId,
      hostId: resolution.hostId,
      status: resolution.nextStatus,
    });

    if (!updated) {
      return redirect(resolveHostActionFailureUrl("invalid"));
    }

    await markBookingActionTokensUsed(supabase, {
      token,
      bookingId: resolution.bookingId,
    });

    return redirect(resolveHostActionSuccessUrl(resolution.nextStatus));
  } catch (error) {
    console.error("[bookings.host-action] failed", error);
    return redirect(resolveHostActionFailureUrl("failed"));
  }
}
