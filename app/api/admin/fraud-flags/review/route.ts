// app/api/admin/fraud-flags/review/route.ts
import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { logAuditAction } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { flagId, action } = await request.json();
    const supabase = createAdminSupabaseClient();

    if (!flagId || !action) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data: flag } = await supabase.from("fraud_flags").select("*").eq("id", flagId).single();
    if (!flag) return NextResponse.json({ error: "Fraud flag not found" }, { status: 404 });

    // Update flag status
    await supabase.from("fraud_flags").update({
      status: action,
      reviewed_by: "system-admin",
      reviewed_at: new Date().toISOString()
    }).eq("id", flagId);

    // If confirmed fraud, suspend both accounts
    if (action === "confirmed_fraud") {
      await supabase.from("users").update({ kyc_status: "suspended" }).in("id", [flag.user_id_a, flag.user_id_b]);
      
      // Revoke all active sessions for both users
      await supabase.auth.admin.signOut(flag.user_id_a);
      await supabase.auth.admin.signOut(flag.user_id_b);
    }

    // Log the review action
    await logAuditAction({
      actorId: "system-admin",
      actorRole: "admin",
      actionType: action === "confirmed_fraud" ? "fraud_confirmed" : "fraud_cleared",
      resourceType: "fraud_flag",
      newValue: { flagId, status: action, user_a: flag.user_id_a, user_b: flag.user_id_b }
    });

    return NextResponse.json({ success: true, status: action });
  } catch (err) {
    console.error("Fraud flag review failed:", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
