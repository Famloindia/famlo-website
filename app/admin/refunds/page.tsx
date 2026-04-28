import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminLayout from "@/components/admin/AdminLayout";
import RefundsReviewDashboard from "@/components/admin/RefundsReviewDashboard";
import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { fetchCancellationHistory } from "@/lib/cancellation-history";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminRefundsPage() {
  const cookieStore = await cookies();
  const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);

  if (!isAuthenticated) {
    redirect("/admin");
  }

  const supabase = createAdminSupabaseClient();
  const [{ data: killSwitchData }, refundEntries] = await Promise.all([
    supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "kill_switch_active")
      .single(),
    fetchCancellationHistory(supabase, { limit: 250 }),
  ]);
  const killSwitchActive = killSwitchData?.value === "true";

  return (
    <AdminLayout
      admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }}
      activeTab="refunds"
      killSwitchActive={killSwitchActive}
    >
      <RefundsReviewDashboard entries={refundEntries} variant="dark" showBookingLinks />
    </AdminLayout>
  );
}
