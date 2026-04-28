//app/partners/login/page.tsx

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./login.module.css";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { ShieldCheck, AlertCircle, Loader2 } from "lucide-react";

export default function PartnerLoginPage(): React.JSX.Element {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const cleanIdentifier = identifier.trim();
    const cleanPassword = password.trim();

    if (!cleanIdentifier || !cleanPassword) {
      setErrorMessage("Enter your Partner ID and password.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      if (cleanIdentifier.includes("@")) {
        const supabase = createBrowserSupabaseClient();
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanIdentifier.toLowerCase(),
          password: cleanPassword
        });

        if (error || !data.user) {
          setErrorMessage("ID or password is incorrect.");
          return;
        }

        const resolveResponse = await fetch("/api/partners/resolve-stay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: cleanIdentifier.toLowerCase(),
            userId: data.user.id
          })
        });
        const resolvePayload = (await resolveResponse.json()) as { redirect?: string; error?: string };

        if (!resolveResponse.ok || !resolvePayload.redirect) {
          setErrorMessage(resolvePayload.error ?? "No partner dashboard matched this account.");
          return;
        }

        router.push(resolvePayload.redirect);
        return;
      }

      const response = await fetch("/api/partners/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: cleanIdentifier, password: cleanPassword })
      });
      const payload = (await response.json()) as { redirect?: string; error?: string };

      if (!response.ok || !payload.redirect) {
        setErrorMessage(payload.error ?? "Partner ID or password is incorrect.");
        return;
      }

      router.push(payload.redirect);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Service error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.loginContainer}>
      <div className={styles.brandHeader}>
        <img src="/logo-blue.png" alt="Famlo" style={{ height: "32px", width: "auto" }} />
        <div className={styles.tagline}>Partner Portal</div>
      </div>

      <div className={styles.loginCard}>
        <div className={styles.loginHeader}>
          <h2>Welcome Back</h2>
          <p>Login to your secure Host Dashboard.</p>
        </div>

        <form onSubmit={(event) => void handleLogin(event)}>
          <div className={styles.formGroup}>
            <label htmlFor="identifier">Partner ID / Email</label>
            <input
              id="identifier"
              className={styles.inputField}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="e.g. FAM-123456"
              value={identifier}
              disabled={loading}
              autoFocus
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className={styles.inputField}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              value={password}
              disabled={loading}
            />
          </div>

          {errorMessage && (
            <div className={styles.errorBox}>
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          <button className={styles.loginBtn} disabled={loading} type="submit">
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <Loader2 className="animate-spin" size={20} />
                <span>Verifying...</span>
              </div>
            ) : "Log in to Dashboard"}
          </button>
        </form>

        <div className={styles.footerLinks}>
          <Link href="/partners/forgetpassword" className={styles.forgotLink}>
            Forgot password?
          </Link>
          <Link href="/" className={styles.backLink}>
            Back to Homepage
          </Link>
        </div>
      </div>
      
      <div style={{ marginTop: '40px', display: 'flex', gap: '12px', opacity: 0.15 }}>
         <ShieldCheck size={24} />
      </div>
    </div>
  );
}
