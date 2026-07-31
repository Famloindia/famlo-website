import { NextRequest, NextResponse } from "next/server";

import { listCancellationCases, updateCancellationByServiceExecutive } from "@/lib/cancellations/operations";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { verifyTeamSession } from "@/lib/team-auth";

export async function GET(): Promise<NextResponse> {
  const member = await verifyTeamSession();
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ cases: await listCancellationCases(createAdminSupabaseClient()) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load cancellation requests." }, { status: 500 });
  }
}
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const member = await verifyTeamSession();
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = await request.json() as { requestId?: string; action?: Parameters<typeof updateCancellationByServiceExecutive>[1]["action"]; notes?: string };
    if (!body.requestId || !body.action) return NextResponse.json({ error: "requestId and action are required." }, { status: 400 });
    const result = await updateCancellationByServiceExecutive(createAdminSupabaseClient(), {
      requestId: body.requestId,
      actorId: member.id,
      action: body.action,
      notes: body.notes,
    });
    return NextResponse.json({ success: true, cancellationRequest: result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update cancellation request." }, { status: 409 });
  }
}
