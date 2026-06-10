import { NextRequest, NextResponse } from "next/server";

import {
  deriveProviderEventId,
  safeParseProviderPayload,
  storePaymentProviderEvent,
  updatePaymentProviderEventStatus,
} from "@/lib/finance/provider-event-store";
import {
  parseRazorpaySubscriptionWebhook,
  verifyRazorpayWebhookSignature,
} from "@/lib/pro-billing/razorpay-subscriptions";
import { processHostProAutopayWebhook } from "@/lib/pro-billing/service";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const headerEventId = request.headers.get("x-razorpay-event-id");
  const parsedPayload = safeParseProviderPayload(rawBody);
  const normalized = parseRazorpaySubscriptionWebhook(parsedPayload);
  const providerEventId = deriveProviderEventId("RAZORPAY", rawBody, headerEventId);
  const signatureValid = Boolean(signature) && verifyRazorpayWebhookSignature(rawBody, signature);
  const supabase = createAdminSupabaseClient();

  try {
    const storedEvent = await storePaymentProviderEvent(supabase, {
      provider: "RAZORPAY",
      eventId: providerEventId,
      eventType: normalized.eventName,
      entityType: normalized.subscriptionId ? "subscription" : normalized.paymentId ? "payment" : null,
      entityId: normalized.subscriptionId ?? normalized.paymentId ?? null,
      rawPayload: normalized.rawPayload,
      signatureValid,
      processingStatus: signatureValid ? "received" : "invalid_signature",
      processedAt: signatureValid ? null : new Date().toISOString(),
      errorMessage: signatureValid ? null : "Invalid Razorpay webhook signature.",
    });

    if (storedEvent.isDuplicate) {
      return NextResponse.json({ received: true, duplicate: true, providerEventId });
    }

    if (!signatureValid) {
      return NextResponse.json({ error: "Invalid Razorpay webhook signature." }, { status: 400 });
    }

    await updatePaymentProviderEventStatus(supabase, {
      provider: "RAZORPAY",
      eventId: providerEventId,
      processingStatus: "processing",
    });

    const result = await processHostProAutopayWebhook(supabase, {
      eventName: normalized.eventName,
      providerEventId,
      razorpaySubscriptionId: normalized.subscriptionId,
      razorpayPaymentId: normalized.paymentId,
      razorpayInvoiceId: normalized.invoiceId,
      paymentStatus: normalized.paymentStatus,
      subscriptionStatus: normalized.subscriptionStatus,
      amountPaise: normalized.amountPaise,
      paidAtIso: normalized.capturedAtIso,
      chargeAtIso: normalized.chargeAtIso,
      notes: normalized.notes,
      failureReason: normalized.failureReason,
    });

    await updatePaymentProviderEventStatus(supabase, {
      provider: "RAZORPAY",
      eventId: providerEventId,
      processingStatus: "processed",
      processedAt: new Date().toISOString(),
      errorMessage: result.action,
    });

    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    await updatePaymentProviderEventStatus(supabase, {
      provider: "RAZORPAY",
      eventId: providerEventId,
      processingStatus: "failed",
      processedAt: new Date().toISOString(),
      errorMessage: error instanceof Error ? error.message : "Famlo Pro autopay webhook processing failed.",
    }).catch(() => {});

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Famlo Pro autopay webhook processing failed." },
      { status: 500 }
    );
  }
}
