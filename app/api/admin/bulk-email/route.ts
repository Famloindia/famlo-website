// app/api/admin/bulk-email/route.ts
import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/resend";
import { logAuditAction } from "@/lib/audit";

// This route queues bulk email jobs — each email is sent individually
// For production scale, replace the loop with a Supabase Edge Function queue

export async function POST(request: Request) {
  try {
    if (!(await hasValidAdminSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { recipientGroup, subject, body } = await request.json();

    if (!subject?.trim() || !body?.trim()) {
      return NextResponse.json({ error: "Subject and body are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const role = recipientGroup === "hosts" ? "host" : "hommie";

    const { data: users } = await supabase
      .from("users")
      .select("id, name, email")
      .eq("role", role)
      .eq("kyc_status", "active");

    if (!users || users.length === 0) {
      return NextResponse.json({ error: "No active users found in this group." }, { status: 404 });
    }

    const jobId = `BULK-${Date.now()}`;

    // Fire emails with a small delay between each to avoid rate limits
    // In production: push each to a Supabase Edge Function queue instead
    const sendPromises = users.map(async (user, index) => {
      const personalized = body.replace(/\{name\}/gi, user.name ?? "Partner");
      await new Promise((r) => setTimeout(r, index * 120)); // 120ms stagger
      await sendEmail({ to: user.email ?? "", subject, html: `<div style="font-family: sans-serif; padding: 24px; line-height: 1.6;">${personalized}</div>` });
    });

    // Start in background — do NOT await all (return job ID immediately)
    Promise.all(sendPromises).then(() => {
      logAuditAction({
        actorId: "system-admin",
        actorRole: "admin",
        actionType: "bulk_email_sent",
        newValue: { recipientGroup, subject, count: users.length, jobId }
      });
    }).catch(() => console.error("Some bulk emails failed"));

    return NextResponse.json({ success: true, jobId, queued: users.length });
  } catch (err) {
    console.error("Bulk email failed:", err);
    return NextResponse.json({ error: "Failed to queue bulk email." }, { status: 500 });
  }
}
