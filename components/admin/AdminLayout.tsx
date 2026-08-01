"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, Percent, MessageSquare, Scale,
  Mail, ShieldAlert, Clock, FileText, Download,
  Banknote, UserX, Trash2, LogOut, Menu, X, ChevronRight, Zap, TicketPercent, Megaphone, Landmark, IdCard, ReceiptIndianRupee
} from "lucide-react";

interface AdminLayoutProps {
  admin: { id: string; name: string; email: string };
  children: React.ReactNode;
  activeTab: string;
  killSwitchActive: boolean | null;
}

const tabs = [
  { id: "entities", label: "All Entities", icon: Users, group: "Operations" },
  { id: "famlo-plus", label: "Famlo Pro Access", icon: Zap, group: "Famlo Pro" },
  { id: "test-properties", label: "Test Properties", icon: LayoutDashboard, group: "Operations" },
  { id: "pro-channel-summary", label: "Channels & Sync", icon: ShieldAlert, group: "Famlo Pro" },
  { id: "vetting", label: "Vetting Queue", icon: LayoutDashboard, group: "Operations" },
  { id: "operational-notifications", label: "Booking & Link Reviews", icon: ShieldAlert, group: "Operations", href: "/admin/operations/notifications" },
  { id: "coupons", label: "Coupons", icon: TicketPercent, group: "Finance" },
  { id: "commission", label: "Commission Control", icon: Percent, group: "Finance Operations" },
  { id: "finance", label: "Finance Operations", icon: Landmark, group: "Finance Operations", href: "/admin/finance" },
  { id: "refunds", label: "Refunds", icon: ReceiptIndianRupee, group: "Finance Operations", href: "/admin/finance/refunds" },
  { id: "payouts", label: "Payout Overrides", icon: Banknote, group: "Finance Operations" },
  { id: "channel-manager", label: "Channel Manager", icon: CalendarDaysIconShim, group: "Famlo Pro", hidden: true },
  { id: "ops-dashboard", label: "Ops Dashboard", icon: Zap, group: "Analytics" },
  { id: "growth", label: "Growth Dashboard", icon: LayoutDashboard, group: "Analytics" },
  { id: "ads", label: "Ads Control", icon: Megaphone, group: "Operations" },
  { id: "compliance-packs", label: "Compliance Packs", icon: FileText, group: "Compliance & Audit" },
  { id: "disputes", label: "Dispute Center", icon: Scale, group: "Finance Operations" },
  { id: "chat", label: "Chat Monitor", icon: MessageSquare, group: "Trust & Safety" },
  { id: "fraud", label: "Fraud Flags", icon: ShieldAlert, group: "Trust & Safety" },
  { id: "id-verifier", label: "ID Verifier", icon: IdCard, group: "Trust & Safety" },
  { id: "suspend", label: "Suspend Accounts", icon: UserX, group: "Trust & Safety" },
  { id: "heatmap", label: "Revenue Heatmap", icon: Clock, group: "Analytics" },
  { id: "response", label: "Response Times", icon: Clock, group: "Analytics" },
  { id: "grievances", label: "Grievances", icon: FileText, group: "Compliance & Audit" },
  { id: "gst", label: "GST Export", icon: Download, group: "Compliance & Audit" },
  { id: "erasure", label: "Data Erasure", icon: Trash2, group: "Compliance & Audit" },
  { id: "mailbox", label: "Bulk Mailbox", icon: Mail, group: "Support Center" },
  { id: "support", label: "Emergency & Support", icon: MessageSquare, group: "Support Center" },
  { id: "user-problems", label: "User Problems", icon: ShieldAlert, group: "Support Center" },
  { id: "testimonials", label: "Testimonials", icon: MessageSquare, group: "Support Center" },
  { id: "audit", label: "Audit Trail", icon: FileText, group: "Compliance & Audit" },
  { id: "shadow", label: "Shadow Mode", icon: ShieldAlert, group: "Trust & Safety", hidden: true },
  { id: "teams-mgmt", label: "Manage Teams", icon: Users, group: "Admin" },
];

const groups = ["Operations", "Famlo Pro", "Finance", "Finance Operations", "Trust & Safety", "Analytics", "Support Center", "Compliance & Audit", "Admin"];

function CalendarDaysIconShim(props: { size?: number }) {
  return <Clock {...props} />;
}

export default function AdminLayout({ admin, children, activeTab, killSwitchActive }: AdminLayoutProps) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a0f1e", fontFamily: "'Inter', sans-serif" }}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? "60px" : "240px", transition: "width 0.2s ease",
        background: "#0d1425", borderRight: "1px solid rgba(255,255,255,0.06)",
        display: "flex", flexDirection: "column", position: "fixed", height: "100vh", zIndex: 50, overflowY: "auto"
      }}>
        {/* Nav Groups */}

        {/* Kill Switch Status */}
        {!collapsed && (
          <div
            style={{
              margin: "12px",
              padding: "10px 14px",
              borderRadius: "10px",
              background:
                killSwitchActive == null
                  ? "rgba(148,163,184,0.08)"
                  : killSwitchActive
                    ? "rgba(220,38,38,0.15)"
                    : "rgba(34,197,94,0.08)",
              border: `1px solid ${
                killSwitchActive == null ? "#94a3b8" : killSwitchActive ? "#dc2626" : "#22c55e"
              }30`,
            }}
          >
            <div
              style={{
                fontSize: "10px",
                fontWeight: 900,
                color: killSwitchActive == null ? "#cbd5e1" : killSwitchActive ? "#ef4444" : "#22c55e",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {killSwitchActive == null ? "Status on demand" : killSwitchActive ? "⚠️ Platform PAUSED" : "✓ Platform LIVE"}
            </div>
          </div>
        )}

        {/* Nav Groups */}
        <nav style={{ flex: 1, padding: "8px" }}>
          {groups.map((group) => {
            const groupTabs = tabs.filter((t) => t.group === group && !("hidden" in t && t.hidden));
            if (groupTabs.length === 0) return null;
            return (
              <div key={group} style={{ marginBottom: "16px" }}>
                {!collapsed && (
                  <div style={{ padding: "4px 8px 6px", fontSize: "9px", fontWeight: 900, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{group}</div>
                )}
                {groupTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button key={tab.id} onClick={() => router.push("href" in tab && tab.href ? tab.href : `/admin?tab=${tab.id}`)}
                      title={collapsed ? tab.label : undefined}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: "10px",
                        padding: collapsed ? "10px" : "9px 10px", borderRadius: "8px", border: "none",
                        cursor: "pointer", background: isActive ? "rgba(220,38,38,0.15)" : "transparent",
                        color: isActive ? "#fca5a5" : "rgba(255,255,255,0.4)",
                        transition: "all 0.12s", marginBottom: "1px", textAlign: "left",
                        justifyContent: collapsed ? "center" : "flex-start"
                      }}>
                      <Icon size={15} style={{ flexShrink: 0 }} />
                      {!collapsed && <span style={{ fontSize: "12px", fontWeight: isActive ? 800 : 600 }}>{tab.label}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div style={{ padding: "12px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: "11px", fontWeight: 800, color: "rgba(255,255,255,0.6)", marginBottom: "2px" }}>{admin.name}</div>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", marginBottom: "10px" }}>{admin.email}</div>
            <button style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: "rgba(255,255,255,0.25)", fontSize: "11px", cursor: "pointer" }}>
              <LogOut size={12} /> Sign Out
            </button>
          </div>
        )}
      </aside>

      {/* Main */}
      <main style={{ flex: 1, marginLeft: collapsed ? "60px" : "240px", transition: "margin-left 0.2s ease", display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <div style={{ background: "#0d1425", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>
            <span style={{ color: "rgba(255,255,255,0.7)" }}>{tabs.find((t) => t.id === activeTab)?.label ?? "Dashboard"}</span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "10px", fontWeight: 800, color: "rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.04)", padding: "5px 10px", borderRadius: "6px", textTransform: "uppercase" }}>FULL ACCESS</span>
          </div>
        </div>

        <div style={{ flex: 1, padding: "28px", overflowY: "auto" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
