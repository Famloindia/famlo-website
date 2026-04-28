// app/api/teams/shadow/end/route.ts
import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { logAuditAction } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const { actorId, targetUserId, sessionId } = await request.json();

    if (!actorId || !targetUserId || !sessionId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Log the end of the shadow session
    await logAuditAction({
      actorId,
      actorRole: "team",
      actionType: "shadow_end",
      targetUserId,
      resourceType: "shadow_session",
      newValue: { sessionId }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Shadow session end failed:", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
