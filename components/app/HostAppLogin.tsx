"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { CSSProperties } from "react";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";

import { createBrowserSupabaseClient } from "@/lib/supabase";

type HostAppLoginProps = {
  badgeLabel?: string | null;
};

export function HostAppLogin({ badgeLabel = null }: HostAppLoginProps): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const cleanIdentifier = String(formData.get("identifier") ?? "").trim();
    const cleanPassword = String(formData.get("password") ?? "").trim();

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
          password: cleanPassword,
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
            userId: data.user.id,
          }),
        });
        const resolvePayload = (await resolveResponse.json()) as { redirect?: string; error?: string };

        if (!resolveResponse.ok || !resolvePayload.redirect) {
          setErrorMessage(resolvePayload.error ?? "No partner dashboard matched this account.");
          return;
        }

        window.location.assign("/app/host");
        return;
      }

      const response = await fetch("/api/partners/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ identifier: cleanIdentifier, password: cleanPassword }),
      });
      const payload = (await response.json()) as { redirect?: string; error?: string };

      if (!response.ok || !payload.redirect) {
        setErrorMessage(payload.error ?? "Partner ID or password is incorrect.");
        return;
      }

      window.location.assign("/app/host");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Service error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          {badgeLabel ? <div style={badgeStyle}>{badgeLabel}</div> : null}
          <Image src="/logo-blue.png" alt="Famlo" width={1024} height={344} sizes="132px" style={{ height: "32px", width: "auto" }} />
          <div style={eyebrowStyle}>Famlo Host</div>
          <h1 style={titleStyle}>Log in to your host dashboard</h1>
          <p style={copyStyle}>We’ll check your host account first, then open Free Famlo or Famlo Pro automatically.</p>
        </div>

        <form onSubmit={(event) => void handleLogin(event)} style={formStyle}>
          <label style={labelStyle} htmlFor="identifier">Partner ID / Email</label>
          <input
            id="identifier"
            name="identifier"
            style={inputStyle}
            placeholder="e.g. FAM-123456"
            disabled={loading}
            autoFocus
          />

          <label style={labelStyle} htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            style={inputStyle}
            placeholder="••••••••"
            disabled={loading}
          />

          {errorMessage ? (
            <div style={errorStyle}>
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? (
              <span style={buttonInnerStyle}>
                <Loader2 className="animate-spin" size={18} />
                <span>Verifying...</span>
              </span>
            ) : (
              "Continue"
            )}
          </button>
        </form>

        <div style={footerStyle}>
          <Link href="/partners/forgetpassword" style={linkStyle}>Forgot password?</Link>
          <Link href="/" style={secondaryLinkStyle}>Back to Homepage</Link>
        </div>

        <div style={lockupStyle}>
          <ShieldCheck size={20} />
          <span>Host-focused mobile access</span>
        </div>
      </div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "24px",
  background:
    "radial-gradient(circle at top left, rgba(22, 93, 204, 0.09), transparent 35%), linear-gradient(180deg, #f7fbff 0%, #ffffff 100%)",
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: "460px",
  borderRadius: "28px",
  padding: "28px 22px",
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 22px 60px rgba(14, 43, 87, 0.12)",
  border: "1px solid rgba(22, 93, 204, 0.08)",
};

const headerStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  justifyItems: "start",
  marginBottom: "20px",
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "28px",
  padding: "0 10px",
  borderRadius: "999px",
  background: "#fef3c7",
  color: "#92400e",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.12em",
};

const eyebrowStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: "#165dcc",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "28px",
  lineHeight: 1.05,
  color: "#0e2b57",
};

const copyStyle: CSSProperties = {
  margin: 0,
  fontSize: "14px",
  lineHeight: 1.5,
  color: "#52637d",
};

const formStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
};

const labelStyle: CSSProperties = {
  fontSize: "11px",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: "#52637d",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "16px 18px",
  borderRadius: "16px",
  border: "1px solid #dbe7fb",
  background: "#fff",
  color: "#0e2b57",
  fontSize: "15px",
  fontWeight: 700,
};

const errorStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  borderRadius: "14px",
  padding: "12px 14px",
  background: "#fef2f2",
  border: "1px solid #fee2e2",
  color: "#dc2626",
  fontSize: "13px",
  fontWeight: 800,
};

const buttonStyle: CSSProperties = {
  width: "100%",
  marginTop: "8px",
  padding: "16px 18px",
  borderRadius: "16px",
  border: "none",
  background: "#0e2b57",
  color: "#fff",
  fontSize: "16px",
  fontWeight: 900,
  cursor: "pointer",
};

const buttonInnerStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "10px",
};

const footerStyle: CSSProperties = {
  marginTop: "18px",
  display: "grid",
  gap: "10px",
  justifyItems: "start",
};

const linkStyle: CSSProperties = {
  color: "#165dcc",
  fontSize: "13px",
  fontWeight: 800,
  textDecoration: "none",
};

const secondaryLinkStyle: CSSProperties = {
  color: "#6b7b93",
  fontSize: "12px",
  fontWeight: 700,
  textDecoration: "none",
};

const lockupStyle: CSSProperties = {
  marginTop: "22px",
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  color: "#6b7b93",
  fontSize: "12px",
  fontWeight: 700,
};
