import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { shouldSkipChannexAriSync, syncChannexAriForFamily } from "@/lib/channex-ari-sync";
import { getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import { createAdminSupabaseClient } from "@/lib/supabase";

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  const bearer = request.headers.get("authorization");
  const query = request.nextUrl.searchParams.get("secret");

  if (secret && (bearer === `Bearer ${secret}` || query === secret)) {
    return true;
  }

  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

async function handleRequest(request: NextRequest): Promise<NextResponse> {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = getChannexConfigSummary();
    if (!config.configured) {
      return NextResponse.json(
        { ok: false, configured: false, error: "Channex configuration is incomplete." },
        { status: 503 }
      );
    }

    const familyIdFilter = request.nextUrl.searchParams.get("familyId")?.trim() || null;
    const force = request.nextUrl.searchParams.get("force") === "true";
    const now = new Date();
    const supabase = createAdminSupabaseClient();

    let propertiesQuery = supabase
      .from("channel_properties")
      .select("id,family_id,external_property_id,metadata,sync_status")
      .eq("provider_code", "channex")
      .not("external_property_id", "is", null)
      .order("updated_at", { ascending: false });

    if (familyIdFilter) {
      propertiesQuery = propertiesQuery.eq("family_id", familyIdFilter);
    }

    const { data: propertyRows, error: propertyError } = await propertiesQuery;
    if (propertyError) throw propertyError;

    const results: Array<Record<string, unknown>> = [];

    for (const propertyRow of propertyRows ?? []) {
      const familyId = asString(propertyRow.family_id);
      const externalPropertyId = asString(propertyRow.external_property_id);
      if (!familyId || !externalPropertyId) continue;

      const skip = !force ? shouldSkipChannexAriSync(asObject(propertyRow.metadata), now) : null;
      if (skip?.skip) {
        results.push({
          familyId,
          externalPropertyId,
          status: "skipped",
          reason: "recent_sync",
          nextEligibleAt: skip.nextEligibleAt,
        });
        continue;
      }

      try {
        const result = await syncChannexAriForFamily({
          supabase,
          familyId,
          windowDays: 365,
          action: "push_ari_365_day",
          route: "/api/internal/cron/channex-ari-sync",
          requireActiveChannel: true,
        });

        results.push({
          familyId,
          externalPropertyId,
          status: result.status,
          message: result.message,
          dateRange: result.dateRange,
          eligibleRooms: result.eligibleRooms,
          availabilityChanges: result.availabilityChanges,
          restrictionChanges: result.restrictionChanges,
          verifiedAvailabilityCount: result.verifiedAvailabilityCount,
          verifiedRateCount: result.verifiedRateCount,
          verifiedMinStayThroughCount: result.verifiedMinStayThroughCount,
          channelHealth: result.channelHealth,
          healthSnapshot: result.healthSnapshot,
        });
      } catch (error) {
        results.push({
          familyId,
          externalPropertyId,
          status: "failed",
          message: error instanceof Error ? error.message : "Failed to run daily ARI sync.",
        });
      }
    }

    return NextResponse.json(
      {
        ok: true,
        configured: true,
        environment: config.environment,
        processedCount: results.filter((row) => row.status !== "skipped").length,
        skippedCount: results.filter((row) => row.status === "skipped").length,
        force,
        familyIdFilter,
        results,
        ranAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run daily Channex ARI sync." },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRequest(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRequest(request);
}
