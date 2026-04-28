// app/api/admin/data-erasure/route.ts
import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { hasValidAdminSession, verifyAdminPassword } from "@/lib/admin-auth";
import { logAuditAction } from "@/lib/audit";

const ERASED_PLACEHOLDER = "[DELETED]";

export async function POST(request: Request) {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId, adminPassword } = await request.json();

    if (!verifyAdminPassword(adminPassword)) {
      return NextResponse.json({ error: "Invalid admin password" }, { status: 401 });
    }

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    // 1. Revoke all active sessions first
    try {
      await supabase.auth.admin.signOut(userId);
    } catch {
      // Non-blocking — user may already have no sessions
    }

    // 2. Anonymise all PII in users table
    await supabase.from("users").update({
      name: ERASED_PLACEHOLDER,
      email: ERASED_PLACEHOLDER,
      phone: ERASED_PLACEHOLDER,
      date_of_birth: null,
      gender: null,
      city: ERASED_PLACEHOLDER,
      state: ERASED_PLACEHOLDER,
      about: ERASED_PLACEHOLDER,
      avatar_url: null,
      push_token: null,
      kyc_status: "erased",
    }).eq("id", userId);

    // 3. Delete uploaded documents and family/friend applications
    await supabase.from("documents").delete().eq("user_id", userId);
    await supabase.from("family_applications").update({
      full_name: ERASED_PLACEHOLDER,
      email: ERASED_PLACEHOLDER,
      about_family: ERASED_PLACEHOLDER,
    }).eq("host_id", userId);
    await supabase.from("friend_applications").update({
      full_name: ERASED_PLACEHOLDER,
      email: ERASED_PLACEHOLDER,
      bio: ERASED_PLACEHOLDER,
    }).eq("guide_id", userId);

    // 4. Anonymise setup_tokens
    await supabase.from("setup_tokens").update({ used: true }).eq("user_id", userId);

    // 5. Log the erasure event — NEVER include erased PII in this log
    await logAuditAction({
      actorId: "system-admin",
      actorRole: "admin",
      actionType: "data_erasure",
      targetUserId: userId,
      resourceType: "user_account",
      reason: "DPDPA 2023 Right to Erasure request",
      // Deliberately excluded: old_value (would contain PII)
      newValue: { status: "erased", timestamp: new Date().toISOString() }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Data erasure failed:", err);
    return NextResponse.json({ error: "Erasure failed" }, { status: 500 });
  }
}
