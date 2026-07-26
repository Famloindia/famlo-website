"use client";

import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useMemo, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase";

export function PasswordManagementCard({
  initialHasPassword,
}: Readonly<{
  initialHasPassword: boolean;
}>): React.JSX.Element {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [hasPassword, setHasPassword] = useState(initialHasPassword);
  const [formOpen, setFormOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "New passwords do not match." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/auth/password/change", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ currentPassword, password: newPassword, confirmPassword }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Password could not be changed.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setHasPassword(true);
      setMessage({ type: "success", text: "Password updated securely." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Password could not be changed." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel password-card">
      <div className="security-summary">
        <div className="security-icon"><KeyRound size={20} /></div>
        <div>
          <h2>Security</h2>
          <p>
            {hasPassword
              ? "Update your password whenever you need to secure your account."
              : "Add a password to use email login alongside Google or phone."}
          </p>
        </div>
        <button
          type="button"
          className="password-action"
          aria-expanded={formOpen}
          onClick={() => {
            setFormOpen((value) => !value);
            setMessage(null);
          }}
        >
          {hasPassword ? "Change password" : "Set password"}
        </button>
      </div>

      {formOpen ? (
        <form onSubmit={(event) => void submit(event)}>
          {hasPassword ? (
            <label>
              <span>Current password</span>
              <input type={showPasswords ? "text" : "password"} autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
            </label>
          ) : null}
          <label><span>{hasPassword ? "New password" : "Create password"}</span><input type={showPasswords ? "text" : "password"} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
          <label><span>Confirm password</span><input type={showPasswords ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
          <button type="button" onClick={() => setShowPasswords((value) => !value)} className="password-visibility">
            {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
            {showPasswords ? "Hide passwords" : "Show passwords"}
          </button>
          {message ? <p role="status" className={message.type}>{message.text}</p> : null}
          <button type="submit" className="button-like submit-password" disabled={saving}>
            {saving ? "Saving..." : hasPassword ? "Change password" : "Set password"}
          </button>
        </form>
      ) : null}
      <style jsx>{`
        .password-card {
          padding: 24px;
          display: grid;
          gap: 20px;
          border: 1px solid #e5eaf2;
          border-radius: 18px;
          background: #fff;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
        }
        h2, p { margin: 0; }
        .security-summary {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          gap: 14px;
          align-items: center;
        }
        .security-icon {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          color: #1d4ed8;
          background: #eff6ff;
        }
        .security-summary p { margin-top: 5px; color: #64748b; font-size: 13px; line-height: 1.5; }
        .password-action {
          min-height: 42px;
          padding: 0 16px;
          border: 1px solid #bfdbfe;
          border-radius: 12px;
          color: #1d4ed8;
          background: #fff;
          font-weight: 800;
          cursor: pointer;
        }
        .password-action:hover { background: #eff6ff; }
        form {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          max-width: 720px;
          padding-top: 20px;
          border-top: 1px solid #edf1f6;
        }
        label { display: grid; gap: 7px; color: #334155; font-size: 12px; font-weight: 700; }
        input { height: 44px; border: 1px solid #dbe2ea; border-radius: 12px; padding: 0 12px; font-size: 14px; }
        input:focus { outline: 3px solid rgba(59, 130, 246, 0.12); border-color: #3b82f6; }
        .password-visibility { width: max-content; display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: #1d4ed8; font-weight: 700; cursor: pointer; }
        p.success, p.error { grid-column: 1 / -1; padding: 11px 13px; border-radius: 11px; }
        p.success { color: #166534; background: #dcfce7; }
        p.error { color: #b91c1c; background: #fee2e2; }
        .submit-password { width: max-content; min-width: 150px; min-height: 42px; border-radius: 12px; }
        .password-action:focus-visible, .password-visibility:focus-visible, .submit-password:focus-visible {
          outline: 3px solid rgba(59, 130, 246, 0.2);
          outline-offset: 2px;
        }
        @media (max-width: 640px) {
          .security-summary {
            grid-template-columns: auto minmax(0, 1fr);
          }
          .password-action {
            grid-column: 1 / -1;
            width: 100%;
          }
          form {
            grid-template-columns: 1fr;
          }
          .submit-password {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}
