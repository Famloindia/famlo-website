export type JsonRecord = Record<string, unknown>;

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function enumerateDateRange(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const output: string[] = [];

  while (start <= end) {
    output.push(start.toISOString().split("T")[0] ?? from);
    start.setUTCDate(start.getUTCDate() + 1);
  }

  return output;
}

function normalizeDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const candidate = trimmed.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

function addUtcDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function enumerateStayNights(checkInDate: string, checkOutDate?: string | null): string[] {
  const checkIn = normalizeDateOnly(checkInDate);
  if (!checkIn) return [];

  const normalizedCheckout = normalizeDateOnly(checkOutDate ?? null);
  if (!normalizedCheckout || normalizedCheckout <= checkIn) {
    return [checkIn];
  }

  return enumerateDateRange(checkIn, addUtcDays(normalizedCheckout, -1));
}

export function getStayNightDateRange(
  checkInDate: string,
  checkOutDate?: string | null
): { from: string; to: string; nights: string[] } | null {
  const nights = enumerateStayNights(checkInDate, checkOutDate);
  if (nights.length === 0) return null;
  return {
    from: nights[0] ?? checkInDate,
    to: nights[nights.length - 1] ?? checkInDate,
    nights,
  };
}

export function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function toDateOnly(value: Date): string {
  return value.toISOString().split("T")[0] ?? "";
}
