import type { SupabaseClient } from "@supabase/supabase-js";

import { isExternalOtaGuestIdentityMode } from "@/lib/channel-booking-normalization";
import { asNumber, asString, type JsonRecord } from "@/lib/platform-utils";

export type ReservationOperationalStatus =
  | "pending"
  | "awaiting_payment"
  | "pending_host_approval"
  | "accepted"
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "completed"
  | "cancelled"
  | "no_show";

type ReservationLifecycleEventType =
  | "reservation_backfilled"
  | "reservation_created"
  | "status_synced"
  | "modification_requested"
  | "modification_rejected"
  | "modification_applied"
  | "cancellation_applied"
  | "guest_checked_in"
  | "guest_checked_out"
  | "auto_completed"
  | "no_show_marked"
  | "early_checkout_applied"
  | "reassigned";

type BookingReservationRow = JsonRecord & {
  id?: string | null;
  legacy_booking_id?: string | null;
  booking_type?: string | null;
  status?: string | null;
  payment_status?: string | null;
  source_channel?: string | null;
  user_id?: string | null;
  host_id?: string | null;
  stay_unit_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  guests_count?: number | null;
  total_price?: number | null;
  pricing_snapshot?: JsonRecord | null;
  hosts?: JsonRecord | JsonRecord[] | null;
  users?: JsonRecord | JsonRecord[] | null;
};

function isSchemaCompatibilityError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  return (
    code === "42P01" ||
    code === "42703" ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("relation")
  );
}

function asObject(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function firstObject(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) return asObject(value[0]);
  return asObject(value);
}

function resolveReservationGuestIdentity(booking: BookingReservationRow): {
  platformUserId: string | null;
  fullName: string;
  email: string;
  phone: string;
  metadata: JsonRecord;
} {
  const pricingSnapshot = asObject(booking.pricing_snapshot);
  const guestProfile = firstObject(booking.users);
  const externalOtaGuest = isExternalOtaGuestIdentityMode(pricingSnapshot?.channel_user_id_mode);
  const sourceChannel = asString(booking.source_channel);

  if (sourceChannel === "pms_manual") {
    return {
      platformUserId: null,
      fullName: asString(pricingSnapshot?.guest_name) || "Manual PMS Guest",
      email: asString(pricingSnapshot?.guest_email) || "",
      phone: asString(pricingSnapshot?.guest_phone) || "",
      metadata: {
        source: "booking_bridge",
        guest_identity_mode: "manual_pms_guest",
      },
    };
  }

  if (externalOtaGuest) {
    return {
      platformUserId: null,
      fullName: asString(pricingSnapshot?.channel_guest_display_name) || asString(pricingSnapshot?.channel_guest_name) || "OTA Guest",
      email: asString(pricingSnapshot?.channel_guest_email) || "",
      phone: asString(pricingSnapshot?.channel_guest_phone) || "",
      metadata: {
        source: "booking_bridge",
        guest_identity_mode: "external_ota_guest",
        technical_owner_user_id: asString(pricingSnapshot?.technical_owner_user_id),
      },
    };
  }

  return {
    platformUserId: asString(booking.user_id),
    fullName: asString(guestProfile?.name) || "",
    email: asString(guestProfile?.email) || "",
    phone: asString(guestProfile?.phone) || "",
    metadata: {
      source: "booking_bridge",
      guest_identity_mode: "platform_user",
    },
  };
}

function normalizeReservationStatus(status: string | null | undefined): ReservationOperationalStatus {
  const normalized = String(status ?? "").trim().toLowerCase();
  switch (normalized) {
    case "awaiting_payment":
      return "awaiting_payment";
    case "pending_host_approval":
      return "pending_host_approval";
    case "accepted":
      return "accepted";
    case "confirmed":
      return "confirmed";
    case "checked_in":
      return "checked_in";
    case "checked_out":
      return "checked_out";
    case "completed":
      return "completed";
    case "cancelled":
    case "cancelled_by_user":
    case "cancelled_by_partner":
    case "rejected":
    case "refunded":
      return "cancelled";
    case "no_show":
      return "no_show";
    default:
      return "pending";
  }
}

function resolveEventTypeForStatus(
  status: ReservationOperationalStatus,
  fallback: ReservationLifecycleEventType = "status_synced"
): ReservationLifecycleEventType {
  switch (status) {
    case "checked_in":
      return "guest_checked_in";
    case "checked_out":
    case "completed":
      return "guest_checked_out";
    case "cancelled":
      return "cancellation_applied";
    case "no_show":
      return "no_show_marked";
    default:
      return fallback;
  }
}

function buildReservationCode(bookingId: string): string {
  return `RSV-${bookingId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

async function resolveValidStayUnitId(supabase: SupabaseClient, stayUnitId: string | null | undefined): Promise<string | null> {
  const cleanStayUnitId = asString(stayUnitId);
  if (!cleanStayUnitId) return null;
  const { data, error } = await supabase
    .from("stay_units_v2")
    .select("id")
    .eq("id", cleanStayUnitId)
    .maybeSingle();
  if (error) {
    if (isSchemaCompatibilityError(error)) return null;
    throw error;
  }
  return asString((data as JsonRecord | null)?.id);
}

async function loadBookingForReservation(
  supabase: SupabaseClient,
  bookingId: string
): Promise<BookingReservationRow | null> {
  const primarySelect =
    "id,legacy_booking_id,booking_type,status,payment_status,source_channel,user_id,host_id,stay_unit_id,start_date,end_date,guests_count,total_price,pricing_snapshot,hosts(legacy_family_id),users!bookings_v2_user_id_fkey(name,email,phone)";
  const fallbackSelect =
    "id,legacy_booking_id,booking_type,status,payment_status,user_id,host_id,start_date,end_date,guests_count,total_price,pricing_snapshot,hosts(legacy_family_id),users!bookings_v2_user_id_fkey(name,email,phone)";

  const result = await supabase
    .from("bookings_v2")
    .select(primarySelect)
    .eq("id", bookingId)
    .maybeSingle();

  if (!result.error) return (result.data as BookingReservationRow | null) ?? null;
  if (!isSchemaCompatibilityError(result.error)) throw result.error;

  const fallback = await supabase
    .from("bookings_v2")
    .select(fallbackSelect)
    .eq("id", bookingId)
    .maybeSingle();

  if (fallback.error) {
    if (isSchemaCompatibilityError(fallback.error)) return null;
    throw fallback.error;
  }
  return (fallback.data as BookingReservationRow | null) ?? null;
}

async function ensureReservationGuest(
  supabase: SupabaseClient,
  input: { reservationId: string; booking: BookingReservationRow; actorSource: string }
): Promise<void> {
  const guestIdentity = resolveReservationGuestIdentity(input.booking);
  const existing = await supabase
    .from("reservation_guests_v2")
    .select("id")
    .eq("reservation_id", input.reservationId)
    .eq("is_primary", true)
    .maybeSingle();

  if (existing.error) {
    if (isSchemaCompatibilityError(existing.error)) return;
    throw existing.error;
  }

  const payload = {
    reservation_id: input.reservationId,
    platform_user_id: guestIdentity.platformUserId,
    guest_role: "primary",
    guest_type: "adult",
    is_primary: true,
    full_name: guestIdentity.fullName,
    email: guestIdentity.email,
    phone: guestIdentity.phone,
    metadata: {
      ...guestIdentity.metadata,
      source: input.actorSource,
    },
    updated_at: new Date().toISOString(),
  };

  if (existing.data?.id) {
    const { error } = await supabase.from("reservation_guests_v2").update(payload as never).eq("id", existing.data.id);
    if (error && !isSchemaCompatibilityError(error)) throw error;
    return;
  }

  const { error } = await supabase.from("reservation_guests_v2").insert(payload as never);
  if (error && !isSchemaCompatibilityError(error)) throw error;
}

async function ensureReservationFolio(
  supabase: SupabaseClient,
  input: { reservationId: string; booking: BookingReservationRow }
): Promise<string | null> {
  const { data: existing, error: existingError } = await supabase
    .from("reservation_folios_v2")
    .select("id,status")
    .eq("reservation_id", input.reservationId)
    .maybeSingle();
  if (existingError) {
    if (isSchemaCompatibilityError(existingError)) return null;
    throw existingError;
  }

  const status = normalizeReservationStatus(asString(input.booking.status));
  const folioStatus = status === "completed" || status === "cancelled" ? "closed" : "open";
  const currency = asString(asObject(input.booking.pricing_snapshot)?.currency) ?? "INR";

  let folioId = asString(existing?.id);
  if (!folioId) {
    const { data, error } = await supabase
      .from("reservation_folios_v2")
      .insert({
        reservation_id: input.reservationId,
        status: folioStatus,
        currency,
        balance_amount: Math.max(0, asNumber(input.booking.total_price)),
        metadata: {
          source: "booking_bridge",
        },
      } as never)
      .select("id")
      .single();
    if (error) {
      if (isSchemaCompatibilityError(error)) return null;
      throw error;
    }
    folioId = asString((data as JsonRecord | null)?.id);
  } else {
    const { error } = await supabase
      .from("reservation_folios_v2")
      .update({
        status: folioStatus,
        currency,
        balance_amount: Math.max(0, asNumber(input.booking.total_price)),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", folioId);
    if (error && !isSchemaCompatibilityError(error)) throw error;
  }

  if (!folioId) return null;

  const existingCharge = await supabase
    .from("folio_line_items_v2")
    .select("id")
    .eq("folio_id", folioId)
    .eq("line_type", "room_charge")
    .eq("reference_type", "booking_total")
    .eq("reference_id", asString(input.booking.id) ?? "")
    .maybeSingle();
  if (existingCharge.error) {
    if (!isSchemaCompatibilityError(existingCharge.error)) throw existingCharge.error;
    return folioId;
  }

  const amount = Math.max(0, asNumber(input.booking.total_price));
  if (existingCharge.data?.id) {
    const { error } = await supabase
      .from("folio_line_items_v2")
      .update({
        amount,
        currency,
        description: "Initial stay charge mirrored from booking total",
      } as never)
      .eq("id", existingCharge.data.id);
    if (error && !isSchemaCompatibilityError(error)) throw error;
  } else if (amount > 0) {
    const { error } = await supabase.from("folio_line_items_v2").insert({
      folio_id: folioId,
      reservation_id: input.reservationId,
      booking_id: asString(input.booking.id),
      line_type: "room_charge",
      direction: "debit",
      amount,
      currency,
      reference_type: "booking_total",
      reference_id: asString(input.booking.id),
      description: "Initial stay charge mirrored from booking total",
      metadata: {
        source: "booking_bridge",
      },
    } as never);
    if (error && !isSchemaCompatibilityError(error)) throw error;
  }

  return folioId;
}

async function ensureSegmentAndAssignment(
  supabase: SupabaseClient,
  input: { reservationId: string; booking: BookingReservationRow }
): Promise<string | null> {
  const stayUnitId = await resolveValidStayUnitId(
    supabase,
    asString(input.booking.stay_unit_id) ?? asString(asObject(input.booking.pricing_snapshot)?.stay_unit_id)
  );
  const { data: segment, error: segmentError } = await supabase
    .from("reservation_segments_v2")
    .select("id")
    .eq("reservation_id", input.reservationId)
    .eq("segment_index", 1)
    .maybeSingle();
  if (segmentError) {
    if (isSchemaCompatibilityError(segmentError)) return null;
    throw segmentError;
  }

  const reservationStatus = normalizeReservationStatus(asString(input.booking.status));
  const segmentStatus =
    reservationStatus === "checked_in"
      ? "checked_in"
      : reservationStatus === "completed" || reservationStatus === "checked_out"
        ? "checked_out"
        : reservationStatus === "cancelled"
          ? "cancelled"
          : "reserved";

  let segmentId = asString(segment?.id);
  if (!segmentId) {
    const { data, error } = await supabase
      .from("reservation_segments_v2")
      .insert({
        reservation_id: input.reservationId,
        segment_index: 1,
        stay_unit_id: stayUnitId,
        check_in_date: asString(input.booking.start_date),
        check_out_date: asString(input.booking.end_date) ?? asString(input.booking.start_date),
        segment_status: segmentStatus,
        source_booking_id: asString(input.booking.id),
        guests_count: Math.max(1, asNumber(input.booking.guests_count, 1)),
        actual_check_out_date:
          reservationStatus === "completed" || reservationStatus === "checked_out"
            ? asString(input.booking.end_date) ?? asString(input.booking.start_date)
            : null,
        metadata: {
          source: "booking_bridge",
        },
      } as never)
      .select("id")
      .single();
    if (error) {
      if (isSchemaCompatibilityError(error)) return null;
      throw error;
    }
    segmentId = asString((data as JsonRecord | null)?.id);
  } else {
    const { error } = await supabase
      .from("reservation_segments_v2")
      .update({
        stay_unit_id: stayUnitId,
        check_in_date: asString(input.booking.start_date),
        check_out_date: asString(input.booking.end_date) ?? asString(input.booking.start_date),
        segment_status: segmentStatus,
        guests_count: Math.max(1, asNumber(input.booking.guests_count, 1)),
        actual_check_out_date:
          reservationStatus === "completed" || reservationStatus === "checked_out"
            ? asString(input.booking.end_date) ?? asString(input.booking.start_date)
            : null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", segmentId);
    if (error && !isSchemaCompatibilityError(error)) throw error;
  }

  if (!segmentId || !stayUnitId) return segmentId;

  const assignment = await supabase
    .from("reservation_assignment_history_v2")
    .select("id")
    .eq("reservation_id", input.reservationId)
    .eq("segment_id", segmentId)
    .eq("stay_unit_id", stayUnitId)
    .maybeSingle();
  if (assignment.error) {
    if (isSchemaCompatibilityError(assignment.error)) return segmentId;
    throw assignment.error;
  }
  if (!assignment.data?.id) {
    const { error } = await supabase.from("reservation_assignment_history_v2").insert({
      reservation_id: input.reservationId,
      segment_id: segmentId,
      stay_unit_id: stayUnitId,
      event_type: "initial_assignment",
      reason: "Mirrored from booking stay unit",
      metadata: {
        source: "booking_bridge",
      },
    } as never);
    if (error && !isSchemaCompatibilityError(error)) throw error;
  }

  return segmentId;
}

export async function recordReservationLifecycleEvent(
  supabase: SupabaseClient,
  input: {
    reservationId: string;
    bookingId?: string | null;
    segmentId?: string | null;
    eventType: ReservationLifecycleEventType;
    fromStatus?: string | null;
    toStatus?: string | null;
    actorUserId?: string | null;
    actorRole?: string | null;
    source: string;
    idempotencyKey?: string | null;
    payload?: JsonRecord;
  }
): Promise<void> {
  const { error } = await supabase.from("reservation_lifecycle_events_v2").insert({
    reservation_id: input.reservationId,
    booking_id: input.bookingId ?? null,
    segment_id: input.segmentId ?? null,
    event_type: input.eventType,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    actor_user_id: input.actorUserId ?? null,
    actor_role: input.actorRole ?? null,
    source: input.source,
    idempotency_key: input.idempotencyKey ?? null,
    payload: input.payload ?? {},
  } as never);
  if (error && !isSchemaCompatibilityError(error)) {
    if (String((error as { code?: string }).code ?? "") === "23505") return;
    throw error;
  }
}

export async function ensureReservationForBooking(
  supabase: SupabaseClient,
  input: { bookingId: string; source?: string; sourceKind?: "direct" | "ota" | "manual" | "migration" }
): Promise<{ reservationId: string | null; segmentId: string | null; folioId: string | null }> {
  const booking = await loadBookingForReservation(supabase, input.bookingId);
  if (!booking?.id) return { reservationId: null, segmentId: null, folioId: null };

  const existing = await supabase
    .from("reservations_v2")
    .select("id,operational_status")
    .eq("booking_id", input.bookingId)
    .maybeSingle();
  if (existing.error) {
    if (isSchemaCompatibilityError(existing.error)) return { reservationId: null, segmentId: null, folioId: null };
    throw existing.error;
  }

  const hostRelation = firstObject(booking.hosts);
  const pricingSnapshot = asObject(booking.pricing_snapshot);
  const guestIdentity = resolveReservationGuestIdentity(booking);
  const validStayUnitId = await resolveValidStayUnitId(
    supabase,
    asString(booking.stay_unit_id) ?? asString(pricingSnapshot?.stay_unit_id)
  );
  const reservationStatus = normalizeReservationStatus(asString(booking.status));
  const sourceChannel = asString(booking.source_channel) ?? asString(pricingSnapshot?.channel_provider) ?? "famlo_direct";
  const sourceKind = input.sourceKind ?? (sourceChannel === "famlo_direct" ? "direct" : "ota");

  const reservationPayload = {
    booking_id: asString(booking.id),
    legacy_booking_id: asString(booking.legacy_booking_id),
    reservation_code: buildReservationCode(String(booking.id)),
    operational_status: reservationStatus,
    source_kind: sourceKind,
    source_channel: sourceChannel,
    primary_guest_user_id: guestIdentity.platformUserId,
    host_id: asString(booking.host_id),
    family_id: asString(hostRelation?.legacy_family_id),
    stay_unit_id: validStayUnitId,
    assignment_status: validStayUnitId ? "assigned" : "unassigned",
    check_in_date: asString(booking.start_date),
    check_out_date: asString(booking.end_date) ?? asString(booking.start_date),
    adults_count: Math.max(1, asNumber(booking.guests_count, 1)),
    children_count: 0,
    currency: asString(pricingSnapshot?.currency) ?? "INR",
    total_amount: Math.max(0, asNumber(booking.total_price)),
    folio_status: reservationStatus === "completed" || reservationStatus === "cancelled" ? "closed" : "open",
    metadata: {
      booking_type: asString(booking.booking_type),
      payment_status: asString(booking.payment_status),
      bridge_source: input.source ?? "booking_bridge",
    },
    updated_at: new Date().toISOString(),
  };

  let reservationId = asString(existing.data?.id);
  if (!reservationId) {
    const { data, error } = await supabase
      .from("reservations_v2")
      .insert(reservationPayload as never)
      .select("id")
      .single();
    if (error) {
      if (isSchemaCompatibilityError(error)) return { reservationId: null, segmentId: null, folioId: null };
      throw error;
    }
    reservationId = asString((data as JsonRecord | null)?.id);
  } else {
    const { error } = await supabase.from("reservations_v2").update(reservationPayload as never).eq("id", reservationId);
    if (error && !isSchemaCompatibilityError(error)) throw error;
  }

  if (!reservationId) return { reservationId: null, segmentId: null, folioId: null };

  const segmentId = await ensureSegmentAndAssignment(supabase, {
    reservationId,
    booking,
  });
  await ensureReservationGuest(supabase, {
    reservationId,
    booking,
    actorSource: input.source ?? "booking_bridge",
  });
  const folioId = await ensureReservationFolio(supabase, {
    reservationId,
    booking,
  });

  const lifecycleEvent = existing.data?.id ? "status_synced" : "reservation_created";
  const idempotencyKey = `${lifecycleEvent}:${booking.id}:${reservationStatus}:${input.source ?? "booking_bridge"}`;
  await recordReservationLifecycleEvent(supabase, {
    reservationId,
    bookingId: asString(booking.id),
    segmentId,
    eventType: lifecycleEvent,
    fromStatus: asString(existing.data?.operational_status),
    toStatus: reservationStatus,
    source: input.source ?? "booking_bridge",
    idempotencyKey,
    payload: {
      payment_status: asString(booking.payment_status),
      source_channel: sourceChannel,
    },
  });

  return { reservationId, segmentId, folioId };
}

export async function syncReservationFromBooking(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    source: string;
    actorUserId?: string | null;
    actorRole?: string | null;
    eventType?: ReservationLifecycleEventType;
    idempotencyKey?: string | null;
    payload?: JsonRecord;
  }
): Promise<string | null> {
  const booking = await loadBookingForReservation(supabase, input.bookingId);
  if (!booking?.id) return null;

  const existingReservation = await supabase
    .from("reservations_v2")
    .select("id,operational_status")
    .eq("booking_id", input.bookingId)
    .maybeSingle();
  if (existingReservation.error) {
    if (isSchemaCompatibilityError(existingReservation.error)) return null;
    throw existingReservation.error;
  }

  const previousStatus = asString(existingReservation.data?.operational_status);
  const { reservationId, segmentId } = await ensureReservationForBooking(supabase, {
    bookingId: input.bookingId,
    source: input.source,
  });
  if (!reservationId) return null;

  const nextStatus = normalizeReservationStatus(asString(booking.status));
  const eventType = input.eventType ?? resolveEventTypeForStatus(nextStatus);
  const idempotencyKey =
    input.idempotencyKey ?? `${eventType}:${input.bookingId}:${nextStatus}:${input.source}`;

  await recordReservationLifecycleEvent(supabase, {
    reservationId,
    bookingId: input.bookingId,
    segmentId,
    eventType,
    fromStatus: previousStatus,
    toStatus: nextStatus,
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
    source: input.source,
    idempotencyKey,
    payload: input.payload ?? {},
  });

  return reservationId;
}

export async function recordReservationModificationRequest(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    modificationId: string | null;
    requestedByUserId?: string | null;
    payload?: JsonRecord;
  }
): Promise<void> {
  const reservationId = await syncReservationFromBooking(supabase, {
    bookingId: input.bookingId,
    source: "booking_modification_request",
    actorUserId: input.requestedByUserId ?? null,
    actorRole: "guest",
    eventType: "modification_requested",
    idempotencyKey: input.modificationId ? `modification_requested:${input.modificationId}` : null,
    payload: {
      modification_id: input.modificationId,
      ...(input.payload ?? {}),
    },
  });
  if (!reservationId) return;
}

export async function setReservationOperationalStatus(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    status: ReservationOperationalStatus;
    source: string;
    eventType: ReservationLifecycleEventType;
    actorUserId?: string | null;
    actorRole?: string | null;
    payload?: JsonRecord;
    idempotencyKey?: string | null;
  }
): Promise<string | null> {
  const existing = await supabase
    .from("reservations_v2")
    .select("id,operational_status")
    .eq("booking_id", input.bookingId)
    .maybeSingle();
  if (existing.error) {
    if (isSchemaCompatibilityError(existing.error)) return null;
    throw existing.error;
  }

  const reservationId =
    asString(existing.data?.id) ??
    (
      await ensureReservationForBooking(supabase, {
        bookingId: input.bookingId,
        source: input.source,
      })
    ).reservationId;
  if (!reservationId) return null;

  const { error } = await supabase
    .from("reservations_v2")
    .update({
      operational_status: input.status,
      folio_status: input.status === "completed" || input.status === "cancelled" || input.status === "no_show" ? "closed" : "open",
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", reservationId);
  if (error && !isSchemaCompatibilityError(error)) throw error;

  const segmentStatus =
    input.status === "checked_in"
      ? "checked_in"
      : input.status === "checked_out" || input.status === "completed"
        ? "checked_out"
        : input.status === "cancelled" || input.status === "no_show"
          ? "cancelled"
          : "reserved";
  const { error: segmentError } = await supabase
    .from("reservation_segments_v2")
    .update({
      segment_status: segmentStatus,
      actual_check_out_date:
        input.status === "checked_out" || input.status === "completed" || input.status === "no_show"
          ? new Date().toISOString().slice(0, 10)
          : null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("reservation_id", reservationId)
    .eq("segment_index", 1);
  if (segmentError && !isSchemaCompatibilityError(segmentError)) throw segmentError;

  await recordReservationLifecycleEvent(supabase, {
    reservationId,
    bookingId: input.bookingId,
    eventType: input.eventType,
    fromStatus: asString(existing.data?.operational_status),
    toStatus: input.status,
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
    source: input.source,
    idempotencyKey: input.idempotencyKey ?? `${input.eventType}:${input.bookingId}:${input.status}:${input.source}`,
    payload: input.payload ?? {},
  });

  return reservationId;
}
