"use client";

import { Clock, TrendingUp, AlertTriangle } from "lucide-react";

interface HommieResponseStat {
  id: string;
  name: string;
  email: string;
  avg_response_minutes: number;
  total_conversations: number;
  flagged: boolean;
}

interface ResponseTimeTrackerProps {
  stats: HommieResponseStat[];
}

function responseLabel(minutes: number) {
  if (minutes < 30) return { label: `${Math.round(minutes)}m`, color: "#22c55e", level: "Fast" };
  if (minutes < 60) return { label: `${Math.round(minutes)}m`, color: "#86efac", level: "Good" };
  if (minutes < 120) return { label: `${Math.round(minutes)}m`, color: "#fbbf24", level: "Slow" };
  const hours = (minutes / 60).toFixed(1);
  return { label: `${hours}h`, color: "#ef4444", level: "Very Slow" };
}

export default function ResponseTimeTracker({ stats }: ResponseTimeTrackerProps) {
  const flagged = stats.filter((s) => s.avg_response_minutes > 120);
  const sorted = [...stats].sort((a, b) => b.avg_response_minutes - a.avg_response_minutes);

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>Response Time Tracker</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "6px" }}>
          Average time between guest message and Hommie reply. Hommies over 2 hours are auto-flagged.
          {flagged.length > 0 && <span style={{ color: "#ef4444", fontWeight: 800 }}> {flagged.length} slow responder{flagged.length > 1 ? "s" : ""}.</span>}
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "24px" }}>
        {[
          { label: "Avg Platform Response", value: `${Math.round(stats.reduce((a, s) => a + s.avg_response_minutes, 0) / (stats.length || 1))}m`, color: "#93c5fd" },
          { label: "Flagged (> 2h)", value: flagged.length, color: "#fca5a5" },
          { label: "Total Hommies Tracked", value: stats.length, color: "#86efac" }
        ].map((card) => (
          <div key={card.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", padding: "18px 20px" }}>
            <div style={{ fontSize: "10px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>{card.label}</div>
            <div style={{ fontSize: "26px", fontWeight: 900, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Hommie", "Avg Response Time", "Conversations", "Status"].map((col) => (
                <th key={col} style={{ padding: "12px 18px", textAlign: "left", fontSize: "10px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((hommie) => {
              const resp = responseLabel(hommie.avg_response_minutes);
              const isSlow = hommie.avg_response_minutes > 120;
              return (
                <tr key={hommie.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: isSlow ? "rgba(239,68,68,0.04)" : "transparent" }}>
                  <td style={{ padding: "14px 18px" }}>
                    <div style={{ fontWeight: 800, fontSize: "13px", color: "white" }}>{hommie.name}</div>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>{hommie.email}</div>
                  </td>
                  <td style={{ padding: "14px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Clock size={14} color={resp.color} />
                      <span style={{ fontWeight: 900, fontSize: "16px", color: resp.color }}>{resp.label}</span>
                    </div>
                    {/* Progress bar */}
                    <div style={{ marginTop: "6px", height: "3px", background: "rgba(255,255,255,0.06)", borderRadius: "999px", width: "120px" }}>
                      <div style={{ height: "100%", borderRadius: "999px", background: resp.color, width: `${Math.min(100, (hommie.avg_response_minutes / 240) * 100)}%` }} />
                    </div>
                  </td>
                  <td style={{ padding: "14px 18px", fontSize: "13px", color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>
                    {hommie.total_conversations}
                  </td>
                  <td style={{ padding: "14px 18px" }}>
                    {isSlow ? (
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(239,68,68,0.12)", color: "#fca5a5", padding: "5px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 900, width: "fit-content" }}>
                        <AlertTriangle size={12} /> Slow Responder
                      </span>
                    ) : (
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", color: resp.color, fontSize: "12px", fontWeight: 800 }}>
                        <TrendingUp size={13} /> {resp.level}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && <div style={{ padding: "60px", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: "13px" }}>No response time data available yet</div>}
      </div>
    </div>
  );
}
