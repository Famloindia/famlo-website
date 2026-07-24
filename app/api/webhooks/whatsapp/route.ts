import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  loadBookingWhatsAppActionByToken,
  parseBookingWhatsAppReplyPayload,
  queueBookingActionJob,
} from "@/lib/booking-whatsapp-actions";
import { asString } from "@/lib/platform-utils";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { getWhatsAppRuntimeConfig, normalizeMetaPhone } from "@/lib/whatsapp-config";
import {
  applyWhatsAppDeliveryStatus,
  markWhatsAppWebhookEvent,
  recordWhatsAppWebhookEvent,
  sanitizeMetaFailure,
  verifyMetaWebhookSignature,
  webhookPayloadDigest,
} from "@/lib/whatsapp-webhook";

type WebhookMessage = {
  id?: string;
  from?: string;
  type?: string;
  button?: { payload?: string };
  interactive?: { type?: string; button_reply?: { id?: string } };
};

type WebhookStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: unknown[];
};

type WebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WebhookMessage[];
        statuses?: WebhookStatus[];
      };
    }>;
  }>;
};

function secureEqual(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function replyPayload(message: WebhookMessage): string | null {
  if (message.type === "button") return asString(message.button?.payload);
  if (message.type === "interactive" && message.interactive?.type === "button_reply") {
    return asString(message.interactive.button_reply?.id);
  }
  return null;
}

function timestampToIso(value: string | null): string {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000).toISOString();
  return new Date().toISOString();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expected = getWhatsAppRuntimeConfig().webhookVerifyToken;
  if (mode === "subscribe" && challenge && secureEqual(token, expected)) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Webhook verification failed." }, { status: 403 });
}

async function processStatus(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  status: WebhookStatus,
  digest: string
): Promise<void> {
  const providerMessageId = asString(status.id);
  const providerStatus = asString(status.status) as "sent" | "delivered" | "read" | "failed" | null;
  if (!providerMessageId || !providerStatus || !["sent", "delivered", "read", "failed"].includes(providerStatus)) {
    return;
  }
  const statusAt = timestampToIso(asString(status.timestamp));
  const eventKey = `status:${providerMessageId}:${providerStatus}:${statusAt}`;
  if (
    await recordWhatsAppWebhookEvent(supabase, {
      eventKey,
      eventType: "status",
      providerMessageId,
      payloadDigest: digest,
    }) === "duplicate"
  ) return;
  try {
    const failure = providerStatus === "failed" ? sanitizeMetaFailure(status.errors?.[0]) : undefined;
    const outcome = await applyWhatsAppDeliveryStatus(supabase, {
      providerMessageId,
      status: providerStatus,
      timestamp: statusAt,
      eventId: eventKey,
      failure,
    });
    await markWhatsAppWebhookEvent(supabase, eventKey, outcome === "updated" ? "processed" : "ignored");
  } catch (error) {
    await markWhatsAppWebhookEvent(supabase, eventKey, "failed");
    throw error;
  }
}

async function processInteractive(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  message: WebhookMessage,
  digest: string
): Promise<void> {
  const messageId = asString(message.id);
  if (!messageId) return;
  const eventKey = `interactive:${messageId}`;
  const eventState = await recordWhatsAppWebhookEvent(supabase, {
    eventKey,
    eventType: "interactive",
    providerMessageId: messageId,
    payloadDigest: digest,
  });
  if (eventState === "duplicate") return;

  const parsed = parseBookingWhatsAppReplyPayload(replyPayload(message));
  if (!parsed) {
    await markWhatsAppWebhookEvent(supabase, eventKey, "ignored");
    return;
  }
  const action = await loadBookingWhatsAppActionByToken(supabase, parsed.actionToken);
  const bookingId = asString(action?.booking_id);
  const actionId = asString(action?.id);
  if (!action || !bookingId || !actionId) {
    await markWhatsAppWebhookEvent(supabase, eventKey, "ignored");
    return;
  }
  const fromPhone = normalizeMetaPhone(asString(message.from));
  const expectedPhone = normalizeMetaPhone(asString(action.host_phone));
  const actionStatus = asString(action.status) ?? "pending";
  const expired = (asString(action.expires_at) ?? "") < new Date().toISOString();
  const reason =
    expectedPhone && fromPhone && expectedPhone !== fromPhone
      ? "phone_mismatch"
      : expired
        ? "expired"
        : !["pending", "processing"].includes(actionStatus)
          ? "already_resolved"
          : null;
  const queued = await queueBookingActionJob(supabase, {
    bookingId,
    bookingWhatsAppActionId: actionId,
    actionToken: parsed.actionToken,
    requestedAction: parsed.action,
    inboundMessageId: messageId,
    inboundPhone: fromPhone,
    payload: { webhook_event_key: eventKey },
    ...(reason
      ? {
          status: "ignored" as const,
          errorMessage: `Booking action ignored: ${reason}.`,
        }
      : {}),
  });
  await markWhatsAppWebhookEvent(
    supabase,
    eventKey,
    reason || queued === "duplicate" ? "ignored" : "processed"
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const config = getWhatsAppRuntimeConfig();
  if (
    !verifyMetaWebhookSignature({
      rawBody,
      signatureHeader: request.headers.get("x-hub-signature-256"),
      appSecret: config.appSecret,
    })
  ) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let body: WebhookPayload;
  try {
    body = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid webhook body." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const digest = webhookPayloadDigest(rawBody);
  const values =
    body.entry?.flatMap((entry) => entry.changes?.map((change) => change.value ?? {}) ?? []) ?? [];
  try {
    for (const value of values) {
      for (const status of value.statuses ?? []) await processStatus(supabase, status, digest);
      for (const message of value.messages ?? []) {
        if (replyPayload(message)) {
          await processInteractive(supabase, message, digest);
        } else {
          const messageId = asString(message.id);
          if (messageId) {
            const eventKey = `unsupported:${messageId}`;
            const state = await recordWhatsAppWebhookEvent(supabase, {
              eventKey,
              eventType: "unsupported",
              providerMessageId: messageId,
              payloadDigest: digest,
            });
            if (state === "recorded") await markWhatsAppWebhookEvent(supabase, eventKey, "ignored");
          }
        }
      }
    }
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
