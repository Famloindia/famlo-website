import { useEffect, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import styles from "../dashboard.module.css";
import { MessageCircle, Compass, User, Clock, CheckCircle2, ShieldCheck, MapPin, Sparkles, Loader2 } from "lucide-react";

function formatDate(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatKycStatus(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "Profile pending";
  return value.replaceAll("_", " ");
}

function isCheckInWindowOpen(booking: any): boolean {
  if (typeof booking?.date_from !== "string" || booking.date_from.length === 0) return false;
  const start = new Date(`${booking.date_from}T00:00:00+05:30`);
  const end = typeof booking?.date_to === "string" && booking.date_to.length > 0
    ? new Date(`${booking.date_to}T23:59:59+05:30`)
    : new Date(`${booking.date_from}T23:59:59+05:30`);
  const windowStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(end.getTime() + 12 * 60 * 60 * 1000);
  const now = Date.now();
  return now >= windowStart.getTime() && now <= windowEnd.getTime();
}

const guestBehaviorTags = [
  "respectful",
  "clean",
  "followed house rules",
  "good communication",
  "late without notice",
  "mess created",
  "rude behavior",
  "safety concern",
];

export default function BookingsTab({ 
  bookingRows,
  onOpenChat 
}: { 
  bookingRows: any[],
  onOpenChat?: (convId: string) => void 
}) {
  const supabase = createBrowserSupabaseClient();
  const [localRows, setLocalRows] = useState<any[]>(bookingRows);
  const [pendingActionById, setPendingActionById] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, { type: "success" | "error"; text: string }>>({});
  const [checkInCodeById, setCheckInCodeById] = useState<Record<string, string>>({});
  const [guestFeedbackDraftById, setGuestFeedbackDraftById] = useState<Record<string, { wouldHostAgain: boolean; tags: string[]; note: string }>>({});

  useEffect(() => {
    setLocalRows(bookingRows);
  }, [bookingRows]);

  async function getAuthHeaders(): Promise<Record<string, string>> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return headers;
  }

  function normalizeStatus(booking: any): string {
    const status = String(booking.status ?? "");
    if (booking.checked_in_at) {
      return "checked_in";
    }
    if (status === "cancelled" || status === "cancelled_by_user" || status === "cancelled_by_partner" || status === "rejected") {
      return status;
    }
    return booking.payment_status === "paid" ? "confirmed" : status;
  }

  function getStatusLabel(status: string): string {
    if (status === "checked_in") return "Checked in";
    if (status === "cancelled_by_user") return "Cancelled";
    if (status === "cancelled_by_partner") return "Cancelled";
    if (status === "cancelled") return "Cancelled";
    if (status === "rejected") return "Rejected";
    if (status === "confirmed") return "Confirmed";
    if (status === "accepted") return "Accepted";
    if (status === "pending") return "Pending";
    return status.replaceAll("_", " ");
  }

  async function updateBookingStatus(bookingId: string, familyId: string, status: string): Promise<void> {
    setPendingActionById((current) => ({ ...current, [bookingId]: status }));
    setFeedback((current) => ({ ...current, [bookingId]: { type: "success", text: "" } }));

    try {
      const response = await fetch("/api/host/bookings/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, familyId, status }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not update booking.");
      }

      setLocalRows((current) =>
        current.map((row) => (String(row.id) === bookingId ? { ...row, status } : row))
      );
      setFeedback((current) => ({
        ...current,
        [bookingId]: {
          type: "success",
          text: `Booking marked ${String(status).replaceAll("_", " ")}.`,
        },
      }));
    } catch (error) {
      setFeedback((current) => ({
        ...current,
        [bookingId]: {
          type: "error",
          text: error instanceof Error ? error.message : "Could not update booking.",
        },
      }));
    } finally {
      setPendingActionById((current) => {
        const next = { ...current };
        delete next[bookingId];
        return next;
      });
    }
  }

  async function confirmGuestCheckIn(booking: any): Promise<void> {
    const bookingId = String(booking.id);
    const familyId = String(booking.family_id ?? "");
      const code = String(checkInCodeById[bookingId] ?? "");

    if (!code) {
      setFeedback((current) => ({
        ...current,
        [bookingId]: { type: "error", text: "Please ask the guest for their code first." },
      }));
      return;
    }

    setPendingActionById((current) => ({ ...current, [bookingId]: "guest_check_in" }));
    try {
      const response = await fetch("/api/host/bookings/check-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({ bookingId, familyId, code }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Could not confirm guest check-in.");
      }

      setLocalRows((current) =>
        current.map((row) => (String(row.id) === bookingId ? { ...row, status: "checked_in" } : row))
      );
      setFeedback((current) => ({
        ...current,
        [bookingId]: { type: "success", text: "Guest check-in confirmed." },
      }));
    } catch (error) {
      setFeedback((current) => ({
        ...current,
        [bookingId]: {
          type: "error",
          text: error instanceof Error ? error.message : "Could not confirm guest check-in.",
        },
      }));
    } finally {
      setPendingActionById((current) => {
        const next = { ...current };
        delete next[bookingId];
        return next;
      });
    }
  }

  async function completeGuestStay(booking: any): Promise<void> {
    const bookingId = String(booking.id);
    const familyId = String(booking.family_id ?? "");
    setPendingActionById((current) => ({ ...current, [bookingId]: "guest_checkout" }));
    try {
      const response = await fetch("/api/host/bookings/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({ bookingId, familyId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Could not complete checkout.");
      }

      setLocalRows((current) =>
        current.map((row) => (String(row.id) === bookingId ? { ...row, status: "completed" } : row))
      );
      setFeedback((current) => ({
        ...current,
        [bookingId]: { type: "success", text: "Stay marked complete." },
      }));
    } catch (error) {
      setFeedback((current) => ({
        ...current,
        [bookingId]: {
          type: "error",
          text: error instanceof Error ? error.message : "Could not complete checkout.",
        },
      }));
    } finally {
      setPendingActionById((current) => {
        const next = { ...current };
        delete next[bookingId];
        return next;
      });
    }
  }

  async function saveGuestFeedback(booking: any): Promise<void> {
    const bookingId = String(booking.id);
    const familyId = String(booking.family_id ?? "");
    const draft = guestFeedbackDraftById[bookingId] ?? { wouldHostAgain: true, tags: [], note: "" };
    setPendingActionById((current) => ({ ...current, [bookingId]: "guest_feedback" }));

    try {
      const response = await fetch("/api/host/bookings/guest-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({
          bookingId,
          familyId,
          wouldHostAgain: draft.wouldHostAgain,
          behaviorTags: draft.tags,
          note: draft.note,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Could not save guest feedback.");
      }
      setFeedback((current) => ({
        ...current,
        [bookingId]: { type: "success", text: "Guest feedback saved." },
      }));
    } catch (error) {
      setFeedback((current) => ({
        ...current,
        [bookingId]: {
          type: "error",
          text: error instanceof Error ? error.message : "Could not save guest feedback.",
        },
      }));
    } finally {
      setPendingActionById((current) => {
        const next = { ...current };
        delete next[bookingId];
        return next;
      });
    }
  }

  return (
    <div className={`${styles.flexCol} ${styles.animateIn}`}>
      <div
        style={{
          marginBottom: "24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          borderBottom: "2px solid #f1f5f9",
          paddingBottom: "16px",
        }}
      >
        <div>
          <h2 style={{ fontSize: "24px", fontWeight: 900, margin: "0 0 4px", color: "#0e2b57" }}>
            Bookings Ledger
          </h2>
          <p style={{ fontSize: "13px", margin: 0, color: "rgba(14,43,87,0.6)", fontWeight: 600 }}>
            Real-time guest synchronization from the mobile app.
          </p>
        </div>
        <div style={{ background: "#f4f8ff", padding: "8px 16px", borderRadius: "12px", fontSize: "12px", fontWeight: 800, color: "#165dcc" }}>
          {localRows.length} Total Records
        </div>
      </div>

      <div className={styles.flexCol} style={{ gap: "20px" }}>
        {localRows.length === 0 ? (
          <div className={styles.glassCard} style={{ textAlign: "center", padding: "80px 20px" }}>
            <div style={{ color: "#cbd5e1", display: "flex", justifyContent: "center", marginBottom: "24px" }}>
              <Compass size={64} />
            </div>
            <h3 style={{ fontSize: "20px", fontWeight: 900, margin: "0 0 8px", color: "#0e2b57" }}>
              No current bookings
            </h3>
            <p style={{ fontSize: "14px", color: "rgba(14,43,87,0.6)", margin: 0, maxWidth: "400px", alignSelf: "center", lineHeight: 1.5 }}>
              When guests choose your home in the Famlo app, their reservations will appear here
              automatically with full identity verification.
            </p>
          </div>
        ) : (
          localRows.map((booking) => {
            const userData = (booking.users as Record<string, unknown>) || {};
            const realName = String(userData.name || "Verified Guest");
            const propertyName = typeof booking.property_name === "string" && booking.property_name.length > 0 ? booking.property_name : "Famlo Stay";
            const propertyLocation = typeof booking.property_location === "string" ? booking.property_location : "";
            const guestCity = typeof userData.city === "string" ? userData.city : null;
            const guestState = typeof userData.state === "string" ? userData.state : null;
            const guestAbout = typeof userData.about === "string" ? userData.about : "";
            const kycStatus = typeof userData.kyc_status === "string" ? userData.kyc_status : "";
            const stayVibe = typeof booking.vibe === "string" ? booking.vibe : "";
            const quarterLabel = String(booking.quarter_type ?? booking.quarter_time ?? "Reservation");
            const normalizedStatus = normalizeStatus(booking);

            const isConfirmed = normalizedStatus === "confirmed" || normalizedStatus === "completed" || normalizedStatus === "checked_in" || normalizedStatus === "accepted";
            const isPending = normalizedStatus === "pending";
            const isCheckedIn = normalizedStatus === "checked_in";
            const isCompleted = normalizedStatus === "completed";
            const isRejected = normalizedStatus === "rejected";
            const isCancelled = normalizedStatus === "cancelled_by_user" || normalizedStatus === "cancelled" || normalizedStatus === "cancelled_by_partner";
            const actionPending = pendingActionById[String(booking.id)];

            const displayAmount =
              Number(booking.family_payout) > 0
                ? Number(booking.family_payout)
                : Number(booking.total_price) || 0;

            return (
              <div
                key={String(booking.id)}
                className={styles.glassCard}
                style={{
                  padding: "24px",
                border: isPending ? "2px solid #fef3c7" : isCancelled ? "2px solid #fecaca" : "1px solid rgba(14,43,87,0.06)",
              }}
            >
                <div
                  className={styles.flexRow}
                  style={{ alignItems: "flex-start", marginBottom: "24px", justifyContent: "space-between" }}
                >
                  <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
                    <div style={{ position: "relative" }}>
                        <div
                          style={{
                            width: "56px",
                            height: "56px",
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, #165dcc, #0e2b57)",
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "3px solid white",
                            boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
                          }}
                        >
                          <User size={24} />
                        </div>
                      {isConfirmed && !isCancelled && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: -2,
                            right: -2,
                            background: "#10b981",
                            borderRadius: "50%",
                            padding: "2px",
                            border: "2px solid white",
                          }}
                        >
                          <CheckCircle2 size={12} color="white" />
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#165dcc", marginBottom: "6px" }}>
                        {propertyName}
                      </div>
                      <h4 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: 900, color: "#0e2b57" }}>
                        {realName}
                      </h4>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        <span style={{ color: "#165dcc", background: "#f4f8ff", padding: "2px 8px", borderRadius: "4px" }}>
                          {quarterLabel}
                        </span>
                        <span style={{ color: "rgba(14,43,87,0.4)" }}>•</span>
                        <span style={{ color: "rgba(14,43,87,0.6)" }}>
                          ID: {String(booking.user_id ?? "").slice(0, 8)}
                        </span>
                        {guestCity && (
                          <>
                            <span style={{ color: "rgba(14,43,87,0.4)" }}>•</span>
                            <span style={{ color: "rgba(14,43,87,0.6)" }}>{[guestCity, guestState].filter(Boolean).join(", ")}</span>
                          </>
                        )}
                        {propertyLocation ? (
                          <>
                            <span style={{ color: "rgba(14,43,87,0.4)" }}>•</span>
                            <span style={{ color: "rgba(14,43,87,0.6)" }}>{propertyLocation}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        background: isCancelled ? "#fef2f2" : isPending ? "#fff7ed" : isConfirmed ? "#f0fdf4" : "#f8fafc",
                        color: isCancelled ? "#b91c1c" : isPending ? "#c2410c" : isConfirmed ? "#15803d" : "#64748b",
                        fontSize: "11px",
                        fontWeight: 900,
                        textTransform: "uppercase",
                        borderRadius: "8px",
                        border: `1px solid ${isCancelled ? "#fecaca" : isPending ? "#fed7aa" : isConfirmed ? "#bbf7d0" : "#e2e8f0"}`,
                      }}
                    >
                      {isPending && <Clock size={12} />}
                      {getStatusLabel(normalizedStatus)}
                    </div>
                    <h3 style={{ margin: "12px 0 0", fontSize: "24px", fontWeight: 900, color: "#0e2b57" }}>
                      ₹{displayAmount.toLocaleString("en-IN")}
                    </h3>
                    <div style={{ fontSize: "10px", color: "rgba(14,43,87,0.4)", fontWeight: 700, marginTop: "2px" }}>
                      {Number(booking.family_payout) > 0 ? "Your payout" : "Booking total"}
                    </div>
                  </div>
                </div>

                <div
                  className={styles.flexRow}
                  style={{ background: "#f8fafc", padding: "20px", borderRadius: "18px", border: "1px solid #f1f5f9" }}
                >
                    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                      <div>
                        <div style={{ fontSize: "10px", fontWeight: 900, color: "rgba(14,43,87,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>
                        Stay Dates
                      </div>
                      <div style={{ fontSize: "15px", fontWeight: 900, color: "#0e2b57" }}>
                        {formatDate(booking.date_from)}
                        {booking.date_to && booking.date_to !== booking.date_from && (
                           <span style={{ opacity: 0.5 }}> → {formatDate(booking.date_to)}</span>
                        )}
                      </div>
                    </div>
                      <div>
                        <div style={{ fontSize: "10px", fontWeight: 900, color: "rgba(14,43,87,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>
                          Group Info
                      </div>
                      <div style={{ fontSize: "15px", fontWeight: 900, color: "#0e2b57" }}>
                        {String(booking.guests_count || 1)} Guest{Number(booking.guests_count) > 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>

                  <div style={{ display: "grid", gap: "12px", justifyItems: "end" }}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 14px",
                        borderRadius: "12px",
                        background: kycStatus === "verified" ? "#ecfdf5" : "#fff7ed",
                        color: kycStatus === "verified" ? "#047857" : "#b45309",
                        fontSize: "12px",
                        fontWeight: 900,
                        textTransform: "uppercase",
                      }}
                    >
                      <ShieldCheck size={14} />
                      {formatKycStatus(kycStatus)}
                    </div>
                    {isConfirmed && !isCancelled ? (
                      <button
                        onClick={() => onOpenChat && onOpenChat(String(booking.conversation_id || booking.id))}
                        className={styles.primaryBtn}
                        style={{
                          width: "auto",
                          background: "#0e2b57",
                          padding: "14px 28px",
                          fontSize: "14px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontWeight: 900,
                          borderRadius: "14px",
                        }}
                      >
                        <MessageCircle size={18} /> Open Chat
                      </button>
                    ) : (
                      <div
                        style={{
                          background: "#f1f5f9",
                          color: "#94a3b8",
                          padding: "14px 28px",
                          fontSize: "13px",
                          fontWeight: 800,
                          borderRadius: "14px",
                          cursor: "not-allowed",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          border: "1px dashed #cbd5e1",
                        }}
                      >
                        <div style={{ width: "8px", height: "8px", background: "#94a3b8", borderRadius: "50%" }} />
                        {isCancelled ? "Guest cancelled" : "Unlocks after acceptance"}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: "14px", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  {isPending ? (
                    <>
                      <button
                        type="button"
                        className={styles.primaryBtn}
                        onClick={() => void updateBookingStatus(String(booking.id), String(booking.family_id), "accepted")}
                        disabled={Boolean(actionPending)}
                        style={{ width: "auto", padding: "12px 18px", borderRadius: "12px" }}
                      >
                        {actionPending === "accepted" ? <Loader2 className={styles.spin} size={16} /> : "Accept booking"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateBookingStatus(String(booking.id), String(booking.family_id), "rejected")}
                        disabled={Boolean(actionPending)}
                        style={{
                          padding: "12px 18px",
                          borderRadius: "12px",
                          border: "1px solid #fecaca",
                          background: "#fff1f2",
                          color: "#be123c",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        {actionPending === "rejected" ? "Rejecting..." : "Reject booking"}
                      </button>
                    </>
                  ) : null}

                  {isConfirmed && !isCheckedIn && !isCompleted && !isRejected && !isCancelled && isCheckInWindowOpen(booking) ? (
                    <div
                      style={{
                        display: "grid",
                        gap: 10,
                        padding: "16px",
                        borderRadius: "16px",
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        minWidth: "320px",
                        flex: 1,
                      }}
                    >
                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={{ fontSize: "12px", fontWeight: 900, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Confirm Guest Check-In
                        </div>
                        <p style={{ margin: 0, fontSize: "13px", color: "#1e3a8a", lineHeight: 1.5 }}>
                          Ask the guest for their secret code, enter it here, and Famlo will confirm check-in.
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <input
                          className="text-input"
                          value={checkInCodeById[String(booking.id)] ?? ""}
                          onChange={(event) =>
                            setCheckInCodeById((current) => ({
                              ...current,
                              [String(booking.id)]: event.target.value,
                            }))
                          }
                          placeholder="Enter guest code"
                          inputMode="numeric"
                          style={{ maxWidth: 180, letterSpacing: "0.2em", fontWeight: 900 }}
                        />
                        <button
                          type="button"
                          className={styles.primaryBtn}
                          onClick={() => void confirmGuestCheckIn(booking)}
                          disabled={Boolean(actionPending)}
                          style={{ width: "auto", padding: "12px 18px", borderRadius: "12px" }}
                        >
                          {actionPending === "guest_check_in" ? <Loader2 className={styles.spin} size={16} /> : "Confirm check-in"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {isCheckedIn ? (
                    <button
                      type="button"
                      onClick={() => void completeGuestStay(booking)}
                      disabled={Boolean(actionPending)}
                      style={{
                        padding: "12px 18px",
                        borderRadius: "12px",
                        border: "1px solid #bbf7d0",
                        background: "#ecfdf5",
                        color: "#047857",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {actionPending === "guest_checkout" ? "Updating..." : "Mark checked out"}
                    </button>
                  ) : null}

                  {feedback[String(booking.id)]?.text ? (
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        color: feedback[String(booking.id)]?.type === "error" ? "#b91c1c" : "#166534",
                      }}
                    >
                      {feedback[String(booking.id)]?.text}
                    </span>
                  ) : null}

                  {isCompleted ? (
                    <div
                      style={{
                        width: "100%",
                        display: "grid",
                        gap: 10,
                        padding: "16px",
                        borderRadius: "16px",
                        border: "1px solid #e2e8f0",
                        background: "#f8fafc",
                        marginTop: "6px",
                      }}
                    >
                      <div style={{ fontSize: "12px", fontWeight: 900, color: "#0e2b57", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Internal guest feedback
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="button-like"
                          onClick={() =>
                            setGuestFeedbackDraftById((current) => ({
                              ...current,
                              [String(booking.id)]: {
                                ...(current[String(booking.id)] ?? { wouldHostAgain: true, tags: [], note: "" }),
                                wouldHostAgain: true,
                              },
                            }))
                          }
                          style={{ background: (guestFeedbackDraftById[String(booking.id)]?.wouldHostAgain ?? true) ? "#165dcc" : "#e2e8f0" }}
                        >
                          Would host again
                        </button>
                        <button
                          type="button"
                          className="button-like"
                          onClick={() =>
                            setGuestFeedbackDraftById((current) => ({
                              ...current,
                              [String(booking.id)]: {
                                ...(current[String(booking.id)] ?? { wouldHostAgain: true, tags: [], note: "" }),
                                wouldHostAgain: false,
                              },
                            }))
                          }
                          style={{ background: (guestFeedbackDraftById[String(booking.id)]?.wouldHostAgain ?? true) ? "#e2e8f0" : "#dc2626" }}
                        >
                          Review required
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {guestBehaviorTags.map((tag) => {
                          const selected = (guestFeedbackDraftById[String(booking.id)]?.tags ?? []).includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() =>
                                setGuestFeedbackDraftById((current) => {
                                  const currentDraft = current[String(booking.id)] ?? { wouldHostAgain: true, tags: [], note: "" };
                                  const tags = selected
                                    ? currentDraft.tags.filter((value) => value !== tag)
                                    : [...currentDraft.tags, tag];
                                  return {
                                    ...current,
                                    [String(booking.id)]: { ...currentDraft, tags },
                                  };
                                })
                              }
                              style={{
                                padding: "8px 10px",
                                borderRadius: "999px",
                                border: selected ? "1px solid #165dcc" : "1px solid #cbd5e1",
                                background: selected ? "#eff6ff" : "#fff",
                                fontWeight: 700,
                                fontSize: "12px",
                                cursor: "pointer",
                              }}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                      <textarea
                        className="text-input"
                        rows={3}
                        placeholder="Optional private note about this guest"
                        value={guestFeedbackDraftById[String(booking.id)]?.note ?? ""}
                        onChange={(event) =>
                          setGuestFeedbackDraftById((current) => ({
                            ...current,
                            [String(booking.id)]: {
                              ...(current[String(booking.id)] ?? { wouldHostAgain: true, tags: [], note: "" }),
                              note: event.target.value,
                            },
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="button-like"
                        onClick={() => void saveGuestFeedback(booking)}
                        disabled={Boolean(actionPending)}
                        style={{ width: "fit-content" }}
                      >
                        {actionPending === "guest_feedback" ? "Saving..." : "Save guest feedback"}
                      </button>
                    </div>
                  ) : null}

                  <a
                    href={`/api/bookings/receipt?bookingId=${String(booking.id)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: "12px 18px",
                      borderRadius: "12px",
                      border: "1px solid #cbd5e1",
                      background: "#fff",
                      color: "#0e2b57",
                      fontWeight: 800,
                      textDecoration: "none",
                    }}
                  >
                    Guest receipt
                  </a>

                  {typeof booking.payout_id === "string" && booking.payout_id.length > 0 ? (
                    <a
                      href={`/api/host/payouts/statement?payoutId=${String(booking.payout_id)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: "12px 18px",
                        borderRadius: "12px",
                        border: "1px solid #bbf7d0",
                        background: "#f0fdf4",
                        color: "#047857",
                        fontWeight: 800,
                        textDecoration: "none",
                      }}
                    >
                      Host receipt
                    </a>
                  ) : null}
                </div>

                <div
                  style={{
                    marginTop: "16px",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "12px",
                  }}
                >
                  <div style={{ padding: "16px", borderRadius: "16px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "10px", fontWeight: 900, color: "rgba(14,43,87,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>
                      Guest snapshot
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", color: "#0e2b57", fontWeight: 800, marginBottom: "8px" }}>
                      <MapPin size={14} />
                      <span>{[guestCity, guestState].filter(Boolean).join(", ") || "Location on profile"}</span>
                    </div>
                    <p style={{ margin: 0, color: "rgba(14,43,87,0.65)", fontSize: "13px", lineHeight: 1.5 }}>
                      {guestAbout || "This guest has completed Famlo verification and can continue through the hosted stay journey."}
                    </p>
                  </div>

                  <div style={{ padding: "16px", borderRadius: "16px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "10px", fontWeight: 900, color: "rgba(14,43,87,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>
                      Stay notes
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", color: "#0e2b57", fontWeight: 800, marginBottom: "8px" }}>
                      <Sparkles size={14} />
                      <span>{stayVibe || "No special vibe selected yet"}</span>
                    </div>
                    <p style={{ margin: 0, color: "rgba(14,43,87,0.65)", fontSize: "13px", lineHeight: 1.5 }}>
                      Quarter: {quarterLabel}. Conversation ID: {booking.conversation_id ? String(booking.conversation_id).slice(0, 8) : "Pending"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
