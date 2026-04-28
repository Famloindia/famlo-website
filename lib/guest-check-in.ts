import crypto from "node:crypto";

const CHECK_IN_CODE_DIGITS = 5;
const DEFAULT_SECRET = process.env.ADMIN_SESSION_SECRET ?? process.env.CRON_SECRET ?? "famlo-checkin-secret";
const INDIA_TIMEZONE = "Asia/Kolkata";

function getIndiaDateParts(now: Date): { date: string; minutes: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  const year = lookup.get("year") ?? "0000";
  const month = lookup.get("month") ?? "01";
  const day = lookup.get("day") ?? "01";
  const hour = Number(lookup.get("hour") ?? "0");
  const minute = Number(lookup.get("minute") ?? "0");

  return {
    date: `${year}-${month}-${day}`,
    minutes: hour * 60 + minute,
  };
}

function toIndiaDate(date: string): Date {
  return new Date(`${date}T12:00:00+05:30`);
}

function toIndiaDayStart(date: string): Date {
  return new Date(`${date}T00:00:00+05:30`);
}

function toIndiaDayEnd(date: string): Date {
  return new Date(`${date}T23:59:59+05:30`);
}

export function isGuestCheckInWindowOpen(params: {
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  now?: Date;
}): boolean {
  const { startDate, endDate, now = new Date() } = params;
  if (!startDate) return false;

  const start = toIndiaDayStart(startDate);
  const end = toIndiaDayEnd(endDate ?? startDate);
  const windowStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(end.getTime() + 12 * 60 * 60 * 1000);
  return now.getTime() >= windowStart.getTime() && now.getTime() <= windowEnd.getTime();
}

export function isGuestCheckoutWindowOpen(params: {
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  now?: Date;
}): boolean {
  const { startDate, endDate, now = new Date() } = params;
  if (!startDate) return false;

  const end = toIndiaDate(endDate ?? startDate);
  const graceWindowEnd = new Date(end.getTime() + 36 * 60 * 60 * 1000);
  return now.getTime() >= toIndiaDate(startDate).getTime() && now.getTime() <= graceWindowEnd.getTime();
}

export function normalizeGuestCheckInCode(input: string): string {
  return input.replace(/\D/g, "").slice(0, CHECK_IN_CODE_DIGITS);
}

export function formatGuestCheckInCode(code: string): string {
  const normalized = normalizeGuestCheckInCode(code);
  return normalized.padStart(CHECK_IN_CODE_DIGITS, "0");
}

export function deriveGuestCheckInCode(seed: string, _bookingId?: string): string {
  const payload = seed;
  const digest = crypto.createHmac("sha256", DEFAULT_SECRET).update(payload).digest();
  const raw = digest.readUInt32BE(0) % 100000;
  return raw.toString().padStart(CHECK_IN_CODE_DIGITS, "0");
}

export function getGuestCheckInCodeWindowLabel(now = new Date()): string {
  const india = getIndiaDateParts(now);
  if (india.minutes < 12 * 60) return "Today";
  return "Today";
}
