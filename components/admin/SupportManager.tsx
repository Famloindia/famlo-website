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
  PhoneCall,
  RefreshCw
} from "lucide-react";

interface TicketListItem {
  id: string;
  hostId: string;
  hostName: string;
  subject: string;
  status: "open" | "in_progress" | "resolved";
  priority: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  references: {
    requesterId: string | null;
    bookingId: string | null;
    propertyId: string | null;
  };
  lastSnippet: string;
}

type SupportFilter = "all" | "open" | "resolved" | "emergency" | "user-problems";

type EmergencyProfile = {
  userId: string;
  lastLat: number | null;
  lastLng: number | null;
  lastLocationLabel: string | null;
  updatedAt: string | null;
};

type TicketDetail = TicketListItem & {
  message: string;
  adminReply: string | null;
  emergencyProfile: EmergencyProfile | null;
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
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<SupportFilter>(initialFilter);

  useEffect(() => {
    void fetchTickets();
  }, [filter]);

  async function fetchTickets() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/support?filter=${encodeURIComponent(filter)}&limit=50`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = (await res.json()) as { tickets?: TicketListItem[]; error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? "Unable to load support tickets.");
      }
      setTickets(Array.isArray(payload.tickets) ? payload.tickets : []);
      setSelectedTicket((current) => {
        if (!current) return null;
        const stillExists = (payload.tickets ?? []).some((ticket) => ticket.id === current.id);
        return stillExists ? current : null;
      });
    } catch (fetchError) {
      setTickets([]);
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load support tickets.");
    }
    setLoading(false);
  }

  async function fetchTicketDetail(ticketId: string) {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/admin/support/${encodeURIComponent(ticketId)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = (await res.json()) as { ticket?: TicketDetail; error?: string };
      if (!res.ok || !payload.ticket) {
        throw new Error(payload.error ?? "Unable to load ticket details.");
      }
      setSelectedTicket(payload.ticket);
    } catch (fetchError) {
      setDetailError(fetchError instanceof Error ? fetchError.message : "Unable to load ticket details.");
    } finally {
      setDetailLoading(false);
    }
  }

  function isEmergencyTicket(ticket: Pick<TicketListItem, "subject">): boolean {
    return ticket.subject.startsWith("[EMERGENCY]");
  }

  function isUserProblemTicket(ticket: Pick<TicketListItem, "subject">): boolean {
    return ticket.subject.startsWith("[USER PROBLEM]");
  }

  function getRequesterLabel(ticket: Pick<TicketListItem, "subject">): string {
    return ticket.subject.startsWith("[SUPPORT]") || ticket.subject.startsWith("[EMERGENCY]") || ticket.subject.startsWith("[USER PROBLEM]") ? "Guest" : "Host";
  }

  const selectedEmergencyLocation = useMemo(() => {
    if (!selectedTicket) return null;
    const profile = selectedTicket.emergencyProfile;
    const fromProfile =
      profile?.lastLat != null && profile?.lastLng != null
        ? {
            lat: profile.lastLat,
            lng: profile.lastLng,
            label: profile.lastLocationLabel ?? "Emergency location",
          }
        : null;
    const fromMessage = extractCoordinates(selectedTicket.message);
    const coords = fromProfile ?? fromMessage;
    if (!coords) return null;
    return {
      lat: coords.lat,
      lng: coords.lng,
      label: fromProfile?.label ?? profile?.lastLocationLabel ?? null,
      mapsUrl: buildMapsSearchUrl(coords.lat, coords.lng, fromProfile?.label ?? profile?.lastLocationLabel ?? null),
      policeUrl: buildNearbySearchUrl("police", coords),
      hospitalUrl: buildNearbySearchUrl("hospital", coords),
      liveUntil: extractLiveUntil(selectedTicket.message),
      rawMapsUrl: extractMapsUrl(selectedTicket.message),
    };
  }, [selectedTicket]);

  useEffect(() => {
    if (filter !== "emergency" && filter !== "user-problems") {
      return;
    }
    const interval = window.setInterval(() => {
      void fetchTickets();
    }, 60000);
    return () => window.clearInterval(interval);
  }, [filter]);

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
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void fetchTickets()}
            disabled={loading}
            style={{ padding: "10px 14px", borderRadius: "12px", border: "1px solid #cbd5e1", background: "white", color: "#0f172a", fontWeight: 800, fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
            Refresh
          </button>
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
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selectedTicket ? "1fr 1fr" : "1fr", gap: "32px", transition: "all 0.3s ease" }}>
        
        {/* Left: Tickets List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {error ? (
            <div style={{ padding: "16px 18px", borderRadius: "16px", border: "1px solid #fecaca", background: "#fff7f7", color: "#991b1b", fontSize: "13px", fontWeight: 700 }}>
              {error}
            </div>
          ) : null}
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
                onClick={() => void fetchTicketDetail(t.id)}
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
                         <div style={{ fontSize: "14px", fontWeight: 900, color: "#0e2b57" }}>{t.hostName}</div>
                         <div style={{ fontSize: "11px", color: "#165dcc", fontWeight: 800 }}>{getRequesterLabel(t)} ID: {t.hostId}</div>
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
                  {t.lastSnippet}
                </p>
                {(t.references.bookingId || t.references.propertyId) ? (
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
                    {t.references.bookingId ? (
                      <span style={{ fontSize: "11px", color: "#475569", background: "#f8fafc", padding: "6px 8px", borderRadius: "999px" }}>
                        Booking: {t.references.bookingId}
                      </span>
                    ) : null}
                    {t.references.propertyId ? (
                      <span style={{ fontSize: "11px", color: "#475569", background: "#f8fafc", padding: "6px 8px", borderRadius: "999px" }}>
                        Property: {t.references.propertyId}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>

        {/* Right: Reply Panel */}
        {selectedTicket && (
          <div style={{ background: "white", borderRadius: "24px", border: "1px solid #e2e8f0", padding: "32px", position: "sticky", top: "40px", height: "fit-content", boxShadow: "0 20px 40px rgba(0,0,0,0.05)" }}>
             <button onClick={() => setSelectedTicket(null)} style={{ background: "none", border: "none", color: "#64748b", fontSize: "12px", fontWeight: 800, cursor: "pointer", marginBottom: "20px" }}>← Close Panel</button>
             {detailLoading ? (
               <div style={{ textAlign: "center", padding: "48px 0" }}><Loader2 className="animate-spin" size={32} color="#165dcc" /></div>
             ) : detailError ? (
               <div style={{ padding: "16px 18px", borderRadius: "16px", border: "1px solid #fecaca", background: "#fff7f7", color: "#991b1b", fontSize: "13px", fontWeight: 700 }}>
                 {detailError}
               </div>
             ) : (
             <>
             <div style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: "24px", marginBottom: "24px" }}>
                <div style={{ fontSize: "11px", fontWeight: 900, color: "#64748b", textTransform: "uppercase", marginBottom: "8px" }}>Original Message</div>
                <h2 style={{ fontSize: "20px", fontWeight: 900, color: "#0e2b57", margin: "0 0 12px" }}>{selectedTicket.subject}</h2>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 800, color: "#165dcc" }}>
                    {getRequesterLabel(selectedTicket)} ID: {selectedTicket.hostId}
                  </span>
                  {selectedTicket.references.bookingId ? (
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569" }}>Booking: {selectedTicket.references.bookingId}</span>
                  ) : null}
                  {selectedTicket.references.propertyId ? (
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#475569" }}>Property: {selectedTicket.references.propertyId}</span>
                  ) : null}
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
                {selectedTicket.adminReply ? (
                   <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", padding: "20px", borderRadius: "16px", color: "#0369a1", fontSize: "14px", fontWeight: 600 }}>
                      <div style={{ marginBottom: "8px", display: "flex", gap: "8px", alignItems: "center" }}><CheckCircle2 size={16} /> RESOLVED</div>
                      {selectedTicket.adminReply}
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
             </>
             )}
          </div>
        )}
      </div>
    </div>
  );
}
