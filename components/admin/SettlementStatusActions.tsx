"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  settlementId: string;
  canApprove: boolean;
  canCancel: boolean;
  currentStatus: string | null;
};

export default function SettlementStatusActions({ settlementId, canApprove, canCancel, currentStatus }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function post(path: string) {
    setMessage(null);
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settlementId }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Action failed.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => void post("/api/admin/finance/settlements/approve")}
        disabled={!canApprove || isPending || currentStatus !== "draft"}
        style={{
          borderRadius: "999px",
          border: "1px solid rgba(134,239,172,0.2)",
          background: !canApprove || currentStatus !== "draft" ? "rgba(148,163,184,0.12)" : "rgba(134,239,172,0.16)",
          color: !canApprove || currentStatus !== "draft" ? "#94a3b8" : "#bbf7d0",
          padding: "10px 14px",
          fontSize: "12px",
          fontWeight: 800,
          cursor: !canApprove || currentStatus !== "draft" || isPending ? "not-allowed" : "pointer",
        }}
      >
        Approve Draft
      </button>
      <button
        type="button"
        onClick={() => void post("/api/admin/finance/settlements/cancel")}
        disabled={!canCancel || isPending || currentStatus !== "draft"}
        style={{
          borderRadius: "999px",
          border: "1px solid rgba(248,113,113,0.2)",
          background: !canCancel || currentStatus !== "draft" ? "rgba(148,163,184,0.12)" : "rgba(248,113,113,0.16)",
          color: !canCancel || currentStatus !== "draft" ? "#94a3b8" : "#fecaca",
          padding: "10px 14px",
          fontSize: "12px",
          fontWeight: 800,
          cursor: !canCancel || currentStatus !== "draft" || isPending ? "not-allowed" : "pointer",
        }}
      >
        Cancel Draft
      </button>
      {message ? <span style={{ color: "#fecaca", fontSize: "12px" }}>{message}</span> : null}
    </div>
  );
}
