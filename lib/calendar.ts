import type { SupabaseClient } from "@supabase/supabase-js";

import { isHostBookingInventoryBlocking } from "@/lib/host-booking-state";
import { enumerateDateRange, asString, type JsonRecord } from "@/lib/platform-utils";

export type CanonicalCalendarEvent = {
  id?: string;
  eventUid: string;
  ownerType: string;
  ownerId: string;
  bookingId?: string | null;
  title: string;
  startDate: string;
  endDate: string;
  slotKey?: string | null;
  status: string;
  sourceType: "internal_booking" | "manual_block" | "booking_hold" | "external_import";
  sourceReference?: string | null;
  isBlocking: boolean;
  payload?: JsonRecord;
  connectionId?: string | null;
};

type CalendarSyncLogInput = {
  connectionId?: string | null;
  ownerType: string;
  ownerId: string;
  provider: string;
  direction: "import" | "export";
  status: "running" | "success" | "partial" | "failed";
  eventsSeen?: number;
  eventsApplied?: number;
  conflictsFound?: number;
  message?: string | null;
  payload?: JsonRecord;
};

function normalizedDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split("T")[0] ?? null;
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return (
    (code === "42703" && message.includes(columnName)) ||
    (message.includes(columnName) && (message.includes("schema cache") || message.includes("does not exist"))) ||
    (columnName === "stay_unit_id" && message === "")
  );
}

function resolveStayUnitId(row: JsonRecord): string | null {
  const direct = asString(row.stay_unit_id);
  if (direct) {
    return direct;
  }

  const snapshot = (row.pricing_snapshot as JsonRecord | null) ?? null;
  return asString(snapshot?.stay_unit_id);
}

export function toCalendarEventUid(prefix: string, id: string, startDate: string, slotKey?: string | null): string {
  return [prefix, id, startDate, slotKey ?? "full"].filter(Boolean).join(":");
}

export async function loadCanonicalCalendar(
  supabase: SupabaseClient,
  input: {
    ownerType: string;
    ownerId: string;
    from: string;
    to: string;
  }
): Promise<CanonicalCalendarEvent[]> {
  let storedResult;
  let bookingsResult;
  let roomSnapshotBookingsResult;

  try {
    storedResult = await supabase
      .from("calendar_events")
      .select("*")
      .eq("owner_type", input.ownerType)
      .eq("owner_id", input.ownerId)
      .lte("start_date", input.to)
      .gte("end_date", input.from)
      .neq("status", "released");
  } catch (error) {
    throw error;
  }

  if (input.ownerType === "host" || input.ownerType === "stay_unit") {
    try {
      bookingsResult = await supabase
        .from("bookings_v2")
        .select(
          input.ownerType === "stay_unit"
            ? "id,status,start_date,end_date,quarter_type,payment_status,hold_expires_at,host_id,stay_unit_id,pricing_snapshot"
            : "id,status,start_date,end_date,quarter_type,payment_status,hold_expires_at,host_id,pricing_snapshot"
        )
        .eq(input.ownerType === "host" ? "host_id" : "stay_unit_id", input.ownerId)
        .lte("start_date", input.to)
        .gte("end_date", input.from);
    } catch (error) {
      if (!isMissingColumnError(error, "stay_unit_id") || input.ownerType !== "stay_unit") {
        throw error;
      }
      bookingsResult = await supabase
        .from("bookings_v2")
        .select("id,status,start_date,end_date,quarter_type,payment_status,hold_expires_at,host_id,pricing_snapshot")
        .eq("pricing_snapshot->>stay_unit_id", input.ownerId)
        .lte("start_date", input.to)
        .gte("end_date", input.from);
    }

    if (
      bookingsResult?.error &&
      input.ownerType === "stay_unit" &&
      isMissingColumnError(bookingsResult.error, "stay_unit_id")
    ) {
      bookingsResult = await supabase
        .from("bookings_v2")
        .select("id,status,start_date,end_date,quarter_type,payment_status,hold_expires_at,host_id,pricing_snapshot")
        .eq("pricing_snapshot->>stay_unit_id", input.ownerId)
        .lte("start_date", input.to)
        .gte("end_date", input.from);
    }

    if (input.ownerType === "stay_unit") {
      roomSnapshotBookingsResult = await supabase
        .from("bookings_v2")
        .select("id,status,start_date,end_date,quarter_type,payment_status,hold_expires_at,host_id,pricing_snapshot")
        .eq("pricing_snapshot->>stay_unit_id", input.ownerId)
        .lte("start_date", input.to)
        .gte("end_date", input.from);
    }
  } else {
    bookingsResult = { data: [], error: null };
  }

  const stored = ((storedResult.data ?? []) as JsonRecord[]).map((row) => ({
    id: asString(row.id) ?? undefined,
    eventUid: asString(row.event_uid) ?? "",
    ownerType: asString(row.owner_type) ?? input.ownerType,
    ownerId: asString(row.owner_id) ?? input.ownerId,
    bookingId: asString(row.booking_id),
    title: asString(row.title) ?? "Famlo calendar event",
    startDate: asString(row.start_date) ?? input.from,
    endDate: asString(row.end_date) ?? input.from,
    slotKey: asString(row.slot_key),
    status: asString(row.status) ?? "confirmed",
    sourceType: (asString(row.source_type) as CanonicalCalendarEvent["sourceType"]) ?? "manual_block",
    sourceReference: asString(row.source_reference),
    isBlocking: Boolean(row.is_blocking),
    payload: (row.payload as JsonRecord | null) ?? {},
    connectionId: asString(row.connection_id),
  }));

  if (storedResult.error) throw storedResult.error;
  if (bookingsResult?.error) throw bookingsResult.error;
  if (roomSnapshotBookingsResult?.error) throw roomSnapshotBookingsResult.error;

  const bookingRows = new Map<string, JsonRecord>();
  for (const row of ((bookingsResult?.data ?? []) as JsonRecord[])) {
    const bookingId = asString(row.id);
    if (bookingId) {
      bookingRows.set(bookingId, row);
    }
  }
  for (const row of ((roomSnapshotBookingsResult?.data ?? []) as JsonRecord[])) {
    const bookingId = asString(row.id);
    if (bookingId && !bookingRows.has(bookingId)) {
      bookingRows.set(bookingId, row);
    }
  }

  const bookingDerived =
    input.ownerType === "host" || input.ownerType === "stay_unit"
      ? [...bookingRows.values()].flatMap((row) => {
          const status = asString(row.status) ?? "pending";
          const paymentStatus = asString(row.payment_status);
          const startDate = normalizedDate(asString(row.start_date)) ?? input.from;
          const endDate = normalizedDate(asString(row.end_date)) ?? startDate;
          const slotKey = asString(row.quarter_type);
          const bookingId = asString(row.id) ?? "";
          const holdExpiresAt = asString(row.hold_expires_at);
          const stayUnitId = resolveStayUnitId(row);
          if (!bookingId || status === "cancelled" || status === "cancelled_by_user" || status === "cancelled_by_partner") {
            return [];
          }

          if (input.ownerType === "stay_unit" && stayUnitId && stayUnitId !== input.ownerId) {
            return [];
          }

          if (!isHostBookingInventoryBlocking(status, paymentStatus)) {
            return [];
          }

          return [
            {
              eventUid: toCalendarEventUid("internal_booking", bookingId, startDate, slotKey),
              ownerType: input.ownerType,
              ownerId: input.ownerId,
              bookingId,
              title: "Famlo booking",
              startDate,
              endDate,
              slotKey,
              status: "confirmed",
              sourceType: "internal_booking" as const,
              sourceReference: bookingId,
              isBlocking: true,
              payload: {
                payment_status: paymentStatus,
                hold_expires_at: holdExpiresAt,
              },
            },
          ];
        })
      : [];

  const merged = new Map<string, CanonicalCalendarEvent>();
  for (const event of [...bookingDerived, ...stored]) {
    merged.set(event.eventUid, event);
  }
  return [...merged.values()];
}

export async function upsertCalendarEvent(
  supabase: SupabaseClient,
  event: CanonicalCalendarEvent
): Promise<void> {
  const payload = {
    owner_type: event.ownerType,
    owner_id: event.ownerId,
    booking_id: event.bookingId ?? null,
    connection_id: event.connectionId ?? null,
    event_uid: event.eventUid,
    source_type: event.sourceType,
    source_reference: event.sourceReference ?? null,
    title: event.title,
    start_date: event.startDate,
    end_date: event.endDate,
    slot_key: event.slotKey ?? null,
    status: event.status,
    is_blocking: event.isBlocking,
    payload: event.payload ?? {},
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("calendar_events").upsert(payload, { onConflict: "owner_type,owner_id,event_uid" });
  if (error) throw error;
}

export async function logCalendarSync(
  supabase: SupabaseClient,
  input: CalendarSyncLogInput
): Promise<string | null> {
  const payload = {
    connection_id: input.connectionId ?? null,
    owner_type: input.ownerType,
    owner_id: input.ownerId,
    provider: input.provider,
    direction: input.direction,
    status: input.status,
    started_at: new Date().toISOString(),
    completed_at: input.status === "running" ? null : new Date().toISOString(),
    events_seen: input.eventsSeen ?? 0,
    events_applied: input.eventsApplied ?? 0,
    conflicts_found: input.conflictsFound ?? 0,
    message: input.message ?? null,
    payload: input.payload ?? {},
  };

  const { data, error } = await supabase.from("calendar_sync_logs").insert(payload).select("id").single();
  if (error) throw error;
  return asString(data?.id);
}

export async function createCalendarConflict(
  supabase: SupabaseClient,
  input: {
    ownerType: string;
    ownerId: string;
    bookingId?: string | null;
    calendarEventId?: string | null;
    syncLogId?: string | null;
    conflictType: string;
    summary: string;
    details?: JsonRecord;
  }
): Promise<void> {
  const { error } = await supabase.from("calendar_conflicts").insert({
    owner_type: input.ownerType,
    owner_id: input.ownerId,
    booking_id: input.bookingId ?? null,
    calendar_event_id: input.calendarEventId ?? null,
    sync_log_id: input.syncLogId ?? null,
    conflict_type: input.conflictType,
    summary: input.summary,
    details: input.details ?? {},
  });
  if (error) throw error;
}

export function generateIcs(events: CanonicalCalendarEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Famlo//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const event of events) {
    const start = event.startDate.replace(/-/g, "");
    const endDate = new Date(`${event.endDate}T00:00:00`);
    endDate.setDate(endDate.getDate() + 1);
    const end = (endDate.toISOString().split("T")[0] ?? event.endDate).replace(/-/g, "");
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.eventUid}`);
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`);
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    lines.push(`DTEND;VALUE=DATE:${end}`);
    lines.push(`SUMMARY:${event.title.replace(/\n/g, " ")}`);
    lines.push(`STATUS:${event.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function parseIcs(input: string): Array<{
  uid: string;
  startDate: string;
  endDate: string;
  summary: string;
}> {
  const blocks = input.split("BEGIN:VEVENT").slice(1);
  return blocks
    .map((block) => {
      const uid = /UID:(.+)/.exec(block)?.[1]?.trim() ?? crypto.randomUUID();
      const dtStartRaw = /DTSTART(?:;VALUE=DATE)?:(.+)/.exec(block)?.[1]?.trim() ?? "";
      const dtEndRaw = /DTEND(?:;VALUE=DATE)?:(.+)/.exec(block)?.[1]?.trim() ?? "";
      const summary = /SUMMARY:(.+)/.exec(block)?.[1]?.trim() ?? "Imported booking";
      const startDate = `${dtStartRaw.slice(0, 4)}-${dtStartRaw.slice(4, 6)}-${dtStartRaw.slice(6, 8)}`;
      const endExclusive = `${dtEndRaw.slice(0, 4)}-${dtEndRaw.slice(4, 6)}-${dtEndRaw.slice(6, 8)}`;
      const endDateValue = new Date(`${endExclusive}T00:00:00`);
      endDateValue.setDate(endDateValue.getDate() - 1);
      return {
        uid,
        startDate,
        endDate: endDateValue.toISOString().split("T")[0] ?? startDate,
        summary,
      };
    })
    .filter((row) => row.startDate && row.endDate);
}

export function eventsOverlap(left: CanonicalCalendarEvent, right: CanonicalCalendarEvent): boolean {
  const leftDates = new Set(enumerateDateRange(left.startDate, left.endDate));
  const rightDates = enumerateDateRange(right.startDate, right.endDate);
  return rightDates.some((date) => {
    if (!leftDates.has(date)) return false;
    if (!left.slotKey || !right.slotKey) return true;
    return left.slotKey === right.slotKey;
  });
}
