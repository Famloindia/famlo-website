"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";

type FamloPlusStatusRow = {
  recordKey: string;
  subscriptionId: string | null;
  hostUserId: string | null;
  hostName: string;
  hostCode: string | null;
  accountId: string | null;
  primaryProPropertyId: string | null;
  primaryProPropertyName: string;
  primaryProPropertyLocation: string | null;
  status: string;
  scopedPropertiesCount: number;
  scopedRoomsCount: number;
  scopedPropertiesSummary: string;
  scopedRoomsSummary: string;
  purchasedDuration: string;
  currentMonthlyCharge: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  lastPaymentAt: string | null;
  lastChargeAt: string | null;
  nextRenewalDate: string | null;
  nextChargeAt: string | null;
  lastPaymentStatus: string | null;
  autopayEnabled: boolean;
  billingMode: "manual_order" | "autopay_subscription";
  mandateStatus: string | null;
  subscriptionProviderIdMasked: string | null;
  failedPaymentReason: string | null;
  hostCtaNeeded: string | null;
  phone: string | null;
  email: string | null;
  activationDuration: string | null;
  customEndDate: string | null;
  latestOrderStatus: string | null;
};

type FamloPlusOrderRow = {
  id: string;
  hostUserId: string | null;
  hostName: string;
  status: string;
  propertyCount: number;
  roomCount: number;
  subtotalAmount: number;
  gstAmount: number;
  totalAmount: number;
  createdAt: string | null;
  paymentCapturedAt: string | null;
};

type FamloPlusSummary = {
  proRevenue: number;
  proGst: number;
  proProfit: number;
  totalCollected: number;
  pendingPayments: number;
  failedPayments: number;
  activeSubscriptions: number;
  graceSubscriptions: number;
  pausedSubscriptions: number;
  haltedSubscriptions: number;
  autopaySubscriptions: number;
  manualSubscriptions: number;
  selectedPropertiesCount: number;
  selectedRoomsCount: number;
};

interface FamloPlusDeskProps {
  summary: FamloPlusSummary;
  rows: FamloPlusStatusRow[];
  orders: FamloPlusOrderRow[];
  notice?: {
    tone: "info" | "warning" | "error";
    text: string;
  };
  autopayStatusLabel?: string;
  allowDevReset?: boolean;
}

type FilterValue = "all" | "paid" | "pending" | "active" | "paused" | "expired";

const FILTERS: Array<{ value: FilterValue; label: string }> = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "expired", label: "Expired" },
];

function formatInr(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatDateInput(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function deriveBadge(row: FamloPlusStatusRow): { label: string; tone: "active" | "attention" | "failed" | "neutral" } {
  const subscriptionStatus = row.status.toLowerCase();
  const orderStatus = String(row.latestOrderStatus ?? "").toLowerCase();

  if (subscriptionStatus === "active") {
    return { label: "Active", tone: "active" };
  }
  if (subscriptionStatus === "grace") {
    return { label: "Grace", tone: "attention" };
  }
  if (subscriptionStatus === "payment_failed") {
    return { label: "Payment failed", tone: "failed" };
  }
  if (subscriptionStatus === "halted") {
    return { label: "Halted", tone: "failed" };
  }
  if (subscriptionStatus === "paused") {
    return { label: "Paused", tone: "neutral" };
  }
  if (subscriptionStatus === "cancelled") {
    return { label: "Cancelled", tone: "neutral" };
  }
  if (subscriptionStatus === "expired") {
    return { label: "Expired", tone: "failed" };
  }
  if (orderStatus === "payment_pending" || orderStatus === "draft") {
    return { label: "Pending", tone: "attention" };
  }
  if (orderStatus === "paid") {
    return { label: "Paid", tone: "active" };
  }
  return { label: titleCase(subscriptionStatus || "inactive"), tone: "neutral" };
}

function matchesFilter(row: FamloPlusStatusRow, filter: FilterValue): boolean {
  const subscriptionStatus = row.status.toLowerCase();
  const orderStatus = String(row.latestOrderStatus ?? "").toLowerCase();

  if (filter === "all") return true;
  if (filter === "paid") return orderStatus === "paid";
  if (filter === "pending") return orderStatus === "payment_pending" || orderStatus === "draft";
  if (filter === "active") return subscriptionStatus === "active" || subscriptionStatus === "grace";
  if (filter === "paused") {
    return (
      subscriptionStatus === "cancelled" ||
      subscriptionStatus === "paused" ||
      subscriptionStatus === "payment_failed" ||
      subscriptionStatus === "halted"
    );
  }
  if (filter === "expired") return subscriptionStatus === "expired" || subscriptionStatus === "paused";
  return true;
}

export default function FamloPlusDesk({
  summary,
  rows,
  orders,
  notice,
  autopayStatusLabel = "Manual renewal enabled, autopay not enabled",
  allowDevReset = false,
}: Readonly<FamloPlusDeskProps>): React.JSX.Element {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterValue>("all");
  const [daysByRecord, setDaysByRecord] = useState<Record<string, string>>({});
  const [customDateByRecord, setCustomDateByRecord] = useState<Record<string, string>>({});
  const [submittingRecordKey, setSubmittingRecordKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (!matchesFilter(row, activeFilter)) return false;
      if (!query) return true;

      return [
        row.primaryProPropertyName,
        row.hostName,
        row.phone ?? "",
        row.email ?? "",
        row.hostCode ?? "",
        row.accountId ?? "",
        row.primaryProPropertyLocation ?? "",
        deriveBadge(row).label,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [activeFilter, rows, search]);

  async function submitExtend(row: FamloPlusStatusRow): Promise<void> {
    if (!row.primaryProPropertyId) {
      setMessage({ type: "error", text: `Primary Pro property is missing for ${row.hostName}.` });
      return;
    }

    const now = new Date();
    const configuredCustomDate = (customDateByRecord[row.recordKey] ?? "").trim();
    const requestedDays = Number.parseInt((daysByRecord[row.recordKey] ?? "30").trim(), 10);
    const days = Number.isFinite(requestedDays) && requestedDays > 0 ? requestedDays : 30;
    const baseDate =
      row.currentPeriodEnd && Date.parse(row.currentPeriodEnd) > now.getTime() ? new Date(row.currentPeriodEnd) : now;
    const targetDate = configuredCustomDate
      ? configuredCustomDate
      : formatDateInput(new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000));

    setSubmittingRecordKey(row.recordKey);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/famlo-plus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: row.primaryProPropertyId,
          duration: "custom",
          customEndDate: targetDate,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Famlo Pro update failed.");
      }

      setMessage({
        type: "success",
        text: `${deriveBadge(row).label === "Inactive" ? "Activated" : "Extended"} Famlo Pro for ${row.hostName}.`,
      });
      window.location.reload();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Famlo Pro update failed.",
      });
    } finally {
      setSubmittingRecordKey(null);
    }
  }

  async function submitReset(row: FamloPlusStatusRow): Promise<void> {
    if (!allowDevReset || !row.primaryProPropertyId) return;
    setSubmittingRecordKey(row.recordKey);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/famlo-plus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset",
          familyId: row.primaryProPropertyId,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Famlo Pro reset failed.");
      }

      setMessage({
        type: "success",
        text: `Reset Famlo Pro test data for ${row.primaryProPropertyName}. Buy Famlo Pro should appear again after reload.`,
      });
      window.location.reload();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Famlo Pro reset failed.",
      });
    } finally {
      setSubmittingRecordKey(null);
    }
  }

  async function submitDeactivate(row: FamloPlusStatusRow): Promise<void> {
    if (!row.primaryProPropertyId) return;
    setSubmittingRecordKey(row.recordKey);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/famlo-plus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deactivate",
          familyId: row.primaryProPropertyId,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Famlo Pro stop failed.");
      }

      setMessage({
        type: "success",
        text: `Stopped Famlo Pro access for ${row.primaryProPropertyName}. Dashboard access is now blocked.`,
      });
      window.location.reload();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Famlo Pro stop failed.",
      });
    } finally {
      setSubmittingRecordKey(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <section style={heroStyle}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>Famlo Pro Access</h1>
          <p style={heroCopyStyle}>Manage Famlo Pro billing access, paid status, pauses, and extensions.</p>
          <p style={{ ...heroCopyStyle, marginTop: "4px", color: "rgba(255,255,255,0.62)" }}>{autopayStatusLabel}</p>
        </div>

        <div style={summaryGridStyle}>
          <div style={metricCardStyle}>
            <div style={metricLabelStyle}>Collected</div>
            <div style={metricValueStyle}>{formatInr(summary.totalCollected)}</div>
          </div>
          <div style={metricCardStyle}>
            <div style={metricLabelStyle}>Pro revenue</div>
            <div style={metricValueStyle}>{formatInr(summary.proRevenue)}</div>
          </div>
          <div style={metricCardStyle}>
            <div style={metricLabelStyle}>Pro GST</div>
            <div style={metricValueStyle}>{formatInr(summary.proGst)}</div>
          </div>
          <div style={metricCardStyle}>
            <div style={metricLabelStyle}>Pro Profit</div>
            <div style={metricValueStyle}>{formatInr(summary.proProfit)}</div>
          </div>
          <div style={metricCardStyle}>
            <div style={metricLabelStyle}>Active subs</div>
            <div style={metricValueStyle}>{summary.activeSubscriptions}</div>
          </div>
          <div style={metricCardStyle}>
            <div style={metricLabelStyle}>Grace subs</div>
            <div style={metricValueStyle}>{summary.graceSubscriptions}</div>
          </div>
          <div style={metricCardStyle}>
            <div style={metricLabelStyle}>Paused subs</div>
            <div style={metricValueStyle}>{summary.pausedSubscriptions}</div>
          </div>
          <div style={metricCardStyle}>
            <div style={metricLabelStyle}>Halted subs</div>
            <div style={metricValueStyle}>{summary.haltedSubscriptions}</div>
          </div>
          <div style={metricCardStyle}>
            <div style={metricLabelStyle}>Autopay subs</div>
            <div style={metricValueStyle}>{summary.autopaySubscriptions}</div>
          </div>
          <div style={metricCardStyle}>
            <div style={metricLabelStyle}>Manual subs</div>
            <div style={metricValueStyle}>{summary.manualSubscriptions}</div>
          </div>
          <div style={metricCardStyle}>
            <div style={metricLabelStyle}>Pending</div>
            <div style={metricValueStyle}>{summary.pendingPayments}</div>
          </div>
          <div style={metricCardStyle}>
            <div style={metricLabelStyle}>Failed</div>
            <div style={metricValueStyle}>{summary.failedPayments}</div>
          </div>
          <div style={metricCardStyle}>
            <div style={metricLabelStyle}>Scoped properties</div>
            <div style={metricValueStyle}>{summary.selectedPropertiesCount}</div>
          </div>
          <div style={metricCardStyle}>
            <div style={metricLabelStyle}>Scoped rooms</div>
            <div style={metricValueStyle}>{summary.selectedRoomsCount}</div>
          </div>
        </div>
      </section>

      {notice ? (
        <section
          style={{
            ...noticeStyle,
            ...(notice.tone === "error"
              ? errorNoticeStyle
              : notice.tone === "warning"
                ? warningNoticeStyle
                : infoNoticeStyle),
          }}
        >
          {notice.text}
        </section>
      ) : null}

      {message ? (
        <section style={{ ...noticeStyle, ...(message.type === "success" ? successNoticeStyle : errorNoticeStyle) }}>
          {message.text}
        </section>
      ) : null}

      <section style={panelStyle}>
        <div style={toolbarStyle}>
          <div style={filtersWrapStyle}>
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setActiveFilter(filter.value)}
                style={filterButtonStyle(activeFilter === filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search property, host, phone, email..."
            style={searchInputStyle}
          />
        </div>

        <div style={cardsListStyle}>
          {filteredRows.length === 0 ? (
            <div style={emptyStateStyle}>No Famlo Pro subscriptions match the current filters.</div>
          ) : (
            filteredRows.map((row) => {
              const badge = deriveBadge(row);
              const isSubmitting = submittingRecordKey === row.recordKey;

              return (
                <article key={row.recordKey} style={subscriptionCardStyle}>
                  <div style={cardHeaderStyle}>
                    <div style={{ minWidth: 0 }}>
                      <div style={cardTitleStyle}>
                        {row.hostName}
                        <span style={cardTitleDividerStyle}>·</span>
                        <span style={cardTitleSecondaryStyle}>{row.primaryProPropertyName}</span>
                      </div>
                      <div style={contactRowStyle}>
                        <span>{row.phone ?? "Phone unavailable"}</span>
                        <span>{row.email ?? "Email unavailable"}</span>
                      </div>
                      <div style={metaRowStyle}>
                        <span>{row.hostCode ?? "Host code unavailable"}</span>
                        {row.subscriptionProviderIdMasked ? <span>Autopay {row.subscriptionProviderIdMasked}</span> : null}
                      </div>
                    </div>

                    <div style={cardHeaderRightStyle}>
                      <div style={badgeStyle(badge.tone)}>{badge.label}</div>
                      {row.graceUntil ? <div style={graceTextStyle}>Grace until {formatDate(row.graceUntil)}</div> : null}
                    </div>
                  </div>

                  <div style={infoGridStyle}>
                    <div style={infoStatStyle}>
                      <div style={infoLabelStyle}>Purchased for</div>
                      <div style={infoValueStyle}>{row.purchasedDuration}</div>
                    </div>
                    <div style={infoStatStyle}>
                      <div style={infoLabelStyle}>From → To</div>
                      <div style={infoValueStyle}>
                        {formatDate(row.currentPeriodStart)} → {formatDate(row.currentPeriodEnd)}
                      </div>
                    </div>
                    <div style={infoStatStyle}>
                      <div style={infoLabelStyle}>Grace until</div>
                      <div style={infoValueStyle}>{formatDate(row.graceUntil)}</div>
                    </div>
                    <div style={infoStatStyle}>
                      <div style={infoLabelStyle}>Next renewal</div>
                      <div style={infoValueStyle}>{formatDate(row.nextRenewalDate)}</div>
                      <div style={infoSubtleStyle}>
                        {row.autopayEnabled ? `Autopay • ${row.mandateStatus ?? "mandate pending"}` : "Manual renewal"}
                      </div>
                    </div>
                    <div style={infoStatStyle}>
                      <div style={infoLabelStyle}>Last payment</div>
                      <div style={infoValueStyle}>{formatDate(row.lastPaymentAt)}</div>
                      <div style={infoSubtleStyle}>{titleCase(row.lastPaymentStatus ?? row.latestOrderStatus ?? "unknown")}</div>
                    </div>
                    <div style={infoStatStyle}>
                      <div style={infoLabelStyle}>Scoped properties</div>
                      <div style={infoValueStyle}>{row.scopedPropertiesCount}</div>
                      <div style={infoSubtleStyle}>{row.scopedPropertiesSummary}</div>
                    </div>
                    <div style={infoStatStyle}>
                      <div style={infoLabelStyle}>Scoped rooms</div>
                      <div style={infoValueStyle}>{row.scopedRoomsCount}</div>
                      <div style={infoSubtleStyle}>{row.scopedRoomsSummary}</div>
                    </div>
                    <div style={infoStatStyle}>
                      <div style={infoLabelStyle}>Current monthly charge</div>
                      <div style={infoValueStyle}>{formatInr(row.currentMonthlyCharge)}</div>
                      <div style={infoSubtleStyle}>{row.failedPaymentReason ?? row.hostCtaNeeded ?? "Healthy"}</div>
                    </div>
                  </div>

                  <div style={actionsRowStyle}>
                    <div style={{ color: "#475569", fontSize: "12px", fontWeight: 700 }}>
                      {row.hostCtaNeeded ?? (row.autopayEnabled ? "Auto-renewal healthy" : "Manual renewal available")}
                    </div>
                    <div style={extendControlsStyle}>
                      <label style={fieldStyle}>
                        <span style={fieldLabelStyle}>Extend by days</span>
                        <input
                          type="number"
                          min={1}
                          value={daysByRecord[row.recordKey] ?? "30"}
                          onChange={(event) =>
                            setDaysByRecord((current) => ({
                              ...current,
                              [row.recordKey]: event.target.value,
                            }))
                          }
                          style={smallInputStyle}
                        />
                      </label>
                      <label style={fieldStyle}>
                        <span style={fieldLabelStyle}>Custom end date</span>
                        <input
                          type="date"
                          value={customDateByRecord[row.recordKey] ?? row.customEndDate ?? ""}
                          onChange={(event) =>
                            setCustomDateByRecord((current) => ({
                              ...current,
                              [row.recordKey]: event.target.value,
                            }))
                          }
                          style={smallInputStyle}
                        />
                      </label>
                    </div>

                    <div style={buttonRowStyle}>
                      <button
                        type="button"
                        disabled={isSubmitting || !row.primaryProPropertyId}
                        onClick={() => void submitDeactivate(row)}
                        style={dangerButtonStyle(isSubmitting || !row.primaryProPropertyId)}
                      >
                        Stop / Deactivate
                      </button>
                      <button
                        type="button"
                        disabled={!allowDevReset || isSubmitting || !row.primaryProPropertyId}
                        onClick={() => void submitReset(row)}
                        title={allowDevReset ? "Clear Famlo Pro test data for this property" : "Reset only available outside production"}
                        style={secondaryButtonStyle(!allowDevReset || isSubmitting || !row.primaryProPropertyId)}
                      >
                        Reset test data
                      </button>
                      <button
                        type="button"
                        onClick={() => void submitExtend(row)}
                        disabled={isSubmitting || !row.primaryProPropertyId}
                        style={primaryButtonStyle(isSubmitting || !row.primaryProPropertyId)}
                      >
                        {isSubmitting
                          ? "Saving..."
                          : row.status === "inactive" ||
                              row.status === "expired" ||
                              row.status === "paused" ||
                              row.status === "cancelled" ||
                              row.status === "payment_failed"
                            ? "Activate / Extend"
                            : "Extend"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section style={panelStyle}>
        <div>
          <h2 style={sectionTitleStyle}>Recent Famlo Pro orders</h2>
          <p style={sectionCopyStyle}>Compact payment status view for latest Pro billing attempts.</p>
        </div>
        <div style={{ display: "grid", gap: "8px" }}>
          {orders.length === 0 ? (
            <div style={emptyStateStyle}>No Famlo Pro orders found yet.</div>
          ) : (
            orders.map((order) => (
              <article key={order.id} style={orderCardStyle}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "white", fontSize: "13px", fontWeight: 800 }}>{order.hostName}</div>
                  <div style={orderMetaStyle}>
                    {order.id.slice(0, 8)} · {formatDate(order.createdAt)}
                    {order.paymentCapturedAt ? ` · Captured ${formatDate(order.paymentCapturedAt)}` : ""}
                  </div>
                </div>
                <div style={orderStatusCellStyle}>{titleCase(order.status)}</div>
                <div style={orderMetricStyle}>{order.propertyCount} props</div>
                <div style={orderMetricStyle}>{order.roomCount} rooms</div>
                <div style={orderMetricStyle}>{formatInr(order.totalAmount)}</div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

const heroStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
  background: "linear-gradient(145deg, rgba(14,43,87,0.96), rgba(22,93,204,0.9))",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "20px",
  padding: "20px",
};

const heroCopyStyle: CSSProperties = {
  color: "rgba(255,255,255,0.76)",
  fontSize: "13px",
  lineHeight: 1.6,
  marginTop: "6px",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: "10px",
};

const metricCardStyle: CSSProperties = {
  borderRadius: "14px",
  padding: "14px",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.08)",
  display: "grid",
  gap: "6px",
};

const metricLabelStyle: CSSProperties = {
  color: "rgba(255,255,255,0.55)",
  fontSize: "10px",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const metricValueStyle: CSSProperties = {
  color: "white",
  fontSize: "22px",
  fontWeight: 900,
};

const noticeStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1px solid transparent",
  fontSize: "13px",
  fontWeight: 800,
};

const successNoticeStyle: CSSProperties = {
  background: "rgba(34,197,94,0.12)",
  color: "#86efac",
  borderColor: "rgba(34,197,94,0.2)",
};

const errorNoticeStyle: CSSProperties = {
  background: "rgba(248,113,113,0.12)",
  color: "#fca5a5",
  borderColor: "rgba(248,113,113,0.18)",
};

const dangerButtonStyle = (disabled: boolean): CSSProperties => ({
  borderRadius: "10px",
  padding: "10px 14px",
  border: "1px solid rgba(248,113,113,0.3)",
  background: disabled ? "rgba(248,113,113,0.08)" : "rgba(127,29,29,0.55)",
  color: disabled ? "rgba(254,202,202,0.5)" : "#fecaca",
  fontSize: "12px",
  fontWeight: 800,
  cursor: disabled ? "not-allowed" : "pointer",
});

const warningNoticeStyle: CSSProperties = {
  background: "rgba(251,191,36,0.14)",
  color: "#fde68a",
  borderColor: "rgba(251,191,36,0.2)",
};

const infoNoticeStyle: CSSProperties = {
  background: "rgba(147,197,253,0.14)",
  color: "#bfdbfe",
  borderColor: "rgba(147,197,253,0.2)",
};

const panelStyle: CSSProperties = {
  display: "grid",
  gap: "14px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "18px",
  padding: "18px",
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
  alignItems: "center",
};

const filtersWrapStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};

const searchInputStyle: CSSProperties = {
  width: "100%",
  maxWidth: "340px",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
};

const cardsListStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
};

const subscriptionCardStyle: CSSProperties = {
  display: "grid",
  gap: "14px",
  padding: "16px",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,0.07)",
  background: "rgba(255,255,255,0.035)",
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "14px",
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const cardTitleStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  flexWrap: "wrap",
  color: "white",
  fontSize: "17px",
  fontWeight: 900,
  lineHeight: 1.3,
};

const cardTitleDividerStyle: CSSProperties = {
  color: "rgba(255,255,255,0.25)",
};

const cardTitleSecondaryStyle: CSSProperties = {
  color: "#cfe0ff",
  fontWeight: 800,
};

const contactRowStyle: CSSProperties = {
  marginTop: "6px",
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  color: "rgba(255,255,255,0.72)",
  fontSize: "12px",
};

const metaRowStyle: CSSProperties = {
  marginTop: "6px",
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  color: "rgba(255,255,255,0.4)",
  fontSize: "11px",
};

const cardHeaderRightStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
  justifyItems: "end",
};

const graceTextStyle: CSSProperties = {
  color: "rgba(255,255,255,0.55)",
  fontSize: "11px",
};

const infoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "10px",
};

const infoStatStyle: CSSProperties = {
  borderRadius: "12px",
  padding: "12px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.05)",
  display: "grid",
  gap: "4px",
};

const infoLabelStyle: CSSProperties = {
  color: "rgba(255,255,255,0.45)",
  fontSize: "10px",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const infoValueStyle: CSSProperties = {
  color: "white",
  fontSize: "14px",
  fontWeight: 800,
};

const infoSubtleStyle: CSSProperties = {
  color: "rgba(255,255,255,0.45)",
  fontSize: "12px",
  lineHeight: 1.4,
};

const actionsRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
  alignItems: "end",
};

const extendControlsStyle: CSSProperties = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
};

const fieldLabelStyle: CSSProperties = {
  fontSize: "10px",
  fontWeight: 800,
  color: "rgba(255,255,255,0.42)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const smallInputStyle: CSSProperties = {
  minWidth: "120px",
  padding: "9px 10px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
  color: "white",
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: "white",
  fontSize: "18px",
  fontWeight: 900,
};

const sectionCopyStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "rgba(255,255,255,0.45)",
  fontSize: "12px",
  lineHeight: 1.6,
};

const emptyStateStyle: CSSProperties = {
  padding: "18px",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.45)",
  fontWeight: 700,
};

const orderCardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(140px, 1.5fr) minmax(90px, 0.8fr) repeat(3, minmax(80px, 0.7fr))",
  gap: "10px",
  alignItems: "center",
  padding: "12px 14px",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const orderMetaStyle: CSSProperties = {
  color: "rgba(255,255,255,0.45)",
  fontSize: "11px",
  lineHeight: 1.4,
};

const orderStatusCellStyle: CSSProperties = {
  color: "rgba(255,255,255,0.8)",
  fontSize: "12px",
  fontWeight: 800,
};

const orderMetricStyle: CSSProperties = {
  color: "white",
  fontSize: "12px",
  fontWeight: 800,
};

function filterButtonStyle(active: boolean): CSSProperties {
  return {
    borderRadius: "999px",
    border: `1px solid ${active ? "rgba(147,197,253,0.35)" : "rgba(255,255,255,0.1)"}`,
    background: active ? "rgba(37,99,235,0.22)" : "rgba(255,255,255,0.04)",
    color: active ? "#dbeafe" : "rgba(255,255,255,0.68)",
    padding: "8px 12px",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
  };
}

function badgeStyle(tone: "active" | "attention" | "failed" | "neutral"): CSSProperties {
  const palette =
    tone === "active"
      ? { bg: "rgba(34,197,94,0.12)", fg: "#86efac" }
      : tone === "attention"
        ? { bg: "rgba(251,191,36,0.12)", fg: "#fcd34d" }
        : tone === "failed"
          ? { bg: "rgba(248,113,113,0.12)", fg: "#fca5a5" }
          : { bg: "rgba(255,255,255,0.06)", fg: "rgba(255,255,255,0.68)" };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: "999px",
    background: palette.bg,
    color: palette.fg,
    fontSize: "11px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };
}

function primaryButtonStyle(disabled: boolean): CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "none",
    background: disabled ? "rgba(59,130,246,0.18)" : "linear-gradient(135deg, #2563eb, #1d4ed8)",
    color: "white",
    fontWeight: 900,
    fontSize: "12px",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}

function secondaryButtonStyle(disabled: boolean): CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.62)",
    fontWeight: 900,
    fontSize: "12px",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}
