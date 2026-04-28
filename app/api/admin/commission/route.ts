// app/api/admin/commission/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { logAuditAction } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);

    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId, newRate, oldRate } = await request.json();

    if (typeof newRate !== "number" || newRate < 0 || newRate > 40) {
      return NextResponse.json({ error: "Invalid commission rate. Must be between 0 and 40." }, { status: 400 });
    }

    if (typeof userId !== "string" || !userId.trim()) {
      return NextResponse.json({ error: "Valid userId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    // Write commission override — applied at checkout in real-time
    const { error: updateError } = await supabase
      .from("users")
      .update({ commission_rate_override: newRate })
      .eq("id", userId);

    if (updateError) {
      throw updateError;
    }

    // Immutable audit log entry
    await logAuditAction({
      actorId: "system-admin",
      actorRole: "admin",
      actionType: "commission_change",
      targetUserId: userId,
      resourceType: "commission_rate_override",
      oldValue: { rate: oldRate },
      newValue: { rate: newRate },
      reason: "manual_admin_update",
    });

    return NextResponse.json({ success: true, newRate });
  } catch (err) {
    console.error("Commission update failed:", err);
    return NextResponse.json({ error: "Failed to update commission rate" }, { status: 500 });
  }
}
