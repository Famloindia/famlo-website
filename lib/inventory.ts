import type { SupabaseClient } from "@supabase/supabase-js";

import { addIndiaDays, getTodayInIndia } from "@/lib/booking-time";
import { isHostBookingInventoryBlocking } from "@/lib/host-booking-state";
import { asString, enumerateDateRange, type JsonRecord } from "@/lib/platform-utils";

export type InventoryEventType =
  | "manual_block_set"
  | "manual_block_removed"
  | "manual_rate_set"
  | "manual_rate_removed"
  | "booking_hold_created"
  | "booking_hold_released"
  | "booking_confirmed"
  | "booking_cancelled"
  | "booking_modified"
  | "restriction_updated"
  | "ota_sync_applied"
  | "legacy_manual_block_imported";

export type InventoryProjectionDay = {
  familyId: string;
  stayUnitId: string;
  date: string;
  timezone: string;
  currency: string;
  baseRate: number;
  effectiveRate: number;
  rateSource: string;
  isBlocked: boolean;
  blockReason: string | null;
  isSellable: boolean;
  availableUnits: number;
  allotmentLimit: number;
  confirmedUnits: number;
  holdUnits: number;
  cta: boolean;
  ctd: boolean;
  minStay: number;
  minStayArrival: number;
  maxStay: number;
  stopSell: boolean;
  manualBlockPresent: boolean;
  lastEventId?: string | null;
  metadata?: JsonRecord;
};

type StayUnitInventoryRow = {
  id: string;
  host_id: string | null;
  legacy_family_id: string | null;
  price_morning: number | null;
  price_afternoon: number | null;
  price_evening: number | null;
  price_fullday: number | null;
  inventory_mode?: string | null;
  inventory_allotment?: number | null;
};

type InventoryRuleSet = {
  timezone: string;
  currency: string;
  bookingWindowDays: number;
  leadTimeHours: number;
  minStayDays: number;
  minStayArrivalDays: number;
  maxStayDays: number;
  ctaDefault: boolean;
  ctdDefault: boolean;
  stopSellDefault: boolean;
  baseAllotment: number;
};

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function isSchemaCompatibilityError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  return (
    record.code === "42P01" ||
    record.code === "42703" ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("relation")
  );
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const candidate = trimmed.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

function pickBaseRate(row: StayUnitInventoryRow): number {
  return Math.max(
    0,
    asNumber(row.price_fullday) ||
      asNumber(row.price_afternoon) ||
      asNumber(row.price_morning) ||
      asNumber(row.price_evening) ||
      0
  );
}

export function normalizeInventoryRateAmount(value: unknown): number {
  const amount = Math.max(0, asNumber(value));
  return Number(amount.toFixed(2));
}

function normalizeAllotment(row: StayUnitInventoryRow, rules: InventoryRuleSet): number {
  const mode = asString(row.inventory_mode) ?? "physical_unit";
  const explicitAllotment = Math.max(1, Math.trunc(asNumber(row.inventory_allotment, 1)));
  if (mode === "room_type_bucket") {
    return Math.max(1, explicitAllotment, rules.baseAllotment);
  }
  return 1;
}

function mapProjectionRow(row: JsonRecord): InventoryProjectionDay {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as JsonRecord)
      : {};

  return {
    familyId: asString(row.family_id) ?? "",
    stayUnitId: asString(row.stay_unit_id) ?? "",
    date: asString(row.date) ?? "",
    timezone: asString(row.timezone) ?? "Asia/Kolkata",
    currency: asString(row.currency) ?? "INR",
    baseRate: asNumber(row.base_rate),
    effectiveRate: asNumber(row.effective_rate),
    rateSource: asString(row.rate_source) ?? "stay_units_v2",
    isBlocked: Boolean(row.is_blocked),
    blockReason: asString(row.block_reason),
    isSellable: Boolean(row.is_sellable),
    availableUnits: asNumber(row.available_units),
    allotmentLimit: asNumber(row.allotment_limit, 1),
    confirmedUnits: asNumber(row.confirmed_units),
    holdUnits: asNumber(row.hold_units),
    cta: Boolean(row.cta),
    ctd: Boolean(row.ctd),
    minStay: asNumber(row.min_stay, 1),
    minStayArrival: asNumber(metadata.min_stay_arrival, asNumber(row.min_stay, 1)),
    maxStay: asNumber(row.max_stay, 30),
    stopSell: Boolean(row.stop_sell),
    manualBlockPresent: Boolean(row.manual_block_present),
    lastEventId: asString(row.last_event_id),
    metadata,
  };
}

async function loadStayUnit(
  supabase: SupabaseClient,
  stayUnitId: string
): Promise<StayUnitInventoryRow | null> {
  const withInventory = await supabase
    .from("stay_units_v2")
    .select("id,host_id,legacy_family_id,price_morning,price_afternoon,price_evening,price_fullday,inventory_mode,inventory_allotment")
    .eq("id", stayUnitId)
    .maybeSingle();

  if (!withInventory.error) return withInventory.data as StayUnitInventoryRow | null;
  if (!isSchemaCompatibilityError(withInventory.error)) throw withInventory.error;

  const fallback = await supabase
    .from("stay_units_v2")
    .select("id,host_id,legacy_family_id,price_morning,price_afternoon,price_evening,price_fullday")
    .eq("id", stayUnitId)
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  return fallback.data as StayUnitInventoryRow | null;
}

async function loadRules(
  supabase: SupabaseClient,
  input: { familyId: string; stayUnitId: string; fallbackAllotment: number }
): Promise<InventoryRuleSet> {
  const defaults: InventoryRuleSet = {
    timezone: "Asia/Kolkata",
    currency: "INR",
    bookingWindowDays: 365,
    leadTimeHours: 0,
    minStayDays: 1,
    minStayArrivalDays: 1,
    maxStayDays: 30,
    ctaDefault: false,
    ctdDefault: false,
    stopSellDefault: false,
    baseAllotment: Math.max(1, input.fallbackAllotment),
  };

  const [{ data: settings }, roomRules, propertyRules, legacyRoomRules, legacyPropertyRules] = await Promise.all([
    supabase
      .from("host_pro_settings")
      .select("timezone,currency")
      .eq("family_id", input.familyId)
      .maybeSingle(),
    supabase
      .from("inventory_rule_sets")
      .select("*")
      .eq("family_id", input.familyId)
      .eq("stay_unit_id", input.stayUnitId)
      .maybeSingle(),
    supabase
      .from("inventory_rule_sets")
      .select("*")
      .eq("family_id", input.familyId)
      .is("stay_unit_id", null)
      .maybeSingle(),
    supabase
      .from("inventory_rules_v2")
      .select("*")
      .eq("owner_type", "stay_unit")
      .eq("owner_id", input.stayUnitId)
      .maybeSingle(),
    supabase
      .from("inventory_rules_v2")
      .select("*")
      .eq("owner_type", "family")
      .eq("owner_id", input.familyId)
      .maybeSingle(),
  ]);

  const canonicalSource = !roomRules.error ? roomRules.data : !propertyRules.error ? propertyRules.data : null;
  const legacySource = !legacyRoomRules.error ? legacyRoomRules.data : !legacyPropertyRules.error ? legacyPropertyRules.data : null;
  const source = (canonicalSource ?? legacySource ?? {}) as JsonRecord;

  return {
    timezone: asString((settings as JsonRecord | null)?.timezone) ?? asString(source.timezone) ?? defaults.timezone,
    currency: asString((settings as JsonRecord | null)?.currency) ?? asString(source.currency) ?? defaults.currency,
    bookingWindowDays: asNumber(source.booking_window_days, defaults.bookingWindowDays),
    leadTimeHours: asNumber(source.lead_time_hours, defaults.leadTimeHours),
    minStayDays: asNumber(source.min_stay_days, defaults.minStayDays),
    minStayArrivalDays: asNumber(source.min_stay_arrival_days, asNumber(source.min_stay_days, defaults.minStayDays)),
    maxStayDays: Math.max(
      asNumber(source.min_stay_days, defaults.minStayDays),
      asNumber(source.max_stay_days, defaults.maxStayDays)
    ),
    ctaDefault: asBoolean(source.cta_default, defaults.ctaDefault),
    ctdDefault: asBoolean(source.ctd_default, defaults.ctdDefault),
    stopSellDefault: asBoolean(source.stop_sell_default, defaults.stopSellDefault),
    baseAllotment: Math.max(1, asNumber(source.base_allotment, defaults.baseAllotment)),
  };
}

async function loadInventoryEvents(
  supabase: SupabaseClient,
  input: { familyId: string; stayUnitId: string; from: string; to: string }
): Promise<JsonRecord[]> {
  const result = await supabase
    .from("inventory_event_log")
    .select("*")
    .eq("family_id", input.familyId)
    .eq("stay_unit_id", input.stayUnitId)
    .lte("effective_date_start", input.to)
    .gte("effective_date_end", input.from)
    .order("created_at", { ascending: true });

  if (result.error) {
    if (isSchemaCompatibilityError(result.error)) return [];
    throw result.error;
  }
  return (result.data ?? []) as JsonRecord[];
}

async function loadActiveBookings(
  supabase: SupabaseClient,
  input: { stayUnitId: string; from: string; to: string; excludeBookingId?: string | null }
): Promise<JsonRecord[]> {
  let query = supabase
    .from("bookings_v2")
    .select("id,status,payment_status,start_date,end_date,hold_expires_at,stay_unit_id,pricing_snapshot")
    .eq("stay_unit_id", input.stayUnitId)
    .lte("start_date", input.to)
    .gte("end_date", input.from);

  if (input.excludeBookingId) {
    query = query.neq("id", input.excludeBookingId);
  }

  const result = await query;
  if (!result.error) return (result.data ?? []) as JsonRecord[];
  if (!isSchemaCompatibilityError(result.error)) throw result.error;

  let fallback = supabase
    .from("bookings_v2")
    .select("id,status,payment_status,start_date,end_date,hold_expires_at,pricing_snapshot")
    .eq("pricing_snapshot->>stay_unit_id", input.stayUnitId)
    .lte("start_date", input.to)
    .gte("end_date", input.from);
  if (input.excludeBookingId) {
    fallback = fallback.neq("id", input.excludeBookingId);
  }
  const fallbackResult = await fallback;
  if (fallbackResult.error) throw fallbackResult.error;
  return (fallbackResult.data ?? []) as JsonRecord[];
}

function isHoldBooking(row: JsonRecord): boolean {
  return asString(row.status)?.toLowerCase() === "awaiting_payment";
}

function isActiveHold(row: JsonRecord, now: Date): boolean {
  const holdExpiresAt = asString(row.hold_expires_at);
  if (!holdExpiresAt) return false;
  return Date.parse(holdExpiresAt) > now.getTime();
}

function bookingBlocksInventory(row: JsonRecord, now: Date): boolean {
  const status = asString(row.status);
  const paymentStatus = asString(row.payment_status);
  if (isHoldBooking(row)) return isActiveHold(row, now);
  return isHostBookingInventoryBlocking(status, paymentStatus);
}

function latestEventForDate(events: JsonRecord[], date: string, eventTypes: InventoryEventType[]): JsonRecord | null {
  let latest: JsonRecord | null = null;
  for (const event of events) {
    const eventType = asString(event.event_type) as InventoryEventType | null;
    if (!eventType || !eventTypes.includes(eventType)) continue;
    const start = normalizeDate(asString(event.effective_date_start));
    const end = normalizeDate(asString(event.effective_date_end));
    if (!start || !end || date < start || date > end) continue;
    latest = event;
  }
  return latest;
}

function projectDay(input: {
  familyId: string;
  stayUnit: StayUnitInventoryRow;
  rules: InventoryRuleSet;
  events: JsonRecord[];
  bookings: JsonRecord[];
  date: string;
  now: Date;
}): InventoryProjectionDay & { lastEventId: string | null; metadata: JsonRecord } {
  const baseRate = pickBaseRate(input.stayUnit);
  const allotmentLimit = normalizeAllotment(input.stayUnit, input.rules);
  const rateEvent = latestEventForDate(input.events, input.date, ["manual_rate_set", "manual_rate_removed"]);
  const blockEvent = latestEventForDate(input.events, input.date, [
    "manual_block_set",
    "manual_block_removed",
    "legacy_manual_block_imported",
  ]);
  const restrictionEvent = latestEventForDate(input.events, input.date, ["restriction_updated"]);

  const ratePayload = (rateEvent?.payload as JsonRecord | null) ?? {};
  const restrictionPayload = (restrictionEvent?.payload as JsonRecord | null) ?? {};
  const manualRateAmount =
    asString(rateEvent?.event_type) === "manual_rate_set" ? normalizeInventoryRateAmount(ratePayload.amount) : 0;
  const effectiveRate = manualRateAmount > 0 ? manualRateAmount : baseRate;
  const rateSource = manualRateAmount > 0 ? "manual_rate" : "stay_units_v2";
  const manualBlockPresent =
    asString(blockEvent?.event_type) === "manual_block_set" ||
    asString(blockEvent?.event_type) === "legacy_manual_block_imported";

  let confirmedUnits = 0;
  let holdUnits = 0;
  for (const booking of input.bookings) {
    const start = normalizeDate(asString(booking.start_date));
    const end = normalizeDate(asString(booking.end_date)) ?? start;
    if (!start || !end || input.date < start || input.date > end) continue;
    if (!bookingBlocksInventory(booking, input.now)) continue;
    if (isHoldBooking(booking)) {
      holdUnits += 1;
    } else {
      confirmedUnits += 1;
    }
  }

  const cta = asBoolean(restrictionPayload.cta, input.rules.ctaDefault);
  const ctd = asBoolean(restrictionPayload.ctd, input.rules.ctdDefault);
  const minStay = Math.max(1, asNumber(restrictionPayload.min_stay, input.rules.minStayDays));
  const minStayArrival = Math.max(1, asNumber(restrictionPayload.min_stay_arrival, input.rules.minStayArrivalDays));
  const maxStay = Math.max(minStay, asNumber(restrictionPayload.max_stay, input.rules.maxStayDays));
  const stopSell = asBoolean(restrictionPayload.stop_sell, input.rules.stopSellDefault);
  const availableUnits = Math.max(0, allotmentLimit - confirmedUnits - holdUnits);
  const isBlocked = stopSell || manualBlockPresent || availableUnits <= 0;
  const blockReason = stopSell
    ? "stop_sell"
    : manualBlockPresent
      ? "manual_block"
      : availableUnits <= 0
        ? "sold_out"
        : null;

  return {
    familyId: input.familyId,
    stayUnitId: input.stayUnit.id,
    date: input.date,
    timezone: input.rules.timezone,
    currency: input.rules.currency,
    baseRate,
    effectiveRate,
    rateSource,
    isBlocked,
    blockReason,
    isSellable: !isBlocked,
    availableUnits,
    allotmentLimit,
    confirmedUnits,
    holdUnits,
    cta,
    ctd,
    minStay,
    minStayArrival,
    maxStay,
    stopSell,
    manualBlockPresent,
    lastEventId: asString(restrictionEvent?.id) ?? asString(rateEvent?.id) ?? asString(blockEvent?.id),
    metadata: {
      inventory_mode: asString(input.stayUnit.inventory_mode) ?? "physical_unit",
      hold_expiry_authoritative: true,
      min_stay_arrival: minStayArrival,
    },
  };
}

async function logProjectionRun(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    stayUnitId: string;
    from: string;
    to: string;
    status: "success" | "failed" | "partial";
    rowsWritten?: number;
    errorMessage?: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from("inventory_projection_runs").insert({
    scope_type: "stay_unit",
    scope_id: input.stayUnitId,
    family_id: input.familyId,
    stay_unit_id: input.stayUnitId,
    date_from: input.from,
    date_to: input.to,
    status: input.status,
    rows_written: input.rowsWritten ?? 0,
    error_message: input.errorMessage ?? null,
    completed_at: new Date().toISOString(),
  } as never);
  if (error && !isSchemaCompatibilityError(error)) {
    console.error("[inventory] projection run log failed", error);
  }
}

export async function appendInventoryEvent(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    stayUnitId: string;
    eventType: InventoryEventType;
    eventSource: string;
    sourceReference?: string | null;
    effectiveDateStart: string;
    effectiveDateEnd?: string | null;
    slotKey?: string | null;
    payload?: JsonRecord;
    actorUserId?: string | null;
    actorRole?: string | null;
  }
): Promise<string | null> {
  const start = normalizeDate(input.effectiveDateStart);
  const end = normalizeDate(input.effectiveDateEnd ?? input.effectiveDateStart) ?? start;
  if (!start || !end) throw new Error("Valid inventory event dates are required.");

  const { data, error } = await supabase
    .from("inventory_event_log")
    .insert({
      family_id: input.familyId,
      stay_unit_id: input.stayUnitId,
      event_type: input.eventType,
      event_source: input.eventSource,
      source_reference: input.sourceReference ?? null,
      effective_date_start: start,
      effective_date_end: end,
      slot_key: input.slotKey ?? null,
      payload: input.payload ?? {},
      actor_user_id: input.actorUserId ?? null,
      actor_role: input.actorRole ?? null,
    } as never)
    .select("id")
    .single();

  if (error) {
    if (isSchemaCompatibilityError(error)) return null;
    throw error;
  }
  return asString((data as JsonRecord | null)?.id);
}

export async function projectInventoryRange(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    stayUnitId: string;
    from: string;
    to: string;
    excludeBookingId?: string | null;
  }
): Promise<InventoryProjectionDay[]> {
  const from = normalizeDate(input.from);
  const to = normalizeDate(input.to) ?? from;
  if (!from || !to) throw new Error("Valid projection date range is required.");

  const stayUnit = await loadStayUnit(supabase, input.stayUnitId);
  if (!stayUnit?.id) throw new Error("Stay unit not found for inventory projection.");

  const familyId = input.familyId || asString(stayUnit.legacy_family_id) || "";
  if (!familyId) throw new Error("familyId is required for inventory projection.");

  const rules = await loadRules(supabase, {
    familyId,
    stayUnitId: stayUnit.id,
    fallbackAllotment: Math.max(1, asNumber(stayUnit.inventory_allotment, 1)),
  });
  const [events, bookings] = await Promise.all([
    loadInventoryEvents(supabase, { familyId, stayUnitId: stayUnit.id, from, to }),
    loadActiveBookings(supabase, { stayUnitId: stayUnit.id, from, to, excludeBookingId: input.excludeBookingId }),
  ]);

  const now = new Date();
  const projected = enumerateDateRange(from, to).map((date) =>
    projectDay({ familyId, stayUnit, rules, events, bookings, date, now })
  );

  const rows = projected.map((day) => ({
    family_id: day.familyId,
    stay_unit_id: day.stayUnitId,
    date: day.date,
    timezone: day.timezone,
    currency: day.currency,
    base_rate: day.baseRate,
    effective_rate: day.effectiveRate,
    rate_source: day.rateSource,
    is_blocked: day.isBlocked,
    block_reason: day.blockReason,
    is_sellable: day.isSellable,
    available_units: day.availableUnits,
    allotment_limit: day.allotmentLimit,
    confirmed_units: day.confirmedUnits,
    hold_units: day.holdUnits,
    cta: day.cta,
    ctd: day.ctd,
    min_stay: day.minStay,
    max_stay: day.maxStay,
    stop_sell: day.stopSell,
    manual_block_present: day.manualBlockPresent,
    last_event_id: day.lastEventId,
    metadata: day.metadata,
    updated_at: new Date().toISOString(),
    last_projected_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("inventory_day_projection")
    .upsert(rows as never, { onConflict: "family_id,stay_unit_id,date" });

  if (error) {
    if (isSchemaCompatibilityError(error)) return projected;
    await logProjectionRun(supabase, {
      familyId,
      stayUnitId: stayUnit.id,
      from,
      to,
      status: "failed",
      errorMessage: error.message,
    });
    throw error;
  }

  await logProjectionRun(supabase, {
    familyId,
    stayUnitId: stayUnit.id,
    from,
    to,
    status: "success",
    rowsWritten: rows.length,
  });

  return projected;
}

export async function loadInventoryProjection(
  supabase: SupabaseClient,
  input: { familyId: string; stayUnitId: string; from: string; to: string }
): Promise<InventoryProjectionDay[]> {
  const from = normalizeDate(input.from);
  const to = normalizeDate(input.to) ?? from;
  if (!from || !to) return [];

  const result = await supabase
    .from("inventory_day_projection")
    .select("*")
    .eq("family_id", input.familyId)
    .eq("stay_unit_id", input.stayUnitId)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  if (result.error) {
    if (isSchemaCompatibilityError(result.error)) return [];
    throw result.error;
  }

  return ((result.data ?? []) as JsonRecord[]).map(mapProjectionRow);
}

export async function ensureProjectedInventory(
  supabase: SupabaseClient,
  input: { familyId: string; stayUnitId: string; from: string; to: string; excludeBookingId?: string | null }
): Promise<InventoryProjectionDay[]> {
  const existing = await loadInventoryProjection(supabase, input);
  const expectedDates = enumerateDateRange(input.from, input.to);
  if (existing.length === expectedDates.length) return existing;
  return projectInventoryRange(supabase, input);
}

export async function assertCanonicalInventoryAvailability(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    stayUnitId: string;
    startDate: string;
    endDate?: string | null;
    excludeBookingId?: string | null;
  }
): Promise<InventoryProjectionDay[]> {
  const endDate = normalizeDate(input.endDate ?? input.startDate) ?? input.startDate;
  const days = await projectInventoryRange(supabase, {
    familyId: input.familyId,
    stayUnitId: input.stayUnitId,
    from: input.startDate,
    to: endDate,
    excludeBookingId: input.excludeBookingId,
  });
  const firstBlocked = days.find((day) => !day.isSellable);
  if (firstBlocked) {
    throw new Error(
      firstBlocked.blockReason === "manual_block"
        ? "This room is manually blocked for the selected date."
        : firstBlocked.blockReason === "sold_out"
          ? "This room is already booked for the selected date."
          : "This room is not available for the selected date."
    );
  }
  return days;
}

export async function resolveCanonicalInventoryPrice(
  supabase: SupabaseClient,
  input: { familyId: string; stayUnitId: string; startDate: string; endDate?: string | null }
): Promise<{ unitPrice: number; totalPrice: number; currency: string; source: string; days: InventoryProjectionDay[] } | null> {
  const days = await ensureProjectedInventory(supabase, {
    familyId: input.familyId,
    stayUnitId: input.stayUnitId,
    from: input.startDate,
    to: input.endDate ?? input.startDate,
  });
  if (days.length === 0) return null;
  const totalPrice = days.reduce((sum, day) => sum + Math.max(0, day.effectiveRate), 0);
  return {
    unitPrice: days.length > 0 ? Math.round(totalPrice / days.length) : 0,
    totalPrice,
    currency: days[0]?.currency ?? "INR",
    source: days[0]?.rateSource ?? "inventory_day_projection",
    days,
  };
}

export async function recordInventoryParityCheck(
  supabase: SupabaseClient,
  input: {
    familyId?: string | null;
    stayUnitId?: string | null;
    date?: string | null;
    checkType: string;
    legacyValue: JsonRecord;
    canonicalValue: JsonRecord;
    severity?: "info" | "warning" | "critical";
    context?: JsonRecord;
  }
): Promise<void> {
  const { error } = await supabase.from("inventory_parity_checks").insert({
    family_id: input.familyId ?? null,
    stay_unit_id: input.stayUnitId ?? null,
    date: normalizeDate(input.date ?? undefined),
    check_type: input.checkType,
    legacy_value: input.legacyValue,
    canonical_value: input.canonicalValue,
    severity: input.severity ?? "info",
    context: input.context ?? {},
  } as never);

  if (error && !isSchemaCompatibilityError(error)) {
    console.error("[inventory] parity check log failed", error);
  }
}

export function defaultInventoryProjectionWindow(): { from: string; to: string } {
  const from = getTodayInIndia();
  return { from, to: addIndiaDays(from, 365) };
}
