"use client";

import { useState } from "react";

type Incident = { id: string; booking_id: string; response_due_at: string; overdue_at: string | null; warning_raised_at: string | null; response_status: string };

export default function HostSlaQueue({ initialIncidents }: { initialIncidents: Incident[] }) {
  const [incidents, setIncidents] = useState(initialIncidents);
  const [error, setError] = useState<string | null>(null);
  async function record(incident: Incident, outcome: "accepted" | "declined" | "unreachable") {
    setError(null);
    const response = await fetch("/api/teams/host-sla", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId: incident.booking_id, outcome }) });
    const payload = await response.json();
    if (!response.ok) { setError(payload.error ?? "Update failed."); return; }
    setIncidents((current) => current.filter((row) => row.id !== incident.id));
  }
  return <section style={{ display: "grid", gap: 12, marginBottom: 28 }}>
    <div><h2 style={{ margin: 0, fontSize: 20 }}>Host response SLA</h2><p style={{ color: "#64748b" }}>12-hour breaches require a call. They never auto-cancel a booking.</p></div>
    {error ? <div style={{ color: "#991b1b" }}>{error}</div> : null}
    {incidents.map((incident) => <article key={incident.id} style={{ background: "white", border: "1px solid #e2e8f0", padding: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <strong style={{ flex: 1 }}>Booking {incident.booking_id.slice(0, 8)} · {incident.overdue_at ? "Overdue" : incident.warning_raised_at ? "Warning" : "Pending"}</strong>
      <button onClick={() => void record(incident, "accepted")}>Accepted on call</button>
      <button onClick={() => void record(incident, "declined")}>Declined</button>
      <button onClick={() => void record(incident, "unreachable")}>Unreachable</button>
    </article>)}
  </section>;
}
