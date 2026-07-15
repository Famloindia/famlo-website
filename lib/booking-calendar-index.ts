import type { SupabaseClient } from "@supabase/supabase-js";

import { isTruthyEnv } from "@/lib/app-env";
import { getStayNightDateRange, type JsonRecord } from "@/lib/platform-utils";

export type BookingCalendarIndexRow = {
  booking_id: string;
  reservation_id: string | null;
  family_id: string;
  stay_unit_id: string | null;
  rate_plan_id: string | null;
  checkin_date: string;
  checkout_date: string;
  stay_nights: number;
  booking_status: string;
  payment_status: string;
  source_channel: string | null;
  ota_name: string | null;
  guest_display_name: string | null;
  guest_phone_masked: string | null;
  guest_email_masked: string | null;
  room_display_name: string | null;
  property_display_name: string | null;
  channex_booking_id: string | null;
  channex_revision_id: string | null;
  calendar_chip_label: string | null;
  calendar_chip_color_key: string | null;
  total_amount: number | null;
  amount_paid: number | null;
  amount_due: number | null;
  last_inventory_impact_at: string | null;
  last_payment_update_at: string | null;
  last_channex_event_at: string | null;
  source_version: number;
  updated_at?: string;
};

export type BookingCalendarIndexComparisonMismatch = {
  bookingId: string;
  kind: "missing_in_index" | "extra_in_index" | "field_mismatch";
  message: string;
  fields?: string[];
};

export type BookingCalendarIndexComparison = {
  familyId: string;
  dateFrom: string | null;
  dateTo: string | null;
  canonicalCount: number;
  indexCount: number;
  mismatches: BookingCalendarIndexComparisonMismatch[];
};

type BookingComparisonQuery = {
  familyId: string;
  dateFrom?: string | null;
  dateTo?: string | null;
};

type BookingCoreRow = {
  id: string;
  status: string | null;
  payment_status: string | null;
  source_channel: string | null;
  stay_unit_id?: string | null;
  host_id: string | null;
  user_id: string | null;
  start_date: string | null;
  end_date: string | null;
  total_price?: number | string | null;
  payment_id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  pricing_snapshot?: JsonRecord | null;
  hosts?: JsonRecord | JsonRecord[] | null;
  users?: JsonRecord | JsonRecord[] | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asObject(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function firstObject(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) return asObject(value[0]);
  return asObject(value);
}

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

function resolveStayUnitId(row: BookingCoreRow | JsonRecord | null | undefined): string | null {
  const direct = asString((row as JsonRecord | null | undefined)?.stay_unit_id);
  if (direct) return direct;
  const snapshot = asObject((row as JsonRecord | null | undefined)?.pricing_snapshot);
  return asString(snapshot?.stay_unit_id);
}

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  if (local.length <= 2) return `${local[0] ?? "*"}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `******${digits.slice(-4)}`;
}

function resolveChipColorKey(input: {
  bookingStatus: string;
  paymentStatus: string;
  sourceChannel: string | null;
}): string | null {
  const status = input.bookingStatus.toLowerCase();
  const paymentStatus = input.paymentStatus.toLowerCase();
  const sourceChannel = String(input.sourceChannel ?? "").trim().toLowerCase();

  if (status.includes("cancel")) return "cancelled";
  if (paymentStatus.includes("refund")) return "cancelled";
  if (status.includes("pending") || paymentStatus === "pending") return "pending";
  if (sourceChannel === "pms_manual") return "manual_booking";
  if (
    sourceChannel.includes("airbnb") ||
    sourceChannel.includes("booking") ||
    sourceChannel.includes("agoda") ||
    sourceChannel.includes("goibibo") ||
    sourceChannel.includes("mmt") ||
    sourceChannel.includes("ota") ||
    sourceChannel.includes("channex") ||
    sourceChannel.includes("expedia")
  ) {
    return "ota_booking";
  }
  return "famlo_booking";
}

function resolveChipLabel(input: {
  bookingStatus: string;
  guestDisplayName: string | null;
  sourceChannel: string | null;
  otaName: string | null;
}): string | null {
  const status = input.bookingStatus.toLowerCase();
  if (status.includes("cancel")) return "Cancelled";
  if (input.guestDisplayName) return input.guestDisplayName;
  if (input.otaName) return input.otaName;
  if (input.sourceChannel === "pms_manual") return "Manual PMS booking";
  return "Famlo booking";
}

function shouldIndexBooking(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized !== "rejected";
}

async function loadBookingCoreRow(
  supabase: SupabaseClient,
  bookingId: string
): Promise<BookingCoreRow | null> {
  const primarySelect =
    "id,status,payment_status,source_channel,stay_unit_id,host_id,user_id,start_date,end_date,total_price,payment_id,updated_at,created_at,pricing_snapshot,hosts(legacy_family_id),users(name,email,phone)";
  const fallbackSelect =
    "id,status,payment_status,source_channel,host_id,user_id,start_date,end_date,total_price,payment_id,updated_at,created_at,pricing_snapshot,hosts(legacy_family_id),users(name,email,phone)";

  try {
    const result = await supabase.from("bookings_v2").select(primarySelect).eq("id", bookingId).maybeSingle();
    if (result.error) throw result.error;
    return (result.data as BookingCoreRow | null) ?? null;
  } catch (error) {
    if (!isMissingColumnError(error, "stay_unit_id")) throw error;
    const fallback = await supabase.from("bookings_v2").select(fallbackSelect).eq("id", bookingId).maybeSingle();
    if (fallback.error) throw fallback.error;
    return (fallback.data as BookingCoreRow | null) ?? null;
  }
}

async function loadReservationRow(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{ id: string | null; family_id: string | null; stay_unit_id: string | null } | null> {
  const { data, error } = await supabase
    .from("reservations_v2")
    .select("id,family_id,stay_unit_id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error) {
    if (isSchemaCompatibilityError(error)) return null;
    throw error;
  }
  return (data as { id: string | null; family_id: string | null; stay_unit_id: string | null } | null) ?? null;
}

async function loadPaymentRow(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{ amount_total: number | null; status: string | null; paid_at: string | null; updated_at: string | null; created_at: string | null } | null> {
  const result = await supabase
    .from("payments_v2")
    .select("amount_total,status,paid_at,updated_at,created_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    if (isSchemaCompatibilityError(result.error)) return null;
    throw result.error;
  }
  return (result.data as {
    amount_total: number | null;
    status: string | null;
    paid_at: string | null;
    updated_at: string | null;
    created_at: string | null;
  } | null) ?? null;
}

async function loadLatestInventoryImpactAt(supabase: SupabaseClient, bookingId: string): Promise<string | null> {
  const result = await supabase
    .from("inventory_event_log")
    .select("created_at")
    .eq("source_reference", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    if (isSchemaCompatibilityError(result.error)) return null;
    throw result.error;
  }
  return asString((result.data as JsonRecord | null)?.created_at);
}

async function loadLatestRevisionRow(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{ external_booking_id: string | null; external_revision_id: string | null; ota_name: string | null; updated_at: string | null } | null> {
  const result = await supabase
    .from("channel_booking_revisions")
    .select("external_booking_id,external_revision_id,ota_name,updated_at")
    .eq("linked_booking_id", bookingId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    if (isSchemaCompatibilityError(result.error)) return null;
    throw result.error;
  }
  return (result.data as {
    external_booking_id: string | null;
    external_revision_id: string | null;
    ota_name: string | null;
    updated_at: string | null;
  } | null) ?? null;
}

async function loadStayUnitRow(
  supabase: SupabaseClient,
  stayUnitId: string | null
): Promise<{ id: string | null; name: string | null; unit_key?: string | null; legacy_family_id?: string | null } | null> {
  if (!stayUnitId) return null;
  const primary = await supabase
    .from("stay_units_v2")
    .select("id,name,unit_key,legacy_family_id")
    .eq("id", stayUnitId)
    .maybeSingle();
  if (!primary.error) {
    return (primary.data as { id: string | null; name: string | null; unit_key?: string | null; legacy_family_id?: string | null } | null) ?? null;
  }
  if (!isMissingColumnError(primary.error, "unit_key")) {
    if (isSchemaCompatibilityError(primary.error)) return null;
    throw primary.error;
  }
  const fallback = await supabase
    .from("stay_units_v2")
    .select("id,name,legacy_family_id")
    .eq("id", stayUnitId)
    .maybeSingle();
  if (fallback.error) {
    if (isSchemaCompatibilityError(fallback.error)) return null;
    throw fallback.error;
  }
  return (fallback.data as { id: string | null; name: string | null; legacy_family_id?: string | null } | null) ?? null;
}

async function loadFamilyRow(
  supabase: SupabaseClient,
  familyId: string | null
): Promise<{ id: string | null; property_name?: string | null; name?: string | null } | null> {
  if (!familyId) return null;
  const primary = await supabase.from("families").select("id,property_name,name").eq("id", familyId).maybeSingle();
  if (!primary.error) {
    return (primary.data as { id: string | null; property_name?: string | null; name?: string | null } | null) ?? null;
  }
  if (!isMissingColumnError(primary.error, "property_name")) {
    if (isSchemaCompatibilityError(primary.error)) return null;
    throw primary.error;
  }
  const fallback = await supabase.from("families").select("id,name").eq("id", familyId).maybeSingle();
  if (fallback.error) {
    if (isSchemaCompatibilityError(fallback.error)) return null;
    throw fallback.error;
  }
  return (fallback.data as { id: string | null; name?: string | null } | null) ?? null;
}

async function resolveBookingFamilyId(
  supabase: SupabaseClient,
  booking: BookingCoreRow,
  reservation: { family_id: string | null } | null,
  stayUnit: { legacy_family_id?: string | null } | null
): Promise<string | null> {
  const reservationFamilyId = asString(reservation?.family_id);
  if (reservationFamilyId) return reservationFamilyId;

  const hostRelation = firstObject(booking.hosts);
  const embeddedFamilyId = asString(hostRelation?.legacy_family_id);
  if (embeddedFamilyId) return embeddedFamilyId;

  const stayUnitFamilyId = asString(stayUnit?.legacy_family_id);
  if (stayUnitFamilyId) return stayUnitFamilyId;

  const hostId = asString(booking.host_id);
  if (!hostId) return null;
  const { data, error } = await supabase.from("hosts").select("legacy_family_id").eq("id", hostId).maybeSingle();
  if (error) {
    if (isSchemaCompatibilityError(error)) return null;
    throw error;
  }
  return asString((data as JsonRecord | null)?.legacy_family_id);
}

async function loadFamilyHostIds(supabase: SupabaseClient, familyId: string): Promise<string[]> {
  const { data, error } = await supabase.from("hosts").select("id").eq("legacy_family_id", familyId);
  if (error) throw error;
  return ((data ?? []) as JsonRecord[])
    .map((row) => asString(row.id))
    .filter((value): value is string => Boolean(value));
}

async function loadCanonicalBookingIdsForFamily(
  supabase: SupabaseClient,
  input: BookingComparisonQuery
): Promise<string[]> {
  const hostIds = await loadFamilyHostIds(supabase, input.familyId);
  if (hostIds.length === 0) return [];

  const bookingIds: string[] = [];
  const pageSize = 200;
  let from = 0;

  while (true) {
    let query = supabase
      .from("bookings_v2")
      .select("id,host_id,start_date,end_date")
      .in("host_id", hostIds)
      .order("start_date", { ascending: false })
      .range(from, from + pageSize - 1);

    if (input.dateFrom) query = query.gte("end_date", input.dateFrom);
    if (input.dateTo) query = query.lte("start_date", input.dateTo);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as JsonRecord[];
    for (const row of rows) {
      const bookingId = asString(row.id);
      if (bookingId) bookingIds.push(bookingId);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return bookingIds;
}

function normalizeComparisonRow(row: BookingCalendarIndexRow): Record<string, unknown> {
  return {
    booking_id: row.booking_id,
    family_id: row.family_id,
    stay_unit_id: row.stay_unit_id,
    checkin_date: row.checkin_date,
    checkout_date: row.checkout_date,
    stay_nights: row.stay_nights,
    booking_status: row.booking_status,
    payment_status: row.payment_status,
    source_channel: row.source_channel,
    ota_name: row.ota_name,
    guest_display_name: row.guest_display_name,
    room_display_name: row.room_display_name,
    property_display_name: row.property_display_name,
    calendar_chip_label: row.calendar_chip_label,
    calendar_chip_color_key: row.calendar_chip_color_key,
    total_amount: row.total_amount,
    amount_paid: row.amount_paid,
    amount_due: row.amount_due,
  };
}

export function isBookingCalendarIndexEnabled(): boolean {
  return isTruthyEnv(process.env.BOOKING_CALENDAR_INDEX_ENABLED);
}

export function isBookingCalendarIndexReadEnabled(): boolean {
  return isTruthyEnv(process.env.BOOKING_CALENDAR_INDEX_READ_ENABLED);
}

export function isBookingCalendarIndexDualReadEnabled(): boolean {
  return isTruthyEnv(process.env.BOOKING_CALENDAR_INDEX_DUAL_READ_ENABLED);
}

export async function buildBookingCalendarIndexRow(
  supabase: SupabaseClient,
  bookingId: string
): Promise<BookingCalendarIndexRow | null> {
  const booking = await loadBookingCoreRow(supabase, bookingId);
  if (!booking?.id) return null;
  if (!shouldIndexBooking(booking.status)) return null;

  const reservation = await loadReservationRow(supabase, bookingId);
  const stayUnitId = resolveStayUnitId(booking) ?? asString(reservation?.stay_unit_id);
  const stayUnit = await loadStayUnitRow(supabase, stayUnitId);
  const familyId = await resolveBookingFamilyId(supabase, booking, reservation, stayUnit);
  if (!familyId) return null;

  const family = await loadFamilyRow(supabase, familyId);
  const payment = await loadPaymentRow(supabase, bookingId);
  const revision = await loadLatestRevisionRow(supabase, bookingId);
  const lastInventoryImpactAt = await loadLatestInventoryImpactAt(supabase, bookingId);

  const checkinDate = asString(booking.start_date);
  const checkoutDate = asString(booking.end_date);
  if (!checkinDate || !checkoutDate) return null;

  const stayNightRange = getStayNightDateRange(checkinDate, checkoutDate);
  const stayNights = stayNightRange?.nights.length ?? 0;
  const bookingStatus = asString(booking.status) ?? "unknown";
  const paymentStatus = asString(booking.payment_status) ?? "unknown";
  const sourceChannel = asString(booking.source_channel);
  const pricingSnapshot = asObject(booking.pricing_snapshot);
  const guestProfile = firstObject(booking.users);
  const otaName =
    asString(pricingSnapshot?.ota_name) ??
    asString(pricingSnapshot?.channel_source) ??
    asString(revision?.ota_name);
  const guestDisplayName =
    asString(pricingSnapshot?.channel_guest_display_name) ??
    asString(pricingSnapshot?.guest_name) ??
    asString(pricingSnapshot?.channel_guest_name) ??
    asString(guestProfile?.name);
  const guestEmail = asString(pricingSnapshot?.guest_email) ?? asString(pricingSnapshot?.channel_guest_email) ?? asString(guestProfile?.email);
  const guestPhone = asString(pricingSnapshot?.guest_phone) ?? asString(pricingSnapshot?.channel_guest_phone) ?? asString(guestProfile?.phone);
  const totalAmount = asNumber(booking.total_price);
  const amountPaid =
    paymentStatus === "paid" || paymentStatus === "not_required"
      ? totalAmount ?? asNumber(payment?.amount_total)
      : 0;
  const amountDue =
    totalAmount == null || amountPaid == null ? totalAmount : Math.max(0, Number((totalAmount - amountPaid).toFixed(2)));

  return {
    booking_id: booking.id,
    reservation_id: asString(reservation?.id),
    family_id: familyId,
    stay_unit_id: stayUnitId,
    rate_plan_id: null,
    checkin_date: checkinDate,
    checkout_date: checkoutDate,
    stay_nights: stayNights,
    booking_status: bookingStatus,
    payment_status: paymentStatus,
    source_channel: sourceChannel,
    ota_name: otaName,
    guest_display_name: guestDisplayName,
    guest_phone_masked: maskPhone(guestPhone),
    guest_email_masked: maskEmail(guestEmail),
    room_display_name: asString(stayUnit?.name) ?? asString(stayUnit?.unit_key),
    property_display_name: asString(family?.property_name) ?? asString(family?.name),
    channex_booking_id:
      asString(pricingSnapshot?.channel_external_booking_id) ?? asString(revision?.external_booking_id),
    channex_revision_id:
      asString(pricingSnapshot?.channel_external_revision_id) ?? asString(revision?.external_revision_id),
    calendar_chip_label: resolveChipLabel({ bookingStatus, guestDisplayName, sourceChannel, otaName }),
    calendar_chip_color_key: resolveChipColorKey({ bookingStatus, paymentStatus, sourceChannel }),
    total_amount: totalAmount,
    amount_paid: amountPaid,
    amount_due: amountDue,
    last_inventory_impact_at: lastInventoryImpactAt,
    last_payment_update_at: asString(payment?.paid_at) ?? asString(payment?.updated_at) ?? asString(payment?.created_at),
    last_channex_event_at: asString(revision?.updated_at),
    source_version: 1,
    updated_at: new Date().toISOString(),
  };
}

export async function upsertBookingCalendarIndexRow(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{ ok: boolean; row: BookingCalendarIndexRow | null }> {
  const row = await buildBookingCalendarIndexRow(supabase, bookingId);
  if (!row) return { ok: false, row: null };

  const { error } = await supabase
    .from("booking_calendar_index")
    .upsert(row as never, { onConflict: "booking_id" });
  if (error) throw error;
  return { ok: true, row };
}

export async function deleteBookingCalendarIndexRow(supabase: SupabaseClient, bookingId: string): Promise<void> {
  const { error } = await supabase.from("booking_calendar_index").delete().eq("booking_id", bookingId);
  if (error) throw error;
}

export async function syncBookingCalendarIndexBestEffort(
  supabase: SupabaseClient,
  bookingId: string,
  source: string
): Promise<boolean> {
  if (!isBookingCalendarIndexEnabled()) return false;
  try {
    const result = await upsertBookingCalendarIndexRow(supabase, bookingId);
    return result.ok;
  } catch (error) {
    console.error("[booking-calendar-index] sync failed", {
      bookingId,
      source,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function backfillBookingCalendarIndexForFamily(
  supabase: SupabaseClient,
  familyId: string
): Promise<{ familyId: string; processed: number; upserted: number; skipped: number }> {
  const bookingIds = await loadCanonicalBookingIdsForFamily(supabase, { familyId });
  let upserted = 0;
  let skipped = 0;

  for (const bookingId of bookingIds) {
    try {
      const result = await upsertBookingCalendarIndexRow(supabase, bookingId);
      if (result.ok) upserted += 1;
      else skipped += 1;
    } catch (error) {
      console.error("[booking-calendar-index] backfill row failed", {
        familyId,
        bookingId,
        error: error instanceof Error ? error.message : String(error),
      });
      skipped += 1;
    }
  }

  return {
    familyId,
    processed: bookingIds.length,
    upserted,
    skipped,
  };
}

export async function compareBookingListWithIndex(
  supabase: SupabaseClient,
  input: BookingComparisonQuery
): Promise<BookingCalendarIndexComparison> {
  const bookingIds = await loadCanonicalBookingIdsForFamily(supabase, input);
  const canonicalRows = new Map<string, Record<string, unknown>>();

  for (const bookingId of bookingIds) {
    const row = await buildBookingCalendarIndexRow(supabase, bookingId);
    if (row) {
      canonicalRows.set(bookingId, normalizeComparisonRow(row));
    }
  }

  let indexQuery = supabase
    .from("booking_calendar_index")
    .select("*")
    .eq("family_id", input.familyId)
    .order("checkin_date", { ascending: false });

  if (input.dateFrom) indexQuery = indexQuery.gte("checkout_date", input.dateFrom);
  if (input.dateTo) indexQuery = indexQuery.lte("checkin_date", input.dateTo);

  const { data: indexData, error: indexError } = await indexQuery;
  if (indexError) throw indexError;

  const indexRows = new Map<string, Record<string, unknown>>();
  for (const row of ((indexData ?? []) as BookingCalendarIndexRow[])) {
    indexRows.set(row.booking_id, normalizeComparisonRow(row));
  }

  const mismatches: BookingCalendarIndexComparisonMismatch[] = [];

  for (const [bookingId, canonicalRow] of canonicalRows.entries()) {
    const indexRow = indexRows.get(bookingId);
    if (!indexRow) {
      mismatches.push({
        bookingId,
        kind: "missing_in_index",
        message: "Canonical booking is missing from booking_calendar_index.",
      });
      continue;
    }

    const changedFields: string[] = [];
    for (const key of Object.keys(canonicalRow)) {
      if (JSON.stringify(canonicalRow[key]) !== JSON.stringify(indexRow[key])) {
        changedFields.push(key);
      }
    }
    if (changedFields.length > 0) {
      mismatches.push({
        bookingId,
        kind: "field_mismatch",
        message: `Index row differs from canonical booking projection for ${changedFields.join(", ")}.`,
        fields: changedFields,
      });
    }
  }

  for (const bookingId of indexRows.keys()) {
    if (!canonicalRows.has(bookingId)) {
      mismatches.push({
        bookingId,
        kind: "extra_in_index",
        message: "Index row exists without a visible canonical booking row.",
      });
    }
  }

  return {
    familyId: input.familyId,
    dateFrom: input.dateFrom ?? null,
    dateTo: input.dateTo ?? null,
    canonicalCount: canonicalRows.size,
    indexCount: indexRows.size,
    mismatches,
  };
}
