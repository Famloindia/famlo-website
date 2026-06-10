import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { autoProcessPendingChannexFeedRevisions } from "@/lib/channex-booking-auto-apply";
import { getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import { pollChannexBookingFeedForFamily, shouldSkipChannexFeedPoll } from "@/lib/channex-booking-feed-sync";
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
        {
          ok: false,
          error: "Channex configuration is incomplete.",
          configured: false,
        },
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

      const skip = !force ? shouldSkipChannexFeedPoll(asObject(propertyRow.metadata), now) : null;
      if (skip?.skip) {
        results.push({
          familyId,
          externalPropertyId,
          status: "skipped",
          reason: skip.reason,
          nextEligibleAt: skip.nextEligibleAt,
        });
        continue;
      }

      try {
        const result = await pollChannexBookingFeedForFamily({
          supabase,
          familyId,
          action: "poll_booking_feed_cron",
        });
        const autoApplySummary = await autoProcessPendingChannexFeedRevisions({
          supabase,
          familyId,
        });

        if (propertyRow.id) {
          const metadata = asObject(propertyRow.metadata) ?? {};
          const existingHealth = asObject(metadata.channexFeedHealth) ?? {};
          await supabase
            .from("channel_properties")
            .update({
              metadata: {
                ...metadata,
                channexFeedHealth: {
                  ...existingHealth,
                  autoAppliedCount: autoApplySummary.autoAppliedCount,
                  autoImportedCount: autoApplySummary.autoImportedCount,
                  autoCancelledCount: autoApplySummary.autoCancelledCount,
                  pendingManualReviewCount: autoApplySummary.pendingManualReviewCount,
                  failedAutoApplyCount: autoApplySummary.failedAutoApplyCount,
                  acknowledgedCount: autoApplySummary.acknowledgedCount,
                  lastAutoApplyAt: autoApplySummary.lastAutoApplyAt,
                  lastAutoApplyState: autoApplySummary.lastAutoApplyState,
                  lastAutoApplyMessage: autoApplySummary.lastAutoApplyMessage,
                },
              },
            } as never)
            .eq("id", propertyRow.id);
        }

        results.push({
          familyId,
          externalPropertyId,
          status: result.status,
          message: result.message,
          totalFetched: result.totalFetched,
          revisionsFound: result.revisionsFound,
          storedCount: result.storedCount,
          channelHealth: result.channelHealth,
          autoApplySummary,
        });
      } catch (error) {
        results.push({
          familyId,
          externalPropertyId,
          status: "failed",
          message: error instanceof Error ? error.message : "Failed to poll Channex feed.",
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
      { error: error instanceof Error ? error.message : "Failed to poll Channex booking feed." },
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
