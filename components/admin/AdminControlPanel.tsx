"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface FamilyApplicationRecord {
  id: string;
  full_name: string;
  email: string;
  property_name: string;
  village: string | null;
  state: string | null;
  about_family: string | null;
  status: string;
  review_notes?: string | null;
  reviewed_at?: string | null;
}

export interface FriendApplicationRecord {
  id: string;
  full_name: string;
  email: string;
  city: string;
  state: string | null;
  bio: string | null;
  status: string;
  review_notes?: string | null;
  reviewed_at?: string | null;
}

export interface FamilyProfileRecord {
  id: string;
  host_id: string | null;
  name: string;
  city: string | null;
  state: string | null;
  is_active: boolean | null;
  is_accepting: boolean | null;
}

export interface GuideProfileRecord {
  id: string;
  guide_id: string | null;
  name: string | null;
  city: string | null;
  state: string | null;
  is_active: boolean | null;
  is_online: boolean | null;
}

interface ApprovalCredentials {
  email: string;
  user_id: string;
  password: string | null;
  account_created: boolean;
  profile_type: "family" | "friend";
  profile_id: string | null;
  profile_code: string | null;
}

interface AdminControlPanelProps {
  familyApplications: FamilyApplicationRecord[];
  friendApplications: FriendApplicationRecord[];
  families: FamilyProfileRecord[];
  guides: GuideProfileRecord[];
}

interface ActionState {
  error?: string;
  success?: string;
  credentials?: ApprovalCredentials | null;
}

type ApplicationType = "family" | "friend";

function reviewLabel(type: ApplicationType): string {
  return type === "family" ? "Home" : "Hommie";
}

export function AdminControlPanel({
  familyApplications,
  friendApplications,
  families,
  guides
}: Readonly<AdminControlPanelProps>): React.JSX.Element {
  const router = useRouter();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [state, setState] = useState<ActionState | null>(null);
  const [notesByApplication, setNotesByApplication] = useState<Record<string, string>>({});

  function updateNote(applicationId: string, value: string): void {
    setNotesByApplication((current) => ({
      ...current,
      [applicationId]: value
    }));
  }

  async function updateApplicationStatus(
    applicationType: ApplicationType,
    applicationId: string,
    status: "approved" | "rejected"
  ): Promise<void> {
    const key = `${applicationType}-${status}-${applicationId}`;
    setLoadingKey(key);
    setState(null);

    try {
      const response = await fetch("/api/admin/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          applicationType,
          status,
          notes: notesByApplication[applicationId]?.trim() || undefined
        })
      });

      const payload = (await response.json()) as {
        error?: string;
        credentials?: ApprovalCredentials | null;
      };

      if (!response.ok) {
        setState({ error: payload.error ?? `${reviewLabel(applicationType)} review failed.` });
        return;
      }

      setState({
        success:
          status === "approved"
            ? `${reviewLabel(applicationType)} application approved.`
            : `${reviewLabel(applicationType)} application rejected.`,
        credentials: status === "approved" ? payload.credentials ?? null : null
      });

      router.refresh();
    } catch (error) {
      setState({
        error: error instanceof Error ? error.message : `${reviewLabel(applicationType)} review failed.`
      });
    } finally {
      setLoadingKey(null);
    }
  }

  async function toggleProfile(
    entityType: "family" | "friend",
    profileId: string,
    isActive: boolean
  ): Promise<void> {
    const key = `${entityType}-toggle-${profileId}`;
    setLoadingKey(key);
    setState(null);

    try {
      const response = await fetch("/api/admin/toggle-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, profileId, isActive })
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setState({ error: payload.error ?? "Profile toggle failed." });
        return;
      }

      setState({
        success: `${entityType === "family" ? "Home listing" : "Hommie profile"} ${
          isActive ? "activated" : "paused"
        }.`
      });

      router.refresh();
    } catch (error) {
      setState({ error: error instanceof Error ? error.message : "Profile toggle failed." });
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <div className="dashboard-editor">
      {state?.error ? <div className="auth-error">{state.error}</div> : null}
      {state?.success ? <div className="auth-success">{state.success}</div> : null}

      {state?.credentials ? (
        <div className="panel detail-box">
          <h2>Approval credentials</h2>
          <ul>
            <li>User ID: {state.credentials.user_id}</li>
            <li>Email: {state.credentials.email}</li>
            <li>Password: {state.credentials.password ?? "Existing login reused"}</li>
            <li>Profile code: {state.credentials.profile_code ?? "Pending"}</li>
          </ul>
        </div>
      ) : null}

      <div className="grid two-up dashboard-grid">
        <section className="panel detail-box">
          <h2>Home review queue</h2>
          <p>Use this only for incomplete, flagged, or manually reviewed Home submissions.</p>

          {familyApplications.length === 0 ? (
            <p>No queued Home applications right now.</p>
          ) : (
            <div className="dashboard-list">
              {familyApplications.map((application) => {
                const approveKey = `family-approved-${application.id}`;
                const rejectKey = `family-rejected-${application.id}`;

                return (
                  <div className="dashboard-list-row" key={application.id}>
                    <div>
                      <strong>{application.property_name}</strong>
                      <p>
                        {application.full_name} · {application.village ?? "Location pending"}
                        {application.state ? `, ${application.state}` : ""}
                      </p>
                      <p>{application.email}</p>
                      {application.about_family ? <p>{application.about_family}</p> : null}

                      <label style={{ display: "block", marginTop: 12 }}>
                        <span>Review note</span>
                        <textarea
                          className="text-area"
                          onChange={(event) => updateNote(application.id, event.target.value)}
                          placeholder="Why this needs manual approval or rejection"
                          value={notesByApplication[application.id] ?? ""}
                        />
                      </label>
                    </div>

                    <div className="dashboard-list-actions">
                      <span className="status">{application.status}</span>

                      <button
                        className="button-like secondary"
                        disabled={loadingKey === approveKey}
                        onClick={() => void updateApplicationStatus("family", application.id, "approved")}
                        type="button"
                      >
                        {loadingKey === approveKey ? "Approving..." : "Approve"}
                      </button>

                      <button
                        className="button-like secondary"
                        disabled={loadingKey === rejectKey}
                        onClick={() => void updateApplicationStatus("family", application.id, "rejected")}
                        type="button"
                      >
                        {loadingKey === rejectKey ? "Rejecting..." : "Reject"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel detail-box">
          <h2>Hommie review queue</h2>
          <p>Use this for Hommie applications that still need manual review or manual override.</p>

          {friendApplications.length === 0 ? (
            <p>No queued Hommie applications right now.</p>
          ) : (
            <div className="dashboard-list">
              {friendApplications.map((application) => {
                const approveKey = `friend-approved-${application.id}`;
                const rejectKey = `friend-rejected-${application.id}`;

                return (
                  <div className="dashboard-list-row" key={application.id}>
                    <div>
                      <strong>{application.full_name}</strong>
                      <p>
                        {application.city}
                        {application.state ? `, ${application.state}` : ""}
                      </p>
                      <p>{application.email}</p>
                      {application.bio ? <p>{application.bio}</p> : null}

                      <label style={{ display: "block", marginTop: 12 }}>
                        <span>Review note</span>
                        <textarea
                          className="text-area"
                          onChange={(event) => updateNote(application.id, event.target.value)}
                          placeholder="Why this needs manual approval or rejection"
                          value={notesByApplication[application.id] ?? ""}
                        />
                      </label>
                    </div>

                    <div className="dashboard-list-actions">
                      <span className="status">{application.status}</span>

                      <button
                        className="button-like secondary"
                        disabled={loadingKey === approveKey}
                        onClick={() => void updateApplicationStatus("friend", application.id, "approved")}
                        type="button"
                      >
                        {loadingKey === approveKey ? "Approving..." : "Approve"}
                      </button>

                      <button
                        className="button-like secondary"
                        disabled={loadingKey === rejectKey}
                        onClick={() => void updateApplicationStatus("friend", application.id, "rejected")}
                        type="button"
                      >
                        {loadingKey === rejectKey ? "Rejecting..." : "Reject"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel detail-box">
          <h2>Live Home listings</h2>

          {families.length === 0 ? (
            <p>No live Home listings found.</p>
          ) : (
            <div className="dashboard-list">
              {families.map((family) => (
                <div className="dashboard-list-row" key={family.id}>
                  <div>
                    <strong>{family.name}</strong>
                    <p>
                      {family.city ?? "City pending"}
                      {family.state ? `, ${family.state}` : ""}
                    </p>
                    <p>Host ID: {family.host_id ?? "Pending"}</p>
                    <p>Accepting bookings: {family.is_accepting ? "Yes" : "No"}</p>
                  </div>

                  <div className="dashboard-list-actions">
                    <span className="status">{family.is_active ? "active" : "paused"}</span>
                    <button
                      className="button-like secondary"
                      disabled={loadingKey === `family-toggle-${family.id}`}
                      onClick={() => void toggleProfile("family", family.id, !family.is_active)}
                      type="button"
                    >
                      {loadingKey === `family-toggle-${family.id}`
                        ? "Saving..."
                        : family.is_active
                          ? "Pause listing"
                          : "Activate listing"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel detail-box">
          <h2>Live Hommie profiles</h2>

          {guides.length === 0 ? (
            <p>No live Hommie profiles found yet.</p>
          ) : (
            <div className="dashboard-list">
              {guides.map((guide) => (
                <div className="dashboard-list-row" key={guide.id}>
                  <div>
                    <strong>{guide.name ?? "Famlo Hommie"}</strong>
                    <p>
                      {guide.city ?? "City pending"}
                      {guide.state ? `, ${guide.state}` : ""}
                    </p>
                    <p>Guide ID: {guide.guide_id ?? "Pending"}</p>
                    <p>Online: {guide.is_online ? "Yes" : "No"}</p>
                  </div>

                  <div className="dashboard-list-actions">
                    <span className="status">{guide.is_active ? "active" : "paused"}</span>
                    <button
                      className="button-like secondary"
                      disabled={loadingKey === `friend-toggle-${guide.id}`}
                      onClick={() => void toggleProfile("friend", guide.id, !guide.is_active)}
                      type="button"
                    >
                      {loadingKey === `friend-toggle-${guide.id}`
                        ? "Saving..."
                        : guide.is_active
                          ? "Pause profile"
                          : "Activate profile"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}