import React from "react";

import { loadBookingActionPreview, type BookingActionType } from "@/lib/booking-action-tokens";
import { createAdminSupabaseClient } from "@/lib/supabase";

interface HostBookingActionPageProps {
  searchParams?: Promise<{
    token?: string;
    action?: string;
    result?: string;
    error?: string;
  }>;
}

function isBookingActionType(value: string | undefined): value is BookingActionType {
  return value === "accept_booking" || value === "reject_booking";
}

function formatDates(startDate: string | null, endDate: string | null): string {
  if (!startDate) return "Dates unavailable";
  if (!endDate || endDate === startDate) return startDate;
  return `${startDate} to ${endDate}`;
}

function formatAmount(value: number): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
  } catch {
    return `INR ${value}`;
  }
}

function renderResultCard(title: string, message: string, tone: "success" | "error" | "neutral"): React.JSX.Element {
  const colors =
    tone === "success"
      ? { bg: "#f0fdf4", border: "#86efac", title: "#166534", text: "#14532d" }
      : tone === "error"
        ? { bg: "#fff1f2", border: "#fda4af", title: "#9f1239", text: "#881337" }
        : { bg: "#eff6ff", border: "#93c5fd", title: "#1d4ed8", text: "#1e3a8a" };

  return (
    <div style={{ display: "grid", gap: 12, padding: 28, borderRadius: 24, border: `1px solid ${colors.border}`, background: colors.bg, maxWidth: 560, width: "100%" }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: colors.title }}>{title}</h1>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: colors.text }}>{message}</p>
    </div>
  );
}

export default async function HostBookingActionPage({
  searchParams,
}: Readonly<HostBookingActionPageProps>): Promise<React.JSX.Element> {
  const params = await searchParams;
  const result = typeof params?.result === "string" ? params.result : null;
  const error = typeof params?.error === "string" ? params.error : null;
  const token = typeof params?.token === "string" ? params.token.trim() : "";
  const actionParam = typeof params?.action === "string" ? params.action.trim() : "";

  if (result === "accepted") {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "linear-gradient(180deg, #f8fbff 0%, #eef7ff 100%)" }}>
        {renderResultCard("Booking Accepted", "The Famlo booking request has been accepted. The guest will be notified automatically.", "success")}
      </main>
    );
  }

  if (result === "rejected") {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "linear-gradient(180deg, #f8fbff 0%, #eef7ff 100%)" }}>
        {renderResultCard("Booking Rejected", "The Famlo booking request has been rejected. The guest will be notified automatically.", "neutral")}
      </main>
    );
  }

  if (error) {
    const messageByCode: Record<string, string> = {
      invalid_request: "This booking action link is incomplete.",
      invalid: "This booking action link is invalid.",
      used: "This booking action link has already been used.",
      expired: "This booking action link has expired.",
      mismatch: "This booking action link does not match the requested action.",
      already_resolved: "This booking was already handled, so no further action is needed.",
      unavailable: "This action is not available right now.",
      failed: "Famlo could not complete this booking action. Please try again from the host dashboard.",
    };

    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "linear-gradient(180deg, #f8fbff 0%, #eef7ff 100%)" }}>
        {renderResultCard("Action Unavailable", messageByCode[error] ?? "Famlo could not process this booking action link.", "error")}
      </main>
    );
  }

  if (!token || !isBookingActionType(actionParam)) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "linear-gradient(180deg, #f8fbff 0%, #eef7ff 100%)" }}>
        {renderResultCard("Booking Action Link", "Open this page from your Famlo booking request link to review the action securely.", "neutral")}
      </main>
    );
  }

  const supabase = createAdminSupabaseClient();
  const preview = await loadBookingActionPreview(supabase, { token, action: actionParam });

  if (preview.status !== "ready") {
    const infoText =
      preview.status === "already_resolved"
        ? "This booking request was already handled."
        : preview.status === "expired"
          ? "This secure booking action link has expired."
          : preview.status === "used"
            ? "This secure booking action link was already used."
            : preview.status === "unavailable"
              ? "This action is not available right now."
              : "Famlo could not validate this booking action link.";

    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "linear-gradient(180deg, #f8fbff 0%, #eef7ff 100%)" }}>
        {renderResultCard("Booking Action Unavailable", infoText, "error")}
      </main>
    );
  }

  const actionLabel = actionParam === "accept_booking" ? "Accept Booking" : "Reject Booking";
  const actionMessage =
    actionParam === "accept_booking"
      ? "Confirm this only if you are ready to host the guest for the requested stay."
      : "Confirm this only if you cannot host the guest for the requested stay.";

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "linear-gradient(180deg, #f8fbff 0%, #eef7ff 100%)" }}>
      <div style={{ display: "grid", gap: 18, maxWidth: 620, width: "100%", padding: 28, borderRadius: 28, background: "#ffffff", border: "1px solid #dbeafe", boxShadow: "0 18px 50px rgba(15, 23, 42, 0.08)" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1d4ed8" }}>Famlo Host Action</div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, color: "#0f172a" }}>{actionLabel}</h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: "#475569" }}>{actionMessage}</p>
        </div>

        <div style={{ display: "grid", gap: 12, padding: 20, borderRadius: 20, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#0f172a" }}>{preview.propertyName}</div>
          <div style={{ display: "grid", gap: 6, color: "#334155", fontSize: 15 }}>
            <div><strong>Guest:</strong> {preview.guestName ?? "Famlo guest"}</div>
            <div><strong>Stay:</strong> {formatDates(preview.startDate, preview.endDate)}</div>
            <div><strong>Guests:</strong> {preview.guestsCount}</div>
            <div><strong>Amount:</strong> {formatAmount(preview.totalPrice)}</div>
          </div>
        </div>

        <form method="POST" action="/api/bookings/host-action" style={{ display: "grid", gap: 14 }}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="action" value={actionParam} />
          <button
            type="submit"
            style={{
              border: "none",
              borderRadius: 16,
              padding: "16px 20px",
              background: actionParam === "accept_booking" ? "linear-gradient(135deg, #16a34a, #22c55e)" : "linear-gradient(135deg, #e11d48, #fb7185)",
              color: "#ffffff",
              fontWeight: 900,
              fontSize: 16,
              cursor: "pointer",
              boxShadow: "0 16px 30px rgba(15, 23, 42, 0.12)",
            }}
          >
            {actionLabel}
          </button>
        </form>
      </div>
    </main>
  );
}
