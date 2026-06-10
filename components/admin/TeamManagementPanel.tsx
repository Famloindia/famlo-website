"use client";

import { useState } from "react";

type TeamMemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  created_at: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function TeamManagementPanel({ teamMembers }: { teamMembers: TeamMemberRow[] }) {
  const [members, setMembers] = useState(teamMembers);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  async function createTeamMember(): Promise<void> {
    if (saving) return;

    const cleanName = name.trim();
    const cleanEmail = email.trim();

    setSaving(true);
    setMessage(null);
    setError(null);
    setCredentials(null);

    try {
      const response = await fetch("/api/admin/team-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName, email: cleanEmail, password: password || undefined }),
      });
      const payload = (await response.json()) as {
        error?: string;
        teamMember?: { id: string; name: string; email: string };
        credentials?: { email: string; password: string };
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create team member.");
      }

      setMessage("Team member saved successfully.");
      setCredentials(payload.credentials ?? null);
      setName("");
      setEmail("");
      setPassword("");
      setMembers((current) => {
        const nextRow = {
          id: payload.teamMember?.id ?? crypto.randomUUID(),
          name: payload.teamMember?.name ?? cleanName,
          email: payload.teamMember?.email ?? cleanEmail,
          role: "team",
          created_at: new Date().toISOString(),
        };

        const existingIndex = current.findIndex((member) => member.email?.toLowerCase() === cleanEmail.toLowerCase());
        if (existingIndex >= 0) {
          const updated = [...current];
          updated[existingIndex] = { ...updated[existingIndex], ...nextRow };
          return updated;
        }

        return [nextRow, ...current];
      });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create team member.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "18px", padding: "22px" }}>
        <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 900, color: "white" }}>Team Access Management</div>
            <div style={{ marginTop: "6px", color: "rgba(255,255,255,0.45)", fontSize: "13px", lineHeight: 1.6 }}>
              Create a personal team login for each member. The admin password stays separate from team credentials.
            </div>
          </div>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#93c5fd", background: "rgba(147,197,253,0.12)", border: "1px solid rgba(147,197,253,0.22)", padding: "8px 12px", borderRadius: "999px" }}>
            {members.length} team member{members.length === 1 ? "" : "s"}
          </div>
        </div>

        <div style={{ display: "grid", gap: "12px", marginTop: "18px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Team member name"
              style={{ borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(2,6,23,0.6)", color: "white", padding: "10px 12px" }}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>Email / ID</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="team.member@famlo.in"
              type="email"
              style={{ borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(2,6,23,0.6)", color: "white", padding: "10px 12px" }}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Leave blank to auto-generate"
              type="password"
              style={{ borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(2,6,23,0.6)", color: "white", padding: "10px 12px" }}
            />
          </label>
        </div>

        <button
          onClick={() => void createTeamMember()}
          disabled={saving || !name.trim() || !email.trim()}
          style={{
            marginTop: "14px",
            borderRadius: "10px",
            border: "none",
            background: saving ? "rgba(255,255,255,0.12)" : "#165dcc",
            color: "white",
            fontWeight: 800,
            padding: "11px 14px",
            cursor: saving || !name.trim() || !email.trim() ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving..." : "Create Team Member"}
        </button>

        <div style={{ marginTop: "10px", fontSize: "12px", color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
          Leave password blank to auto-generate a temporary one. The response will include the login details so you can share them securely.
        </div>

        {message ? <div style={{ marginTop: "12px", fontSize: "12px", color: "#86efac" }}>{message}</div> : null}
        {credentials ? (
          <div style={{ marginTop: "12px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "12px", padding: "12px 14px", color: "#bbf7d0", fontSize: "12px", lineHeight: 1.7 }}>
            <div><strong>Email:</strong> {credentials.email}</div>
            <div><strong>Password:</strong> {credentials.password}</div>
          </div>
        ) : null}
        {error ? <div style={{ marginTop: "12px", fontSize: "12px", color: "#fca5a5" }}>{error}</div> : null}
      </div>

      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "18px", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: "14px", fontWeight: 900, color: "white" }}>Existing Team Members</div>
          <div style={{ marginTop: "6px", fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>
            These users can log in to <code>/teams</code> with their own email and password.
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "760px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Name", "Email", "Role", "Created"].map((label) => (
                  <th key={label} style={{ padding: "12px 18px", fontSize: "11px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "14px 18px", color: "white", fontSize: "13px", fontWeight: 700 }}>
                    {member.name ?? "Unnamed member"}
                  </td>
                  <td style={{ padding: "14px 18px", color: "#cbd5e1", fontSize: "13px" }}>
                    {member.email ?? "—"}
                  </td>
                  <td style={{ padding: "14px 18px" }}>
                    <span style={{ background: "rgba(22,93,204,0.14)", color: "#93c5fd", padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 900, textTransform: "uppercase" }}>
                      {member.role ?? "team"}
                    </span>
                  </td>
                  <td style={{ padding: "14px 18px", color: "#cbd5e1", fontSize: "13px" }}>
                    {formatDate(member.created_at)}
                  </td>
                </tr>
              ))}
              {members.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: "20px 18px", color: "rgba(255,255,255,0.45)", fontSize: "13px" }}>
                    No team members have been created yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
