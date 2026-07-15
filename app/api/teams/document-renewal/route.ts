// app/api/teams/document-renewal/route.ts
import { NextResponse } from "next/server";
import { sendDocumentRenewalNudge } from "@/lib/whatsapp";
import { logAuditAction } from "@/lib/audit";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { documentId, userId, docType, actorId } = await request.json();

    if (!userId || !docType || !actorId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: user } = await supabase.from("users").select("name, phone").eq("id", userId).single();

    if (!user || !user.phone) {
      return NextResponse.json({ error: "User phone number not found" }, { status: 404 });
    }

    // Send WhatsApp nudge for document renewal
    const result = await sendDocumentRenewalNudge(user.phone, user.name ?? "Partner", docType);

    // Log the renewal request in audit_log
    await logAuditAction({
      actorId,
      actorRole: "team",
      actionType: "renewal_request",
      targetUserId: userId,
      resourceType: "document",
      newValue: { documentId, docType, result: result.success }
    });

    return NextResponse.json({ success: result.success });
  } catch (err) {
    console.error("Document renewal request failed:", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
