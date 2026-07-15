import type { SupabaseClient } from "@supabase/supabase-js";

import { loadCanonicalCalendar } from "@/lib/calendar";
import { resolveOtaPaymentCollectMode, type OtaPaymentCollectMode } from "@/lib/channel-booking-normalization";
import {
  buildCalendarSyncMetadata,
  loadHostProCalendarSyncSnapshot,
  type HostProCalendarSyncMetadata,
} from "@/lib/host-pro-calendar-sync";
import { ensureProjectedInventory } from "@/lib/inventory";
import { addIndiaDays } from "@/lib/booking-time";
import { loadStayUnitsForSelector } from "@/lib/stay-units";

type JsonRecord = Record<string, unknown>;

function createDevTrace(label: string, context: Record<string, string | number | null | undefined>) {
  const enabled = process.env.NODE_ENV !== "production";
  const startedAt = Date.now();
  let lastAt = startedAt;
  const steps: string[] = [];
  return {
    mark(step: string): void {
      if (!enabled) return;
      const now = Date.now();
      steps.push(`${step}=${now - lastAt}ms`);
      lastAt = now;
    },
    end(extra: Record<string, string | number | null | undefined> = {}): void {
      if (!enabled) return;
      const fields = { ...context, ...extra };
      const meta = Object.entries(fields)
        .filter(([, value]) => value != null)
        .map(([key, value]) => `${key}=${value}`)
        .join(" ");
      console.info(`${label} total=${Date.now() - startedAt}ms ${steps.join(" ")}${meta ? ` ${meta}` : ""}`);
    },
  };
}

export type LiveCalendarCellStatus = "available" | "famlo" | "ota" | "manual_block" | "pending" | "past" | "unavailable";

export type LiveCalendarBookingDetail = {
  bookingId: string;
  roomName: string;
  startDate: string;
  endDate: string;
  sourceLabel: string;
  externalBookingId: string | null;
  guestDisplayName: string;
  amount: string | null;
  currency: string | null;
  paymentStatus: string | null;
  importStatus: string | null;
  ackStatus: string | null;
  linkedBookingId: string | null;
  externalRevisionId: string | null;
  bookingListRevisionId: string | null;
  feedStatus: "found" | "empty" | "not_applicable";
  isCrsOnly: boolean;
  ackEligible: boolean;
  importedIntoFamlo: boolean;
  acknowledged: boolean;
  acknowledgementNote: string | null;
};

export type LiveCalendarCell = {
  date: string;
  status: LiveCalendarCellStatus;
  label: string;
  availableUnits: number | null;
  bookingDetail: LiveCalendarBookingDetail | null;
};

export type LiveCalendarRateCell = {
  date: string;
  displayValue: string;
  amount: number | null;
  baseAmount: number;
  isPast: boolean;
  isOverridden: boolean;
};

export type LiveCalendarRow = {
  roomId: string;
  roomName: string;
  unitType: string;
  rate: number;
  availabilityCells: LiveCalendarCell[];
  rateCells: LiveCalendarRateCell[];
};

export type LiveProBookingSummary = {
  bookingId: string;
  roomId: string | null;
  roomName: string;
  startDate: string;
  endDate: string;
  checkoutDate: string;
  revenueDate: string | null;
  createdAt: string | null;
  guestDisplayName: string;
  status: string;
  reservationStatus: string | null;
  paymentStatus: string | null;
  amount: string | null;
  amountValue: number | null;
  currency: string;
  netPayoutAmount: number | null;
  payoutAmountValue: number | null;
  paidPayoutAmount: number | null;
  sourceLabel: string;
  sourceCategory: "famlo" | "direct" | "ota";
  paymentCollectMode: OtaPaymentCollectMode;
  famloPayoutEligible: boolean;
  settlementEligible: boolean;
  payoutHoldStatus: string | null;
  payoutHoldIsHostActionable: boolean;
  settlementStatus: string | null;
  payoutExecutionStatus: string | null;
  complianceBlocked: boolean;
  payoutStatus: string | null;
  payoutPaidAt: string | null;
  estimatedPayoutDate: string | null;
  famloRevenueAmount: number | null;
  platformFeeAmount: number | null;
  otaCommissionAmount: number | null;
  refundAdjustmentAmount: number | null;
  creditNoteAmount: number | null;
  taxAmount: number | null;
  externalBookingId: string | null;
  externalRevisionId: string | null;
  importStatus: string | null;
  ackStatus: string | null;
  linkedBookingId: string | null;
  isOta: boolean;
  isReviewOnly: boolean;
  reviewTitle: string | null;
  reviewReasonLabels: string[];
  guestEmail: string | null;
  guestCount: number | null;
  adultCount: number | null;
  childCount: number | null;
};

export type BookingFeedLiveHealth = {
  lastUpdatedAt: string;
  lastChannexBookingCheckAt: string | null;
  lastChannexBookingReceivedAt: string | null;
  lastSuccessfulBookingImportAt: string | null;
  lastBookingImportError: string | null;
  importedBookingCountToday: number;
  pendingReviewCount: number;
  failedImportCount: number;
  syncing: boolean;
  safeMessage: string;
};

export type BookingSnapshotResult = {
  bookings: LiveProBookingSummary[];
  health: BookingFeedLiveHealth;
};

export type CalendarSnapshotResult = {
  rows: LiveCalendarRow[];
  sync: HostProCalendarSyncMetadata;
};

type RoomSummary = {
  id: string;
  name: string;
  unitType: string;
  priceFullday: number;
};

type ChannelBookingRevision = {
  id: string;
  linkedBookingId: string | null;
  externalBookingId: string | null;
  externalRevisionId: string | null;
  externalRoomTypeId: string | null;
  otaName: string | null;
  amount: number | null;
  currency: string | null;
  paymentCollect: string | null;
  importStatus: string;
  ackStatus: string;
  rawPayload: JsonRecord | null;
  updatedAt: string | null;
  createdAt: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  guestName: string | null;
  providerCode: string;
  source: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function isReadCompatibilityError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  return (
    record.code === "42501" ||
    record.code === "42P01" ||
    record.code === "42703" ||
    message.includes("permission denied") ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("relation")
  );
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";
  return (
    record.code === "42703" &&
    (
      message.includes(`.${columnName}`) ||
      message.includes(`'${columnName}'`) ||
      message.includes(` ${columnName} `)
    )
  );
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asNumberOrNull(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed > 0 ? parsed : null;
}

function addDays(date: string, days: number): string {
  return addIndiaDays(date, days);
}

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function enumerateStayNights(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || endDate <= startDate) return startDate ? [startDate] : [];
  return enumerateDates(startDate, addDays(endDate, -1));
}

function normalizeToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function formatCurrency(value: number | null, currency: string | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const code = typeof currency === "string" && currency.trim().length === 3 ? currency.trim().toUpperCase() : "INR";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: code,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function isCompletedRevenueStatus(value: unknown): boolean {
  const normalized = normalizeToken(value);
  return ["checked_out", "completed", "checkout_done", "revenue_recognized"].includes(normalized);
}

function isPaidPayoutStatus(value: unknown): boolean {
  const normalized = normalizeToken(value);
  return ["paid", "processed", "completed"].includes(normalized);
}

function isBlockingBookingStatus(status: string | null): boolean {
  const normalized = normalizeToken(status);
  return !["", "cancelled", "cancelled_by_user", "cancelled_by_partner", "rejected"].includes(normalized);
}

function checkoutExclusiveStatusLabel(status: LiveCalendarCellStatus, availableUnits: number | null): string {
  if (status === "manual_block") return "Blocked";
  if (status === "famlo") return "Famlo booking";
  if (status === "ota") return "OTA booking";
  if (status === "pending") return "Pending";
  if (status === "past") return "Past";
  if (status === "unavailable" || availableUnits === 0) return "0";
  if (typeof availableUnits === "number") return String(availableUnits);
  return "1";
}

function readChannelFeedHealth(metadata: Record<string, unknown> | null): BookingFeedLiveHealth {
  const health = asObject(metadata?.channexFeedHealth);
  const lastPollAt = asString(health.lastPollAt);
  const lastReceivedAt = asString(health.lastFeedSeenAt) ?? asString(health.lastPollAt);
  const lastSuccessfulImportAt = asString(health.lastAutoApplyAt) ?? asString(health.lastSuccessfulPollAt);
  const pendingReviewCount = asNumber(health.pendingManualReviewCount);
  const failedImportCount = asNumber(health.failedImportCount) + asNumber(health.failedAutoApplyCount);
  const syncing = normalizeToken(health.lastPollState) === "running";
  const safeMessage =
    failedImportCount > 0
      ? "Sync failed for some OTA bookings. Retry is running in the background."
      : pendingReviewCount > 0
        ? `${pendingReviewCount} OTA booking update${pendingReviewCount === 1 ? "" : "s"} need review.`
        : lastSuccessfulImportAt
          ? "Saved bookings are loaded. Background OTA refresh is healthy."
          : "Saved bookings are loaded. OTA refresh is pending.";

  return {
    lastUpdatedAt: new Date().toISOString(),
    lastChannexBookingCheckAt: lastPollAt,
    lastChannexBookingReceivedAt: lastReceivedAt,
    lastSuccessfulBookingImportAt: lastSuccessfulImportAt,
    lastBookingImportError: asString(health.lastError) ?? asString(health.lastAutoApplyMessage),
    importedBookingCountToday: asNumber(health.autoImportedCount) + asNumber(health.autoAppliedCount) + asNumber(health.autoCancelledCount),
    pendingReviewCount,
    failedImportCount,
    syncing,
    safeMessage,
  };
}

async function loadRoomsForFamily(supabase: SupabaseClient, familyId: string): Promise<RoomSummary[]> {
  const rows = await loadStayUnitsForSelector(supabase, { legacyFamilyId: familyId });
  return rows
    .filter((row) => row.isActive !== false)
    .map((row) => ({
      id: row.id,
      name: row.name || "Room",
      unitType: row.unitType || "standard_room",
      priceFullday: asNumber(row.priceFullday),
    }))
    .filter((row) => row.id);
}

async function loadCompactRoomsForFamily(supabase: SupabaseClient, familyId: string): Promise<RoomSummary[]> {
  const { data, error } = await supabase
    .from("stay_units_v2")
    .select("id,name,unit_type,price_fullday,is_active,is_primary,sort_order,updated_at")
    .eq("legacy_family_id", familyId)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    if (isReadCompatibilityError(error)) {
      return loadRoomsForFamily(supabase, familyId);
    }
    throw error;
  }

  const compactRows = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => row.is_active !== false)
    .map((row) => ({
      id: asString(row.id) ?? "",
      name: asString(row.name) ?? "Room",
      unitType: asString(row.unit_type) ?? "standard_room",
      priceFullday: asNumber(row.price_fullday),
    }))
    .filter((row) => row.id);

  return compactRows.length > 0 ? compactRows : loadRoomsForFamily(supabase, familyId);
}

async function loadChannelFeedHealthOnly(
  supabase: SupabaseClient,
  familyId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("channel_properties")
    .select("metadata")
    .eq("family_id", familyId)
    .eq("provider_code", "channex")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isReadCompatibilityError(error)) {
      return null;
    }
    throw error;
  }

  return asObject(data?.metadata);
}

async function loadChannelFoundationLight(supabase: SupabaseClient, familyId: string): Promise<{
  revisions: ChannelBookingRevision[];
  roomIdByExternalRoomTypeId: Map<string, string>;
  propertyMetadata: Record<string, unknown> | null;
}> {
  const [{ data: revisionsData, error: revisionsError }, { data: mappingsData, error: mappingsError }, { data: propertyData, error: propertyError }] =
    await Promise.all([
      supabase
        .from("channel_booking_revisions")
        .select("id,linked_booking_id,external_booking_id,external_revision_id,external_room_type_id,ota_name,amount,currency,payment_collect,import_status,ack_status,raw_payload,updated_at,created_at,arrival_date,departure_date,guest_name,provider_code,source")
        .eq("family_id", familyId)
        .eq("provider_code", "channex")
        .order("updated_at", { ascending: false })
        .limit(120),
      supabase
        .from("channel_room_mappings")
        .select("stay_unit_id,external_room_type_id")
        .eq("family_id", familyId)
        .eq("provider_code", "channex"),
      supabase
        .from("channel_properties")
        .select("metadata")
        .eq("family_id", familyId)
        .eq("provider_code", "channex")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (isReadCompatibilityError(revisionsError) || isReadCompatibilityError(mappingsError) || isReadCompatibilityError(propertyError)) {
    return {
      revisions: [],
      roomIdByExternalRoomTypeId: new Map<string, string>(),
      propertyMetadata: null,
    };
  }

  if (revisionsError) throw revisionsError;
  if (mappingsError) throw mappingsError;
  if (propertyError) throw propertyError;

  const roomIdByExternalRoomTypeId = new Map<string, string>();
  for (const row of (mappingsData ?? []) as Array<Record<string, unknown>>) {
    const externalRoomTypeId = asString(row.external_room_type_id);
    const stayUnitId = asString(row.stay_unit_id);
    if (externalRoomTypeId && stayUnitId) roomIdByExternalRoomTypeId.set(externalRoomTypeId, stayUnitId);
  }

  const revisions: ChannelBookingRevision[] = ((revisionsData ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: asString(row.id) ?? "",
    linkedBookingId: asString(row.linked_booking_id),
    externalBookingId: asString(row.external_booking_id),
    externalRevisionId: asString(row.external_revision_id),
    externalRoomTypeId: asString(row.external_room_type_id),
    otaName: asString(row.ota_name),
    amount: asNumberOrNull(row.amount),
    currency: asString(row.currency),
    paymentCollect: asString(row.payment_collect),
    importStatus: asString(row.import_status) ?? "preview",
    ackStatus: asString(row.ack_status) ?? "not_acknowledged",
    rawPayload: asObject(row.raw_payload),
    updatedAt: asString(row.updated_at),
    createdAt: asString(row.created_at),
    arrivalDate: asString(row.arrival_date),
    departureDate: asString(row.departure_date),
    guestName: asString(row.guest_name),
    providerCode: asString(row.provider_code) ?? "channex",
    source: asString(row.source),
  }));

  return {
    revisions,
    roomIdByExternalRoomTypeId,
    propertyMetadata: asObject(propertyData?.metadata),
  };
}

export async function loadLiveProBookingsSnapshot(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    globalCommission?: number;
    view?: "full" | "list";
    limit?: number;
  }
): Promise<BookingSnapshotResult> {
  const globalCommission = input.globalCommission ?? 16;
  const view = input.view === "list" ? "list" : "full";
  const bookingLimit = Math.max(1, Math.min(120, Math.round(input.limit ?? (view === "list" ? 30 : 120))));
  const trace = createDevTrace("[host.pro.bookings.snapshot:helper]", { familyId: input.familyId });
  const [rooms, channelFoundation, hostRowsResult] = await Promise.all([
    view === "list" ? loadCompactRoomsForFamily(supabase, input.familyId) : loadRoomsForFamily(supabase, input.familyId),
    view === "list"
      ? loadChannelFeedHealthOnly(supabase, input.familyId).then((propertyMetadata) => ({
          revisions: [] as ChannelBookingRevision[],
          roomIdByExternalRoomTypeId: new Map<string, string>(),
          propertyMetadata,
        }))
      : loadChannelFoundationLight(supabase, input.familyId),
    supabase.from("hosts").select("id,user_id").eq("legacy_family_id", input.familyId),
  ]);
  trace.mark("base_parallel");
  const roomNameById = new Map(rooms.map((room) => [room.id, room.name]));
  const { revisions, roomIdByExternalRoomTypeId, propertyMetadata } = channelFoundation;

  const { data: hostRows, error: hostRowsError } = hostRowsResult;
  if (hostRowsError) throw hostRowsError;
  const hostIds = ((hostRows ?? []) as Array<Record<string, unknown>>).map((row) => asString(row.id)).filter(Boolean) as string[];
  const hostUserIds = ((hostRows ?? []) as Array<Record<string, unknown>>).map((row) => asString(row.user_id)).filter(Boolean) as string[];

  if (hostIds.length === 0) {
    trace.end({ rooms: rooms.length, bookings: 0, hostIds: 0 });
    return {
      bookings: [],
      health: readChannelFeedHealth(propertyMetadata),
    };
  }

  const bookingRowsSelectWithStayUnit =
    "id,status,payment_status,total_price,partner_payout_amount,start_date,end_date,created_at,guests_count,stay_unit_id,pricing_snapshot,users!user_id(name,email)";
  const bookingRowsSelectFallback =
    "id,status,payment_status,total_price,partner_payout_amount,start_date,end_date,created_at,guests_count,pricing_snapshot,users!user_id(name,email)";
  const bookingRowsInitialResult = await supabase
    .from("bookings_v2")
    .select(bookingRowsSelectWithStayUnit)
    .in("host_id", hostIds)
    .order("start_date", { ascending: false })
    .limit(bookingLimit);
  let bookingRowsData = bookingRowsInitialResult.data as Array<Record<string, unknown>> | null;
  let bookingRowsError = bookingRowsInitialResult.error;
  if (bookingRowsError && isMissingColumnError(bookingRowsError, "stay_unit_id")) {
    const bookingRowsFallbackResult = await supabase
      .from("bookings_v2")
      .select(bookingRowsSelectFallback)
      .in("host_id", hostIds)
      .order("start_date", { ascending: false })
      .limit(bookingLimit);
    bookingRowsData = bookingRowsFallbackResult.data as Array<Record<string, unknown>> | null;
    bookingRowsError = bookingRowsFallbackResult.error;
  }
  if (bookingRowsError) throw bookingRowsError;
  const bookingRows = bookingRowsData ?? [];
  trace.mark("booking_rows");

  const bookingIds = bookingRows.map((row) => asString(row.id)).filter(Boolean) as string[];
  const payoutRowsByBookingId = new Map<string, Array<Record<string, unknown>>>();
  const reservationsByBookingId = new Map<string, Record<string, unknown>>();
  const foliosByBookingId = new Map<string, Record<string, unknown>>();
  const settlementLineByBookingId = new Map<string, Record<string, unknown>>();
  const settlementsById = new Map<string, Record<string, unknown>>();
  const payoutExecutionBySettlementId = new Map<string, Record<string, unknown>>();
  const platformInvoiceByBookingId = new Map<string, Record<string, unknown>>();
  const creditNoteTotalByBookingId = new Map<string, number>();
  let panVerified = false;
  let payoutAccountActive = false;

  if (bookingIds.length > 0 && view === "full") {
    const [
      payoutRowsResult,
      reservationRowsResult,
      folioRowsResult,
      settlementLineRowsResult,
      platformInvoicesResult,
      creditNotesResult,
      payoutAccountResult,
      hostTaxDetailsResult,
    ] = await Promise.all([
      supabase.from("payouts_v2").select("booking_id,amount,status,processed_at,created_at").in("booking_id", bookingIds),
      supabase.from("reservations_v2").select("booking_id,operational_status,check_out_date").in("booking_id", bookingIds),
      supabase.from("reservation_folios_v2").select("booking_id,guest_total_amount,host_payout_amount,refund_total_amount,metadata").in("booking_id", bookingIds),
      supabase.from("settlement_line_items_v2").select("booking_id,settlement_id,amount,metadata,is_active").eq("is_active", true).in("booking_id", bookingIds),
      supabase.from("platform_fee_invoices").select("booking_id,total_amount").in("booking_id", bookingIds),
      supabase.from("credit_notes").select("booking_id,total_reversal_amount").in("booking_id", bookingIds),
      supabase.from("host_payout_accounts").select("is_active").in("host_id", hostIds).eq("is_active", true).limit(1).maybeSingle(),
      hostUserIds.length > 0
        ? supabase.from("host_tax_details").select("verification_status,is_verified").in("user_id", hostUserIds).limit(1).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    for (const row of ((payoutRowsResult.data ?? []) as Array<Record<string, unknown>>)) {
      const bookingId = asString(row.booking_id);
      if (!bookingId) continue;
      payoutRowsByBookingId.set(bookingId, [...(payoutRowsByBookingId.get(bookingId) ?? []), row]);
    }
    for (const row of ((reservationRowsResult.data ?? []) as Array<Record<string, unknown>>)) {
      const bookingId = asString(row.booking_id);
      if (bookingId && !reservationsByBookingId.has(bookingId)) reservationsByBookingId.set(bookingId, row);
    }
    for (const row of ((folioRowsResult.data ?? []) as Array<Record<string, unknown>>)) {
      const bookingId = asString(row.booking_id);
      if (bookingId && !foliosByBookingId.has(bookingId)) foliosByBookingId.set(bookingId, row);
    }
    for (const row of ((settlementLineRowsResult.data ?? []) as Array<Record<string, unknown>>)) {
      const bookingId = asString(row.booking_id);
      const settlementId = asString(row.settlement_id);
      if (bookingId && !settlementLineByBookingId.has(bookingId)) settlementLineByBookingId.set(bookingId, row);
      if (settlementId) settlementsById.set(settlementId, {});
    }
    if (settlementsById.size > 0) {
      const ids = [...settlementsById.keys()];
      const [settlementsResult, payoutExecutionsResult] = await Promise.all([
        supabase.from("host_settlements_v2").select("id,status,paid_at").in("id", ids),
        supabase.from("host_payout_executions").select("settlement_id,status,processed_at,created_at").in("settlement_id", ids).order("created_at", { ascending: false }),
      ]);
      for (const row of ((settlementsResult.data ?? []) as Array<Record<string, unknown>>)) {
        const id = asString(row.id);
        if (id) settlementsById.set(id, row);
      }
      for (const row of ((payoutExecutionsResult.data ?? []) as Array<Record<string, unknown>>)) {
        const settlementId = asString(row.settlement_id);
        if (settlementId && !payoutExecutionBySettlementId.has(settlementId)) payoutExecutionBySettlementId.set(settlementId, row);
      }
    }
    for (const row of ((platformInvoicesResult.data ?? []) as Array<Record<string, unknown>>)) {
      const bookingId = asString(row.booking_id);
      if (bookingId && !platformInvoiceByBookingId.has(bookingId)) platformInvoiceByBookingId.set(bookingId, row);
    }
    for (const row of ((creditNotesResult.data ?? []) as Array<Record<string, unknown>>)) {
      const bookingId = asString(row.booking_id);
      if (!bookingId) continue;
      creditNoteTotalByBookingId.set(bookingId, (creditNoteTotalByBookingId.get(bookingId) ?? 0) + asNumber(row.total_reversal_amount));
    }

    panVerified =
      hostTaxDetailsResult.data?.is_verified === true ||
      ["verified", "approved"].includes(normalizeToken(hostTaxDetailsResult.data?.verification_status));
    payoutAccountActive = payoutAccountResult.data?.is_active === true;
  }
  trace.mark(view === "full" ? "finance_fanout" : "finance_skipped");

  const bookingRevisionByLinkedBookingId = new Map(
    revisions.filter((revision) => revision.linkedBookingId).map((revision) => [revision.linkedBookingId as string, revision] as const)
  );
  const bookingRevisionByExternalBookingId = new Map(
    revisions.filter((revision) => revision.externalBookingId).map((revision) => [revision.externalBookingId as string, revision] as const)
  );

  const persisted: LiveProBookingSummary[] = bookingRows.flatMap((row) => {
    const pricingSnapshot = asObject(row.pricing_snapshot);
    const userRecord = asObject(row.users);
    const bookingId = asString(row.id);
    const startDate = asString(row.start_date);
    const endDate = asString(row.end_date);
    if (!bookingId || !startDate || !endDate) return [];

    const stayUnitId = asString(row.stay_unit_id) ?? asString(pricingSnapshot.stay_unit_id);
    const externalBookingId = asString(pricingSnapshot.channel_external_booking_id);
    const matchedRevision =
      view === "full"
        ? bookingRevisionByLinkedBookingId.get(bookingId) ?? (externalBookingId ? bookingRevisionByExternalBookingId.get(externalBookingId) : null) ?? null
        : null;
    const matchedRevisionPayload = asObject(matchedRevision?.rawPayload);
    const reviewReasonLabels = asStringArray(matchedRevisionPayload.review_conflict_labels);
    const reviewTitle = asString(matchedRevisionPayload.review_title) ?? (reviewReasonLabels.length > 0 ? "Channex booking needs review" : null);
    const isOta = asString(pricingSnapshot.channel_provider) === "channex";
    const bookingCurrency = asString(pricingSnapshot.currency) ?? matchedRevision?.currency ?? "INR";
    const totalPrice = asNumber(row.total_price);
    const amountValue = totalPrice > 0 ? totalPrice : matchedRevision?.amount ?? null;
    const reservation = reservationsByBookingId.get(bookingId) ?? null;
    const reservationStatus = asString(reservation?.operational_status);
    const checkoutDate = asString(reservation?.check_out_date) ?? endDate;
    const folio = foliosByBookingId.get(bookingId) ?? null;
    const folioMetadata = asObject(folio?.metadata);
    const settlementLine = settlementLineByBookingId.get(bookingId) ?? null;
    const settlementId = asString(settlementLine?.settlement_id);
    const settlement = settlementId ? settlementsById.get(settlementId) ?? null : null;
    const payoutExecution = settlementId ? payoutExecutionBySettlementId.get(settlementId) ?? null : null;
    const platformInvoice = platformInvoiceByBookingId.get(bookingId) ?? null;
    const creditNoteAmount = creditNoteTotalByBookingId.get(bookingId) ?? 0;
    const sourceChannel = asString(row.source_channel);
    const sourceCategory: LiveProBookingSummary["sourceCategory"] = isOta ? "ota" : sourceChannel === "pms_manual" ? "direct" : "famlo";
    const financeSnapshot = asObject(pricingSnapshot.finance_snapshot);
    const financeContract = asObject(financeSnapshot.contract_v1);
    const payoutBreakdown = asObject(financeSnapshot.payout_breakdown);
    const latestPayout = view === "full"
      ? ((payoutRowsByBookingId.get(bookingId) ?? []).sort((a, b) => String(b.processed_at ?? b.created_at ?? "").localeCompare(String(a.processed_at ?? a.created_at ?? "")))[0] ?? null)
      : null;
    const payoutAmountValue = view === "full" ? asNumberOrNull(settlementLine?.amount) : null;
    const platformFeeAmount = view === "full"
      ? (asNumber(platformInvoice?.total_amount) || asNumber(pricingSnapshot.platform_fee) || asNumber(financeContract.platform_fee) || asNumber(pricingSnapshot.famlo_platform_fee_incl_gst))
      : 0;
    const taxAmount = view === "full"
      ? (asNumber(pricingSnapshot.platform_fee_tax) || asNumber(financeContract.gst_on_platform_fee) || asNumber(pricingSnapshot.famlo_platform_fee_gst) || asNumber(pricingSnapshot.tax_amount))
      : 0;
    const refundAdjustmentAmount = view === "full"
      ? (asNumber(asObject(settlementLine?.metadata).refund_adjustment_amount) || asNumber(folio?.refund_total_amount) || creditNoteAmount || asNumber(financeSnapshot.refund_adjustments) || asNumber(pricingSnapshot.refund_adjustment))
      : 0;
    const netPayoutAmount = (() => {
      if (view !== "full") return null;
      const settlementPayout = asNumber(settlementLine?.amount);
      if (settlementPayout > 0) return settlementPayout;
      const folioPayout = asNumber(folio?.host_payout_amount);
      if (folioPayout > 0) return folioPayout;
      const payout = asNumber(row.partner_payout_amount);
      if (payout > 0) return payout;
      const snapshotPayout = asNumber(payoutBreakdown.host_net_payout);
      if (snapshotPayout > 0) return snapshotPayout;
      if (totalPrice <= 0) return null;
      return totalPrice * ((100 - globalCommission) / 100);
    })();
    const otaCommissionAmount = isOta && amountValue != null && netPayoutAmount != null
      ? Math.max(0, amountValue - netPayoutAmount - platformFeeAmount - taxAmount + refundAdjustmentAmount)
      : null;
    const payoutStatus = view === "full" ? (asString(payoutExecution?.status) ?? asString(settlement?.status) ?? asString(latestPayout?.status)) : null;
    const payoutPaidAt = view === "full"
      ? (asString(payoutExecution?.processed_at) ?? asString(settlement?.paid_at) ?? asString(latestPayout?.processed_at) ?? asString(latestPayout?.created_at))
      : null;
    const paymentCollectMode = sourceChannel === "pms_manual"
      ? "PROPERTY_COLLECT"
      : sourceCategory === "famlo"
        ? "FAMLO_COLLECT"
        : resolveOtaPaymentCollectMode(asString(folioMetadata.payment_collect_mode) ?? asString(folioMetadata.payment_collect) ?? asString(pricingSnapshot.payment_collect_mode) ?? asString(pricingSnapshot.payment_collect));
    const settlementEligible = view === "full" && Boolean(folioMetadata.is_settlement_eligible === true || settlementLine || settlement);
    const famloPayoutEligible = view === "full" && paymentCollectMode === "FAMLO_COLLECT" && Boolean(settlementLine);
    const revenueDate = view === "full" && (isCompletedRevenueStatus(reservationStatus) || isCompletedRevenueStatus(row.status) || Boolean(settlementLine)) ? checkoutDate : null;
    const adultCountRaw = asNumber(pricingSnapshot.adult_count) || asNumber(pricingSnapshot.adults) || asNumber(pricingSnapshot.guest_adults);
    const childCountRaw = asNumber(pricingSnapshot.child_count) || asNumber(pricingSnapshot.children) || asNumber(pricingSnapshot.guest_children);
    const guestCountRaw = asNumber(row.guests_count) || asNumber(pricingSnapshot.guests_count) || asNumber(pricingSnapshot.guest_count) || adultCountRaw + childCountRaw;

    return [{
      bookingId,
      roomId: stayUnitId,
      roomName: stayUnitId ? roomNameById.get(stayUnitId) ?? "Room" : "Room",
      startDate,
      endDate,
      checkoutDate,
      revenueDate,
      createdAt: asString(row.created_at),
      guestDisplayName: asString(pricingSnapshot.channel_guest_display_name) ?? asString(pricingSnapshot.channel_guest_name) ?? asString(pricingSnapshot.guest_name) ?? asString(userRecord.name) ?? (isOta ? "OTA Guest" : "Famlo Guest"),
      status: String(row.status ?? "unknown"),
      reservationStatus,
      paymentStatus: asString(row.payment_status),
      amount: totalPrice > 0 ? formatCurrency(totalPrice, bookingCurrency) : matchedRevision?.amount != null ? formatCurrency(matchedRevision.amount, matchedRevision.currency ?? bookingCurrency) : null,
      amountValue,
      currency: bookingCurrency,
      netPayoutAmount,
      payoutAmountValue,
      paidPayoutAmount: view === "full" && isPaidPayoutStatus(payoutStatus) ? payoutAmountValue : null,
      sourceLabel: isOta
        ? `${asString(pricingSnapshot.channel_name) ?? matchedRevision?.otaName ?? "OTA"} / Channex`
        : sourceChannel === "pms_manual"
          ? "Famlo PMS"
          : "Famlo Direct",
      sourceCategory,
      paymentCollectMode,
      famloPayoutEligible,
      settlementEligible,
      payoutHoldStatus: null,
      payoutHoldIsHostActionable: false,
      settlementStatus: view === "full" ? asString(settlement?.status) : null,
      payoutExecutionStatus: view === "full" ? asString(payoutExecution?.status) : null,
      complianceBlocked: view === "full" ? !(panVerified && payoutAccountActive) : false,
      payoutStatus,
      payoutPaidAt,
      estimatedPayoutDate: view === "full" ? (payoutStatus === "paid" ? payoutPaidAt : endDate) : null,
      famloRevenueAmount: view === "full" ? (asNumberOrNull(platformInvoice?.total_amount) ?? asNumberOrNull(financeContract.famlo_net_revenue) ?? asNumberOrNull(pricingSnapshot.famlo_platform_fee_taxable)) : null,
      platformFeeAmount: platformFeeAmount > 0 ? platformFeeAmount : null,
      otaCommissionAmount: view === "full" && otaCommissionAmount && otaCommissionAmount > 0 ? otaCommissionAmount : null,
      refundAdjustmentAmount: refundAdjustmentAmount > 0 ? refundAdjustmentAmount : null,
      creditNoteAmount: view === "full" && creditNoteAmount > 0 ? creditNoteAmount : null,
      taxAmount: taxAmount > 0 ? taxAmount : null,
      externalBookingId: externalBookingId ?? matchedRevision?.externalBookingId ?? null,
      externalRevisionId: asString(pricingSnapshot.channel_external_revision_id) ?? matchedRevision?.externalRevisionId ?? null,
      importStatus: isOta ? matchedRevision?.importStatus ?? "preview" : "not_applicable",
      ackStatus: isOta ? matchedRevision?.ackStatus ?? "not_acknowledged" : "not_applicable",
      linkedBookingId: matchedRevision?.linkedBookingId ?? bookingId,
      isOta,
      isReviewOnly: reviewReasonLabels.length > 0,
      reviewTitle,
      reviewReasonLabels,
      guestEmail: asString(userRecord.email) ?? asString(pricingSnapshot.guest_email),
      guestCount: guestCountRaw > 0 ? guestCountRaw : null,
      adultCount: adultCountRaw > 0 ? adultCountRaw : null,
      childCount: childCountRaw > 0 ? childCountRaw : null,
    }];
  });

  const visibleBookingIds = new Set(persisted.map((booking) => booking.bookingId));
  const visibleExternalBookingIds = new Set(persisted.map((booking) => booking.externalBookingId).filter(Boolean) as string[]);
  const reviewOnly = view === "full" ? revisions.flatMap((revision) => {
    if (revision.providerCode !== "channex") return [];
    if (revision.linkedBookingId && visibleBookingIds.has(revision.linkedBookingId)) return [];
    if (revision.externalBookingId && visibleExternalBookingIds.has(revision.externalBookingId)) return [];
    const roomId = revision.externalRoomTypeId ? roomIdByExternalRoomTypeId.get(revision.externalRoomTypeId) ?? null : null;
    const roomName = roomId ? roomNameById.get(roomId) ?? "Room" : "Room";
    const reviewReasonLabels = asStringArray(asObject(revision.rawPayload).review_conflict_labels);
    const reviewTitle = asString(asObject(revision.rawPayload).review_title) ?? (reviewReasonLabels.length > 0 ? "Channex booking needs review" : null);
    const isImportedRevision = revision.importStatus === "imported" && Boolean(revision.linkedBookingId);
    return [{
      bookingId: revision.linkedBookingId ?? `review:${revision.id}`,
      roomId,
      roomName,
      startDate: revision.arrivalDate ?? "",
      endDate: revision.departureDate ?? "",
      checkoutDate: revision.departureDate ?? "",
      revenueDate: null,
      createdAt: revision.updatedAt,
      guestDisplayName: revision.guestName ?? "OTA Guest",
      status: isImportedRevision ? "confirmed" : "pending_review",
      reservationStatus: null,
      paymentStatus: isImportedRevision ? "not_required" : "review_needed",
      amount: revision.amount != null ? formatCurrency(revision.amount, revision.currency ?? "INR") : null,
      amountValue: revision.amount,
      currency: revision.currency ?? "INR",
      netPayoutAmount: null,
      payoutAmountValue: null,
      paidPayoutAmount: null,
      sourceLabel: `${revision.otaName ?? "OTA"} / Channex`,
      sourceCategory: "ota",
      paymentCollectMode: resolveOtaPaymentCollectMode(revision.paymentCollect),
      famloPayoutEligible: false,
      settlementEligible: false,
      payoutHoldStatus: null,
      payoutHoldIsHostActionable: false,
      settlementStatus: null,
      payoutExecutionStatus: null,
      complianceBlocked: false,
      payoutStatus: null,
      payoutPaidAt: null,
      estimatedPayoutDate: revision.departureDate ?? null,
      famloRevenueAmount: null,
      platformFeeAmount: null,
      otaCommissionAmount: null,
      refundAdjustmentAmount: null,
      creditNoteAmount: null,
      taxAmount: null,
      externalBookingId: revision.externalBookingId,
      externalRevisionId: revision.externalRevisionId,
      importStatus: revision.importStatus,
      ackStatus: revision.ackStatus,
      linkedBookingId: revision.linkedBookingId,
      isOta: true,
      isReviewOnly: !isImportedRevision,
      reviewTitle,
      reviewReasonLabels,
      guestEmail: asString(asObject(revision.rawPayload).guest_email),
      guestCount: null,
      adultCount: null,
      childCount: null,
    } satisfies LiveProBookingSummary];
  }) : [];

  const response = {
    bookings: [...persisted, ...reviewOnly].sort((left, right) => {
      if (left.isOta !== right.isOta) return left.isOta ? -1 : 1;
      return (right.startDate ?? "").localeCompare(left.startDate ?? "");
    }),
    health: readChannelFeedHealth(propertyMetadata),
  };
  trace.end({
    rooms: rooms.length,
    persisted: persisted.length,
    reviewOnly: reviewOnly.length,
    view,
    limit: bookingLimit,
  });
  return response;
}

export async function loadLiveCalendarSnapshot(
  supabase: SupabaseClient,
  input: {
    familyId: string;
    dateFrom: string;
    dateTo: string;
    roomIds?: string[] | null;
  }
): Promise<CalendarSnapshotResult> {
  const trace = createDevTrace("[host.pro.calendar.snapshot:helper]", {
    familyId: input.familyId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });
  const rooms = await loadRoomsForFamily(supabase, input.familyId);
  const filteredRooms = input.roomIds && input.roomIds.length > 0 ? rooms.filter((room) => input.roomIds?.includes(room.id)) : rooms;
  const roomNameById = new Map(filteredRooms.map((room) => [room.id, room.name]));
  const { revisions, roomIdByExternalRoomTypeId, propertyMetadata } = await loadChannelFoundationLight(supabase, input.familyId);
  trace.mark("rooms_and_foundation");
  const roomRevisionByLinkedBookingId = new Map(
    revisions.filter((revision) => revision.linkedBookingId).map((revision) => [revision.linkedBookingId as string, revision] as const)
  );
  const roomRevisionByExternalBookingId = new Map(
    revisions.filter((revision) => revision.externalBookingId).map((revision) => [revision.externalBookingId as string, revision] as const)
  );

  const { data: hostRows, error: hostRowsError } = await supabase.from("hosts").select("id").eq("legacy_family_id", input.familyId);
  if (hostRowsError) throw hostRowsError;
  const hostIds = ((hostRows ?? []) as Array<Record<string, unknown>>).map((row) => asString(row.id)).filter(Boolean) as string[];
  trace.mark("host_rows");

  let bookingRowsForCalendar: Array<Record<string, unknown>> = [];
  if (hostIds.length > 0) {
    const calendarSelectWithStayUnit = "id,status,payment_status,total_price,start_date,end_date,stay_unit_id,pricing_snapshot,users!user_id(name)";
    const calendarSelectFallback = "id,status,payment_status,total_price,start_date,end_date,pricing_snapshot,users!user_id(name)";
    let query = supabase
      .from("bookings_v2")
      .select(calendarSelectWithStayUnit)
      .in("host_id", hostIds)
      .lte("start_date", input.dateTo)
      .gte("end_date", input.dateFrom);
    if (input.roomIds && input.roomIds.length > 0) {
      query = query.in("stay_unit_id", input.roomIds);
    }
    const calendarResult = await query;
    if (calendarResult.error && isMissingColumnError(calendarResult.error, "stay_unit_id")) {
      let fallbackQuery = supabase
        .from("bookings_v2")
        .select(calendarSelectFallback)
        .in("host_id", hostIds)
        .lte("start_date", input.dateTo)
        .gte("end_date", input.dateFrom);
      if (input.roomIds && input.roomIds.length > 0) {
        fallbackQuery = fallbackQuery.in("pricing_snapshot->>stay_unit_id", input.roomIds);
      }
      const fallbackResult = await fallbackQuery;
      if (!fallbackResult.error) bookingRowsForCalendar = (fallbackResult.data ?? []) as Array<Record<string, unknown>>;
    } else if (!calendarResult.error) {
      bookingRowsForCalendar = (calendarResult.data ?? []) as Array<Record<string, unknown>>;
    }
  }
  trace.mark("booking_rows");

  const roomProjectedRates = new Map<string, Map<string, number>>();
  const roomProjectedAvailability = new Map<string, Map<string, { availableUnits: number; stopSell: boolean }>>();
  const roomManualBlockDates = new Map<string, Set<string>>();
  const roomDailyRateOverrides = new Map<string, Map<string, number>>();

  const roomSnapshots = await Promise.all(
    filteredRooms.map(async (room) => {
      const [projectedDays, events] = await Promise.all([
        ensureProjectedInventory(supabase, {
          familyId: input.familyId,
          stayUnitId: room.id,
          from: input.dateFrom,
          to: input.dateTo,
        }),
        loadCanonicalCalendar(supabase, {
          ownerType: "stay_unit",
          ownerId: room.id,
          from: input.dateFrom,
          to: input.dateTo,
        }),
      ]);

      const rateMap = new Map<string, number>();
      const availabilityMap = new Map<string, { availableUnits: number; stopSell: boolean }>();
      const blockSet = new Set<string>();
      for (const day of projectedDays) {
        if (day.effectiveRate > 0) rateMap.set(day.date, day.effectiveRate);
        availabilityMap.set(day.date, { availableUnits: day.availableUnits, stopSell: day.stopSell });
        if (day.manualBlockPresent) blockSet.add(day.date);
      }

      const rateOverrides = new Map<string, number>();
      for (const event of events) {
        if (event.sourceType === "manual_rate" && event.status !== "released") {
          const amount = asNumber(asObject(event.payload).amount);
          if (amount <= 0) continue;
          let cursor = event.startDate;
          while (cursor <= event.endDate) {
            rateOverrides.set(cursor, amount);
            cursor = addDays(cursor, 1);
          }
        }
      }

      return {
        roomId: room.id,
        rateMap,
        availabilityMap,
        blockSet,
        rateOverrides,
      };
    })
  );
  trace.mark("room_snapshots");

  for (const roomSnapshot of roomSnapshots) {
    roomProjectedRates.set(roomSnapshot.roomId, roomSnapshot.rateMap);
    roomProjectedAvailability.set(roomSnapshot.roomId, roomSnapshot.availabilityMap);
    roomManualBlockDates.set(roomSnapshot.roomId, roomSnapshot.blockSet);
    roomDailyRateOverrides.set(roomSnapshot.roomId, roomSnapshot.rateOverrides);
  }

  const bookingStatusByRoomDate = new Map<string, LiveCalendarCellStatus>();
  const bookingDetailByRoomDate = new Map<string, LiveCalendarBookingDetail>();
  for (const row of bookingRowsForCalendar) {
    const pricingSnapshot = asObject(row.pricing_snapshot);
    const userRecord = asObject(row.users);
    const stayUnitId = asString(row.stay_unit_id) ?? asString(pricingSnapshot.stay_unit_id);
    const startDate = asString(row.start_date);
    const endDate = asString(row.end_date) ?? startDate;
    const status = normalizeToken(row.status);
    const bookingId = asString(row.id);
    const externalBookingId = asString(pricingSnapshot.channel_external_booking_id);
    const matchedRevision = (bookingId ? roomRevisionByLinkedBookingId.get(bookingId) : null) ?? (externalBookingId ? roomRevisionByExternalBookingId.get(externalBookingId) : null) ?? null;
    const isOtaBooking = asString(pricingSnapshot.channel_provider) === "channex";
    if (!stayUnitId || !startDate || !endDate || !bookingId || !isBlockingBookingStatus(status)) continue;

    const guestDisplayName =
      asString(pricingSnapshot.channel_guest_display_name) ??
      asString(pricingSnapshot.channel_guest_name) ??
      asString(pricingSnapshot.guest_name) ??
      asString(userRecord.name) ??
      (isOtaBooking ? "OTA Guest" : "Famlo Guest");
    const bookingCurrency = asString(pricingSnapshot.currency) ?? matchedRevision?.currency ?? "INR";
    const totalPrice = asNumber(row.total_price);
    const bookingAmount = totalPrice > 0 ? formatCurrency(totalPrice, bookingCurrency) : matchedRevision?.amount != null ? formatCurrency(matchedRevision.amount, matchedRevision.currency ?? bookingCurrency) : null;

    for (const date of enumerateStayNights(startDate, endDate)) {
      const key = `${stayUnitId}:${date}`;
      bookingStatusByRoomDate.set(key, isOtaBooking ? "ota" : "famlo");
      bookingDetailByRoomDate.set(key, {
        bookingId,
        roomName: roomNameById.get(stayUnitId) ?? "Room",
        startDate,
        endDate,
        sourceLabel: isOtaBooking ? `${matchedRevision?.otaName ?? "OTA"} / Channex` : "Famlo Direct",
        externalBookingId,
        guestDisplayName,
        amount: bookingAmount,
        currency: bookingCurrency,
        paymentStatus: asString(row.payment_status),
        importStatus: matchedRevision?.importStatus ?? (isOtaBooking ? "preview" : "not_applicable"),
        ackStatus: matchedRevision?.ackStatus ?? (isOtaBooking ? "not_acknowledged" : "not_applicable"),
        linkedBookingId: matchedRevision?.linkedBookingId ?? bookingId,
        externalRevisionId: matchedRevision?.externalRevisionId ?? null,
        bookingListRevisionId: matchedRevision?.id ?? null,
        feedStatus: isOtaBooking ? "found" : "not_applicable",
        isCrsOnly: false,
        ackEligible: Boolean(isOtaBooking),
        importedIntoFamlo: Boolean(matchedRevision?.linkedBookingId ?? bookingId),
        acknowledged: matchedRevision?.ackStatus === "acknowledged",
        acknowledgementNote: matchedRevision?.ackStatus === "acknowledged" ? "Acknowledged by Famlo." : null,
      });
    }
  }

  const today = input.dateFrom;
  const rows: LiveCalendarRow[] = filteredRooms.map((room) => {
    const availabilityMap = roomProjectedAvailability.get(room.id) ?? new Map();
    const projectedRates = roomProjectedRates.get(room.id) ?? new Map();
    const rateOverrides = roomDailyRateOverrides.get(room.id) ?? new Map();
    const blockedDates = roomManualBlockDates.get(room.id) ?? new Set();
    const dates = enumerateDates(input.dateFrom, input.dateTo);

    return {
      roomId: room.id,
      roomName: room.name,
      unitType: room.unitType,
      rate: room.priceFullday,
      availabilityCells: dates.map((date) => {
        const projected = availabilityMap.get(date) ?? null;
        const key = `${room.id}:${date}`;
        const bookingStatus = bookingStatusByRoomDate.get(key) ?? null;
        const status: LiveCalendarCellStatus =
          date < today
            ? "past"
            : bookingStatus ??
              (blockedDates.has(date) || projected?.stopSell ? "manual_block" : (projected?.availableUnits ?? 1) <= 0 ? "unavailable" : "available");
        return {
          date,
          status,
          label: checkoutExclusiveStatusLabel(status, projected?.availableUnits ?? null),
          availableUnits: projected?.availableUnits ?? 1,
          bookingDetail: bookingDetailByRoomDate.get(key) ?? null,
        };
      }),
      rateCells: dates.map((date) => {
        const overrideRate = rateOverrides.get(date);
        const projectedRate = projectedRates.get(date);
        const amount = overrideRate ?? projectedRate ?? room.priceFullday;
        const isOverridden = rateOverrides.has(date) || projectedRates.has(date);
        return {
          date,
          displayValue: amount > 0 ? formatCurrency(amount, "INR") ?? "Missing" : "Missing",
          amount: amount > 0 ? amount : null,
          baseAmount: room.priceFullday,
          isPast: date < today,
          isOverridden,
        };
      }),
    };
  });
  trace.mark("rows");

  const sync = await loadHostProCalendarSyncSnapshot({
    supabase,
    familyId: input.familyId,
    stayUnitIds: filteredRooms.map((room) => room.id),
    observedAt: new Date().toISOString(),
  }).catch((error) =>
    buildCalendarSyncMetadata({
      connected: Boolean(asObject(propertyMetadata).external_property_id),
      ok: false,
      observedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Failed to load calendar sync state.",
    })
  );
  trace.mark("sync");
  trace.end({
    rooms: filteredRooms.length,
    bookingRows: bookingRowsForCalendar.length,
  });
  return { rows, sync };
}
