import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { appendFinanceAuditLog, appendPayoutCompletionLedger } from "@/lib/finance/operations";
import { createRazorpayXPayout, isRazorpayXConfigured } from "@/lib/razorpay";
import { createAdminSupabaseClient } from "@/lib/supabase";

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { payoutId?: string; adminId?: string };
    const payoutId = String(body.payoutId ?? "").trim();
    const adminId = String(body.adminId ?? "").trim() || null;
    if (!payoutId) {
      return NextResponse.json({ error: "payoutId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: payout, error: payoutError } = await supabase
      .from("payouts_v2")
      .select("id,booking_id,status,amount,net_transferable_amount,beneficiary_reference,partner_type,partner_user_id")
      .eq("id", payoutId)
      .maybeSingle();
    if (payoutError) throw payoutError;
    if (!payout) {
      return NextResponse.json({ error: "Payout not found." }, { status: 404 });
    }

    // Guard execution: payouts should only execute when the booking is payout-eligible and not blocked by refunds/disputes.
    // Default policy matches seeded payout_rules.release_after_status = 'completed' (safe default).
    const { data: booking, error: bookingError } = await supabase
      .from("bookings_v2")
      .select("id,status,payment_status,payment_id,legacy_booking_id")
      .eq("id", String(payout.booking_id ?? ""))
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) {
      return NextResponse.json({ error: "Booking not found for payout." }, { status: 404 });
    }

    const paymentId = typeof (booking as any).payment_id === "string" ? (booking as any).payment_id : null;
    const { data: payment, error: paymentError } = paymentId
      ? await supabase
          .from("payments_v2")
          .select("id,status,refund_status")
          .eq("id", paymentId)
          .maybeSingle()
      : await supabase
          .from("payments_v2")
          .select("id,status,refund_status")
          .eq("booking_id", booking.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
    if (paymentError) throw paymentError;

    const legacyBookingId = typeof (booking as any).legacy_booking_id === "string" ? (booking as any).legacy_booking_id : null;
    const { data: disputeRow } = legacyBookingId
      ? await supabase
          .from("disputes")
          .select("id,status,payout_frozen")
          .eq("booking_id", legacyBookingId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null as any };

    const payoutFrozen = Boolean((disputeRow as any)?.payout_frozen);

    if (payoutFrozen) {
      return NextResponse.json({ error: "Payout is frozen due to an active dispute." }, { status: 409 });
    }

    if (payout.status === "paid") {
      return NextResponse.json({ error: "Payout already marked as paid." }, { status: 409 });
    }

    if (payout.status === "on_hold") {
      return NextResponse.json({ error: "Payout is on hold and cannot be executed." }, { status: 409 });
    }

    if ((booking as any).payment_status !== "paid" || (payment as any)?.status !== "paid") {
      return NextResponse.json({ error: "Cannot execute payout: payment is not captured/paid." }, { status: 409 });
    }

    const bookingStatus = String((booking as any).status ?? "");
    if (bookingStatus !== "completed") {
      return NextResponse.json(
        { error: `Cannot execute payout before booking completion. Current booking status: ${bookingStatus || "unknown"}.` },
        { status: 409 }
      );
    }

    const bookingPaymentStatus = String((booking as any).payment_status ?? "");
    const paymentRefundStatus = String((payment as any)?.refund_status ?? "none");
    if (
      bookingPaymentStatus === "refund_pending" ||
      bookingPaymentStatus === "partially_refunded" ||
      bookingPaymentStatus === "refunded" ||
      paymentRefundStatus !== "none"
    ) {
      return NextResponse.json({ error: "Cannot execute payout: booking/payment has a refund state." }, { status: 409 });
    }
    const { count } = await supabase
      .from("payout_transfers_v2")
      .select("id", { count: "exact", head: true })
      .eq("payout_id", payoutId);
    const attemptNumber = (count ?? 0) + 1;
    const amount = asNumber(payout.net_transferable_amount ?? payout.amount);

    let provider = "manual";
    let providerStatus = "pending";
    let transferReference: string | null = null;
    let errorMessage: string | null = null;

    if (isRazorpayXConfigured() && typeof payout.beneficiary_reference === "string" && payout.beneficiary_reference.trim().length > 0) {
      provider = "razorpayx";
      try {
        const transfer = await createRazorpayXPayout({
          fundAccountId: payout.beneficiary_reference,
          amountRupees: amount,
          referenceId: `famlo-payout-${payoutId.slice(0, 8)}`,
          narration: "Famlo partner payout",
          purpose: "payout",
          notes: {
            payout_id: payoutId,
            booking_id: String(payout.booking_id ?? ""),
          },
        });
        transferReference = transfer.id;
        providerStatus = transfer.status || "processing";
      } catch (error) {
        providerStatus = "failed";
        errorMessage = error instanceof Error ? error.message : "Payout provider execution failed.";
      }
    } else {
      errorMessage =
        "Automatic payout requires RazorpayX credentials plus payouts_v2.beneficiary_reference mapped to a fund_account_id.";
    }

    const { data: transferRow, error: transferError } = await supabase
      .from("payout_transfers_v2")
      .insert({
        payout_id: payoutId,
        provider,
        transfer_reference: transferReference,
        beneficiary_reference: payout.beneficiary_reference ?? null,
        amount,
        status: providerStatus,
        attempt_number: attemptNumber,
        error_message: errorMessage,
        processed_at: providerStatus === "processed" || providerStatus === "paid" ? new Date().toISOString() : null,
        raw_response: {
          payout_id: payoutId,
          providerStatus,
        },
      })
      .select("id")
      .single();
    if (transferError) throw transferError;

    const nextPayoutStatus =
      providerStatus === "processed" || providerStatus === "paid"
        ? "paid"
        : providerStatus === "failed"
          ? "failed"
          : "processing";

    await supabase
      .from("payouts_v2")
      .update({
        status: nextPayoutStatus,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", payoutId);

    if (nextPayoutStatus === "paid") {
      await appendPayoutCompletionLedger(supabase, {
        bookingId: String(payout.booking_id),
        payoutId,
        amount,
        referenceId: transferReference ?? transferRow.id,
        metadata: {
          provider,
          partnerType: payout.partner_type,
          partnerUserId: payout.partner_user_id,
        },
      });
    }

    await appendFinanceAuditLog(supabase, {
      actorUserId: adminId,
      actionType: "payout_execute",
      resourceType: "payout",
      resourceId: payoutId,
      afterValue: {
        transferId: transferRow.id,
        provider,
        providerStatus,
        nextPayoutStatus,
      },
      reason: "manual_admin_payout_execution",
    });

    return NextResponse.json({
      success: true,
      payoutId,
      transferId: transferRow.id,
      provider,
      providerStatus,
      nextPayoutStatus,
      errorMessage,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to execute payout." },
      { status: 500 }
    );
  }
}
