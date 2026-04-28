import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { appendLedgerEntryIfMissing } from "@/lib/finance/runtime";
import { computeRefundAllocationBreakdown } from "@/lib/finance/refunds";
import { createRazorpayRefund, isRazorpayConfigured } from "@/lib/razorpay";
import { createAdminSupabaseClient } from "@/lib/supabase";

type RefundBody = {
  bookingId?: string;
  paymentId?: string;
  amount?: number;
  reason?: string;
  adminId?: string;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);

    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as RefundBody;
    const bookingId = String(body.bookingId ?? "").trim();
    const paymentId = String(body.paymentId ?? "").trim();
    const reason = String(body.reason ?? "manual_admin_refund").trim();
    const adminId = String(body.adminId ?? "").trim() || null;

    if (!bookingId || !paymentId) {
      return NextResponse.json({ error: "bookingId and paymentId are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: payment, error: paymentError } = await supabase
      .from("payments_v2")
      .select("id,booking_id,amount_total,platform_fee,tax_amount,gateway,gateway_payment_id,refund_status,status")
      .eq("id", paymentId)
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (paymentError) throw paymentError;
    if (!payment) {
      return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    }

    const { data: snapshot } = await supabase
      .from("booking_financial_snapshots")
      .select("guest_total,taxable_base_for_service_fee,platform_fee,platform_fee_tax,stay_tax")
      .eq("booking_id", bookingId)
      .eq("snapshot_kind", "checkout")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const refundAmount =
      typeof body.amount === "number" && Number.isFinite(body.amount) && body.amount > 0
        ? Math.min(Math.round(body.amount), Number(payment.amount_total ?? 0))
        : Number(payment.amount_total ?? 0);

    const fullRefund = refundAmount >= Number(payment.amount_total ?? 0);
    let providerRefundId: string | null = null;
    let providerStatus = "pending";

    if (payment.gateway === "razorpay" && payment.gateway_payment_id && isRazorpayConfigured()) {
      const refund = await createRazorpayRefund({
        paymentId: payment.gateway_payment_id,
        amountRupees: refundAmount,
        notes: {
          booking_id: bookingId,
          payment_id: paymentId,
          reason,
        },
      });
      providerRefundId = refund.id;
      providerStatus = refund.status ?? "processing";
    }

    const { data: refund, error: refundError } = await supabase
      .from("refunds_v2")
      .insert({
        booking_id: bookingId,
        payment_id: paymentId,
        provider: payment.gateway || "manual",
        provider_refund_id: providerRefundId,
        amount_total: refundAmount,
        reason_code: reason,
        status: providerStatus === "processed" ? "processed" : "pending",
        initiated_by_user_id: adminId,
        metadata: {
          requested_via: "admin_finance",
          full_refund: fullRefund,
          provider_status: providerStatus,
        },
      })
      .select("id")
      .single();

    if (refundError) throw refundError;

    const guestTotal =
      typeof (snapshot as any)?.guest_total === "number"
        ? (snapshot as any).guest_total
        : typeof payment.amount_total === "number"
          ? payment.amount_total
          : Number(payment.amount_total ?? 0);
    const amountAfterDiscount =
      typeof (snapshot as any)?.taxable_base_for_service_fee === "number"
        ? (snapshot as any).taxable_base_for_service_fee
        : Math.max(0, Math.round(guestTotal - Number(payment.tax_amount ?? 0)));
    const platformFee =
      typeof (snapshot as any)?.platform_fee === "number"
        ? (snapshot as any).platform_fee
        : Number(payment.platform_fee ?? 0);
    const platformFeeTax =
      typeof (snapshot as any)?.platform_fee_tax === "number"
        ? (snapshot as any).platform_fee_tax
        : Number(payment.tax_amount ?? 0);
    const stayTaxAmount = typeof (snapshot as any)?.stay_tax === "number" ? (snapshot as any).stay_tax : 0;

    const breakdown = computeRefundAllocationBreakdown({
      refundAmount,
      guestTotal,
      amountAfterDiscount,
      platformFee,
      platformFeeTax,
      stayTaxAmount,
    });

    const allocations = [
      { allocation_type: "guest_principal", amount: breakdown.guest_principal },
      { allocation_type: "platform_fee_reversal", amount: breakdown.platform_fee_reversal },
      { allocation_type: "platform_tax_reversal", amount: breakdown.platform_tax_reversal },
    ]
      .filter((row) => row.amount > 0)
      .map((row) => ({
        refund_id: refund.id,
        allocation_type: row.allocation_type,
        amount: row.amount,
        metadata: {
          source_payment_id: paymentId,
          breakdown: breakdown.metadata,
        },
      }));

    if (allocations.length > 0) {
      await supabase.from("refund_allocations_v2").insert(allocations);
    }

    await supabase
      .from("payments_v2")
      .update({
        refund_status: fullRefund ? "full" : "partial",
        status: providerStatus === "processed" && fullRefund ? "refunded" : payment.status,
      } as never)
      .eq("id", paymentId);

    await supabase
      .from("bookings_v2")
      .update({
        payment_status: providerStatus === "processed" ? (fullRefund ? "refunded" : "partially_refunded") : "refund_pending",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", bookingId);

    await appendLedgerEntryIfMissing(supabase, {
      bookingId,
      paymentId,
      refundId: refund.id,
      entryType: "refund_initiated",
      accountCode: "guest_refunds_payable",
      direction: "credit",
      amount: refundAmount,
      referenceType: "admin_refund",
      referenceId: refund.id,
      metadata: {
        reason,
        fullRefund,
        providerRefundId,
        providerStatus,
      },
    });

    if (providerStatus === "processed") {
      await appendLedgerEntryIfMissing(supabase, {
        bookingId,
        paymentId,
        refundId: refund.id,
        entryType: "refund_completed",
        accountCode: "guest_refunds_payable",
        direction: "debit",
        amount: refundAmount,
        referenceType: "admin_refund",
        referenceId: `completed:${refund.id}`,
        metadata: {
          reason,
          fullRefund,
          providerRefundId,
        },
      });

      if (breakdown.platform_tax_reversal > 0) {
        await appendLedgerEntryIfMissing(supabase, {
          bookingId,
          paymentId,
          refundId: refund.id,
          entryType: "refund_completed",
          accountCode: "tax_output_payable",
          direction: "debit",
          amount: breakdown.platform_tax_reversal,
          referenceType: "admin_refund",
          referenceId: `tax:${refund.id}`,
          metadata: {
            reason,
          },
        });
      }

      if (breakdown.platform_fee_reversal > 0) {
        await appendLedgerEntryIfMissing(supabase, {
          bookingId,
          paymentId,
          refundId: refund.id,
          entryType: "refund_completed",
          accountCode: "platform_fee_revenue",
          direction: "debit",
          amount: breakdown.platform_fee_reversal,
          referenceType: "admin_refund",
          referenceId: `fee:${refund.id}`,
          metadata: {
            reason,
          },
        });
      }

      await appendLedgerEntryIfMissing(supabase, {
        bookingId,
        paymentId,
        refundId: refund.id,
        entryType: "refund_completed",
        accountCode: "cash_gateway_clearing",
        direction: "credit",
        amount: refundAmount,
        referenceType: "admin_refund",
        referenceId: `cash:${refund.id}`,
        metadata: {
          reason,
        },
      });
    }

    return NextResponse.json({
      success: true,
      refundId: refund.id,
      amount: refundAmount,
      fullRefund,
      providerRefundId,
      providerStatus,
      note:
        providerRefundId
          ? "Refund created in Razorpay and recorded in Famlo finance."
          : "Refund recorded in Famlo finance. Gateway execution still needs to be run manually.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create refund." },
      { status: 500 }
    );
  }
}
