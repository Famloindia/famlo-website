import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminLayout from "@/components/admin/AdminLayout";
import FinanceBookingDetail from "@/components/admin/FinanceBookingDetail";
import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { isAdminFinanceFolioUiEnabled } from "@/lib/finance/feature-flags";
import { getFinanceSettings } from "@/lib/finance/settings";
import { getSafeTaxDisplayState } from "@/lib/finance/tax-compliance-guard";
import { fetchLatestCancellationForBooking } from "@/lib/cancellation-history";
import { createAdminSupabaseClient } from "@/lib/supabase";

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

  const [snapshotsRes, eventsRes, ledgerRes, payoutsRes, refundsRes, reservationRes] = await Promise.all([
    supabase.from("booking_financial_snapshots").select("*").eq("booking_id", id).order("created_at", { ascending: false }),
    payment?.id
      ? supabase.from("payment_events").select("*").eq("payment_id", payment.id).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[], error: null }),
    supabase.from("ledger_entries").select("*").eq("booking_id", id).order("created_at", { ascending: false }),
    supabase.from("payouts_v2").select("*").eq("booking_id", id).order("created_at", { ascending: false }),
    supabase.from("refunds_v2").select("*").eq("booking_id", id).order("created_at", { ascending: false }),
    supabase.from("reservations_v2").select("*").eq("booking_id", id).maybeSingle(),
  ]);

  const reservationId = typeof reservationRes.data?.id === "string" ? reservationRes.data.id : null;
  const [folioRes, folioLinesRes, activeSettlementLineRes] = await Promise.all([
    reservationId
      ? supabase.from("reservation_folios_v2").select("*").eq("reservation_id", reservationId).maybeSingle()
      : Promise.resolve({ data: null as any, error: null }),
    reservationId
      ? supabase
          .from("folio_line_items_v2")
          .select("*")
          .eq("reservation_id", reservationId)
          .order("occurred_at", { ascending: true })
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as any[], error: null }),
    reservationId
      ? supabase
          .from("settlement_line_items_v2")
          .select("*")
          .eq("reservation_id", reservationId)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null as any, error: null }),
  ]);

  const activeSettlementId =
    typeof activeSettlementLineRes.data?.settlement_id === "string" ? activeSettlementLineRes.data.settlement_id : null;
  const { data: activeSettlement } = activeSettlementId
    ? await supabase.from("host_settlements_v2").select("*").eq("id", activeSettlementId).maybeSingle()
    : { data: null as any };

  const cancellation = await fetchLatestCancellationForBooking(supabase, id);
  const financeUiEnabled = isAdminFinanceFolioUiEnabled();
  const taxDisplay = getSafeTaxDisplayState(await getFinanceSettings({ scopeType: "GLOBAL", scopeId: null }, supabase));

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
          financeUiEnabled={financeUiEnabled}
          booking={(booking as Record<string, unknown> | null) ?? null}
          payment={(payment as Record<string, unknown> | null) ?? null}
          reservation={(reservationRes.data as Record<string, unknown> | null) ?? null}
          folio={(folioRes.data as Record<string, unknown> | null) ?? null}
          folioLineItems={((folioLinesRes.data ?? []) as Record<string, unknown>[]) ?? []}
          activeSettlement={(activeSettlement as Record<string, unknown> | null) ?? null}
          activeSettlementLine={(activeSettlementLineRes.data as Record<string, unknown> | null) ?? null}
          snapshots={((snapshotsRes.data ?? []) as Record<string, unknown>[]) ?? []}
          events={((eventsRes.data ?? []) as Record<string, unknown>[]) ?? []}
          ledger={((ledgerRes.data ?? []) as Record<string, unknown>[]) ?? []}
          payouts={((payoutsRes.data ?? []) as Record<string, unknown>[]) ?? []}
          refunds={((refundsRes.data ?? []) as Record<string, unknown>[]) ?? []}
          cancellation={(cancellation as any) ?? null}
          taxDisplay={taxDisplay}
        />
      </div>
    </AdminLayout>
  );
}
