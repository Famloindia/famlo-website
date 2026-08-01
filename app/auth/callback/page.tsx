"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import { getSafeReturnPath } from "@/lib/site-url";
import { migrateSavedHomesAfterIdentityLink } from "@/lib/auth/saved-homes-linking";

export default function AuthCallbackPage(): React.JSX.Element {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [message, setMessage] = useState("Signing you in...");

  useEffect(() => {
    let active = true;

    void (async () => {
      const currentUrl = new URL(window.location.href);
      const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
      const nextPath = getSafeReturnPath(currentUrl.searchParams.get("next"), "/");
      const profileUrl = new URL("/profile", window.location.origin);
      const code = currentUrl.searchParams.get("code");
      const linkRequestId = currentUrl.searchParams.get("link_request");
      const isGoogleLink = currentUrl.searchParams.get("link_mode") === "google";
      const oauthError =
        currentUrl.searchParams.get("error_description") ??
        hashParams.get("error_description") ??
        currentUrl.searchParams.get("error") ??
        hashParams.get("error");

      if (oauthError) {
        window.location.replace(`${nextPath}${nextPath.includes("?") ? "&" : "?"}auth_error=authentication_failed`);
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

        if (isGoogleLink && linkRequestId) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const response = await fetch("/api/user/account-link/complete", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(session?.access_token
                ? { Authorization: `Bearer ${session.access_token}` }
                : {}),
            },
            body: JSON.stringify({ requestId: linkRequestId }),
          });
          if (!response.ok) {
            throw new Error("Account linking did not complete.");
          }
          const sourceStorageKey = `famlo:account-link-source:${linkRequestId}`;
          const sourceUserId = window.sessionStorage.getItem(sourceStorageKey);
          if (sourceUserId && session?.user.id) {
            migrateSavedHomesAfterIdentityLink(
              window.localStorage,
              sourceUserId,
              session.user.id
            );
            window.sessionStorage.removeItem(sourceStorageKey);
          }
          window.location.replace(nextPath);
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        const profileResponse = await fetch("/api/user/profile", {
          cache: "no-store",
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        const profilePayload = (await profileResponse.json().catch(() => ({}))) as { profileComplete?: boolean };
        if (profileResponse.ok && profilePayload.profileComplete) {
          window.location.replace(nextPath);
          return;
        }
        setMessage("Opening your profile...");
        profileUrl.searchParams.set("complete", "1");
        profileUrl.searchParams.set("next", nextPath);
        profileUrl.searchParams.set("auth_return", "authenticated");
        window.location.replace(`${profileUrl.pathname}${profileUrl.search}${profileUrl.hash}`);
      } catch {
        window.location.replace(`${nextPath}${nextPath.includes("?") ? "&" : "?"}auth_error=authentication_failed`);
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
        <Image src="/logo-blue.png" alt="Famlo" width={1024} height={344} sizes="120px" style={{ width: "120px", height: "auto" }} />
        <div style={{ fontSize: "15px", fontWeight: 700, color: "#33527d" }}>{message}</div>
      </div>
    </main>
  );
}
