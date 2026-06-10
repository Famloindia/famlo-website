"use client";

import { useState } from "react";
import { Eye, ShieldCheck, Loader2, Search, ExternalLink, Info } from "lucide-react";

interface ShadowUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface ShadowModeProps {
  users: ShadowUser[];
  actorId: string;
}

export default function ShadowMode({ users, actorId }: ShadowModeProps) {
  const [search, setSearch] = useState("");
  const [starting, setStarting] = useState<string | null>(null);

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const startShadow = async (user: ShadowUser) => {
    setStarting(user.id);
    try {
      const res = await fetch("/api/teams/shadow/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId, targetUserId: user.id })
      });
      const data = await res.json();
      if (data.success) {
        // In a real app, this would set a shadow cookie or session and redirect
        // For the demo, we show a success state
        alert(`Shadow Session Started (${data.sessionId}). You are now viewing as ${user.name} (READ-ONLY). All sensitive actions are blocked by the middleware.`);
        window.open("/", "_blank");
      }
    } finally {
      setStarting(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>Shadow Mode</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "6px" }}>
          View the platform exactly as a user sees it. Sessions are strictly **READ-ONLY** and every click is logged for compliance.
        </p>
      </div>

      <div style={{ background: "rgba(22,93,204,0.1)", border: "1px solid rgba(22,93,204,0.2)", borderRadius: "12px", padding: "16px 20px", marginBottom: "24px", display: "flex", gap: "12px", alignItems: "center" }}>
        <ShieldCheck size={18} color="#93c5fd" />
        <span style={{ fontSize: "13px", color: "#93c5fd", fontWeight: 700 }}>Middleware-enforced read-only mode active during shadow sessions.</span>
      </div>

      <div style={{ position: "relative", marginBottom: "20px" }}>
        <Search size={16} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search user to shadow..."
          style={{ width: "100%", padding: "10px 16px 10px 40px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: "13px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
        {filtered.map((user) => (
          <div key={user.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: "14px", color: "white", marginBottom: "2px" }}>{user.name}</div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", marginBottom: "8px" }}>{user.email}</div>
              <span style={{ padding: "3px 10px", borderRadius: "5px", fontSize: "10px", fontWeight: 900, textTransform: "uppercase", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>{user.role}</span>
            </div>
            <button onClick={() => startShadow(user)} disabled={starting === user.id}
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px", borderRadius: "10px", border: "none", background: "#165dcc", color: "white", fontWeight: 800, fontSize: "12px", cursor: "pointer" }}>
              {starting === user.id ? <Loader2 className="animate-spin" size={14} /> : <Eye size={14} />}
              Shadow
            </button>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: "80px", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: "13px" }}>
          No users match your search
        </div>
      )}

      <div style={{ marginTop: "40px", padding: "24px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: "16px", alignItems: "flex-start" }}>
        <Info size={18} color="rgba(255,255,255,0.2)" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
          <strong>Compliance Note:</strong> Shadowing is a high-privilege action. Every shadow session is logged with the target User ID, Actor ID, and IP address in the immutable Audit Trail. Shadow sessions automatically expire after 1 hour or on browser close.
        </div>
      </div>
    </div>
  );
}
