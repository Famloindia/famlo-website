import { NextRequest, NextResponse } from "next/server";

import {
  loadBookingWhatsAppActionByToken,
  parseBookingWhatsAppReplyPayload,
  queueBookingActionJob,
} from "@/lib/booking-whatsapp-actions";
import { enqueueNotification } from "@/lib/booking-platform";
import { createAdminSupabaseClient } from "@/lib/supabase";

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id?: string;
          from?: string;
          type?: string;
          button?: {
            payload?: string;
            text?: string;
          };
          interactive?: {
            type?: string;
            button_reply?: {
              id?: string;
              title?: string;
            };
          };
        }>;
        statuses?: Array<Record<string, unknown>>;
      };
    }>;
  }>;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeWhatsAppPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function extractReplyPayload(message: {
  type?: string;
  button?: { payload?: string };
  interactive?: { type?: string; button_reply?: { id?: string } };
}): string | null {
  if (message.type === "button") {
    return asString(message.button?.payload);
  }

  if (message.type === "interactive" && message.interactive?.type === "button_reply") {
    return asString(message.interactive.button_reply?.id);
  }

  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();

  if (mode === "subscribe" && token && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Webhook verification failed." }, { status: 403 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as WhatsAppWebhookPayload;
    const supabase = createAdminSupabaseClient();
    const messages =
      body.entry?.flatMap((entry) => entry.changes?.flatMap((change) => change.value?.messages ?? []) ?? []) ?? [];

    for (const message of messages) {
      const messageId = asString(message.id);
      const fromPhone = normalizeWhatsAppPhone(asString(message.from));
      const payload = extractReplyPayload(message);
      const parsed = parseBookingWhatsAppReplyPayload(payload);

      if (!messageId || !parsed) {
        continue;
      }

      const action = await loadBookingWhatsAppActionByToken(supabase, parsed.actionToken);
      if (!action) {
        continue;
      }

      const actionStatus = asString(action.status) ?? "pending";
      const expiresAt = asString(action.expires_at) ?? "";
      const hostPhone = normalizeWhatsAppPhone(asString(action.host_phone));
      const bookingId = asString(action.booking_id);
      const actionId = asString(action.id);
      const now = new Date().toISOString();

      if (!actionId || !bookingId) {
        continue;
      }

      if (hostPhone && fromPhone && hostPhone !== fromPhone) {
        const queued = await queueBookingActionJob(supabase, {
          bookingId,
          bookingWhatsAppActionId: actionId,
          actionToken: parsed.actionToken,
          requestedAction: parsed.action,
          inboundMessageId: messageId,
          inboundPhone: fromPhone,
          payload: {
            reason: "phone_mismatch",
            raw_payload: payload,
          },
          status: "ignored",
          errorMessage: "Incoming phone does not match the expected host phone.",
        });
        if (queued === "duplicate") {
          continue;
        }
        await enqueueNotification(supabase, {
          eventType: "booking_host_action_ignored",
          channel: "whatsapp",
          bookingId,
          recipientPhone: hostPhone,
          dedupeKey: `booking_host_action_ignored:${parsed.actionToken}:phone_mismatch`,
          subject: "Famlo booking action ignored",
          recipientRole: "host",
          payload: {
            message: "This Famlo booking action could not be matched to the expected host account.",
          },
        });
        continue;
      }

      if (actionStatus !== "pending") {
        const queued = await queueBookingActionJob(supabase, {
          bookingId,
          bookingWhatsAppActionId: actionId,
          actionToken: parsed.actionToken,
          requestedAction: parsed.action,
          inboundMessageId: messageId,
          inboundPhone: fromPhone,
          payload: {
            reason: "already_resolved",
            raw_payload: payload,
          },
          status: "ignored",
          errorMessage: "This booking action was already handled earlier.",
        });
        if (queued === "duplicate") {
          continue;
        }
        await enqueueNotification(supabase, {
          eventType: "booking_host_action_ignored",
          channel: "whatsapp",
          bookingId,
          recipientPhone: hostPhone,
          dedupeKey: `booking_host_action_ignored:${parsed.actionToken}:already_resolved`,
          subject: "Famlo booking action ignored",
          recipientRole: "host",
          payload: {
            message: "This Famlo booking request was already handled earlier, so no further action was taken.",
          },
        });
        continue;
      }

      if (expiresAt < now) {
        const queued = await queueBookingActionJob(supabase, {
          bookingId,
          bookingWhatsAppActionId: actionId,
          actionToken: parsed.actionToken,
          requestedAction: parsed.action,
          inboundMessageId: messageId,
          inboundPhone: fromPhone,
          payload: {
            reason: "expired",
            raw_payload: payload,
          },
          status: "ignored",
          errorMessage: "This booking action expired before it was received.",
        });
        if (queued === "duplicate") {
          continue;
        }
        await enqueueNotification(supabase, {
          eventType: "booking_host_action_ignored",
          channel: "whatsapp",
          bookingId,
          recipientPhone: hostPhone,
          dedupeKey: `booking_host_action_ignored:${parsed.actionToken}:expired`,
          subject: "Famlo booking action expired",
          recipientRole: "host",
          payload: {
            message: "This Famlo booking approval request has expired, so no action was taken.",
          },
        });
        continue;
      }

      await queueBookingActionJob(supabase, {
        bookingId,
        bookingWhatsAppActionId: actionId,
        actionToken: parsed.actionToken,
        requestedAction: parsed.action,
        inboundMessageId: messageId,
        inboundPhone: fromPhone,
        payload: {
          raw_payload: payload,
        },
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[webhooks.whatsapp] failed", error);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
