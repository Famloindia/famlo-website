import { NextRequest, NextResponse } from "next/server";

import { syncImportedCalendar } from "@/lib/booking-platform";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const ownerId = String(request.nextUrl.searchParams.get("ownerId") ?? "").trim();
    const ownerType = String(request.nextUrl.searchParams.get("ownerType") ?? "host").trim() || "host";
    if (!ownerId) {
      return NextResponse.json({ error: "ownerId is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { ownerType, ownerId });
    if (!hostAccess) {
      return NextResponse.json({ error: "You do not have access to this channel manager." }, { status: 403 });
    }
    const [connections, syncLogs, conflicts] = await Promise.all([
      supabase.from("calendar_connections").select("*").eq("owner_type", ownerType).eq("owner_id", ownerId).order("updated_at", { ascending: false }),
      supabase.from("calendar_sync_logs").select("*").eq("owner_type", ownerType).eq("owner_id", ownerId).order("started_at", { ascending: false }).limit(50),
      supabase.from("calendar_conflicts").select("*").eq("owner_type", ownerType).eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(50),
    ]);
    if (connections.error) throw connections.error;
    if (syncLogs.error) throw syncLogs.error;
    if (conflicts.error) throw conflicts.error;

    return NextResponse.json({
      connections: connections.data ?? [],
      syncLogs: syncLogs.data ?? [],
      conflicts: conflicts.data ?? [],
      exportUrl: `/api/host/calendar/export?ownerType=${encodeURIComponent(ownerType)}&ownerId=${encodeURIComponent(ownerId)}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load channel manager." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      ownerType?: string;
      ownerId?: string;
      provider?: string;
      sourceLabel?: string;
      externalUrl?: string | null;
      icsContent?: string | null;
    };
    const ownerType = String(body.ownerType ?? "host").trim() || "host";
    const ownerId = String(body.ownerId ?? "").trim();
    if (!ownerId) {
      return NextResponse.json({ error: "ownerId is required." }, { status: 400 });
    }

    let icsContent = String(body.icsContent ?? "").trim();
    if (!icsContent && body.externalUrl) {
      const response = await fetch(String(body.externalUrl));
      if (!response.ok) {
        throw new Error(`Failed to fetch ICS from source URL (${response.status}).`);
      }
      icsContent = await response.text();
    }
    if (!icsContent) {
      return NextResponse.json({ error: "ICS content or externalUrl is required." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const hostAccess = await resolveAuthorizedHostResource(supabase, request, { ownerType, ownerId });
    if (!hostAccess) {
      return NextResponse.json({ error: "You do not have access to this channel manager." }, { status: 403 });
    }
    const result = await syncImportedCalendar(supabase, {
      ownerType,
      ownerId,
      provider: String(body.provider ?? "manual_ics"),
      sourceLabel: String(body.sourceLabel ?? body.provider ?? "manual_ics"),
      externalUrl: body.externalUrl ?? null,
      icsContent,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync channel." },
      { status: 500 }
    );
  }
}
