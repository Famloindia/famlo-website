// app/api/teams/nudge/route.ts
import { NextResponse } from "next/server";
import { sendOnboardingNudge } from "@/lib/whatsapp";
import { logAuditAction } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const { userId, phone, actorId } = await request.json();

    if (!phone) {
      return NextResponse.json({ error: "Phone number required for WhatsApp nudge" }, { status: 400 });
    }

    // Extract name from payload if available
    const name = "Partner";
    const result = await sendOnboardingNudge(phone, name);

    await logAuditAction({
      actorId,
      actorRole: "team",
      actionType: "whatsapp_nudge",
      targetUserId: userId,
      resourceType: "onboarding_draft",
      newValue: { phone, result: result.success }
    });

    return NextResponse.json({ success: result.success });
  } catch (err) {
    console.error("Nudge failed:", err);
    return NextResponse.json({ error: "Failed to send nudge" }, { status: 500 });
  }
}
