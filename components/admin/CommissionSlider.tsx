"use client";

import { AlertTriangle } from "lucide-react";

interface CommissionSliderProps {
  entities: { id: string; name: string; type: string; email: string; commission_rate_override: number | null }[];
  platformDefaultRate: number;
  adminId: string;
}

function EntityCard({
  entity,
  platformDefault,
}: {
  entity: CommissionSliderProps["entities"][0];
  platformDefault: number;
}) {
  const isOverridden = entity.commission_rate_override !== null;

  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: "15px", color: "white" }}>{entity.name}</div>
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", marginTop: "2px" }}>
            {entity.email} · <span style={{ textTransform: "capitalize" }}>{entity.type}</span>
            {isOverridden ? (
              <span
                style={{
                  marginLeft: "8px",
                  background: "rgba(250,204,21,0.18)",
                  color: "#fde68a",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontSize: "10px",
                  fontWeight: 900,
                }}
              >
                LEGACY OVERRIDE
              </span>
            ) : null}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "28px", fontWeight: 900, color: "#86efac" }}>{platformDefault}%</div>
          <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)", fontWeight: 700 }}>Flat marketplace commission</div>
        </div>
      </div>

      <div
        style={{
          background: "rgba(34,197,94,0.08)",
          border: "1px solid rgba(34,197,94,0.18)",
          borderRadius: "12px",
          padding: "12px 14px",
          fontSize: "12px",
          color: "rgba(255,255,255,0.78)",
          fontWeight: 700,
        }}
      >
        Famlo OTA commission is fixed at {platformDefault}% for all marketplace bookings. Manual per-entity pricing overrides are disabled.
      </div>

      {isOverridden ? (
        <div style={{ marginTop: "12px", display: "flex", gap: "8px", alignItems: "center", fontSize: "12px", color: "#fbbf24", fontWeight: 700 }}>
          <AlertTriangle size={14} color="#fbbf24" />
          Legacy override detected in stored profile data. Checkout should ignore it; keep this visible for audit cleanup.
        </div>
      ) : null}
    </div>
  );
}

export default function CommissionSlider({ entities, platformDefaultRate }: CommissionSliderProps) {
  const overrides = entities.filter((entity) => entity.commission_rate_override !== null);

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>Commission Control</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "6px" }}>
          Platform default: <strong style={{ color: "white" }}>{platformDefaultRate}%</strong>. Famlo OTA now uses one flat marketplace commission, and manual overrides stay disabled.
        </p>
      </div>

      <div
        style={{
          marginBottom: "20px",
          padding: "14px 16px",
          borderRadius: "14px",
          background: "rgba(96,165,250,0.1)",
          border: "1px solid rgba(96,165,250,0.22)",
          color: "#dbeafe",
          fontSize: "13px",
          fontWeight: 700,
        }}
      >
        Legacy override rows still present: {overrides.length}. These should be cleared by migration and route enforcement before production.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: "16px" }}>
        {entities.map((entity) => (
          <EntityCard key={entity.id} entity={entity} platformDefault={platformDefaultRate} />
        ))}
      </div>
    </div>
  );
}
