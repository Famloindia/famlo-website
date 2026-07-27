import { NextResponse } from "next/server";

import { requireHostSettingsSession } from "@/lib/host-settings-auth";
import {
  hashRequestIp,
  recordBlockedTestMessage,
  whatsappDeliveryEnabled,
} from "@/lib/host-whatsapp-settings";
import { enqueueNotificationRecord } from "@/lib/notifications/enqueue";
import { assertSameOrigin, getRequestIp } from "@/lib/request-security";
import { createAdminSupabaseClient } from "@/lib/supabase";
import {
  getWhatsAppRuntimeConfig,
  isStagingExplicitWhatsAppDeliveryAllowed,
} from "@/lib/whatsapp-config";
import { resolveEligibleHostWhatsApp } from "@/lib/whatsapp-eligibility";

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = createAdminSupabaseClient();
  try {
    assertSameOrigin(request);
    const session = await requireHostSettingsSession(supabase, request);
    const ipHash = hashRequestIp(getRequestIp(request));
    const testDeliveryAllowed =
      whatsappDeliveryEnabled() || isStagingExplicitWhatsAppDeliveryAllowed();
    if (!testDeliveryAllowed) {
      await recordBlockedTestMessage(supabase, { hostUserId: session.hostUserId, ipHash });
      return NextResponse.json(
        { ok: false, code: "whatsapp_delivery_disabled", message: "WhatsApp delivery is not active yet." },
        { status: 409 }
      );
    }

    const eligible = await resolveEligibleHostWhatsApp(
      supabase,
      session.hostUserId,
      { allowStagingExplicitDelivery: true }
    );
    if (!eligible) {
      return NextResponse.json(
        { ok: false, code: "whatsapp_not_eligible", message: "Verify your number, consent, and enable alerts first." },
        { status: 409 }
      );
    }
    const config = getWhatsAppRuntimeConfig();
    if (!config.templates.setupConfirmation) {
      return NextResponse.json(
        { ok: false, code: "template_not_configured", message: "The WhatsApp test template is not configured." },
        { status: 503 }
      );
    }
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from("notification_queue")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "host_whatsapp_test")
      .eq("user_id", session.hostUserId)
      .gte("created_at", hourAgo);
    if (countError) throw countError;
    if ((count ?? 0) >= 3) {
      return NextResponse.json(
        { ok: false, code: "rate_limited", message: "Please wait before requesting another test message." },
        { status: 429 }
      );
    }

    const [{ data: host, error: hostError }, { data: family, error: familyError }] = await Promise.all([
      supabase
        .from("hosts")
        .select("display_name")
        .eq("user_id", session.hostUserId)
        .eq("legacy_family_id", session.familyId)
        .maybeSingle(),
      supabase
        .from("families")
        .select("property_name,name")
        .eq("id", session.familyId)
        .maybeSingle(),
    ]);
    if (hostError) throw hostError;
    if (familyError) throw familyError;
    if (!family) {
      return NextResponse.json(
        { ok: false, code: "property_not_found", message: "The selected property could not be loaded." },
        { status: 404 }
      );
    }
    const hostDisplayName =
      String((host as { display_name?: string | null } | null)?.display_name ?? "").trim() ||
      "Famlo host";
    const propertyName =
      String((family as { property_name?: string | null }).property_name ?? "").trim() ||
      String((family as { name?: string | null }).name ?? "").trim() ||
      "Famlo property";

    const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
    const queued = await enqueueNotificationRecord(supabase, {
      eventType: "host_whatsapp_test",
      channel: "whatsapp",
      userId: session.hostUserId,
      dedupeKey: `host_whatsapp_test:${session.hostUserId}:${bucket}`,
      subject: "Famlo WhatsApp test",
      recipientRole: "host",
      recipientPhone: eligible.phoneE164,
      templateName: config.templates.setupConfirmation,
      payload: {
        template_variables: [hostDisplayName, propertyName],
      },
    });
    await supabase.from("host_whatsapp_audit_log").insert({
      host_user_id: session.hostUserId,
      action: "test_message_queued",
      actor_type: "host",
      outcome: "success",
      reason_code: queued,
      ip_hash: ipHash,
      metadata: { deduped: queued === "deduped" },
    } as never);
    return NextResponse.json(
      { ok: true, status: "queued", message: queued === "deduped" ? "Test message is already queued." : "Test message queued." },
      { status: 202 }
    );
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "test_message_error";
    const status = code === "unauthorized" ? 401 : code === "forbidden" ? 403 : 400;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to queue the test message.",
        code,
      },
      { status }
    );
  }
}
