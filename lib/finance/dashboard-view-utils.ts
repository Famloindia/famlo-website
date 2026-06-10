export type JsonRecord = Record<string, unknown>;

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function asBoolean(value: unknown): boolean {
  return value === true;
}

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  const raw = asString(value);
  if (!raw) return "Not available";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(
    "en-IN",
    options ?? { day: "2-digit", month: "short", year: "numeric" }
  ).format(date);
}

export function formatDateRange(start: string | null | undefined, end: string | null | undefined): string {
  const startLabel = formatDate(start);
  const endLabel = formatDate(end);
  if (startLabel === "Not available" && endLabel === "Not available") return "Period not available";
  return `${startLabel} to ${endLabel}`;
}

export function formatCompactDate(value: string | null | undefined): string {
  return formatDate(value, { day: "2-digit", month: "short" });
}

export function maskPan(value: string | null | undefined): string {
  const normalized = asString(value)?.replace(/\s+/g, "").toUpperCase() ?? "";
  if (!normalized) return "Not available";
  if (normalized.length <= 4) return normalized;
  return `${"*".repeat(Math.max(4, normalized.length - 4))}${normalized.slice(-4)}`;
}

export function humanizeToken(value: string | null | undefined): string {
  const normalized = asString(value);
  if (!normalized) return "Not available";
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function statusTone(status: string | null | undefined): "neutral" | "success" | "warning" | "danger" | "info" {
  const normalized = asString(status)?.toLowerCase() ?? "";
  if (["paid", "processed", "approved", "issued", "ready", "verified", "active"].includes(normalized)) return "success";
  if (["failed", "rejected", "cancelled", "reversed", "blocked", "critical", "needs review", "needs_review"].includes(normalized)) return "danger";
  if (["pending", "processing", "warning", "requested", "draft", "review"].includes(normalized)) return "warning";
  if (["submitted", "info"].includes(normalized)) return "info";
  return "neutral";
}

export function startOfMonthIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function sumBy<T>(rows: T[], mapper: (row: T) => number): number {
  return rows.reduce((sum, row) => sum + mapper(row), 0);
}
