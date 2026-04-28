import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminLayout from "@/components/admin/AdminLayout";
import FinanceOverview from "@/components/admin/FinanceOverview";
import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { estimateCancellationRefundAmount } from "@/lib/cancellation-history";
import { createAdminSupabaseClient } from "@/lib/supabase";
import type { FinanceOverviewMetrics } from "@/lib/finance/types";
import type { FinanceRecentBookingRow } from "@/lib/finance/types";

function readAggregate(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export default async function AdminFinancePage() {
  const cookieStore = await cookies();
  const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);

  if (!isAuthenticated) {
    redirect("/admin");
  }

  const supabase = createAdminSupabaseClient();
  const { data: killSwitchData } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "kill_switch_active")
    .single();
  const killSwitchActive = killSwitchData?.value === "true";

  const [paymentsRes, payoutsRes, refundsRes, reconRes, rulesRes, recentBookingsRes, cancelledBookingsRes] = await Promise.all([
    supabase.from("payments_v2").select("amount_total,platform_fee,tax_amount,partner_payout_amount,status").eq("status", "paid"),
    supabase.from("payouts_v2").select("amount,status"),
    supabase.from("refunds_v2").select("booking_id,amount_total,status"),
    supabase.from("reconciliation_runs").select("id,status").neq("status", "matched"),
    supabase.from("finance_rule_sets").select("code").eq("status", "active").eq("is_default", true).maybeSingle(),
    supabase
      .from("bookings_v2")
      .select("id,booking_type,status,payment_status,total_price,partner_payout_amount,host_id,hommie_id,user_id,created_at,start_date,end_date")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("bookings_v2")
      .select("id,status,payment_status,total_price,created_at,start_date")
      .in("status", ["cancelled", "cancelled_by_user", "cancelled_by_partner"])
      .in("payment_status", ["paid", "refund_pending", "partially_refunded"])
      .limit(500),
  ]);

  const cancelledBookingIds = (cancelledBookingsRes.data ?? []).map((row) => row.id).filter(Boolean);
  const { data: cancelledPayments } =
    cancelledBookingIds.length > 0
      ? await supabase
          .from("payments_v2")
          .select("booking_id,amount_total,refund_status,status")
          .in("booking_id", cancelledBookingIds)
          .order("created_at", { ascending: false })
      : { data: [] };

  const paymentByCancelledBookingId = new Map(
    (cancelledPayments ?? []).map((payment) => [payment.booking_id, payment as Record<string, unknown>])
  );
  const refundBookingIds = new Set((refundsRes.data ?? []).map((refund) => refund.booking_id).filter(Boolean));
  const pendingRefundRowsAmount = (refundsRes.data ?? [])
    .filter((row) => row.status !== "processed")
    .reduce((sum, row) => sum + readAggregate(row.amount_total), 0);
  const pendingCancellationRefundAmount = (cancelledBookingsRes.data ?? [])
    .filter((booking) => !refundBookingIds.has(booking.id))
    .reduce((sum, booking) => sum + estimateCancellationRefundAmount(booking as Record<string, unknown>, paymentByCancelledBookingId.get(booking.id)), 0);

  const recentBookingIds = (recentBookingsRes.data ?? []).map((row) => row.id).filter(Boolean);
  const [recentPaymentsRes, recentPayoutRowsRes, guestsRes, hostsRes] = await Promise.all([
    recentBookingIds.length > 0
      ? supabase
          .from("payments_v2")
          .select("id,booking_id,status,amount_total,platform_fee,tax_amount,partner_payout_amount,created_at,payment_method,gateway")
          .in("booking_id", recentBookingIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    recentBookingIds.length > 0
      ? supabase
          .from("payouts_v2")
          .select("id,booking_id,status,amount,platform_fee,platform_fee_tax,created_at")
          .in("booking_id", recentBookingIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    (() => {
      const guestIds = Array.from(new Set((recentBookingsRes.data ?? []).map((row) => row.user_id).filter(Boolean)));
      return guestIds.length > 0
        ? supabase.from("users").select("id,name").in("id", guestIds)
        : Promise.resolve({ data: [], error: null });
    })(),
    (() => {
      const hostIds = Array.from(new Set((recentBookingsRes.data ?? []).map((row) => row.host_id).filter(Boolean)));
      return hostIds.length > 0
        ? supabase.from("hosts").select("id,display_name,legacy_family_id").in("id", hostIds)
        : Promise.resolve({ data: [], error: null });
    })(),
  ]);

  const metrics: FinanceOverviewMetrics = {
    totalPaid: (paymentsRes.data ?? []).reduce((sum, row) => sum + readAggregate(row.amount_total), 0),
    totalPlatformFee: (paymentsRes.data ?? []).reduce((sum, row) => sum + readAggregate(row.platform_fee), 0),
    totalTaxLiability: (paymentsRes.data ?? []).reduce((sum, row) => sum + readAggregate(row.tax_amount), 0),
    totalPartnerPayout: (paymentsRes.data ?? []).reduce((sum, row) => sum + readAggregate(row.partner_payout_amount), 0),
    paidBookingCount: paymentsRes.data?.length ?? 0,
    pendingPayoutAmount: (payoutsRes.data ?? [])
      .filter((row) => row.status !== "paid")
      .reduce((sum, row) => sum + readAggregate(row.amount), 0),
    pendingRefundAmount: pendingRefundRowsAmount + pendingCancellationRefundAmount,
    unreconciledPaymentCount: reconRes.data?.length ?? 0,
    activeRuleSetCode: rulesRes.data?.code ?? null,
  };

  const guestMap = new Map((guestsRes.data ?? []).map((row) => [row.id, row.name ?? "Guest"]));
  const hostMap = new Map((hostsRes.data ?? []).map((row) => [row.id, row]));
  const familyIds = Array.from(new Set((hostsRes.data ?? []).map((row) => row.legacy_family_id).filter(Boolean)));
  const { data: familiesRes } =
    familyIds.length > 0
      ? await supabase.from("families").select("id,name,property_name,city,state").in("id", familyIds)
      : { data: [] };
  const familyMap = new Map((familiesRes ?? []).map((row: any) => [row.id, row]));
  const paymentByBookingId = new Map(
    (recentPaymentsRes.data ?? []).map((row) => [row.booking_id, row])
  );
  const payoutByBookingId = new Map(
    (recentPayoutRowsRes.data ?? []).map((row) => [row.booking_id, row])
  );

  const recentBookings: FinanceRecentBookingRow[] = (recentBookingsRes.data ?? []).map((booking) => {
    const payment = paymentByBookingId.get(booking.id);
    const payout = payoutByBookingId.get(booking.id);
    const host = booking.host_id ? hostMap.get(booking.host_id) : null;
    const family = host?.legacy_family_id ? familyMap.get(host.legacy_family_id) : null;

    return {
      bookingId: booking.id,
      paymentId: payment?.id ?? null,
      payoutId: payout?.id ?? null,
      bookingType: booking.booking_type ?? null,
      bookingStatus: booking.status ?? null,
      paymentStatus: booking.payment_status ?? payment?.status ?? null,
      guestName: booking.user_id ? guestMap.get(booking.user_id) ?? "Guest" : "Guest",
      partnerName: host?.display_name ?? "Partner",
      propertyName: family?.property_name ?? family?.name ?? null,
      propertyLocation: [family?.city, family?.state].filter(Boolean).join(", ") || null,
      amountTotal: readAggregate(payment?.amount_total ?? booking.total_price),
      platformFee: readAggregate(payment?.platform_fee),
      taxAmount: readAggregate(payment?.tax_amount ?? payout?.platform_fee_tax),
      partnerPayoutAmount: readAggregate(payment?.partner_payout_amount ?? booking.partner_payout_amount ?? payout?.amount),
      createdAt: typeof booking.created_at === "string" ? booking.created_at : null,
      checkIn: typeof booking.start_date === "string" ? booking.start_date : null,
      checkOut: typeof booking.end_date === "string" ? booking.end_date : null,
    };
  });

  return (
    <AdminLayout
      admin={{ id: "system-admin", name: "Famlo Admin", email: "admin@famlo.in" }}
      activeTab="finance"
      killSwitchActive={killSwitchActive}
    >
      <FinanceOverview metrics={metrics} recentBookings={recentBookings} />
    </AdminLayout>
  );
}
