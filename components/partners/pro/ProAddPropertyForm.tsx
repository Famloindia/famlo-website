"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  PRO_PROPERTY_MODEL_OPTIONS,
  PRO_PROPERTY_TYPE_OPTIONS,
} from "@/lib/host-pro-settings";

type FormState = {
  propertyName: string;
  city: string;
  state: string;
  country: string;
  streetAddress: string;
  propertyModel: string;
  propertyType: string;
  description: string;
};

const initialState: FormState = {
  propertyName: "",
  city: "",
  state: "",
  country: "India",
  streetAddress: "",
  propertyModel: "vacation_rental",
  propertyType: "homestay",
  description: "",
};

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top right, rgba(59,130,246,0.14), transparent 26%), linear-gradient(180deg, #071120 0%, #0b1730 100%)",
  padding: "32px 20px 56px",
};

const shellStyle: React.CSSProperties = {
  width: "min(920px, 100%)",
  margin: "0 auto",
  display: "grid",
  gap: 20,
};

const cardStyle: React.CSSProperties = {
  borderRadius: 28,
  border: "1px solid rgba(148,163,184,0.14)",
  background: "rgba(7, 18, 34, 0.84)",
  boxShadow: "0 28px 60px rgba(2, 6, 23, 0.34)",
  padding: 28,
  color: "#e5eefb",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 16,
};

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(191, 219, 254, 0.82)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 52,
  borderRadius: 16,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(15, 23, 42, 0.74)",
  color: "white",
  padding: "12px 14px",
  font: "inherit",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 132,
  resize: "vertical",
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 8,
};

const secondaryLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 48,
  borderRadius: 999,
  padding: "0 18px",
  textDecoration: "none",
  background: "rgba(255,255,255,0.08)",
  color: "#dbeafe",
  fontSize: 14,
  fontWeight: 800,
  border: "1px solid rgba(148,163,184,0.16)",
};

const primaryButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 52,
  borderRadius: 999,
  padding: "0 24px",
  border: "none",
  background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
  color: "white",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
};

type AddonCheckoutPayload = {
  addonPaymentRequired?: boolean;
  addonQuote?: {
    baseMonthlyAmount: number;
    payableSubtotalAmount: number;
    payableGstAmount: number;
    payableTotalAmount: number;
    gstPct: number;
  };
  billingOrderId?: string;
  keyId?: string;
  order?: { id: string; amount: number; currency: string };
};

function confirmPropertyAddonPayment(payload: AddonCheckoutPayload): boolean {
  const quote = payload.addonQuote;
  if (!quote || typeof window === "undefined") return true;

  return window.confirm(
    [
      "Adding this Famlo Pro property requires payment before creation.",
      "",
      `Property add-on: Rs ${quote.baseMonthlyAmount}/month`,
      `Subtotal: Rs ${quote.payableSubtotalAmount.toFixed(2)}`,
      `GST (${quote.gstPct}%): Rs ${quote.payableGstAmount.toFixed(2)}`,
      `Total payable: Rs ${quote.payableTotalAmount.toFixed(2)}`,
      "",
      "Click OK to Pay and add.",
    ].join("\n")
  );
}

async function loadRazorpayCheckoutScript(): Promise<void> {
  if (typeof window === "undefined" || window.Razorpay) return;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay checkout.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay checkout."));
    document.head.appendChild(script);
  });
}

export default function ProAddPropertyForm({
  backHref,
}: Readonly<{ backHref: string }>): React.JSX.Element {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function verifyAddonPayment(
    addon: Required<Pick<AddonCheckoutPayload, "billingOrderId">>,
    payment: { orderId: string; paymentId: string; signature: string }
  ): Promise<void> {
    const response = await fetch("/api/host/pro/addons/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        billingOrderId: addon.billingOrderId,
        razorpay_order_id: payment.orderId,
        razorpay_payment_id: payment.paymentId,
        razorpay_signature: payment.signature,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to verify property add-on payment.");
    }
  }

  async function openAddonCheckout(payload: AddonCheckoutPayload): Promise<string> {
    if (!payload.billingOrderId || !payload.keyId || !payload.order?.id || !payload.order.amount || !payload.order.currency) {
      throw new Error("Property add-on checkout is missing billing details.");
    }

    await loadRazorpayCheckoutScript();
    const RazorpayCtor = window.Razorpay;
    if (!RazorpayCtor) {
      throw new Error("Razorpay checkout is unavailable.");
    }

    return await new Promise<string>((resolve, reject) => {
      const razorpay = new RazorpayCtor({
        key: payload.keyId,
        order_id: payload.order?.id,
        amount: payload.order?.amount,
        currency: payload.order?.currency,
        name: "Famlo Pro",
        description: "Famlo Pro property add-on",
        handler: async (result: Record<string, unknown>) => {
          try {
            await verifyAddonPayment(
              { billingOrderId: payload.billingOrderId! },
              {
                orderId: String(result.razorpay_order_id ?? ""),
                paymentId: String(result.razorpay_payment_id ?? ""),
                signature: String(result.razorpay_signature ?? ""),
              }
            );
            resolve(payload.billingOrderId!);
          } catch (error) {
            reject(error);
          }
        },
        modal: {
          ondismiss: () => reject(new Error("Property add-on payment was cancelled.")),
        },
      });

      razorpay.open();
    });
  }

  async function submitCreateProperty(addonOrderId?: string): Promise<void> {
    const response = await fetch("/api/host/pro/properties/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addonOrderId ? { ...form, addonOrderId } : form),
    });

    const payload = (await response.json()) as {
      error?: string;
      redirectTo?: string;
      addonPaymentRequired?: boolean;
      billingOrderId?: string;
      keyId?: string;
      order?: { id: string; amount: number; currency: string };
      addonQuote?: {
        baseMonthlyAmount: number;
        payableSubtotalAmount: number;
        payableGstAmount: number;
        payableTotalAmount: number;
        gstPct: number;
      };
    };

    if (response.status === 402 && payload.addonPaymentRequired) {
      if (!confirmPropertyAddonPayment(payload)) {
        throw new Error("Property add-on payment is required before this property can be created.");
      }
      const paidAddonOrderId = await openAddonCheckout(payload);
      return submitCreateProperty(paidAddonOrderId);
    }

    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to create property.");
    }

    setFeedback("Property created. Opening the Pro properties workspace now.");
    router.push(payload.redirectTo ?? backHref);
    router.refresh();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFeedback(null);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        await submitCreateProperty();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to create property.");
      }
    });
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <section style={cardStyle}>
          <div style={{ display: "grid", gap: 10, marginBottom: 24 }}>
            <div style={labelStyle}>Famlo Pro</div>
            <h1 style={{ margin: 0, fontSize: "clamp(30px, 5vw, 44px)", lineHeight: 1.02, fontWeight: 900 }}>
              Add another property
            </h1>
            <p style={{ margin: 0, maxWidth: 720, color: "rgba(219,234,254,0.72)", fontSize: 15, lineHeight: 1.7 }}>
              This creates a new property under the same logged-in host account. Your host identity stays the same. You
              can add rooms, photos, and channel setup after the property is created.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 18 }}>
            <div style={gridStyle}>
              <label style={fieldStyle}>
                <span style={labelStyle}>Property Name</span>
                <input
                  style={inputStyle}
                  value={form.propertyName}
                  onChange={(event) => update("propertyName", event.target.value)}
                  required
                />
              </label>

              <label style={fieldStyle}>
                <span style={labelStyle}>Property Type</span>
                <select
                  style={inputStyle}
                  value={form.propertyType}
                  onChange={(event) => update("propertyType", event.target.value)}
                  required
                >
                  {PRO_PROPERTY_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldStyle}>
                <span style={labelStyle}>City</span>
                <input
                  style={inputStyle}
                  value={form.city}
                  onChange={(event) => update("city", event.target.value)}
                  required
                />
              </label>

              <label style={fieldStyle}>
                <span style={labelStyle}>State</span>
                <input
                  style={inputStyle}
                  value={form.state}
                  onChange={(event) => update("state", event.target.value)}
                  required
                />
              </label>

              <label style={fieldStyle}>
                <span style={labelStyle}>Country</span>
                <input
                  style={inputStyle}
                  value={form.country}
                  onChange={(event) => update("country", event.target.value)}
                  required
                />
              </label>

              <label style={fieldStyle}>
                <span style={labelStyle}>Property Model</span>
                <select
                  style={inputStyle}
                  value={form.propertyModel}
                  onChange={(event) => update("propertyModel", event.target.value)}
                  required
                >
                  {PRO_PROPERTY_MODEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label style={fieldStyle}>
              <span style={labelStyle}>Street Address</span>
              <textarea
                style={textareaStyle}
                value={form.streetAddress}
                onChange={(event) => update("streetAddress", event.target.value)}
                required
              />
            </label>

            <label style={fieldStyle}>
              <span style={labelStyle}>Short Description</span>
              <textarea
                style={textareaStyle}
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
                placeholder="Optional now. You can refine story and content later from Pro."
              />
            </label>

            {feedback ? (
              <div style={{ ...fieldStyle, borderRadius: 18, padding: 14, background: "rgba(34,197,94,0.14)", color: "#bbf7d0" }}>
                {feedback}
              </div>
            ) : null}

            {errorMessage ? (
              <div style={{ ...fieldStyle, borderRadius: 18, padding: 14, background: "rgba(244,63,94,0.12)", color: "#fecdd3" }}>
                {errorMessage}
              </div>
            ) : null}

            <div style={buttonRowStyle}>
              <a href={backHref} style={secondaryLinkStyle}>
                Back to Pro
              </a>
              <button type="submit" style={primaryButtonStyle} disabled={isPending}>
                {isPending ? "Creating property..." : "Create property"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
