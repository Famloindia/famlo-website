import type { SupabaseClient } from "@supabase/supabase-js";

import { syncBookingCalendarIndexBestEffort } from "@/lib/booking-calendar-index";
import { enqueueBookingInventoryAriSyncJobs } from "@/lib/channex-ari-jobs";
import { appendInventoryEvent, assertCanonicalInventoryAvailability, projectInventoryRange } from "@/lib/inventory";
import { asNumber, asString, getStayNightDateRange, type JsonRecord } from "@/lib/platform-utils";

type ModificationDecision = "apply" | "reject";

type BookingRow = {
  id: string;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  quarter_type: string | null;
  total_price: number | null;
  pricing_snapshot: JsonRecord | null;
  host_id: string | null;
  hosts?: JsonRecord | JsonRecord[] | null;
};

type ReservationRow = {
  id: string;
  family_id: string | null;
  stay_unit_id: string | null;
  assignment_status: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
};

function asObject(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function firstObject(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) return asObject(value[0]);
  return asObject(value);
}

function normalizeDate(value: unknown): string | null {
  const clean = asString(value);
  if (!clean) return null;
  const date = clean.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function isCanonicalDayInventoryEligible(quarterType: string | null | undefined): boolean {
  const normalized = asString(quarterType)?.toLowerCase();
  return !normalized || normalized === "fullday";
}

function pickRequestedString(snapshot: JsonRecord, camelKey: string, snakeKey: string): string | null {
  return asString(snapshot[camelKey]) ?? asString(snapshot[snakeKey]);
}

async function loadModificationContext(
  supabase: SupabaseClient,
  modificationId: string
): Promise<{
  modification: JsonRecord;
  booking: BookingRow;
  reservation: ReservationRow;
}> {
  const { data: modification, error: modificationError } = await supabase
    .from("booking_modifications_v2")
    .select("*")
    .eq("id", modificationId)
    .maybeSingle();
  if (modificationError) throw modificationError;
  if (!modification?.id) throw new Error("Modification request not found.");

  const bookingId = asString((modification as JsonRecord).booking_id);
  if (!bookingId) throw new Error("Modification request is missing its booking.");

  const { data: booking, error: bookingError } = await supabase
    .from("bookings_v2")
    .select("id,status,start_date,end_date,quarter_type,total_price,pricing_snapshot,host_id,hosts(legacy_family_id)")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking?.id) throw new Error("Booking not found for modification.");

  const { data: reservation, error: reservationError } = await supabase
    .from("reservations_v2")
    .select("id,family_id,stay_unit_id,assignment_status,check_in_date,check_out_date")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (reservationError) throw reservationError;
  if (!reservation?.id) throw new Error("Reservation not found for modification. Run reservation backfill first.");

  return {
    modification: modification as JsonRecord,
    booking: booking as BookingRow,
    reservation: reservation as ReservationRow,
  };
}

async function loadStayUnitFamily(
  supabase: SupabaseClient,
  stayUnitId: string
): Promise<{ stayUnitId: string; familyId: string | null }> {
  const { data, error } = await supabase
    .from("stay_units_v2")
    .select("id,legacy_family_id")
    .eq("id", stayUnitId)
    .maybeSingle();
  if (error) throw error;
  const resolvedStayUnitId = asString((data as JsonRecord | null)?.id);
  if (!resolvedStayUnitId) {
    throw new Error("Requested room no longer exists. Reassign the reservation before applying this modification.");
  }
  return {
    stayUnitId: resolvedStayUnitId,
    familyId: asString((data as JsonRecord | null)?.legacy_family_id),
  };
}

async function validateModificationInventory(
  supabase: SupabaseClient,
  input: {
    modification: JsonRecord;
    booking: BookingRow;
    reservation: ReservationRow;
  }
): Promise<{
  bookingId: string;
  familyId: string | null;
  oldStayUnitId: string | null;
  newStayUnitId: string;
  oldStartDate: string;
  oldEndDate: string;
  newStartDate: string;
  newEndDate: string;
  newQuarterType: string | null;
}> {
  const requested = asObject(input.modification.requested_snapshot) ?? {};
  const pricingSnapshot = asObject(input.booking.pricing_snapshot) ?? {};
  const bookingId = asString(input.booking.id) ?? "";
  const requestedStayUnitId =
    pickRequestedString(requested, "stayUnitId", "stay_unit_id") ??
    asString(input.reservation.stay_unit_id) ??
    asString(pricingSnapshot.stay_unit_id);
  if (!requestedStayUnitId) {
    throw new Error("Reservation is unassigned. Assign a valid room before applying this modification.");
  }

  const { stayUnitId: newStayUnitId, familyId: stayUnitFamilyId } = await loadStayUnitFamily(supabase, requestedStayUnitId);
  const hostRelation = firstObject(input.booking.hosts);
  const familyId = asString(input.reservation.family_id) ?? stayUnitFamilyId ?? asString(hostRelation?.legacy_family_id);
  if (!familyId) {
    throw new Error("Could not resolve the reservation property for inventory validation.");
  }

  const oldStartDate = normalizeDate(input.booking.start_date) ?? normalizeDate(input.reservation.check_in_date);
  const oldEndDate = normalizeDate(input.booking.end_date) ?? normalizeDate(input.reservation.check_out_date) ?? oldStartDate;
  const newStartDate = normalizeDate(pickRequestedString(requested, "startDate", "start_date")) ?? oldStartDate;
  const newEndDate = normalizeDate(pickRequestedString(requested, "endDate", "end_date")) ?? newStartDate;
  if (!oldStartDate || !oldEndDate || !newStartDate || !newEndDate) {
    throw new Error("Modification is missing valid stay dates.");
  }
  if (newEndDate < newStartDate) {
    throw new Error("Modified checkout date cannot be before check-in date.");
  }

  const newQuarterType = pickRequestedString(requested, "quarterType", "quarter_type") ?? input.booking.quarter_type ?? null;
  if (isCanonicalDayInventoryEligible(newQuarterType)) {
    await assertCanonicalInventoryAvailability(supabase, {
      familyId,
      stayUnitId: newStayUnitId,
      startDate: newStartDate,
      endDate: newEndDate,
      excludeBookingId: bookingId,
    });
  }

  return {
    bookingId,
    familyId,
    oldStayUnitId: asString(input.reservation.stay_unit_id) ?? asString(pricingSnapshot.stay_unit_id),
    newStayUnitId,
    oldStartDate,
    oldEndDate,
    newStartDate,
    newEndDate,
    newQuarterType,
  };
}

async function reprojectModificationInventory(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    familyId: string | null;
    oldStayUnitId: string | null;
    newStayUnitId: string;
    oldStartDate: string;
    oldEndDate: string;
    newStartDate: string;
    newEndDate: string;
    source: string;
  }
): Promise<void> {
  if (!input.familyId) return;
  const syncWindow = resolveModificationInventorySyncWindow({
    oldStartDate: input.oldStartDate,
    oldEndDate: input.oldEndDate,
    newStartDate: input.newStartDate,
    newEndDate: input.newEndDate,
  });
  if (!syncWindow) return;
  const { oldStayNightRange, newStayNightRange, dateFrom, dateTo } = syncWindow;
  const ranges = [
    { stayUnitId: input.oldStayUnitId, from: oldStayNightRange.from, to: oldStayNightRange.to },
    { stayUnitId: input.newStayUnitId, from: newStayNightRange.from, to: newStayNightRange.to },
  ];
  for (const range of ranges) {
    if (!range.stayUnitId) continue;
    await projectInventoryRange(supabase, {
      familyId: input.familyId,
      stayUnitId: range.stayUnitId,
      from: range.from,
      to: range.to,
    });
  }

  await appendInventoryEvent(supabase, {
    familyId: input.familyId,
    stayUnitId: input.newStayUnitId,
    eventType: "booking_modified",
    eventSource: input.source,
    sourceReference: input.bookingId,
    effectiveDateStart: newStayNightRange.from,
    effectiveDateEnd: newStayNightRange.to,
    payload: {
      booking_id: input.bookingId,
      old_stay_unit_id: input.oldStayUnitId,
      new_stay_unit_id: input.newStayUnitId,
      old_start_date: input.oldStartDate,
      old_end_date: input.oldEndDate,
      new_start_date: input.newStartDate,
      new_end_date: input.newEndDate,
    },
  });

  const stayUnitIds = [...new Set([input.oldStayUnitId, input.newStayUnitId].filter((value): value is string => Boolean(value)))];
  await enqueueBookingInventoryAriSyncJobs(supabase, {
    familyId: input.familyId,
    stayUnitIds,
    dateFrom,
    dateTo,
    certificationScenario: "booking_modify",
    sourceUiAction: "Famlo PMS booking modification apply",
    sourceRoute: input.source,
  });
}

export function resolveModificationInventorySyncWindow(input: {
  oldStartDate: string;
  oldEndDate: string;
  newStartDate: string;
  newEndDate: string;
}): {
  oldStayNightRange: { from: string; to: string; nights: string[] };
  newStayNightRange: { from: string; to: string; nights: string[] };
  dateFrom: string;
  dateTo: string;
} | null {
  const oldStayNightRange = getStayNightDateRange(input.oldStartDate, input.oldEndDate);
  const newStayNightRange = getStayNightDateRange(input.newStartDate, input.newEndDate);
  if (!oldStayNightRange || !newStayNightRange) return null;
  return {
    oldStayNightRange,
    newStayNightRange,
    dateFrom: oldStayNightRange.from < newStayNightRange.from ? oldStayNightRange.from : newStayNightRange.from,
    dateTo: oldStayNightRange.to > newStayNightRange.to ? oldStayNightRange.to : newStayNightRange.to,
  };
}

export async function decideBookingModification(
  supabase: SupabaseClient,
  input: {
    modificationId: string;
    decision: ModificationDecision;
    actorUserId?: string | null;
    actorRole?: string | null;
  }
): Promise<JsonRecord> {
  const context = await loadModificationContext(supabase, input.modificationId);
  const status = asString(context.modification.status) ?? "pending";
  if (status === "applied" || status === "rejected") {
    return {
      ok: true,
      status,
      modification_id: input.modificationId,
      replayed: true,
    };
  }

  let inventoryContext:
    | Awaited<ReturnType<typeof validateModificationInventory>>
    | null = null;
  if (input.decision === "apply") {
    inventoryContext = await validateModificationInventory(supabase, context);
  }

  const { data, error } = await supabase.rpc("apply_reservation_modification_v2", {
    p_modification_id: input.modificationId,
    p_actor_user_id: input.actorUserId ?? null,
    p_actor_role: input.actorRole ?? "operator",
    p_decision: input.decision,
  } as never);
  if (error) throw error;

  if (input.decision === "apply" && inventoryContext) {
    await reprojectModificationInventory(supabase, {
      ...inventoryContext,
      source: "modification_apply_engine",
    });
    await syncBookingCalendarIndexBestEffort(supabase, inventoryContext.bookingId, "reservation_modification_apply");
  }

  return ((data as JsonRecord | null) ?? {
    ok: true,
    status: input.decision === "apply" ? "applied" : "rejected",
    modification_id: input.modificationId,
  }) as JsonRecord;
}
