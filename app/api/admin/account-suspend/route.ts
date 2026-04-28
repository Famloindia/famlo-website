// app/api/admin/account-suspend/route.ts
import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { hasValidAdminSession, verifyAdminPassword } from "@/lib/admin-auth";
import { logAuditAction } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId, action, adminPassword } = await request.json();

    if (!verifyAdminPassword(adminPassword)) {
      return NextResponse.json({ error: "Invalid admin password" }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();
    const newStatus = action === "suspend" ? "suspended" : "active";

    // Update user status in DB
    await supabase.from("users").update({ kyc_status: newStatus }).eq("id", userId);

    // Invalidate all active Supabase sessions for this user
    // This revokes all JWT tokens issued to this user
    if (action === "suspend") {
      await supabase.auth.admin.signOut(userId);
    }

    // Immutable audit log
    await logAuditAction({
      actorId: "system-admin",
      actorRole: "admin",
      actionType: action === "suspend" ? "suspend" : "resume",
      targetUserId: userId,
      resourceType: "user_account",
      newValue: { kyc_status: newStatus }
    });

    return NextResponse.json({ success: true, status: newStatus });
  } catch (err) {
    console.error("Account suspend failed:", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
