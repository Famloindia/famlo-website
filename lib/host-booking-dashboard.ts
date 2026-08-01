export type HostBookingBucket = "new_requests" | "upcoming" | "arrivals_today" | "history";

type BookingLike = Record<string, unknown>;

function asDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function getDateInTimeZone(now: Date, timeZone = "Asia/Kolkata"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function normalizeHostBookingStatus(booking: BookingLike): string {
  const status = String(booking.status ?? "").trim().toLowerCase();
  if (booking.checked_in_at) return "checked_in";
  if (status === "pending_host_approval") return "pending";
  if (["cancelled", "cancelled_by_user", "cancelled_by_partner", "rejected"].includes(status)) return status;
  return booking.payment_status === "paid" && !status ? "confirmed" : status;
}

export function classifyHostBooking(
  booking: BookingLike,
  options: { now?: Date; timeZone?: string } = {}
): HostBookingBucket {
  const status = normalizeHostBookingStatus(booking);
  const startDate = asDate(booking.date_from);
  const today = getDateInTimeZone(options.now ?? new Date(), options.timeZone);
  const approved = ["confirmed", "accepted", "approved"].includes(status);
  if (status === "pending" && booking.payment_status === "paid") return "new_requests";
  if (approved && startDate === today) return "arrivals_today";
  if (approved && startDate && startDate > today) return "upcoming";
  return "history";
}

export function bucketHostBookings<T extends BookingLike>(
  rows: T[],
  options: { now?: Date; timeZone?: string } = {}
): Record<HostBookingBucket, T[]> {
  const unique = Array.from(new Map(rows.map((row) => [String(row.id ?? ""), row])).values())
    .filter((row) => String(row.id ?? "").length > 0);
  const buckets: Record<HostBookingBucket, T[]> = {
    new_requests: [], upcoming: [], arrivals_today: [], history: [],
  };
  for (const row of unique) buckets[classifyHostBooking(row, options)].push(row);
  buckets.new_requests.sort(
    (left, right) => Date.parse(String(right.created_at ?? 0)) - Date.parse(String(left.created_at ?? 0))
  );
  for (const key of ["upcoming", "arrivals_today"] as const) {
    buckets[key].sort((left, right) => String(left.date_from ?? "").localeCompare(String(right.date_from ?? "")));
  }
  buckets.history.sort(
    (left, right) => Date.parse(String(right.created_at ?? 0)) - Date.parse(String(left.created_at ?? 0))
  );
  return buckets;
}
