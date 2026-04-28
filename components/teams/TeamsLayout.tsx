"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Users, Clock, FileWarning, Eye, ScrollText,
  LogOut, Menu, X, ChevronRight, MessageSquare, Megaphone, ReceiptIndianRupee
} from "lucide-react";

interface TeamsLayoutProps {
  member: { id: string; name: string; email: string; role: string };
  children: React.ReactNode;
  activeTab: string;
}

const tabs = [
  { id: "vetting", label: "Vetting Queue", icon: ShieldCheck, priority: "P1" },
  { id: "support", label: "Emergency & Support", icon: MessageSquare, priority: "P1" },
  { id: "user-problems", label: "User Problems", icon: MessageSquare, priority: "P1" },
  { id: "id-verifier", label: "ID Verifier", icon: Users, priority: "P1" },
  { id: "stalled", label: "Stalled Onboardings", icon: Clock, priority: "P2" },
  { id: "documents", label: "Document Expiry", icon: FileWarning, priority: "P2" },
  { id: "promotions", label: "Promotions", icon: Megaphone, priority: "P2" },
  { id: "refunds", label: "Refunds", icon: ReceiptIndianRupee, priority: "P2" },
  { id: "shadow", label: "Shadow Support", icon: Eye, priority: "P2" },
  { id: "audit", label: "Audit Trail", icon: ScrollText, priority: "Compliance" },
];

export default function TeamsLayout({ member, children, activeTab }: TeamsLayoutProps) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f0f4f8", fontFamily: "'Inter', sans-serif" }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarOpen ? "260px" : "64px", transition: "width 0.25s ease",
        background: "#0d1f3c", flexShrink: 0, display: "flex", flexDirection: "column",
        borderRight: "1px solid rgba(255,255,255,0.06)", position: "fixed", height: "100vh", zIndex: 50
      }}>
        {/* Nav */}

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => router.push(`/teams?tab=${tab.id}`)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: "12px",
                  padding: "10px 12px", borderRadius: "10px", border: "none", cursor: "pointer",
                  background: isActive ? "rgba(22, 93, 204, 0.25)" : "transparent",
                  color: isActive ? "#93c5fd" : "rgba(255,255,255,0.55)",
                  transition: "all 0.15s", marginBottom: "2px", textAlign: "left"
                }}
              >
                <Icon size={18} style={{ flexShrink: 0 }} />
                {sidebarOpen && (
                  <>
                    <span style={{ fontSize: "13px", fontWeight: isActive ? 800 : 600, flex: 1 }}>{tab.label}</span>
                    <span style={{ fontSize: "9px", padding: "2px 6px", borderRadius: "4px", background: tab.priority === "P1" ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)", color: tab.priority === "P1" ? "#fca5a5" : "rgba(255,255,255,0.3)", fontWeight: 800 }}>{tab.priority}</span>
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Footer */}
        {sidebarOpen && (
          <div style={{ padding: "16px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "white", marginBottom: "2px" }}>{member.name}</div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "12px" }}>{member.email}</div>
            <button style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "12px", cursor: "pointer" }}>
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, marginLeft: sidebarOpen ? "260px" : "64px", transition: "margin-left 0.25s ease", minHeight: "100vh" }}>
        {/* Top Bar */}
        <div style={{ background: "white", borderBottom: "1px solid #e2e8f0", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
            <span style={{ color: "#0e2b57" }}>{tabs.find(t => t.id === activeTab)?.label ?? "Dashboard"}</span>
          </div>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#165dcc" }}>
            Live team workspace
          </div>
        </div>

        <div style={{ padding: "32px" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
