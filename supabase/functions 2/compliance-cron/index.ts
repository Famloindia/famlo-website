// supabase/functions/compliance-cron/index.ts
// Supabase Edge Function — runs daily via scheduled trigger
// Performs two compliance checks:
//   1. 7-day document compliance: ACTIVE hosts/hommies missing required docs → PAUSED
//   2. Document expiry alerts: docs expiring within 30 days → notify user

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REQUIRED_DOCS = ["police_clearance"];
const DAYS_TO_COMPLY = 7;
const EXPIRY_WARNING_DAYS = 30;

Deno.serve(async (req: Request) => {
  // Verify this is an authorized scheduled call
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results = { paused: 0, notified: 0, errors: 0 };
  const now = new Date();

  // ─────────────────────────────────────────────
  // CHECK 1: 7-Day Document Compliance Pause
  // ─────────────────────────────────────────────
  const sevenDaysAgo = new Date(now.getTime() - DAYS_TO_COMPLY * 24 * 60 * 60 * 1000).toISOString();

  // Fetch hosts and hommies who went ACTIVE more than 7 days ago
  const { data: activeUsers } = await supabase
    .from("users")
    .select("id, name, email, role, kyc_status, created_at")
    .in("role", ["host", "hommie"])
    .eq("kyc_status", "active")
    .lt("created_at", sevenDaysAgo);

  for (const user of activeUsers ?? []) {
    try {
      // Check if they have all required documents uploaded
      const { data: docs } = await supabase
        .from("documents")
        .select("doc_type, status")
        .eq("user_id", user.id)
        .in("doc_type", REQUIRED_DOCS);

      const uploadedTypes = (docs ?? []).map((d) => d.doc_type);
      const missingDocs = REQUIRED_DOCS.filter((req) => !uploadedTypes.includes(req));

      if (missingDocs.length > 0) {
        // Auto-PAUSE the user
        await supabase
          .from("users")
          .update({ kyc_status: "paused" })
          .eq("id", user.id);

        // Log the auto-pause in audit_log
        await supabase.from("audit_log").insert({
          actor_id: "system-cron",
          actor_role: "admin",
          action_type: "auto_pause_compliance",
          target_user_id: user.id,
          resource_type: "compliance_check",
          reason: `Missing documents after ${DAYS_TO_COMPLY} days: ${missingDocs.join(", ")}`,
          new_value: { status: "paused", missing_docs: missingDocs, paused_at: now.toISOString() }
        });

        // Notify user via email
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: `Famlo <${Deno.env.get("MAIL_FROM_EMAIL") ?? "hello@famlo.in"}>`,
            to: [user.email],
            subject: "Action Required: Your Famlo listing has been paused",
            html: `
              <div style="font-family: sans-serif; padding: 32px; color: #0e2b57; line-height: 1.6;">
                <h1 style="color: #dc2626;">Your listing has been temporarily paused</h1>
                <p>Hi ${user.name}, your Famlo partner listing has been paused because the following required documents have not been uploaded within 7 days of activation:</p>
                <ul>${missingDocs.map((d) => `<li><strong>${d.replace(/_/g, " ")}</strong></li>`).join("")}</ul>
                <p>Please upload these documents from your dashboard to restore your listing:</p>
                <a href="https://famlo.in/partners" style="display: inline-block; padding: 12px 24px; background: #165dcc; color: white; text-decoration: none; border-radius: 8px; font-weight: 900;">
                  Upload Documents →
                </a>
                <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">Contact hello@famlo.in if you need support.</p>
              </div>
            `
          })
        });

        results.paused++;
      }
    } catch (err) {
      console.error(`Failed compliance check for user ${user.id}:`, err);
      results.errors++;
    }
  }

  // ─────────────────────────────────────────────
  // CHECK 2: Document Expiry Notifications (30-day warning)
  // ─────────────────────────────────────────────
  const in30Days = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const todayStr = now.toISOString().split("T")[0];

  const { data: expiringDocs } = await supabase
    .from("documents")
    .select("id, user_id, doc_type, expiry_date, users(name, email)")
    .gte("expiry_date", todayStr)
    .lte("expiry_date", in30Days)
    .eq("status", "approved"); // Only notify about approved/active docs

  for (const doc of expiringDocs ?? []) {
    try {
      const user = (doc as any).users;
      if (!user?.email) continue;

      const daysLeft = Math.ceil((new Date(doc.expiry_date!).getTime() - now.getTime()) / 86400000);

      // Only notify at 30, 14, and 7 days remaining to avoid spam
      if (![30, 14, 7].includes(daysLeft)) continue;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: `Famlo <${Deno.env.get("MAIL_FROM_EMAIL") ?? "hello@famlo.in"}>`,
          to: [user.email],
          subject: `Reminder: Your ${doc.doc_type.replace(/_/g, " ")} expires in ${daysLeft} days`,
          html: `
            <div style="font-family: sans-serif; padding: 32px; color: #0e2b57; line-height: 1.6;">
              <h1 style="color: #d97706;">Document Expiry Reminder</h1>
              <p>Hi ${user.name}, your <strong>${doc.doc_type.replace(/_/g, " ")}</strong> expires in <strong>${daysLeft} days</strong> on ${doc.expiry_date}.</p>
              <p>Please upload a renewed copy before it expires to avoid your listing being paused:</p>
              <a href="https://famlo.in/partners" style="display: inline-block; padding: 12px 24px; background: #165dcc; color: white; text-decoration: none; border-radius: 8px; font-weight: 900;">
                Upload Renewal →
              </a>
            </div>
          `
        })
      });

      results.notified++;
    } catch (err) {
      console.error(`Failed expiry notification for doc ${doc.id}:`, err);
      results.errors++;
    }
  }

  console.log(`[Compliance CRON] ${now.toISOString()} — Paused: ${results.paused}, Notified: ${results.notified}, Errors: ${results.errors}`);

  return new Response(JSON.stringify({ success: true, ...results }), {
    headers: { "Content-Type": "application/json" }
  });
});
