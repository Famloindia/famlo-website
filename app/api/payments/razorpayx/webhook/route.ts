import { NextRequest, NextResponse } from "next/server";

import { applyRazorpayXPayoutWebhook } from "@/lib/finance/payout-execution-engine";
import {
  deriveProviderEventId,
  safeParseProviderPayload,
  storePaymentProviderEvent,
  updatePaymentProviderEventStatus,
} from "@/lib/finance/provider-event-store";
import { verifyRazorpayXWebhookSignature } from "@/lib/razorpay";
import { createAdminSupabaseClient } from "@/lib/supabase";

type RazorpayXPayoutWebhookPayload = {
  event?: string;
  payload?: {
    payout?: {
      entity?: {
        id?: string;
        status?: string;
        reference_id?: string;
        fund_account_id?: string;
      };
    };
  };
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature") ?? "";
    const headerEventId = request.headers.get("x-razorpay-event-id");
    const payload = safeParseProviderPayload(rawBody) as RazorpayXPayoutWebhookPayload;
    const eventName = String(payload.event ?? "");
    const payoutEntity = payload.payload?.payout?.entity;
    const providerEventId = deriveProviderEventId("RAZORPAYX", rawBody, headerEventId);
    const signatureValid = Boolean(signature) && verifyRazorpayXWebhookSignature(rawBody, signature);
    const supabase = createAdminSupabaseClient();

    const storedEvent = await storePaymentProviderEvent(supabase, {
      provider: "RAZORPAYX",
      eventId: providerEventId,
      eventType: eventName || "unknown",
      entityType: "payout",
      entityId: asString(payoutEntity?.id),
      rawPayload: payload as Record<string, unknown>,
      signatureValid,
      processingStatus: signatureValid ? "received" : "invalid_signature",
      processedAt: signatureValid ? null : new Date().toISOString(),
      errorMessage: signatureValid ? null : !signature ? "Missing RazorpayX webhook signature." : "Invalid RazorpayX webhook signature.",
    });

    if (storedEvent.isDuplicate) {
      return NextResponse.json({ received: true, ignored: true, duplicate: true, providerEventId });
    }

    if (!signatureValid) {
      return NextResponse.json(
        { error: !signature ? "Missing RazorpayX webhook signature." : "Invalid RazorpayX webhook signature." },
        { status: 400 }
      );
    }

    await updatePaymentProviderEventStatus(supabase, {
      provider: "RAZORPAYX",
      eventId: providerEventId,
      processingStatus: "processing",
    });

    const result = await applyRazorpayXPayoutWebhook(supabase, {
      eventName,
      providerPayoutId: asString(payoutEntity?.id),
      referenceId: asString(payoutEntity?.reference_id),
      providerStatus: asString(payoutEntity?.status),
      rawPayload: payload as Record<string, unknown>,
    });

    await updatePaymentProviderEventStatus(supabase, {
      provider: "RAZORPAYX",
      eventId: providerEventId,
      processingStatus: result.ignored ? "ignored" : "processed",
      processedAt: new Date().toISOString(),
      errorMessage: result.ignored ? "payout_execution_not_found_or_already_applied" : null,
    });

    return NextResponse.json({
      received: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process RazorpayX webhook." },
      { status: 500 }
    );
  }
}
