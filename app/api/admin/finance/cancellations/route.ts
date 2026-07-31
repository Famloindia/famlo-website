import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { resolveAdminAccessContext } from "@/lib/admin-auth";
import { finalizeApprovedCancellationSideEffects } from "@/lib/cancellations/service";
import { listCancellationCases } from "@/lib/cancellations/operations";
import { approveAndMaybeInitiateRefund } from "@/lib/finance/refund-requests";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(): Promise<NextResponse> {
  const access = await resolveAdminAccessContext();
  if (!access || (access.actorRole !== "super_admin" && !access.permissions.includes("finance"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ cases: await listCancellationCases(createAdminSupabaseClient()) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load cancellation requests." }, { status: 500 });
  }
}
export async function POST(request: NextRequest): Promise<NextResponse> {
  const access = await resolveAdminAccessContext();
  if (!access || access.actorRole !== "super_admin") return NextResponse.json({ error: "Admin finance approval is required." }, { status: 403 });
  try {
    const body = await request.json() as { requestId?: string; decision?: "approve" | "reject"; approvedRefundAmountMinor?: number; notes?: string; overrideReason?: string };
    if (!body.requestId || !body.decision) return NextResponse.json({ error: "requestId and decision are required." }, { status: 400 });
    const approvedMinor = body.decision === "approve" ? Number(body.approvedRefundAmountMinor ?? 0) : 0;
    if (!Number.isSafeInteger(approvedMinor) || approvedMinor < 0) return NextResponse.json({ error: "Refund amount must be integer minor units." }, { status: 400 });
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase.rpc("decide_booking_cancellation_v1", {
      p_request_id: body.requestId,
      p_decision: body.decision,
      p_approved_refund_minor: approvedMinor,
      p_admin_actor_id: access.actorId ?? "system-admin",
      p_admin_notes: String(body.notes ?? "").trim().slice(0, 4_000),
      p_override_reason: String(body.overrideReason ?? "").trim().slice(0, 1_000),
      p_idempotency_key: `admin:${body.decision}:${body.requestId}:${randomUUID()}`,
    });
    if (error) throw error;
    const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
    let providerResult: Record<string, unknown> | null = null;
    if (body.decision === "approve" && Boolean(result.changed)) {
      await finalizeApprovedCancellationSideEffects(supabase, {
        cancellationRequestId: body.requestId,
        bookingId: String(result.booking_id),
        actorId: access.actorId ?? "system-admin",
      });
    }
    if (body.decision === "approve" && result.refund_request_id) {
      try {
        providerResult = await approveAndMaybeInitiateRefund(supabase, { refundRequestId: String(result.refund_request_id), actorUserId: null });
        await supabase.from("cancellation_requests_v2").update({ status: providerResult.status === "processing" ? "refund_processing" : "refund_pending", updated_at: new Date().toISOString() } as never).eq("id", body.requestId);
      } catch (providerError) {
        await supabase.from("cancellation_requests_v2").update({ status: "refund_failed", updated_at: new Date().toISOString() } as never).eq("id", body.requestId);
        providerResult = { status: "retry_required", error: "Refund submission needs reconciliation." };
      }
    }
    return NextResponse.json({ success: true, cancellationRequest: result, providerResult });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not decide cancellation request.";
    return NextResponse.json({ error: message }, { status: /EXCEEDS|OVERRIDE|FINAL|CANCELLABLE/.test(message) ? 409 : 500 });
  }
}
