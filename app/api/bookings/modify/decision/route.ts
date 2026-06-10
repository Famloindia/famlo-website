import { NextRequest, NextResponse } from "next/server";

import { getErrorMessage } from "@/lib/error-utils";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { asString, type JsonRecord } from "@/lib/platform-utils";
import { decideBookingModification } from "@/lib/reservation-modifications";
import { createAdminSupabaseClient } from "@/lib/supabase";

type ModificationDecisionRequest = {
  modificationId?: string;
  decision?: "apply" | "reject";
};

function firstObject(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" && !Array.isArray(first) ? (first as JsonRecord) : null;
  }
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as ModificationDecisionRequest;
    const modificationId = String(body.modificationId ?? "").trim();
    const decision = body.decision ?? "apply";
    if (!modificationId) {
      return NextResponse.json({ error: "modificationId is required." }, { status: 400 });
    }
    if (decision !== "apply" && decision !== "reject") {
      return NextResponse.json({ error: "decision must be apply or reject." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: modification, error: modificationError } = await supabase
      .from("booking_modifications_v2")
      .select("id,booking_id,bookings_v2(id,host_id,hosts(legacy_family_id))")
      .eq("id", modificationId)
      .maybeSingle();
    if (modificationError) throw modificationError;
    if (!modification?.id) {
      return NextResponse.json({ error: "Modification request not found." }, { status: 404 });
    }

    const booking = firstObject((modification as JsonRecord).bookings_v2);
    const host = firstObject(booking?.hosts);
    const hostId = asString(booking?.host_id);
    const familyId = asString(host?.legacy_family_id);
    const hostAccess = await resolveAuthorizedHostResource(
      supabase,
      request,
      hostId ? { hostId } : { familyId }
    );
    if (!hostAccess) {
      return NextResponse.json({ error: "You do not have access to this booking modification." }, { status: 403 });
    }

    const result = await decideBookingModification(supabase, {
      modificationId,
      decision,
      actorUserId: hostAccess.hostUserId ?? null,
      actorRole: hostAccess.isAdmin ? "admin" : "host",
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("[bookings.modify.decision] failed:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Could not process this modification request.") },
      { status: 500 }
    );
  }
}
