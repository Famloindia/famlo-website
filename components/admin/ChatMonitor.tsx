"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Flag, CheckCircle2, X, Plus, Trash2, MessageCircle } from "lucide-react";

interface ChatMessage {
  id: string;
  sender_name: string;
  sender_type: "guest" | "host" | "hommie";
  content: string;
  created_at: string;
  flagged?: boolean;
  trigger_keyword?: string;
}

interface Conversation {
  id: string;
  guest_name: string;
  host_name: string;
  type: "guest-host" | "guest-hommie";
  last_message: string;
  messages: ChatMessage[];
  is_flagged: boolean;
  flag_status: "pending" | "reviewed" | "dismissed" | null;
}

interface ChatMonitorProps {
  conversations: Conversation[];
  keywords: string[];
  adminId: string;
}

const MONITORING_BANNER = "To ensure safety and prevent off-platform transactions, chats are monitored by Famlo.";

const DEFAULT_KEYWORDS = [
  "pay me directly", "phone number", "whatsapp", "bank transfer", "cash", "upi direct"
];

export default function ChatMonitor({ conversations, keywords: initialKeywords, adminId }: ChatMonitorProps) {
  const [keywords, setKeywords] = useState<string[]>(initialKeywords.length ? initialKeywords : DEFAULT_KEYWORDS);
  const [newKeyword, setNewKeyword] = useState("");
  const [activeConv, setActiveConv] = useState<Conversation | null>(conversations[0] ?? null);
  const [viewFlagged, setViewFlagged] = useState(false);
  const [dismissing, setDismissing] = useState<Set<string>>(new Set());

  const flagged = conversations.filter((c) => c.is_flagged && c.flag_status === "pending");
  const displayed = viewFlagged ? flagged : conversations;

  const addKeyword = async () => {
    if (!newKeyword.trim() || keywords.includes(newKeyword.toLowerCase())) return;
    const updated = [...keywords, newKeyword.toLowerCase().trim()];
    setKeywords(updated);
    setNewKeyword("");
    await fetch("/api/admin/chat-keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", keyword: newKeyword.toLowerCase().trim(), adminId })
    });
  };

  const removeKeyword = async (kw: string) => {
    const updated = keywords.filter((k) => k !== kw);
    setKeywords(updated);
    await fetch("/api/admin/chat-keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", keyword: kw, adminId })
    });
  };

  const handleFlag = async (convId: string, action: "reviewed" | "dismissed") => {
    setDismissing((prev) => new Set(prev).add(convId));
    await fetch("/api/admin/chat-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: convId, action, adminId })
    });
    setDismissing((prev) => { const s = new Set(prev); s.delete(convId); return s; });
  };

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>Chat Monitor</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "6px" }}>
          Live view of all platform conversations. {flagged.length > 0 && <span style={{ color: "#ef4444", fontWeight: 800 }}>{flagged.length} flagged thread{flagged.length > 1 ? "s" : ""} pending review.</span>}
        </p>
      </div>

      {/* Keyword Manager */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
        <div style={{ fontSize: "12px", fontWeight: 900, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>🔍 Keyword Alert System</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
          {keywords.map((kw) => (
            <div key={kw} style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.2)", color: "#fca5a5", padding: "5px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: 700 }}>
              {kw}
              <button onClick={() => removeKeyword(kw)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 0, display: "flex" }}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <input value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addKeyword()}
            placeholder="Add trigger keyword..."
            style={{ flex: 1, padding: "8px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: "13px", outline: "none", fontFamily: "inherit" }} />
          <button onClick={addKeyword} style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "#165dcc", color: "white", fontWeight: 800, fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {/* Flagged filter */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button onClick={() => setViewFlagged(false)} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: !viewFlagged ? "rgba(22,93,204,0.2)" : "transparent", color: !viewFlagged ? "#93c5fd" : "rgba(255,255,255,0.4)", fontWeight: 800, fontSize: "12px", cursor: "pointer" }}>
          All Threads ({conversations.length})
        </button>
        <button onClick={() => setViewFlagged(true)} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid rgba(220,38,38,0.2)", background: viewFlagged ? "rgba(220,38,38,0.2)" : "transparent", color: viewFlagged ? "#fca5a5" : "rgba(255,255,255,0.4)", fontWeight: 800, fontSize: "12px", cursor: "pointer" }}>
          🚩 Flagged ({flagged.length})
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "16px", height: "500px" }}>
        {/* Thread List */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflowY: "auto" }}>
          {displayed.map((conv) => (
            <button key={conv.id} onClick={() => setActiveConv(conv)}
              style={{ width: "100%", padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: activeConv?.id === conv.id ? "rgba(22,93,204,0.15)" : conv.is_flagged ? "rgba(220,38,38,0.07)" : "transparent", border: "none", cursor: "pointer", textAlign: "left", transition: "background 0.1s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                {conv.is_flagged && conv.flag_status === "pending" && <Flag size={12} color="#ef4444" />}
                <span style={{ fontWeight: 800, fontSize: "13px", color: "white" }}>{conv.guest_name}</span>
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>↔</span>
                <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>{conv.host_name}</span>
              </div>
              <div style={{ fontSize: "11px", color: conv.is_flagged ? "#fca5a5" : "rgba(255,255,255,0.3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.last_message}</div>
            </button>
          ))}
          {displayed.length === 0 && (
            <div style={{ padding: "40px 16px", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: "13px" }}>No threads</div>
          )}
        </div>

        {/* Thread View */}
        {activeConv ? (
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", display: "flex", flexDirection: "column" }}>
            {/* Monitoring Banner — hardcoded, non-removable */}
            <div style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.2)", borderBottom: "none", padding: "10px 16px", display: "flex", gap: "8px", alignItems: "center", borderRadius: "12px 12px 0 0" }}>
              <AlertTriangle size={14} color="#fbbf24" />
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#fbbf24" }}>{MONITORING_BANNER}</span>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {(activeConv.messages ?? []).map((msg) => (
                <div key={msg.id} style={{ maxWidth: "75%", alignSelf: msg.sender_type === "guest" ? "flex-end" : "flex-start" }}>
                  <div style={{ background: msg.flagged ? "rgba(220,38,38,0.2)" : msg.sender_type === "guest" ? "rgba(22,93,204,0.3)" : "rgba(255,255,255,0.06)", border: msg.flagged ? "1px solid rgba(220,38,38,0.4)" : "none", borderRadius: "10px", padding: "10px 14px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 900, color: "rgba(255,255,255,0.4)", marginBottom: "4px", display: "flex", gap: "8px", alignItems: "center" }}>
                      {msg.sender_name}
                      {msg.flagged && <span style={{ color: "#ef4444" }}>🚩 &quot;{msg.trigger_keyword}&quot;</span>}
                    </div>
                    <div style={{ fontSize: "13px", color: msg.flagged ? "#fca5a5" : "white", lineHeight: 1.5 }}>{msg.content}</div>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)", marginTop: "4px" }}>{new Date(msg.created_at).toLocaleTimeString("en-IN")}</div>
                  </div>
                </div>
              ))}
              {(!activeConv.messages || activeConv.messages.length === 0) && (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.2)", fontSize: "13px" }}>No messages in this thread</div>
              )}
            </div>

            {/* Flag Actions */}
            {activeConv.is_flagged && activeConv.flag_status === "pending" && (
              <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(220,38,38,0.2)", display: "flex", gap: "8px" }}>
                <button onClick={() => handleFlag(activeConv.id, "reviewed")}
                  style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "none", background: "rgba(22,163,74,0.2)", color: "#86efac", fontWeight: 800, fontSize: "12px", cursor: "pointer" }}>
                  <CheckCircle2 size={14} /> Mark Reviewed
                </button>
                <button onClick={() => handleFlag(activeConv.id, "dismissed")}
                  style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "none", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", fontWeight: 800, fontSize: "12px", cursor: "pointer" }}>
                  Dismiss Flag
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.2)", fontSize: "13px" }}>
            <MessageCircle size={32} style={{ marginBottom: "12px" }} />
          </div>
        )}
      </div>
    </div>
  );
}
