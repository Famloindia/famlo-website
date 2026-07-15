"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, BadgeIndianRupee, BarChart3, CalendarRange, ChartNoAxesCombined, RefreshCcw, Users } from "lucide-react";

import {
  buildFamloProDashboardHref,
  buildFamloProDraftRequest,
  buildFamloProPostPaymentRedirectHref,
  buildFamloProVerifyRequest,
  deriveFamloProBuyUiState,
  FAMLO_PRO_BUY_BANNER_HEADING_COLOR,
  FAMLO_PRO_BUY_BANNER_SUBTITLE,
  FAMLO_PRO_BUY_BANNER_TITLE,
  FAMLO_PRO_BUY_PAGE_ERROR_MESSAGE,
  FAMLO_PRO_FEATURE_CARDS,
  FAMLO_PRO_NO_ROOMS_MESSAGE,
  FAMLO_PRO_VALUE_CARDS,
  isFamloProBuyButtonDisabled,
} from "@/lib/pro-billing/buy-page";
import styles from "../dashboard.module.css";

type FamloPlusTabProps = {
  familyId: string;
  familyName: string;
};

type BillingPayload = {
  pricing: {
    propertyPrice: number;
    roomPrice: number;
    minimumSubtotal: number;
    gstPct: number;
    allowedDurations: number[];
  };
  setup: {
    ready: boolean;
    hostMessage?: string;
    adminMessage?: string;
    requiredMigrations?: string[];
  };
  selectedProperty: {
    familyId: string;
    propertyName: string;
    billableRoomCount: number;
    billableRoomIds: string[];
    currentSubscription?: {
      status: string | null;
      currentPeriodEnd?: string | null;
      graceUntil?: string | null;
    } | null;
    access?: {
      allowed: boolean;
      status: string | null;
      currentPeriodEnd?: string | null;
      graceUntil?: string | null;
      reason?: string | null;
    } | null;
    state?: {
      pricingReady: boolean;
      canBuy: boolean;
      canOpenProDashboard?: boolean;
      canBuyOrRenew?: boolean;
      requiresRenewal?: boolean;
    };
  } | null;
  uiState: {
    pricingReady: boolean;
    canBuy: boolean;
    canOpenProDashboard?: boolean;
    canBuyOrRenew?: boolean;
    requiresRenewal?: boolean;
  };
  debug?: {
    requestedFamilyId?: string | null;
    authUserId?: string | null;
    resolvedHostUserId?: string | null;
    resolvedHostId?: string | null;
    sessionFamilyId?: string | null;
    sourceFamilyId?: string | null;
    fallbackUsed?: boolean;
    workspacePropertiesCount?: number;
    workspacePropertyIds?: string[];
    selectedPropertyId?: string | null;
    selectedFamilyId?: string | null;
    roomCount?: number;
    roomCountSource?: string | null;
    pricingReadyReason?: string | null;
    setupReadyReason?: string | null;
    caughtErrorName?: string | null;
    caughtErrorMessage?: string | null;
  };
};

type DraftPayload = {
  durationMonths: 1 | 3 | 6;
  pricing: {
    propertyCount: number;
    roomCount: number;
    rawSubtotalAmount: number;
    subtotalAmount: number;
    gstAmount: number;
    totalAmount: number;
    propertyUnitPrice: number;
    roomUnitPrice: number;
    minimumSubtotal: number;
    gstPct: number;
    pricingVersion: string;
  };
  quote: {
    durationMonths: 1 | 3 | 6;
    monthlySubtotalAmount: number;
    monthlyGstAmount: number;
    monthlyTotalAmount: number;
    payableSubtotalAmount: number;
    payableGstAmount: number;
    payableTotalAmount: number;
    gstPct: number;
  };
};

const VALUE_CARDS = FAMLO_PRO_VALUE_CARDS;
const FEATURE_CARDS = [
  { ...FAMLO_PRO_FEATURE_CARDS[0], icon: RefreshCcw },
  { ...FAMLO_PRO_FEATURE_CARDS[1], icon: BadgeIndianRupee },
  { ...FAMLO_PRO_FEATURE_CARDS[2], icon: CalendarRange },
  { ...FAMLO_PRO_FEATURE_CARDS[3], icon: ChartNoAxesCombined },
  { ...FAMLO_PRO_FEATURE_CARDS[4], icon: BarChart3 },
  { ...FAMLO_PRO_FEATURE_CARDS[5], icon: ArrowRight },
  { ...FAMLO_PRO_FEATURE_CARDS[6], icon: Users },
  { ...FAMLO_PRO_FEATURE_CARDS[7], icon: Users },
] as const;

function formatMoney(value: number | null | undefined, digits = 0): string {
  const safeValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(safeValue);
}

function formatDate(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function addMonthsLabel(months: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + months * 30);
  return formatDate(date.toISOString());
}

function exactGst(amount: number, gstPct: number): number {
  return Math.round(amount * (gstPct / 100) * 100) / 100;
}

function loadRazorpayCheckoutScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay checkout is only available in the browser."));
  }
  if (window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
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

export default function FamloPlusTab({
  familyId,
  familyName,
}: Readonly<FamloPlusTabProps>): React.JSX.Element {
  const [billing, setBilling] = useState<BillingPayload | null>(null);
  const [draft, setDraft] = useState<DraftPayload | null>(null);
  const [durationMonths, setDurationMonths] = useState<1 | 3 | 6>(1);
  const [loading, setLoading] = useState(true);
  const [draftLoading, setDraftLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [paymentVerifying, setPaymentVerifying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingDebug, setPricingDebug] = useState<string | null>(null);
  const [activatedDashboardHref, setActivatedDashboardHref] = useState<string | null>(null);

  const loadBilling = useCallback(async (): Promise<(BillingPayload & { error?: string }) | null> => {
    setLoading(true);
    setPricingError(null);
    setPricingDebug(null);

    try {
      const response = await fetch(`/api/host/pro/billing?familyId=${encodeURIComponent(familyId)}`, { cache: "no-store" });
      const payload = (await response.json()) as BillingPayload & { error?: string };
      setBilling(payload);
      if (!response.ok || payload.setup.ready === false) {
        setPricingError(payload.setup.hostMessage ?? FAMLO_PRO_BUY_PAGE_ERROR_MESSAGE);
        if (process.env.NODE_ENV !== "production") {
          const debugMessage = `GET /api/host/pro/billing failed (${response.status}) ${
            payload.error ?? payload.setup.adminMessage ?? payload.setup.hostMessage ?? "unknown_error"
          }`;
          setPricingDebug(debugMessage);
          console.warn(debugMessage, {
            setupReady: payload.setup.ready,
            hostMessage: payload.setup.hostMessage ?? null,
            adminMessage: payload.setup.adminMessage ?? null,
            selectedPropertyId: payload.selectedProperty?.familyId ?? null,
            pricingReady: payload.uiState.pricingReady,
            canBuy: payload.uiState.canBuy,
            debug: payload.debug ?? null,
          });
        }
      }
      return payload;
    } catch (error) {
      setBilling(null);
      setPricingError(FAMLO_PRO_BUY_PAGE_ERROR_MESSAGE);
      if (process.env.NODE_ENV !== "production") {
        const debugMessage = `GET /api/host/pro/billing failed (network) ${error instanceof Error ? error.message : "unknown_error"}`;
        setPricingDebug(debugMessage);
        console.error(debugMessage, error);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadBilling();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadBilling]);

  useEffect(() => {
    const selectedProperty = billing?.selectedProperty;
    const billableRoomIds = selectedProperty?.billableRoomIds ?? [];

    if (
      !selectedProperty ||
      billableRoomIds.length === 0 ||
      billing?.setup.ready === false ||
      selectedProperty.state?.canBuyOrRenew === false
    ) {
      queueMicrotask(() => {
        setDraft(null);
        setDraftLoading(false);
      });
      return;
    }

    let active = true;
    queueMicrotask(() => {
      setPricingError(null);
      setPricingDebug(null);
      setDraftLoading(true);
    });

    const draftRequest = buildFamloProDraftRequest(selectedProperty, durationMonths);
    if (!draftRequest) {
      queueMicrotask(() => {
        setDraft(null);
        setDraftLoading(false);
      });
      return;
    }

    void fetch("/api/host/pro/billing/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draftRequest),
    })
      .then(async (response) => {
        const payload = (await response.json()) as DraftPayload & { error?: string };
        if (!response.ok) {
          const error = new Error(payload.error ?? FAMLO_PRO_BUY_PAGE_ERROR_MESSAGE);
          if (process.env.NODE_ENV !== "production") {
            const debugMessage = `POST /api/host/pro/billing/draft failed (${response.status}) ${payload.error ?? "unknown_error"}`;
            setPricingDebug(debugMessage);
            console.warn(debugMessage, {
              error: payload.error ?? null,
              selectedPropertyId: billing?.selectedProperty?.familyId ?? null,
              durationMonths,
            });
          }
          throw error;
        }
        if (!active) return;
        setDraft(payload);
      })
      .catch((error) => {
        if (!active) return;
        setDraft(null);
        setPricingError(FAMLO_PRO_BUY_PAGE_ERROR_MESSAGE);
        if (process.env.NODE_ENV !== "production") {
          const debugMessage = `POST /api/host/pro/billing/draft failed (network) ${error instanceof Error ? error.message : "unknown_error"}`;
          setPricingDebug(debugMessage);
          console.warn(debugMessage, {
            error: error instanceof Error ? error.message : String(error),
            selectedPropertyId: billing?.selectedProperty?.familyId ?? null,
            durationMonths,
          });
        }
      })
      .finally(() => {
        if (active) setDraftLoading(false);
      });

    return () => {
      active = false;
    };
  }, [billing, durationMonths]);

  const selectedProperty = billing?.selectedProperty ?? null;
  const billableRooms = selectedProperty?.billableRoomCount ?? 0;
  const noRooms = !loading && selectedProperty != null && billableRooms === 0;
  const exactMonthlyGst = draft ? exactGst(draft.pricing.subtotalAmount, draft.pricing.gstPct) : 0;
  const exactMonthlyTotal = draft ? draft.pricing.subtotalAmount + exactMonthlyGst : 0;
  const exactDurationTotal = draft ? Math.round(exactMonthlyTotal * durationMonths * 100) / 100 : 0;
  const minimumAdjustment = draft ? Math.max(0, draft.pricing.minimumSubtotal - draft.pricing.rawSubtotalAmount) : 0;
  const monthlySubtotalLabel =
    minimumAdjustment > 0 ? "Monthly subtotal (min plan)" : "Monthly subtotal";
  const canBuy = !isFamloProBuyButtonDisabled({
    loading,
    draftLoading,
    checkoutLoading: checkoutLoading || paymentVerifying,
    billableRooms,
    draft,
    pricingError,
  });
  const dashboardHref = activatedDashboardHref ?? (selectedProperty ? buildFamloProDashboardHref(selectedProperty.familyId) : null);
  const proUiState = deriveFamloProBuyUiState({
    access: selectedProperty?.access
      ? {
          allowed: selectedProperty.access.allowed,
          status: selectedProperty.access.status === "active" || selectedProperty.access.status === "grace"
            ? selectedProperty.access.status
            : selectedProperty.access.status === "halted" ||
                selectedProperty.access.status === "paused" ||
                selectedProperty.access.status === "cancelled" ||
                selectedProperty.access.status === "payment_failed" ||
                selectedProperty.access.status === "expired"
              ? selectedProperty.access.status
              : "inactive",
          currentPeriodEnd: selectedProperty.access.currentPeriodEnd ?? null,
          graceUntil: selectedProperty.access.graceUntil ?? null,
          reason: selectedProperty.access.reason ?? "unknown",
        }
      : null,
    dashboardHref,
  });
  const canBuyOrRenew = proUiState.canBuyOrRenew && canBuy;

  function openFamloProDashboard(): void {
    if (!dashboardHref || typeof window === "undefined") return;
    window.location.assign(dashboardHref);
  }

  async function verifyCompletedPayment(input: {
    billingOrderId: string;
    familyId: string;
    durationMonths: 1 | 3 | 6;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): Promise<void> {
    setPaymentVerifying(true);

    if (process.env.NODE_ENV !== "production") {
      console.info("[host.pro.billing.ui] Razorpay handler fired", {
        billingOrderId: input.billingOrderId,
        familyId: input.familyId,
        durationMonths: input.durationMonths,
        razorpayOrderId: input.razorpayOrderId,
        razorpayPaymentId: input.razorpayPaymentId,
      });
    }

    try {
      const verifyRequest = buildFamloProVerifyRequest({
        billingOrderId: input.billingOrderId,
        familyId: input.familyId,
        durationMonths: input.durationMonths,
        razorpayOrderId: input.razorpayOrderId,
        razorpayPaymentId: input.razorpayPaymentId,
        razorpaySignature: input.razorpaySignature,
      });
      const verifyResponse = await fetch("/api/host/pro/billing/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(verifyRequest),
      });
      const verifyPayload = (await verifyResponse.json()) as {
        error?: string;
        success?: boolean;
        familyId?: string | null;
        dashboardHref?: string | null;
        access?: {
          allowed?: boolean;
          status?: string | null;
        } | null;
      };

      if (process.env.NODE_ENV !== "production") {
        console.info("[host.pro.billing.ui] Verify API called", {
          status: verifyResponse.status,
          success: verifyPayload.success ?? false,
          familyId: verifyPayload.familyId ?? input.familyId,
          accessStatus: verifyPayload.access?.status ?? null,
          dashboardHref: verifyPayload.dashboardHref ?? null,
        });
      }

      if (!verifyResponse.ok || !verifyPayload.success) {
        throw new Error(verifyPayload.error ?? "Payment verification failed.");
      }

      const nextBilling = await loadBilling();
      const nextDashboardHref = buildFamloProPostPaymentRedirectHref({
        familyId: verifyPayload.familyId ?? input.familyId,
        dashboardHref: verifyPayload.dashboardHref ?? buildFamloProDashboardHref(verifyPayload.familyId ?? input.familyId),
        access: nextBilling?.selectedProperty?.access
          ? {
              allowed: nextBilling.selectedProperty.access.allowed,
              status:
                nextBilling.selectedProperty.access.status === "active" ||
                nextBilling.selectedProperty.access.status === "grace" ||
                nextBilling.selectedProperty.access.status === "halted" ||
                nextBilling.selectedProperty.access.status === "paused" ||
                nextBilling.selectedProperty.access.status === "cancelled" ||
                nextBilling.selectedProperty.access.status === "payment_failed" ||
                nextBilling.selectedProperty.access.status === "expired"
                  ? nextBilling.selectedProperty.access.status
                  : "inactive",
              currentPeriodEnd: nextBilling.selectedProperty.access.currentPeriodEnd ?? null,
              graceUntil: nextBilling.selectedProperty.access.graceUntil ?? null,
              reason: nextBilling.selectedProperty.access.reason ?? "unknown",
            }
          : verifyPayload.access
            ? {
                allowed: Boolean(verifyPayload.access.allowed),
                status:
                  verifyPayload.access.status === "active" ||
                  verifyPayload.access.status === "grace" ||
                  verifyPayload.access.status === "halted" ||
                  verifyPayload.access.status === "paused" ||
                  verifyPayload.access.status === "cancelled" ||
                  verifyPayload.access.status === "payment_failed" ||
                  verifyPayload.access.status === "expired"
                    ? verifyPayload.access.status
                    : "inactive",
                currentPeriodEnd: null,
                graceUntil: null,
                reason: "verify_response",
              }
            : null,
      });
      if (!nextDashboardHref) {
        throw new Error("Payment verified but Famlo Pro access is not active yet.");
      }
      setActivatedDashboardHref(nextDashboardHref);
      setMessage("Famlo Pro activated. Opening your Pro dashboard...");
      if (process.env.NODE_ENV !== "production") {
        console.info("[host.pro.billing.ui] Signature verified, subscription active, shifting UI", {
          familyId: verifyPayload.familyId ?? input.familyId,
          dashboardHref: nextDashboardHref,
        });
      }
      if (typeof window !== "undefined") {
        window.location.assign(nextDashboardHref);
      }
    } catch (error) {
      const nextMessage = "Payment received but activation could not be verified. Please contact Famlo.";
      setMessage(nextMessage);
      setPricingError(nextMessage);
      if (process.env.NODE_ENV !== "production") {
        console.warn("[host.pro.billing.ui] Payment verification failed", {
          billingOrderId: input.billingOrderId,
          familyId: input.familyId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      setPaymentVerifying(false);
      setCheckoutLoading(false);
    }
  }

  async function startCheckout(): Promise<void> {
    if (!selectedProperty || !draft) return;

    let checkoutOpened = false;
    setCheckoutLoading(true);
    setMessage(null);
    setPricingError(null);
    setPricingDebug(null);

    try {
      const checkoutResponse = await fetch("/api/host/pro/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          family_id: selectedProperty.familyId,
          selections: [{ familyId: selectedProperty.familyId, roomIds: selectedProperty.billableRoomIds }],
          duration_months: durationMonths,
        }),
      });
      const checkoutPayload = (await checkoutResponse.json()) as {
        error?: string;
        billingOrderId: string;
        keyId: string;
        order: { id: string; amount: number; currency: string };
      };

      if (!checkoutResponse.ok) {
        if (process.env.NODE_ENV !== "production") {
          const debugMessage = `POST /api/host/pro/billing/checkout failed (${checkoutResponse.status}) ${checkoutPayload.error ?? "unknown_error"}`;
          setPricingDebug(debugMessage);
          console.warn(debugMessage, {
            error: checkoutPayload.error ?? null,
            selectedPropertyId: selectedProperty.familyId,
            durationMonths,
          });
        }
        throw new Error(checkoutPayload.error ?? "Unable to open payment right now.");
      }

      await loadRazorpayCheckoutScript();
      if (!window.Razorpay) {
        throw new Error("Razorpay checkout is unavailable.");
      }

      const razorpay = new window.Razorpay({
        key: checkoutPayload.keyId,
        order_id: checkoutPayload.order.id,
        amount: checkoutPayload.order.amount,
        currency: checkoutPayload.order.currency,
        name: "Famlo Pro",
        description: `Famlo Pro prepaid access for ${durationMonths} month${durationMonths === 1 ? "" : "s"}`,
        handler: async (result: Record<string, unknown>) => {
          await verifyCompletedPayment({
            billingOrderId: checkoutPayload.billingOrderId,
            familyId: selectedProperty.familyId,
            durationMonths,
            razorpayOrderId: String(result.razorpay_order_id ?? ""),
            razorpayPaymentId: String(result.razorpay_payment_id ?? ""),
            razorpaySignature: String(result.razorpay_signature ?? ""),
          });
        },
        prefill: {
          name: selectedProperty.propertyName || familyName,
        },
        theme: {
          color: "#165dcc",
        },
        modal: {
          ondismiss: () => {
            if (!paymentVerifying) {
              setCheckoutLoading(false);
            }
          },
        },
      });

      razorpay.open();
      checkoutOpened = true;
    } catch (error) {
      setPricingError(error instanceof Error ? error.message : "Unable to open payment right now.");
      if (process.env.NODE_ENV !== "production") {
        const debugMessage =
          pricingDebug ?? `POST /api/host/pro/billing/checkout failed ${error instanceof Error ? error.message : "unknown_error"}`;
        setPricingDebug(debugMessage);
        console.warn(debugMessage, {
          error: error instanceof Error ? error.message : String(error),
          selectedPropertyId: selectedProperty?.familyId ?? null,
          durationMonths,
        });
      }
    } finally {
      if (!checkoutOpened) {
        setCheckoutLoading(false);
      }
    }
  }

  return (
    <div className={`${styles.flexCol} ${styles.animateIn}`} style={{ gap: "20px" }}>
      <section className={styles.glassCard} style={heroStyle}>
        <div style={{ display: "grid", gap: "10px" }}>
          <div style={eyebrowStyle}>Famlo Pro</div>
          <h2 style={headingStyle}>{FAMLO_PRO_BUY_BANNER_TITLE}</h2>
          <p style={heroCopyStyle}>{FAMLO_PRO_BUY_BANNER_SUBTITLE}</p>
        </div>

        <div style={valueGridStyle}>
          {VALUE_CARDS.map((card) => (
            <article key={card.title} style={valueCardStyle}>
              <strong style={valueCardTitleStyle}>{card.title}</strong>
              <span style={valueCardCopyStyle}>{card.copy}</span>
            </article>
          ))}
        </div>

      </section>

      {proUiState.showPricingCalculator ? (
        <section className={styles.glassCard} style={calculatorCardStyle}>
          <div style={{ display: "grid", gap: "6px" }}>
            <div style={eyebrowDarkStyle}>Pricing</div>
            <h3 style={sectionTitleStyle}>Calculate your Famlo Pro price</h3>
            <div style={propertyLabelStyle}>{selectedProperty?.propertyName ?? familyName}</div>
          </div>

          {message ? <div style={messageStyle}>{message}</div> : null}

          {pricingError ? (
            <div style={softWarningStyle}>{pricingError}</div>
          ) : null}

          {process.env.NODE_ENV !== "production" && pricingDebug ? (
            <div style={debugStateStyle}>{pricingDebug}</div>
          ) : null}

          {noRooms ? (
            <div style={softWarningStyle}>{FAMLO_PRO_NO_ROOMS_MESSAGE}</div>
          ) : null}

          {!pricingError && !noRooms ? (
            <div style={roomsCountStyle}>
              {loading ? "Loading rooms..." : `${billableRooms} room${billableRooms === 1 ? "" : "s"} counted`}
            </div>
          ) : null}

          <div style={durationGridStyle}>
            {[
              { value: 1 as const, label: "1 Month", note: "Start monthly" },
              { value: 3 as const, label: "3 Months", note: "Best for testing" },
              { value: 6 as const, label: "6 Months", note: "Best value" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setDurationMonths(option.value)}
                style={durationButtonStyle(durationMonths === option.value)}
              >
                <strong>{option.label}</strong>
                <span>{option.note}</span>
              </button>
            ))}
          </div>

          {draftLoading && !draft ? <div style={subtleStateStyle}>Calculating Pro price...</div> : null}

          {draft ? (
            <div style={calculatorGridStyle}>
              <div style={pricingSectionStyle}>
                <div style={pricingSectionHeaderStyle}>Monthly estimate</div>
                <div style={lineItemStyle}><span>Property fee / month</span><strong>{formatMoney(draft.pricing.propertyUnitPrice)}/month</strong></div>
                <div style={lineItemStyle}><span>Room fee / month</span><strong>{draft.pricing.roomCount} × {formatMoney(draft.pricing.roomUnitPrice)}/month = {formatMoney(draft.pricing.roomCount * draft.pricing.roomUnitPrice)}</strong></div>
                <div style={lineItemStyle}><span>{monthlySubtotalLabel}</span><strong>{formatMoney(draft.pricing.subtotalAmount)}</strong></div>
                <div style={lineItemStyle}><span>GST / month</span><strong>{formatMoney(exactMonthlyGst, 2)}</strong></div>
                <div style={lineItemStyle}><span>Total / month</span><strong>{formatMoney(exactMonthlyTotal, 2)}</strong></div>
              </div>
              <div style={durationSectionStyle}>
                <div style={pricingSectionHeaderStyle}>Selected duration</div>
                <div style={lineItemStyle}><span>Selected duration</span><strong>{durationMonths} month{durationMonths === 1 ? "" : "s"}</strong></div>
                <div style={lineItemStyle}><span>Base for selected duration</span><strong>{formatMoney(draft.quote.payableSubtotalAmount, 2)}</strong></div>
                <div style={lineItemStyle}><span>GST for selected duration</span><strong>{formatMoney(draft.quote.payableGstAmount, 2)}</strong></div>
                <div style={lineItemTotalStyle}><span>Total payable now</span><strong>{formatMoney(exactDurationTotal, 2)}</strong></div>
                <div style={lineItemStyle}><span>Validity estimate</span><strong>Until {addMonthsLabel(durationMonths)}</strong></div>
              </div>
            </div>
          ) : null}

          {proUiState.canBuyOrRenew ? (
            <button
              type="button"
              className={`${styles.primaryBtn} ${styles.proShineButton}`}
              disabled={!canBuyOrRenew}
              onClick={() => void startCheckout()}
              style={buyButtonStyle}
            >
              {paymentVerifying ? "Verifying payment..." : checkoutLoading ? "Opening payment..." : proUiState.ctaLabel}
            </button>
          ) : null}
        </section>
      ) : (
        <section className={styles.glassCard} style={calculatorCardStyle}>
          {message ? <div style={messageStyle}>{message}</div> : null}
          {proUiState.canOpenProDashboard && dashboardHref ? (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={openFamloProDashboard}
              style={openDashboardButtonStyle}
            >
              Open Famlo Pro Dashboard
            </button>
          ) : null}
        </section>
      )}

      <section className={styles.glassCard}>
        <div style={{ display: "grid", gap: "6px", marginBottom: "16px" }}>
          <div style={eyebrowDarkStyle}>Included with Famlo Pro</div>
          <h3 style={sectionTitleStyle}>Included with Famlo Pro</h3>
        </div>

        <div style={featureGridStyle}>
          {FEATURE_CARDS.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} style={featureCardStyle}>
                <div style={featureIconWrapStyle}>
                  <Icon size={18} />
                </div>
                <div style={{ display: "grid", gap: "8px" }}>
                  <h4 style={featureTitleStyle}>{feature.title}</h4>
                  <p style={featureCopyStyle}>{feature.description}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const heroStyle: CSSProperties = {
  background: "linear-gradient(145deg, #0e2b57 0%, #165dcc 56%, #eff6ff 165%)",
  color: "white",
  border: "none",
  display: "grid",
  gap: "20px",
};

const valueGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
};

const valueCardStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  padding: "16px",
  borderRadius: "18px",
  background: "rgba(255,255,255,0.12)",
  border: "1px solid rgba(255,255,255,0.16)",
};

const valueCardTitleStyle: CSSProperties = {
  fontSize: "15px",
  fontWeight: 900,
  color: "white",
};

const valueCardCopyStyle: CSSProperties = {
  fontSize: "13px",
  lineHeight: 1.6,
  color: "rgba(255,255,255,0.82)",
};

const calculatorCardStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
};

const propertyLabelStyle: CSSProperties = {
  color: "rgba(14,43,87,0.66)",
  fontSize: "14px",
  fontWeight: 700,
};

const roomsCountStyle: CSSProperties = {
  color: "#165dcc",
  fontSize: "14px",
  fontWeight: 800,
};

const softWarningStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: "14px",
  background: "#f8fafc",
  border: "1px solid rgba(14,43,87,0.08)",
  color: "rgba(14,43,87,0.78)",
  fontSize: "14px",
  lineHeight: 1.6,
};

const messageStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: "14px",
  background: "#eff6ff",
  border: "1px solid rgba(22,93,204,0.14)",
  color: "#165dcc",
  fontSize: "14px",
  fontWeight: 700,
};

const subtleStateStyle: CSSProperties = {
  color: "rgba(14,43,87,0.7)",
  fontSize: "14px",
  fontWeight: 700,
};

const debugStateStyle: CSSProperties = {
  color: "rgba(14,43,87,0.62)",
  fontSize: "12px",
  lineHeight: 1.5,
};

const durationGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "10px",
};

const durationButtonStyle = (active: boolean): CSSProperties => ({
  padding: "14px",
  borderRadius: "16px",
  border: active ? "1px solid rgba(22,93,204,0.3)" : "1px solid rgba(14,43,87,0.1)",
  background: active ? "rgba(22,93,204,0.08)" : "white",
  color: "#0e2b57",
  display: "grid",
  gap: "6px",
  textAlign: "left",
  cursor: "pointer",
});

const calculatorGridStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  padding: "18px",
  borderRadius: "18px",
  background: "#fbfdff",
  border: "1px solid rgba(14,43,87,0.08)",
};

const pricingSectionStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
};

const durationSectionStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  marginTop: "2px",
  borderTop: "1px solid rgba(14,43,87,0.12)",
  background: "linear-gradient(180deg, rgba(22,93,204,0.03) 0%, rgba(22,93,204,0.06) 100%)",
  borderRadius: "14px",
  padding: "14px",
};

const pricingSectionHeaderStyle: CSSProperties = {
  color: "#5b6f93",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const lineItemStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "center",
  color: "#0e2b57",
};

const lineItemTotalStyle: CSSProperties = {
  ...lineItemStyle,
  fontSize: "17px",
  fontWeight: 900,
};

const buyButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: "60px",
  borderRadius: "18px",
  background: "linear-gradient(135deg, #0f4fd1 0%, #2a7fff 48%, #0e63e6 100%)",
};

const openDashboardButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: "52px",
  borderRadius: "16px",
  border: "1px solid rgba(22,93,204,0.16)",
  background: "#eff6ff",
  color: "#165dcc",
  fontWeight: 800,
};

const featureGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px",
};

const featureCardStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  borderRadius: "18px",
  padding: "16px",
  background: "rgba(248,250,252,0.92)",
  border: "1px solid rgba(14,43,87,0.08)",
};

const featureIconWrapStyle: CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "12px",
  background: "rgba(22,93,204,0.1)",
  color: "#165dcc",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const featureTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "15px",
  fontWeight: 800,
  color: "#0e2b57",
};

const featureCopyStyle: CSSProperties = {
  margin: 0,
  fontSize: "13px",
  lineHeight: 1.6,
  color: "rgba(14,43,87,0.72)",
};

const eyebrowStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  opacity: 0.82,
};

const eyebrowDarkStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "rgba(14,43,87,0.48)",
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: "34px",
  lineHeight: 1.08,
  fontWeight: 900,
  color: FAMLO_PRO_BUY_BANNER_HEADING_COLOR,
};

const heroCopyStyle: CSSProperties = {
  margin: 0,
  maxWidth: "760px",
  fontSize: "15px",
  lineHeight: 1.8,
  color: "rgba(255,255,255,0.88)",
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "24px",
  fontWeight: 900,
  color: "#0e2b57",
};
