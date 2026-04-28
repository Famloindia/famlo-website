// app/api/teams/id-verify/confirm/route.ts
import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { logAuditAction } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const { userId, actorId, confirmed, recordType } = await request.json();

    if (!userId || actorId === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    // Update the application record to reflect ID verification status
    // Note: We check both family and friend applications
    if (recordType === "guest") {
      await supabase
        .from("users")
        .update({
          kyc_status: confirmed ? "verified" : "needs_resubmission",
          onboarding_completed: confirmed ? true : undefined,
        })
        .eq("id", userId);
    } else {
      const { data: familyApp } = await supabase.from("family_applications").select("id").eq("id", userId).single();

      if (familyApp) {
      await supabase.from("family_applications").update({
        id_verified: confirmed,
        id_verified_at: confirmed ? new Date().toISOString() : null,
        id_verified_by: confirmed ? actorId : null
      }).eq("id", userId);
      } else {
        await supabase.from("friend_applications").update({
          id_verified: confirmed,
          id_verified_at: confirmed ? new Date().toISOString() : null,
          id_verified_by: confirmed ? actorId : null
        }).eq("id", userId);
      }
    }

    // Log the verification action
    await logAuditAction({
      actorId,
      actorRole: "team",
      actionType: "id_verify_confirm",
      targetUserId: userId,
      resourceType: recordType === "guest" ? "user_verification" : "id_verification",
      newValue: recordType === "guest" ? { kyc_status: confirmed ? "verified" : "needs_resubmission" } : { id_verified: confirmed }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("ID verification confirmation failed:", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
