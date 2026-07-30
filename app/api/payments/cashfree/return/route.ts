import { NextRequest, NextResponse } from "next/server";

import { appendPaymentEventAudit } from "@/lib/finance/payment-audit";
import { verifyProviderPayment } from "@/lib/payments/provider";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const bookingId = String(url.searchParams.get("bookingId") ?? "").trim();
  const paymentRowId = String(url.searchParams.get("paymentRowId") ?? "").trim();
  const orderId = String(url.searchParams.get("orderId") ?? url.searchParams.get("order_id") ?? "").trim();
  const redirectUrl = new URL("/bookings", url.origin);
  if (bookingId) redirectUrl.searchParams.set("bookingId", bookingId);

  if (!bookingId || !paymentRowId || !orderId || orderId === "{order_id}") {
    redirectUrl.searchParams.set("payment_status", "pending_webhook");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const supabase = createAdminSupabaseClient();
    const paymentLookup = await supabase
      .from("payments_v2")
      .select("id")
      .eq("id", paymentRowId)
      .eq("booking_id", bookingId)
      .eq("gateway", "cashfree")
      .eq("gateway_order_id", orderId)
      .maybeSingle();
    if (paymentLookup.error) throw paymentLookup.error;
    if (!paymentLookup.data) {
      redirectUrl.searchParams.set("payment_status", "pending_webhook");
      return NextResponse.redirect(redirectUrl);
    }

    const payment = await verifyProviderPayment({ provider: "cashfree", orderId });
    await appendPaymentEventAudit(supabase, {
      paymentId: paymentRowId,
      provider: "cashfree",
      eventName: "cashfree.return.advisory",
      providerEventId: payment?.paymentId || orderId,
      idempotencyKey: `cashfree_return:${orderId}:${payment?.paymentId || "order"}`,
      payload: {
        bookingId,
        paymentRowId,
        orderId,
        providerPayment: payment,
      },
      processingStatus: "processed",
    });
    redirectUrl.searchParams.set("payment_status", String(payment?.status ?? "pending_webhook").toLowerCase());
  } catch {
    redirectUrl.searchParams.set("payment_status", "pending_webhook");
  }

  return NextResponse.redirect(redirectUrl);
}
