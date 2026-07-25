"use client";

import { Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase";

export function PasswordManagementCard(): React.JSX.Element {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
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
      setMessage({ type: "success", text: "Password updated securely." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Password could not be changed." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel password-card">
      <div>
        <h2>Password</h2>
        <p>Email-password accounts must confirm the current password. Google or phone accounts can set one after adding a verified email.</p>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <label><span>Current password</span><input type={showPasswords ? "text" : "password"} autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
        <label><span>New password</span><input type={showPasswords ? "text" : "password"} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
        <label><span>Confirm new password</span><input type={showPasswords ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
        <button type="button" onClick={() => setShowPasswords((value) => !value)} className="password-visibility">
          {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
          {showPasswords ? "Hide passwords" : "Show passwords"}
        </button>
        {message ? <p role="status" className={message.type}>{message.text}</p> : null}
        <button type="submit" className="button-like" disabled={saving}>{saving ? "Updating..." : "Change password"}</button>
      </form>
      <style jsx>{`
        .password-card { padding: 24px; display: grid; gap: 16px; }
        h2, p { margin: 0; }
        div > p { margin-top: 6px; color: #64748b; line-height: 1.6; }
        form { display: grid; gap: 12px; max-width: 520px; }
        label { display: grid; gap: 6px; color: #334155; font-size: 12px; font-weight: 800; }
        input { height: 42px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0 10px; }
        .password-visibility { width: max-content; display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: #1d4ed8; font-weight: 700; cursor: pointer; }
        p.success, p.error { padding: 10px; border-radius: 6px; }
        p.success { color: #166534; background: #dcfce7; }
        p.error { color: #b91c1c; background: #fee2e2; }
      `}</style>
    </section>
  );
}
