import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  buildCancellationPolicyForContext,
  loadCancellationContext,
  requestGuestCancellation,
} from "@/lib/cancellations/service";
import type { CancellationReason } from "@/lib/cancellations/policy";
import { getErrorMessage } from "@/lib/error-utils";
import { resolveStrictAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";

const GUEST_REASONS = new Set<CancellationReason>([
  "guest_change_of_plans",
  "guest_travel_issue",
  "guest_other",
]);

type CancellationBody = {
  bookingId?: string;
  action?: "quote" | "request" | "withdraw";
  reason?: CancellationReason;
  notes?: string;
  cancellationRequestId?: string;
  idempotencyKey?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as CancellationBody;
    const bookingId = String(body.bookingId ?? "").trim();
    const action = body.action ?? "quote";
    const supabase = createAdminSupabaseClient();
    const authUser = await resolveStrictAuthenticatedUser(supabase, request);
    if (!authUser) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

    if (action === "withdraw") {
      const cancellationRequestId = String(body.cancellationRequestId ?? "").trim();
      if (!cancellationRequestId) return NextResponse.json({ error: "cancellationRequestId is required." }, { status: 400 });
      const { data, error } = await supabase.rpc("withdraw_booking_cancellation_v1", {
        p_request_id: cancellationRequestId,
        p_guest_user_id: authUser.id,
        p_idempotency_key: body.idempotencyKey ?? `withdraw:${cancellationRequestId}:${authUser.id}`,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return NextResponse.json({ success: true, cancellationRequest: row });
    }

    if (!bookingId) return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
    const context = await loadCancellationContext(supabase, bookingId);
    if (String(context.booking.user_id ?? "") !== authUser.id) {
      return NextResponse.json({ error: "You can only request cancellation for your own booking." }, { status: 403 });
    }
    const reason = GUEST_REASONS.has(body.reason as CancellationReason) ? body.reason as CancellationReason : "guest_other";
    const policy = buildCancellationPolicyForContext(context, reason);
    if (action === "quote") {
      return NextResponse.json({
        success: true,
        quote: {
          bookingAmountMinor: policy.grossPaidAmountMinor,
          refundableAmountMinor: policy.suggestedRefundAmountMinor,
          refundPercent: policy.refundPercent,
          refundRule: policy.rule,
          estimated: true,
        },
      });
    }
    if (action !== "request") return NextResponse.json({ error: "Unsupported cancellation action." }, { status: 400 });
    const result = await requestGuestCancellation(supabase, {
      bookingId,
      guestUserId: authUser.id,
      reason,
      notes: String(body.notes ?? "").trim().slice(0, 1_000),
      idempotencyKey: body.idempotencyKey ?? `guest-cancellation:${bookingId}:${randomUUID()}`,
    });
    return NextResponse.json({ success: true, cancellationRequest: result }, { status: result.created ? 201 : 200 });
  } catch (error) {
    const message = getErrorMessage(error, "Could not submit cancellation request.");
    const status = /NOT_FOUND/.test(message) ? 404 : /OWNERSHIP/.test(message) ? 403 : /CANCELLABLE|FINAL/.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
