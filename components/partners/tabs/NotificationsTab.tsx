"use client";

import Link from "next/link";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import styles from "../dashboard.module.css";

type HostNotification = {
  id: string;
  title: string;
  message: string;
  cta_url: string | null;
  read_at: string | null;
  created_at: string;
};

export default function NotificationsTab({ familyId, onRead }: { familyId: string; onRead: () => void }) {
  const [rows, setRows] = useState<HostNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const response = await fetch(`/api/host/notifications?familyId=${encodeURIComponent(familyId)}`, { cache: "no-store" });
    const payload = await response.json();
    if (response.ok && Array.isArray(payload)) setRows(payload);
    setLoading(false);
  }, [familyId]);

  useEffect(() => { void load(); }, [load]);

  async function markAllRead(): Promise<void> {
    const response = await fetch("/api/host/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ familyId }),
    });
    if (!response.ok) return;
    setRows((current) => current.map((row) => ({ ...row, read_at: row.read_at ?? new Date().toISOString() })));
    onRead();
  }

  if (loading) return <div className={styles.glassCard} style={{ padding: 40, textAlign: "center" }}><Loader2 className={styles.spin} /></div>;
  return (
    <div className={`${styles.flexCol} ${styles.animateIn}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ color: "#0e2b57", margin: 0 }}>Notifications</h2>
        <button type="button" onClick={() => void markAllRead()} disabled={!rows.some((row) => !row.read_at)}>
          <CheckCheck size={16} /> Mark all read
        </button>
      </div>
      {rows.length === 0 ? (
        <div className={styles.glassCard} style={{ padding: 48, textAlign: "center" }}><Bell size={30} /><p>No notifications yet.</p></div>
      ) : rows.map((row) => (
        <article key={row.id} className={styles.glassCard} style={{ padding: 18, borderLeft: row.read_at ? undefined : "4px solid #1d4ed8" }}>
          <strong>{row.title}</strong>
          <p>{row.message}</p>
          {row.cta_url ? <Link href={row.cta_url}>Open booking</Link> : null}
        </article>
      ))}
    </div>
  );
}
