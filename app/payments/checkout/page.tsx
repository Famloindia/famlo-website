"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import { useSearchParams } from "next/navigation";

type CheckoutBreakdown = {
  roomBaseAmount: number;
  accommodationGstAmount: number;
  guestPayableAmount: number;
  calculationVersion: string | null;
  famloPlatformFeeInclGst: number;
  famloPlatformFeeTaxable: number;
  famloPlatformFeeGst: number;
  hostGrossPayout: number;
  gatewayFeeEstimate: number;
};

function formatInr(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function parseCheckoutBreakdown(value: string | null): CheckoutBreakdown | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CheckoutBreakdown>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      roomBaseAmount: Number(parsed.roomBaseAmount ?? 0),
      accommodationGstAmount: Number(parsed.accommodationGstAmount ?? 0),
      guestPayableAmount: Number(parsed.guestPayableAmount ?? 0),
      calculationVersion: typeof parsed.calculationVersion === "string" ? parsed.calculationVersion : null,
      famloPlatformFeeInclGst: Number(parsed.famloPlatformFeeInclGst ?? 0),
      famloPlatformFeeTaxable: Number(parsed.famloPlatformFeeTaxable ?? 0),
      famloPlatformFeeGst: Number(parsed.famloPlatformFeeGst ?? 0),
      hostGrossPayout: Number(parsed.hostGrossPayout ?? 0),
      gatewayFeeEstimate: Number(parsed.gatewayFeeEstimate ?? 0),
    };
  } catch {
    return null;
  }
}

function appendStatus(returnUrl: string, params: Record<string, string>): string {
  const fallbackBase =
    typeof window !== "undefined" ? window.location.origin : "https://www.famlo.in";
  const url = new URL(returnUrl || "/bookings", fallbackBase);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

function PaymentCheckoutScreen(): React.JSX.Element {
  const searchParams = useSearchParams();
  const [scriptReady, setScriptReady] = useState(false);
  const launchedRef = useRef(false);

  const payload = useMemo(
    () => ({
      bookingId: searchParams.get("bookingId") ?? "",
      paymentRowId: searchParams.get("paymentRowId") ?? "",
      orderId: searchParams.get("orderId") ?? "",
      keyId: searchParams.get("keyId") ?? "",
      amount: Number(searchParams.get("amount") ?? 0),
      currency: searchParams.get("currency") ?? "INR",
      returnUrl: searchParams.get("returnUrl") ?? "",
      name: searchParams.get("name") ?? "",
      email: searchParams.get("email") ?? "",
      phone: searchParams.get("phone") ?? "",
      listingName: searchParams.get("listingName") ?? "Famlo booking",
      checkoutBreakdown: parseCheckoutBreakdown(searchParams.get("checkoutBreakdown")),
    }),
    [searchParams]
  );

  const blockingError = useMemo(() => {
    if (!payload.bookingId || !payload.paymentRowId || !payload.orderId || !payload.returnUrl) {
      return "Missing required payment checkout parameters.";
    }
    if (scriptReady && !window.Razorpay) {
      return "Razorpay Checkout failed to load.";
    }
    return null;
  }, [payload.bookingId, payload.orderId, payload.paymentRowId, payload.returnUrl, scriptReady]);

  useEffect(() => {
    if (!scriptReady || launchedRef.current) return;
    if (blockingError) {
      return;
    }
    launchedRef.current = true;

    const redirect = (params: Record<string, string>) => {
      const bookingUrl = payload.bookingId
        ? `/bookings?bookingId=${encodeURIComponent(payload.bookingId)}`
        : "/bookings";
      const nextUrl =
        params.status === "success"
          ? appendStatus(bookingUrl, params)
          : appendStatus(payload.returnUrl || bookingUrl, params);
      window.location.assign(nextUrl);
    };

    const RazorpayCheckout = window.Razorpay;
    if (!RazorpayCheckout) {
      return;
    }

    const instance = new RazorpayCheckout({
      key: payload.keyId,
      amount: payload.amount,
      currency: payload.currency,
      name: "Famlo",
      description: payload.listingName,
      order_id: payload.orderId,
      prefill: {
        name: payload.name || undefined,
        email: payload.email || undefined,
        contact: payload.phone || undefined,
      },
      notes: {
        booking_id: payload.bookingId,
        payment_row_id: payload.paymentRowId,
      },
      handler: async (response: Record<string, string>) => {
        try {
          const verifyResponse = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookingId: payload.bookingId,
              paymentRowId: payload.paymentRowId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });

          const data = (await verifyResponse.json()) as { error?: string };
          if (!verifyResponse.ok || data.error) {
            throw new Error(data.error ?? "Payment verification failed.");
          }

          redirect({
            status: "success",
            bookingId: payload.bookingId,
            paymentRowId: payload.paymentRowId,
            gatewayPaymentId: response.razorpay_payment_id ?? "",
          });
        } catch (verifyError) {
          redirect({
            status: "failed",
            bookingId: payload.bookingId,
            paymentRowId: payload.paymentRowId,
            reason: verifyError instanceof Error ? verifyError.message : "Payment verification failed.",
          });
        }
      },
      modal: {
        ondismiss: () => {
          redirect({
            status: "cancelled",
            bookingId: payload.bookingId,
            paymentRowId: payload.paymentRowId,
          });
        },
      },
      theme: {
        color: "#165dcc",
      },
    });

    instance.open();
  }, [blockingError, payload, scriptReady]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#020617",
        display: "grid",
        placeItems: "center",
        color: "white",
        fontFamily: "Inter, sans-serif",
        padding: "32px",
      }}
    >
      <Script src="https://checkout.razorpay.com/v1/checkout.js" onLoad={() => setScriptReady(true)} />
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "24px",
          padding: "28px",
        }}
      >
        <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.08em", opacity: 0.6, textTransform: "uppercase" }}>
          Secure Checkout
        </div>
        <h1 style={{ margin: "10px 0 8px", fontSize: "28px", fontWeight: 900 }}>Opening Razorpay…</h1>
        <p style={{ margin: 0, opacity: 0.72, lineHeight: 1.6 }}>
          Stay on this page while Famlo opens the payment sheet. If the sheet closes, you will be redirected back to the app.
        </p>
        <div style={{ marginTop: "18px", fontSize: "18px", fontWeight: 800 }}>
          {formatInr(payload.amount / 100)}
        </div>
        {payload.checkoutBreakdown ? (
          <div
            style={{
              marginTop: "18px",
              display: "grid",
              gap: "10px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "18px",
              padding: "16px",
              fontSize: "14px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
              <span style={{ opacity: 0.72 }}>Room price</span>
              <strong>{formatInr(payload.checkoutBreakdown.roomBaseAmount)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
              <span style={{ opacity: 0.72 }}>GST / taxes</span>
              <strong>{formatInr(payload.checkoutBreakdown.accommodationGstAmount)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "10px" }}>
              <span style={{ opacity: 0.9, fontWeight: 700 }}>Total payable</span>
              <strong>{formatInr(payload.checkoutBreakdown.guestPayableAmount || payload.amount / 100)}</strong>
            </div>
            <div style={{ color: "rgba(255,255,255,0.62)", lineHeight: 1.5 }}>
              GST and applicable taxes are calculated based on accommodation tariff and applicable law.
            </div>
          </div>
        ) : null}
        {blockingError ? (
          <div style={{ marginTop: "16px", color: "#fca5a5", fontSize: "14px" }}>{blockingError}</div>
        ) : (
          <div style={{ marginTop: "16px", color: "#93c5fd", fontSize: "14px" }}>
            {scriptReady ? "Payment sheet ready." : "Loading secure payment script…"}
          </div>
        )}
      </div>
    </main>
  );
}

export default function PaymentCheckoutPage(): React.JSX.Element {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "#0e2b57", fontWeight: 700 }}>Preparing checkout...</div>}>
      <PaymentCheckoutScreen />
    </Suspense>
  );
}
