import { NextRequest, NextResponse } from "next/server";

import { getErrorMessage } from "@/lib/error-utils";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { asString, type JsonRecord } from "@/lib/platform-utils";
import { reassignReservation } from "@/lib/reservation-reassignment";
import { createAdminSupabaseClient } from "@/lib/supabase";

type ReassignmentRequest = {
  reservationId?: string;
  stayUnitId?: string;
  reason?: string | null;
};

function resourceParamsForReservation(reservation: JsonRecord, targetStayUnitId: string): {
  familyId?: string | null;
  hostId?: string | null;
  ownerType?: string | null;
  ownerId?: string | null;
} {
  const familyId = asString(reservation.family_id);
  if (familyId) return { familyId };
  const hostId = asString(reservation.host_id);
  if (hostId) return { hostId };
  return { ownerType: "stay_unit", ownerId: targetStayUnitId };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as ReassignmentRequest;
    const reservationId = String(body.reservationId ?? "").trim();
    const stayUnitId = String(body.stayUnitId ?? "").trim();
    const reason = asString(body.reason) ?? "Operator reassignment";

    if (!reservationId) {
      return NextResponse.json({ error: "reservationId is required." }, { status: 400 });
    }
    if (!stayUnitId) {
      return NextResponse.json({ error: "stayUnitId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: reservation, error: reservationError } = await supabase
      .from("reservations_v2")
      .select("id,family_id,host_id,booking_id,stay_unit_id,assignment_status,operational_status")
      .eq("id", reservationId)
      .maybeSingle();
    if (reservationError) throw reservationError;
    if (!reservation?.id) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }

    const hostAccess = await resolveAuthorizedHostResource(
      supabase,
      request,
      resourceParamsForReservation(reservation as JsonRecord, stayUnitId)
    );
    if (!hostAccess) {
      return NextResponse.json({ error: "You do not have access to this reservation." }, { status: 403 });
    }

    const result = await reassignReservation(supabase, {
      reservationId,
      stayUnitId,
      reason,
      actorUserId: hostAccess.hostUserId ?? null,
      actorRole: hostAccess.isAdmin ? "admin" : "host",
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("[host.reservations.reassign] failed:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Could not reassign this reservation.") },
      { status: 500 }
    );
  }
}
