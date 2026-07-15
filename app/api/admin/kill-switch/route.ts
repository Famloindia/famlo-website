// app/api/admin/kill-switch/route.ts
import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { logAuditAction } from "@/lib/audit";
import { headers } from "next/headers";
import { getIpFromHeaders } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { activate, reason } = await request.json();

    if (!reason || reason.trim().length < 10) {
      return NextResponse.json({ error: "A reason of at least 10 characters is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const reqHeaders = await headers();

    // Store kill switch state in platform_settings
    await supabase.from("platform_settings").upsert({
      key: "kill_switch_active",
      value: activate ? "true" : "false",
      updated_at: new Date().toISOString()
    }, { onConflict: "key" });

    // Audit log (immutable)
    await logAuditAction({
      actorId: "system-admin",
      actorRole: "admin",
      actionType: activate ? "kill_switch_on" : "kill_switch_off",
      reason: reason.trim(),
      ipAddress: getIpFromHeaders(reqHeaders),
      newValue: { kill_switch_active: activate }
    });

    return NextResponse.json({ success: true, killSwitchActive: activate });
  } catch (err) {
    console.error("Kill switch toggle failed:", err);
    return NextResponse.json({ error: "Failed to toggle kill switch" }, { status: 500 });
  }
}
