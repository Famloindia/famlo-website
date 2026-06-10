const INDIA_TIMEZONE = "Asia/Kolkata";

type QuarterKey = "morning" | "afternoon" | "evening" | "fullday";

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

function getQuarterCutoffMinutes(quarterType: string | null | undefined): number {
  const normalized = String(quarterType ?? "").trim().toLowerCase() as QuarterKey;
  switch (normalized) {
    case "morning":
      return 7 * 60;
    case "afternoon":
      return 12 * 60;
    case "evening":
      return 17 * 60;
    case "fullday":
      return 7 * 60;
    default:
      return 0;
  }
}

export function getTodayInIndia(now = new Date()): string {
  return getIndiaDateParts(now).date;
}

export function addIndiaDays(date: string, days: number): string {
  const base = new Date(`${date}T12:00:00+05:30`);
  base.setDate(base.getDate() + days);
  return getTodayInIndia(base);
}

export function isPastDateInIndia(date: string, now = new Date()): boolean {
  return date < getTodayInIndia(now);
}

export function isBookingSlotExpired(params: {
  date: string;
  quarterType?: string | null;
  now?: Date;
}): boolean {
  const { date, quarterType, now = new Date() } = params;
  const indiaNow = getIndiaDateParts(now);

  if (!date) return false;
  if (date < indiaNow.date) return true;
  if (date > indiaNow.date) return false;

  return indiaNow.minutes >= getQuarterCutoffMinutes(quarterType);
}
