import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { statusTone } from "@/lib/finance/dashboard-view-utils";

export function FinanceShell({
  eyebrow,
  title,
  description,
  nav,
  children,
}: {
  eyebrow: string;
  title: string;
  description: ReactNode;
  nav?: Array<{ href: string; label: string; active?: boolean }>;
  children: ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #081120 0%, #0f172a 100%)", color: "white", padding: "28px 18px 42px" }}>
      <div style={{ maxWidth: "1220px", margin: "0 auto", display: "grid", gap: "18px" }}>
        <div style={{ display: "grid", gap: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: "8px", maxWidth: "780px" }}>
              <div style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 800, color: "#93c5fd" }}>
                {eyebrow}
              </div>
              <h1 style={{ margin: 0, fontSize: "32px", fontWeight: 900 }}>{title}</h1>
              <div style={{ color: "rgba(255,255,255,0.68)", fontSize: "14px", lineHeight: 1.7 }}>{description}</div>
            </div>
            {nav?.length ? (
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {nav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "999px",
                      textDecoration: "none",
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: item.active ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.04)",
                      color: "white",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <section
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "18px",
        padding: "20px",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>{children}</div>;
}

export function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  return (
    <Card style={{ padding: "16px" }}>
      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 900 }}>{value}</div>
      {detail ? <div style={{ marginTop: "6px", fontSize: "12px", color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>{detail}</div> : null}
    </Card>
  );
}

export function Banner({ tone = "info", title, message }: { tone?: "info" | "warning" | "danger" | "success"; title: string; message: string }) {
  const palette = {
    info: { background: "rgba(37,99,235,0.14)", border: "rgba(96,165,250,0.3)", color: "#bfdbfe" },
    warning: { background: "rgba(217,119,6,0.14)", border: "rgba(251,191,36,0.3)", color: "#fde68a" },
    danger: { background: "rgba(220,38,38,0.14)", border: "rgba(248,113,113,0.3)", color: "#fecaca" },
    success: { background: "rgba(21,128,61,0.14)", border: "rgba(74,222,128,0.3)", color: "#bbf7d0" },
  }[tone];
  return (
    <Card style={{ background: palette.background, borderColor: palette.border }}>
      <div style={{ display: "grid", gap: "6px" }}>
        <div style={{ fontWeight: 800, color: palette.color }}>{title}</div>
        <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "13px", lineHeight: 1.6 }}>{message}</div>
      </div>
    </Card>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string | null;
  action?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap", marginBottom: "14px" }}>
      <div style={{ display: "grid", gap: "6px" }}>
        <div style={{ fontSize: "18px", fontWeight: 800 }}>{title}</div>
        {description ? <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.66)", lineHeight: 1.6 }}>{description}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function StatusPill({ value }: { value: string | null | undefined }) {
  const tone = statusTone(value);
  const palette = {
    neutral: { background: "rgba(148,163,184,0.16)", color: "#e2e8f0" },
    success: { background: "rgba(34,197,94,0.16)", color: "#bbf7d0" },
    warning: { background: "rgba(245,158,11,0.16)", color: "#fde68a" },
    danger: { background: "rgba(239,68,68,0.16)", color: "#fecaca" },
    info: { background: "rgba(59,130,246,0.16)", color: "#bfdbfe" },
  }[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: "999px",
        background: palette.background,
        color: palette.color,
        fontSize: "11px",
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {value ?? "unknown"}
    </span>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <Card style={{ textAlign: "center", padding: "30px 20px" }}>
      <div style={{ display: "grid", gap: "8px", justifyItems: "center" }}>
        <div style={{ fontSize: "18px", fontWeight: 800 }}>{title}</div>
        <div style={{ maxWidth: "540px", color: "rgba(255,255,255,0.68)", fontSize: "14px", lineHeight: 1.7 }}>{message}</div>
      </div>
    </Card>
  );
}

export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "820px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", textAlign: "left" }}>
            {headers.map((header) => (
              <th key={header} style={{ padding: "10px 8px", fontSize: "11px", color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} style={{ padding: "12px 8px", fontSize: "13px", color: "rgba(255,255,255,0.9)", verticalAlign: "top" }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
