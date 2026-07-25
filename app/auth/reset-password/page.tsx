"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function ResetPasswordPage(): React.JSX.Element {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          if (active) setInvalid(true);
          return;
        }
      }
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setReady(Boolean(data.session));
      setInvalid(!data.session);
    })();
    return () => { active = false; };
  }, [supabase]);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    setSaving(true);
    setMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setMessage("This recovery link is invalid or expired. Request a new one.");
      return;
    }
    window.location.replace("/profile");
  }

  return (
    <main className="auth-page">
      <section>
        <h1>Choose a new password</h1>
        {invalid ? <p className="error">This recovery link is invalid or expired. Request a new link.</p> : null}
        {!invalid && !ready ? <p>Verifying your recovery link...</p> : null}
        {ready ? (
          <form onSubmit={(event) => void submit(event)}>
            <label><span>New password</span><input type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <label><span>Confirm password</span><input type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
            <button type="button" className="visibility" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />} {showPassword ? "Hide" : "Show"} password</button>
            {message ? <p className="error">{message}</p> : null}
            <button type="submit" disabled={saving}>{saving ? "Updating..." : "Update password"}</button>
          </form>
        ) : null}
      </section>
      <style jsx>{`
        .auth-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f5f9ff; }
        section { width: min(100%, 440px); padding: 28px; background: #fff; border: 1px solid #dbeafe; border-radius: 8px; display: grid; gap: 16px; }
        h1, p { margin: 0; } form, label { display: grid; gap: 8px; }
        input, button { min-height: 44px; border-radius: 6px; }
        input { border: 1px solid #cbd5e1; padding: 0 12px; }
        button[type="submit"] { border: 0; background: #1769e0; color: #fff; font-weight: 800; }
        .visibility { width: max-content; display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: #1d4ed8; }
        .error { color: #b91c1c; background: #fee2e2; padding: 10px; border-radius: 6px; }
      `}</style>
    </main>
  );
}
