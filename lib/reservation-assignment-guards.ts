import type { SupabaseClient } from "@supabase/supabase-js";

import { projectInventoryRange } from "@/lib/inventory";
import { asString, type JsonRecord } from "@/lib/platform-utils";

function isSchemaCompatibilityError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  return (
    record.code === "42P01" ||
    record.code === "42703" ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("relation")
  );
}

async function stayUnitExists(supabase: SupabaseClient, stayUnitId: string | null | undefined): Promise<boolean> {
  const cleanStayUnitId = asString(stayUnitId);
  if (!cleanStayUnitId) return false;
  const { data, error } = await supabase
    .from("stay_units_v2")
    .select("id")
    .eq("id", cleanStayUnitId)
    .maybeSingle();
  if (error) {
    if (isSchemaCompatibilityError(error)) return false;
    throw error;
  }
  return Boolean(data?.id);
}

export async function assertBookingHasAssignedReservation(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{ reservationId: string; stayUnitId: string }> {
  const { data, error } = await supabase
    .from("reservations_v2")
    .select("id,stay_unit_id,assignment_status")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error) {
    if (isSchemaCompatibilityError(error)) {
      throw new Error("Reservation assignment records are not available yet.");
    }
    throw error;
  }

  const reservation = (data ?? null) as JsonRecord | null;
  const reservationId = asString(reservation?.id);
  const stayUnitId = asString(reservation?.stay_unit_id);
  const assignmentStatus = asString(reservation?.assignment_status);
  if (!reservationId || !stayUnitId || assignmentStatus !== "assigned") {
    throw new Error("Assign a valid room to this reservation before check-in.");
  }
  if (!(await stayUnitExists(supabase, stayUnitId))) {
    throw new Error("The assigned room no longer exists. Reassign this reservation before check-in.");
  }

  return { reservationId, stayUnitId };
}

export async function projectInventoryRangeIfStayUnitExists(
  supabase: SupabaseClient,
  input: { familyId: string; stayUnitId: string | null | undefined; from: string; to: string }
): Promise<void> {
  const stayUnitId = asString(input.stayUnitId);
  if (!stayUnitId) return;
  if (!(await stayUnitExists(supabase, stayUnitId))) return;
  await projectInventoryRange(supabase, {
    familyId: input.familyId,
    stayUnitId,
    from: input.from,
    to: input.to,
  });
}
