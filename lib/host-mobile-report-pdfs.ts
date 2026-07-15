import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deriveRevenuePaymentStatusLabel,
  isCompletedRevenueBooking,
  isFinanceBackedPaidStatus,
  shouldIncludeFamloPayoutInTotals,
} from "@/lib/finance/pro-revenue";
import { loadLiveProBookingsSnapshot, type LiveProBookingSummary } from "@/lib/host-pro-live-data";
import { loadHostProAccess } from "@/lib/host-pro-access";
import { loadHostProSettings } from "@/lib/host-pro-settings";
import { mapHostGstProfileRow } from "@/lib/host-gst-profile";
import { asString, type JsonRecord } from "@/lib/platform-utils";
import { resolvePythonBin, toPythonRuntimeError } from "@/lib/python-runtime";
import { loadStayUnitsForSelector } from "@/lib/stay-units";

const execFileAsync = promisify(execFile);
const PYTHON_BIN = resolvePythonBin();

export type HostMobileReportKey =
  | "monthly_revenue"
  | "booking_summary"
  | "famlo_payout"
  | "ota_performance"
  | "cancellation_refund"
  | "gst_report"
  | "custom_report";

export type HostMobileReportPreset = "today" | "week" | "month" | "year" | "custom";

type ReportRoomSummary = {
  id: string;
  name: string;
  isActive: boolean;
};

type ResolvedReportRange = {
  preset: HostMobileReportPreset;
  from: string;
  to: string;
  label: string;
};

type PdfSummaryItem = {
  label: string;
  value: string;
};

type PdfTable = {
  headers: string[];
  rows: string[][];
  columnWidthsMm?: number[];
};

type HostMobilePdfInput = {
  title: string;
  propertyName: string;
  locationLabel: string | null;
  rangeLabel: string;
  generatedAt: string;
  summaryItems: PdfSummaryItem[];
  table: PdfTable;
  footerLines: string[];
  notes?: string[];
  logoPath?: string | null;
};

type HostMobileReportWorkspace = {
  familyId: string;
  propertyName: string;
  locationLabel: string | null;
  proAllowed: boolean;
  proStatus: string;
  proReason: string;
  rooms: ReportRoomSummary[];
  bookings: LiveProBookingSummary[];
  gstin: string | null;
};

type MobileReportDownloadInput = {
  familyId: string;
  hostId: string | null;
  hostUserId: string | null;
  reportKey: HostMobileReportKey;
  preset: HostMobileReportPreset;
  from?: string | null;
  to?: string | null;
};

type MobileReportDownloadOutput = {
  bytes: Buffer;
  fileName: string;
  mimeType: "application/pdf";
  reportKey: HostMobileReportKey;
  from: string;
  to: string;
};

export class HostMobileReportError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HostMobileReportError";
    this.status = status;
  }
}

const PHASE_ONE_REPORTS: HostMobileReportKey[] = [
  "monthly_revenue",
  "booking_summary",
  "famlo_payout",
  "ota_performance",
];

function escapePythonString(value: string): string {
  return JSON.stringify(value);
}

function isHostMobileReportKey(value: string): value is HostMobileReportKey {
  return (
    value === "monthly_revenue" ||
    value === "booking_summary" ||
    value === "famlo_payout" ||
    value === "ota_performance" ||
    value === "cancellation_refund" ||
    value === "gst_report" ||
    value === "custom_report"
  );
}

function normalizeReportKey(value: unknown): HostMobileReportKey {
  const key = typeof value === "string" ? value.trim() : "";
  if (!isHostMobileReportKey(key)) {
    throw new HostMobileReportError(400, "Unknown report key.");
  }
  return key;
}

function normalizePreset(value: unknown): HostMobileReportPreset {
  const preset = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (preset === "today" || preset === "week" || preset === "month" || preset === "year" || preset === "custom") {
    return preset;
  }
  throw new HostMobileReportError(400, "Invalid report preset.");
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

function startOfMonthIso(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isDateWithinRange(date: string | null | undefined, from: string, to: string): boolean {
  return Boolean(date && date >= from && date <= to);
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

function cleanSourceLabel(value: string | null | undefined): string {
  const cleaned = (value ?? "Unknown")
    .replace(/\s*\/\s*channex/gi, "")
    .replace(/\s*\(channex\)/gi, "")
    .replace(/\bchannex\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || "Unknown";
}

function normalizeToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, "_") : "";
}

function isCancelledBooking(booking: Pick<LiveProBookingSummary, "status" | "reservationStatus">): boolean {
  const status = normalizeToken(booking.status);
  const reservationStatus = normalizeToken(booking.reservationStatus);
  return status.startsWith("cancel") || reservationStatus.startsWith("cancel");
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

function formatDate(value: string | null | undefined): string {
  if (!value || !isIsoDate(value)) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+05:30`));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatInr(value: number | null | undefined): string {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(value: number | null | undefined): string {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-IN").format(amount);
}

function humanizeStatus(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const text = value.replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Unknown";
}

function roomSummaryFromStayUnit(room: {
  id: string;
  name: string;
  isActive: boolean;
}): ReportRoomSummary {
  return {
    id: room.id,
    name: room.name,
    isActive: room.isActive,
  };
}

function slugify(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return cleaned || "famlo-property";
}

function buildReportFileName(reportKey: HostMobileReportKey, propertyName: string, from: string, to: string): string {
  return `famlo-pro-${reportKey}-${slugify(propertyName)}-${from}-to-${to}.pdf`;
}

function resolveReportRange(input: {
  preset: HostMobileReportPreset;
  from?: string | null;
  to?: string | null;
}): ResolvedReportRange {
  const today = todayIso();
  if (input.preset === "today") {
    return { preset: "today", from: today, to: today, label: `Today · ${formatDate(today)}` };
  }
  if (input.preset === "week") {
    const from = startOfWeekIso(today);
    return { preset: "week", from, to: today, label: `${formatDate(from)} to ${formatDate(today)}` };
  }
  if (input.preset === "month") {
    const from = startOfMonthIso(today);
    return { preset: "month", from, to: today, label: `${formatDate(from)} to ${formatDate(today)}` };
  }
  if (input.preset === "year") {
    const from = startOfYearIso(today);
    return { preset: "year", from, to: today, label: `${formatDate(from)} to ${formatDate(today)}` };
  }

  if (!isIsoDate(input.from ?? null) || !isIsoDate(input.to ?? null)) {
    throw new HostMobileReportError(400, "Custom reports require valid from and to dates.");
  }
  const from = input.from!;
  const to = input.to!;
  if (to < from) {
    throw new HostMobileReportError(400, "Custom report date range is invalid.");
  }
  if (rangeDayCount(from, to) > 366) {
    throw new HostMobileReportError(400, "Custom report range must be 366 days or less.");
  }
  return {
    preset: "custom",
    from,
    to,
    label: `${formatDate(from)} to ${formatDate(to)}`,
  };
}

function buildRevenueSnapshot(
  key: "today" | "week" | "month" | "year" | "custom",
  label: string,
  from: string,
  to: string,
  bookings: LiveProBookingSummary[],
  rooms: ReportRoomSummary[]
) {
  const activeRoomCount = rooms.filter((room) => room.isActive).length;
  const completedRevenueBookings = bookings.filter((booking) => !booking.isReviewOnly && isCompletedRevenueBooking(booking));
  const revenueBookings = completedRevenueBookings.filter((booking) => isDateWithinRange(booking.revenueDate ?? booking.checkoutDate, from, to));
  const famloPayoutBookings = revenueBookings.filter((booking) => shouldIncludeFamloPayoutInTotals(booking));
  const bookingRangeRows = bookings.filter((booking) => isDateWithinRange(booking.startDate, from, to));
  const sourceMix = Object.entries(
    bookingRangeRows.reduce<Record<string, number>>((accumulator, booking) => {
      const bucket = cleanSourceLabel(
        booking.sourceLabel || (booking.sourceCategory === "direct" ? "Manual" : booking.sourceCategory === "ota" ? "OTA" : "Famlo")
      );
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

  return {
    key,
    label,
    from,
    to,
    bookingCount: revenueBookings.length,
    averageBookingValue:
      revenueBookings.length > 0 ? revenueBookings.reduce((sum, booking) => sum + (booking.amountValue ?? 0), 0) / revenueBookings.length : null,
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
    performance: {
      totalBookings: bookingRangeRows.length,
      occupancyPercent: availableRoomNights > 0 ? Math.min(100, Math.round((bookedNights / availableRoomNights) * 100)) : null,
      topSourceLabel: sourceMix[0]?.[0] ?? null,
      cancellationCount: bookings.filter((booking) => isCancelledBooking(booking) && isDateWithinRange(booking.startDate, from, to)).length,
      otaSourceRevenue,
    },
  };
}

async function loadResolvedGstin(
  supabase: SupabaseClient,
  input: { hostId: string | null; familyId: string }
): Promise<string | null> {
  const [{ data: family }, { data: gstProfile }, { data: latestDraft }] = await Promise.all([
    supabase.from("families").select("gstin").eq("id", input.familyId).maybeSingle(),
    input.hostId
      ? supabase.from("host_gst_profiles").select("*").eq("host_id", input.hostId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("host_onboarding_drafts")
      .select("gstin,compliance,payload")
      .eq("family_id", input.familyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const mappedProfile = mapHostGstProfileRow((gstProfile ?? null) as JsonRecord | null);
  const payload =
    latestDraft?.payload && typeof latestDraft.payload === "object" && !Array.isArray(latestDraft.payload)
      ? (latestDraft.payload as JsonRecord)
      : {};
  const compliance =
    latestDraft?.compliance && typeof latestDraft.compliance === "object" && !Array.isArray(latestDraft.compliance)
      ? (latestDraft.compliance as JsonRecord)
      : {};

  return (
    asString(mappedProfile?.gstin) ??
    asString((family as JsonRecord | null)?.gstin) ??
    asString((latestDraft as JsonRecord | null)?.gstin) ??
    asString(payload.gstin) ??
    asString(payload.gstNumber) ??
    asString(compliance.gstin) ??
    asString(compliance.gstNumber)
  );
}

async function loadWorkspace(
  supabase: SupabaseClient,
  input: { familyId: string; hostId: string | null; hostUserId: string | null }
): Promise<HostMobileReportWorkspace> {
  const familyId = input.familyId.trim();
  const [{ data: selectedFamily }, { data: hostRow }, proAccess, settings, roomsResult, bookingSnapshot, gstin] = await Promise.all([
    supabase.from("families").select("id,name,property_name,city,state,country,gstin").eq("id", familyId).maybeSingle(),
    supabase.from("hosts").select("id,user_id,display_name,legacy_family_id").eq("legacy_family_id", familyId).maybeSingle(),
    loadHostProAccess(supabase, familyId),
    loadHostProSettings(supabase, familyId),
    loadStayUnitsForSelector(supabase, { hostId: input.hostId, legacyFamilyId: familyId }),
    loadLiveProBookingsSnapshot(supabase, { familyId }),
    loadResolvedGstin(supabase, { familyId, hostId: input.hostId }),
  ]);

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
  const locationLabel = [city, state, country].filter(Boolean).join(", ") || null;

  return {
    familyId,
    propertyName,
    locationLabel,
    proAllowed: proAccess.allowed,
    proStatus: proAccess.status,
    proReason: proAccess.reason,
    rooms: roomsResult.map(roomSummaryFromStayUnit),
    bookings: bookingSnapshot.bookings,
    gstin,
  };
}

function rangeBookingRows(bookings: LiveProBookingSummary[], range: ResolvedReportRange): LiveProBookingSummary[] {
  return bookings.filter((booking) => isDateWithinRange(booking.startDate, range.from, range.to));
}

function rangeCompletedRevenueRows(bookings: LiveProBookingSummary[], range: ResolvedReportRange): LiveProBookingSummary[] {
  return bookings.filter(
    (booking) =>
      !booking.isReviewOnly &&
      isCompletedRevenueBooking(booking) &&
      isDateWithinRange(booking.revenueDate ?? booking.checkoutDate, range.from, range.to)
  );
}

function reportLogoPath(): string | null {
  const famloProLogo = join(process.cwd(), "public", "famlo-pro-logo.png");
  const blueLogo = join(process.cwd(), "public", "logo-blue.png");
  if (existsSync(famloProLogo)) return famloProLogo;
  if (existsSync(blueLogo)) return blueLogo;
  return null;
}

async function renderHostMobileReportPdf(input: HostMobilePdfInput): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), "famlo-mobile-report-pdf-"));
  const inputPath = join(workDir, "input.json");
  const outputPath = join(workDir, "document.pdf");

  try {
    await writeFile(inputPath, JSON.stringify(input), "utf8");

    const pythonScript = `
import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

with open(${escapePythonString(inputPath)}, "r", encoding="utf-8") as f:
    data = json.load(f)

doc = SimpleDocTemplate(
    ${escapePythonString(outputPath)},
    pagesize=A4,
    rightMargin=14 * mm,
    leftMargin=14 * mm,
    topMargin=16 * mm,
    bottomMargin=16 * mm,
)
styles = getSampleStyleSheet()
story = []

title = ParagraphStyle(
    "Title",
    parent=styles["Heading1"],
    fontName="Helvetica-Bold",
    fontSize=17,
    leading=21,
    textColor=colors.HexColor("#111827"),
)
section = ParagraphStyle(
    "Section",
    parent=styles["BodyText"],
    fontName="Helvetica-Bold",
    fontSize=10,
    leading=13,
    textColor=colors.HexColor("#111827"),
)
body = ParagraphStyle(
    "Body",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=9.2,
    leading=12.2,
    textColor=colors.HexColor("#111827"),
)
muted = ParagraphStyle(
    "Muted",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=8.2,
    leading=10.5,
    textColor=colors.HexColor("#6b7280"),
)
card_label = ParagraphStyle(
    "CardLabel",
    parent=styles["BodyText"],
    fontName="Helvetica-Bold",
    fontSize=7.8,
    leading=10,
    textColor=colors.HexColor("#6b7280"),
)
card_value = ParagraphStyle(
    "CardValue",
    parent=styles["BodyText"],
    fontName="Helvetica-Bold",
    fontSize=10.5,
    leading=13,
    textColor=colors.HexColor("#111827"),
)

logo_path = data.get("logoPath")
logo_cell = Paragraph("<b>Famlo Pro</b>", title)
if logo_path and Path(logo_path).exists():
    logo_cell = Image(logo_path, width=36 * mm, height=13 * mm, kind="proportional")

header_right = Paragraph(
    f"<b>{data['title']}</b><br/>{data['propertyName']}<br/>{data.get('locationLabel') or 'Location pending'}",
    body,
)
header = Table([[logo_cell, header_right]], colWidths=[55 * mm, 117 * mm])
header.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ("TOPPADDING", (0, 0), (-1, -1), 0),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
]))
story.append(header)
story.append(Spacer(1, 7))

meta_rows = [
    ["Date range", data["rangeLabel"], "Generated", data["generatedAt"]],
]
meta = Table(meta_rows, colWidths=[24 * mm, 62 * mm, 24 * mm, 62 * mm])
meta.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
    ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
    ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
story.append(meta)
story.append(Spacer(1, 9))

summary_cells = []
for item in data.get("summaryItems", []):
    summary_cells.append(Paragraph(f"{item['label']}<br/><b>{item['value']}</b>", ParagraphStyle(
        "SummaryCell",
        parent=body,
        fontName="Helvetica",
        fontSize=8.6,
        leading=11.4,
        textColor=colors.HexColor("#111827"),
    )))

summary_rows = []
for index in range(0, len(summary_cells), 3):
    row = summary_cells[index:index+3]
    while len(row) < 3:
        row.append(Paragraph("", body))
    summary_rows.append(row)

if summary_rows:
    summary_table = Table(summary_rows, colWidths=[57 * mm, 57 * mm, 57 * mm])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fbff")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#dbeafe")),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#e5e7eb")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 10))

notes = data.get("notes") or []
if notes:
    story.append(Paragraph("<b>Notes</b>", section))
    story.append(Spacer(1, 4))
    for note in notes:
        story.append(Paragraph(note, muted))
        story.append(Spacer(1, 3))
    story.append(Spacer(1, 5))

table_headers = data["table"]["headers"]
table_rows = data["table"]["rows"]
rows = [[Paragraph(f"<b>{header}</b>", body) for header in table_headers]]
for row in table_rows:
    rows.append([Paragraph(cell if cell else "—", body) for cell in row])

table = Table(rows, colWidths=[width * mm for width in data["table"].get("columnWidthsMm", [])] if data["table"].get("columnWidthsMm") else None, repeatRows=1)
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8f0fe")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#111827")),
    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
    ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fbfdff")]),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
story.append(table)
story.append(Spacer(1, 10))

for line in data.get("footerLines", []):
    story.append(Paragraph(line, muted))
    story.append(Spacer(1, 3))

def draw_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#d1d5db"))
    canvas.line(14 * mm, 11 * mm, A4[0] - 14 * mm, 11 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#6b7280"))
    canvas.drawString(14 * mm, 7 * mm, "Generated by Famlo Pro")
    canvas.drawRightString(A4[0] - 14 * mm, 7 * mm, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()

doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
`;

    try {
      await execFileAsync(PYTHON_BIN, ["-c", pythonScript], {
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error) {
      throw toPythonRuntimeError("Host mobile PDF rendering", error);
    }

    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export function buildHostMobileReportDownloadHref(input: {
  familyId: string;
  reportKey: HostMobileReportKey;
  preset?: Exclude<HostMobileReportPreset, "custom">;
  from?: string | null;
  to?: string | null;
}): string {
  const search = new URLSearchParams({
    familyId: input.familyId,
    report: input.reportKey,
    preset: input.preset ?? "month",
    format: "pdf",
  });
  if (input.from) search.set("from", input.from);
  if (input.to) search.set("to", input.to);
  return `/api/host/mobile/reports/download?${search.toString()}`;
}

function buildMonthlyRevenuePdf(workspace: HostMobileReportWorkspace, range: ResolvedReportRange): HostMobilePdfInput {
  const snapshot = buildRevenueSnapshot(range.preset, humanizeStatus(range.preset), range.from, range.to, workspace.bookings, workspace.rooms);
  const rows = [
    ["Manual", formatNumber(snapshot.bookingCount ? workspace.bookings.filter((booking) => !booking.isReviewOnly && isCompletedRevenueBooking(booking) && booking.sourceCategory === "direct" && isDateWithinRange(booking.revenueDate ?? booking.checkoutDate, range.from, range.to)).length : 0), formatInr(snapshot.manualRevenue), "Host-managed / collected outside Famlo"],
    ["Famlo", formatNumber(workspace.bookings.filter((booking) => !booking.isReviewOnly && isCompletedRevenueBooking(booking) && booking.sourceCategory === "famlo" && isDateWithinRange(booking.revenueDate ?? booking.checkoutDate, range.from, range.to)).length), formatInr(snapshot.famloRevenue), "Famlo direct / Famlo-collected bookings"],
    ["OTA", formatNumber(workspace.bookings.filter((booking) => !booking.isReviewOnly && isCompletedRevenueBooking(booking) && booking.sourceCategory === "ota" && isDateWithinRange(booking.revenueDate ?? booking.checkoutDate, range.from, range.to)).length), formatInr(snapshot.otaRevenue), "Gross OTA revenue only; not treated as confirmed payout"],
  ];

  return {
    title: "Monthly Revenue Report",
    propertyName: workspace.propertyName,
    locationLabel: workspace.locationLabel,
    rangeLabel: range.label,
    generatedAt: formatDateTime(new Date().toISOString()),
    summaryItems: [
      { label: "Gross booking value", value: formatInr(snapshot.grossBookingValue) },
      { label: "Manual revenue", value: formatInr(snapshot.manualRevenue) },
      { label: "Famlo revenue", value: formatInr(snapshot.famloRevenue) },
      { label: "OTA revenue", value: formatInr(snapshot.otaRevenue) },
      { label: "Total bookings", value: formatNumber(snapshot.performance.totalBookings) },
      { label: "Average booking value", value: snapshot.averageBookingValue == null ? "—" : formatInr(snapshot.averageBookingValue) },
    ],
    notes: [
      "Gross booking value uses backend booking truth for the selected date range.",
      "Manual revenue is host-managed. Famlo payout values are not mixed into manual totals.",
      "OTA revenue is gross only and is not treated as confirmed payout.",
    ],
    table: {
      headers: ["Source", "Booking count", "Gross revenue", "Notes / status"],
      rows,
      columnWidthsMm: [34, 28, 38, 72],
    },
    footerLines: ["Generated by Famlo Pro.", "Famlo payout values apply only to Famlo-collected bookings."],
    logoPath: reportLogoPath(),
  };
}

function buildBookingSummaryPdf(workspace: HostMobileReportWorkspace, range: ResolvedReportRange): HostMobilePdfInput {
  const rowsInRange = rangeBookingRows(workspace.bookings, range)
    .filter((booking) => !booking.isReviewOnly)
    .sort((left, right) => right.startDate.localeCompare(left.startDate));
  const grossBookingValue = rowsInRange
    .filter((booking) => !isCancelledBooking(booking))
    .reduce((sum, booking) => sum + (booking.amountValue ?? 0), 0);
  const tableRows = rowsInRange.map((booking) => [
    booking.bookingId,
    booking.guestDisplayName || "Guest pending",
    cleanSourceLabel(booking.sourceLabel),
    booking.roomName,
    formatDate(booking.startDate),
    formatDate(booking.checkoutDate),
    formatInr(booking.amountValue),
    humanizeStatus(booking.reservationStatus ?? booking.status),
  ]);

  return {
    title: "Booking Summary Report",
    propertyName: workspace.propertyName,
    locationLabel: workspace.locationLabel,
    rangeLabel: range.label,
    generatedAt: formatDateTime(new Date().toISOString()),
    summaryItems: [
      { label: "Total bookings", value: formatNumber(rowsInRange.length) },
      { label: "Confirmed bookings", value: formatNumber(rowsInRange.filter(isConfirmedBooking).length) },
      { label: "Cancelled bookings", value: formatNumber(rowsInRange.filter(isCancelledBooking).length) },
      { label: "Gross booking value", value: formatInr(grossBookingValue) },
    ],
    notes: ["Booking rows are family-scoped and generated from canonical Famlo backend booking data."],
    table: {
      headers: ["Booking ID", "Guest", "Source", "Room", "Check-in", "Check-out", "Gross amount", "Status"],
      rows: tableRows.length > 0 ? tableRows : [["—", "No bookings in this range", "—", "—", "—", "—", "—", "—"]],
      columnWidthsMm: [26, 28, 24, 26, 18, 18, 24, 18],
    },
    footerLines: ["Generated by Famlo Pro."],
    logoPath: reportLogoPath(),
  };
}

function buildFamloPayoutPdf(workspace: HostMobileReportWorkspace, range: ResolvedReportRange): HostMobilePdfInput {
  const famloRows = rangeCompletedRevenueRows(workspace.bookings, range)
    .filter((booking) => booking.sourceCategory === "famlo")
    .sort((left, right) => (right.revenueDate ?? right.checkoutDate).localeCompare(left.revenueDate ?? left.checkoutDate));
  const eligibleRows = famloRows.filter((booking) => shouldIncludeFamloPayoutInTotals(booking));
  const paidAmount = eligibleRows
    .filter((booking) => isFinanceBackedPaidStatus(booking.payoutExecutionStatus) || isFinanceBackedPaidStatus(booking.payoutStatus))
    .reduce((sum, booking) => sum + (booking.paidPayoutAmount ?? booking.payoutAmountValue ?? 0), 0);
  const pendingAmount = eligibleRows
    .filter((booking) => !isFinanceBackedPaidStatus(booking.payoutExecutionStatus) && !isFinanceBackedPaidStatus(booking.payoutStatus))
    .reduce((sum, booking) => sum + (booking.payoutAmountValue ?? 0), 0);
  const grossFamloCollected = famloRows.reduce((sum, booking) => sum + (booking.amountValue ?? 0), 0);
  const refundAdjustments = famloRows.reduce((sum, booking) => sum + (booking.refundAdjustmentAmount ?? 0), 0);

  const tableRows = famloRows.map((booking) => [
    booking.bookingId,
    booking.guestDisplayName || "Guest pending",
    formatInr(booking.amountValue),
    booking.platformFeeAmount == null ? "—" : formatInr(booking.platformFeeAmount),
    booking.refundAdjustmentAmount == null || booking.refundAdjustmentAmount === 0 ? "—" : formatInr(booking.refundAdjustmentAmount),
    booking.netPayoutAmount == null ? "—" : formatInr(booking.netPayoutAmount),
    deriveRevenuePaymentStatusLabel(booking),
    booking.payoutPaidAt ? formatDate(booking.payoutPaidAt.slice(0, 10)) : "—",
  ]);

  return {
    title: "Famlo Payout Report",
    propertyName: workspace.propertyName,
    locationLabel: workspace.locationLabel,
    rangeLabel: range.label,
    generatedAt: formatDateTime(new Date().toISOString()),
    summaryItems: [
      { label: "Famlo payout paid", value: formatInr(paidAmount) },
      { label: "Famlo pending payout", value: formatInr(pendingAmount) },
      { label: "Famlo-collected gross value", value: formatInr(grossFamloCollected) },
      { label: "Refund adjustments", value: formatInr(refundAdjustments) },
    ],
    notes: ["Famlo payout values apply only to Famlo-collected bookings.", "OTA payouts are not included in this report.", "Manual host-managed payments are not treated as Famlo payouts."],
    table: {
      headers: ["Booking ID", "Guest", "Gross amount", "Famlo fee", "Refund adj.", "Net Famlo payout", "Payout status", "Paid date"],
      rows: tableRows.length > 0 ? tableRows : [["—", "No Famlo payout rows in this range", "—", "—", "—", "—", "—", "—"]],
      columnWidthsMm: [22, 26, 23, 20, 18, 25, 23, 15],
    },
    footerLines: ["Generated by Famlo Pro.", "Famlo payout values apply only to Famlo-collected bookings."],
    logoPath: reportLogoPath(),
  };
}

function buildOtaPerformancePdf(workspace: HostMobileReportWorkspace, range: ResolvedReportRange): HostMobilePdfInput {
  const completedOtaRows = rangeCompletedRevenueRows(workspace.bookings, range).filter((booking) => booking.sourceCategory === "ota");
  const otaSummary = Object.values(
    completedOtaRows.reduce<Record<string, { sourceName: string; grossRevenue: number; bookingCount: number; cancelledCount: number }>>(
      (accumulator, booking) => {
        const sourceName = cleanSourceLabel(booking.sourceLabel);
        const current = accumulator[sourceName] ?? { sourceName, grossRevenue: 0, bookingCount: 0, cancelledCount: 0 };
        current.grossRevenue += booking.amountValue ?? 0;
        current.bookingCount += 1;
        if (isCancelledBooking(booking)) current.cancelledCount += 1;
        accumulator[sourceName] = current;
        return accumulator;
      },
      {}
    )
  ).sort((left, right) => right.grossRevenue - left.grossRevenue || right.bookingCount - left.bookingCount);

  const otaBookings = rangeBookingRows(workspace.bookings, range).filter((booking) => booking.sourceCategory === "ota");
  const otaCancelledCount = otaBookings.filter(isCancelledBooking).length;
  const tableRows = otaSummary.map((item) => [
    item.sourceName,
    formatNumber(item.bookingCount),
    formatInr(item.grossRevenue),
    formatNumber(item.cancelledCount),
    "Gross OTA revenue only",
  ]);

  return {
    title: "OTA Performance Report",
    propertyName: workspace.propertyName,
    locationLabel: workspace.locationLabel,
    rangeLabel: range.label,
    generatedAt: formatDateTime(new Date().toISOString()),
    summaryItems: [
      { label: "OTA gross revenue", value: formatInr(completedOtaRows.reduce((sum, booking) => sum + (booking.amountValue ?? 0), 0)) },
      { label: "OTA bookings", value: formatNumber(otaBookings.length) },
      { label: "Top OTA source", value: otaSummary[0]?.sourceName ?? "No OTA source" },
      { label: "Cancellation count", value: formatNumber(otaCancelledCount) },
    ],
    notes: [
      "OTA settlement and commission values may depend on OTA data. Famlo does not treat OTA gross revenue as confirmed payout.",
      "This report shows OTA gross revenue and source-wise booking count only.",
    ],
    table: {
      headers: ["OTA source", "Booking count", "Gross revenue", "Cancelled bookings", "Notes"],
      rows: tableRows.length > 0 ? tableRows : [["—", "0", formatInr(0), "0", "No OTA bookings in this range"]],
      columnWidthsMm: [44, 24, 34, 28, 42],
    },
    footerLines: ["Generated by Famlo Pro.", "OTA gross revenue is not treated as confirmed payout."],
    logoPath: reportLogoPath(),
  };
}

function buildPdfInput(
  workspace: HostMobileReportWorkspace,
  range: ResolvedReportRange,
  reportKey: HostMobileReportKey
): HostMobilePdfInput {
  switch (reportKey) {
    case "monthly_revenue":
      return buildMonthlyRevenuePdf(workspace, range);
    case "booking_summary":
      return buildBookingSummaryPdf(workspace, range);
    case "famlo_payout":
      return buildFamloPayoutPdf(workspace, range);
    case "ota_performance":
      return buildOtaPerformancePdf(workspace, range);
    case "cancellation_refund":
      throw new HostMobileReportError(409, "Cancellation & Refund Report download is coming soon.");
    case "gst_report":
      if (!workspace.gstin) {
        throw new HostMobileReportError(423, "Add GST details to enable GST report.");
      }
      throw new HostMobileReportError(409, "GST Report download is coming soon.");
    case "custom_report":
      throw new HostMobileReportError(409, "Custom Report download is coming soon.");
    default:
      throw new HostMobileReportError(400, "Unknown report key.");
  }
}

export async function generateHostMobileReportPdf(
  supabase: SupabaseClient,
  input: MobileReportDownloadInput
): Promise<MobileReportDownloadOutput> {
  const reportKey = normalizeReportKey(input.reportKey);
  const preset = normalizePreset(input.preset);
  const range = resolveReportRange({ preset, from: input.from, to: input.to });
  const workspace = await loadWorkspace(supabase, {
    familyId: input.familyId,
    hostId: input.hostId,
    hostUserId: input.hostUserId,
  });

  if (!workspace.proAllowed) {
    throw new HostMobileReportError(403, `Famlo Pro is not active for this property. ${workspace.proReason || workspace.proStatus}`);
  }

  if (!PHASE_ONE_REPORTS.includes(reportKey) && reportKey !== "gst_report" && reportKey !== "custom_report" && reportKey !== "cancellation_refund") {
    throw new HostMobileReportError(400, "Unsupported report key.");
  }

  const pdfInput = buildPdfInput(workspace, range, reportKey);
  const bytes = await renderHostMobileReportPdf(pdfInput);

  return {
    bytes,
    fileName: buildReportFileName(reportKey, workspace.propertyName, range.from, range.to),
    mimeType: "application/pdf",
    reportKey,
    from: range.from,
    to: range.to,
  };
}
