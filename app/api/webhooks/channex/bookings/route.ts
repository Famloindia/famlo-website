import { NextResponse } from "next/server";

import { pollChannexBookingFeedForFamily } from "@/lib/channex-booking-feed-sync";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asObject(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readWebhookSecretAuthorized(request: Request): boolean {
  const secret = process.env.CHANNEX_WEBHOOK_SECRET?.trim();
  if (!secret) return true;

  const bearer = request.headers.get("authorization");
  const headerSecret =
    request.headers.get("x-famlo-webhook-secret") ??
    request.headers.get("x-channex-webhook-secret");

  return bearer === `Bearer ${secret}` || headerSecret === secret;
}

function extractPropertyId(payload: unknown): string | null {
  const root = asObject(payload);
  if (!root) return null;

  const direct =
    asString(root.property_id) ??
    asString(root.propertyId) ??
    asString(root.external_property_id);
  if (direct) return direct;

  const data = asObject(root.data);
  if (!data) return null;

  return (
    asString(data.property_id) ??
    asString(data.propertyId) ??
    asString(asObject(data.attributes)?.property_id) ??
    asString(asObject(data.attributes)?.propertyId) ??
    asString(asObject(data.relationships)?.property_id)
  );
}

async function logWebhookEvent(input: {
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  familyId: string | null;
  status: "received" | "processed" | "ignored" | "failed";
  message: string;
  payload: JsonRecord;
}): Promise<void> {
  if (!input.familyId) return;

  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: "booking_webhook",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    console.error("[webhooks.channex.bookings] log failed:", error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = createAdminSupabaseClient();

  try {
    if (!readWebhookSecretAuthorized(request)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await request.json().catch(() => ({}))) as JsonRecord;
    const externalPropertyId = extractPropertyId(payload);

    if (!externalPropertyId) {
      return NextResponse.json(
        {
          ok: true,
          status: "ignored",
          message: "Webhook received without a recognizable Channex property id.",
        },
        { status: 202 }
      );
    }

    const { data: channelProperty, error: lookupError } = await supabase
      .from("channel_properties")
      .select("family_id")
      .eq("provider_code", "channex")
      .eq("external_property_id", externalPropertyId)
      .maybeSingle();

    if (lookupError) throw lookupError;

    const familyId = asString(channelProperty?.family_id);
    if (!familyId) {
      return NextResponse.json(
        {
          ok: true,
          status: "ignored",
          message: "Webhook property is not mapped to a Famlo Pro family yet.",
          externalPropertyId,
        },
        { status: 202 }
      );
    }

    await logWebhookEvent({
      supabase,
      familyId,
      status: "received",
      message: "Channex booking webhook received.",
      payload: {
        external_property_id: externalPropertyId,
        raw: payload,
      },
    });

    const result = await pollChannexBookingFeedForFamily({
      supabase,
      familyId,
      action: "poll_booking_feed_webhook",
    });

    await logWebhookEvent({
      supabase,
      familyId,
      status: result.ok ? "processed" : "failed",
      message: result.message,
      payload: {
        external_property_id: externalPropertyId,
        total_fetched: result.totalFetched,
        revisions_found: result.revisionsFound,
        stored_count: result.storedCount,
      },
    });

    return NextResponse.json(
      {
        ok: result.ok,
        status: result.status,
        familyId,
        externalPropertyId,
        message: result.message,
        totalFetched: result.totalFetched,
        revisionsFound: result.revisionsFound,
        storedCount: result.storedCount,
      },
      { status: result.ok ? 200 : 502 }
    );
  } catch (error) {
    console.error("[webhooks.channex.bookings] failed:", error);
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        error: error instanceof Error ? error.message : "Unable to process the Channex booking webhook.",
      },
      { status: 500 }
    );
  }
}

