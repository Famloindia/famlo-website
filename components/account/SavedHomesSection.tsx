"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useUser } from "@/components/auth/UserContext";

type SavedHomeRecord = {
  id: string;
  href: string;
  title: string;
  imageUrl: string | null;
  savedAt: string;
};

export function SavedHomesSection(): React.JSX.Element {
  const { user } = useUser();
  const [savedHomes, setSavedHomes] = useState<SavedHomeRecord[]>([]);

  const storageKey = useMemo(
    () => (user?.id ? `famlo-saved-homes:${user.id}` : null),
    [user?.id]
  );

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      queueMicrotask(() => setSavedHomes([]));
      return;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      queueMicrotask(() => setSavedHomes(raw ? (JSON.parse(raw) as SavedHomeRecord[]) : []));
    } catch {
      queueMicrotask(() => setSavedHomes([]));
    }
  }, [storageKey]);

  if (!user) {
    return (
      <section className="panel account-page-panel" style={{ padding: "24px", gap: "12px" }}>
        <h2 style={{ margin: 0 }}>Saved homes</h2>
        <p style={{ margin: 0, color: "#5A6A85" }}>Sign in to keep homestays saved on your profile.</p>
      </section>
    );
  }

  return (
    <section className="panel account-page-panel" style={{ padding: "24px", gap: "16px" }}>
      <div style={{ display: "grid", gap: "6px" }}>
        <h2 style={{ margin: 0 }}>Saved homes</h2>
        <p style={{ margin: 0, color: "#5A6A85" }}>
          Homes you tap Save on will appear here while you&apos;re signed in.
        </p>
      </div>

      {savedHomes.length === 0 ? (
        <div style={{ padding: "16px", borderRadius: "16px", background: "#f8fafc", color: "#64748b" }}>
          No saved homes yet.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "14px" }}>
          {savedHomes.map((home) => (
            <Link
              key={home.id}
              href={home.href}
              style={{
                display: "grid",
                gridTemplateColumns: "96px minmax(0, 1fr)",
                gap: "14px",
                alignItems: "center",
                padding: "12px",
                borderRadius: "18px",
                background: "white",
                border: "1px solid #dbeafe",
              }}
            >
              <div
                style={{
                  width: "96px",
                  height: "72px",
                  borderRadius: "14px",
                  background: "#eff6ff",
                  overflow: "hidden",
                }}
              >
                {home.imageUrl ? (
                  <img src={home.imageUrl} alt={home.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : null}
              </div>
              <div style={{ display: "grid", gap: "6px" }}>
                <strong style={{ color: "#0f172a" }}>{home.title}</strong>
                <span style={{ color: "#64748b", fontSize: "13px" }}>Tap to open the listing</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
