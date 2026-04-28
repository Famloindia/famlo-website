//app/partners/forgot-password/page.tsx

"use client";

import Link from "next/link";
import { useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function PartnerForgotPasswordPage(): React.JSX.Element {
  const [partnerId, setPartnerId] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const cleanPartnerId = partnerId.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();

    setMessage(null);
    setErrorMessage(null);

    if (!cleanEmail) {
      setErrorMessage("Enter the approved email first.");
      return;
    }

    setLoading(true);
    try {
      if (!cleanPartnerId) {
        const supabase = createBrowserSupabaseClient();
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
        if (error) {
          setErrorMessage(error.message);
          return;
        }
        setMessage("Reset email sent. Use this path for hommie partner email login.");
        return;
      }

      if (!newPassword.trim() || !confirmPassword.trim()) {
        setErrorMessage("Enter the new password twice to continue.");
        return;
      }

      if (newPassword.trim() !== confirmPassword.trim()) {
        setErrorMessage("The two password fields do not match.");
        return;
      }

      const response = await fetch("/api/partners/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: cleanPartnerId,
          email: cleanEmail,
          newPassword: newPassword.trim()
        })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setErrorMessage(payload.error ?? "Could not update the password right now.");
        return;
      }

      setMessage("Password updated. You can go back and log in now.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update the password right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="panel auth-shell single">
        <div className="panel auth-card">
          <span className="eyebrow">Forgot password</span>
          <h1>Reset partner access</h1>
          <p>
            Famlo Homes hosts can reset with partner ID plus approved email. Hommie partners can
            leave partner ID empty and use the approved email reset flow.
          </p>

          <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
            <label>
              <span>Partner ID</span>
              <input
                className="text-input"
                onChange={(event) => setPartnerId(event.target.value.toUpperCase())}
                placeholder="FAM-XXXXXX"
                value={partnerId}
              />
            </label>

            <label>
              <span>Approved email</span>
              <input
                className="text-input"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                value={email}
              />
            </label>

            <label>
              <span>New password</span>
              <input
                className="text-input"
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Choose a new password"
                type="password"
                value={newPassword}
              />
            </label>

            <label>
              <span>Confirm new password</span>
              <input
                className="text-input"
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm your new password"
                type="password"
                value={confirmPassword}
              />
            </label>

            {message ? <div className="auth-success">{message}</div> : null}
            {errorMessage ? <div className="auth-error">{errorMessage}</div> : null}

            <button className="button-like" disabled={loading} type="submit">
              {loading ? "Updating..." : "Reset password"}
            </button>
          </form>

          <div className="auth-links">
            <Link href="/partners/login">Back to login</Link>
            <Link href="/">Back to homepage</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
