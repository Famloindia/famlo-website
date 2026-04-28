import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { buildPayoutStatementDocument, enqueueNotification } from "@/lib/booking-platform";
import { appendLedgerEntryIfMissing } from "@/lib/finance/runtime";
import { createAdminSupabaseClient } from "@/lib/supabase";

type PayoutUpdateBody = {
  payoutId?: string;
  action?: "hold" | "release" | "mark_paid";
  reason?: string;
  transferReference?: string | null;
  notes?: string | null;
};

const ACTION_TO_STATUS: Record<string, string> = {
  hold: "on_hold",
  release: "scheduled",
  mark_paid: "paid",
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);

    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as PayoutUpdateBody;
    const payoutId = String(body.payoutId ?? "").trim();
    const action = String(body.action ?? "").trim();
    const reason = String(body.reason ?? "manual_admin_update").trim();
    const transferReference = String(body.transferReference ?? "").trim() || null;
    const notes = String(body.notes ?? "").trim() || null;

    if (!payoutId || !ACTION_TO_STATUS[action]) {
      return NextResponse.json({ error: "payoutId and valid action are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: payout, error: payoutError } = await supabase
      .from("payouts_v2")
      .select("id,booking_id,amount,status,partner_type,partner_user_id,net_transferable_amount")
      .eq("id", payoutId)
      .maybeSingle();

    if (payoutError) throw payoutError;
    if (!payout) {
      return NextResponse.json({ error: "Payout not found." }, { status: 404 });
    }

    if (action === "mark_paid") {
      // Keep manual marking aligned with payout execution guards.
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
        ? await supabase.from("payments_v2").select("id,status,refund_status").eq("id", paymentId).maybeSingle()
        : await supabase
            .from("payments_v2")
            .select("id,status,refund_status")
            .eq("booking_id", booking.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

      if (paymentError) throw paymentError;

      const legacyBookingId =
        typeof (booking as any).legacy_booking_id === "string" ? (booking as any).legacy_booking_id : null;
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

      if ((booking as any).payment_status !== "paid" || (payment as any)?.status !== "paid") {
        return NextResponse.json({ error: "Cannot mark payout paid: payment is not captured/paid." }, { status: 409 });
      }

      const bookingStatus = String((booking as any).status ?? "");
      if (bookingStatus !== "completed") {
        return NextResponse.json(
          { error: `Cannot mark payout paid before booking completion. Current booking status: ${bookingStatus || "unknown"}.` },
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
        return NextResponse.json(
          { error: "Cannot mark payout paid: booking/payment has a refund state." },
          { status: 409 }
        );
      }
    }

    const nextStatus = ACTION_TO_STATUS[action];
    const updatePayload: Record<string, unknown> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
      hold_reason: action === "hold" ? reason : null,
      notes: notes ?? undefined,
    };

    const { error: updateError } = await supabase.from("payouts_v2").update(updatePayload as never).eq("id", payoutId);
    if (updateError) throw updateError;

    if (action === "mark_paid") {
      const { count } = await supabase
        .from("payout_transfers_v2")
        .select("id", { count: "exact", head: true })
        .eq("payout_id", payoutId);

      await supabase.from("payout_transfers_v2").insert({
        payout_id: payoutId,
        provider: "manual",
        transfer_reference: transferReference,
        beneficiary_reference: null,
        amount: Number(payout.net_transferable_amount ?? payout.amount ?? 0),
        status: "paid",
        attempt_number: (count ?? 0) + 1,
        processed_at: new Date().toISOString(),
        raw_response: {
          action,
          reason,
          transfer_reference: transferReference,
          notes,
        },
      });

      await appendLedgerEntryIfMissing(supabase, {
        bookingId: payout.booking_id,
        payoutId,
        entryType: "payout_completed",
        accountCode: "partner_payouts_payable",
        direction: "debit",
        amount: Number(payout.net_transferable_amount ?? payout.amount ?? 0),
        referenceType: "payout",
        referenceId: payoutId,
        metadata: {
          action,
          reason,
          partnerType: payout.partner_type,
          partnerUserId: payout.partner_user_id,
        },
      });

      try {
        const statement = await buildPayoutStatementDocument(supabase, payoutId);
        await supabase.from("document_exports").insert({
          document_type: "host_payout_statement",
          booking_id: payout.booking_id,
          payout_id: payoutId,
          owner_user_id: payout.partner_user_id,
          access_scope: "host",
          payload: statement.payload,
        });
      } catch (documentError) {
        console.error("[payouts.update] payout statement generation failed:", documentError);
      }

      await enqueueNotification(supabase, {
        eventType: "payout_paid",
        channel: "email",
        userId: typeof payout.partner_user_id === "string" ? payout.partner_user_id : null,
        bookingId: payout.booking_id,
        payoutId,
        dedupeKey: `payout_paid:${payoutId}`,
        subject: "Your Famlo payout was marked paid",
        payload: {
          message: `Your payout of INR ${Number(payout.net_transferable_amount ?? payout.amount ?? 0)} is now marked paid.`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      payoutId,
      action,
      status: nextStatus,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update payout." },
      { status: 500 }
    );
  }
}
