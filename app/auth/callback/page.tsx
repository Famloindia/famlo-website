"use client";

import { useEffect, useMemo, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import { getSafeReturnPath } from "@/lib/site-url";

export default function AuthCallbackPage(): React.JSX.Element {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [message, setMessage] = useState("Signing you in...");

  useEffect(() => {
    let active = true;

    void (async () => {
      const currentUrl = new URL(window.location.href);
      const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
      const nextPath = getSafeReturnPath(currentUrl.searchParams.get("next"));
      const code = currentUrl.searchParams.get("code");
      const oauthError =
        currentUrl.searchParams.get("error_description") ??
        hashParams.get("error_description") ??
        currentUrl.searchParams.get("error") ??
        hashParams.get("error");

      if (oauthError) {
        window.location.replace(`${nextPath}${nextPath.includes("?") ? "&" : "?"}auth_error=${encodeURIComponent(oauthError)}`);
        return;
      }

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            throw error;
          }
        } else {
          await supabase.auth.getSession();
        }

        if (!active) {
          return;
        }

        setMessage("Redirecting to Famlo...");
        window.location.replace(nextPath);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Login failed";
        window.location.replace(`${nextPath}${nextPath.includes("?") ? "&" : "?"}auth_error=${encodeURIComponent(detail)}`);
      }
    })();

    return () => {
      active = false;
    };
  }, [supabase]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "linear-gradient(180deg, #f7fbff 0%, #ffffff 100%)",
      }}
    >
      <div style={{ display: "grid", gap: "12px", justifyItems: "center", textAlign: "center" }}>
        <img src="/logo-blue.png" alt="Famlo" style={{ width: "120px", height: "auto" }} />
        <div style={{ fontSize: "15px", fontWeight: 700, color: "#33527d" }}>{message}</div>
      </div>
    </main>
  );
}
