import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { estimateCancellationRefundAmount } from "@/lib/cancellation-history";
import { createAdminSupabaseClient } from "@/lib/supabase";
import type { FinanceOverviewMetrics } from "@/lib/finance/types";

function readAggregate(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function GET(): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);

    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();

    const [paymentsRes, payoutsRes, refundsRes, reconRes, rulesRes, cancelledBookingsRes] = await Promise.all([
      supabase
        .from("payments_v2")
        .select("amount_total,platform_fee,tax_amount,partner_payout_amount,status")
        .eq("status", "paid"),
      supabase.from("payouts_v2").select("amount,status"),
      supabase.from("refunds_v2").select("booking_id,amount_total,status"),
      supabase.from("reconciliation_runs").select("id,status").neq("status", "matched"),
      supabase.from("finance_rule_sets").select("code").eq("status", "active").eq("is_default", true).maybeSingle(),
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

    return NextResponse.json(metrics);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load finance overview.",
      },
      { status: 500 }
    );
  }
}
