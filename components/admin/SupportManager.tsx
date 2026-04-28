"use client";

import { useEffect, useMemo, useState } from "react";
import { 
  CheckCircle2, 
  Send, 
  User, 
  AlertCircle,
  Loader2,
  ShieldAlert,
  MapPinned,
  Map,
  PhoneCall
} from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface Ticket {
  id: string;
  host_id: string;
  host_name: string;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved";
  admin_reply: string | null;
  created_at: string;
}

type SupportFilter = "all" | "open" | "resolved" | "emergency" | "user-problems";

type EmergencyProfile = {
  user_id: string;
  last_lat: number | null;
  last_lng: number | null;
  last_location_label: string | null;
  updated_at: string | null;
};

function extractCoordinates(text: string): { lat: number; lng: number } | null {
  const latMatch = text.match(/Latitude:\s*(-?\d+(?:\.\d+)?)/i);
  const lngMatch = text.match(/Longitude:\s*(-?\d+(?:\.\d+)?)/i);
  if (!latMatch || !lngMatch) return null;
  const lat = Number(latMatch[1]);
  const lng = Number(lngMatch[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function extractLiveUntil(text: string): string | null {
  const match = text.match(/Live location active until:\s*(.+)/i);
  return match ? match[1]?.trim() ?? null : null;
}

function extractMapsUrl(text: string): string | null {
  const match = text.match(/https?:\/\/(?:www\.)?google\.com\/maps\/[^\s]+/i);
  return match ? match[0] : null;
}

function buildMapsSearchUrl(lat: number, lng: number, label?: string | null): string {
  const query = typeof label === "string" && label.trim().length > 0 ? label.trim() : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function buildNearbySearchUrl(type: "police" | "hospital", coords: { lat: number; lng: number }): string {
  const query = type === "police" ? "police station" : "hospital";
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${coords.lat},${coords.lng},17z`;
}

export default function SupportManager({ actorId, initialFilter = "open" }: { actorId: string; initialFilter?: SupportFilter }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [profiles, setProfiles] = useState<Record<string, EmergencyProfile>>({});
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<SupportFilter>(initialFilter);

  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  useEffect(() => {
    void fetchTickets();
  }, [filter]);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  const fetchTickets = async () => {
    setLoading(true);
    let query = supabase
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false });

    if (filter === "open") {
      query = query.in("status", ["open", "in_progress"]);
    } else if (filter === "emergency") {
      query = query.ilike("subject", "[EMERGENCY]%");
    } else if (filter === "user-problems") {
      query = query.ilike("subject", "[USER PROBLEM]%");
    } else if (filter === "resolved") {
      query = query.eq("status", "resolved");
    }

    const { data, error } = await query;
    if (!error && data) {
      setTickets(data);
      const requesterIds = [...new Set(data.map((ticket) => ticket.host_id).filter(Boolean))];
      if (requesterIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("user_profiles_v2")
          .select("user_id,last_lat,last_lng,last_location_label,updated_at")
          .in("user_id", requesterIds);
        const nextProfiles: Record<string, EmergencyProfile> = {};
        for (const row of profileRows ?? []) {
          nextProfiles[row.user_id] = {
            user_id: row.user_id,
            last_lat: typeof row.last_lat === "number" ? row.last_lat : null,
            last_lng: typeof row.last_lng === "number" ? row.last_lng : null,
            last_location_label: typeof row.last_location_label === "string" ? row.last_location_label : null,
            updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
          };
        }
        setProfiles(nextProfiles);
      } else {
        setProfiles({});
      }
    }
    setLoading(false);
  };

  function isEmergencyTicket(ticket: Ticket): boolean {
    return ticket.subject.startsWith("[EMERGENCY]");
  }

  function isUserProblemTicket(ticket: Ticket): boolean {
    return ticket.subject.startsWith("[USER PROBLEM]");
  }

  function getRequesterLabel(ticket: Ticket): string {
    return ticket.subject.startsWith("[SUPPORT]") || ticket.subject.startsWith("[EMERGENCY]") || ticket.subject.startsWith("[USER PROBLEM]") ? "Guest" : "Host";
  }

  const selectedEmergencyLocation = useMemo(() => {
    if (!selectedTicket) return null;
    const profile = profiles[selectedTicket.host_id];
    const fromProfile =
      profile?.last_lat != null && profile?.last_lng != null
        ? {
            lat: profile.last_lat,
            lng: profile.last_lng,
            label: profile.last_location_label ?? "Emergency location",
          }
        : null;
    const fromMessage = extractCoordinates(selectedTicket.message);
    const coords = fromProfile ?? fromMessage;
    if (!coords) return null;
    return {
      lat: coords.lat,
      lng: coords.lng,
      label: fromProfile?.label ?? profile?.last_location_label ?? null,
      mapsUrl: buildMapsSearchUrl(coords.lat, coords.lng, fromProfile?.label ?? profile?.last_location_label ?? null),
      policeUrl: buildNearbySearchUrl("police", coords),
      hospitalUrl: buildNearbySearchUrl("hospital", coords),
      liveUntil: extractLiveUntil(selectedTicket.message),
      rawMapsUrl: extractMapsUrl(selectedTicket.message),
    };
  }, [profiles, selectedTicket]);

  useEffect(() => {
    if (
      filter !== "emergency" &&
      filter !== "user-problems" &&
      !selectedTicket?.subject.startsWith("[EMERGENCY]") &&
      !selectedTicket?.subject.startsWith("[USER PROBLEM]")
    ) {
      return;
    }
    const interval = window.setInterval(() => {
      void fetchTickets();
    }, 12000);
    return () => window.clearInterval(interval);
  }, [filter, selectedTicket?.subject]);

  const handleReply = async () => {
    if (!selectedTicket || !replyText) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/support/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          reply: replyText,
          status: "resolved"
        })
      });

      if (res.ok) {
        setReplyText("");
        setSelectedTicket(null);
        void fetchTickets();
      }
    } catch (err) {
      console.error("Reply failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkComplete = async () => {
    if (!selectedTicket) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/support/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          reply: "Marked complete by Famlo support.",
          status: "resolved"
        })
      });

      if (res.ok) {
        setReplyText("");
        setSelectedTicket(null);
        void fetchTickets();
      }
    } catch (err) {
      console.error("Mark complete failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: "40px", minHeight: "100vh", background: "#f8fafc", fontFamily: "Inter, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div>
            <h1 style={{ fontSize: "28px", fontWeight: 900, color: "#0e2b57", margin: 0 }}>Emergency, Support & User Problems Queue</h1>
          <p style={{ color: "#64748b", fontSize: "14px", marginTop: "8px" }}>Open this screen to review emergency alerts, live guest locations, user problems, and standard support tickets.</p>
        </div>
        <div style={{ display: "flex", gap: "12px", background: "white", padding: "6px", borderRadius: "14px", border: "1px solid #e2e8f0", flexWrap: "wrap" }}>
           {["open", "user-problems", "emergency", "resolved", "all"].map((f: any) => (
             <button 
               key={f} 
               onClick={() => setFilter(f)}
               style={{ 
                 padding: "8px 16px", 
                 borderRadius: "10px", 
                 border: "none", 
                 background: filter === f ? "#165dcc" : "transparent",
                 color: filter === f ? "white" : "#64748b",
                 fontSize: "12px", 
                 fontWeight: 900,
                 cursor: "pointer",
                 textTransform: "uppercase",
                 transition: "all 0.2s"
               }}
               >
               {f === "user-problems" ? "user problems" : f}
             </button>
           ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selectedTicket ? "1fr 1fr" : "1fr", gap: "32px", transition: "all 0.3s ease" }}>
        
        {/* Left: Tickets List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "60px" }}><Loader2 className="animate-spin" size={40} color="#165dcc" /></div>
          ) : tickets.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px", background: "white", borderRadius: "24px", border: "1px dashed #e2e8f0" }}>
               <CheckCircle2 size={48} color="#10b981" style={{ marginBottom: "16px" }} />
               <h3 style={{ fontSize: "18px", fontWeight: 900, color: "#0e2b57" }}>No Pending Tickets</h3>
               <p style={{ color: "#64748b", fontSize: "14px" }}>The partners are happy! Everything is resolved.</p>
            </div>
          ) : (
            tickets.map((t) => (
              <div 
                key={t.id} 
                onClick={() => setSelectedTicket(t)}
                style={{ 
                  background: "white", 
                  borderRadius: "20px", 
                  padding: "24px", 
                  border: `2px solid ${selectedTicket?.id === t.id ? "#165dcc" : "transparent"}`, 
                  boxShadow: "0 4px 20px rgba(0,0,0,0.03)",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "16px" }}>
                   <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                     <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                         {isEmergencyTicket(t) ? <ShieldAlert size={20} color="#dc2626" /> : <User size={20} />}
                      </div>
                      <div>
                         <div style={{ fontSize: "14px", fontWeight: 900, color: "#0e2b57" }}>{t.host_name}</div>
                         <div style={{ fontSize: "11px", color: "#165dcc", fontWeight: 800 }}>{getRequesterLabel(t)} ID: {t.host_id}</div>
                      </div>
                   </div>
                   <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {isEmergencyTicket(t) ? (
                      <div style={{ fontSize: "10px", fontWeight: 900, padding: "4px 8px", background: "#fef2f2", color: "#dc2626", borderRadius: "6px", textTransform: "uppercase" }}>
                        emergency
                      </div>
                    ) : isUserProblemTicket(t) ? (
                      <div style={{ fontSize: "10px", fontWeight: 900, padding: "4px 8px", background: "#fff7ed", color: "#ea580c", borderRadius: "6px", textTransform: "uppercase" }}>
                        user problem
                      </div>
                    ) : null}
                     <div style={{ fontSize: "10px", fontWeight: 900, padding: "4px 8px", background: t.status === 'resolved' ? '#f0fdf4' : '#fff7ed', color: t.status === 'resolved' ? '#16a34a' : '#f59e0b', borderRadius: "6px", textTransform: "uppercase" }}>
                        {t.status}
                     </div>
                   </div>
                </div>
                <h4 style={{ fontSize: "16px", fontWeight: 900, color: "#1e293b", margin: "0 0 8px" }}>{t.subject}</h4>
                <p style={{ fontSize: "13px", color: "#64748b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.5 }}>
                  {t.message}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Right: Reply Panel */}
        {selectedTicket && (
          <div style={{ background: "white", borderRadius: "24px", border: "1px solid #e2e8f0", padding: "32px", position: "sticky", top: "40px", height: "fit-content", boxShadow: "0 20px 40px rgba(0,0,0,0.05)" }}>
             <button onClick={() => setSelectedTicket(null)} style={{ background: "none", border: "none", color: "#64748b", fontSize: "12px", fontWeight: 800, cursor: "pointer", marginBottom: "20px" }}>← Close Panel</button>
             
             <div style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: "24px", marginBottom: "24px" }}>
                <div style={{ fontSize: "11px", fontWeight: 900, color: "#64748b", textTransform: "uppercase", marginBottom: "8px" }}>Original Message</div>
                <h2 style={{ fontSize: "20px", fontWeight: 900, color: "#0e2b57", margin: "0 0 12px" }}>{selectedTicket.subject}</h2>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 800, color: "#165dcc" }}>
                    {getRequesterLabel(selectedTicket)} ID: {selectedTicket.host_id}
                  </span>
                  {isEmergencyTicket(selectedTicket) ? (
                    <span style={{ fontSize: "11px", fontWeight: 900, color: "#dc2626", textTransform: "uppercase" }}>
                      Priority: Emergency escalation
                    </span>
                  ) : isUserProblemTicket(selectedTicket) ? (
                    <span style={{ fontSize: "11px", fontWeight: 900, color: "#ea580c", textTransform: "uppercase" }}>
                      Priority: User problem
                    </span>
                  ) : null}
                </div>
                <div style={{ background: "#f8fafc", padding: "20px", borderRadius: "16px", fontSize: "14px", lineHeight: 1.6, color: "#334155", whiteSpace: "pre-wrap" }}>
                   {selectedTicket.message}
                </div>
             </div>

             <div>
                <div style={{ fontSize: "11px", fontWeight: 900, color: "#165dcc", textTransform: "uppercase", marginBottom: "12px" }}>Your Resolution</div>
                {isEmergencyTicket(selectedTicket) ? (
                  <div style={{ marginBottom: 16, padding: 16, borderRadius: 18, background: "#fff7f7", border: "1px solid #fecaca", display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <ShieldAlert size={18} color="#dc2626" />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "#991b1b" }}>Live emergency location</div>
                        <div style={{ fontSize: 12, color: "#7f1d1d" }}>
                          {selectedEmergencyLocation?.liveUntil ? `Active until ${selectedEmergencyLocation.liveUntil}` : "Monitoring live location from the guest app."}
                        </div>
                      </div>
                    </div>
                    {selectedEmergencyLocation ? (
                      <>
                        <a
                          href={selectedEmergencyLocation.mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#b91c1c", fontWeight: 900, textDecoration: "none" }}
                        >
                          <MapPinned size={16} />
                          Open live map
                        </a>
                        <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid #fecaca", minHeight: 240 }}>
                          <iframe
                            title="Emergency live map"
                            src={`https://www.google.com/maps?q=${selectedEmergencyLocation.lat},${selectedEmergencyLocation.lng}&z=15&output=embed`}
                            style={{ width: "100%", height: 240, border: 0 }}
                            loading="lazy"
                          />
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                          <a href={selectedEmergencyLocation.policeUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none", padding: "10px 12px", borderRadius: 999, background: "white", border: "1px solid #fca5a5", color: "#b91c1c", fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <PhoneCall size={16} /> Police station
                          </a>
                          <a href={selectedEmergencyLocation.hospitalUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none", padding: "10px 12px", borderRadius: 999, background: "white", border: "1px solid #fca5a5", color: "#b91c1c", fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <Map size={16} /> Hospital
                          </a>
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 13, color: "#7f1d1d" }}>
                        No live coordinates yet. The guest app should keep updating the profile location while emergency mode is active.
                      </div>
                    )}
                  </div>
                ) : null}
                {selectedTicket.admin_reply ? (
                   <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", padding: "20px", borderRadius: "16px", color: "#0369a1", fontSize: "14px", fontWeight: 600 }}>
                      <div style={{ marginBottom: "8px", display: "flex", gap: "8px", alignItems: "center" }}><CheckCircle2 size={16} /> RESOLVED</div>
                      {selectedTicket.admin_reply}
                   </div>
                ) : (
                  <>
                    <textarea 
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type your official response to the host here..."
                      style={{ width: "100%", offset: "none", boxSizing: "border-box", minHeight: "150px", padding: "16px", borderRadius: "16px", border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: "14px", fontFamily: "inherit", outline: "none", marginBottom: "20px" }}
                    />
                    <button 
                      onClick={handleReply}
                      disabled={submitting || !replyText}
                      style={{ width: "100%", padding: "16px", borderRadius: "16px", border: "none", background: "#165cc2", color: "white", fontWeight: 900, fontSize: "15px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}
                    >
                      {submitting ? <Loader2 className="animate-spin" size={20} /> : <><Send size={20} /> Send Resolution</>}
                    </button>
                    {isUserProblemTicket(selectedTicket) ? (
                      <button
                        type="button"
                        onClick={() => void handleMarkComplete()}
                        disabled={submitting}
                        style={{ width: "100%", marginTop: 12, padding: "14px", borderRadius: "16px", border: "1px solid #fed7aa", background: "#fff7ed", color: "#c2410c", fontWeight: 900, fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}
                      >
                        {submitting ? <Loader2 className="animate-spin" size={18} /> : <><CheckCircle2 size={18} /> Mark completion</>}
                      </button>
                    ) : null}
                  </>
                )}
             </div>

             <div style={{ marginTop: "32px", display: "flex", gap: "12px", alignItems: "center", padding: "16px", background: "#fff7ed", borderRadius: "12px", border: "1px solid #ffedd5" }}>
                <AlertCircle size={18} color="#c2410c" />
                <div style={{ fontSize: "12px", color: "#9a3412", fontWeight: 600 }}>This response will be visible in the requester&apos;s Famlo account immediately.</div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
