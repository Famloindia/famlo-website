const PRO_BILLING_REQUIRED_MIGRATIONS = [
  "20260524000023_host_pro_billing_scope_and_orders.sql",
  "20260524000025_host_pro_renewal_statuses.sql",
] as const;

export function isProBillingCompatibilityError(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  const lower = message.toLowerCase();

  return (
    code === "42501" ||
    lower.includes("permission denied") ||
    lower.includes("relation") ||
    lower.includes("does not exist") ||
    lower.includes("schema cache") ||
    lower.includes("column")
  );
}

export function buildProBillingSetupNotReadyPayload(error: unknown): {
  ready: false;
  hostMessage: string;
  adminMessage?: string;
  requiredMigrations?: readonly string[];
} {
  const payload: {
    ready: false;
    hostMessage: string;
    adminMessage?: string;
    requiredMigrations?: readonly string[];
  } = {
    ready: false,
    hostMessage: "Famlo Pro billing setup is not ready in this database. Please apply Pro billing migrations.",
  };

  if (process.env.NODE_ENV !== "production") {
    payload.adminMessage = error instanceof Error ? error.message : "Unknown Pro billing schema error.";
    payload.requiredMigrations = PRO_BILLING_REQUIRED_MIGRATIONS;
  }

  return payload;
}
