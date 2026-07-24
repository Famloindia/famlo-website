import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  consumeBookingActionToken,
  createBookingActionToken,
  markBookingActionTokensUsed,
} from "@/lib/booking-action-tokens";
import {
  createOrReuseBookingWhatsAppAction,
  executeWhatsAppDecisionWithCompletion,
  processBookingActionJobBatch,
  queueBookingActionJob,
} from "@/lib/booking-whatsapp-actions";
import { storePaymentProviderEvent } from "@/lib/finance/provider-event-store";
import { applyHostBookingDecision, HostBookingDecisionError } from "@/lib/host-booking-decision";

const STAGING_PROJECT_REF = "nsanahmopvwrlwvmxdmf";

type Fixture = {
  familyId: string;
  hostId: string;
  hostUserId: string;
  guestUserId: string;
  stayUnitId: string;
  bookingIds: string[];
  legacyBookingIds: string[];
  conversationIds: string[];
  providerEventIds: string[];
};

type BookingFixture = {
  id: string;
  conversationId: string;
};

function requireEnvironment(): { url: string; serviceRoleKey: string } {
  assert.equal(process.env.RUN_STAGING_HOST_BOOKING_DECISION_INTEGRATION, "1");
  const url = process.env.STAGING_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  assert.ok(url.includes(STAGING_PROJECT_REF), `Refusing non-staging Supabase URL: ${url}`);
  assert.ok(serviceRoleKey, "Staging service-role key is required.");
  assert.equal(process.env.FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS, "false");
  process.env.REFUND_PROVIDER_EXECUTION_ENABLED = "false";
  process.env.RAZORPAY_REFUNDS_ENABLED = "false";
  return { url, serviceRoleKey };
}

async function one<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  payload: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.from(table).insert(payload as never).select("*").single();
  if (error) throw error;
  return data as T;
}

async function count(
  supabase: SupabaseClient,
  table: string,
  configure: (query: ReturnType<SupabaseClient["from"]>["select"] extends never ? never : any) => any
): Promise<number> {
  const query = supabase.from(table).select("id", { count: "exact", head: true });
  const { count: rowCount, error } = await configure(query);
  if (error) throw error;
  return rowCount ?? 0;
}

async function loadOne(supabase: SupabaseClient, table: string, id: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from(table).select("*").eq("id", id).single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

async function createFixture(supabase: SupabaseClient): Promise<Fixture> {
  const { data: hostSource, error: hostSourceError } = await supabase
    .from("hosts")
    .select("user_id")
    .not("user_id", "is", null)
    .limit(1)
    .single();
  if (hostSourceError) throw hostSourceError;
  const hostUserId = String(hostSource.user_id);

  const { data: guestSource, error: guestSourceError } = await supabase
    .from("users")
    .select("id")
    .neq("id", hostUserId)
    .limit(1)
    .single();
  if (guestSourceError) throw guestSourceError;
  const guestUserId = String(guestSource.id);

  const marker = randomUUID().slice(0, 8);
  const family = await one<{ id: string }>(supabase, "families", {
    user_id: hostUserId,
    name: `Codex Phase 1 ${marker}`,
    host_id: `CODEX-PHASE1-${marker}`,
    city: "Staging Test City",
    state: "Staging",
    is_active: false,
    is_accepting: false,
    booking_requires_host_approval: true,
  });
  const host = await one<{ id: string }>(supabase, "hosts", {
    user_id: hostUserId,
    legacy_family_id: family.id,
    status: "active",
    display_name: `Codex Phase 1 Host ${marker}`,
    slug: `codex-phase1-${marker}`,
    city: "Staging Test City",
    state: "Staging",
    is_accepting: false,
    booking_requires_host_approval: true,
  });
  const stayUnit = await one<{ id: string }>(supabase, "stay_units_v2", {
    host_id: host.id,
    legacy_family_id: family.id,
    unit_key: `phase1-${marker}`,
    name: "Phase 1 Test Room",
    is_active: false,
    is_primary: true,
    price_fullday: 1000,
  });

  await supabase.from("channel_properties").insert([
    {
      family_id: family.id,
      provider_code: "booking",
      external_property_id: `test-booking-${marker}`,
      sync_status: "connected",
      metadata: { staging_fixture: true },
    },
    {
      family_id: family.id,
      provider_code: "channex",
      external_property_id: `test-channex-${marker}`,
      sync_status: "connected",
      metadata: { staging_fixture: true },
    },
  ] as never);
  const { error: mappingError } = await supabase.from("channel_room_mappings").insert({
    family_id: family.id,
    stay_unit_id: stayUnit.id,
    provider_code: "booking",
    external_property_id: `test-booking-${marker}`,
    external_room_type_id: `test-room-${marker}`,
    sync_status: "mapped",
    metadata: { staging_fixture: true },
  } as never);
  if (mappingError) throw mappingError;

  return {
    familyId: family.id,
    hostId: host.id,
    hostUserId,
    guestUserId,
    stayUnitId: stayUnit.id,
    bookingIds: [],
    legacyBookingIds: [],
    conversationIds: [],
    providerEventIds: [],
  };
}

async function createBooking(
  supabase: SupabaseClient,
  fixture: Fixture,
  label: string,
  options: { withPayment?: boolean; withPayout?: boolean; withCalendarBlock?: boolean } = {}
): Promise<BookingFixture> {
  const legacyBooking = await one<{ id: string }>(supabase, "bookings", {
    user_id: fixture.guestUserId,
    family_id: fixture.familyId,
    quarter_type: "fullday",
    date_from: "2035-07-01",
    date_to: "2035-07-03",
    guests_count: 1,
    status: "pending_host_approval",
    base_price: 1000,
    family_payout: 800,
    total_price: 1000,
  });
  fixture.legacyBookingIds.push(legacyBooking.id);
  const existingConversation = await supabase
    .from("conversations")
    .select("id")
    .eq("booking_id", legacyBooking.id)
    .maybeSingle();
  if (existingConversation.error) throw existingConversation.error;
  const conversation = existingConversation.data?.id
    ? { id: String(existingConversation.data.id) }
    : await one<{ id: string }>(supabase, "conversations", {
        booking_id: legacyBooking.id,
        family_id: fixture.familyId,
        guest_id: fixture.guestUserId,
        host_id: fixture.hostId,
        host_user_id: fixture.hostUserId,
        last_message: `Phase 1 fixture ${label}`,
      });
  const { error: conversationUpdateError } = await supabase
    .from("conversations")
    .update({
      family_id: fixture.familyId,
      guest_id: fixture.guestUserId,
      host_id: fixture.hostId,
      host_user_id: fixture.hostUserId,
      last_message: `Phase 1 fixture ${label}`,
    } as never)
    .eq("id", conversation.id);
  if (conversationUpdateError) throw conversationUpdateError;
  fixture.conversationIds.push(conversation.id);
  const { error: legacyConversationError } = await supabase
    .from("bookings")
    .update({ conversation_id: conversation.id } as never)
    .eq("id", legacyBooking.id);
  if (legacyConversationError) throw legacyConversationError;

  const bookingId = randomUUID();
  fixture.bookingIds.push(bookingId);
  const { error: bookingError } = await supabase.from("bookings_v2").insert({
    id: bookingId,
    user_id: fixture.guestUserId,
    legacy_booking_id: legacyBooking.id,
    booking_type: "host_stay",
    recipient_type: "host",
    recipient_id: fixture.hostId,
    product_type: "host_listing",
    product_id: fixture.hostId,
    host_id: fixture.hostId,
    stay_unit_id: fixture.stayUnitId,
    status: "pending_host_approval",
    start_date: "2035-07-01",
    end_date: "2035-07-03",
    quarter_type: "fullday",
    guests_count: 1,
    pricing_snapshot: {
      staging_fixture: true,
      stay_unit_id: fixture.stayUnitId,
      property_name: "Phase 1 Staging Fixture",
      currency: "INR",
    },
    total_price: 1000,
    partner_payout_amount: 800,
    payment_status: options.withPayment === false ? "pending" : "paid",
    conversation_id: conversation.id,
  } as never);
  if (bookingError) throw bookingError;

  if (options.withPayment !== false) {
    const payment = await one<{ id: string }>(supabase, "payments_v2", {
      booking_id: bookingId,
      gateway: "staging_fixture",
      gateway_order_id: `phase1-${bookingId}`,
      gateway_payment_id: `phase1-${bookingId}`,
      amount_total: 1000,
      platform_fee: 200,
      tax_amount: 0,
      partner_payout_amount: 800,
      status: "paid",
      paid_at: new Date().toISOString(),
      raw_response: { staging_fixture: true },
    });
    const { error } = await supabase.from("bookings_v2").update({ payment_id: payment.id } as never).eq("id", bookingId);
    if (error) throw error;
  }

  if (options.withPayout) {
    const { error } = await supabase.from("payouts_v2").insert({
      booking_id: bookingId,
      partner_type: "host",
      partner_user_id: fixture.hostUserId,
      partner_profile_id: fixture.hostId,
      amount: 800,
      status: "scheduled",
      notes: "Phase 1 staging fixture",
    } as never);
    if (error) throw error;
  }

  if (options.withCalendarBlock) {
    const { error } = await supabase.from("calendar_events").insert({
      owner_type: "host",
      owner_id: fixture.hostId,
      booking_id: bookingId,
      event_uid: `phase1-${bookingId}`,
      source_type: "internal_booking",
      source_reference: bookingId,
      title: "Phase 1 staging fixture",
      start_date: "2035-07-01",
      end_date: "2035-07-03",
      status: "confirmed",
      is_blocking: true,
      payload: { staging_fixture: true },
    } as never);
    if (error) throw error;
  }

  return { id: bookingId, conversationId: conversation.id };
}

function decisionInput(fixture: Fixture, bookingId: string, decision: "approve" | "decline", source: "dashboard" | "signed_link" | "whatsapp") {
  return {
    bookingId,
    familyId: fixture.familyId,
    hostId: fixture.hostId,
    decision,
    source,
    actor: { userId: fixture.hostUserId, role: "host" as const },
    idempotencyKey: `staging:${bookingId}:${source}:${decision}`,
  };
}

async function verifyApproval(supabase: SupabaseClient, fixture: Fixture, booking: BookingFixture): Promise<void> {
  const row = await loadOne(supabase, "bookings_v2", booking.id);
  assert.equal(row.status, "confirmed");
  assert.equal(await count(supabase, "host_booking_decisions", (q) => q.eq("booking_id", booking.id)), 1);
  assert.equal(await count(supabase, "payouts_v2", (q) => q.eq("booking_id", booking.id)), 1);
  const { data: reservation, error: reservationError } = await supabase
    .from("reservations_v2")
    .select("id,operational_status")
    .eq("booking_id", booking.id)
    .single();
  if (reservationError) throw reservationError;
  assert.equal(reservation.operational_status, "confirmed");
  assert.equal(await count(supabase, "messages", (q) => q.eq("conversation_id", booking.conversationId).eq("sender_type", "system")), 1);
  assert.equal(await count(supabase, "notification_queue", (q) => q.eq("booking_id", booking.id).eq("event_type", "booking_confirmed")), 2);
}

async function runIntegration(): Promise<void> {
  const env = requireEnvironment();
  const supabase = createClient(env.url, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let fixture: Fixture | null = null;
  const results: string[] = [];

  try {
    fixture = await createFixture(supabase);

    const dashboardApproval = await createBooking(supabase, fixture, "dashboard-approval");
    await applyHostBookingDecision(supabase, decisionInput(fixture, dashboardApproval.id, "approve", "dashboard"));
    await verifyApproval(supabase, fixture, dashboardApproval);
    const duplicateApproval = await applyHostBookingDecision(
      supabase,
      decisionInput(fixture, dashboardApproval.id, "approve", "dashboard")
    );
    assert.equal(duplicateApproval.status, "already_processed");
    await verifyApproval(supabase, fixture, dashboardApproval);
    results.push("dashboard approval and duplicate approval");

    const signedApproval = await createBooking(supabase, fixture, "signed-approval");
    const signedToken = await createBookingActionToken(supabase, {
      bookingId: signedApproval.id,
      familyId: fixture.familyId,
      hostId: fixture.hostId,
      hostUserId: fixture.hostUserId,
      action: "accept_booking",
      metadata: { staging_fixture: true },
    });
    assert.ok(signedToken);
    const tokenResolution = await consumeBookingActionToken(supabase, {
      token: signedToken.token,
      action: "accept_booking",
    });
    assert.equal(tokenResolution.status, "ready");
    await applyHostBookingDecision(supabase, decisionInput(fixture, signedApproval.id, "approve", "signed_link"));
    await markBookingActionTokensUsed(supabase, { token: signedToken.token, bookingId: signedApproval.id });
    assert.equal(
      (await consumeBookingActionToken(supabase, { token: signedToken.token, action: "accept_booking" })).status,
      "used"
    );
    await verifyApproval(supabase, fixture, signedApproval);
    results.push("signed-link approval and replay protection");

    const whatsappApproval = await createBooking(supabase, fixture, "whatsapp-approval");
    const whatsappAction = await createOrReuseBookingWhatsAppAction(supabase, {
      bookingId: whatsappApproval.id,
      familyId: fixture.familyId,
      hostPhone: "+919999999999",
    });
    assert.ok(whatsappAction?.id && whatsappAction.action_token);
    await queueBookingActionJob(supabase, {
      bookingId: whatsappApproval.id,
      bookingWhatsAppActionId: String(whatsappAction.id),
      actionToken: String(whatsappAction.action_token),
      requestedAction: "approve",
      inboundMessageId: `staging-${randomUUID()}`,
      inboundPhone: "+919999999999",
      payload: { staging_fixture: true },
    });
    const workerResults = await Promise.all([
      processBookingActionJobBatch(supabase),
      processBookingActionJobBatch(supabase),
    ]);
    assert.equal(workerResults.reduce((sum, result) => sum + result.processed, 0), 1);
    const completedAction = await loadOne(supabase, "booking_whatsapp_actions", String(whatsappAction.id));
    assert.equal(completedAction.status, "approved");
    assert.ok(completedAction.completed_at);
    await verifyApproval(supabase, fixture, whatsappApproval);
    results.push("WhatsApp approval and concurrent lease claim");

    const decline = await createBooking(supabase, fixture, "dashboard-decline", {
      withPayout: true,
      withCalendarBlock: true,
    });
    await applyHostBookingDecision(supabase, decisionInput(fixture, decline.id, "decline", "dashboard"));
    assert.equal((await loadOne(supabase, "bookings_v2", decline.id)).status, "rejected");
    assert.equal(await count(supabase, "refund_requests", (q) => q.eq("booking_id", decline.id)), 1);
    assert.equal(await count(supabase, "inventory_event_log", (q) => q.eq("source_reference", decline.id).eq("event_type", "booking_cancelled")), 1);
    assert.equal(await count(supabase, "channel_sync_jobs", (q) => q.eq("family_id", fixture!.familyId).contains("payload", { certification_scenario: "booking_cancelled" })), 1);
    assert.equal(await count(supabase, "notification_queue", (q) => q.eq("booking_id", decline.id).eq("event_type", "booking_rejected")), 2);
    const { data: declinedReservation, error: declinedReservationError } = await supabase
      .from("reservations_v2")
      .select("operational_status")
      .eq("booking_id", decline.id)
      .single();
    if (declinedReservationError) throw declinedReservationError;
    assert.equal(declinedReservation.operational_status, "cancelled");
    assert.equal((await loadOne(supabase, "payouts_v2", (await supabase.from("payouts_v2").select("id").eq("booking_id", decline.id).single()).data!.id)).status, "cancelled");
    const { data: releasedCalendar, error: releasedCalendarError } = await supabase
      .from("calendar_events")
      .select("status,is_blocking")
      .eq("booking_id", decline.id)
      .single();
    if (releasedCalendarError) throw releasedCalendarError;
    assert.equal(releasedCalendar.status, "released");
    assert.equal(releasedCalendar.is_blocking, false);

    const declineCounts = {
      refunds: await count(supabase, "refund_requests", (q) => q.eq("booking_id", decline.id)),
      inventory: await count(supabase, "inventory_event_log", (q) => q.eq("source_reference", decline.id)),
      channel: await count(supabase, "channel_sync_jobs", (q) => q.eq("family_id", fixture!.familyId)),
      notifications: await count(supabase, "notification_queue", (q) => q.eq("booking_id", decline.id)),
    };
    const duplicateDecline = await applyHostBookingDecision(
      supabase,
      decisionInput(fixture, decline.id, "decline", "dashboard")
    );
    assert.equal(duplicateDecline.status, "already_processed");
    assert.deepEqual(
      {
        refunds: await count(supabase, "refund_requests", (q) => q.eq("booking_id", decline.id)),
        inventory: await count(supabase, "inventory_event_log", (q) => q.eq("source_reference", decline.id)),
        channel: await count(supabase, "channel_sync_jobs", (q) => q.eq("family_id", fixture!.familyId)),
        notifications: await count(supabase, "notification_queue", (q) => q.eq("booking_id", decline.id)),
      },
      declineCounts
    );
    results.push("dashboard decline and duplicate-effect checks");

    await assert.rejects(
      applyHostBookingDecision(supabase, decisionInput(fixture, dashboardApproval.id, "decline", "dashboard")),
      (error) => error instanceof HostBookingDecisionError && error.code === "CONFLICTING_DECISION"
    );
    await assert.rejects(
      applyHostBookingDecision(supabase, decisionInput(fixture, decline.id, "approve", "dashboard")),
      (error) => error instanceof HostBookingDecisionError && error.code === "CONFLICTING_DECISION"
    );
    results.push("conflicting terminal decisions");

    const mismatch = await createBooking(supabase, fixture, "host-mismatch");
    const { data: anotherHost, error: anotherHostError } = await supabase
      .from("hosts")
      .select("id")
      .neq("id", fixture.hostId)
      .limit(1)
      .single();
    if (anotherHostError) throw anotherHostError;
    await assert.rejects(
      applyHostBookingDecision(supabase, {
        ...decisionInput(fixture, mismatch.id, "approve", "dashboard"),
        hostId: String(anotherHost.id),
      }),
      (error) => error instanceof HostBookingDecisionError && error.code === "HOST_MISMATCH"
    );
    assert.equal((await loadOne(supabase, "bookings_v2", mismatch.id)).status, "pending_host_approval");
    results.push("host ownership mismatch");

    const retryable = await createBooking(supabase, fixture, "whatsapp-retryable");
    const retryAction = await createOrReuseBookingWhatsAppAction(supabase, {
      bookingId: retryable.id,
      familyId: fixture.familyId,
      hostPhone: "+919999999998",
    });
    assert.ok(retryAction?.id);
    const { error: claimError } = await supabase
      .from("booking_whatsapp_actions")
      .update({ status: "processing", processing_started_at: new Date().toISOString() } as never)
      .eq("id", retryAction.id);
    if (claimError) throw claimError;
    await assert.rejects(
      executeWhatsAppDecisionWithCompletion({
        applyDecision: async () => {
          throw new Error("simulated retryable staging failure");
        },
        completeAction: async () => {
          throw new Error("completion must not run");
        },
        releaseAction: async (error) => {
          const { error: releaseError } = await supabase
            .from("booking_whatsapp_actions")
            .update({
              status: "pending",
              lease_expires_at: null,
              processing_started_at: null,
              last_error: error instanceof Error ? error.message : String(error),
            } as never)
            .eq("id", retryAction.id);
          if (releaseError) throw releaseError;
        },
      }),
      /simulated retryable staging failure/
    );
    const releasedAction = await loadOne(supabase, "booking_whatsapp_actions", String(retryAction.id));
    assert.equal(releasedAction.status, "pending");
    assert.equal(releasedAction.completed_at, null);
    results.push("retryable WhatsApp claim failure");

    const providerEventId = `staging-phase1-${randomUUID()}`;
    fixture.providerEventIds.push(providerEventId);
    const providerEvent = {
      provider: "RAZORPAY" as const,
      eventId: providerEventId,
      eventType: "payment.captured",
      entityType: "payment",
      entityId: "staging-fixture",
      rawPayload: { staging_fixture: true },
      signatureValid: true,
      processingStatus: "received" as const,
    };
    const firstProviderEvent = await storePaymentProviderEvent(supabase, providerEvent);
    const duplicateProviderEvent = await storePaymentProviderEvent(supabase, providerEvent);
    assert.equal(firstProviderEvent.isDuplicate, false);
    assert.equal(duplicateProviderEvent.isDuplicate, true);
    assert.equal(
      await count(supabase, "payment_provider_events", (q) => q.eq("provider", "RAZORPAY").eq("event_id", providerEventId)),
      1
    );
    results.push("payment provider event deduplication");

    console.log(JSON.stringify({ stagingProject: STAGING_PROJECT_REF, passed: results }, null, 2));
  } finally {
    if (fixture) await cleanupFixture(supabase, fixture);
  }
}

async function cleanupFixture(supabase: SupabaseClient, fixture: Fixture): Promise<void> {
  const bookingIds = fixture.bookingIds;
  const { data: reservations } = bookingIds.length
    ? await supabase.from("reservations_v2").select("id").in("booking_id", bookingIds)
    : { data: [] };
  const reservationIds = (reservations ?? []).map((row) => String(row.id));
  const { data: refunds } = bookingIds.length
    ? await supabase.from("refund_requests").select("id").in("booking_id", bookingIds)
    : { data: [] };
  const refundIds = (refunds ?? []).map((row) => String(row.id));

  const remove = async (table: string, column: string, values: string[]) => {
    if (!values.length) return;
    const { error } = await supabase.from(table).delete().in(column, values);
    if (error && !error.message.toLowerCase().includes("does not exist")) throw error;
  };

  await remove("booking_action_jobs", "booking_id", bookingIds);
  await remove("booking_whatsapp_actions", "booking_id", bookingIds);
  await remove("whatsapp_action_tokens", "booking_id", bookingIds);
  await remove("notification_queue", "booking_id", bookingIds);
  await remove("payment_provider_events", "event_id", fixture.providerEventIds);
  await remove("messages", "conversation_id", fixture.conversationIds);
  await remove("booking_status_history_v2", "booking_id", bookingIds);
  await remove("reservation_assignment_history_v2", "reservation_id", reservationIds);
  await remove("reservation_lifecycle_events_v2", "reservation_id", reservationIds);
  await remove("reservation_guests_v2", "reservation_id", reservationIds);
  await remove("folio_line_items_v2", "reservation_id", reservationIds);
  await remove("reservation_folios_v2", "reservation_id", reservationIds);
  await remove("reservation_segments_v2", "reservation_id", reservationIds);
  await remove("reservations_v2", "id", reservationIds);
  await remove("refund_attempts", "refund_request_id", refundIds);
  await remove("refund_requests", "id", refundIds);
  await remove("inventory_event_log", "source_reference", bookingIds);
  await remove("calendar_events", "booking_id", bookingIds);
  await remove("ledger_entries", "booking_id", bookingIds);
  await remove("payouts_v2", "booking_id", bookingIds);
  await remove("payments_v2", "booking_id", bookingIds);
  await remove("host_booking_decisions", "booking_id", bookingIds);
  await remove("bookings_v2", "id", bookingIds);
  if (fixture.legacyBookingIds.length) {
    const { error } = await supabase
      .from("bookings")
      .update({ conversation_id: null } as never)
      .in("id", fixture.legacyBookingIds);
    if (error) throw error;
  }
  await remove("conversations", "id", fixture.conversationIds);
  await remove("bookings", "id", fixture.legacyBookingIds);
  await supabase.from("channel_sync_jobs").delete().eq("family_id", fixture.familyId);
  await supabase.from("inventory_day_projection").delete().eq("family_id", fixture.familyId);
  await supabase.from("channel_rate_plans").delete().eq("family_id", fixture.familyId);
  await supabase.from("channel_room_mappings").delete().eq("family_id", fixture.familyId);
  await supabase.from("channel_properties").delete().eq("family_id", fixture.familyId);
  await supabase.from("stay_units_v2").delete().eq("id", fixture.stayUnitId);
  await supabase.from("hosts").delete().eq("id", fixture.hostId);
  await supabase.from("families").delete().eq("id", fixture.familyId);

  assert.equal(await count(supabase, "bookings_v2", (q) => q.in("id", bookingIds)), 0);
  assert.equal(await count(supabase, "families", (q) => q.eq("id", fixture.familyId)), 0);
}

runIntegration().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
