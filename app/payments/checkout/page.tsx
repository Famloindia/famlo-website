"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Script from "next/script";
import { useSearchParams } from "next/navigation";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: "payment.failed", handler: (response: { error?: { description?: string; reason?: string } }) => void) => void;
    };
  }
}

function appendStatus(returnUrl: string, params: Record<string, string>): string {
  const url = new URL(returnUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

function PaymentCheckoutScreen(): React.JSX.Element {
  const searchParams = useSearchParams();
  const [scriptReady, setScriptReady] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    }),
    [searchParams]
  );

  useEffect(() => {
    if (!scriptReady || launching) return;
    if (!payload.bookingId || !payload.paymentRowId || !payload.orderId || !payload.returnUrl) {
      setError("Missing required payment checkout parameters.");
      return;
    }
    if (!window.Razorpay) {
      setError("Razorpay Checkout failed to load.");
      return;
    }

    setLaunching(true);

    const redirect = (params: Record<string, string>) => {
      window.location.href = appendStatus(payload.returnUrl, params);
    };

    const instance = new window.Razorpay({
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
  }, [launching, payload, scriptReady]);

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
          ₹{(payload.amount / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
        </div>
        {error ? (
          <div style={{ marginTop: "16px", color: "#fca5a5", fontSize: "14px" }}>{error}</div>
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
