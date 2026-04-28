import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { appendFinanceAuditLog } from "@/lib/finance/operations";
import { fetchRazorpayPayment, isRazorpayConfigured } from "@/lib/razorpay";
import { createAdminSupabaseClient } from "@/lib/supabase";

function normalizeGatewayStatus(value: string | null | undefined): string {
  if (!value) return "unknown";
  const status = value.toLowerCase();
  if (status === "captured") return "paid";
  if (status === "failed") return "failed";
  if (status === "refunded") return "refunded";
  if (status === "authorized") return "authorized";
  return status;
}

export async function POST(): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isRazorpayConfigured()) {
      return NextResponse.json({ error: "Razorpay is not configured." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const startedAt = new Date().toISOString();

    const { data: run, error: runError } = await supabase
      .from("reconciliation_runs")
      .insert({
        provider: "razorpay",
        status: "running",
        started_at: startedAt,
      })
      .select("id")
      .single();
    if (runError) throw runError;

    const { data: payments, error: paymentsError } = await supabase
      .from("payments_v2")
      .select("id,booking_id,status,gateway,gateway_payment_id,gateway_order_id,amount_total")
      .eq("gateway", "razorpay")
      .not("gateway_payment_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (paymentsError) throw paymentsError;

    let matchedCount = 0;
    let mismatchedCount = 0;
    let missingCount = 0;
    const mismatches: Array<Record<string, unknown>> = [];

    for (const payment of payments ?? []) {
      const gatewayPaymentId = typeof payment.gateway_payment_id === "string" ? payment.gateway_payment_id : null;
      if (!gatewayPaymentId) {
        missingCount += 1;
        continue;
      }

      try {
        const gatewayPayment = await fetchRazorpayPayment(gatewayPaymentId);
        const internalStatus = normalizeGatewayStatus(typeof payment.status === "string" ? payment.status : null);
        const externalStatus = normalizeGatewayStatus(gatewayPayment.status);

        if (internalStatus === externalStatus) {
          matchedCount += 1;
          await supabase.from("payments_v2").update({ reconciliation_status: "matched" } as never).eq("id", payment.id);
        } else {
          mismatchedCount += 1;
          await supabase.from("payments_v2").update({ reconciliation_status: "mismatched" } as never).eq("id", payment.id);
          mismatches.push({
            payment_id: payment.id,
            booking_id: payment.booking_id,
            internal_status: internalStatus,
            gateway_status: externalStatus,
          });
        }
      } catch (error) {
        missingCount += 1;
        mismatches.push({
          payment_id: payment.id,
          booking_id: payment.booking_id,
          error: error instanceof Error ? error.message : "gateway_lookup_failed",
        });
      }
    }

    const finalStatus = mismatchedCount === 0 && missingCount === 0 ? "matched" : "mismatched";
    await supabase
      .from("reconciliation_runs")
      .update({
        completed_at: new Date().toISOString(),
        status: finalStatus,
        matched_count: matchedCount,
        mismatched_count: mismatchedCount,
        missing_count: missingCount,
        summary: {
          sample_mismatches: mismatches.slice(0, 20),
        },
      } as never)
      .eq("id", run.id);

    await appendFinanceAuditLog(supabase, {
      actorUserId: null,
      actionType: "reconciliation_run",
      resourceType: "reconciliation",
      resourceId: run.id,
      afterValue: {
        matchedCount,
        mismatchedCount,
        missingCount,
      },
      reason: "manual_admin_reconciliation",
    });

    return NextResponse.json({
      success: true,
      reconciliationRunId: run.id,
      matchedCount,
      mismatchedCount,
      missingCount,
      finalStatus,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run reconciliation." },
      { status: 500 }
    );
  }
}
