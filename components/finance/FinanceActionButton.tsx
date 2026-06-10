"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type FinanceActionButtonProps = {
  label: string;
  endpoint: string;
  payload?: Record<string, unknown>;
  disabledReason?: string | null;
  confirmText?: string | null;
  kind?: "primary" | "secondary" | "danger";
};

export default function FinanceActionButton({
  label,
  endpoint,
  payload,
  disabledReason,
  confirmText,
  kind = "secondary",
}: FinanceActionButtonProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const disabled = Boolean(disabledReason) || isPending;

  return (
    <div style={{ display: "grid", gap: "6px" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (confirmText && !window.confirm(confirmText)) return;
          setMessage(null);
          startTransition(async () => {
            try {
              const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(payload ?? {}),
              });
              const data = (await response.json().catch(() => ({}))) as { error?: string };
              if (!response.ok) {
                throw new Error(data.error ?? "Action failed.");
              }
              setMessage("Updated");
              router.refresh();
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Action failed.");
            }
          });
        }}
        style={{
          borderRadius: "10px",
          border: "1px solid rgba(255,255,255,0.12)",
          background:
            kind === "danger"
              ? "rgba(220,38,38,0.16)"
              : kind === "primary"
                ? "rgba(37,99,235,0.18)"
                : "rgba(15,23,42,0.7)",
          color: disabled ? "rgba(255,255,255,0.42)" : "white",
          padding: "10px 12px",
          fontSize: "12px",
          fontWeight: 700,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {isPending ? "Working..." : label}
      </button>
      {disabledReason ? (
        <div style={{ fontSize: "11px", color: "#fca5a5", lineHeight: 1.5 }}>{disabledReason}</div>
      ) : null}
      {message ? <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.72)" }}>{message}</div> : null}
    </div>
  );
}
