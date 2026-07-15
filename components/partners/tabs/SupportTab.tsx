"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Loader2,
  Send,
} from "lucide-react";

import styles from "../dashboard.module.css";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved";
  admin_reply: string | null;
  created_at: string;
}

type BillingWorkspace = {
  selectedProperty?: {
    access?: {
      status?: string | null;
      currentPeriodEnd?: string | null;
      graceUntil?: string | null;
    } | null;
    currentSubscription?: {
      status?: string | null;
      currentPeriodEnd?: string | null;
      monthlyTotalAmount?: number | null;
    } | null;
    latestOrder?: {
      status?: string | null;
      totalAmount?: number | null;
      paymentCapturedAt?: string | null;
      createdAt?: string | null;
      invoiceId?: string | null;
    } | null;
    state?: {
      canBuyOrRenew?: boolean;
      requiresRenewal?: boolean;
    } | null;
  } | null;
  recentOrders?: Array<{
    id?: string | null;
    status?: string | null;
    total_amount?: number | null;
    payment_captured_at?: string | null;
    created_at?: string | null;
    invoice_id?: string | null;
    metadata?: {
      duration_months?: number | null;
    } | null;
    invoice?: {
      id?: string | null;
      invoiceNumber?: string | null;
      invoiceDate?: string | null;
      paymentDate?: string | null;
      status?: string | null;
      totalPaid?: number | null;
      planDurationMonths?: number | null;
      subscriptionPeriodStart?: string | null;
      subscriptionPeriodEnd?: string | null;
      emailStatus?: string | null;
      emailSentAt?: string | null;
      emailError?: string | null;
      whatsappStatus?: string | null;
      whatsappSentAt?: string | null;
      whatsappError?: string | null;
      downloadHref?: string | null;
    } | null;
  }>;
};

interface SupportTabProps {
  familyId: string;
  hostCode: string;
  hostName: string;
  propertyName?: string;
  appearanceMode?: "dark" | "light";
}

type LatestBillingOrder = NonNullable<
  NonNullable<BillingWorkspace["selectedProperty"]>["latestOrder"]
>;
type RecentBillingOrder = NonNullable<BillingWorkspace["recentOrders"]>[number];

const QUERY_CATEGORIES = [
  "Booking issue",
  "Payout issue",
  "OTA / Channel sync issue",
  "Calendar / inventory issue",
  "Property / host profile issue",
  "Famlo Pro setup help",
  "Other",
] as const;

const FAQ_SECTIONS = [
  {
    id: "billing",
    title: "When does Pay now appear?",
    content: "Famlo Pro shows Pay now only when the current subscription is within 5 days of expiry, based on the saved active period.",
  },
  {
    id: "documents",
    title: "Where do my documents come from?",
    content: "The Pro documents area reuses the same onboarding and compliance document paths already used by the host dashboard.",
  },
  {
    id: "profile",
    title: "How is host profile data connected?",
    content: "Host name, phone, languages, photos, and reel continue to use the existing onboarding or public profile media paths where they are already available.",
  },
  {
    id: "payouts",
    title: "Why can payout still be blocked?",
    content: "Payout release still depends on PAN/KYC, payout account readiness, and settlement state. This page does not change payout logic.",
  },
  {
    id: "support",
    title: "How do I get help?",
    content: "Use Raise New Query to send the current property context to Team Famlo for booking, payout, OTA, billing, or setup help.",
  },
] as const;

function formatTicketDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Amount pending";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getOrderTotalAmount(
  order: LatestBillingOrder | RecentBillingOrder | null | undefined
): number | null {
  if (!order) return null;
  if ("totalAmount" in order && typeof order.totalAmount === "number") {
    return order.totalAmount;
  }
  if ("total_amount" in order && typeof order.total_amount === "number") {
    return order.total_amount;
  }
  return null;
}

function addMonthsToIsoDate(value: string | null | undefined, months: number): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const next = new Date(date);
  next.setMonth(next.getMonth() + Math.max(1, months));
  return next.toISOString();
}

function formatPeriod(start: string | null | undefined, end: string | null | undefined): string {
  if (start && end) {
    return `${formatTicketDate(start)} to ${formatTicketDate(end)}`;
  }
  return "Period pending";
}

function formatStatusLabel(value: string | null | undefined): string {
  if (!value) return "Not available";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function SupportTab({
  familyId,
  hostCode,
  hostName,
  propertyName,
  appearanceMode = "light",
}: SupportTabProps) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [category, setCategory] = useState<(typeof QUERY_CATEGORIES)[number]>("Booking issue");
  const [relatedRoom, setRelatedRoom] = useState("");
  const [relatedBooking, setRelatedBooking] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showFaqView, setShowFaqView] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [billingWorkspace, setBillingWorkspace] = useState<BillingWorkspace | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);

  const supabase = createBrowserSupabaseClient();
  const isDarkTheme = appearanceMode === "dark";

  const palette = useMemo(
    () => ({
      pageBg: isDarkTheme ? "transparent" : "transparent",
      heroBackground: isDarkTheme
        ? "linear-gradient(135deg, rgba(12, 26, 54, 0.98) 0%, rgba(21, 87, 201, 0.96) 100%)"
        : "linear-gradient(135deg, #eef5ff 0%, #dbeafe 100%)",
      heroText: isDarkTheme ? "#f8fbff" : "#0f172a",
      heroSubtext: isDarkTheme ? "rgba(226, 232, 240, 0.9)" : "#334155",
      cardBackground: isDarkTheme ? "rgba(10, 17, 32, 0.78)" : "#ffffff",
      cardBorder: isDarkTheme ? "rgba(148, 163, 184, 0.16)" : "rgba(148, 163, 184, 0.22)",
      mutedBackground: isDarkTheme ? "rgba(15, 23, 42, 0.72)" : "#f8fafc",
      mutedBorder: isDarkTheme ? "rgba(148, 163, 184, 0.16)" : "#e2e8f0",
      title: isDarkTheme ? "#f8fafc" : "#0f172a",
      body: isDarkTheme ? "rgba(226, 232, 240, 0.86)" : "#475569",
      subtle: isDarkTheme ? "rgba(148, 163, 184, 0.9)" : "#64748b",
      fieldBackground: isDarkTheme ? "rgba(15, 23, 42, 0.92)" : "#f8fafc",
      fieldText: isDarkTheme ? "#f8fafc" : "#0f172a",
      fieldBorder: isDarkTheme ? "rgba(148, 163, 184, 0.22)" : "#cbd5e1",
      primaryButtonBackground: isDarkTheme ? "#dbeafe" : "#165dcc",
      primaryButtonText: isDarkTheme ? "#0f172a" : "#ffffff",
      secondaryButtonBackground: isDarkTheme ? "rgba(255, 255, 255, 0.06)" : "#ffffff",
      secondaryButtonText: isDarkTheme ? "#f8fafc" : "#165dcc",
      secondaryButtonBorder: isDarkTheme ? "rgba(148, 163, 184, 0.2)" : "rgba(22, 93, 204, 0.18)",
      successBackground: isDarkTheme ? "rgba(22, 163, 74, 0.18)" : "#ecfdf5",
      successBorder: isDarkTheme ? "rgba(74, 222, 128, 0.28)" : "#a7f3d0",
      successText: isDarkTheme ? "#bbf7d0" : "#166534",
      errorBackground: isDarkTheme ? "rgba(127, 29, 29, 0.28)" : "#fef2f2",
      errorBorder: isDarkTheme ? "rgba(248, 113, 113, 0.32)" : "#fecaca",
      errorText: isDarkTheme ? "#fecaca" : "#b91c1c",
    }),
    [isDarkTheme]
  );

  const renewalDeadline = useMemo(() => {
    return (
      billingWorkspace?.selectedProperty?.currentSubscription?.currentPeriodEnd ??
      billingWorkspace?.selectedProperty?.access?.currentPeriodEnd ??
      billingWorkspace?.selectedProperty?.access?.graceUntil ??
      null
    );
  }, [billingWorkspace]);

  const isRenewalDueSoon = useMemo(() => {
    if (!renewalDeadline) return false;
    const endDate = new Date(renewalDeadline);
    if (Number.isNaN(endDate.getTime())) return false;
    const today = new Date();
    const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / 86_400_000);
    return diffDays >= 0 && diffDays <= 5;
  }, [renewalDeadline]);

  const billingCardTone = isRenewalDueSoon
    ? {
        border: isDarkTheme ? "rgba(248, 113, 113, 0.28)" : "#fecaca",
        background: isDarkTheme ? "rgba(127, 29, 29, 0.28)" : "#fef2f2",
      }
    : {
        border: palette.cardBorder,
        background: palette.cardBackground,
      };

  const latestInvoice = (billingWorkspace?.recentOrders ?? [])
    .map((order) => order.invoice)
    .find((invoice) => Boolean(invoice?.id));
  const latestOrder = billingWorkspace?.selectedProperty?.latestOrder ?? billingWorkspace?.recentOrders?.[0] ?? null;
  const derivedSubscriptionLabel = useMemo(() => {
    const currentSubscriptionStatus = billingWorkspace?.selectedProperty?.currentSubscription?.status;
    if (currentSubscriptionStatus) return formatStatusLabel(currentSubscriptionStatus);

    const accessStatus = billingWorkspace?.selectedProperty?.access?.status;
    if (accessStatus) return formatStatusLabel(accessStatus);

    const latestOrderStatus = latestOrder?.status ?? null;
    if (latestOrderStatus === "paid" || latestOrderStatus === "captured" || latestOrderStatus === "succeeded") {
      return "Active";
    }
    if (latestOrderStatus === "payment_pending" || latestOrderStatus === "created" || latestOrderStatus === "authorized") {
      return "Pending Activation";
    }

    return "Not available";
  }, [billingWorkspace, latestOrder]);
  const derivedCurrentAmount = useMemo(() => {
    if (typeof billingWorkspace?.selectedProperty?.currentSubscription?.monthlyTotalAmount === "number") {
      return formatCurrency(billingWorkspace.selectedProperty.currentSubscription.monthlyTotalAmount);
    }
    const latestOrderTotalAmount = getOrderTotalAmount(latestOrder);
    if (typeof latestOrderTotalAmount === "number") {
      return formatCurrency(latestOrderTotalAmount);
    }
    if (typeof latestInvoice?.totalPaid === "number") {
      return formatCurrency(latestInvoice.totalPaid);
    }
    return "Pending";
  }, [billingWorkspace, latestInvoice, latestOrder]);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("host_id", hostCode)
      .order("created_at", { ascending: false });

    if (!error && data) setTickets(data);
    setLoading(false);
  }, [hostCode, supabase]);

  useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    let cancelled = false;
    async function loadBilling() {
      setBillingLoading(true);
      try {
        const response = await fetch(`/api/host/pro/billing?familyId=${encodeURIComponent(familyId)}`, { cache: "no-store" });
        const payload = (await response.json()) as BillingWorkspace;
        if (!cancelled) setBillingWorkspace(payload);
      } catch {
        if (!cancelled) setBillingWorkspace(null);
      } finally {
        if (!cancelled) setBillingLoading(false);
      }
    }
    void loadBilling();
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim()) return;

    setSubmitting(true);
    setFeedback(null);

    const subject = `${category}${propertyName ? ` · ${propertyName}` : ""}`;
    const composedMessage = [
      `Category: ${category}`,
      propertyName ? `Property: ${propertyName}` : null,
      relatedRoom.trim() ? `Related room: ${relatedRoom.trim()}` : null,
      relatedBooking.trim() ? `Related booking: ${relatedBooking.trim()}` : null,
      `Family ID: ${familyId}`,
      "",
      message.trim(),
    ]
      .filter(Boolean)
      .join("\n");

    const { error } = await supabase.from("support_tickets").insert({
      host_id: hostCode,
      host_name: hostName,
      subject,
      message: composedMessage,
      status: "open",
    });

    if (error) {
      setFeedback({
        type: "error",
        text: error.message || "Unable to send your query right now.",
      });
      setSubmitting(false);
      return;
    }

    setFeedback({
      type: "success",
      text: "Your query has been sent to Team Famlo.",
    });
    setCategory("Booking issue");
    setRelatedRoom("");
    setRelatedBooking("");
    setMessage("");
    setShowForm(false);
    setSubmitting(false);
    void fetchTickets();
  };

  return (
    <div className={`${styles.flexCol} ${styles.animateIn}`} style={{ gap: "24px", background: palette.pageBg }}>
      <div style={{ display: "grid", gap: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "4px" }}>
            <div style={{ color: palette.title, fontSize: "16px", fontWeight: 900 }}>Famlo Pro Guide</div>
            <div style={{ color: palette.body, fontSize: "13px" }}>How to use Famlo Pro</div>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((current) => !current)}
            style={{
              padding: "12px 18px",
              borderRadius: "14px",
              background: palette.primaryButtonBackground,
              color: palette.primaryButtonText,
              border: "none",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            {showForm ? "Cancel Query" : "Raise New Query"}
          </button>
        </div>
        <div
          aria-hidden="true"
          style={{
            height: "1px",
            width: "100%",
            background: isDarkTheme
              ? "linear-gradient(90deg, rgba(148,163,184,0) 0%, rgba(148,163,184,0.4) 18%, rgba(59,130,246,0.48) 50%, rgba(148,163,184,0.4) 82%, rgba(148,163,184,0) 100%)"
              : "linear-gradient(90deg, rgba(148,163,184,0) 0%, rgba(148,163,184,0.42) 18%, rgba(37,99,235,0.32) 50%, rgba(148,163,184,0.42) 82%, rgba(148,163,184,0) 100%)",
          }}
        />
      </div>

      <label style={{ display: "grid", gap: "8px" }}>
        <span style={{ fontSize: "12px", fontWeight: 800, color: palette.subtle, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Search
        </span>
        <input
          readOnly
          placeholder="Search booking, calendar, OTA, payout, property"
          style={{
            width: "100%",
            padding: "13px 14px",
            borderRadius: "14px",
            border: `1px solid ${palette.fieldBorder}`,
            background: palette.fieldBackground,
            color: palette.fieldText,
            fontFamily: "inherit",
          }}
        />
      </label>

      {feedback ? (
        <div
          style={{
            borderRadius: "18px",
            padding: "14px 16px",
            border: `1px solid ${feedback.type === "success" ? palette.successBorder : palette.errorBorder}`,
            background: feedback.type === "success" ? palette.successBackground : palette.errorBackground,
            color: feedback.type === "success" ? palette.successText : palette.errorText,
            fontSize: "14px",
            fontWeight: 700,
          }}
        >
          {feedback.text}
        </div>
      ) : null}

      {showForm ? (
        <form
          onSubmit={handleSubmit}
          className={styles.glassCard}
          style={{
            background: palette.cardBackground,
            border: `1px solid ${palette.cardBorder}`,
            borderRadius: "24px",
            padding: "24px",
            display: "grid",
            gap: "18px",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 900, color: palette.title }}>
              Raise New Query
            </h3>
            <p style={{ margin: "8px 0 0", color: palette.body, lineHeight: 1.6, fontSize: "14px" }}>
              Share the issue with the current property context so Team Famlo can resolve it faster.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
            <label style={{ display: "grid", gap: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 800, color: palette.subtle, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Category
              </span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as (typeof QUERY_CATEGORIES)[number])}
                style={{
                  width: "100%",
                  padding: "13px 14px",
                  borderRadius: "14px",
                  border: `1px solid ${palette.fieldBorder}`,
                  background: palette.fieldBackground,
                  color: palette.fieldText,
                  fontFamily: "inherit",
                }}
              >
                {QUERY_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 800, color: palette.subtle, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Related property
              </span>
              <input
                value={propertyName ?? "Selected property"}
                readOnly
                style={{
                  width: "100%",
                  padding: "13px 14px",
                  borderRadius: "14px",
                  border: `1px solid ${palette.fieldBorder}`,
                  background: palette.fieldBackground,
                  color: palette.fieldText,
                  fontFamily: "inherit",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 800, color: palette.subtle, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Related room
              </span>
              <input
                value={relatedRoom}
                onChange={(event) => setRelatedRoom(event.target.value)}
                placeholder="Optional room name"
                style={{
                  width: "100%",
                  padding: "13px 14px",
                  borderRadius: "14px",
                  border: `1px solid ${palette.fieldBorder}`,
                  background: palette.fieldBackground,
                  color: palette.fieldText,
                  fontFamily: "inherit",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 800, color: palette.subtle, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Related booking
              </span>
              <input
                value={relatedBooking}
                onChange={(event) => setRelatedBooking(event.target.value)}
                placeholder="Optional booking ID"
                style={{
                  width: "100%",
                  padding: "13px 14px",
                  borderRadius: "14px",
                  border: `1px solid ${palette.fieldBorder}`,
                  background: palette.fieldBackground,
                  color: palette.fieldText,
                  fontFamily: "inherit",
                }}
              />
            </label>
          </div>

          <label style={{ display: "grid", gap: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 800, color: palette.subtle, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Message
            </span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Describe the issue, what you expected, and any urgent detail Team Famlo should know."
              style={{
                width: "100%",
                minHeight: "140px",
                padding: "14px",
                borderRadius: "16px",
                border: `1px solid ${palette.fieldBorder}`,
                background: palette.fieldBackground,
                color: palette.fieldText,
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
          </label>

          <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: "12px" }}>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{
                padding: "12px 18px",
                borderRadius: "14px",
                background: palette.secondaryButtonBackground,
                color: palette.secondaryButtonText,
                border: `1px solid ${palette.secondaryButtonBorder}`,
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !message.trim()}
              style={{
                padding: "12px 18px",
                borderRadius: "14px",
                background: palette.primaryButtonBackground,
                color: palette.primaryButtonText,
                border: "none",
                cursor: submitting || !message.trim() ? "not-allowed" : "pointer",
                opacity: submitting || !message.trim() ? 0.7 : 1,
                fontWeight: 800,
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Submit to Team Famlo
            </button>
          </div>
        </form>
      ) : null}

      <section
        className={styles.glassCard}
        style={{
          background: billingCardTone.background,
          border: `1px solid ${billingCardTone.border}`,
          borderRadius: "24px",
          padding: "24px",
          display: "grid",
          gap: "18px",
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 900, color: palette.title }}>Billing</h3>
          <p style={{ margin: "8px 0 0", color: palette.body, lineHeight: 1.6, fontSize: "14px" }}>
            Review Famlo Pro payment status, renewal timing, and recent billing history for this property.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
          <div style={{ borderRadius: "18px", border: `1px solid ${palette.mutedBorder}`, background: palette.mutedBackground, padding: "16px" }}>
            <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: palette.subtle }}>Subscription</div>
            <div style={{ marginTop: "8px", fontSize: "18px", fontWeight: 900, color: palette.title }}>
              {billingLoading ? "Loading..." : derivedSubscriptionLabel}
            </div>
          </div>
          <div style={{ borderRadius: "18px", border: `1px solid ${palette.mutedBorder}`, background: palette.mutedBackground, padding: "16px" }}>
            <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: palette.subtle }}>Active till</div>
            <div style={{ marginTop: "8px", fontSize: "18px", fontWeight: 900, color: palette.title }}>
              {billingWorkspace?.selectedProperty?.currentSubscription?.currentPeriodEnd
                ? formatTicketDate(billingWorkspace.selectedProperty.currentSubscription.currentPeriodEnd)
                : billingWorkspace?.selectedProperty?.access?.currentPeriodEnd
                  ? formatTicketDate(billingWorkspace.selectedProperty.access.currentPeriodEnd)
                  : "Not set"}
            </div>
          </div>
          <div style={{ borderRadius: "18px", border: `1px solid ${palette.mutedBorder}`, background: palette.mutedBackground, padding: "16px" }}>
            <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: palette.subtle }}>Current amount</div>
            <div style={{ marginTop: "8px", fontSize: "18px", fontWeight: 900, color: palette.title }}>
              {derivedCurrentAmount}
            </div>
          </div>
        </div>
        {billingWorkspace?.selectedProperty?.state?.canBuyOrRenew ? (
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center", flexWrap: "wrap", borderRadius: "18px", border: `1px solid ${palette.secondaryButtonBorder}`, background: palette.mutedBackground, padding: "16px" }}>
            <div style={{ color: palette.body, fontSize: "14px", lineHeight: 1.6 }}>
              {isRenewalDueSoon
                ? "Famlo Pro renewal is due soon for this property."
                : billingWorkspace.selectedProperty.state.requiresRenewal
                  ? "Famlo Pro renewal is available for this property."
                  : "Billing is active and no urgent renewal action is required yet."}
            </div>
            {isRenewalDueSoon ? (
              <a
                href={`/partnerslogin/home/dashboard?family=${encodeURIComponent(familyId)}&tab=famlo-plus`}
                style={{
                  padding: "12px 18px",
                  borderRadius: "14px",
                  background: isDarkTheme ? "#ef4444" : "#dc2626",
                  color: "#ffffff",
                  textDecoration: "none",
                  fontWeight: 800,
                }}
              >
                Pay now
              </a>
            ) : null}
          </div>
        ) : null}
        <div style={{ display: "grid", gap: "12px" }}>
          {latestInvoice ? (
            <div style={{ borderRadius: "18px", border: `1px solid ${palette.mutedBorder}`, background: palette.mutedBackground, padding: "16px", display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: palette.title, fontWeight: 900, fontSize: "15px" }}>Latest invoice receipt</div>
                  <div style={{ color: palette.body, fontSize: "13px", marginTop: "4px" }}>{latestInvoice.invoiceNumber ?? "Invoice pending"}</div>
                </div>
                {latestInvoice.downloadHref ? (
                  <a
                    href={latestInvoice.downloadHref}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "12px",
                      textDecoration: "none",
                      background: palette.primaryButtonBackground,
                      color: palette.primaryButtonText,
                      fontSize: "12px",
                      fontWeight: 800,
                    }}
                  >
                    Download Invoice
                  </a>
                ) : null}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
                <div style={{ color: palette.body, fontSize: "13px" }}>
                  <div style={{ color: palette.subtle, fontSize: "11px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Paid date</div>
                  <div style={{ color: palette.title, marginTop: "4px", fontWeight: 800 }}>{latestInvoice.paymentDate ? formatTicketDate(latestInvoice.paymentDate) : "Pending"}</div>
                </div>
                <div style={{ color: palette.body, fontSize: "13px" }}>
                  <div style={{ color: palette.subtle, fontSize: "11px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Amount paid</div>
                  <div style={{ color: palette.title, marginTop: "4px", fontWeight: 800 }}>{formatCurrency(latestInvoice.totalPaid ?? null)}</div>
                </div>
                <div style={{ color: palette.body, fontSize: "13px" }}>
                  <div style={{ color: palette.subtle, fontSize: "11px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Plan period</div>
                  <div style={{ color: palette.title, marginTop: "4px", fontWeight: 800 }}>{formatPeriod(latestInvoice.subscriptionPeriodStart, latestInvoice.subscriptionPeriodEnd)}</div>
                </div>
                <div style={{ color: palette.body, fontSize: "13px" }}>
                  <div style={{ color: palette.subtle, fontSize: "11px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Delivery</div>
                  <div style={{ color: palette.title, marginTop: "4px", fontWeight: 800 }}>
                    Email {latestInvoice.emailStatus ?? "pending"}{latestInvoice.whatsappStatus ? ` · WhatsApp ${latestInvoice.whatsappStatus}` : ""}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          <div style={{ fontSize: "15px", fontWeight: 900, color: palette.title }}>Past Famlo bills / invoices</div>
          {(billingWorkspace?.recentOrders ?? []).slice(0, 5).map((order, index) => (
            <div key={`${order.id ?? "order"}-${index}`} style={{ borderRadius: "16px", border: `1px solid ${palette.mutedBorder}`, background: palette.mutedBackground, padding: "14px 16px", display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <div style={{ color: palette.title, fontWeight: 800 }}>{order.invoice?.invoiceNumber ?? `Famlo Pro order ${order.id?.slice(0, 8) ?? index + 1}`}</div>
                <div style={{ color: palette.body, fontSize: "13px" }}>Start date: {order.payment_captured_at ? formatTicketDate(order.payment_captured_at) : order.created_at ? formatTicketDate(order.created_at) : "Date pending"}</div>
                <div style={{ color: palette.body, fontSize: "13px" }}>
                  Valid till: {order.invoice?.subscriptionPeriodEnd
                    ? formatTicketDate(order.invoice.subscriptionPeriodEnd)
                    : (() => {
                      const periodEnd = addMonthsToIsoDate(order.payment_captured_at ?? order.created_at ?? null, Number(order.metadata?.duration_months ?? 1));
                      return periodEnd ? formatTicketDate(periodEnd) : "Pending";
                    })()}
                </div>
                {order.invoice ? (
                  <div style={{ color: palette.subtle, fontSize: "12px", marginTop: "4px" }}>
                    Email {order.invoice.emailStatus ?? "pending"}{order.invoice.whatsappStatus ? ` · WhatsApp ${order.invoice.whatsappStatus}` : ""}
                  </div>
                ) : null}
              </div>
              <div style={{ textAlign: "right", display: "grid", gap: "8px", justifyItems: "end" }}>
                <div style={{ color: palette.title, fontWeight: 900 }}>{formatCurrency(order.invoice?.totalPaid ?? order.total_amount ?? null)}</div>
                <div style={{ color: palette.subtle, fontSize: "12px", fontWeight: 700 }}>{order.invoice?.status ?? order.status ?? "status pending"}</div>
                {order.invoice?.downloadHref ? (
                  <a
                    href={order.invoice.downloadHref}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "12px",
                      textDecoration: "none",
                      background: palette.primaryButtonBackground,
                      color: palette.primaryButtonText,
                      fontSize: "12px",
                      fontWeight: 800,
                    }}
                  >
                    Download invoice
                  </a>
                ) : (
                  <span
                    title="Invoice not generated yet."
                    style={{
                      padding: "8px 12px",
                      borderRadius: "12px",
                      background: palette.secondaryButtonBackground,
                      color: palette.subtle,
                      border: `1px solid ${palette.secondaryButtonBorder}`,
                      fontSize: "12px",
                      fontWeight: 800,
                    }}
                  >
                    Download invoice
                  </span>
                )}
              </div>
            </div>
          ))}
          {!billingLoading && (billingWorkspace?.recentOrders ?? []).length === 0 ? (
            <div style={{ color: palette.body, fontSize: "14px" }}>No Famlo Pro billing history is available yet for this property.</div>
          ) : null}
        </div>
      </section>

      <section
        className={styles.glassCard}
        style={{
          background: palette.cardBackground,
          border: `1px solid ${palette.cardBorder}`,
          borderRadius: "24px",
          padding: "24px",
          display: "grid",
          gap: "12px",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 900, color: palette.title }}>FAQ</h3>
        {FAQ_SECTIONS.slice(0, 3).map(({ title, content }) => (
          <div key={title} style={{ borderRadius: "16px", border: `1px solid ${palette.mutedBorder}`, background: palette.mutedBackground, padding: "14px 16px" }}>
            <div style={{ color: palette.title, fontWeight: 800 }}>{title}</div>
            <div style={{ color: palette.body, fontSize: "13px", lineHeight: 1.6, marginTop: "6px" }}>{content}</div>
          </div>
        ))}
        <div>
          <button
            type="button"
            onClick={() => setShowFaqView(true)}
            style={{
              padding: "10px 16px",
              borderRadius: "12px",
              background: palette.secondaryButtonBackground,
              color: palette.secondaryButtonText,
              border: `1px solid ${palette.secondaryButtonBorder}`,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Know more
          </button>
        </div>
      </section>

      {showFaqView ? (
        <section
          className={styles.glassCard}
          style={{
            background: palette.cardBackground,
            border: `1px solid ${palette.cardBorder}`,
            borderRadius: "24px",
            padding: "24px",
            display: "grid",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: "22px", fontWeight: 900, color: palette.title }}>Famlo Pro FAQ</h3>
            <button
              type="button"
              onClick={() => setShowFaqView(false)}
              style={{
                padding: "10px 16px",
                borderRadius: "12px",
                background: palette.secondaryButtonBackground,
                color: palette.secondaryButtonText,
                border: `1px solid ${palette.secondaryButtonBorder}`,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Back
            </button>
          </div>
          {FAQ_SECTIONS.map(({ id, title, content }) => (
            <div key={id} style={{ borderRadius: "16px", border: `1px solid ${palette.mutedBorder}`, background: palette.mutedBackground, padding: "14px 16px" }}>
              <div style={{ color: palette.title, fontWeight: 800 }}>{title}</div>
              <div style={{ color: palette.body, fontSize: "13px", lineHeight: 1.6, marginTop: "6px" }}>{content}</div>
            </div>
          ))}
        </section>
      ) : null}

      <section
        className={styles.glassCard}
        style={{
          background: palette.cardBackground,
          border: `1px solid ${palette.cardBorder}`,
          borderRadius: "24px",
          padding: "24px",
          display: "grid",
          gap: "12px",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 900, color: palette.title }}>Past inquiries</h3>
        {loading ? (
          <div style={{ color: palette.body }}>Loading support queries...</div>
        ) : tickets.length === 0 ? (
          <div style={{ color: palette.body }}>No support queries yet.</div>
        ) : (
          tickets.map((ticket) => (
            <div key={ticket.id} style={{ borderRadius: "16px", border: `1px solid ${palette.mutedBorder}`, background: palette.mutedBackground, padding: "14px 16px", display: "grid", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ color: palette.title, fontWeight: 800 }}>{ticket.subject}</div>
                <div style={{ color: palette.subtle, fontSize: "12px", fontWeight: 800 }}>{formatTicketDate(ticket.created_at)} · {ticket.status}</div>
              </div>
              <div style={{ color: palette.body, fontSize: "13px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{ticket.message}</div>
              {ticket.admin_reply ? <div style={{ color: palette.title, fontSize: "13px", lineHeight: 1.6 }}>Team Famlo: {ticket.admin_reply}</div> : null}
            </div>
          ))
        )}
      </section>

      <section
        className={styles.glassCard}
        style={{
          background: palette.cardBackground,
          border: `1px solid ${palette.cardBorder}`,
          borderRadius: "24px",
          padding: "20px",
          display: "flex",
          gap: "12px",
          alignItems: "flex-start",
        }}
      >
        <AlertCircle size={18} color={isDarkTheme ? "#cbd5e1" : "#64748b"} />
        <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.6, color: palette.body }}>
          For urgent emergencies or guest safety concerns, use the direct emergency support path already provided by Famlo.
        </p>
      </section>
    </div>
  );
}
