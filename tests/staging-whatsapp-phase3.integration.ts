import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createClient } from "@supabase/supabase-js";

import { enqueueGuestMessageWhatsAppAlert } from "@/lib/guest-message-whatsapp";
import { processNotificationQueueBatch } from "@/lib/notifications/notification-worker";
import { enqueueNotificationRecord } from "@/lib/notifications/enqueue";
import {
  applyWhatsAppDeliveryStatus,
} from "@/lib/whatsapp-webhook";

const STAGING_REF = "nsanahmopvwrlwvmxdmf";

test("Phase 3 staging queue claims, retries, statuses and cleanup", async () => {
  assert.equal(process.env.RUN_STAGING_WHATSAPP_PHASE3_INTEGRATION, "1");
  assert.equal(process.env.FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS, "false");
  const url = process.env.STAGING_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  assert.ok(url.includes(STAGING_REF));
  assert.ok(key);
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const marker = randomUUID();
  const email = `phase3-${marker}@example.test`;
  const phone = `+9195${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const auth = await supabase.auth.admin.createUser({
    email,
    password: `Phase3-${marker}!`,
    email_confirm: true,
  });
  if (auth.error || !auth.data.user) throw auth.error ?? new Error("Auth fixture failed.");
  const userId = auth.data.user.id;
  const queueIds: string[] = [];

  try {
    const { error: userError } = await supabase.from("users").insert({
      id: userId,
      email,
      phone,
      name: `Phase 3 ${marker}`,
      role: "family",
      onboarding_completed: true,
    } as never);
    if (userError) throw userError;
    const now = new Date().toISOString();
    const { error: settingsError } = await supabase.from("host_whatsapp_settings").insert({
      host_user_id: userId,
      phone_e164: phone,
      phone_country_code: "+91",
      enabled: true,
      ownership_verified_at: now,
      opted_in_at: now,
      source: "canonical_otp",
    } as never);
    if (settingsError) throw settingsError;

    const insertQueue = async (suffix: string, overrides: Record<string, unknown> = {}) => {
      const id = randomUUID();
      queueIds.push(id);
      const { error } = await supabase.from("notification_queue").insert({
        id,
        event_type: "host_whatsapp_test",
        channel: "whatsapp",
        user_id: userId,
        recipient_role: "host",
        recipient_phone: phone,
        template_name: "phase3_fixture",
        dedupe_key: `phase3:${marker}:${suffix}`,
        payload: {},
        scheduled_for: new Date(Date.now() - 1000).toISOString(),
        next_attempt_at: new Date(Date.now() - 1000).toISOString(),
        ...overrides,
      } as never);
      if (error) throw error;
      return id;
    };

    const atomicId = await insertQueue("atomic");
    const [firstClaim, secondClaim] = await Promise.all([
      supabase.rpc("claim_notification_queue_batch", { p_batch_size: 1, p_lease_seconds: 120 }),
      supabase.rpc("claim_notification_queue_batch", { p_batch_size: 1, p_lease_seconds: 120 }),
    ]);
    if (firstClaim.error) throw firstClaim.error;
    if (secondClaim.error) throw secondClaim.error;
    assert.equal((firstClaim.data?.length ?? 0) + (secondClaim.data?.length ?? 0), 1);
    assert.equal(String((firstClaim.data?.[0] ?? secondClaim.data?.[0])?.id), atomicId);

    const { error: staleError } = await supabase
      .from("notification_queue")
      .update({
        status: "processing",
        lease_expires_at: new Date(Date.now() - 60_000).toISOString(),
      } as never)
      .eq("id", atomicId);
    if (staleError) throw staleError;
    const staleClaim = await supabase.rpc("claim_notification_queue_batch", {
      p_batch_size: 1,
      p_lease_seconds: 120,
    });
    if (staleClaim.error) throw staleClaim.error;
    assert.equal(staleClaim.data?.[0]?.id, atomicId);
    assert.equal(staleClaim.data?.[0]?.attempts, 2);
    await supabase.from("notification_queue").delete().eq("id", atomicId);
    queueIds.splice(queueIds.indexOf(atomicId), 1);

    const disabledId = await insertQueue("disabled");
    const disabledMetrics = await processNotificationQueueBatch(supabase, {
      batchSize: 5,
      maxDurationMs: 10_000,
    });
    assert.equal(disabledMetrics.failed, 1);
    const { data: disabledRow, error: disabledError } = await supabase
      .from("notification_queue")
      .select("status,provider_message_id,last_error")
      .eq("id", disabledId)
      .single();
    if (disabledError) throw disabledError;
    assert.equal(disabledRow.status, "failed");
    assert.equal(disabledRow.provider_message_id, null);
    assert.match(String(disabledRow.last_error), /disabled/i);

    const statusId = await insertQueue("status", {
      status: "processed",
      provider_message_id: `wamid.${marker}`,
      provider_status: "submitted",
      provider_status_at: new Date(Date.now() - 5000).toISOString(),
      completed_at: now,
      processed_at: now,
    });
    const sentAt = new Date(Date.now() - 4000).toISOString();
    const deliveredAt = new Date(Date.now() - 3000).toISOString();
    const readAt = new Date(Date.now() - 2000).toISOString();
    assert.equal(
      await applyWhatsAppDeliveryStatus(supabase, {
        providerMessageId: `wamid.${marker}`,
        status: "sent",
        timestamp: sentAt,
        eventId: `sent:${marker}`,
      }),
      "updated"
    );
    assert.equal(
      await applyWhatsAppDeliveryStatus(supabase, {
        providerMessageId: `wamid.${marker}`,
        status: "delivered",
        timestamp: deliveredAt,
        eventId: `delivered:${marker}`,
      }),
      "updated"
    );
    assert.equal(
      await applyWhatsAppDeliveryStatus(supabase, {
        providerMessageId: `wamid.${marker}`,
        status: "read",
        timestamp: readAt,
        eventId: `read:${marker}`,
      }),
      "updated"
    );
    assert.equal(
      await applyWhatsAppDeliveryStatus(supabase, {
        providerMessageId: `wamid.${marker}`,
        status: "delivered",
        timestamp: new Date().toISOString(),
        eventId: `late-delivered:${marker}`,
      }),
      "ignored"
    );
    const { data: readRow } = await supabase
      .from("notification_queue")
      .select("provider_status")
      .eq("id", statusId)
      .single();
    assert.equal(readRow?.provider_status, "read");
    const { data: readSettings } = await supabase
      .from("host_whatsapp_settings")
      .select("last_delivery_status")
      .eq("host_user_id", userId)
      .single();
    assert.equal(readSettings?.last_delivery_status, "read");

    assert.equal(
      await enqueueGuestMessageWhatsAppAlert(supabase, {
        messageId: randomUUID(),
        hostUserId: userId,
        conversationId: randomUUID(),
      }),
      "ineligible"
    );

    process.env.FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS = "true";
    process.env.WHATSAPP_GUEST_MESSAGE_RECEIVED_HOST_TEMPLATE_NAME = "guest_message_fixture";
    const messageId = randomUUID();
    assert.equal(
      await enqueueGuestMessageWhatsAppAlert(supabase, {
        messageId,
        hostUserId: userId,
        conversationId: randomUUID(),
      }),
      "inserted"
    );
    assert.equal(
      await enqueueGuestMessageWhatsAppAlert(supabase, {
        messageId,
        hostUserId: userId,
        conversationId: randomUUID(),
      }),
      "deduped"
    );
    const { data: messageQueue } = await supabase
      .from("notification_queue")
      .select("id")
      .eq("dedupe_key", `guest_message_sent:${messageId}:${userId}:whatsapp`);
    for (const row of messageQueue ?? []) queueIds.push(String(row.id));
    assert.equal(messageQueue?.length, 1);
    process.env.FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS = "false";

    const enqueueStatus = await enqueueNotificationRecord(supabase, {
      eventType: "host_whatsapp_test",
      channel: "whatsapp",
      userId,
      dedupeKey: `phase3:${marker}:enqueue`,
      recipientPhone: phone,
      recipientRole: "host",
      templateName: "phase3_fixture",
    });
    assert.equal(enqueueStatus, "inserted");
    const { data: enqueuedRows } = await supabase
      .from("notification_queue")
      .select("id")
      .eq("dedupe_key", `phase3:${marker}:enqueue`);
    for (const row of enqueuedRows ?? []) queueIds.push(String(row.id));
  } finally {
    process.env.FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS = "false";
    if (queueIds.length) await supabase.from("notification_queue").delete().in("id", [...new Set(queueIds)]);
    await supabase.from("host_whatsapp_audit_log").delete().eq("host_user_id", userId);
    await supabase.from("host_whatsapp_settings").delete().eq("host_user_id", userId);
    await supabase.from("users").delete().eq("id", userId);
    await supabase.auth.admin.deleteUser(userId);
    const { count: queueCount } = await supabase
      .from("notification_queue")
      .select("id", { count: "exact", head: true })
      .in("id", [...new Set(queueIds)]);
    assert.equal(queueCount ?? 0, 0);
  }
});
