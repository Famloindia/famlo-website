import { NextRequest, NextResponse } from "next/server";

import { requestHostDeclineCancellation } from "@/lib/cancellations/service";
import { applyHostBookingDecision } from "@/lib/host-booking-decision";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { verifyTeamSession } from "@/lib/team-auth";

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const member = await verifyTeamSession();
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = await request.json() as { bookingId?: string; outcome?: "accepted" | "declined" | "unreachable" };
    if (!body.bookingId || !body.outcome) return NextResponse.json({ error: "bookingId and outcome are required." }, { status: 400 });
    const supabase = createAdminSupabaseClient();
    const { data: booking, error } = await supabase.from("bookings_v2").select("id,host_id,status").eq("id", body.bookingId).maybeSingle();
    if (error) throw error;
    if (!booking?.host_id || booking.status !== "pending_host_approval") throw new Error("Booking is no longer awaiting host approval.");
    if (body.outcome === "accepted") {
      await applyHostBookingDecision(supabase, {
        bookingId: booking.id, hostId: booking.host_id, decision: "approve", source: "dashboard",
        actor: { userId: member.id, role: "system" }, idempotencyKey: `service-call-accept:${booking.id}`,
      });
    } else {
      await requestHostDeclineCancellation(supabase, {
        bookingId: booking.id, hostId: booking.host_id, actorId: member.id,
        idempotencyKey: `service-call-${body.outcome}:${booking.id}`,
        reason: body.outcome === "declined" ? "host_declined" : "host_unresponsive",
      });
    }
    await supabase.from("host_approval_sla_incidents").update({
      response_status: body.outcome, response_recorded_at: new Date().toISOString(), response_recorded_by: member.id, updated_at: new Date().toISOString(),
    } as never).eq("booking_id", booking.id).eq("response_status", "pending");
    if (body.outcome === "unreachable") await supabase.from("bookings_v2").update({ host_response_status: "HOST_UNRESPONSIVE", host_response_recorded_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never).eq("id", booking.id);
    return NextResponse.json({ success: true, outcome: body.outcome });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not record host call outcome." }, { status: 409 });
  }
}
