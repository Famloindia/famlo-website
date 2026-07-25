import { NextRequest, NextResponse } from "next/server";

import { triggerQueuedChannexSyncWorker } from "@/lib/channex-ari-jobs";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { isFamloProDashboardEnabled, loadHostProAccess } from "@/lib/host-pro-access";
import { canCreateManualPmsBooking, createManualPmsBooking } from "@/lib/manual-pms-bookings";
import { createAdminSupabaseClient } from "@/lib/supabase";

type ManualBookingRequest = {
  familyId?: string;
  stayUnitId?: string;
  guestName?: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
  checkInDate?: string;
  checkOutDate?: string;
  notes?: string | null;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as ManualBookingRequest;
    const familyId = String(body.familyId ?? "").trim();
    const stayUnitId = String(body.stayUnitId ?? "").trim();
    const guestName = String(body.guestName ?? "").trim();
    const checkInDate = String(body.checkInDate ?? "").trim();
    const checkOutDate = String(body.checkOutDate ?? "").trim();

    if (!familyId || !stayUnitId || !guestName || !checkInDate || !checkOutDate) {
      return NextResponse.json(
        { error: "familyId, stayUnitId, guestName, checkInDate, and checkOutDate are required." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });
    if (
      !authorizedResource?.familyId ||
      authorizedResource.familyId !== familyId ||
      !authorizedResource.hostId ||
      !authorizedResource.hostUserId
    ) {
      return NextResponse.json({ error: "You do not have access to this property." }, { status: 403 });
    }

    const { data: stayUnitRow, error: stayUnitError } = await supabase
      .from("stay_units_v2")
      .select("id,legacy_family_id")
      .eq("id", stayUnitId)
      .maybeSingle();
    if (stayUnitError) {
      throw stayUnitError;
    }
    if (!stayUnitRow?.id || stayUnitRow.legacy_family_id !== familyId) {
      return NextResponse.json({ error: "You do not have access to this stay unit." }, { status: 403 });
    }

    const proAccess = await loadHostProAccess(supabase, familyId);
    const access = canCreateManualPmsBooking({
      dashboardEnabled: isFamloProDashboardEnabled(),
      isAdmin: authorizedResource.isAdmin,
      famloProAllowed: proAccess.allowed,
    });
    if (!access.ok) {
      return NextResponse.json({ error: access.reason }, { status: 403 });
    }

    const result = await createManualPmsBooking(supabase, {
      actorUserId: authorizedResource.hostUserId,
      actorRole: authorizedResource.isAdmin ? "admin" : "host",
      familyId,
      hostId: authorizedResource.hostId,
      stayUnitId,
      guestName,
      guestEmail: body.guestEmail ?? null,
      guestPhone: body.guestPhone ?? null,
      checkInDate,
      checkOutDate,
      notes: body.notes ?? null,
    });
    const stagingWorkerTriggered =
      result.queuedJobIds.length > 0
        ? await triggerQueuedChannexSyncWorker({
            requestUrl: request.url,
            workerId: "manual-pms-booking",
            limit: result.queuedJobIds.length,
          })
        : false;

    return NextResponse.json({
      ok: true,
      bookingId: result.bookingId,
      reservationId: result.reservationId,
      queuedJobIds: result.queuedJobIds,
      stagingWorkerTriggered,
      warnings: result.warnings,
      message:
        result.queuedJobIds.length > 0
          ? "Manual PMS booking created and Channex availability sync queued."
          : "Manual PMS booking created. Channex availability sync was not queued.",
      sourceChannel: "pms_manual",
    });
  } catch (error) {
    console.error("[host.pro.bookings.manual] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create manual PMS booking." },
      { status: 500 }
    );
  }
}
