import type { SupabaseClient } from "@supabase/supabase-js";

import { acknowledgeChannexBookingRevision, getChannexConfigSummary } from "@/lib/channel-providers/channex/client";

type JsonRecord = Record<string, unknown>;

type RevisionRecord = {
  id: string;
  family_id: string;
  external_booking_id: string | null;
  external_revision_id: string | null;
  external_room_type_id: string | null;
  external_rate_plan_id: string | null;
  ota_name: string | null;
  status: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  guest_name: string | null;
  amount: number | null;
  currency: string | null;
  payment_collect: string | null;
  source: string;
  raw_payload: JsonRecord;
  import_status: string;
  ack_status: string;
  linked_booking_id: string | null;
};

export type ChannexAutoApplySummary = {
  autoAppliedCount: number;
  autoImportedCount: number;
  autoCancelledCount: number;
  pendingManualReviewCount: number;
  failedAutoApplyCount: number;
  acknowledgedCount: number;
  lastAutoApplyAt: string | null;
  lastAutoApplyState: "synced" | "needs_review" | "failed_import" | "failed_cancellation_apply" | "waiting_for_manual_review";
  lastAutoApplyMessage: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function normalizeDateOnly(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = trimmed.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return (
    (code === "42703" && message.includes(columnName)) ||
    (message.includes(columnName) && (message.includes("schema cache") || message.includes("does not exist"))) ||
    (columnName === "stay_unit_id" && message === "")
  );
}

async function logAutoApplyResult(input: {
  supabase: SupabaseClient;
  familyId: string;
  status: "success" | "failed";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await input.supabase.from("channel_sync_logs").insert({
    family_id: input.familyId,
    provider_code: "channex",
    action: "auto_process_booking_feed_revisions",
    status: input.status,
    message: input.message,
    payload: input.payload,
  } as never);

  if (error) {
    const message = String(error.message ?? "");
    if (!/relation|does not exist|schema cache/i.test(message)) {
      console.error("[channex-booking-auto-apply] log failed:", error);
    }
  }
}

async function markRevisionFailure(
  supabase: SupabaseClient,
  revision: RevisionRecord,
  importStatus: string,
  message: string,
  kind: "import" | "cancellation"
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("channel_booking_revisions")
    .update({
      import_status: importStatus,
      raw_payload: {
        ...revision.raw_payload,
        last_auto_apply_error: message,
        last_auto_apply_error_at: now,
        last_auto_apply_kind: kind,
      },
      updated_at: now,
    } as never)
    .eq("id", revision.id);
}

async function acknowledgeRevision(
  supabase: SupabaseClient,
  revision: RevisionRecord
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (revision.ack_status === "acknowledged") {
    return { ok: true };
  }
  if (!revision.external_revision_id) {
    return { ok: false, message: "external_revision_id is missing for acknowledgement." };
  }

  const config = getChannexConfigSummary();
  if (config.environment === "production" && !config.productionMutationsAllowed) {
    return { ok: false, message: "Production acknowledgement is blocked by mutation guard." };
  }

  const result = await acknowledgeChannexBookingRevision(revision.external_revision_id);
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  const acknowledgedAt = new Date().toISOString();
  await supabase
    .from("channel_booking_revisions")
    .update({
      ack_status: "acknowledged",
      raw_payload: {
        ...revision.raw_payload,
        acknowledged_at: acknowledgedAt,
        acknowledged_via: "auto_feed_cron",
      },
      updated_at: acknowledgedAt,
    } as never)
    .eq("id", revision.id);

  return { ok: true };
}

async function autoImportNewRevision(
  supabase: SupabaseClient,
  revision: RevisionRecord
): Promise<{ ok: true; bookingId: string } | { ok: false; message: string }> {
  if (!revision.external_booking_id || !revision.arrival_date || !revision.departure_date || !revision.external_room_type_id) {
    return { ok: false, message: "Revision is missing required booking, room, or date fields." };
  }
  if (revision.amount == null || !revision.currency) {
    return { ok: false, message: "Revision amount or currency is missing." };
  }

  if (revision.linked_booking_id) {
    return { ok: true, bookingId: revision.linked_booking_id };
  }

  const { data: roomMappingRow, error: roomMappingError } = await supabase
    .from("channel_room_mappings")
    .select("stay_unit_id")
    .eq("family_id", revision.family_id)
    .eq("provider_code", "channex")
    .eq("external_room_type_id", revision.external_room_type_id)
    .maybeSingle();
  if (roomMappingError) throw roomMappingError;
  const stayUnitId = asStringOrNull(roomMappingRow?.stay_unit_id);
  if (!stayUnitId) {
    return { ok: false, message: "Mapped stay unit was not found for this external room type." };
  }

  const { data: stayUnitRow, error: stayUnitError } = await supabase
    .from("stay_units_v2")
    .select("id,host_id")
    .eq("id", stayUnitId)
    .maybeSingle();
  if (stayUnitError) throw stayUnitError;
  const hostId = asStringOrNull(stayUnitRow?.host_id);
  if (!hostId) {
    return { ok: false, message: "Resolved stay unit is not linked to an active host profile." };
  }

  const { data: existingBooking, error: existingBookingError } = await supabase
    .from("bookings_v2")
    .select("id")
    .eq("host_id", hostId)
    .eq("pricing_snapshot->>channel_provider", "channex")
    .eq("pricing_snapshot->>channel_external_booking_id", revision.external_booking_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingBookingError) throw existingBookingError;

  const now = new Date().toISOString();
  if (existingBooking?.id) {
    const bookingId = asString(existingBooking.id);
    await supabase
      .from("channel_booking_revisions")
      .update({
        import_status: "imported",
        linked_booking_id: bookingId,
        updated_at: now,
      } as never)
      .eq("id", revision.id);
    return { ok: true, bookingId };
  }

  const { data: familyRow, error: familyLookupError } = await supabase
    .from("families")
    .select("user_id")
    .eq("id", revision.family_id)
    .maybeSingle();
  if (familyLookupError) throw familyLookupError;

  const { data: hostRow, error: hostLookupError } = await supabase
    .from("hosts")
    .select("user_id")
    .eq("id", hostId)
    .maybeSingle();
  if (hostLookupError) throw hostLookupError;

  const technicalUserId = asStringOrNull(familyRow?.user_id) ?? asStringOrNull(hostRow?.user_id);
  if (!technicalUserId) {
    return { ok: false, message: "Could not resolve a technical owner user for this OTA import." };
  }

  const guestEmail =
    asStringOrNull(revision.raw_payload.email) ??
    asStringOrNull(revision.raw_payload.guest_email) ??
    asStringOrNull(revision.raw_payload.customer_email);
  const guestPhone =
    asStringOrNull(revision.raw_payload.phone) ??
    asStringOrNull(revision.raw_payload.guest_phone) ??
    asStringOrNull(revision.raw_payload.customer_phone);
  const guestName = revision.guest_name ?? "OTA Guest";
  const amountRounded = Math.round(revision.amount);

  const pricingSnapshot = {
    stay_unit_id: stayUnitId,
    base_price: amountRounded,
    unit_price: amountRounded,
    total_amount: revision.amount.toFixed(2),
    currency: revision.currency,
    channel_provider: "channex",
    channel_source_type: "ota",
    channel_source: revision.source,
    channel_import_source: revision.source,
    channel_external_booking_id: revision.external_booking_id,
    channel_external_revision_id: revision.external_revision_id,
    channel_external_room_type_id: revision.external_room_type_id,
    channel_external_rate_plan_id: revision.external_rate_plan_id,
    channel_booking_revision_id: revision.id,
    payment_collect: revision.payment_collect,
    ota_name: revision.ota_name,
    imported_from_channex_preview: true,
    guest_name: guestName,
    channel_guest_name: guestName,
    channel_guest_email: guestEmail,
    channel_guest_phone: guestPhone,
    channel_guest_hidden: !guestName && !guestEmail && !guestPhone,
    channel_guest_display_name: guestName || "OTA Guest",
    channel_user_id_mode: "technical_owner_placeholder",
    technical_owner_user_id: technicalUserId,
  };

  const bookingPayload: Record<string, unknown> = {
    user_id: technicalUserId,
    booking_type: "host_stay",
    recipient_type: "host",
    recipient_id: hostId,
    product_type: "host_listing",
    product_id: hostId,
    host_id: hostId,
    status: "confirmed",
    start_date: revision.arrival_date,
    end_date: revision.departure_date,
    quarter_type: null,
    quarter_time: null,
    guests_count: 1,
    notes: `Imported automatically from Channex feed ${revision.external_booking_id}.`,
    pricing_snapshot: pricingSnapshot,
    total_price: amountRounded,
    partner_payout_amount: 0,
    payment_status: "not_required",
    cancellation_policy_code: null,
    stay_unit_id: stayUnitId,
  };

  let insertResult;
  try {
    insertResult = await supabase.from("bookings_v2").insert(bookingPayload as never).select("id").single();
  } catch (error) {
    if (!isMissingColumnError(error, "stay_unit_id")) throw error;
    const { stay_unit_id: _ignored, ...fallbackPayload } = bookingPayload;
    insertResult = await supabase.from("bookings_v2").insert(fallbackPayload as never).select("id").single();
  }

  if (insertResult.error && isMissingColumnError(insertResult.error, "stay_unit_id")) {
    const { stay_unit_id: _ignored, ...fallbackPayload } = bookingPayload;
    insertResult = await supabase.from("bookings_v2").insert(fallbackPayload as never).select("id").single();
  }
  if (insertResult.error || !insertResult.data?.id) {
    throw insertResult.error ?? new Error("Unable to create bookings_v2 row.");
  }

  const bookingId = asString(insertResult.data.id);
  await supabase
    .from("channel_booking_revisions")
    .update({
      import_status: "imported",
      linked_booking_id: bookingId,
      updated_at: now,
    } as never)
    .eq("id", revision.id);

  return { ok: true, bookingId };
}

async function autoApplyCancellationRevision(
  supabase: SupabaseClient,
  revision: RevisionRecord
): Promise<{ ok: true; bookingId: string } | { ok: false; message: string }> {
  if (!revision.linked_booking_id) {
    return { ok: false, message: "A linked Famlo booking is required before applying a cancellation." };
  }

  let linkedBookingResult;
  try {
    linkedBookingResult = await supabase
      .from("bookings_v2")
      .select("id,host_id,status,payment_status,total_price,start_date,end_date,pricing_snapshot")
      .eq("id", revision.linked_booking_id)
      .maybeSingle();
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to load linked Famlo booking." };
  }

  if (linkedBookingResult.error) throw linkedBookingResult.error;
  const linkedBooking = asObject(linkedBookingResult.data);
  if (!linkedBooking?.id) {
    return { ok: false, message: "Linked Famlo booking no longer exists." };
  }

  const linkedHostId = asStringOrNull(linkedBooking.host_id);
  if (!linkedHostId) {
    return { ok: false, message: "Linked Famlo booking is missing host ownership." };
  }

  const { data: hostRow, error: hostLookupError } = await supabase
    .from("hosts")
    .select("legacy_family_id")
    .eq("id", linkedHostId)
    .maybeSingle();
  if (hostLookupError) throw hostLookupError;
  if (asStringOrNull(hostRow?.legacy_family_id) && asStringOrNull(hostRow?.legacy_family_id) !== revision.family_id) {
    return { ok: false, message: "Linked Famlo booking does not belong to this property." };
  }

  const now = new Date().toISOString();
  const currentPricingSnapshot = asObject(linkedBooking.pricing_snapshot);
  const nextPricingSnapshot: JsonRecord = {
    ...currentPricingSnapshot,
    channel_provider: "channex",
    channel_source: revision.source,
    channel_import_source: revision.source,
    channel_external_booking_id: revision.external_booking_id,
    channel_external_revision_id: revision.external_revision_id,
    channel_external_room_type_id: revision.external_room_type_id,
    channel_external_rate_plan_id: revision.external_rate_plan_id,
    channel_booking_revision_id: revision.id,
    channel_last_applied_action: "cancellation",
    channel_last_applied_source: revision.source,
    channel_last_applied_at: now,
    channel_cancelled_at: now,
    channel_cancellation: {
      external_revision_id: revision.external_revision_id,
      arrival_date: normalizeDateOnly(revision.arrival_date),
      departure_date: normalizeDateOnly(revision.departure_date),
      raw_payload: revision.raw_payload,
    },
  };

  const existingStatus = asStringOrNull(linkedBooking.status)?.toLowerCase() ?? "";
  await supabase
    .from("bookings_v2")
    .update({
      status: existingStatus === "cancelled" ? linkedBooking.status : "cancelled",
      payment_status: "not_required",
      pricing_snapshot: nextPricingSnapshot,
      updated_at: now,
    } as never)
    .eq("id", revision.linked_booking_id);

  await supabase
    .from("channel_booking_revisions")
    .update({
      import_status: "cancelled_applied",
      ack_status: "not_acknowledged",
      linked_booking_id: revision.linked_booking_id,
      updated_at: now,
    } as never)
    .eq("id", revision.id);

  return { ok: true, bookingId: revision.linked_booking_id };
}

export async function autoProcessPendingChannexFeedRevisions(input: {
  supabase: SupabaseClient;
  familyId: string;
}): Promise<ChannexAutoApplySummary> {
  const config = getChannexConfigSummary();
  const autoApplyAllowed = config.environment !== "production" || config.productionMutationsAllowed;

  const { data: rows, error } = await input.supabase
    .from("channel_booking_revisions")
    .select("id,family_id,external_booking_id,external_revision_id,external_room_type_id,external_rate_plan_id,ota_name,status,arrival_date,departure_date,guest_name,amount,currency,payment_collect,source,raw_payload,import_status,ack_status,linked_booking_id,updated_at")
    .eq("family_id", input.familyId)
    .eq("provider_code", "channex")
    .eq("source", "booking_revision_feed")
    .neq("ack_status", "acknowledged")
    .order("updated_at", { ascending: true });
  if (error) throw error;

  let autoImportedCount = 0;
  let autoCancelledCount = 0;
  let acknowledgedCount = 0;
  let pendingManualReviewCount = 0;
  let failedAutoApplyCount = 0;
  let lastAutoApplyAt: string | null = null;
  let lastAutoApplyState: ChannexAutoApplySummary["lastAutoApplyState"] = "synced";
  let lastAutoApplyMessage = "No pending Channex feed revisions needed auto-apply work.";

  for (const rawRow of (rows ?? []) as Array<Record<string, unknown>>) {
    const revision: RevisionRecord = {
      id: asString(rawRow.id),
      family_id: asString(rawRow.family_id),
      external_booking_id: asStringOrNull(rawRow.external_booking_id),
      external_revision_id: asStringOrNull(rawRow.external_revision_id),
      external_room_type_id: asStringOrNull(rawRow.external_room_type_id),
      external_rate_plan_id: asStringOrNull(rawRow.external_rate_plan_id),
      ota_name: asStringOrNull(rawRow.ota_name),
      status: asStringOrNull(rawRow.status),
      arrival_date: asStringOrNull(rawRow.arrival_date),
      departure_date: asStringOrNull(rawRow.departure_date),
      guest_name: asStringOrNull(rawRow.guest_name),
      amount: asNumberOrNull(rawRow.amount),
      currency: asStringOrNull(rawRow.currency),
      payment_collect: asStringOrNull(rawRow.payment_collect),
      source: asStringOrNull(rawRow.source) ?? "booking_revision_feed",
      raw_payload: asObject(rawRow.raw_payload),
      import_status: asStringOrNull(rawRow.import_status) ?? "preview",
      ack_status: asStringOrNull(rawRow.ack_status) ?? "not_acknowledged",
      linked_booking_id: asStringOrNull(rawRow.linked_booking_id),
    };

    const status = (revision.status ?? "").toLowerCase();

    if (status === "new") {
      if (!autoApplyAllowed) {
        pendingManualReviewCount += 1;
        lastAutoApplyState = "waiting_for_manual_review";
        lastAutoApplyMessage = "Auto-import is waiting because production Channex mutations are blocked.";
        continue;
      }

      try {
        const importResult = await autoImportNewRevision(input.supabase, revision);
        if (!importResult.ok) {
          failedAutoApplyCount += 1;
          lastAutoApplyState = "failed_import";
          lastAutoApplyMessage = importResult.message;
          await markRevisionFailure(input.supabase, revision, "failed", importResult.message, "import");
          continue;
        }
        autoImportedCount += 1;
        lastAutoApplyAt = new Date().toISOString();
        const ackResult = await acknowledgeRevision(input.supabase, revision);
        if (!ackResult.ok) {
          failedAutoApplyCount += 1;
          lastAutoApplyState = "failed_import";
          lastAutoApplyMessage = ackResult.message;
          await markRevisionFailure(input.supabase, revision, "imported", ackResult.message, "import");
          continue;
        }
        acknowledgedCount += 1;
        lastAutoApplyState = "synced";
        lastAutoApplyMessage = "New Booking.com revisions were imported and acknowledged automatically.";
      } catch (processingError) {
        const message = processingError instanceof Error ? processingError.message : "Auto-import failed.";
        failedAutoApplyCount += 1;
        lastAutoApplyState = "failed_import";
        lastAutoApplyMessage = message;
        await markRevisionFailure(input.supabase, revision, "failed", message, "import");
      }
      continue;
    }

    if (status === "cancelled") {
      if (!autoApplyAllowed) {
        pendingManualReviewCount += 1;
        lastAutoApplyState = "waiting_for_manual_review";
        lastAutoApplyMessage = "Auto-cancellation apply is waiting because production Channex mutations are blocked.";
        continue;
      }

      try {
        const applyResult = await autoApplyCancellationRevision(input.supabase, revision);
        if (!applyResult.ok) {
          failedAutoApplyCount += 1;
          lastAutoApplyState = "failed_cancellation_apply";
          lastAutoApplyMessage = applyResult.message;
          await markRevisionFailure(input.supabase, revision, "cancelled_apply_failed", applyResult.message, "cancellation");
          continue;
        }
        autoCancelledCount += 1;
        lastAutoApplyAt = new Date().toISOString();
        const ackResult = await acknowledgeRevision(input.supabase, revision);
        if (!ackResult.ok) {
          failedAutoApplyCount += 1;
          lastAutoApplyState = "failed_cancellation_apply";
          lastAutoApplyMessage = ackResult.message;
          await markRevisionFailure(input.supabase, revision, "cancelled_applied", ackResult.message, "cancellation");
          continue;
        }
        acknowledgedCount += 1;
        lastAutoApplyState = "synced";
        lastAutoApplyMessage = "Cancellation revisions were applied and acknowledged automatically.";
      } catch (processingError) {
        const message = processingError instanceof Error ? processingError.message : "Auto-cancellation apply failed.";
        failedAutoApplyCount += 1;
        lastAutoApplyState = "failed_cancellation_apply";
        lastAutoApplyMessage = message;
        await markRevisionFailure(input.supabase, revision, "cancelled_apply_failed", message, "cancellation");
      }
      continue;
    }

    if (!["modified_pending_review", "modified_applied"].includes(revision.import_status)) {
      await input.supabase
        .from("channel_booking_revisions")
        .update({
          import_status: "modified_pending_review",
          raw_payload: {
            ...revision.raw_payload,
            waiting_for_manual_review: true,
            manual_review_marked_at: new Date().toISOString(),
          },
        } as never)
        .eq("id", revision.id);
    }
    pendingManualReviewCount += 1;
    if (failedAutoApplyCount === 0) {
      lastAutoApplyState = "waiting_for_manual_review";
      lastAutoApplyMessage = "Modification revisions are stored for manual review and are not auto-applied yet.";
    }
  }

  const summary: ChannexAutoApplySummary = {
    autoAppliedCount: autoImportedCount + autoCancelledCount,
    autoImportedCount,
    autoCancelledCount,
    pendingManualReviewCount,
    failedAutoApplyCount,
    acknowledgedCount,
    lastAutoApplyAt,
    lastAutoApplyState,
    lastAutoApplyMessage,
  };

  const { data: propertyRow } = await input.supabase
    .from("channel_properties")
    .select("id,metadata")
    .eq("family_id", input.familyId)
    .eq("provider_code", "channex")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (propertyRow?.id) {
    const metadata = asObject(propertyRow.metadata);
    const health = asObject(metadata.channexFeedHealth);
    await input.supabase
      .from("channel_properties")
      .update({
        metadata: {
          ...metadata,
          channexFeedHealth: {
            ...health,
            autoAppliedCount: summary.autoAppliedCount,
            autoImportedCount: summary.autoImportedCount,
            autoCancelledCount: summary.autoCancelledCount,
            pendingManualReviewCount: summary.pendingManualReviewCount,
            failedAutoApplyCount: summary.failedAutoApplyCount,
            acknowledgedCount: summary.acknowledgedCount,
            lastAutoApplyAt: summary.lastAutoApplyAt,
            lastAutoApplyState: summary.lastAutoApplyState,
            lastAutoApplyMessage: summary.lastAutoApplyMessage,
          },
        },
      } as never)
      .eq("id", propertyRow.id);
  }

  await logAutoApplyResult({
    supabase: input.supabase,
    familyId: input.familyId,
    status: failedAutoApplyCount > 0 ? "failed" : "success",
    message: summary.lastAutoApplyMessage,
    payload: summary,
  });

  return summary;
}
