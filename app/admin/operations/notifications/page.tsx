import Link from "next/link";
import { redirect } from "next/navigation";

import AdminLayout from "@/components/admin/AdminLayout";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminOperationalNotificationsPage() {
  if (!(await hasValidAdminSession())) redirect("/admin");
  const supabase = createAdminSupabaseClient();
  const [notificationResult, reviewResult] = await Promise.all([
    supabase
      .from("operational_notifications")
      .select("id,recipient_role,title,message,cta_url,read_at,visible_after,created_at,booking_id")
      .lte("visible_after", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("account_link_requests")
      .select("id,status,blocked_reason,ownership_verified_at,created_at,updated_at")
      .in("status", ["blocked_business_data", "manual_review"])
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);
  if (notificationResult.error) throw notificationResult.error;
  if (reviewResult.error) throw reviewResult.error;

  return (
    <AdminLayout admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }} activeTab="operational-notifications" killSwitchActive={false}>
      <main style={{ padding: 28, color: "#e2e8f0" }}>
        <h1 style={{ marginTop: 0 }}>Booking & Account Link Reviews</h1>
        <section style={{ marginBottom: 32 }}>
          <h2>Booking operations ({notificationResult.data?.length ?? 0})</h2>
          {(notificationResult.data ?? []).map((item) => (
            <article key={item.id} style={{ borderBottom: "1px solid #334155", padding: "14px 0" }}>
              <strong>{item.title}</strong>
              <p>{item.message}</p>
              {item.cta_url ? <Link href={item.cta_url} style={{ color: "#93c5fd" }}>Open record</Link> : null}
            </article>
          ))}
        </section>
        <section>
          <h2>Account link review ({reviewResult.data?.length ?? 0})</h2>
          {(reviewResult.data ?? []).map((item) => (
            <article key={item.id} style={{ borderBottom: "1px solid #334155", padding: "14px 0" }}>
              <strong>Review {item.id.slice(0, 8).toUpperCase()}</strong>
              <p>Status: {item.status}. Reason: {item.blocked_reason ?? "manual review"}.</p>
              <small>Phone ownership proof: {item.ownership_verified_at ? "verified" : "pending"}</small>
            </article>
          ))}
        </section>
      </main>
    </AdminLayout>
  );
}
