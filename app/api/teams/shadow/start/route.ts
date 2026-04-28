// app/api/teams/shadow/start/route.ts
import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { logAuditAction, logSessionEvent } from "@/lib/audit";
import { headers } from "next/headers";
import { getIpFromHeaders } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const { actorId, targetUserId } = await request.json();
    const supabase = createAdminSupabaseClient();
    const reqHeaders = await headers();

    if (!actorId || !targetUserId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Generate a unique session ID
    const sessionId = `SHADOW-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Log the shadow session start in audit_log
    await logAuditAction({
      actorId,
      actorRole: "team",
      actionType: "shadow_start",
      targetUserId,
      resourceType: "shadow_session",
      newValue: { sessionId, targetUserId }
    });

    // Also log in session_audit_log for real-time monitoring
    await logSessionEvent({
      actorId,
      role: "team",
      action: "shadow_start",
      page: "/teams/shadow",
      ipAddress: getIpFromHeaders(reqHeaders),
      userAgent: reqHeaders.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ success: true, sessionId });
  } catch (err) {
    console.error("Shadow session start failed:", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
