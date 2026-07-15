import type { SupabaseClient } from "@supabase/supabase-js";

import { getTodayInIndia } from "@/lib/booking-time";
import {
  appendInventoryEvent,
  ensureProjectedInventory,
  normalizeInventoryRateAmount,
  projectInventoryRange,
  type InventoryProjectionDay,
} from "@/lib/inventory";
import { asString, enumerateDateRange, type JsonRecord } from "@/lib/platform-utils";
import { loadStayUnitsForSelector } from "@/lib/stay-units";

export type FreePmsCalendarRestrictionInput = {
  minStay?: number;
  minStayArrival?: number;
  maxStay?: number;
  cta?: boolean;
  ctd?: boolean;
  stopSell?: boolean;
};

export type FreePmsCanonicalCalendarDay = {
  date: string;
  familyId: string;
  family_id: string;
  stayUnitId: string;
  stay_unit_id: string;
  roomId: string;
  room_id: string;
  availability: number;
  availableUnits: number;
  available_units: number;
  rate: number;
  price: number;
  effectiveRate: number;
  effective_rate: number;
  baseRate: number;
  base_rate: number;
  status: "available" | "manual_block" | "unavailable" | "past";
  label: string;
  stopSell: boolean;
  stop_sell: boolean;
  closedToArrival: boolean;
  closed_to_arrival: boolean;
  closedToDeparture: boolean;
  closed_to_departure: boolean;
  cta: boolean;
  ctd: boolean;
  minStayArrival: number;
  min_stay_arrival: number;
  minStayThrough: number;
  min_stay_through: number;
  minStay: number;
  min_stay: number;
  maxStay: number;
  max_stay: number;
  isBlocked: boolean;
  is_blocked: boolean;
  isSellable: boolean;
  is_sellable: boolean;
  blockReason: string | null;
  block_reason: string | null;
  manualBlockPresent: boolean;
  manual_block_present: boolean;
  updatedAt: string | null;
  updated_at: string | null;
};

type FreePmsRoom = {
  id: string;
  name: string;
  unitType: string;
  rate: number;
};

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function assertFreePmsDateRange(dateFrom: string, dateTo: string): void {
  if (!isIsoDate(dateFrom) || !isIsoDate(dateTo) || dateTo < dateFrom) {
    throw new Error("Valid dateFrom and dateTo values are required.");
  }
}

export function weekdayTokenForDate(date: string): "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat" {
  const parsed = new Date(`${date}T00:00:00Z`);
  const weekday = Number.isNaN(parsed.getUTCDay()) ? 0 : parsed.getUTCDay();
  return (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[weekday];
}

export function expandFreePmsDates(
  dateFrom: string,
  dateTo: string,
  weekdays?: string[] | null
): string[] {
  assertFreePmsDateRange(dateFrom, dateTo);
  const selectedWeekdays = new Set((weekdays ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
  return enumerateDateRange(dateFrom, dateTo).filter(
    (date) => selectedWeekdays.size === 0 || selectedWeekdays.has(weekdayTokenForDate(date))
  );
}

function statusForDay(day: InventoryProjectionDay): FreePmsCanonicalCalendarDay["status"] {
  if (day.date < getTodayInIndia()) return "past";
  if (day.manualBlockPresent || day.blockReason === "manual_block") return "manual_block";
  if (!day.isSellable || day.stopSell || day.availableUnits <= 0) return "unavailable";
  return "available";
}

function labelForDay(day: InventoryProjectionDay): string {
  if (day.date < getTodayInIndia()) return "Past date";
  if (day.manualBlockPresent || day.blockReason === "manual_block") return "Manual block";
  if (day.stopSell || day.blockReason === "stop_sell") return "Stop sell";
  if (day.blockReason === "sold_out") return "Sold out";
  return `${day.availableUnits} available`;
}

export function serializeFreePmsCalendarDay(day: InventoryProjectionDay): FreePmsCanonicalCalendarDay {
  const rate = normalizeInventoryRateAmount(day.effectiveRate);
  return {
    date: day.date,
    familyId: day.familyId,
    family_id: day.familyId,
    stayUnitId: day.stayUnitId,
    stay_unit_id: day.stayUnitId,
    roomId: day.stayUnitId,
    room_id: day.stayUnitId,
    availability: Math.max(0, Math.trunc(day.availableUnits)),
    availableUnits: Math.max(0, Math.trunc(day.availableUnits)),
    available_units: Math.max(0, Math.trunc(day.availableUnits)),
    rate,
    price: rate,
    effectiveRate: rate,
    effective_rate: rate,
    baseRate: normalizeInventoryRateAmount(day.baseRate),
    base_rate: normalizeInventoryRateAmount(day.baseRate),
    status: statusForDay(day),
    label: labelForDay(day),
    stopSell: day.stopSell,
    stop_sell: day.stopSell,
    closedToArrival: day.cta,
    closed_to_arrival: day.cta,
    closedToDeparture: day.ctd,
    closed_to_departure: day.ctd,
    cta: day.cta,
    ctd: day.ctd,
    minStayArrival: day.minStayArrival,
    min_stay_arrival: day.minStayArrival,
    minStayThrough: day.minStay,
    min_stay_through: day.minStay,
    minStay: day.minStay,
    min_stay: day.minStay,
    maxStay: day.maxStay,
    max_stay: day.maxStay,
    isBlocked: day.isBlocked,
    is_blocked: day.isBlocked,
    isSellable: day.isSellable,
    is_sellable: day.isSellable,
    blockReason: day.blockReason,
    block_reason: day.blockReason,
    manualBlockPresent: day.manualBlockPresent,
    manual_block_present: day.manualBlockPresent,
    updatedAt: day.updatedAt ?? null,
    updated_at: day.updatedAt ?? null,
  };
}

export async function loadFreePmsRooms(
  supabase: SupabaseClient,
  input: { familyId: string; roomIds?: string[] | null }
): Promise<FreePmsRoom[]> {
  const requestedRoomIds = new Set((input.roomIds ?? []).filter(Boolean));
  return (await loadStayUnitsForSelector(supabase, { legacyFamilyId: input.familyId }))
    .filter((room) => room.isActive !== false)
    .filter((room) => requestedRoomIds.size === 0 || requestedRoomIds.has(room.id))
    .map((room) => ({
      id: room.id,
      name: room.name || "Room",
      unitType: room.unitType || "stay_unit",
      rate: normalizeInventoryRateAmount(room.priceFullday),
    }))
    .filter((room) => room.id);
}

export async function assertFreePmsRoomAccess(
  supabase: SupabaseClient,
  input: { familyId: string; roomId: string }
): Promise<FreePmsRoom> {
  const [room] = await loadFreePmsRooms(supabase, { familyId: input.familyId, roomIds: [input.roomId] });
  if (!room?.id) {
    throw new Error("You do not have access to this room calendar.");
  }
  return room;
}

export async function loadFreePmsCalendarSnapshot(
  supabase: SupabaseClient,
  input: { familyId: string; dateFrom: string; dateTo: string; roomIds?: string[] | null }
): Promise<{
  ok: true;
  rows: Array<{
    roomId: string;
    room_id: string;
    stayUnitId: string;
    stay_unit_id: string;
    roomName: string;
    unitType: string;
    rate: number;
    availabilityCells: FreePmsCanonicalCalendarDay[];
    rateCells: Array<{
      date: string;
      amount: number;
      displayValue: string;
      baseAmount: number;
      isPast: boolean;
      isOverridden: boolean;
    }>;
    dates: FreePmsCanonicalCalendarDay[];
  }>;
  days: FreePmsCanonicalCalendarDay[];
  sync: {
    syncStatus: "local";
    statusTitle: string;
    statusDetail: string;
    connected: false;
    partial: false;
    lastSyncedAt: string;
  };
}> {
  assertFreePmsDateRange(input.dateFrom, input.dateTo);
  const rooms = await loadFreePmsRooms(supabase, input);
  const rows = [];
  const days: FreePmsCanonicalCalendarDay[] = [];

  for (const room of rooms) {
    const projected = await ensureProjectedInventory(supabase, {
      familyId: input.familyId,
      stayUnitId: room.id,
      from: input.dateFrom,
      to: input.dateTo,
    });
    const serializedDays = projected.map(serializeFreePmsCalendarDay);
    days.push(...serializedDays);
    rows.push({
      roomId: room.id,
      room_id: room.id,
      stayUnitId: room.id,
      stay_unit_id: room.id,
      roomName: room.name,
      unitType: room.unitType,
      rate: room.rate,
      availabilityCells: serializedDays,
      rateCells: serializedDays.map((day) => ({
        date: day.date,
        amount: day.rate,
        displayValue: `₹${day.rate.toLocaleString("en-IN")}`,
        baseAmount: day.baseRate,
        isPast: day.status === "past",
        isOverridden: day.rate !== day.baseRate,
      })),
      dates: serializedDays,
    });
  }

  return {
    ok: true,
    rows,
    days,
    sync: {
      syncStatus: "local",
      statusTitle: "Famlo Free local calendar",
      statusDetail: "Showing Famlo local inventory. No OTA, Channex, or ARI sync is used for Free calendar updates.",
      connected: false,
      partial: false,
      lastSyncedAt: new Date().toISOString(),
    },
  };
}

export async function writeFreePmsSingleDateUpdate(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    roomId: string;
    date: string;
    action: "block" | "unblock" | "save_price" | "reset_price";
    amount?: number | null;
    actorUserId?: string | null;
    actorRole?: string | null;
  }
): Promise<FreePmsCanonicalCalendarDay> {
  assertFreePmsDateRange(input.date, input.date);
  await assertFreePmsRoomAccess(supabase, { familyId: input.familyId, roomId: input.roomId });
  const eventType =
    input.action === "block"
      ? "manual_block_set"
      : input.action === "unblock"
        ? "manual_block_removed"
        : input.action === "save_price"
          ? "manual_rate_set"
          : "manual_rate_removed";
  const payload: JsonRecord =
    input.action === "save_price"
      ? {
          amount: normalizeInventoryRateAmount(input.amount),
          updated_via: "free_pms_calendar",
        }
      : {
          updated_via: "free_pms_calendar",
        };

  await appendInventoryEvent(supabase, {
    familyId: input.familyId,
    stayUnitId: input.roomId,
    eventType,
    eventSource: "free_pms_calendar",
    sourceReference: input.date,
    effectiveDateStart: input.date,
    effectiveDateEnd: input.date,
    payload,
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
  });

  const [projectedDay] = await projectInventoryRange(supabase, {
    familyId: input.familyId,
    stayUnitId: input.roomId,
    from: input.date,
    to: input.date,
  });
  if (!projectedDay) throw new Error("Failed to project Free calendar day.");
  return serializeFreePmsCalendarDay(projectedDay);
}

export async function writeFreePmsBulkUpdate(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    roomIds: string[];
    dateFrom: string;
    dateTo: string;
    weekdays?: string[] | null;
    rateAction?: "save" | "reset" | null;
    rateAmount?: number | null;
    availabilityAction?: "block" | "unblock" | null;
    restrictions?: FreePmsCalendarRestrictionInput | null;
    actorUserId?: string | null;
    actorRole?: string | null;
  }
): Promise<{ affectedRoomCount: number; affectedDateCount: number }> {
  const dates = expandFreePmsDates(input.dateFrom, input.dateTo, input.weekdays);
  if (dates.length === 0) throw new Error("No dates matched the selected range.");
  const rooms = await loadFreePmsRooms(supabase, { familyId: input.familyId, roomIds: input.roomIds });
  if (rooms.length !== new Set(input.roomIds).size) {
    throw new Error("One or more selected rooms do not belong to this property.");
  }

  const restrictions = input.restrictions ?? {};
  const normalizedRestrictions: JsonRecord = {};
  if (restrictions.minStay != null) normalizedRestrictions.min_stay = Math.max(1, Math.trunc(restrictions.minStay));
  if (restrictions.minStayArrival != null) {
    normalizedRestrictions.min_stay_arrival = Math.max(1, Math.trunc(restrictions.minStayArrival));
  }
  if (restrictions.maxStay != null) normalizedRestrictions.max_stay = Math.max(1, Math.trunc(restrictions.maxStay));
  if (restrictions.cta != null) normalizedRestrictions.cta = restrictions.cta;
  if (restrictions.ctd != null) normalizedRestrictions.ctd = restrictions.ctd;
  if (restrictions.stopSell != null) normalizedRestrictions.stop_sell = restrictions.stopSell;

  for (const room of rooms) {
    for (const date of dates) {
      if (input.rateAction) {
        await appendInventoryEvent(supabase, {
          familyId: input.familyId,
          stayUnitId: room.id,
          eventType: input.rateAction === "save" ? "manual_rate_set" : "manual_rate_removed",
          eventSource: "free_pms_calendar_bulk",
          sourceReference: date,
          effectiveDateStart: date,
          effectiveDateEnd: date,
          payload:
            input.rateAction === "save"
              ? { amount: normalizeInventoryRateAmount(input.rateAmount), updated_via: "free_pms_calendar_bulk" }
              : { reset: true, updated_via: "free_pms_calendar_bulk" },
          actorUserId: input.actorUserId ?? null,
          actorRole: input.actorRole ?? null,
        });
      }
      if (input.availabilityAction) {
        await appendInventoryEvent(supabase, {
          familyId: input.familyId,
          stayUnitId: room.id,
          eventType: input.availabilityAction === "block" ? "manual_block_set" : "manual_block_removed",
          eventSource: "free_pms_calendar_bulk",
          sourceReference: date,
          effectiveDateStart: date,
          effectiveDateEnd: date,
          payload: { updated_via: "free_pms_calendar_bulk" },
          actorUserId: input.actorUserId ?? null,
          actorRole: input.actorRole ?? null,
        });
      }
      if (Object.keys(normalizedRestrictions).length > 0) {
        await appendInventoryEvent(supabase, {
          familyId: input.familyId,
          stayUnitId: room.id,
          eventType: "restriction_updated",
          eventSource: "free_pms_calendar_bulk",
          sourceReference: date,
          effectiveDateStart: date,
          effectiveDateEnd: date,
          payload: { ...normalizedRestrictions, updated_via: "free_pms_calendar_bulk" },
          actorUserId: input.actorUserId ?? null,
          actorRole: input.actorRole ?? null,
        });
      }
    }
    await projectInventoryRange(supabase, {
      familyId: input.familyId,
      stayUnitId: room.id,
      from: input.dateFrom,
      to: input.dateTo,
    });
  }

  return {
    affectedRoomCount: rooms.length,
    affectedDateCount: dates.length,
  };
}
