import { NextResponse } from "next/server";

import { requireHostSettingsSession, requireOwnedFamily } from "@/lib/host-settings-auth";
import { hashRequestIp } from "@/lib/host-whatsapp-settings";
import { assertSameOrigin, getRequestIp } from "@/lib/request-security";
import { createAdminSupabaseClient } from "@/lib/supabase";

function familyIdFromRequest(request: Request): string {
  return new URL(request.url).searchParams.get("familyId")?.trim() ?? "";
}
export async function GET(request: Request): Promise<NextResponse> {
  const supabase = createAdminSupabaseClient();
  try {
    const session = await requireHostSettingsSession(supabase, request);
    const familyId = familyIdFromRequest(request);
    if (!familyId) return NextResponse.json({ error: "Family ID is required." }, { status: 400 });
    await requireOwnedFamily(supabase, session, familyId);
    const { data, error } = await supabase
      .from("families")
      .select("booking_requires_host_approval")
      .eq("id", familyId)
      .single();
    if (error) throw error;
    return NextResponse.json({ bookingRequiresHostApproval: Boolean(data.booking_requires_host_approval) });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "booking_preference_error";
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load booking preference.", code },
      { status: code === "unauthorized" ? 401 : code === "forbidden" ? 403 : 400 }
    );
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const supabase = createAdminSupabaseClient();
  try {
    assertSameOrigin(request);
    const session = await requireHostSettingsSession(supabase, request);
    const body = (await request.json()) as { familyId?: unknown; enabled?: unknown };
    const familyId = typeof body.familyId === "string" ? body.familyId.trim() : "";
    if (!familyId || typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Family ID and enabled state are required." }, { status: 400 });
    }
    await requireOwnedFamily(supabase, session, familyId);
    const { data: current, error: currentError } = await supabase
      .from("families")
      .select("booking_requires_host_approval")
      .eq("id", familyId)
      .single();
    if (currentError) throw currentError;

    const { error: familyError } = await supabase
      .from("families")
      .update({ booking_requires_host_approval: body.enabled } as never)
      .eq("id", familyId)
      .eq("user_id", session.hostUserId);
    if (familyError) throw familyError;
    const { error: hostError } = await supabase
      .from("hosts")
      .update({ booking_requires_host_approval: body.enabled } as never)
      .eq("legacy_family_id", familyId)
      .eq("user_id", session.hostUserId);
    if (hostError) throw hostError;
    const { error: auditError } = await supabase.from("host_property_preference_audit_log").insert({
      host_user_id: session.hostUserId,
      family_id: familyId,
      preference: "booking_requires_host_approval",
      old_value: { enabled: Boolean(current.booking_requires_host_approval) },
      new_value: { enabled: body.enabled },
      source: "dashboard",
      ip_hash: hashRequestIp(getRequestIp(request)),
    } as never);
    if (auditError) throw auditError;
    return NextResponse.json({ bookingRequiresHostApproval: body.enabled });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "booking_preference_error";
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update booking preference.", code },
      { status: code === "unauthorized" ? 401 : code === "forbidden" ? 403 : 400 }
    );
  }
}
