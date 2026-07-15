import { NextRequest, NextResponse } from "next/server";

import {
  deriveProviderEventId,
  safeParseProviderPayload,
  storePaymentProviderEvent,
  updatePaymentProviderEventStatus,
} from "@/lib/finance/provider-event-store";
import { finalizeCapturedHostProBillingOrder } from "@/lib/pro-billing/service";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";
import { createAdminSupabaseClient } from "@/lib/supabase";

type RazorpayWebhookPayload = {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        status?: string;
      };
    };
    order?: {
      entity?: {
        id?: string;
      };
    };
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const headerEventId = request.headers.get("x-razorpay-event-id");
  const payload = safeParseProviderPayload(rawBody) as RazorpayWebhookPayload;
  const eventName = asString(payload.event);
  const paymentEntity = payload.payload?.payment?.entity;
  const orderEntity = payload.payload?.order?.entity;
  const gatewayPaymentId = asString(paymentEntity?.id);
  const gatewayOrderId = asString(paymentEntity?.order_id) || asString(orderEntity?.id);
  const providerEventId = deriveProviderEventId("RAZORPAY", rawBody, headerEventId);
  const signatureValid = Boolean(signature) && verifyRazorpayWebhookSignature(rawBody, signature);
  const supabase = createAdminSupabaseClient();

  try {
    const storedEvent = await storePaymentProviderEvent(supabase, {
      provider: "RAZORPAY",
      eventId: providerEventId,
      eventType: eventName || "unknown",
      entityType: gatewayPaymentId ? "payment" : gatewayOrderId ? "order" : null,
      entityId: gatewayPaymentId || gatewayOrderId || null,
      rawPayload: payload as Record<string, unknown>,
      signatureValid,
      processingStatus: signatureValid ? "received" : "invalid_signature",
      processedAt: signatureValid ? null : new Date().toISOString(),
      errorMessage: signatureValid ? null : !signature ? "Missing Razorpay webhook signature." : "Invalid Razorpay webhook signature.",
    });

    if (storedEvent.isDuplicate) {
      return NextResponse.json({ received: true, ignored: true, duplicate: true, providerEventId });
    }

    if (!signatureValid) {
      return NextResponse.json({ error: "Invalid Razorpay webhook signature." }, { status: 400 });
    }

    if (eventName !== "payment.captured" && eventName !== "order.paid" && eventName !== "payment.failed") {
      await updatePaymentProviderEventStatus(supabase, {
        provider: "RAZORPAY",
        eventId: providerEventId,
        processingStatus: "ignored",
        processedAt: new Date().toISOString(),
        errorMessage: "unsupported_event",
      });
      return NextResponse.json({ received: true, ignored: true });
    }

    await updatePaymentProviderEventStatus(supabase, {
      provider: "RAZORPAY",
      eventId: providerEventId,
      processingStatus: "processing",
    });

    const lookup = gatewayOrderId
      ? await supabase
          .from("host_pro_billing_orders")
          .select("id,status,metadata")
          .eq("gateway_order_id", gatewayOrderId)
          .maybeSingle()
      : { data: null, error: null };
    if (lookup.error) throw lookup.error;
    if (!lookup.data?.id) {
      await updatePaymentProviderEventStatus(supabase, {
        provider: "RAZORPAY",
        eventId: providerEventId,
        processingStatus: "ignored",
        processedAt: new Date().toISOString(),
        errorMessage: "billing_order_not_found",
      });
      return NextResponse.json({ received: true, ignored: true, reason: "billing_order_not_found" });
    }

    const nowIso = new Date().toISOString();
    if (eventName === "payment.failed") {
      const { error: updateError } = await supabase
        .from("host_pro_billing_orders")
        .update({
          status: "payment_failed",
          gateway_payment_id: gatewayPaymentId || null,
          payment_failed_at: nowIso,
          provider_event_id: providerEventId,
          metadata: {
            ...((((lookup.data?.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>)),
            last_payment_status: "payment_failed",
            last_payment_at: nowIso,
            autopay_enabled: false,
          },
          updated_at: nowIso,
        } as never)
        .eq("id", lookup.data.id);
      if (updateError) throw updateError;

      await updatePaymentProviderEventStatus(supabase, {
        provider: "RAZORPAY",
        eventId: providerEventId,
        processingStatus: "processed",
        processedAt: nowIso,
      });
      return NextResponse.json({ received: true, updated: true, status: "payment_failed" });
    }

    await finalizeCapturedHostProBillingOrder(supabase, {
      billingOrderId: String(lookup.data.id),
      gatewayOrderId,
      gatewayPaymentId,
      providerPaymentStatus: asString(paymentEntity?.status) || (eventName === "order.paid" ? "captured" : ""),
      providerAmountPaise: typeof paymentEntity?.amount === "number" ? paymentEntity.amount : null,
      providerEventId,
      paidAtIso: nowIso,
    });

    await updatePaymentProviderEventStatus(supabase, {
      provider: "RAZORPAY",
      eventId: providerEventId,
      processingStatus: "processed",
      processedAt: nowIso,
    });

    return NextResponse.json({ received: true, processed: true });
  } catch (error) {
    await updatePaymentProviderEventStatus(supabase, {
      provider: "RAZORPAY",
      eventId: providerEventId,
      processingStatus: "failed",
      processedAt: new Date().toISOString(),
      errorMessage: error instanceof Error ? error.message : "Famlo Pro webhook processing failed.",
    }).catch(() => {});

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Famlo Pro webhook processing failed." },
      { status: 500 }
    );
  }
}
