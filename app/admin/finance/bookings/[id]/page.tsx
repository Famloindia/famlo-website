import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminLayout from "@/components/admin/AdminLayout";
import FinanceBookingDetail from "@/components/admin/FinanceBookingDetail";
import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { fetchLatestCancellationForBooking } from "@/lib/cancellation-history";
import { createAdminSupabaseClient } from "@/lib/supabase";

const ADMIN_ID = "system-admin";

export default async function FinanceBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const cookieStore = await cookies();
  const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);

  if (!isAuthenticated) {
    redirect("/admin");
  }

  const { id } = await params;
  const supabase = createAdminSupabaseClient();

  const { data: killSwitchData } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "kill_switch_active")
    .single();
  const killSwitchActive = killSwitchData?.value === "true";

  const { data: booking } = await supabase
    .from("bookings_v2")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { data: payment } = await supabase
    .from("payments_v2")
    .select("*")
    .eq("booking_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [snapshotsRes, eventsRes, ledgerRes, payoutsRes, refundsRes] = await Promise.all([
    supabase.from("booking_financial_snapshots").select("*").eq("booking_id", id).order("created_at", { ascending: false }),
    payment?.id
      ? supabase.from("payment_events").select("*").eq("payment_id", payment.id).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[], error: null }),
    supabase.from("ledger_entries").select("*").eq("booking_id", id).order("created_at", { ascending: false }),
    supabase.from("payouts_v2").select("*").eq("booking_id", id).order("created_at", { ascending: false }),
    supabase.from("refunds_v2").select("*").eq("booking_id", id).order("created_at", { ascending: false }),
  ]);

  const cancellation = await fetchLatestCancellationForBooking(supabase, id);

  return (
    <AdminLayout
      admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }}
      activeTab="finance"
      killSwitchActive={killSwitchActive}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#93c5fd", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Finance Booking Detail
          </div>
          <h1 style={{ margin: "10px 0 0", fontSize: "30px", fontWeight: 900, color: "white" }}>{id}</h1>
        </div>
        <FinanceBookingDetail
          booking={(booking as Record<string, unknown> | null) ?? null}
          payment={(payment as Record<string, unknown> | null) ?? null}
          snapshots={((snapshotsRes.data ?? []) as Record<string, unknown>[]) ?? []}
          events={((eventsRes.data ?? []) as Record<string, unknown>[]) ?? []}
          ledger={((ledgerRes.data ?? []) as Record<string, unknown>[]) ?? []}
          payouts={((payoutsRes.data ?? []) as Record<string, unknown>[]) ?? []}
          refunds={((refundsRes.data ?? []) as Record<string, unknown>[]) ?? []}
          cancellation={(cancellation as any) ?? null}
          adminId={ADMIN_ID}
        />
      </div>
    </AdminLayout>
  );
}
