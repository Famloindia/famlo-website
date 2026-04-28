"use client";

import { useState, useCallback } from "react";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

interface CommissionSliderProps {
  entities: { id: string; name: string; type: string; email: string; commission_rate_override: number | null }[];
  platformDefaultRate: number;
  adminId: string;
}

function EntitySlider({ entity, platformDefault, adminId }: { entity: CommissionSliderProps["entities"][0]; platformDefault: number; adminId: string }) {
  const currentRate = entity.commission_rate_override ?? platformDefault;
  const [rate, setRate] = useState(currentRate);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (rate === currentRate) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const response = await fetch("/api/admin/commission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: entity.id, newRate: rate, oldRate: currentRate, adminId })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload.error === "string" ? payload.error : "Failed to save commission.");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save commission.");
    } finally {
      setSaving(false);
    }
  }, [rate, currentRate, entity.id, adminId]);

  const isOverridden = entity.commission_rate_override !== null;

  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: "15px", color: "white" }}>{entity.name}</div>
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", marginTop: "2px" }}>
            {entity.email} · <span style={{ textTransform: "capitalize" }}>{entity.type}</span>
            {isOverridden && <span style={{ marginLeft: "8px", background: "rgba(124,58,237,0.2)", color: "#c4b5fd", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 900 }}>CUSTOM RATE</span>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "28px", fontWeight: 900, color: rate > 20 ? "#fca5a5" : rate > 10 ? "#fbbf24" : "#86efac" }}>{rate}%</div>
          {!isOverridden && <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)", fontWeight: 700 }}>Using platform default</div>}
        </div>
      </div>

      {/* Slider */}
      <div style={{ marginBottom: "16px" }}>
        <input type="range" min={0} max={40} step={0.5} value={rate} onChange={(e) => setRate(parseFloat(e.target.value))}
          style={{ width: "100%", accentColor: rate > 20 ? "#ef4444" : "#165dcc", cursor: "pointer" }} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
          {[0, 10, 20, 30, 40].map((v) => (
            <span key={v} style={{ fontSize: "10px", fontWeight: 700, color: "rgba(255,255,255,0.2)" }}>{v}%</span>
          ))}
        </div>
      </div>

      {/* Warning at high rates */}
      {rate > 30 && (
        <div style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: "8px", padding: "8px 12px", marginBottom: "12px", display: "flex", gap: "8px", alignItems: "center" }}>
          <AlertTriangle size={14} color="#ef4444" />
          <span style={{ fontSize: "12px", color: "#fca5a5", fontWeight: 700 }}>High commission rate. Applied at checkout in real-time.</span>
        </div>
      )}

      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <button onClick={handleSave} disabled={saving || rate === currentRate}
          style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", background: rate !== currentRate ? "#165dcc" : "rgba(255,255,255,0.06)", color: rate !== currentRate ? "white" : "rgba(255,255,255,0.2)", fontWeight: 900, fontSize: "13px", cursor: rate !== currentRate ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
          {saving ? <Loader2 className="animate-spin" size={16} /> : "Save Commission"}
        </button>
        {entity.commission_rate_override !== null && (
          <button onClick={() => setRate(platformDefault)}
            style={{ padding: "10px 16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.4)", fontWeight: 800, fontSize: "12px", cursor: "pointer" }}>
            Reset to Default ({platformDefault}%)
          </button>
        )}
        {saved && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#86efac", fontSize: "12px", fontWeight: 800 }}>
            <CheckCircle2 size={14} /> Saved
          </div>
        )}
      </div>
      {error ? (
        <div style={{ marginTop: "10px", fontSize: "12px", color: "#fca5a5", fontWeight: 700 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}

export default function CommissionSlider({ entities, platformDefaultRate, adminId }: CommissionSliderProps) {
  const [search, setSearch] = useState("");

  const filtered = entities.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>Commission Control</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "6px" }}>
          Platform default: <strong style={{ color: "white" }}>{platformDefaultRate}%</strong>. Override per entity. Applied at checkout in real-time — never pre-baked. All changes are audit-logged.
        </p>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search hosts or hommies..."
        style={{ width: "100%", padding: "10px 16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: "13px", outline: "none", fontFamily: "inherit", marginBottom: "20px", boxSizing: "border-box" }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: "16px" }}>
        {filtered.map((entity) => (
          <EntitySlider key={entity.id} entity={entity} platformDefault={platformDefaultRate} adminId={adminId} />
        ))}
      </div>
    </div>
  );
}
