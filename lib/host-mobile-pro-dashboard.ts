import type { SupabaseClient } from "@supabase/supabase-js";

import { shouldIncludeFamloPayoutInTotals, isFinanceBackedPaidStatus, isCompletedRevenueBooking } from "@/lib/finance/pro-revenue";
import { buildHostMobileReportDownloadHref } from "@/lib/host-mobile-report-pdfs";
import { loadHostProChannelFoundation, type HostProChannelFoundation } from "@/lib/host-pro-channel-foundation";
import { loadHostProAccess, type HostProAccessResult } from "@/lib/host-pro-access";
import { loadLiveProBookingsSnapshot, type BookingFeedLiveHealth, type LiveProBookingSummary } from "@/lib/host-pro-live-data";
import { loadHostProSettings } from "@/lib/host-pro-settings";
import { buildHostProSetupReadiness } from "@/lib/host-pro-setup-readiness";
import { loadStayUnitsForSelector, type StayUnitRecord } from "@/lib/stay-units";

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

export type HostMobileProDashboardOverview = {
  ok: true;
  detailLevel?: "critical" | "full";
  generatedAt: string;
  familyId: string;
  property: {
    familyId: string;
    name: string;
    displayName: string;
    locationLabel: string;
    city: string | null;
    state: string | null;
    country: string | null;
    hostDisplayName: string | null;
    proStatus: HostProAccessResult["status"];
    proAllowed: boolean;
    proReason: string;
    proCurrentPeriodEnd: string | null;
    proGraceUntil: string | null;
  };
  propertyOptions: Array<{
    familyId: string;
    name: string;
    city: string | null;
    state: string | null;
    isSelected: boolean;
    activeRoomCount: number;
  }>;
  rooms: Array<{
    id: string;
    name: string;
    unitType: string;
    description: string | null;
    maxGuests: number;
    bedInfo: string | null;
    bathroomType: string | null;
    toiletTypes: string[];
    roomSizeSqm: number | null;
    lat: number | null;
    lng: number | null;
    priceMorning: number;
    priceAfternoon: number;
    priceEvening: number;
    priceFullday: number;
    quarterEnabled: boolean;
    isActive: boolean;
    isPrimary: boolean;
    amenities: string[];
    amenitiesCount: number;
    photos: string[];
    localityPhotos: string[];
    photosCount: number;
    photoUrl: string | null;
    sortOrder: number | null;
    source: StayUnitRecord["source"];
  }>;
  setup: {
    progressPercent: number;
    completedCount: number;
    totalCount: number;
    nextAction: string;
    missingItems: Array<{ key: string; title: string; hint: string; valueLabel?: string | null }>;
  };
  channels: {
    connected: boolean;
    connectedCount: number;
    providerCount: number;
    mappedRoomCount: number;
    totalActiveRoomCount: number;
    mappedRatePlanCount: number;
    lastSyncedAt: string | null;
    lastError: string | null;
    syncJobCounts: Record<string, number>;
    providers: Array<{
      code: string;
      name: string;
      status: string;
      connected: boolean;
      lastSyncedAt: string | null;
      lastError: string | null;
      mappedRooms: number;
      mappedRatePlans: number;
      pendingJobs: number;
      failedJobs: number;
    }>;
    recentLogs: Array<{
      id: string;
      providerCode: string;
      action: string;
      status: string;
      message: string | null;
      createdAt: string | null;
    }>;
  };
  bookings: {
    status: "loaded" | "unavailable";
    error: string | null;
    count: number;
    currentCount: number;
    historyCount: number;
    activeCount: number;
    upcomingCount: number;
    cancelledCount: number;
    pendingReviewCount: number;
    latest: LiveProBookingSummary[];
    health: BookingFeedLiveHealth | null;
  };
  revenue: {
    status: "loaded" | "unavailable";
    source: "pro_bookings_snapshot";
    error: string | null;
    currency: "INR";
    grossThisMonthAmount: number;
    netPayoutThisMonthAmount: number;
    paidToHostThisMonthAmount: number;
    pendingPayoutThisMonthAmount: number;
    upcomingConfirmedAmount: number;
    bookingCountThisMonth: number;
    trueZero: boolean;
    bySource: Array<{ key: "famlo" | "ota" | "direct"; label: string; amount: number; count: number }>;
  };
  report: {
    status: "loaded" | "unavailable";
    error: string | null;
    occupancyThisMonthPercent: number;
    bookedNightsThisMonth: number;
    availableRoomNightsThisMonth: number;
    averageBookingValue: number | null;
    topSourceLabel: string | null;
    bookingSourceMix: Array<{ label: string; count: number }>;
    trendThisMonth: Array<{ date: string; bookingCount: number; revenueAmount: number }>;
  };
  dashboard: {
    quickActions: {
      manualBooking: boolean;
      blockDates: boolean;
      updatePrice: boolean;
      reports: boolean;
      receiptDownload: boolean;
      whatsappReceipt: boolean;
    };
    todaySnapshot: {
      checkInsCount: number;
      checkOutsCount: number;
      occupiedRoomsCount: number;
      blockedRoomsCount: number;
      actionNeededCount: number;
    };
    revenueSnapshots: Array<{
      key: "today" | "week" | "month" | "year";
      label: string;
      from: string;
      to: string;
      bookingCount: number;
      averageBookingValue: number | null;
      grossBookingValue: number;
      manualRevenue: number;
      famloRevenue: number;
      otaRevenue: number;
      famloPendingPayout: number;
      famloPayoutPaid: number;
      chart: Array<{
        date: string;
        label: string;
        grossBookingValue: number;
        bookingCount: number;
      }>;
      hasChartData: boolean;
      performance: {
        totalBookings: number;
        occupancyPercent: number | null;
        topSourceLabel: string | null;
        cancellationCount: number;
        otaSourceRevenue: Array<{
          sourceName: string;
          grossRevenue: number;
          bookingCount: number;
        }>;
      };
    }>;
    recentActivity: Array<{
      id: string;
      type:
        | "manual_booking"
        | "famlo_booking"
        | "ota_booking"
        | "payout_pending"
        | "payout_paid"
        | "refund_adjusted"
        | "date_blocked"
        | "price_updated";
      title: string;
      subtitle: string;
      amount: number | null;
      status: string;
      occurredAt: string | null;
    }>;
    reports: Array<{
      key:
        | "monthly_revenue"
        | "booking_summary"
        | "famlo_payout"
        | "ota_performance"
        | "cancellation_refund"
        | "gst_report"
        | "custom_report";
      label: string;
      status: "available" | "locked" | "coming_soon";
      detail: string;
      href: string | null;
    }>;
  };
  dataSources: {
    rooms: { ok: boolean; source: "loadStayUnitsForSelector"; count: number };
    channels: { ok: boolean; source: "loadHostProChannelFoundation"; count: number };
    bookings: { ok: boolean; source: "loadLiveProBookingsSnapshot"; count: number; error: string | null };
  };
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function normalizeToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, "_") : "";
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

function isCancelledBooking(booking: Pick<LiveProBookingSummary, "status" | "reservationStatus">): boolean {
  const status = normalizeToken(booking.status);
  const reservationStatus = normalizeToken(booking.reservationStatus);
  return status.startsWith("cancel") || reservationStatus.startsWith("cancel");
}

function isPendingReviewBooking(booking: Pick<LiveProBookingSummary, "status" | "isReviewOnly">): boolean {
  return booking.isReviewOnly || normalizeToken(booking.status).includes("review");
}

function isConfirmedBooking(booking: Pick<LiveProBookingSummary, "status" | "reservationStatus">): boolean {
  const status = normalizeToken(booking.status);
  const reservationStatus = normalizeToken(booking.reservationStatus);
  return (
    status === "confirmed" ||
    status === "accepted" ||
    status === "paid" ||
    reservationStatus === "confirmed" ||
    reservationStatus === "checked_in" ||
    reservationStatus === "checked_out"
  );
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysIso(date: string, days: number): string {
  const next = new Date(`${date}T12:00:00+05:30`);
  next.setDate(next.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(next);
}

function monthBounds(anchorDate: string): {
  monthPrefix: string;
  monthStart: string;
  monthEndExclusive: string;
  daysInMonth: number;
} {
  const [yearRaw, monthRaw] = anchorDate.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  const monthPrefix = `${yearRaw}-${monthRaw}`;
  const monthStart = `${monthPrefix}-01`;
  const monthEndExclusiveDate = new Date(year, monthIndex + 1, 1);
  const monthEndExclusive = `${monthEndExclusiveDate.getFullYear()}-${String(monthEndExclusiveDate.getMonth() + 1).padStart(2, "0")}-01`;
  return {
    monthPrefix,
    monthStart,
    monthEndExclusive,
    daysInMonth: new Date(year, monthIndex + 1, 0).getDate(),
  };
}

function countOverlappingNights(startDate: string, endDate: string, windowStart: string, windowEndExclusive: string): number {
  if (!startDate || !endDate || endDate <= windowStart || startDate >= windowEndExclusive) return 0;
  let cursor = startDate > windowStart ? startDate : windowStart;
  const end = endDate < windowEndExclusive ? endDate : windowEndExclusive;
  let nights = 0;
  while (cursor < end) {
    nights += 1;
    cursor = addDaysIso(cursor, 1);
  }
  return nights;
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load Famlo Pro data.";
}

function formatInrAmount(value: number | null): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function isSchemaCompatibilityError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  return (
    code === "42501" ||
    code === "42P01" ||
    code === "42703" ||
    message.includes("permission denied") ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("relation")
  );
}

function cleanSourceLabel(value: string | null | undefined): string {
  const cleaned = (value ?? "Unknown")
    .replace(/\s*\/\s*channex/gi, "")
    .replace(/\s*\(channex\)/gi, "")
    .replace(/\bchannex\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || "Unknown";
}

function isDateWithinRange(date: string | null | undefined, from: string, to: string): boolean {
  if (!date) return false;
  return date >= from && date <= to;
}

function rangeDayCount(from: string, to: string): number {
  if (!from || !to || to < from) return 0;
  let cursor = from;
  let count = 0;
  while (cursor <= to) {
    count += 1;
    cursor = addDaysIso(cursor, 1);
  }
  return count;
}

function buildDailyChartPoints(
  bookings: LiveProBookingSummary[],
  from: string,
  to: string
): Array<{ date: string; label: string; grossBookingValue: number; bookingCount: number }> {
  const revenueBookings = bookings.filter((booking) => !booking.isReviewOnly && isCompletedRevenueBooking(booking));
  const points: Array<{ date: string; label: string; grossBookingValue: number; bookingCount: number }> = [];
  let cursor = from;
  while (cursor <= to) {
    const grossBookingValue = revenueBookings
      .filter((booking) => (booking.revenueDate ?? booking.checkoutDate) === cursor)
      .reduce((sum, booking) => sum + (booking.amountValue ?? 0), 0);
    const bookingCount = bookings.filter((booking) => booking.startDate === cursor).length;
    points.push({
      date: cursor,
      label: cursor.slice(8, 10),
      grossBookingValue,
      bookingCount,
    });
    cursor = addDaysIso(cursor, 1);
  }
  return points;
}

function buildYearlyChartPoints(
  bookings: LiveProBookingSummary[],
  from: string,
  to: string
): Array<{ date: string; label: string; grossBookingValue: number; bookingCount: number }> {
  const revenueBookings = bookings.filter((booking) => !booking.isReviewOnly && isCompletedRevenueBooking(booking));
  const startYear = Number(from.slice(0, 4));
  const startMonth = Number(from.slice(5, 7));
  const endMonth = Number(to.slice(5, 7));
  const points: Array<{ date: string; label: string; grossBookingValue: number; bookingCount: number }> = [];
  for (let month = startMonth; month <= endMonth; month += 1) {
    const monthToken = `${startYear}-${String(month).padStart(2, "0")}`;
    points.push({
      date: `${monthToken}-01`,
      label: new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "Asia/Kolkata" }).format(
        new Date(`${monthToken}-01T00:00:00+05:30`)
      ),
      grossBookingValue: revenueBookings
        .filter((booking) => (booking.revenueDate ?? booking.checkoutDate).startsWith(monthToken))
        .reduce((sum, booking) => sum + (booking.amountValue ?? 0), 0),
      bookingCount: bookings.filter((booking) => booking.startDate.startsWith(monthToken)).length,
    });
  }
  return points;
}

function startOfWeekIso(date: string): string {
  const candidate = new Date(`${date}T12:00:00+05:30`);
  const day = candidate.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  candidate.setDate(candidate.getDate() + offset);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(candidate);
}

function startOfYearIso(date: string): string {
  return `${date.slice(0, 4)}-01-01`;
}

function uniqueRoomCount(bookings: LiveProBookingSummary[]): number {
  return new Set(bookings.map((booking) => booking.roomId).filter(Boolean)).size;
}

async function loadTodayBlockedRoomCount(
  supabase: SupabaseClient,
  familyId: string,
  today: string
): Promise<number> {
  const result = await supabase
    .from("inventory_day_projection")
    .select("stay_unit_id,is_blocked,manual_block_present,stop_sell")
    .eq("family_id", familyId)
    .eq("date", today);

  if (result.error) {
    if (isSchemaCompatibilityError(result.error)) return 0;
    throw result.error;
  }

  return new Set(
    ((result.data ?? []) as JsonRecord[])
      .filter((row) => Boolean(row.is_blocked) || Boolean(row.manual_block_present) || Boolean(row.stop_sell))
      .map((row) => asString(row.stay_unit_id))
      .filter(Boolean)
  ).size;
}

async function loadRecentInventoryEvents(
  supabase: SupabaseClient,
  familyId: string
): Promise<JsonRecord[]> {
  const result = await supabase
    .from("inventory_event_log")
    .select("id,stay_unit_id,event_type,effective_date_start,effective_date_end,payload,created_at")
    .eq("family_id", familyId)
    .in("event_type", ["manual_block_set", "manual_rate_set"])
    .order("created_at", { ascending: false })
    .limit(10);

  if (result.error) {
    if (isSchemaCompatibilityError(result.error)) return [];
    throw result.error;
  }

  return (result.data ?? []) as JsonRecord[];
}

function buildRevenueSnapshot(
  key: "today" | "week" | "month" | "year",
  label: string,
  from: string,
  to: string,
  bookings: LiveProBookingSummary[],
  rooms: HostMobileProDashboardOverview["rooms"]
): HostMobileProDashboardOverview["dashboard"]["revenueSnapshots"][number] {
  const activeRoomCount = rooms.filter((room) => room.isActive).length;
  const completedRevenueBookings = bookings.filter((booking) => !booking.isReviewOnly && isCompletedRevenueBooking(booking));
  const revenueBookings = completedRevenueBookings.filter((booking) => isDateWithinRange(booking.revenueDate ?? booking.checkoutDate, from, to));
  const famloPayoutBookings = revenueBookings.filter((booking) => shouldIncludeFamloPayoutInTotals(booking));
  const bookingRangeRows = bookings.filter((booking) => isDateWithinRange(booking.startDate, from, to));
  const sourceMix = Object.entries(
    bookingRangeRows.reduce<Record<string, number>>((accumulator, booking) => {
      const bucket = cleanSourceLabel(booking.sourceLabel || (booking.sourceCategory === "direct" ? "Manual" : booking.sourceCategory === "ota" ? "OTA" : "Famlo"));
      accumulator[bucket] = (accumulator[bucket] ?? 0) + 1;
      return accumulator;
    }, {})
  ).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const otaSourceRevenue = Object.values(
    revenueBookings
      .filter((booking) => booking.sourceCategory === "ota")
      .reduce<Record<string, { sourceName: string; grossRevenue: number; bookingCount: number }>>((accumulator, booking) => {
        const sourceName = cleanSourceLabel(booking.sourceLabel);
        const current = accumulator[sourceName] ?? { sourceName, grossRevenue: 0, bookingCount: 0 };
        current.grossRevenue += booking.amountValue ?? 0;
        current.bookingCount += 1;
        accumulator[sourceName] = current;
        return accumulator;
      }, {})
  ).sort((left, right) => right.grossRevenue - left.grossRevenue || right.bookingCount - left.bookingCount);
  const bookedNights = bookings
    .filter((booking) => !isCancelledBooking(booking) && isConfirmedBooking(booking))
    .reduce((sum, booking) => sum + countOverlappingNights(booking.startDate, booking.checkoutDate, from, addDaysIso(to, 1)), 0);
  const availableRoomNights = activeRoomCount > 0 ? activeRoomCount * rangeDayCount(from, to) : 0;
  const chart = key === "year" ? buildYearlyChartPoints(bookings, from, to) : buildDailyChartPoints(bookings, from, to);

  return {
    key,
    label,
    from,
    to,
    bookingCount: revenueBookings.length,
    averageBookingValue: revenueBookings.length > 0 ? revenueBookings.reduce((sum, booking) => sum + (booking.amountValue ?? 0), 0) / revenueBookings.length : null,
    grossBookingValue: revenueBookings.reduce((sum, booking) => sum + (booking.amountValue ?? 0), 0),
    manualRevenue: revenueBookings.filter((booking) => booking.sourceCategory === "direct").reduce((sum, booking) => sum + (booking.amountValue ?? 0), 0),
    famloRevenue: revenueBookings.filter((booking) => booking.sourceCategory === "famlo").reduce((sum, booking) => sum + (booking.amountValue ?? 0), 0),
    otaRevenue: revenueBookings.filter((booking) => booking.sourceCategory === "ota").reduce((sum, booking) => sum + (booking.amountValue ?? 0), 0),
    famloPendingPayout: famloPayoutBookings
      .filter((booking) => !isFinanceBackedPaidStatus(booking.payoutExecutionStatus) && !isFinanceBackedPaidStatus(booking.payoutStatus))
      .reduce((sum, booking) => sum + (booking.payoutAmountValue ?? 0), 0),
    famloPayoutPaid: famloPayoutBookings
      .filter((booking) => isFinanceBackedPaidStatus(booking.payoutExecutionStatus) || isFinanceBackedPaidStatus(booking.payoutStatus))
      .reduce((sum, booking) => sum + (booking.paidPayoutAmount ?? booking.payoutAmountValue ?? 0), 0),
    chart,
    hasChartData: chart.some((point) => point.grossBookingValue > 0 || point.bookingCount > 0),
    performance: {
      totalBookings: bookingRangeRows.length,
      occupancyPercent: availableRoomNights > 0 ? Math.min(100, Math.round((bookedNights / availableRoomNights) * 100)) : null,
      topSourceLabel: sourceMix[0]?.[0] ?? null,
      cancellationCount: bookings.filter((booking) => isCancelledBooking(booking) && isDateWithinRange(booking.startDate, from, to)).length,
      otaSourceRevenue,
    },
  };
}

function buildDashboardReports(
  familyId: string,
  gstin: string | null
): HostMobileProDashboardOverview["dashboard"]["reports"] {
  return [
    {
      key: "monthly_revenue",
      label: "Monthly Revenue Report",
      status: "available",
      detail: "Gross booking value, source mix, bookings, and monthly revenue summary.",
      href: buildHostMobileReportDownloadHref({ familyId, reportKey: "monthly_revenue", preset: "month" }),
    },
    {
      key: "booking_summary",
      label: "Booking Summary Report",
      status: "available",
      detail: "Guest, room, source, stay dates, and booking status.",
      href: buildHostMobileReportDownloadHref({ familyId, reportKey: "booking_summary", preset: "month" }),
    },
    {
      key: "famlo_payout",
      label: "Famlo Payout Report",
      status: "available",
      detail: "Paid and pending payouts for Famlo-collected bookings only.",
      href: buildHostMobileReportDownloadHref({ familyId, reportKey: "famlo_payout", preset: "month" }),
    },
    {
      key: "ota_performance",
      label: "OTA Performance Report",
      status: "available",
      detail: "OTA source-wise bookings and gross revenue. No fake net payout is shown.",
      href: buildHostMobileReportDownloadHref({ familyId, reportKey: "ota_performance", preset: "month" }),
    },
    {
      key: "cancellation_refund",
      label: "Cancellation & Refund Report",
      status: "coming_soon",
      detail: "Cancelled bookings, refund adjustments, and loss summary.",
      href: null,
    },
    {
      key: "gst_report",
      label: "GST Report",
      status: gstin ? "coming_soon" : "locked",
      detail: gstin
        ? "GST-ready booking and invoice summary."
        : "Add GST details to enable GST report.",
      href: null,
    },
    {
      key: "custom_report",
      label: "Custom Report",
      status: "coming_soon",
      detail: "Choose From date, To date, and source filters for a custom export.",
      href: null,
    },
  ];
}

function buildRecentActivity(
  bookings: LiveProBookingSummary[],
  rooms: HostMobileProDashboardOverview["rooms"],
  inventoryEvents: JsonRecord[]
): HostMobileProDashboardOverview["dashboard"]["recentActivity"] {
  type ActivityRow = HostMobileProDashboardOverview["dashboard"]["recentActivity"][number];
  const roomNameById = new Map(rooms.map((room) => [room.id, room.name]));
  const bookingEvents = bookings.flatMap<ActivityRow>((booking) => {
    const baseId = booking.bookingId || `${booking.roomId ?? "room"}-${booking.startDate}`;
    const occurredAt = booking.createdAt ?? booking.revenueDate ?? booking.checkoutDate ?? booking.startDate;
    const rows: ActivityRow[] = [];
    if (occurredAt) {
      rows.push({
        id: `${baseId}-booking`,
        type:
          booking.sourceCategory === "direct"
            ? "manual_booking"
            : booking.sourceCategory === "ota"
              ? "ota_booking"
              : "famlo_booking",
        title:
          booking.sourceCategory === "direct"
            ? "Manual booking added"
            : booking.sourceCategory === "ota"
              ? "OTA booking imported"
              : "Famlo booking received",
        subtitle: `${booking.guestDisplayName} · ${booking.roomName}`,
        amount: booking.amountValue ?? null,
        status: cleanSourceLabel(booking.sourceLabel),
        occurredAt,
      });
    }
    if (booking.payoutPaidAt && shouldIncludeFamloPayoutInTotals(booking) && (booking.paidPayoutAmount ?? booking.payoutAmountValue ?? 0) > 0) {
      rows.push({
        id: `${baseId}-payout-paid`,
        type: "payout_paid",
        title: "Payout paid",
        subtitle: `${booking.guestDisplayName} · ${booking.roomName}`,
        amount: booking.paidPayoutAmount ?? booking.payoutAmountValue ?? null,
        status: booking.payoutStatus ?? booking.payoutExecutionStatus ?? "paid",
        occurredAt: booking.payoutPaidAt,
      });
    } else if (shouldIncludeFamloPayoutInTotals(booking) && (booking.payoutAmountValue ?? 0) > 0) {
      rows.push({
        id: `${baseId}-payout-pending`,
        type: "payout_pending",
        title: "Payout pending",
        subtitle: `${booking.guestDisplayName} · ${booking.roomName}`,
        amount: booking.payoutAmountValue ?? null,
        status: booking.payoutStatus ?? booking.payoutExecutionStatus ?? "pending",
        occurredAt: booking.estimatedPayoutDate ?? occurredAt,
      });
    }
    if ((booking.refundAdjustmentAmount ?? 0) !== 0) {
      rows.push({
        id: `${baseId}-refund`,
        type: "refund_adjusted",
        title: "Refund adjusted",
        subtitle: `${booking.guestDisplayName} · ${booking.roomName}`,
        amount: booking.refundAdjustmentAmount ?? null,
        status: "refund_adjustment",
        occurredAt,
      });
    }
    return rows;
  });

  const inventoryActivity = inventoryEvents.map<ActivityRow>((event, index) => {
    const eventType = asString(event.event_type) ?? "";
    const roomId = asString(event.stay_unit_id);
    const from = asString(event.effective_date_start) ?? "Date pending";
    const to = asString(event.effective_date_end) ?? from;
    return {
      id: asString(event.id) ?? `inventory-${index}`,
      type: eventType === "manual_rate_set" ? "price_updated" : "date_blocked",
      title: eventType === "manual_rate_set" ? "Price updated" : "Date blocked",
      subtitle: `${roomNameById.get(roomId ?? "") ?? "Room"} · ${from}${to !== from ? ` to ${to}` : ""}`,
      amount:
        eventType === "manual_rate_set"
          ? asNumber(((event.payload as JsonRecord | null) ?? {}).amount)
          : null,
      status: eventType,
      occurredAt: asString(event.created_at),
    };
  });

  return [...bookingEvents, ...inventoryActivity]
    .filter((row) => Boolean(row.occurredAt))
    .sort((left, right) => String(right.occurredAt).localeCompare(String(left.occurredAt)))
    .slice(0, 12);
}

function roomSummary(room: StayUnitRecord): HostMobileProDashboardOverview["rooms"][number] {
  return {
    id: room.id,
    name: room.name,
    unitType: room.unitType,
    description: room.description,
    maxGuests: room.maxGuests,
    bedInfo: room.bedInfo,
    bathroomType: room.bathroomType,
    toiletTypes: room.toiletTypes,
    roomSizeSqm: room.roomSizeSqm,
    lat: room.lat,
    lng: room.lng,
    priceMorning: room.priceMorning,
    priceAfternoon: room.priceAfternoon,
    priceEvening: room.priceEvening,
    priceFullday: room.priceFullday,
    quarterEnabled: room.quarterEnabled,
    isActive: room.isActive,
    isPrimary: room.isPrimary,
    amenities: room.amenities,
    amenitiesCount: room.amenities.length,
    photos: room.photos,
    localityPhotos: room.localityPhotos,
    photosCount: room.photos.length + room.localityPhotos.length,
    photoUrl: room.photos[0] ?? room.localityPhotos[0] ?? null,
    sortOrder: room.sortOrder,
    source: room.source,
  };
}

function buildChannelSummary(
  channelFoundation: HostProChannelFoundation,
  activeRoomIds: string[]
): HostMobileProDashboardOverview["channels"] {
  const providerCodes = Array.from(
    new Set([
      ...channelFoundation.providers.map((provider) => provider.code).filter(Boolean),
      ...channelFoundation.properties.map((property) => property.providerCode).filter(Boolean),
      ...channelFoundation.roomMappings.map((mapping) => mapping.providerCode).filter(Boolean),
      ...channelFoundation.ratePlans.map((plan) => plan.providerCode).filter(Boolean),
    ])
  );
  const activeRoomIdSet = new Set(activeRoomIds);
  const providerRows = providerCodes.map((code) => {
    const provider = channelFoundation.providers.find((row) => row.code === code) ?? null;
    const providerProperties = channelFoundation.properties.filter((row) => row.providerCode === code);
    const providerMappings = channelFoundation.roomMappings.filter((row) => row.providerCode === code && activeRoomIdSet.has(row.stayUnitId));
    const providerRatePlans = channelFoundation.ratePlans.filter((row) => row.providerCode === code);
    const providerJobs = channelFoundation.syncJobs.filter((row) => row.providerCode === code);
    const providerLogs = channelFoundation.syncLogs.filter((row) => row.providerCode === code);
    const failedJob = providerJobs.find((job) => normalizeToken(job.status).includes("fail"));
    const failedLog = providerLogs.find((log) => normalizeToken(log.status).includes("fail"));
    const lastSyncedAt =
      providerProperties
        .map((row) => row.lastSyncedAt)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;

    return {
      code,
      name: provider?.name ?? code,
      status: provider?.status ?? providerProperties[0]?.syncStatus ?? "not_connected",
      connected: providerProperties.some((row) => row.syncStatus === "connected"),
      lastSyncedAt,
      lastError: failedJob?.lastError ?? failedLog?.message ?? null,
      mappedRooms: providerMappings.filter((row) => Boolean(row.externalRoomTypeId)).length,
      mappedRatePlans: providerRatePlans.filter((row) => Boolean(row.externalRatePlanId)).length,
      pendingJobs: providerJobs.filter((job) => ["queued", "pending", "processing", "running"].includes(normalizeToken(job.status))).length,
      failedJobs: providerJobs.filter((job) => normalizeToken(job.status).includes("fail")).length,
    };
  });
  const syncJobCounts = channelFoundation.syncJobs.reduce<Record<string, number>>((acc, job) => {
    const key = normalizeToken(job.status) || "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const lastSyncedAt =
    channelFoundation.properties
      .map((row) => row.lastSyncedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  return {
    connected: providerRows.some((row) => row.connected),
    connectedCount: providerRows.filter((row) => row.connected).length,
    providerCount: providerRows.length,
    mappedRoomCount: channelFoundation.roomMappings.filter((row) => activeRoomIdSet.has(row.stayUnitId) && Boolean(row.externalRoomTypeId)).length,
    totalActiveRoomCount: activeRoomIds.length,
    mappedRatePlanCount: channelFoundation.ratePlans.filter((row) => Boolean(row.externalRatePlanId)).length,
    lastSyncedAt,
    lastError: providerRows.find((row) => row.lastError)?.lastError ?? null,
    syncJobCounts,
    providers: providerRows,
    recentLogs: channelFoundation.syncLogs.slice(0, 10).map((log) => ({
      id: log.id,
      providerCode: log.providerCode,
      action: log.action,
      status: log.status,
      message: log.message,
      createdAt: log.createdAt,
    })),
  };
}

function buildBookingRevenueReport(
  bookings: LiveProBookingSummary[],
  bookingError: string | null,
  rooms: HostMobileProDashboardOverview["rooms"]
): Pick<HostMobileProDashboardOverview, "bookings" | "revenue" | "report"> {
  const today = todayIso();
  const { monthPrefix, monthStart, monthEndExclusive, daysInMonth } = monthBounds(today);
  const currentBookings = bookings.filter((booking) => !isCancelledBooking(booking) && booking.checkoutDate >= today);
  const historyBookings = bookings.filter((booking) => isCancelledBooking(booking) || booking.checkoutDate < today);
  const activeBookings = bookings.filter((booking) => !isCancelledBooking(booking) && booking.startDate <= today && booking.checkoutDate > today);
  const upcomingBookings = bookings.filter((booking) => !isCancelledBooking(booking) && booking.startDate > today);
  const completedRevenueBookings = bookings.filter((booking) => !booking.isReviewOnly && isCompletedRevenueBooking(booking));
  const thisMonthRevenueBookings = completedRevenueBookings.filter((booking) => (booking.revenueDate ?? booking.checkoutDate).startsWith(monthPrefix));
  const famloPayoutBookings = thisMonthRevenueBookings.filter((booking) => shouldIncludeFamloPayoutInTotals(booking));
  const grossThisMonthAmount = thisMonthRevenueBookings.reduce((sum, booking) => sum + (booking.amountValue ?? 0), 0);
  const netPayoutThisMonthAmount = famloPayoutBookings.reduce((sum, booking) => sum + (booking.payoutAmountValue ?? 0), 0);
  const paidToHostThisMonthAmount = famloPayoutBookings
    .filter((booking) => isFinanceBackedPaidStatus(booking.payoutExecutionStatus) || isFinanceBackedPaidStatus(booking.payoutStatus))
    .reduce((sum, booking) => sum + (booking.paidPayoutAmount ?? booking.payoutAmountValue ?? 0), 0);
  const pendingPayoutThisMonthAmount = famloPayoutBookings
    .filter((booking) => !isFinanceBackedPaidStatus(booking.payoutExecutionStatus) && !isFinanceBackedPaidStatus(booking.payoutStatus))
    .reduce((sum, booking) => sum + (booking.payoutAmountValue ?? 0), 0);
  const upcomingConfirmedAmount = bookings
    .filter((booking) => !booking.isReviewOnly && !isCancelledBooking(booking) && isConfirmedBooking(booking) && booking.startDate >= today && !isCompletedRevenueBooking(booking))
    .reduce((sum, booking) => sum + (booking.amountValue ?? 0), 0);
  const activeRoomCount = rooms.filter((room) => room.isActive).length;
  const bookedNightsThisMonth = bookings
    .filter((booking) => !isCancelledBooking(booking) && isConfirmedBooking(booking))
    .reduce((sum, booking) => sum + countOverlappingNights(booking.startDate, booking.checkoutDate, monthStart, monthEndExclusive), 0);
  const availableRoomNightsThisMonth = activeRoomCount * daysInMonth;
  const bookingValues = bookings.map((booking) => booking.amountValue).filter((value): value is number => typeof value === "number");
  const sourceMix = Object.entries(
    bookings.reduce<Record<string, number>>((acc, booking) => {
      const key = booking.sourceLabel || (booking.isOta ? "OTA" : "Famlo Direct");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((left, right) => right[1] - left[1]);
  const sourceRevenue = (key: "famlo" | "ota" | "direct") =>
    thisMonthRevenueBookings
      .filter((booking) => booking.sourceCategory === key)
      .reduce((sum, booking) => sum + (booking.amountValue ?? 0), 0);
  const sourceCount = (key: "famlo" | "ota" | "direct") =>
    thisMonthRevenueBookings.filter((booking) => booking.sourceCategory === key).length;
  const trendThisMonth = Array.from({ length: daysInMonth }, (_, index) => {
    const date = addDaysIso(monthStart, index);
    const dayBookings = bookings.filter((booking) => booking.startDate === date);
    const dayRevenue = completedRevenueBookings
      .filter((booking) => (booking.revenueDate ?? booking.checkoutDate) === date)
      .reduce((sum, booking) => sum + (booking.amountValue ?? 0), 0);
    return { date, bookingCount: dayBookings.length, revenueAmount: dayRevenue };
  });
  const unavailable = Boolean(bookingError);

  return {
    bookings: {
      status: unavailable ? ("unavailable" as const) : ("loaded" as const),
      error: bookingError,
      count: bookings.length,
      currentCount: currentBookings.length,
      historyCount: historyBookings.length,
      activeCount: activeBookings.length,
      upcomingCount: upcomingBookings.length,
      cancelledCount: bookings.filter(isCancelledBooking).length,
      pendingReviewCount: bookings.filter(isPendingReviewBooking).length,
      latest: bookings.slice(0, 12),
      health: null,
    },
    revenue: {
      status: unavailable ? ("unavailable" as const) : ("loaded" as const),
      source: "pro_bookings_snapshot",
      error: bookingError,
      currency: "INR",
      grossThisMonthAmount,
      netPayoutThisMonthAmount,
      paidToHostThisMonthAmount,
      pendingPayoutThisMonthAmount,
      upcomingConfirmedAmount,
      bookingCountThisMonth: thisMonthRevenueBookings.length,
      trueZero: !unavailable && grossThisMonthAmount === 0,
      bySource: [
        { key: "famlo", label: "Famlo Direct", amount: sourceRevenue("famlo"), count: sourceCount("famlo") },
        { key: "ota", label: "OTA", amount: sourceRevenue("ota"), count: sourceCount("ota") },
        { key: "direct", label: "Direct / Manual", amount: sourceRevenue("direct"), count: sourceCount("direct") },
      ],
    },
    report: {
      status: unavailable ? ("unavailable" as const) : ("loaded" as const),
      error: bookingError,
      occupancyThisMonthPercent:
        availableRoomNightsThisMonth > 0 ? Math.min(100, Math.round((bookedNightsThisMonth / availableRoomNightsThisMonth) * 100)) : 0,
      bookedNightsThisMonth,
      availableRoomNightsThisMonth,
      averageBookingValue: bookingValues.length > 0 ? bookingValues.reduce((sum, value) => sum + value, 0) / bookingValues.length : null,
      topSourceLabel: sourceMix[0]?.[0] ?? null,
      bookingSourceMix: sourceMix.map(([label, count]) => ({ label, count })),
      trendThisMonth,
    },
  };
}

async function loadFamilyRows(
  supabase: SupabaseClient,
  hostUserId: string | null,
  selectedFamilyId: string
): Promise<JsonRecord[]> {
  const query = hostUserId
    ? supabase.from("families").select("id,name,property_name,city,state,is_active,user_id").eq("user_id", hostUserId)
    : supabase.from("families").select("id,name,property_name,city,state,is_active,user_id").eq("id", selectedFamilyId);
  const result = await query;
  if (!result.error) return (result.data ?? []) as JsonRecord[];

  const message = String(result.error.message ?? "");
  if (!/property_name|schema cache|does not exist|could not find/i.test(message)) throw result.error;

  const fallback = hostUserId
    ? await supabase.from("families").select("id,name,city,state,is_active,user_id").eq("user_id", hostUserId)
    : await supabase.from("families").select("id,name,city,state,is_active,user_id").eq("id", selectedFamilyId);
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []) as JsonRecord[];
}

async function loadCompactProRooms(
  supabase: SupabaseClient,
  input: { familyId: string; hostId?: string | null }
): Promise<HostMobileProDashboardOverview["rooms"]> {
  let query = supabase
    .from("stay_units_v2")
    .select("id,unit_key,name,unit_type,description,max_guests,bed_info,bathroom_type,toilet_types,toilet_type,room_size_sqm,lat,lng,price_morning,price_afternoon,price_evening,price_fullday,quarter_enabled,is_active,is_primary,amenities,photos,locality_photos,sort_order,updated_at")
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(200);

  query = input.hostId ? query.eq("host_id", input.hostId) : query.eq("legacy_family_id", input.familyId);
  const { data, error } = await query;
  if (error) {
    const fallbackRooms = await loadStayUnitsForSelector(supabase, { hostId: input.hostId, legacyFamilyId: input.familyId });
    return fallbackRooms.map(roomSummary);
  }

  const rooms = ((data ?? []) as JsonRecord[]).map((row) => {
    const photos = Array.isArray(row.photos) ? row.photos.filter((photo): photo is string => typeof photo === "string" && photo.trim().length > 0) : [];
    const localityPhotos = Array.isArray(row.locality_photos) ? row.locality_photos.filter((photo): photo is string => typeof photo === "string" && photo.trim().length > 0) : [];
    const amenities = Array.isArray(row.amenities) ? row.amenities.filter((amenity): amenity is string => typeof amenity === "string" && amenity.trim().length > 0) : [];
    const toiletTypes = Array.isArray(row.toilet_types)
      ? row.toilet_types.filter((toiletType): toiletType is string => typeof toiletType === "string" && toiletType.trim().length > 0)
      : asString(row.toilet_type)
        ? [asString(row.toilet_type)!]
        : [];
    return {
      id: asString(row.id) ?? "",
      name: asString(row.name) ?? "Room",
      unitType: asString(row.unit_type) ?? "private_room",
      description: asString(row.description),
      maxGuests: Math.max(1, asNumber(row.max_guests) || 1),
      bedInfo: asString(row.bed_info),
      bathroomType: asString(row.bathroom_type),
      toiletTypes,
      roomSizeSqm: row.room_size_sqm == null ? null : asNumber(row.room_size_sqm),
      lat: row.lat == null ? null : asNumber(row.lat),
      lng: row.lng == null ? null : asNumber(row.lng),
      priceMorning: asNumber(row.price_morning),
      priceAfternoon: asNumber(row.price_afternoon),
      priceEvening: asNumber(row.price_evening),
      priceFullday: asNumber(row.price_fullday),
      quarterEnabled: row.quarter_enabled !== false,
      isActive: row.is_active !== false,
      isPrimary: Boolean(row.is_primary),
      amenities,
      amenitiesCount: amenities.length,
      photos,
      localityPhotos,
      photosCount: photos.length + localityPhotos.length,
      photoUrl: photos[0] ?? localityPhotos[0] ?? null,
      sortOrder: row.sort_order == null ? null : asNumber(row.sort_order),
      source: "database" as const,
    };
  }).filter((room) => room.id);

  return rooms.length > 0 ? rooms : (await loadStayUnitsForSelector(supabase, { hostId: input.hostId, legacyFamilyId: input.familyId })).map(roomSummary);
}

export async function loadHostMobileProDashboardOverview(
  supabase: SupabaseClient,
  input: { familyId: string; hostId?: string | null; hostUserId?: string | null; view?: "critical" | "full" }
): Promise<HostMobileProDashboardOverview> {
  const familyId = input.familyId.trim();
  const view = input.view === "critical" ? "critical" : "full";
  const trace = createDevTrace("[host.mobile.pro-dashboard:helper]", { familyId, hostId: input.hostId ?? null });
  if (view === "critical") {
    const [
      { data: selectedFamily },
      { data: hostRow },
      proAccess,
      rooms,
      { data: channelProperties, error: channelPropertiesError },
    ] = await Promise.all([
      supabase.from("families").select("id,name,property_name,city,state,country,gstin,is_active,user_id").eq("id", familyId).maybeSingle(),
      supabase.from("hosts").select("id,user_id,display_name,legacy_family_id").eq("legacy_family_id", familyId).maybeSingle(),
      loadHostProAccess(supabase, familyId),
      loadCompactProRooms(supabase, { familyId, hostId: input.hostId }),
      supabase
        .from("channel_properties")
        .select("provider_code,sync_status,last_synced_at,metadata,updated_at")
        .eq("family_id", familyId)
        .order("updated_at", { ascending: false }),
    ]);
    if (channelPropertiesError) throw channelPropertiesError;
    trace.mark("critical_base_parallel");

    const familyRecord = (selectedFamily ?? {}) as JsonRecord;
    const hostRecord = (hostRow ?? {}) as JsonRecord;
    const propertyName =
      asString(familyRecord.property_name) ??
      asString(familyRecord.name) ??
      asString(hostRecord.display_name) ??
      "Famlo Property";
    const city = asString(familyRecord.city);
    const state = asString(familyRecord.state);
    const country = asString(familyRecord.country);
    const locationLabel = [city, state, country].filter(Boolean).join(", ") || "Location pending";
    const activeRoomIds = rooms.filter((room) => room.isActive).map((room) => room.id);
    const mappedRoomIds = new Set<string>();
    const mappedRatePlanCount = 0;
    const propertyRows = (channelProperties ?? []) as JsonRecord[];
    const connectedProperties = propertyRows.filter((row) => normalizeToken(row.sync_status) === "connected");
    const latestSyncAt = propertyRows
      .map((row) => asString(row.last_synced_at) ?? asString(row.updated_at))
      .filter(Boolean)
      .sort((left, right) => String(right).localeCompare(String(left)))[0] ?? null;
    const syncJobCounts: Record<string, number> = {};
    const lastJobError =
      propertyRows
        .map((row) => asString(asObject(row.metadata).last_error))
        .find(Boolean) ??
      null;

    const setupReadiness = buildHostProSetupReadiness({
      propertyName,
      locationLabel,
      familyExists: Boolean(asString(familyRecord.id)),
      hostExists: Boolean(asString(hostRecord.id)),
      settings: {
        id: null,
        familyId,
        exists: false,
        propertyModel: null,
        propertyType: null,
        timezone: "Asia/Kolkata",
        currency: "INR",
        checkInTime: null,
        checkOutTime: null,
        defaultMealPlan: "room_only",
        standardRatePlanName: "Standard Rate",
        otaTitle: propertyName,
        contactEmail: null,
        contactPhone: null,
        website: null,
        country: country ?? "India",
        state,
        city,
        postalCode: null,
        addressLine: null,
        latitude: null,
        longitude: null,
        propertyDescription: null,
        checkInInstructions: null,
        houseRules: null,
        cancellationPolicyLabel: null,
        metadata: {},
        createdAt: null,
        updatedAt: null,
      },
      legacyHouseTypeHint: null,
      rooms: rooms.map((room) => ({
        name: room.name,
        isActive: room.isActive,
        maxGuests: room.maxGuests,
        priceFullday: room.priceFullday,
        bedInfo: room.bedInfo,
        bathroomType: room.bathroomType,
        photosCount: room.photosCount,
      })),
      channelReadiness: {
        providerRowsExist: propertyRows.length > 0,
        propertyConnected: connectedProperties.length > 0,
        roomMappingsReady: false,
        ratePlansReady: mappedRatePlanCount > 0,
      },
    });
    const bookingSnapshot = await (async () => {
      if (!input.hostId) {
        return { bookings: [] as LiveProBookingSummary[], health: null, error: null };
      }
      const bookingSelectWithStayUnit =
        "id,status,payment_status,total_price,start_date,end_date,created_at,guests_count,stay_unit_id,pricing_snapshot,users!user_id(name,email)";
      const bookingSelectFallback =
        "id,status,payment_status,total_price,start_date,end_date,created_at,guests_count,pricing_snapshot,users!user_id(name,email)";
      const primaryResult = await supabase
        .from("bookings_v2")
        .select(bookingSelectWithStayUnit)
        .eq("host_id", input.hostId)
        .order("start_date", { ascending: false })
        .limit(8);
      let bookingRows = (primaryResult.data ?? []) as JsonRecord[];
      let bookingError = primaryResult.error;
      if (bookingError && isMissingColumnError(bookingError, "stay_unit_id")) {
        const fallbackResult = await supabase
          .from("bookings_v2")
          .select(bookingSelectFallback)
          .eq("host_id", input.hostId)
          .order("start_date", { ascending: false })
          .limit(8);
        bookingRows = ((fallbackResult.data ?? []) as JsonRecord[]).map((row) => ({
          ...row,
          stay_unit_id: asString(row.stay_unit_id) ?? asString(asObject(row.pricing_snapshot).stay_unit_id),
        }));
        bookingError = fallbackResult.error;
      }
      if (bookingError) {
        return { bookings: [] as LiveProBookingSummary[], health: null, error: safeErrorMessage(bookingError) };
      }
      return {
        bookings: bookingRows.flatMap((row) => {
          const bookingId = asString(row.id);
          const startDate = asString(row.start_date);
          const endDate = asString(row.end_date);
          if (!bookingId || !startDate || !endDate) return [];
          const pricingSnapshot = asObject(row.pricing_snapshot);
          const stayUnitId = asString(row.stay_unit_id) ?? asString(pricingSnapshot.stay_unit_id);
          const roomName = stayUnitId ? rooms.find((room) => room.id === stayUnitId)?.name ?? "Room" : "Room";
          const guestRecord = Array.isArray(row.users) ? asObject(row.users[0]) : asObject(row.users);
          const amountValue = asNumber(row.total_price);
          const sourceChannel = asString(pricingSnapshot.source_channel);
          const sourceCategory: LiveProBookingSummary["sourceCategory"] =
            asString(pricingSnapshot.channel_provider) === "channex"
              ? "ota"
              : sourceChannel === "pms_manual"
                ? "direct"
                : "famlo";
          const paymentCollectMode: LiveProBookingSummary["paymentCollectMode"] =
            sourceCategory === "ota"
              ? "OTA_COLLECT"
              : sourceCategory === "direct"
                ? "PROPERTY_COLLECT"
                : "FAMLO_COLLECT";
          return [{
            bookingId,
            roomId: stayUnitId,
            roomName,
            startDate,
            endDate,
            checkoutDate: endDate,
            revenueDate: null,
            createdAt: asString(row.created_at),
            guestDisplayName: asString(pricingSnapshot.channel_guest_display_name) ?? asString(pricingSnapshot.guest_name) ?? asString(guestRecord.name) ?? "Guest",
            status: String(row.status ?? "unknown"),
            reservationStatus: null,
            paymentStatus: asString(row.payment_status),
            amount: formatInrAmount(amountValue || null),
            amountValue: amountValue > 0 ? amountValue : null,
            currency: "INR",
            netPayoutAmount: null,
            payoutAmountValue: null,
            paidPayoutAmount: null,
            sourceLabel: sourceCategory === "ota" ? "OTA / Channex" : sourceCategory === "direct" ? "Famlo PMS" : "Famlo Direct",
            sourceCategory,
            paymentCollectMode,
            famloPayoutEligible: false,
            settlementEligible: false,
            payoutHoldStatus: null,
            payoutHoldIsHostActionable: false,
            settlementStatus: null,
            payoutExecutionStatus: null,
            complianceBlocked: false,
            payoutStatus: null,
            payoutPaidAt: null,
            estimatedPayoutDate: endDate,
            famloRevenueAmount: null,
            platformFeeAmount: null,
            otaCommissionAmount: null,
            refundAdjustmentAmount: null,
            creditNoteAmount: null,
            taxAmount: null,
            externalBookingId: asString(pricingSnapshot.channel_external_booking_id),
            externalRevisionId: asString(pricingSnapshot.channel_external_revision_id),
            importStatus: sourceCategory === "ota" ? "preview" : "not_applicable",
            ackStatus: sourceCategory === "ota" ? "not_acknowledged" : "not_applicable",
            linkedBookingId: bookingId,
            isOta: sourceCategory === "ota",
            isReviewOnly: false,
            reviewTitle: null,
            reviewReasonLabels: [],
            guestEmail: asString(guestRecord.email) ?? asString(pricingSnapshot.guest_email),
            guestCount: asNumber(row.guests_count) || null,
            adultCount: asNumber(pricingSnapshot.adult_count) || null,
            childCount: asNumber(pricingSnapshot.child_count) || null,
          }];
        }),
        health: null,
        error: null,
      };
    })();
    trace.mark("critical_bookings");

    const today = todayIso();
    const tomorrow = addDaysIso(today, 1);
    let criticalBookingWindow: { data: unknown[] | null; error: { code?: string; message?: string } | null } = { data: null, error: null };
    const [criticalWindowResult, todayBlockedRoomCount] = await Promise.all([
      input.hostId
        ? (async () => {
            const primaryWindowResult = await supabase
              .from("bookings_v2")
              .select("status,start_date,end_date,stay_unit_id")
              .eq("host_id", input.hostId)
              .gte("end_date", today)
              .lte("start_date", tomorrow);
            if (primaryWindowResult.error && isMissingColumnError(primaryWindowResult.error, "stay_unit_id")) {
              const fallbackWindowResult = await supabase
                .from("bookings_v2")
                .select("status,start_date,end_date,pricing_snapshot")
                .eq("host_id", input.hostId)
                .gte("end_date", today)
                .lte("start_date", tomorrow);
              return {
                data: ((fallbackWindowResult.data ?? []) as JsonRecord[]).map((row) => ({
                  ...row,
                  stay_unit_id: asString(row.stay_unit_id) ?? asString(asObject(row.pricing_snapshot).stay_unit_id),
                })),
                error: fallbackWindowResult.error,
              };
            }
            return {
              data: (primaryWindowResult.data ?? []) as JsonRecord[],
              error: primaryWindowResult.error,
            };
          })()
        : Promise.resolve({ data: null, error: null }),
      loadTodayBlockedRoomCount(supabase, familyId, today).catch(() => 0),
    ]);
    criticalBookingWindow = criticalWindowResult;
    if (criticalBookingWindow.error) {
      throw criticalBookingWindow.error;
    }
    trace.mark("critical_today_snapshot");
    const criticalRows = ((criticalBookingWindow.data ?? []) as JsonRecord[]).filter((row) => {
      const status = normalizeToken(row.status);
      return !["cancelled", "cancelled_by_user", "cancelled_by_partner", "rejected"].includes(status);
    });
    const activeTodayRoomIds = new Set(
      criticalRows
        .filter((row) => (asString(row.start_date) ?? "") <= today && (asString(row.end_date) ?? "") > today)
        .map((row) => asString(row.stay_unit_id))
        .filter(Boolean) as string[]
    );
    const actionNeededCount = bookingSnapshot.bookings.filter(
      (booking) => booking.isReviewOnly || booking.complianceBlocked || booking.payoutHoldIsHostActionable
    ).length;
    const response: HostMobileProDashboardOverview = {
      ok: true,
      detailLevel: "critical",
      generatedAt: new Date().toISOString(),
      familyId,
      property: {
        familyId,
        name: propertyName,
        displayName: propertyName,
        locationLabel,
        city,
        state,
        country,
        hostDisplayName: asString(hostRecord.display_name),
        proStatus: proAccess.status,
        proAllowed: proAccess.allowed,
        proReason: proAccess.reason,
        proCurrentPeriodEnd: proAccess.current_period_end,
        proGraceUntil: proAccess.grace_until,
      },
      propertyOptions: [{
        familyId,
        name: propertyName,
        city,
        state,
        isSelected: true,
        activeRoomCount: activeRoomIds.length,
      }],
      rooms,
      setup: {
        progressPercent: setupReadiness.progressPercent,
        completedCount: setupReadiness.completedCount,
        totalCount: setupReadiness.totalCount,
        nextAction: setupReadiness.nextAction,
        missingItems: setupReadiness.missingItems.slice(0, 8).map((item) => ({
          key: item.key,
          title: item.title,
          hint: item.hint,
          valueLabel: item.valueLabel,
        })),
      },
      channels: {
        connected: connectedProperties.length > 0,
        connectedCount: connectedProperties.length,
        providerCount: propertyRows.length,
        mappedRoomCount: mappedRoomIds.size,
        totalActiveRoomCount: activeRoomIds.length,
        mappedRatePlanCount,
        lastSyncedAt: latestSyncAt,
        lastError: lastJobError,
        syncJobCounts,
        providers: propertyRows.slice(0, 4).map((row) => ({
          code: asString(row.provider_code) ?? "channex",
          name: (asString(row.provider_code) ?? "channex").replace(/_/g, " ").replace(/\b\w/g, (part) => part.toUpperCase()),
          status: asString(row.sync_status) ?? "unknown",
          connected: normalizeToken(row.sync_status) === "connected",
          lastSyncedAt: asString(row.last_synced_at) ?? asString(row.updated_at),
          lastError: asString(asObject(row.metadata).last_error),
          mappedRooms: mappedRoomIds.size,
          mappedRatePlans: mappedRatePlanCount,
          pendingJobs: syncJobCounts.pending ?? 0,
          failedJobs: syncJobCounts.failed ?? 0,
        })),
        recentLogs: [],
      },
      bookings: {
        status: bookingSnapshot.error ? "unavailable" : "loaded",
        error: bookingSnapshot.error,
        count: bookingSnapshot.bookings.length,
        currentCount: 0,
        historyCount: 0,
        activeCount: 0,
        upcomingCount: bookingSnapshot.bookings.filter((booking) => !isCancelledBooking(booking) && booking.startDate >= today).length,
        cancelledCount: bookingSnapshot.bookings.filter((booking) => isCancelledBooking(booking)).length,
        pendingReviewCount: bookingSnapshot.bookings.filter((booking) => booking.isReviewOnly).length,
        latest: bookingSnapshot.bookings,
        health: bookingSnapshot.health,
      },
      revenue: {
        status: "unavailable",
        source: "pro_bookings_snapshot",
        error: "Full revenue analytics load after first paint.",
        currency: "INR",
        grossThisMonthAmount: 0,
        netPayoutThisMonthAmount: 0,
        paidToHostThisMonthAmount: 0,
        pendingPayoutThisMonthAmount: 0,
        upcomingConfirmedAmount: 0,
        bookingCountThisMonth: 0,
        trueZero: false,
        bySource: [],
      },
      report: {
        status: "unavailable",
        error: "Full reports load after first paint.",
        occupancyThisMonthPercent: 0,
        bookedNightsThisMonth: 0,
        availableRoomNightsThisMonth: 0,
        averageBookingValue: null,
        topSourceLabel: null,
        bookingSourceMix: [],
        trendThisMonth: [],
      },
      dashboard: {
        quickActions: {
          manualBooking: rooms.length > 0,
          blockDates: rooms.length > 0,
          updatePrice: rooms.length > 0,
          reports: true,
          receiptDownload: true,
          whatsappReceipt: false,
        },
        todaySnapshot: {
          checkInsCount: criticalRows.filter((row) => (asString(row.start_date) ?? "") === today).length,
          checkOutsCount: criticalRows.filter((row) => (asString(row.end_date) ?? "") === today).length,
          occupiedRoomsCount: activeTodayRoomIds.size,
          blockedRoomsCount: todayBlockedRoomCount,
          actionNeededCount,
        },
        revenueSnapshots: [],
        recentActivity: [],
        reports: [],
      },
      dataSources: {
        rooms: { ok: true, source: "loadStayUnitsForSelector", count: rooms.length },
        channels: { ok: true, source: "loadHostProChannelFoundation", count: propertyRows.length },
        bookings: {
          ok: !bookingSnapshot.error,
          source: "loadLiveProBookingsSnapshot",
          count: bookingSnapshot.bookings.length,
          error: bookingSnapshot.error,
        },
      },
    };
    trace.end({
      rooms: rooms.length,
      bookings: bookingSnapshot.bookings.length,
      reports: 0,
      view,
    });
    return response;
  }
  const [{ data: selectedFamily }, { data: hostRow }, proAccess, settings, channelFoundation, rooms, familyRows] = await Promise.all([
    supabase.from("families").select("id,name,property_name,city,state,country,gstin,admin_notes,is_active,user_id").eq("id", familyId).maybeSingle(),
    supabase.from("hosts").select("id,user_id,display_name,legacy_family_id").eq("legacy_family_id", familyId).maybeSingle(),
    loadHostProAccess(supabase, familyId),
    loadHostProSettings(supabase, familyId),
    loadHostProChannelFoundation(supabase, familyId, {
      includeSyncLogs: view === "full",
      includeSyncJobs: true,
      includeBookingRevisions: view === "full",
    }),
    loadStayUnitsForSelector(supabase, { hostId: input.hostId, legacyFamilyId: familyId }),
    loadFamilyRows(supabase, input.hostUserId ?? null, familyId),
  ]);
  trace.mark("base_parallel");
  const familyRecord = (selectedFamily ?? {}) as JsonRecord;
  const hostRecord = (hostRow ?? {}) as JsonRecord;
  const propertyName =
    asString(familyRecord.property_name) ??
    asString(familyRecord.name) ??
    asString(hostRecord.display_name) ??
    "Famlo Property";
  const city = settings.city ?? asString(familyRecord.city);
  const state = settings.state ?? asString(familyRecord.state);
  const country = settings.country ?? asString(familyRecord.country);
  const locationLabel = [city, state, country].filter(Boolean).join(", ") || "Location pending";
  const roomSummaries = rooms.map(roomSummary);
  const activeRoomIds = roomSummaries.filter((room) => room.isActive).map((room) => room.id);
  const channelSummary = buildChannelSummary(channelFoundation, activeRoomIds);
  const roomMappingsByRoomId = new Map(channelFoundation.roomMappings.map((mapping) => [mapping.stayUnitId, mapping]));
  const providerRowsExist = channelFoundation.providers.length > 0;
  const propertyConnected = channelFoundation.properties.some((property) => property.syncStatus === "connected");
  const roomMappingsReady = activeRoomIds.length > 0 && activeRoomIds.every((roomId) => Boolean(roomMappingsByRoomId.get(roomId)?.externalRoomTypeId));
  const ratePlansReady = channelFoundation.ratePlans.length > 0 && channelFoundation.ratePlans.some((ratePlan) => Boolean(ratePlan.externalRatePlanId));
  const setupReadiness = buildHostProSetupReadiness({
    propertyName,
    locationLabel,
    familyExists: Boolean(asString(familyRecord.id)),
    hostExists: Boolean(asString(hostRecord.id)),
    settings: {
      ...settings,
      city,
      state,
      country: country ?? settings.country,
      otaTitle: settings.otaTitle ?? propertyName,
    },
    legacyHouseTypeHint: null,
    rooms: roomSummaries.map((room) => ({
      name: room.name,
      isActive: room.isActive,
      maxGuests: room.maxGuests,
      priceFullday: room.priceFullday,
      bedInfo: room.bedInfo,
      bathroomType: room.bathroomType,
      photosCount: room.photosCount,
    })),
    channelReadiness: {
      providerRowsExist,
      propertyConnected,
      roomMappingsReady,
      ratePlansReady,
    },
  });
  const bookingSnapshot = await loadLiveProBookingsSnapshot(supabase, {
    familyId,
    view: "full",
    limit: 120,
  })
    .then((snapshot) => ({ bookings: snapshot.bookings, health: snapshot.health, error: null }))
    .catch((error) => ({ bookings: [] as LiveProBookingSummary[], health: null, error: safeErrorMessage(error) }));
  trace.mark("bookings_snapshot");
  const bookingRevenueReport = buildBookingRevenueReport(bookingSnapshot.bookings, bookingSnapshot.error, roomSummaries);
  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);
  let criticalBookingWindow: { data: unknown[] | null; error: { code?: string; message?: string } | null } = { data: null, error: null };
  if (input.hostId) {
    const primaryWindowResult = await supabase
      .from("bookings_v2")
      .select("status,start_date,end_date,stay_unit_id")
      .eq("host_id", input.hostId)
      .gte("end_date", today)
      .lte("start_date", tomorrow);
    if (primaryWindowResult.error && isMissingColumnError(primaryWindowResult.error, "stay_unit_id")) {
      const fallbackWindowResult = await supabase
        .from("bookings_v2")
        .select("status,start_date,end_date,pricing_snapshot")
        .eq("host_id", input.hostId)
        .gte("end_date", today)
        .lte("start_date", tomorrow);
      criticalBookingWindow = {
        data: ((fallbackWindowResult.data ?? []) as JsonRecord[]).map((row) => ({
          ...row,
          stay_unit_id: asString(row.stay_unit_id) ?? asString(asObject(row.pricing_snapshot).stay_unit_id),
        })),
        error: fallbackWindowResult.error,
      };
    } else {
      criticalBookingWindow = {
        data: (primaryWindowResult.data ?? []) as JsonRecord[],
        error: primaryWindowResult.error,
      };
    }
  }
  if (criticalBookingWindow.error) {
    throw criticalBookingWindow.error;
  }
  const todayStart = today;
  const weekStart = startOfWeekIso(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const yearStart = startOfYearIso(today);
  const [todayBlockedRoomCount, recentInventoryEvents] = await Promise.all([
    loadTodayBlockedRoomCount(supabase, familyId, today).catch(() => 0),
    view === "full" ? loadRecentInventoryEvents(supabase, familyId).catch(() => [] as JsonRecord[]) : Promise.resolve([] as JsonRecord[]),
  ]);
  trace.mark("today_snapshot");
  const criticalRows = ((criticalBookingWindow.data ?? []) as JsonRecord[]).filter((row) => {
    const status = normalizeToken(row.status);
    return !["cancelled", "cancelled_by_user", "cancelled_by_partner", "rejected"].includes(status);
  });
  const activeTodayRoomIds = new Set(
    criticalRows
      .filter((row) => (asString(row.start_date) ?? "") <= today && (asString(row.end_date) ?? "") > today)
      .map((row) => asString(row.stay_unit_id))
      .filter(Boolean) as string[]
  );
  const activeTodayBookings = view === "full"
    ? bookingSnapshot.bookings.filter(
        (booking) => !isCancelledBooking(booking) && isConfirmedBooking(booking) && booking.startDate <= today && booking.checkoutDate > today
      )
    : [];
  const actionNeededCount = bookingSnapshot.bookings.filter(
    (booking) => booking.isReviewOnly || booking.complianceBlocked || booking.payoutHoldIsHostActionable
  ).length;
  const dashboardRevenueSnapshots = view === "full"
    ? [
        buildRevenueSnapshot("today", "Today", todayStart, today, bookingSnapshot.bookings, roomSummaries),
        buildRevenueSnapshot("week", "Week", weekStart, today, bookingSnapshot.bookings, roomSummaries),
        buildRevenueSnapshot("month", "Month", monthStart, today, bookingSnapshot.bookings, roomSummaries),
        buildRevenueSnapshot("year", "Year", yearStart, today, bookingSnapshot.bookings, roomSummaries),
      ]
    : [];
  const dashboardReports = view === "full" ? buildDashboardReports(familyId, asString(familyRecord.gstin)) : [];
  const dashboardRecentActivity = view === "full" ? buildRecentActivity(bookingSnapshot.bookings, roomSummaries, recentInventoryEvents) : [];
  const activeRoomCountByFamilyId = new Map<string, number>();
  for (const room of rooms) {
    if (!room.legacyFamilyId || !room.isActive) continue;
    activeRoomCountByFamilyId.set(room.legacyFamilyId, (activeRoomCountByFamilyId.get(room.legacyFamilyId) ?? 0) + 1);
  }
  const bookingsResponse: HostMobileProDashboardOverview["bookings"] = {
    status: bookingRevenueReport.bookings.status === "unavailable" ? "unavailable" : "loaded",
    error: bookingRevenueReport.bookings.error,
    count: bookingRevenueReport.bookings.count,
    currentCount: bookingRevenueReport.bookings.currentCount,
    historyCount: bookingRevenueReport.bookings.historyCount,
    activeCount: bookingRevenueReport.bookings.activeCount,
    upcomingCount: bookingRevenueReport.bookings.upcomingCount,
    cancelledCount: bookingRevenueReport.bookings.cancelledCount,
    pendingReviewCount: bookingRevenueReport.bookings.pendingReviewCount,
    latest: bookingRevenueReport.bookings.latest,
    health: bookingSnapshot.health,
  };

  const response: HostMobileProDashboardOverview = {
    ok: true,
    detailLevel: view,
    generatedAt: new Date().toISOString(),
    familyId,
    property: {
      familyId,
      name: propertyName,
      displayName: propertyName,
      locationLabel,
      city,
      state,
      country,
      hostDisplayName: asString(hostRecord.display_name),
      proStatus: proAccess.status,
      proAllowed: proAccess.allowed,
      proReason: proAccess.reason,
      proCurrentPeriodEnd: proAccess.current_period_end,
      proGraceUntil: proAccess.grace_until,
    },
    propertyOptions: familyRows
      .map((row) => {
        const id = asString(row.id);
        if (!id) return null;
        return {
          familyId: id,
          name: asString(row.property_name) ?? asString(row.name) ?? (id === familyId ? propertyName : "Famlo Property"),
          city: asString(row.city),
          state: asString(row.state),
          isSelected: id === familyId,
          activeRoomCount: id === familyId ? activeRoomIds.length : activeRoomCountByFamilyId.get(id) ?? 0,
        };
      })
      .filter((row): row is HostMobileProDashboardOverview["propertyOptions"][number] => Boolean(row)),
    rooms: roomSummaries,
    setup: {
      progressPercent: setupReadiness.progressPercent,
      completedCount: setupReadiness.completedCount,
      totalCount: setupReadiness.totalCount,
      nextAction: setupReadiness.nextAction,
      missingItems: setupReadiness.missingItems.slice(0, 8).map((item) => ({
        key: item.key,
        title: item.title,
        hint: item.hint,
        valueLabel: item.valueLabel,
      })),
    },
    channels: channelSummary,
    bookings: bookingsResponse,
    revenue: bookingRevenueReport.revenue,
    report: bookingRevenueReport.report,
    dashboard: {
      quickActions: {
        manualBooking: roomSummaries.length > 0,
        blockDates: roomSummaries.length > 0,
        updatePrice: roomSummaries.length > 0,
        reports: true,
        receiptDownload: true,
        whatsappReceipt: false,
      },
      todaySnapshot: {
        checkInsCount: view === "full"
          ? bookingSnapshot.bookings.filter((booking) => !isCancelledBooking(booking) && booking.startDate === today).length
          : criticalRows.filter((row) => (asString(row.start_date) ?? "") === today).length,
        checkOutsCount: view === "full"
          ? bookingSnapshot.bookings.filter((booking) => !isCancelledBooking(booking) && booking.checkoutDate === today).length
          : criticalRows.filter((row) => (asString(row.end_date) ?? "") === today).length,
        occupiedRoomsCount: view === "full" ? uniqueRoomCount(activeTodayBookings) : activeTodayRoomIds.size,
        blockedRoomsCount: todayBlockedRoomCount,
        actionNeededCount,
      },
      revenueSnapshots: dashboardRevenueSnapshots,
      recentActivity: dashboardRecentActivity,
      reports: dashboardReports,
    },
    dataSources: {
      rooms: { ok: true, source: "loadStayUnitsForSelector", count: roomSummaries.length },
      channels: { ok: true, source: "loadHostProChannelFoundation", count: channelFoundation.properties.length },
      bookings: {
        ok: !bookingSnapshot.error,
        source: "loadLiveProBookingsSnapshot",
        count: bookingSnapshot.bookings.length,
        error: bookingSnapshot.error,
      },
    },
  };
  trace.end({
    rooms: roomSummaries.length,
    bookings: bookingSnapshot.bookings.length,
    reports: dashboardReports.length,
    view,
  });
  return response;
}
