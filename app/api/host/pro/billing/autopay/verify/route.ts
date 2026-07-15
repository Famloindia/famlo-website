import { NextRequest, NextResponse } from "next/server";

import { resolveAuthorizedHostSession } from "@/lib/chat-access";
import {
  verifyAndFinalizeHostProAutopaySubscription,
} from "@/lib/pro-billing/service";
import { verifyRazorpaySubscriptionPaymentSignature } from "@/lib/pro-billing/razorpay-subscriptions";
import { createAdminSupabaseClient } from "@/lib/supabase";

type VerifyBody = {
  billingOrderId?: string;
  razorpay_subscription_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createAdminSupabaseClient();
    const hostSession = await resolveAuthorizedHostSession(supabase, request);

    if (!hostSession?.hostUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as VerifyBody;
    const billingOrderId = asString(body.billingOrderId);
    const razorpaySubscriptionId = asString(body.razorpay_subscription_id);
    const razorpayPaymentId = asString(body.razorpay_payment_id);
    const razorpaySignature = asString(body.razorpay_signature);

    if (!billingOrderId || !razorpaySubscriptionId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json({ error: "Missing required Razorpay subscription verification fields." }, { status: 400 });
    }

    if (
      !verifyRazorpaySubscriptionPaymentSignature({
        paymentId: razorpayPaymentId,
        subscriptionId: razorpaySubscriptionId,
        signature: razorpaySignature,
      })
    ) {
      return NextResponse.json({ error: "Invalid Razorpay subscription payment signature." }, { status: 400 });
    }

    const { data: order, error: orderError } = await supabase
      .from("host_pro_billing_orders")
      .select("id,host_user_id")
      .eq("id", billingOrderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order?.id || String(order.host_user_id ?? "") !== hostSession.hostUserId) {
      return NextResponse.json({ error: "Famlo Pro autopay billing order not found." }, { status: 404 });
    }

    const result = await verifyAndFinalizeHostProAutopaySubscription(supabase, {
      billingOrderId,
      razorpaySubscriptionId,
      razorpayPaymentId,
      razorpaySignature,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to verify Famlo Pro autopay payment." },
      { status: 400 }
    );
  }
}
