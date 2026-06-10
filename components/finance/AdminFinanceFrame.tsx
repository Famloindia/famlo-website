import Link from "next/link";
import type { ReactNode } from "react";

export function AdminFinanceHeader({
  title,
  description,
  nav,
}: {
  title: string;
  description: ReactNode;
  nav: Array<{ href: string; label: string; active?: boolean }>;
}) {
  return (
    <div style={{ display: "grid", gap: "16px", marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: "8px", maxWidth: "900px" }}>
          <div style={{ fontSize: "12px", color: "#93c5fd", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Famlo Finance Ops
          </div>
          <h1 style={{ margin: 0, color: "white", fontSize: "30px", fontWeight: 900 }}>{title}</h1>
          <div style={{ fontSize: "14px", lineHeight: 1.7, color: "rgba(255,255,255,0.66)" }}>{description}</div>
        </div>
      </div>
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
    </div>
  );
}
