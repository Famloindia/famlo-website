export type CashfreeCheckoutOrder = {
  provider: "cashfree";
  orderId: string;
  paymentSessionId: string;
  amount: number;
  currency: string;
  bookingId: string;
  paymentRowId: string;
  mode: "sandbox" | "production";
};

export async function ensureCashfreeCheckout(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.Cashfree) return;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-cashfree-checkout="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Cashfree Checkout.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.async = true;
    script.dataset.cashfreeCheckout = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Cashfree Checkout."));
    document.body.appendChild(script);
  });
}

export async function openCashfreeCheckout(order: CashfreeCheckoutOrder): Promise<{
  error?: unknown;
  redirect?: boolean;
  paymentDetails?: { paymentMessage?: string };
}> {
  await ensureCashfreeCheckout();
  const CashfreeCheckout = window.Cashfree;
  if (!CashfreeCheckout) {
    throw new Error("Cashfree Checkout is unavailable.");
  }

  return (
    (await CashfreeCheckout({ mode: order.mode }).checkout({
      paymentSessionId: order.paymentSessionId,
      redirectTarget: "_modal",
    })) ?? {}
  );
}

export async function sendCashfreeReturnAdvisory(order: CashfreeCheckoutOrder): Promise<void> {
  await fetch("/api/payments/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "cashfree",
      bookingId: order.bookingId,
      paymentRowId: order.paymentRowId,
      order_id: order.orderId,
    }),
  });
}
