"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type HostSession = {
  active: boolean;
  dashboardUrl?: string | null;
};

export function AppHome(): React.JSX.Element {
  const router = useRouter();
  const [message, setMessage] = useState("Opening your Famlo app...");

  useEffect(() => {
    let ignore = false;

    void (async () => {
      try {
        const response = await fetch("/api/app/session", { cache: "no-store" });
        const payload = (await response.json()) as { hostSession?: HostSession };
        const hostSession = payload.hostSession ?? { active: false };

        if (ignore) {
          return;
        }

        if (hostSession.active && hostSession.dashboardUrl) {
          setMessage("Opening your host dashboard...");
          router.replace(hostSession.dashboardUrl);
          return;
        }

        setMessage("Opening explore...");
        router.replace("/?app=1");
      } catch {
        if (!ignore) {
          router.replace("/?app=1");
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, [router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(180deg, #f7fbff 0%, #ffffff 100%)",
      }}
    >
      <div style={{ display: "grid", gap: 12, justifyItems: "center", textAlign: "center", padding: 24 }}>
        <img src="/logo-blue.png" alt="Famlo" style={{ width: 120, height: "auto" }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: "#33527d" }}>{message}</div>
      </div>
    </main>
  );
}
