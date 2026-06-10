import styles from "../dashboard.module.css";
import { TrendingUp, Calendar, ArrowUpRight, ShieldCheck, User } from "lucide-react";
import PricingLabTab from "./PricingLabTab";

export default function EarningsTab({
  totalStays,
  totalEarnings,
  bookingRows,
  loading = false,
  globalCommission = 16,
  mounted = true,
  hostId,
}: any) {
  if (!mounted) return null; // Prevent hydration mismatch for dynamic earnings
  const feePercentage = globalCommission;

  // Determine "This Month" for sync with mobile app
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  const payoutFromBooking = (booking: any) => {
    const payout = Number(booking.family_payout);
    if (payout > 0) return payout;

    const gross = Number(booking.total_price) || 0;
    return Math.round(gross * ((100 - globalCommission) / 100));
  };

  // Filter confirmed/completed only for revenue listing
  const revenueBookings = bookingRows.filter(
    (b: any) => b.status === "confirmed" || b.status === "completed" || b.status === "checked_in" || b.status === "accepted"
  );

  const monthlyEarnings = revenueBookings
    .filter((b: any) => String(b.date_from).startsWith(currentMonthStr))
    .reduce((sum: number, b: any) => sum + payoutFromBooking(b), 0);

  return (
    <div className={`${styles.flexCol} ${styles.animateIn}`} style={{ gap: "32px" }}>
      <div style={{ borderBottom: "2px solid #f1f5f9", paddingBottom: "16px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 900, margin: "0 0 4px", color: "#0e2b57" }}>
          Earnings & Payouts
        </h2>
        <p style={{ fontSize: "13px", margin: 0, color: "rgba(14,43,87,0.6)", fontWeight: 600 }}>
          Financial transparency synced with your mobile wallet.
        </p>
      </div>

      <div className={styles.gridCols2}>
        <div
          className={styles.glassCard}
          style={{ display: "flex", flexDirection: "column", justifyContent: "center", position: "relative", overflow: "hidden" }}
        >
          <div style={{ position: "absolute", top: -10, right: -10, opacity: 0.05 }}>
            <TrendingUp size={80} color="#059669" />
          </div>
          <div className={styles.cardTitle} style={{ color: "#059669", fontSize: "12px", fontWeight: 800 }}>
            REVENUE THIS MONTH
          </div>
          <div className={styles.cardValuePrimary} style={{ fontSize: "32px", color: "#0e2b57" }}>
            {loading ? "Loading..." : `₹${monthlyEarnings.toLocaleString("en-IN")}`}
          </div>
          <div style={{ fontSize: "11px", color: "#10b981", fontWeight: 800, marginTop: "8px" }}>
            SYNCED WITH MOBILE WALLET
          </div>
        </div>
        <div
          className={styles.glassCard}
          style={{ display: "flex", flexDirection: "column", justifyContent: "center", background: "#f8fafc" }}
        >
          <div className={styles.cardTitle} style={{ fontSize: "12px", fontWeight: 800 }}>
            TOTAL PORTFOLIO (ALL-TIME)
          </div>
          <div className={styles.cardValue} style={{ fontSize: "32px", color: "#0e2b57" }}>
            {loading ? "Loading..." : `₹${totalEarnings.toLocaleString("en-IN")}`}
          </div>
        </div>
      </div>

      <div
        className={styles.progressContainer}
        style={{ background: "linear-gradient(135deg, #0e2b57, #165dcc)", padding: "40px", borderRadius: "24px" }}
      >
        <div className={styles.progressWatermark} style={{ opacity: 0.1, fontSize: "120px" }}>
          {feePercentage}%
        </div>
        <div style={{ position: "relative", zIndex: 10, maxWidth: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
            <div>
              <h3 style={{ fontSize: "11px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(255,255,255,0.6)", marginBottom: "8px" }}>
                Service Fee Scaling
              </h3>
              <h2 style={{ fontSize: "28px", fontWeight: 900, margin: 0, color: "white" }}>
                Current Tier: {loading ? "Loading..." : `${feePercentage}%`}
              </h2>
            </div>
            <div style={{ background: "rgba(255,255,255,0.1)", padding: "8px 16px", borderRadius: "12px", color: "white", fontSize: "12px", fontWeight: 800 }}>
              Flat platform commission
            </div>
          </div>

          <div className={styles.progressBarTrack} style={{ height: "12px", borderRadius: "6px" }}>
            <div
              className={styles.progressBarFill}
              style={{ width: "100%", background: "#10b981" }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", fontSize: "11px", fontWeight: 800, textTransform: "uppercase", color: "rgba(255,255,255,0.6)" }}>
            <span>{loading ? "Loading..." : `${totalStays} CHECKED STAYS`}</span>
            <span>NO TIER SWITCHING</span>
          </div>

          <p style={{ marginTop: "32px", fontSize: "14px", color: "rgba(255,255,255,0.8)", lineHeight: 1.6, maxWidth: "600px", fontWeight: 600 }}>
            Famlo uses a flat 16% marketplace commission across bookings. Host payouts are derived from the booking value
            after platform commission and any applicable refund, GST/TDS, or gateway adjustments.
          </p>
        </div>
      </div>

      <div className={styles.glassCard} style={{ padding: "32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0, color: "#0e2b57" }}>
            Transaction Registry
          </h3>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", color: "#10b981", fontSize: "12px", fontWeight: 800 }}>
            <ShieldCheck size={16} /> 100% Verified Payouts
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "16px", borderBottom: "1px solid rgba(14,43,87,0.06)", fontSize: "10px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(14,43,87,0.4)" }}>
          <span>Guest Information</span>
          <span>Net Payout</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {revenueBookings.length === 0 ? (
            <div style={{ padding: "48px 0", textAlign: "center" }}>
              <Calendar size={32} color="#cbd5e1" style={{ marginBottom: "16px" }} />
              <p style={{ fontSize: "14px", color: "rgba(14,43,87,0.6)", fontWeight: 700 }}>
                No revenue-generating stays found in the recent history.
              </p>
            </div>
          ) : (
            revenueBookings.map((b: any) => {
              // SCHEMA FIX: use family_payout directly — that IS the host's net amount.
              const netPayout = payoutFromBooking(b);

              const userData = b.users || {};
              const guestName = String(userData.name || "Verified Guest");

              return (
                <div
                  key={b.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "20px 0",
                    borderBottom: "1px solid #f1f5f9",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    {userData.avatar_url ? (
                      <img
                        src={userData.avatar_url}
                        alt={guestName}
                        style={{ width: "44px", height: "44px", borderRadius: "50%", objectFit: "cover" }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "12px",
                          background: "#f4f8ff",
                          color: "#165dcc",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <User size={20} />
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: "15px", fontWeight: 900, color: "#0e2b57" }}>
                        {guestName}
                      </div>
                      <div style={{ fontSize: "12px", color: "rgba(14,43,87,0.5)", fontWeight: 800, textTransform: "uppercase" }}>
                        Via Famlo App Transfer · {String(b.quarter_type || "Stay")}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: "18px",
                        fontWeight: 900,
                        color: "#0e2b57",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: "4px",
                      }}
                    >
                      ₹{netPayout.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      <ArrowUpRight size={14} color="#10b981" />
                    </div>
                    <div style={{ fontSize: "11px", fontWeight: 800, color: "#10b981" }}>Net Revenue</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ marginTop: "24px", padding: "16px", background: "#f8fafc", borderRadius: "12px", fontSize: "12px", color: "rgba(14,43,87,0.6)", lineHeight: 1.5, fontWeight: 600 }}>
          ℹ️ Amounts shown are your net payout after the {feePercentage}% Famlo service fee. Payouts are
          initiated within 24–48 hours of guest check-in via UPI.
        </div>
      </div>

      {hostId ? (
        <div style={{ display: "grid", gap: 20 }}>
          <div style={{ borderBottom: "2px solid #f1f5f9", paddingBottom: "16px" }}>
            <h2 style={{ fontSize: "24px", fontWeight: 900, margin: "0 0 4px", color: "#0e2b57" }}>
              Smart Pricing Suggestions
            </h2>
            <p style={{ fontSize: "13px", margin: 0, color: "rgba(14,43,87,0.6)", fontWeight: 600 }}>
              Suggested rates now live under Earnings for quicker review.
            </p>
          </div>
          <PricingLabTab hostId={hostId} />
        </div>
      ) : null}
    </div>
  );
}
