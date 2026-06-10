import { NextRequest, NextResponse } from "next/server";

import {
  loadChannelFinanceSettings,
  saveChannelFinanceSettings,
  type ChannelFinanceSettings,
} from "@/lib/channel-finance-settings";
import { resolveAuthorizedHostResource } from "@/lib/host-access";
import { createAdminSupabaseClient } from "@/lib/supabase";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function authorizeFamily(request: Request, familyId: string) {
  const supabase = createAdminSupabaseClient();
  const authorizedResource = await resolveAuthorizedHostResource(supabase, request, { familyId });
  if (!authorizedResource?.familyId) {
    return { supabase, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { supabase, error: null };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const familyId = asString(request.nextUrl.searchParams.get("familyId"));
    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }

    const { supabase, error } = await authorizeFamily(request, familyId);
    if (error) return error;

    const settings = await loadChannelFinanceSettings(supabase, familyId);
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("[host.pro.channel-finance] load failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Channel Finance settings." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { familyId?: unknown; settings?: ChannelFinanceSettings };
    const familyId = asString(body.familyId);
    if (!familyId) {
      return NextResponse.json({ error: "familyId is required." }, { status: 400 });
    }
    if (!body.settings) {
      return NextResponse.json({ error: "settings payload is required." }, { status: 400 });
    }

    const { supabase, error } = await authorizeFamily(request, familyId);
    if (error) return error;

    const settings = await saveChannelFinanceSettings(supabase, familyId, body.settings);
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("[host.pro.channel-finance] save failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save Channel Finance settings." },
      { status: 500 }
    );
  }
}
