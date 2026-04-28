import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

const CANCELLED_STATUS_VALUES = ["cancelled", "cancelled_by_user", "cancelled_by_partner"];
const SYSTEM_ADMIN_ID = "system-admin";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function uniqueStrings(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function resolveStayDate(booking: JsonRecord | null | undefined): string | null {
  return asString(booking?.start_date) ?? asString(booking?.date_from) ?? asString(booking?.date_to);
}

function normalizeRefundStatus(value: string | null, estimatedRefundAmount: number): string | null {
  const normalized = value?.trim().toLowerCase() ?? null;
  if (!normalized || normalized === "none") {
    return estimatedRefundAmount > 0 ? "pending" : null;
  }

  return normalized;
}

export function estimateCancellationRefundAmount(booking: JsonRecord | null | undefined, payment?: JsonRecord | null): number {
  const bookingAmount = Math.max(0, Math.round(asNumber(payment?.amount_total ?? booking?.total_price)));
  if (bookingAmount <= 0) return 0;

  const paymentStatus = asString(booking?.payment_status) ?? asString(payment?.status);
  if (paymentStatus && !["paid", "refund_pending", "partially_refunded"].includes(paymentStatus)) {
    return 0;
  }

  const createdAt = asString(booking?.created_at) ? new Date(String(booking?.created_at)) : new Date();
  const stayDate = resolveStayDate(booking);
  const checkInTime = stayDate ? new Date(`${stayDate}T00:00:00+05:30`).getTime() : Date.now();
  const createdAtTime = Number.isNaN(createdAt.getTime()) ? Date.now() : createdAt.getTime();
  const hoursToCheckIn = Math.round((checkInTime - Date.now()) / 36_00_000);
  const hoursSinceBooking = Math.max(0, Math.round((Date.now() - createdAtTime) / 36_00_000));
  const penaltyPercent = hoursSinceBooking <= 24 ? 0 : hoursToCheckIn <= 24 ? 20 : 10;
  const penaltyAmount = Math.round((bookingAmount * penaltyPercent) / 100);

  return Math.max(0, bookingAmount - penaltyAmount);
}

function formatName(row: JsonRecord | null | undefined, fallback: string): string {
  const name = asString(row?.name);
  return name ?? fallback;
}

function resolveKnownActor(id: string): JsonRecord | null {
  if (id === SYSTEM_ADMIN_ID) {
    return {
      id: SYSTEM_ADMIN_ID,
      name: "Famlo Admin",
      role: "admin",
    };
  }

  return null;
}

export interface CancellationHistoryEntry {
  id: string;
  bookingId: string;
  bookingStatus: string | null;
  paymentStatus: string | null;
  bookingAmount: number;
  guestName: string;
  cancelledAt: string;
  cancelledByName: string;
  cancelledByRole: string;
  cancellationReason: string | null;
  refundAmount: number;
  refundStatus: string | null;
  refundReasonCode: string | null;
  refundInitiatedByName: string | null;
  refundInitiatedByRole: string | null;
  refundInitiatedAt: string | null;
  refundProcessedAt: string | null;
}

async function loadUsersByIds(supabase: SupabaseClient, ids: string[]): Promise<Map<string, JsonRecord>> {
  const knownActors = ids
    .map((id) => resolveKnownActor(id))
    .filter((row): row is JsonRecord => Boolean(row));

  const unknownIds = ids.filter((id) => !resolveKnownActor(id));
  if (unknownIds.length === 0) {
    return new Map(knownActors.map((row) => [String(row.id), row]));
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, name, role")
    .in("id", unknownIds);

  if (error) throw error;

  return new Map([
    ...knownActors.map((row) => [String(row.id), row] as const),
    ...((data ?? []).map((row) => [String((row as JsonRecord).id), row as JsonRecord] as const)),
  ]);
}

export async function fetchCancellationHistory(
  supabase: SupabaseClient,
  options: { limit?: number; bookingId?: string } = {}
): Promise<CancellationHistoryEntry[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 250));

  let historyQuery = supabase
    .from("booking_status_history_v2")
    .select("id,booking_id,old_status,new_status,changed_by_user_id,reason,created_at")
    .in("new_status", CANCELLED_STATUS_VALUES)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options.bookingId) {
    historyQuery = historyQuery.eq("booking_id", options.bookingId);
  }

  const { data: historyRows, error: historyError } = await historyQuery;
  if (historyError) throw historyError;

  let cancelledBookingsQuery = supabase
    .from("bookings_v2")
    .select("id,status,payment_status,total_price,user_id,cancelled_at,cancellation_reason,created_at,start_date")
    .in("status", CANCELLED_STATUS_VALUES)
    .order("cancelled_at", { ascending: false })
    .limit(limit);

  if (options.bookingId) {
    cancelledBookingsQuery = cancelledBookingsQuery.eq("id", options.bookingId);
  }

  let legacyCancelledBookingsQuery = supabase
    .from("bookings")
    .select("id,user_id,status,total_price,date_from,date_to,created_at")
    .in("status", CANCELLED_STATUS_VALUES)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options.bookingId) {
    legacyCancelledBookingsQuery = legacyCancelledBookingsQuery.eq("id", options.bookingId);
  }

  const [
    { data: cancelledBookingRows, error: cancelledBookingsError },
    { data: legacyCancelledBookingRows, error: legacyCancelledBookingsError },
  ] = await Promise.all([cancelledBookingsQuery, legacyCancelledBookingsQuery]);
  if (cancelledBookingsError) throw cancelledBookingsError;
  if (legacyCancelledBookingsError) throw legacyCancelledBookingsError;

  const historyOnlyRows = (historyRows ?? []) as JsonRecord[];
  const historyBookingIds = new Set(historyOnlyRows.map((row) => asString(row.booking_id)).filter(Boolean));
  const v2FallbackRows = ((cancelledBookingRows ?? []) as JsonRecord[])
    .filter((booking) => !historyBookingIds.has(asString(booking.id)))
    .map((booking) => ({
      id: `booking:${asString(booking.id) ?? ""}`,
      booking_id: asString(booking.id),
      old_status: null,
      new_status: asString(booking.status),
      changed_by_user_id: asString(booking.status) === "cancelled_by_user" ? asString(booking.user_id) : null,
      reason: asString(booking.cancellation_reason),
      created_at: asString(booking.cancelled_at) ?? asString(booking.created_at),
    }));
  const legacyFallbackRows = ((legacyCancelledBookingRows ?? []) as JsonRecord[])
    .filter((booking) => !historyBookingIds.has(asString(booking.id)))
    .map((booking) => ({
      id: `legacy-booking:${asString(booking.id) ?? ""}`,
      booking_id: asString(booking.id),
      old_status: null,
      new_status: asString(booking.status),
      changed_by_user_id: asString(booking.status) === "cancelled_by_user" ? asString(booking.user_id) : null,
      reason: "user_cancelled",
      created_at: asString(booking.created_at),
    }));

  const rows = [...historyOnlyRows, ...v2FallbackRows, ...legacyFallbackRows]
    .sort((left, right) => {
      const leftTime = new Date(asString(left.created_at) ?? "").getTime();
      const rightTime = new Date(asString(right.created_at) ?? "").getTime();
      return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
    })
    .slice(0, limit);

  if (rows.length === 0) return [];

  const bookingIds = uniqueStrings(rows.map((row) => asString(row.booking_id)));
  const actorIds = uniqueStrings(rows.map((row) => asString(row.changed_by_user_id)));

  const [bookingsRes, legacyBookingsRes, paymentsRes, refundsRes] = await Promise.all([
    bookingIds.length > 0
      ? supabase
          .from("bookings_v2")
          .select("id,status,payment_status,total_price,user_id,cancelled_at,cancellation_reason,created_at,start_date")
          .in("id", bookingIds)
      : Promise.resolve({ data: [] as JsonRecord[], error: null }),
    bookingIds.length > 0
      ? supabase
          .from("bookings")
          .select("id,user_id,status,total_price,date_from,date_to,created_at")
          .in("id", bookingIds)
      : Promise.resolve({ data: [] as JsonRecord[], error: null }),
    bookingIds.length > 0
      ? supabase
          .from("payments_v2")
          .select("id,booking_id,amount_total,refund_status,status,created_at")
          .in("booking_id", bookingIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as JsonRecord[], error: null }),
    bookingIds.length > 0
      ? supabase
          .from("refunds_v2")
          .select("id,booking_id,amount_total,status,reason_code,initiated_by_user_id,initiated_at,processed_at")
          .in("booking_id", bookingIds)
          .order("initiated_at", { ascending: false })
      : Promise.resolve({ data: [] as JsonRecord[], error: null }),
  ]);

  if (bookingsRes.error) throw bookingsRes.error;
  if (legacyBookingsRes.error) throw legacyBookingsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;
  if (refundsRes.error) throw refundsRes.error;

  const bookingMap = new Map([
    ...((legacyBookingsRes.data ?? []).map((row) => [String((row as JsonRecord).id), row as JsonRecord] as const)),
    ...((bookingsRes.data ?? []).map((row) => [String((row as JsonRecord).id), row as JsonRecord] as const)),
  ]);
  const paymentMap = new Map<string, JsonRecord>();
  for (const payment of paymentsRes.data ?? []) {
    const bookingId = asString((payment as JsonRecord).booking_id);
    if (!bookingId || paymentMap.has(bookingId)) continue;
    paymentMap.set(bookingId, payment as JsonRecord);
  }

  const refundMap = new Map<string, JsonRecord>();
  for (const refund of refundsRes.data ?? []) {
    const bookingId = asString((refund as JsonRecord).booking_id);
    if (!bookingId || refundMap.has(bookingId)) continue;
    refundMap.set(bookingId, refund as JsonRecord);
  }

  const guestIds = uniqueStrings([...bookingMap.values()].map((row) => asString(row.user_id)));
  const refundInitiatorIds = uniqueStrings((refundsRes.data ?? []).map((row) => asString((row as JsonRecord).initiated_by_user_id)));
  const userMap = await loadUsersByIds(supabase, [...actorIds, ...guestIds, ...refundInitiatorIds]);

  return rows.map((row) => {
    const bookingId = asString(row.booking_id) ?? String(row.booking_id ?? "");
    const booking = bookingMap.get(bookingId) ?? null;
    const payment = paymentMap.get(bookingId) ?? null;
    const refund = refundMap.get(bookingId) ?? null;
    const actorId = asString(row.changed_by_user_id);
    const actor = actorId ? userMap.get(actorId) ?? null : null;
    const refundInitiatorId = asString(refund?.initiated_by_user_id);
    const refundInitiator = refundInitiatorId ? userMap.get(refundInitiatorId) ?? null : null;
    const guestId = asString(booking?.user_id);
    const guest = guestId ? userMap.get(guestId) ?? null : null;
    const estimatedRefundAmount = estimateCancellationRefundAmount(booking, payment);
    const recordedRefundAmount = asNumber(refund?.amount_total);
    const refundStatus = normalizeRefundStatus(asString(refund?.status) ?? asString(payment?.refund_status), estimatedRefundAmount);

    return {
      id: asString(row.id) ?? bookingId,
      bookingId,
      bookingStatus: asString(booking?.status),
      paymentStatus: asString(booking?.payment_status) ?? asString(payment?.status),
      bookingAmount: asNumber(payment?.amount_total ?? booking?.total_price),
      guestName: formatName(guest, "Guest"),
      cancelledAt: asString(booking?.cancelled_at) ?? asString(row.created_at) ?? new Date().toISOString(),
      cancelledByName: actor ? formatName(actor, actorId ?? "System") : actorId ? actorId.slice(0, 8) : "System",
      cancelledByRole: actor ? asString(actor.role) ?? "unknown" : actorId ? "unknown" : "system",
      cancellationReason: asString(booking?.cancellation_reason) ?? asString(row.reason),
      refundAmount: recordedRefundAmount > 0 ? recordedRefundAmount : estimatedRefundAmount,
      refundStatus,
      refundReasonCode: asString(refund?.reason_code),
      refundInitiatedByName: refundInitiator ? formatName(refundInitiator, refundInitiatorId ?? "Unknown") : null,
      refundInitiatedByRole: refundInitiator ? asString(refundInitiator.role) : null,
      refundInitiatedAt: asString(refund?.initiated_at),
      refundProcessedAt: asString(refund?.processed_at),
    };
  });
}

export async function fetchLatestCancellationForBooking(
  supabase: SupabaseClient,
  bookingId: string
): Promise<CancellationHistoryEntry | null> {
  const entries = await fetchCancellationHistory(supabase, { bookingId, limit: 1 });
  return entries[0] ?? null;
}
