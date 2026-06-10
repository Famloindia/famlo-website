import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import {
  createRefundRequestDraft,
  resolveRefundPolicyInputFromRequest,
} from "@/lib/finance/refund-requests";
import type { RefundPolicyCase } from "@/lib/finance/refund-policy";
import { createAdminSupabaseClient } from "@/lib/supabase";

type RefundBody = {
  bookingId?: string;
  paymentId?: string;
  reason?: string;
  adminId?: string;
  policyCase?: RefundPolicyCase;
  retentionPercent?: number;
  roomBaseAmount?: number;
  accommodationGstAmount?: number;
  nights?: Array<{ actualValue: number }>;
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
    const policyCase = (body.policyCase ?? "FREE_CANCELLATION") as RefundPolicyCase;

    if (!bookingId || !paymentId) {
      return NextResponse.json({ error: "bookingId and paymentId are required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: payment, error: paymentError } = await supabase
      .from("payments_v2")
      .select("id,booking_id,amount_total,tax_amount,gateway,gateway_payment_id,refund_status,status")
      .eq("id", paymentId)
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (paymentError) throw paymentError;
    if (!payment) {
      return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    }

    const policyInput = resolveRefundPolicyInputFromRequest({
      policyCase,
      bookingAmount: Number(payment.amount_total ?? 0),
      paymentTaxAmount: Number(payment.tax_amount ?? 0),
      roomBaseAmount: body.roomBaseAmount,
      accommodationGstAmount: body.accommodationGstAmount,
      retentionPercent: body.retentionPercent,
      nights: body.nights,
    });

    const result = await createRefundRequestDraft(supabase, payment, {
      bookingId,
      paymentId,
      reason,
      actorUserId: adminId,
      policyInput,
    });

    return NextResponse.json({
      success: true,
      refundRequestId: result.refundRequestId,
      status: result.requiresAdminApproval ? "requested" : "approved",
      requiresAdminApproval: result.requiresAdminApproval,
      refundAmount: result.policy.refundAmount,
      refundBaseAmount: result.policy.refundBaseAmount,
      refundGstAmount: result.policy.refundGstAmount,
      policyCase: result.policy.policyCase,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create refund request." },
      { status: 500 }
    );
  }
}
