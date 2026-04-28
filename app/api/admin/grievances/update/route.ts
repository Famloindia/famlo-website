// app/api/admin/grievances/update/route.ts
import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { logAuditAction } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { grievanceId, status } = await request.json();
    const supabase = createAdminSupabaseClient();

    if (!grievanceId || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const updateData: any = { status };
    if (status === "acknowledged") updateData.acknowledged_at = new Date().toISOString();
    if (status === "resolved") updateData.resolved_at = new Date().toISOString();

    // Update the grievance record
    await supabase.from("grievances").update(updateData).eq("id", grievanceId);

    // Log the action in audit_log
    await logAuditAction({
      actorId: "system-admin",
      actorRole: "admin",
      actionType: "grievance_status_update",
      targetUserId: grievanceId,
      resourceType: "grievance",
      newValue: { status }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Grievance update failed:", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
