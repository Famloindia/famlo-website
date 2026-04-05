"use client";

import Link from "next/link";
import { useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function PartnerForgotPasswordPage(): JSX.Element {
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
    <main className="min-h-screen bg-[linear-gradient(180deg,#f6efe5_0%,#fbf9f4_45%,#f4f7fb_100%)] px-6 py-12">
      <div className="mx-auto w-full max-w-3xl rounded-[36px] border border-white/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#8a6a3d]">Forgot Password</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-[#1f2937]">Reset partner access</h1>
        <p className="mt-3 text-base leading-7 text-[#52606d]">
          Famlo Homes hosts can reset with partner ID plus approved email. Hommie partners can leave partner ID empty and use the approved email reset flow.
        </p>

        <form className="mt-8 space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          <label className="grid gap-2 text-sm text-[#52606d]">
            Partner ID
            <input
              value={partnerId}
              onChange={(event) => setPartnerId(event.target.value.toUpperCase())}
              placeholder="FAM-XXXXXX"
              className="rounded-2xl border border-[#e5e7eb] px-4 py-4 text-[#1f2937] outline-none"
            />
          </label>
          <label className="grid gap-2 text-sm text-[#52606d]">
            Approved email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="rounded-2xl border border-[#e5e7eb] px-4 py-4 text-[#1f2937] outline-none"
            />
          </label>
          <label className="grid gap-2 text-sm text-[#52606d]">
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Choose a new password"
              className="rounded-2xl border border-[#e5e7eb] px-4 py-4 text-[#1f2937] outline-none"
            />
          </label>
          <label className="grid gap-2 text-sm text-[#52606d]">
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm your new password"
              className="rounded-2xl border border-[#e5e7eb] px-4 py-4 text-[#1f2937] outline-none"
            />
          </label>

          {message ? <div className="rounded-2xl border border-[#d7eadf] bg-[#f4fbf6] px-4 py-3 text-sm text-[#166534]">{message}</div> : null}
          {errorMessage ? <div className="rounded-2xl border border-[#f3c3cb] bg-[#fff5f7] px-4 py-3 text-sm text-[#9f1239]">{errorMessage}</div> : null}

          <button type="submit" disabled={loading} className="w-full rounded-full bg-[#1f2937] px-5 py-4 text-sm font-semibold text-white disabled:opacity-70">
            {loading ? "Updating..." : "Reset password"}
          </button>
        </form>

        <div className="mt-6 text-sm">
          <Link href="/partners/login" className="font-semibold text-[#8a6a3d]">
            Back to login
          </Link>
        </div>
      </div>
    </main>
  );
}
