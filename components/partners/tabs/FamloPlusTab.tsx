"use client";

import type { CSSProperties } from "react";
import { ArrowRight, BadgeIndianRupee, BarChart3, CalendarRange, ChartNoAxesCombined, Lock, RefreshCcw, Settings2, Users } from "lucide-react";
import styles from "../dashboard.module.css";

type FamloPlusTabProps = {
  familyId: string;
  familyName: string;
  famloPlusEnabled: boolean;
  proDashboardEnabled: boolean;
  access: {
    allowed: boolean;
    status: string;
    current_period_end: string | null;
    grace_until: string | null;
    reason: string;
  };
  proDashboardUrl: string;
  onNavigate: (tab: string) => void;
};

const FEATURE_CARDS = [
  { title: "OTA Channel Manager", description: "Manage connected OTA availability and updates from one Famlo workspace.", icon: RefreshCcw },
  { title: "Rooms & Rates", description: "Organize room inventory, rate structures, and future pricing controls.", icon: BadgeIndianRupee },
  { title: "Smart Calendar", description: "View deeper inventory planning for multi-room operations and sync workflows.", icon: CalendarRange },
  { title: "Sync Logs", description: "Track channel sync activity, retries, and operational visibility from a single place.", icon: ChartNoAxesCombined },
  { title: "Booking Source Tracking", description: "Understand where bookings originated and compare direct versus OTA demand.", icon: BarChart3 },
  { title: "Revenue Reports", description: "Review operational reporting designed for serious homestay businesses.", icon: ArrowRight },
  { title: "Team & Groups", description: "Prepare for staff roles, collaboration, and future access controls.", icon: Users },
];

const PLAN_CARDS = [
  {
    title: "Monthly Plan",
    price: "Pricing placeholder",
    note: "Best for pilot activation and early Famlo Pro testing.",
  },
  {
    title: "Yearly Plan",
    price: "Pricing placeholder",
    note: "Best for long-term professional homestays and operations teams.",
  },
];

function formatDate(value: string | null): string | null {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export default function FamloPlusTab({
  familyName,
  famloPlusEnabled,
  proDashboardEnabled,
  access,
  proDashboardUrl,
  onNavigate,
}: Readonly<FamloPlusTabProps>): React.JSX.Element {
  const periodEndLabel = formatDate(access.current_period_end);
  const graceUntilLabel = formatDate(access.grace_until);
  const canOpenPro = famloPlusEnabled && proDashboardEnabled && access.allowed;

  return (
    <div className={`${styles.flexCol} ${styles.animateIn}`} style={{ gap: "24px" }}>
      <section
        className={styles.glassCard}
        style={{
          ...heroStyle,
          opacity: famloPlusEnabled ? 1 : 0.72,
        }}
      >
        <div style={{ display: "grid", gap: "10px" }}>
          <div style={eyebrowStyle}>Famlo+ Upgrade</div>
          <h2 style={headingStyle}>Unlock Famlo Pro</h2>
          <p style={heroCopyStyle}>
            Famlo Pro is the upcoming advanced dashboard for PMS + Channel Manager workflows. It is built for serious
            homestays that need stronger inventory, channel, and reporting controls without replacing the current
            Basic Dashboard.
          </p>
          <p style={heroSubtleStyle}>
            Property: <strong>{familyName}</strong>
          </p>
        </div>

        <div style={heroActionRowStyle}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => {
              if (canOpenPro) {
                window.location.href = proDashboardUrl;
              }
            }}
            disabled={!canOpenPro}
            style={{
              width: "auto",
              minWidth: "220px",
              opacity: canOpenPro ? 1 : 0.68,
              cursor: canOpenPro ? "pointer" : "not-allowed",
            }}
          >
            Open Famlo Pro
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            style={secondaryButtonStyle}
            onClick={() => onNavigate("support")}
          >
            Contact Famlo
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            style={secondaryButtonStyle}
            onClick={() => onNavigate("support")}
          >
            Request activation
          </button>
        </div>

        <div style={statusWrapStyle}>
          <div style={statusCardStyle}>
            <div style={statusLabelStyle}>Famlo+ Status</div>
            <div style={statusValueStyle}>{access.status}</div>
            <div style={statusHintStyle}>
              {access.allowed
                ? access.status === "grace"
                  ? `Grace access active${graceUntilLabel ? ` until ${graceUntilLabel}` : ""}.`
                  : `Famlo Pro is unlocked${periodEndLabel ? ` until ${periodEndLabel}` : ""}.`
                : "Pilot activation available through Famlo team."}
            </div>
          </div>
          <div style={statusCardStyle}>
            <div style={statusLabelStyle}>Activation Note</div>
            <div style={statusValueStyle}>Coming soon</div>
            <div style={statusHintStyle}>
              Payment integration coming soon. Pilot activation is currently available through Famlo support.
            </div>
          </div>
          {!famloPlusEnabled ? (
            <div style={statusCardStyle}>
              <div style={statusLabelStyle}>Environment</div>
              <div style={statusValueStyle}>Disabled</div>
              <div style={statusHintStyle}>`FAMLO_ENABLE_FAMLO_PLUS_PAGE` is off, so this page is in safe-preview mode.</div>
            </div>
          ) : null}
        </div>
      </section>

      <section className={styles.glassCard}>
        <div style={sectionHeaderStyle}>
          <div>
            <div style={eyebrowStyle}>Why Famlo Pro</div>
            <h3 style={sectionTitleStyle}>Built for professional homestay operations</h3>
          </div>
          <div style={sectionCopyStyle}>
            Keep using the current Basic Dashboard for day-to-day listing management while unlocking a separate Pro
            workspace for advanced PMS and channel operations.
          </div>
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

      <section style={planGridStyle}>
        {PLAN_CARDS.map((plan) => (
          <article key={plan.title} className={styles.glassCard} style={{ display: "grid", gap: "16px" }}>
            <div style={eyebrowStyle}>Plan placeholder</div>
            <div>
              <h3 style={{ margin: 0, fontSize: "24px", fontWeight: 900, color: "#0e2b57" }}>{plan.title}</h3>
              <div style={{ marginTop: "10px", fontSize: "18px", fontWeight: 800, color: "#165dcc" }}>{plan.price}</div>
            </div>
            <p style={{ margin: 0, color: "rgba(14,43,87,0.72)", lineHeight: 1.7 }}>{plan.note}</p>
            <div style={planFooterStyle}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <Lock size={14} />
                Payment integration coming soon
              </span>
              <span>Pilot activation available through Famlo team.</span>
            </div>
          </article>
        ))}
      </section>

      <section className={styles.glassCard} style={footerCalloutStyle}>
        <Settings2 size={20} />
        <div style={{ display: "grid", gap: "6px" }}>
          <strong style={{ color: "#0e2b57" }}>Basic dashboard stays available</strong>
          <span style={{ color: "rgba(14,43,87,0.72)", lineHeight: 1.6 }}>
            Famlo Pro will unlock a separate workspace. Your current Basic Dashboard, direct booking tools, and basic
            calendar flow remain available either way.
          </span>
        </div>
      </section>
    </div>
  );
}

const heroStyle: CSSProperties = {
  background: "linear-gradient(145deg, #0e2b57 0%, #165dcc 60%, #f8fafc 160%)",
  color: "white",
  border: "none",
  display: "grid",
  gap: "24px",
};

const heroActionRowStyle: CSSProperties = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  alignItems: "center",
};

const statusWrapStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
};

const statusCardStyle: CSSProperties = {
  background: "rgba(255,255,255,0.12)",
  borderRadius: "18px",
  padding: "18px",
  border: "1px solid rgba(255,255,255,0.18)",
  display: "grid",
  gap: "8px",
};

const sectionHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
  gap: "20px",
  alignItems: "start",
  marginBottom: "20px",
};

const sectionTitleStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "28px",
  fontWeight: 900,
  color: "#0e2b57",
};

const sectionCopyStyle: CSSProperties = {
  color: "rgba(14,43,87,0.72)",
  lineHeight: 1.7,
  fontWeight: 600,
};

const featureGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
};

const featureCardStyle: CSSProperties = {
  borderRadius: "18px",
  border: "1px solid rgba(14,43,87,0.08)",
  background: "#f8fafc",
  padding: "18px",
  display: "grid",
  gap: "14px",
};

const featureIconWrapStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "12px",
  background: "#e0ebff",
  color: "#165dcc",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const planGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "16px",
};

const planFooterStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
  color: "rgba(14,43,87,0.72)",
  fontSize: "13px",
  fontWeight: 700,
};

const footerCalloutStyle: CSSProperties = {
  display: "flex",
  gap: "14px",
  alignItems: "flex-start",
  background: "#f8fafc",
};

const secondaryButtonStyle: CSSProperties = {
  width: "auto",
  minWidth: "180px",
  background: "white",
  color: "#0e2b57",
};

const eyebrowStyle: CSSProperties = {
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.76)",
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: "36px",
  lineHeight: 1.05,
  fontWeight: 900,
};

const heroCopyStyle: CSSProperties = {
  margin: 0,
  maxWidth: "800px",
  lineHeight: 1.8,
  color: "rgba(255,255,255,0.9)",
  fontWeight: 600,
};

const heroSubtleStyle: CSSProperties = {
  margin: 0,
  color: "rgba(255,255,255,0.72)",
  fontSize: "13px",
  fontWeight: 700,
};

const statusLabelStyle: CSSProperties = {
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.72)",
};

const statusValueStyle: CSSProperties = {
  fontSize: "24px",
  fontWeight: 900,
  textTransform: "capitalize",
};

const statusHintStyle: CSSProperties = {
  color: "rgba(255,255,255,0.84)",
  lineHeight: 1.6,
  fontSize: "13px",
};

const featureTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "16px",
  fontWeight: 900,
  color: "#0e2b57",
};

const featureCopyStyle: CSSProperties = {
  margin: 0,
  color: "rgba(14,43,87,0.72)",
  lineHeight: 1.65,
  fontSize: "14px",
};
