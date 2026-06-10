import { NextRequest, NextResponse } from "next/server";

import { resolveAuthorizedHostSession } from "@/lib/chat-access";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { verifyAndFinalizeHostProBillingOrder } from "@/lib/pro-billing/service";
import { verifyRazorpayPaymentSignature } from "@/lib/razorpay";
import { createAdminSupabaseClient } from "@/lib/supabase";

type VerifyBody = {
  billingOrderId?: string;
  familyId?: string;
  family_id?: string;
  durationMonths?: number;
  duration_months?: number;
  razorpay_order_id?: string;
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
    const requestedFamilyId = asString(body.familyId) || asString(body.family_id);
    const gatewayOrderId = asString(body.razorpay_order_id);
    const gatewayPaymentId = asString(body.razorpay_payment_id);
    const paymentSignature = asString(body.razorpay_signature);

    if (!billingOrderId || !requestedFamilyId || !gatewayOrderId || !gatewayPaymentId || !paymentSignature) {
      return NextResponse.json({ error: "Missing required Razorpay verification fields." }, { status: 400 });
    }

    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { familyId: requestedFamilyId });
    if (!hostAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (process.env.NODE_ENV !== "production") {
      console.info("[host.pro.billing.verify] request", {
        hostUserId: hostSession.hostUserId,
        authUserId: hostSession.authUserId ?? null,
        requestedFamilyId,
        resolvedFamilyId: hostAccess.familyId,
        billingOrderId,
        durationMonths: body.durationMonths ?? body.duration_months ?? null,
        razorpayOrderId: gatewayOrderId,
        razorpayPaymentId: gatewayPaymentId,
      });
    }

    if (
      !verifyRazorpayPaymentSignature({
        orderId: gatewayOrderId,
        paymentId: gatewayPaymentId,
        signature: paymentSignature,
      })
    ) {
      return NextResponse.json({ error: "Invalid Razorpay payment signature." }, { status: 400 });
    }
    if (process.env.NODE_ENV !== "production") {
      console.info("[host.pro.billing.verify] signature verified", {
        billingOrderId,
        familyId: hostAccess.familyId,
      });
    }

    const { data: order, error: orderError } = await supabase
      .from("host_pro_billing_orders")
      .select("id,host_user_id,source_family_id")
      .eq("id", billingOrderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order?.id || String(order.host_user_id ?? "") !== hostSession.hostUserId) {
      return NextResponse.json({ error: "Famlo Pro billing order not found." }, { status: 404 });
    }
    if (asString(order.source_family_id) && asString(order.source_family_id) !== hostAccess.familyId) {
      return NextResponse.json({ error: "Famlo Pro billing order does not belong to this property." }, { status: 403 });
    }

    const result = await verifyAndFinalizeHostProBillingOrder(supabase, {
      billingOrderId,
      gatewayOrderId,
      gatewayPaymentId,
      paymentSignature,
    });

    const verifiedFamilyId = hostAccess.familyId ?? requestedFamilyId;
    const access = await loadHostProAccess(supabase, verifiedFamilyId);
    const dashboardHref = `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(verifiedFamilyId)}&section=properties-home`;

    if (process.env.NODE_ENV !== "production") {
      console.info("[host.pro.billing.verify] subscription active", {
        billingOrderId,
        familyId: verifiedFamilyId,
        accessStatus: access.status,
        allowed: access.allowed,
        alreadyFinalized: result.alreadyFinalized,
      });
    }

    return NextResponse.json({
      success: true,
      ...result,
      familyId: verifiedFamilyId,
      dashboardHref,
      access,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[host.pro.billing.verify] failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null,
      });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to verify Famlo Pro payment." },
      { status: 400 }
    );
  }
}
