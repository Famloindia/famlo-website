import { NextResponse } from "next/server";

import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

async function authorize(request: Request, familyId: string) {
  const supabase = createAdminSupabaseClient();
  const access = await resolveAuthorizedHostResource(supabase, request, { familyId });
  return { supabase, access };
}

export async function GET(request: Request): Promise<NextResponse> {
  const familyId = new URL(request.url).searchParams.get("familyId")?.trim() ?? "";
  if (!familyId) return NextResponse.json({ error: "Family is required." }, { status: 400 });
  const { supabase, access } = await authorize(request, familyId);
  if (!access?.hostUserId) return NextResponse.json({ error: "Host session required." }, { status: 403 });
  const { data, error } = await supabase
    .from("operational_notifications")
    .select("id,event_type,title,message,cta_url,read_at,created_at,booking_id")
    .eq("recipient_role", "host")
    .eq("recipient_user_id", access.hostUserId)
    .eq("family_id", familyId)
    .lte("visible_after", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "Notifications could not be loaded." }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as { familyId?: unknown; notificationId?: unknown };
  const familyId = typeof body.familyId === "string" ? body.familyId.trim() : "";
  const notificationId = typeof body.notificationId === "string" ? body.notificationId.trim() : null;
  if (!familyId) return NextResponse.json({ error: "Family is required." }, { status: 400 });
  const { supabase, access } = await authorize(request, familyId);
  if (!access?.hostUserId) return NextResponse.json({ error: "Host session required." }, { status: 403 });
  let query = supabase
    .from("operational_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_role", "host")
    .eq("recipient_user_id", access.hostUserId)
    .eq("family_id", familyId)
    .is("read_at", null);
  if (notificationId) query = query.eq("id", notificationId);
  const { error } = await query;
  if (error) return NextResponse.json({ error: "Notification could not be updated." }, { status: 500 });
  return NextResponse.json({ success: true });
}
