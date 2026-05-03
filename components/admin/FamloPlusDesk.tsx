"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type FamloPlusStatusRow = {
  familyId: string;
  familyName: string;
  hostCode: string | null;
  city: string | null;
  state: string | null;
  famloPlusStatus: string;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
};

type DurationValue = "1_month" | "3_months" | "1_year" | "custom";

interface FamloPlusDeskProps {
  rows: FamloPlusStatusRow[];
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

export default function FamloPlusDesk({ rows }: Readonly<FamloPlusDeskProps>): React.JSX.Element {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [submittingFamilyId, setSubmittingFamilyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [durationByFamilyId, setDurationByFamilyId] = useState<Record<string, DurationValue>>({});
  const [customDateByFamilyId, setCustomDateByFamilyId] = useState<Record<string, string>>({});

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((row) => {
      const haystack = [
        row.familyName,
        row.hostCode ?? "",
        row.city ?? "",
        row.state ?? "",
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [rows, search]);

  async function activateFamily(row: FamloPlusStatusRow): Promise<void> {
    const familyId = row.familyId;
    const duration = durationByFamilyId[familyId] ?? "1_month";
    const customEndDate = customDateByFamilyId[familyId] ?? "";

    setSubmittingFamilyId(familyId);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/famlo-plus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          duration,
          customEndDate: duration === "custom" ? customEndDate : undefined,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage({ type: "error", text: payload.error ?? "Activation failed." });
        return;
      }

      setMessage({
        type: "success",
        text: `Famlo+ activated for ${row.familyName}.`,
      });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Activation failed.",
      });
    } finally {
      setSubmittingFamilyId(null);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>Famlo+ Manual Activation</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "6px", lineHeight: 1.7 }}>
          Admin-only manual activation desk for testing Famlo+ entitlement and access to the separate Famlo Pro route.
        </p>
      </div>

      {message ? (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px 14px",
            borderRadius: "10px",
            background: message.type === "success" ? "rgba(34,197,94,0.12)" : "rgba(220,38,38,0.12)",
            color: message.type === "success" ? "#86efac" : "#fca5a5",
            fontSize: "13px",
            fontWeight: 800,
            border: `1px solid ${message.type === "success" ? "rgba(34,197,94,0.24)" : "rgba(220,38,38,0.24)"}`,
          }}
        >
          {message.text}
        </div>
      ) : null}

      <div style={{ marginBottom: "18px" }}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by property, host code, city, state..."
          style={{
            width: "100%",
            maxWidth: "420px",
            padding: "10px 14px",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.05)",
            color: "white",
            fontSize: "13px",
            outline: "none",
            fontFamily: "inherit",
          }}
        />
      </div>

      <div style={{ display: "grid", gap: "14px" }}>
        {filteredRows.map((row) => {
          const duration = durationByFamilyId[row.familyId] ?? "1_month";
          const isSubmitting = submittingFamilyId === row.familyId;

          return (
            <section
              key={row.familyId}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "16px",
                padding: "18px",
                display: "grid",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "18px", fontWeight: 900, color: "white" }}>{row.familyName}</div>
                  <div style={{ marginTop: "6px", fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>
                    Host ID: {row.hostCode ?? "Pending"}{row.city || row.state ? ` · ${[row.city, row.state].filter(Boolean).join(", ")}` : ""}
                  </div>
                </div>
                <div
                  style={{
                    alignSelf: "flex-start",
                    padding: "5px 10px",
                    borderRadius: "999px",
                    background: row.famloPlusStatus === "active"
                      ? "rgba(34,197,94,0.12)"
                      : row.famloPlusStatus === "grace"
                        ? "rgba(251,191,36,0.12)"
                        : "rgba(255,255,255,0.06)",
                    color: row.famloPlusStatus === "active"
                      ? "#86efac"
                      : row.famloPlusStatus === "grace"
                        ? "#fcd34d"
                        : "rgba(255,255,255,0.55)",
                    fontSize: "11px",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {row.famloPlusStatus}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "10px",
                }}
              >
                <div style={infoCardStyle}>
                  <div style={infoLabelStyle}>Current Period End</div>
                  <div style={infoValueStyle}>{formatDate(row.currentPeriodEnd)}</div>
                </div>
                <div style={infoCardStyle}>
                  <div style={infoLabelStyle}>Grace Until</div>
                  <div style={infoValueStyle}>{formatDate(row.graceUntil)}</div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(160px, 180px) minmax(180px, 220px) auto",
                  gap: "10px",
                  alignItems: "end",
                }}
              >
                <label style={fieldStyle}>
                  <span style={fieldLabelStyle}>Duration</span>
                  <select
                    value={duration}
                    onChange={(event) =>
                      setDurationByFamilyId((current) => ({
                        ...current,
                        [row.familyId]: event.target.value as DurationValue,
                      }))
                    }
                    style={inputStyle}
                  >
                    <option value="1_month">1 month</option>
                    <option value="3_months">3 months</option>
                    <option value="1_year">1 year</option>
                    <option value="custom">Custom end date</option>
                  </select>
                </label>

                <label style={fieldStyle}>
                  <span style={fieldLabelStyle}>Custom End Date</span>
                  <input
                    type="date"
                    value={customDateByFamilyId[row.familyId] ?? ""}
                    onChange={(event) =>
                      setCustomDateByFamilyId((current) => ({
                        ...current,
                        [row.familyId]: event.target.value,
                      }))
                    }
                    disabled={duration !== "custom"}
                    style={{
                      ...inputStyle,
                      opacity: duration === "custom" ? 1 : 0.5,
                      cursor: duration === "custom" ? "text" : "not-allowed",
                    }}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void activateFamily(row)}
                  disabled={isSubmitting || (duration === "custom" && !(customDateByFamilyId[row.familyId] ?? "").trim())}
                  style={{
                    padding: "11px 16px",
                    borderRadius: "10px",
                    border: "none",
                    background: "rgba(220,38,38,0.18)",
                    color: "#fca5a5",
                    fontWeight: 900,
                    fontSize: "12px",
                    cursor: isSubmitting ? "wait" : "pointer",
                  }}
                >
                  {isSubmitting ? "Saving..." : row.currentPeriodEnd ? "Activate / Extend" : "Activate Famlo+"}
                </button>
              </div>
            </section>
          );
        })}

        {filteredRows.length === 0 ? (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              borderRadius: "16px",
              border: "1px dashed rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.35)",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            No host families match your search.
          </div>
        ) : null}
      </div>
    </div>
  );
}

const infoCardStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: "12px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const infoLabelStyle: CSSProperties = {
  fontSize: "10px",
  fontWeight: 900,
  color: "rgba(255,255,255,0.32)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const infoValueStyle: CSSProperties = {
  marginTop: "6px",
  fontSize: "14px",
  fontWeight: 800,
  color: "white",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
};

const fieldLabelStyle: CSSProperties = {
  fontSize: "10px",
  fontWeight: 900,
  color: "rgba(255,255,255,0.32)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
  color: "white",
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
};
