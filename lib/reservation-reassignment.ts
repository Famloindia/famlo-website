import type { SupabaseClient } from "@supabase/supabase-js";

import { enqueueBookingInventoryAriSyncJobs } from "@/lib/channex-ari-jobs";
import { appendInventoryEvent, assertCanonicalInventoryAvailability, projectInventoryRange } from "@/lib/inventory";
import { asString, getStayNightDateRange, type JsonRecord } from "@/lib/platform-utils";

type ReservationReassignmentRow = {
  id: string;
  booking_id: string | null;
  family_id: string | null;
  host_id: string | null;
  stay_unit_id: string | null;
  assignment_status: string | null;
  operational_status: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
};

type StayUnitReassignmentRow = {
  id: string;
  host_id: string | null;
  legacy_family_id: string | null;
};

function normalizeDate(value: unknown): string | null {
  const clean = asString(value);
  if (!clean) return null;
  const date = clean.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function isClosedOperationalStatus(status: string | null | undefined): boolean {
  return ["checked_in", "checked_out", "completed", "cancelled", "no_show"].includes(
    String(status ?? "").trim().toLowerCase()
  );
}

async function loadReservation(
  supabase: SupabaseClient,
  reservationId: string
): Promise<ReservationReassignmentRow> {
  const { data, error } = await supabase
    .from("reservations_v2")
    .select("id,booking_id,family_id,host_id,stay_unit_id,assignment_status,operational_status,check_in_date,check_out_date")
    .eq("id", reservationId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("Reservation not found.");
  return data as ReservationReassignmentRow;
}

async function loadStayUnit(
  supabase: SupabaseClient,
  stayUnitId: string
): Promise<StayUnitReassignmentRow> {
  const { data, error } = await supabase
    .from("stay_units_v2")
    .select("id,host_id,legacy_family_id")
    .eq("id", stayUnitId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("Target room no longer exists.");
  return data as StayUnitReassignmentRow;
}

async function reprojectReassignmentInventory(
  supabase: SupabaseClient,
  input: {
    familyId: string | null;
    oldStayUnitId: string | null;
    newStayUnitId: string;
    startDate: string | null;
    endDate: string | null;
    bookingId: string | null;
    actorUserId?: string | null;
    actorRole?: string | null;
  }
): Promise<void> {
  if (!input.familyId || !input.startDate || !input.endDate) return;
  const stayNightRange = getStayNightDateRange(input.startDate, input.endDate);
  if (!stayNightRange) return;
  const ranges = [
    { stayUnitId: input.oldStayUnitId, from: stayNightRange.from, to: stayNightRange.to },
    { stayUnitId: input.newStayUnitId, from: stayNightRange.from, to: stayNightRange.to },
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
    eventSource: "reservation_reassignment",
    sourceReference: input.bookingId ?? null,
    effectiveDateStart: stayNightRange.from,
    effectiveDateEnd: stayNightRange.to,
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
    payload: {
      booking_id: input.bookingId,
      old_stay_unit_id: input.oldStayUnitId,
      new_stay_unit_id: input.newStayUnitId,
      reason: "reservation_reassignment",
    },
  });

  const stayUnitIds = [...new Set([input.oldStayUnitId, input.newStayUnitId].filter((value): value is string => Boolean(value)))];
  await enqueueBookingInventoryAriSyncJobs(supabase, {
    familyId: input.familyId,
    stayUnitIds,
    dateFrom: stayNightRange.from,
    dateTo: stayNightRange.to,
    certificationScenario: "booking_modify",
    sourceUiAction: "Famlo PMS reservation reassignment",
    sourceRoute: "reservation_reassignment",
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
  });
}

export async function reassignReservation(
  supabase: SupabaseClient,
  input: {
    reservationId: string;
    stayUnitId: string;
    actorUserId?: string | null;
    actorRole?: string | null;
    reason?: string | null;
  }
): Promise<JsonRecord> {
  const reservation = await loadReservation(supabase, input.reservationId);
  if (isClosedOperationalStatus(reservation.operational_status)) {
    throw new Error("Only pre-arrival reservations can be reassigned safely.");
  }

  const stayUnit = await loadStayUnit(supabase, input.stayUnitId);
  const familyId = reservation.family_id ?? stayUnit.legacy_family_id;
  if (!familyId) {
    throw new Error("Could not resolve the reservation property for reassignment.");
  }
  if (reservation.family_id && stayUnit.legacy_family_id && reservation.family_id !== stayUnit.legacy_family_id) {
    throw new Error("Target room belongs to a different property.");
  }

  const startDate = normalizeDate(reservation.check_in_date);
  const endDate = normalizeDate(reservation.check_out_date) ?? startDate;
  if (startDate && endDate) {
    await assertCanonicalInventoryAvailability(supabase, {
      familyId,
      stayUnitId: input.stayUnitId,
      startDate,
      endDate,
      excludeBookingId: reservation.booking_id,
    });
  }

  const { data, error } = await supabase.rpc("reassign_reservation_v2", {
    p_reservation_id: input.reservationId,
    p_stay_unit_id: input.stayUnitId,
    p_actor_user_id: input.actorUserId ?? null,
    p_actor_role: input.actorRole ?? "operator",
    p_reason: input.reason ?? null,
  });
  if (error) throw error;

  await reprojectReassignmentInventory(supabase, {
    familyId,
    oldStayUnitId: reservation.stay_unit_id,
    newStayUnitId: input.stayUnitId,
    startDate,
    endDate,
    bookingId: reservation.booking_id,
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
  });

  return (data && typeof data === "object" && !Array.isArray(data) ? (data as JsonRecord) : { ok: true }) as JsonRecord;
}
