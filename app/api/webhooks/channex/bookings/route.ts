import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { autoProcessPendingChannexFeedRevisions } from "@/lib/channex-booking-auto-apply";
import { pollChannexBookingFeedForFamily } from "@/lib/channex-booking-feed-sync";
import { createAdminSupabaseClient } from "@/lib/supabase";

type JsonRecord = Record<string, unknown>;
type ChannexWebhookAuthMode = "shared_secret" | "signature";

type ChannexWebhookAuthConfig =
  | { configured: false; error: "webhook_not_configured" }
  | { configured: true; mode: ChannexWebhookAuthMode; secret: string };

type ChannexWebhookAuthResult =
  | { ok: true; mode: ChannexWebhookAuthMode }
  | { ok: false; status: 401 | 503; error: "Unauthorized" | "webhook not configured" };

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asObject(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readEnvString(value: string | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function readSignatureHeader(request: Request): string | null {
  return (
    request.headers.get("x-channex-signature") ??
    request.headers.get("x-famlo-webhook-signature") ??
    request.headers.get("x-webhook-signature")
  )?.trim() || null;
}

function readChannexWebhookAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
  request?: Request
): ChannexWebhookAuthConfig {
  const secret = readEnvString(env.CHANNEX_WEBHOOK_SECRET);
  if (!secret) {
    return { configured: false, error: "webhook_not_configured" };
  }

  const configuredMode = readEnvString(env.CHANNEX_WEBHOOK_AUTH_MODE)?.toLowerCase();
  if (configuredMode === "signature") {
    return { configured: true, mode: "signature", secret };
  }
  if (configuredMode === "shared_secret" || configuredMode === "token") {
    return { configured: true, mode: "shared_secret", secret };
  }

  return {
    configured: true,
    mode: request && readSignatureHeader(request) ? "signature" : "shared_secret",
    secret,
  };
}

function verifySharedSecretRequest(request: Request, secret: string): boolean {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? null;
  const headerSecret =
    request.headers.get("x-famlo-webhook-secret")?.trim() ??
    request.headers.get("x-channex-webhook-secret")?.trim() ??
    request.headers.get("x-webhook-token")?.trim();
  const url = new URL(request.url);
  const querySecret =
    url.searchParams.get("secret")?.trim() ??
    url.searchParams.get("token")?.trim() ??
    url.searchParams.get("webhook_secret")?.trim();

  return [bearer, headerSecret, querySecret].some((candidate) => Boolean(candidate) && constantTimeEqual(candidate!, secret));
}

function verifySignatureRequest(request: Request, rawBody: string, secret: string): boolean {
  const provided = readSignatureHeader(request);
  if (!provided) return false;

  const digestHex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const digestBase64 = Buffer.from(digestHex, "hex").toString("base64");
  return [`sha256=${digestHex}`, digestHex, digestBase64].some((candidate) => constantTimeEqual(provided, candidate));
}

function verifyChannexWebhookRequest(input: {
  request: Request;
  rawBody: string;
  env?: NodeJS.ProcessEnv;
}): ChannexWebhookAuthResult {
  const config = readChannexWebhookAuthConfig(input.env, input.request);
  if (!config.configured) {
    return { ok: false, status: 503, error: "webhook not configured" };
  }

  const authorized =
    config.mode === "signature"
      ? verifySignatureRequest(input.request, input.rawBody, config.secret)
      : verifySharedSecretRequest(input.request, config.secret);

  if (!authorized) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true, mode: config.mode };
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

function extractBookingId(payload: unknown): string | null {
  const root = asObject(payload);
  if (!root) return null;

  return (
    asString(root.booking_id) ??
    asString(root.bookingId) ??
    asString(root.external_booking_id) ??
    asString(asObject(root.data)?.booking_id) ??
    asString(asObject(asObject(root.data)?.attributes)?.booking_id) ??
    asString(asObject(asObject(root.data)?.attributes)?.ota_reservation_code)
  );
}

function extractRevisionId(payload: unknown): string | null {
  const root = asObject(payload);
  if (!root) return null;

  return (
    asString(root.revision_id) ??
    asString(root.revisionId) ??
    asString(root.id) ??
    asString(asObject(root.data)?.revision_id) ??
    asString(asObject(root.data)?.id) ??
    asString(asObject(asObject(root.data)?.attributes)?.revision_id)
  );
}

function extractEventType(payload: unknown): string | null {
  const root = asObject(payload);
  if (!root) return null;

  return (
    asString(root.event_type) ??
    asString(root.eventType) ??
    asString(root.type) ??
    asString(root.event) ??
    asString(asObject(root.data)?.type) ??
    asString(asObject(asObject(root.data)?.attributes)?.event_type)
  );
}

function buildSafeWebhookMetadata(payload: unknown, receivedAt: string): JsonRecord {
  const eventType = extractEventType(payload);
  const bookingId = extractBookingId(payload);
  const revisionId = extractRevisionId(payload);
  return {
    provider: "channex",
    property_id: extractPropertyId(payload),
    booking_id: bookingId,
    revision_id: revisionId,
    event_type: eventType,
    received_at: receivedAt,
    webhook_idempotency_key: ["channex", eventType ?? "event", revisionId ?? bookingId ?? "body_hash_pending"].join(":"),
  };
}

function attachWebhookBodyHash(metadata: JsonRecord, rawBody: string): JsonRecord {
  const bodyHash = createHash("sha256").update(rawBody, "utf8").digest("hex");
  const idempotencyKey = asString(metadata.webhook_idempotency_key);
  return {
    ...metadata,
    body_sha256: bodyHash,
    webhook_idempotency_key:
      idempotencyKey && !idempotencyKey.endsWith(":body_hash_pending")
        ? idempotencyKey
        : ["channex", asString(metadata.event_type) ?? "event", bodyHash].join(":"),
  };
}

function isWebhookProcessingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.CHANNEX_WEBHOOK_PROCESSING_ENABLED ?? "").trim().toLowerCase() === "true";
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
    const rawBody = await request.text();
    const authResult = verifyChannexWebhookRequest({ request, rawBody });
    if (!authResult.ok) {
      return NextResponse.json({ ok: false, error: authResult.error }, { status: authResult.status });
    }

    const payload =
      rawBody.trim().length > 0
        ? (JSON.parse(rawBody) as JsonRecord)
        : ({} as JsonRecord);
    const receivedAt = new Date().toISOString();
    const webhookMetadata = attachWebhookBodyHash(buildSafeWebhookMetadata(payload, receivedAt), rawBody);
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

    const webhookIdempotencyKey = asString(webhookMetadata.webhook_idempotency_key);
    if (webhookIdempotencyKey) {
      const { data: existingWebhookLog, error: existingWebhookLogError } = await supabase
        .from("channel_sync_logs")
        .select("id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex")
        .eq("action", "booking_webhook")
        .contains("payload", { webhook_idempotency_key: webhookIdempotencyKey } as never)
        .limit(1)
        .maybeSingle();
      if (existingWebhookLogError) throw existingWebhookLogError;
      if (existingWebhookLog?.id) {
        await logWebhookEvent({
          supabase,
          familyId,
          status: "ignored",
          message: "Duplicate Channex booking webhook ignored idempotently.",
          payload: webhookMetadata,
        });
        return NextResponse.json(
          {
            ok: true,
            status: "duplicate_ignored",
            familyId,
            externalPropertyId,
          },
          { status: 200 }
        );
      }
    }

    await logWebhookEvent({
      supabase,
      familyId,
      status: "received",
      message: "Channex booking webhook received.",
      payload: webhookMetadata,
    });

    if (!isWebhookProcessingEnabled()) {
      await logWebhookEvent({
        supabase,
        familyId,
        status: "ignored",
        message: "Channex booking webhook processing is disabled by CHANNEX_WEBHOOK_PROCESSING_ENABLED.",
        payload: webhookMetadata,
      });
      return NextResponse.json(
        {
          ok: true,
          status: "processing_disabled",
          familyId,
          externalPropertyId,
          message: "Webhook audited. Processing is disabled by environment flag.",
        },
        { status: 202 }
      );
    }

    const result = await pollChannexBookingFeedForFamily({
      supabase,
      familyId,
      action: "poll_booking_feed_webhook",
    });
    const autoApplySummary = result.ok
      ? await autoProcessPendingChannexFeedRevisions({
          supabase,
          familyId,
        })
      : null;

    await logWebhookEvent({
      supabase,
      familyId,
      status: result.ok ? "processed" : "failed",
      message: result.message,
      payload: webhookMetadata,
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
        autoApplySummary,
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
