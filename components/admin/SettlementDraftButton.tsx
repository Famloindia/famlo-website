"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  hostId: string;
  propertyId: string | null;
  periodStart: string;
  periodEnd: string;
  includeOta: boolean;
  actionsEnabled: boolean;
  generationEnabled: boolean;
};

export default function SettlementDraftButton({
  hostId,
  propertyId,
  periodStart,
  periodEnd,
  includeOta,
  actionsEnabled,
  generationEnabled,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    setMessage(null);
    const response = await fetch("/api/admin/finance/settlements/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hostId,
        propertyId,
        periodStart,
        periodEnd,
        includeOta,
        dryRun,
      }),
    });
    const payload = (await response.json()) as { error?: string; settlementId?: string | null; includedBookingCount?: number; dryRun?: boolean };
    if (!response.ok) {
      setMessage(payload.error ?? "Could not create settlement draft.");
      return;
    }
    if (payload.dryRun) {
      setMessage(`Dry run ready: ${payload.includedBookingCount ?? 0} folios eligible.`);
      return;
    }
    if (payload.settlementId) {
      startTransition(() => router.push(`/admin/finance/settlements/${payload.settlementId}`));
      return;
    }
    setMessage("Draft request completed.");
  }

  const disabled = !actionsEnabled || !generationEnabled || isPending;

  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => void run(true)}
        disabled={isPending}
        style={{
          borderRadius: "999px",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.08)",
          color: "white",
          padding: "10px 14px",
          fontSize: "12px",
          fontWeight: 800,
          cursor: isPending ? "not-allowed" : "pointer",
        }}
      >
        Dry-run Draft
      </button>
      <button
        type="button"
        onClick={() => void run(false)}
        disabled={disabled}
        style={{
          borderRadius: "999px",
          border: "1px solid rgba(134,239,172,0.2)",
          background: disabled ? "rgba(148,163,184,0.12)" : "rgba(134,239,172,0.16)",
          color: disabled ? "#94a3b8" : "#bbf7d0",
          padding: "10px 14px",
          fontSize: "12px",
          fontWeight: 800,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        Create Draft
      </button>
      {message ? <span style={{ color: "#cbd5e1", fontSize: "12px" }}>{message}</span> : null}
    </div>
  );
}
