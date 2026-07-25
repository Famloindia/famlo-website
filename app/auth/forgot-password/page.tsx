"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage(): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json();
      setMessage(payload.message ?? "If an eligible account exists, password reset instructions have been sent.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section>
        <h1>Reset your password</h1>
        <p>Enter your verified email. For privacy, Famlo always returns the same response.</p>
        <form onSubmit={(event) => void submit(event)}>
          <label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <button type="submit" disabled={loading}>{loading ? "Sending..." : "Send reset link"}</button>
        </form>
        {message ? <p role="status" className="status">{message}</p> : null}
        <Link href="/?auth=true">Back to log in</Link>
      </section>
      <style jsx>{`
        .auth-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f5f9ff; }
        section { width: min(100%, 440px); padding: 28px; background: #fff; border: 1px solid #dbeafe; border-radius: 8px; display: grid; gap: 16px; }
        h1, p { margin: 0; } p { color: #64748b; line-height: 1.6; }
        form, label { display: grid; gap: 8px; }
        input, button { min-height: 44px; border-radius: 6px; }
        input { border: 1px solid #cbd5e1; padding: 0 12px; }
        button { border: 0; background: #1769e0; color: #fff; font-weight: 800; }
        .status { padding: 10px; color: #166534; background: #dcfce7; border-radius: 6px; }
      `}</style>
    </main>
  );
}
