// app/api/admin/disputes/resolve/route.ts
import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { logAuditAction } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { disputeId, action, splitPct, note } = await request.json();
    const supabase = createAdminSupabaseClient();

    if (!disputeId || !action) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data: dispute } = await supabase.from("disputes").select("id, status, payout_frozen").eq("id", disputeId).single();
    if (!dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });

    let updateData: any = { 
      status: action === "freeze" ? "frozen" : "resolved",
      resolution: action,
      resolution_note: note,
      resolved_by: "system-admin",
      resolved_at: new Date().toISOString()
    };

    if (action === "freeze") {
      updateData.payout_frozen = true;
    } else if (action === "release_host" || action === "refund_guest" || action === "custom_split") {
      updateData.payout_frozen = false;
    }

    // Update the dispute record
    await supabase.from("disputes").update(updateData).eq("id", disputeId);

    // TODO: Phase 2 - Wire to Razorpay Route for actual fund movement

    // Log the action in audit_log
    await logAuditAction({
      actorId: "system-admin",
      actorRole: "admin",
      actionType: action === "freeze" ? "payout_freeze" : "payout_release",
      targetUserId: disputeId,
      resourceType: "dispute",
      reason: note,
      newValue: { ...updateData, splitPct }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Dispute resolution failed:", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
