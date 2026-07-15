import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import type { PhotoItem } from "@/components/partners/HostDashboardEditor";

import FamloProDashboardShell from "@/components/partners/pro/FamloProDashboardShell";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import {
  buildCalendarSyncMetadata,
  loadHostProCalendarSyncSnapshot,
  type HostProCalendarSyncMetadata,
} from "@/lib/host-pro-calendar-sync";
import { resolveOtaPaymentCollectMode, type OtaPaymentCollectMode } from "@/lib/channel-booking-normalization";
import { resolveAuthorizedHostSession } from "@/lib/chat-access";
import { loadCanonicalCalendar } from "@/lib/calendar";
import { addIndiaDays, getTodayInIndia } from "@/lib/booking-time";
import { parseHostListingMeta } from "@/lib/host-listing-meta";
import {
  buildBasicHostDashboardHref,
  isFamloProDashboardEnabled,
  loadHostProAccess,
  loadHostProAccessMap,
} from "@/lib/host-pro-access";
import { loadHostProChannelFoundation } from "@/lib/host-pro-channel-foundation";
import { loadHostProSettings } from "@/lib/host-pro-settings";
import { buildHostProSetupReadiness } from "@/lib/host-pro-setup-readiness";
import {
  buildComplianceFromFamily,
  buildListingFromFamily,
  buildProfileFromFamily,
  buildScheduleFromFamily,
} from "@/lib/family-profile-editor";
import { resolveHostDisplayProfile } from "@/lib/host/resolve-host-display-profile";
import { resolvePublicPropertyMedia, type ResolvedPublicPropertyMedia } from "@/lib/property-public-media";
import { ensureProjectedInventory } from "@/lib/inventory";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { loadStayUnitsForSelector } from "@/lib/stay-units";
import type { ProDashboardLoadMetrics } from "@/lib/pro-dashboard-performance";
import { createAdminSupabaseClient } from "@/lib/supabase";

export interface FamloProDashboardPageProps {
  searchParams?: Promise<{
    family?: string;
    section?: string;
    calendarStart?: string;
    appShell?: string;
  }>;
}

export interface FamloProDashboardRenderProps extends FamloProDashboardPageProps {
  roomRouteState?: {
    mode: "edit" | "create";
    roomId?: string;
  } | null;
}

export const dynamic = "force-dynamic";

type ProSectionId =
  | "dashboard"
  | "host-profile"
  | "documents"
  | "properties-home"
  | "setup-guide"
  | "rooms-units"
  | "rates-restrictions"
  | "inventory-calendar"
  | "availability-rules"
  | "check-times"
  | "connected-channels"
  | "room-mapping"
  | "rate-mapping"
  | "sync-logs"
  | "conflicts"
  | "bookings"
  | "messages-reviews"
  | "revenue"
  | "reports"
  | "property"
  | "ota-content"
  | "team-groups"
  | "settings"
  | "support";

const PRO_SECTION_IDS = new Set([
  "dashboard",
  "host-profile",
  "documents",
  "properties-home",
  "setup-guide",
  "rooms-units",
  "rates-restrictions",
  "inventory-calendar",
  "availability-rules",
  "check-times",
  "connected-channels",
  "room-mapping",
  "rate-mapping",
  "sync-logs",
  "conflicts",
  "bookings",
  "messages-reviews",
  "revenue",
  "reports",
  "property",
  "ota-content",
  "team-groups",
  "settings",
  "support",
] as const satisfies readonly ProSectionId[]);

function buildBasicFamloPlusUrl(familyId: string): string {
  return familyId ? buildBasicHostDashboardHref(familyId, "famlo-plus") : "/partnerslogin/home/dashboard?tab=famlo-plus";
}

function buildBasicRoomUrl(familyId: string): string {
  return familyId ? buildBasicHostDashboardHref(familyId, "room") : "/partnerslogin/home/dashboard?tab=room";
}

async function canCurrentHostAccessFamily(
  familyId: string
): Promise<boolean> {
  const supabase = createAdminSupabaseClient();
  const hostSession = await resolveAuthorizedHostSession(supabase);

  if (!hostSession) {
    return false;
  }

  if (hostSession.familyId === familyId) {
    return true;
  }

  const [{ data: host }, { data: family }] = await Promise.all([
    supabase
      .from("hosts")
      .select("user_id")
      .eq("legacy_family_id", familyId)
      .maybeSingle(),
    supabase
      .from("families")
      .select("user_id")
      .eq("id", familyId)
      .maybeSingle(),
  ]);

  const familyHostUserId =
    typeof host?.user_id === "string" && host.user_id.trim().length > 0
      ? host.user_id
      : typeof family?.user_id === "string" && family.user_id.trim().length > 0
        ? family.user_id
        : null;

  return Boolean(hostSession.hostUserId && familyHostUserId && hostSession.hostUserId === familyHostUserId);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeFamilyId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isSchemaCompatibilityError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("column") || lower.includes("schema cache") || lower.includes("does not exist") || lower.includes("relation");
}

function resolveInitialSection(value: string | undefined): ProSectionId {
  if (value && PRO_SECTION_IDS.has(value as ProSectionId)) {
    return value as ProSectionId;
  }
  return "dashboard";
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function resolveLatestPayoutRow(rows: Array<Record<string, unknown>>): Record<string, unknown> | null {
  if (rows.length === 0) return null;
  return [...rows].sort((left, right) => {
    const leftAnchor = asString(left.processed_at) ?? asString(left.created_at) ?? "";
    const rightAnchor = asString(right.processed_at) ?? asString(right.created_at) ?? "";
    return rightAnchor.localeCompare(leftAnchor);
  })[0] ?? null;
}

function isPaidPayoutStatus(value: unknown): boolean {
  const normalized = normalizeToken(value);
  return normalized === "paid" || normalized === "processed" || normalized === "completed";
}

function isCompletedRevenueStatus(value: unknown): boolean {
  const normalized = normalizeToken(value);
  return (
    normalized === "checked_out" ||
    normalized === "completed" ||
    normalized === "checkout_done" ||
    normalized === "revenue_recognized"
  );
}

function formatTimestampLabel(value: string | null | undefined): string {
  if (!value) return "No active end date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No active end date";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatLongDateLabel(value: string | null | undefined): string {
  if (!value) return "No active end date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No active end date";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCalendarAmount(value: number | null, currency: string | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const normalizedCurrency = typeof currency === "string" && currency.trim().length === 3 ? currency.trim().toUpperCase() : "INR";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: normalizedCurrency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatAccessReason(reason: string): string {
  if (reason === "active") return "Active access";
  if (reason === "grace") return "Grace period";
  if (reason === "expired") return "Expired";
  if (reason === "paused") return "Paused";
  if (reason === "locked") return "Locked";
  if (reason === "no_subscription") return "No subscription";
  if (reason === "active_period") return "Active access";
  if (reason === "grace_period") return "Grace access";
  if (reason === "subscription_cancelled") return "Cancelled";
  if (reason === "subscription_expired") return "Expired";
  return reason.replaceAll("_", " ");
}

function isCurrentMonth(dateLike: string | null, now: Date): boolean {
  if (!dateLike) return false;
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return false;
  return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth();
}

type CalendarCellStatus = "available" | "famlo" | "ota" | "manual_block" | "pending" | "past" | "unavailable";

type CalendarColumn = {
  date: string;
  dayLabel: string;
  dateLabel: string;
  isPast: boolean;
};

type CalendarBookingDetail = {
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

type CalendarCell = {
  date: string;
  status: CalendarCellStatus;
  label: string;
  availableUnits: number | null;
  bookingDetail: CalendarBookingDetail | null;
};

type CalendarRateCell = {
  date: string;
  displayValue: string;
  amount: number | null;
  baseAmount: number;
  isPast: boolean;
  isOverridden: boolean;
};

type CalendarRow = {
  roomId: string;
  roomName: string;
  unitType: string;
  rate: number;
  availabilityCells: CalendarCell[];
  rateCells: CalendarRateCell[];
};

type ProBookingSummary = {
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

type HostRevenueCompliance = {
  panVerified: boolean;
  payoutAccountActive: boolean;
};

type CalendarWindowSummary = {
  startDate: string;
  endDate: string;
  isCustomRange: boolean;
  verificationUrl: string | null;
  verificationTargetLabel: string | null;
};

type CalendarVerificationSummary = {
  targetDate: string;
  checkoutDate: string;
  roomName: string;
  sourceLabel: string;
  targetDateBlocked: boolean;
  checkoutDateBlocked: boolean;
};

type CalendarWorkspaceStatus = {
  selectedFamilyLoaded: boolean;
  selectedPropertyLoaded: boolean;
  roomsLoaded: boolean;
  bookingsLoaded: boolean;
  blockedDatesLoaded: boolean;
  channelMappingsLoaded: boolean;
  errorMessage: string | null;
  errorSources: string[];
};

type CalendarSyncSummary = HostProCalendarSyncMetadata;

type PropertySwitcherOption = {
  familyId: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  locality: string | null;
  famloPlusStatus: string | null;
  isActive: boolean;
  activeRoomCount: number;
};

function formatCalendarDayLabel(date: string): string {
  const value = new Date(`${date}T12:00:00+05:30`);
  return new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(value);
}

function formatCalendarDateLabel(date: string): string {
  const value = new Date(`${date}T12:00:00+05:30`);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(value);
}

function enumerateIndiaDates(from: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => addIndiaDays(from, index));
}

function isIsoDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00+05:30`);
  return !Number.isNaN(parsed.getTime());
}

function shouldPreloadBookingWorkspace(section: ProSectionId): boolean {
  return (
    section === "dashboard" ||
    section === "bookings" ||
    section === "revenue" ||
    section === "reports"
  );
}

function shouldPreloadCalendarWorkspace(section: ProSectionId): boolean {
  return section === "inventory-calendar";
}

export async function renderFamloProDashboardPage({
  searchParams,
  roomRouteState = null,
}: Readonly<FamloProDashboardRenderProps>): Promise<React.JSX.Element> {
  const isAdminView = await hasValidAdminSession().catch(() => false);
  const renderStartedAt = Date.now();
  const params = await searchParams;
  const embeddedAppView = params?.appShell === "1";
  const cookieStore = await cookies();
  const requestedFamilyId = normalizeFamilyId(params?.family ?? cookieStore.get("famlo_host_family_id")?.value ?? "");
  const initialSection = resolveInitialSection(params?.section);
  const isInventoryCalendarSection = initialSection === "inventory-calendar";
  const requestedCalendarStart = isIsoDate(params?.calendarStart) ? params?.calendarStart : null;
  const supabase = createAdminSupabaseClient();
  const hostSession = await resolveAuthorizedHostSession(supabase);
  const authUser = await resolveAuthenticatedUser(supabase);
  const { data: requestedFamilyRecord } = requestedFamilyId
    ? await supabase
        .from("families")
        .select("id,user_id")
        .eq("id", requestedFamilyId)
        .maybeSingle()
    : { data: null };
  const fallbackHostUserId =
    typeof requestedFamilyRecord?.user_id === "string" &&
    requestedFamilyRecord.user_id.trim().length > 0 &&
    authUser?.id &&
    requestedFamilyRecord.user_id === authUser.id
      ? requestedFamilyRecord.user_id
      : null;
  const effectiveHostUserId = hostSession?.hostUserId ?? fallbackHostUserId;
  const effectiveSessionFamilyId =
    hostSession?.familyId ??
    (fallbackHostUserId && requestedFamilyId ? requestedFamilyId : null);
  const workspaceFamilyIds =
    effectiveHostUserId
      ? (
          await supabase
            .from("families")
            .select("id")
            .eq("user_id", effectiveHostUserId)
            .order("updated_at", { ascending: false })
        ).data?.map((row) => normalizeFamilyId(row.id)).filter(Boolean) ?? []
      : [];
  const workspaceAccessMap = await loadHostProAccessMap(supabase, workspaceFamilyIds);
  const proAccessibleFamilyIds = workspaceFamilyIds.filter((id) => workspaceAccessMap[id]?.allowed);
  const { data: workspaceRoomRows } =
    workspaceFamilyIds.length > 0
      ? await supabase
          .from("stay_units_v2")
          .select("legacy_family_id,is_active")
          .in("legacy_family_id", workspaceFamilyIds)
      : { data: [] };
  const activeRoomCountByFamilyId = new Map<string, number>();
  for (const row of (workspaceRoomRows ?? []) as Array<Record<string, unknown>>) {
    const nextFamilyId = asString(row.legacy_family_id);
    if (!nextFamilyId || row.is_active === false) continue;
    activeRoomCountByFamilyId.set(nextFamilyId, (activeRoomCountByFamilyId.get(nextFamilyId) ?? 0) + 1);
  }
  const validRequestedFamilyId =
    requestedFamilyId && workspaceFamilyIds.includes(requestedFamilyId) ? requestedFamilyId : "";
  const fallbackFamilyId =
    (effectiveSessionFamilyId && proAccessibleFamilyIds.includes(effectiveSessionFamilyId) ? effectiveSessionFamilyId : "") ||
    proAccessibleFamilyIds[0] ||
    (effectiveSessionFamilyId && workspaceFamilyIds.includes(effectiveSessionFamilyId) ? effectiveSessionFamilyId : "") ||
    workspaceFamilyIds[0] ||
    requestedFamilyId;
  const familyId = validRequestedFamilyId || fallbackFamilyId;
  const basicDashboardUrl = buildBasicFamloPlusUrl(familyId);
  const basicRoomUrl = buildBasicRoomUrl(familyId);

  if (familyId && familyId !== requestedFamilyId) {
    const nextParams = new URLSearchParams();
    nextParams.set("family", familyId);
    nextParams.set("section", initialSection);
    if (requestedCalendarStart) {
      nextParams.set("calendarStart", requestedCalendarStart);
    }
    redirect(`/partnerslogin/home/pro/dashboard?${nextParams.toString()}`);
  }

  if (!familyId) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>
          <h1 style={titleStyle}>Famlo Pro is locked</h1>
          <p style={copyStyle}>Open the host dashboard and select a property to review Famlo Pro billing and access.</p>
          <div style={buttonRowStyle}>
            <Link href="/partners/login" style={primaryLinkStyle}>Back to Partner Login</Link>
          </div>
        </section>
      </main>
    );
  }

  const famloProEnabled = isFamloProDashboardEnabled();
  const authorized = workspaceFamilyIds.includes(familyId);

  if (!authorized) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>
          <div style={eyebrowStyle}>Famlo Pro</div>
          <h1 style={titleStyle}>Famlo Pro is locked</h1>
          <p style={copyStyle}>
            This host session is not authorized to access the requested property.
          </p>
          <div style={buttonRowStyle}>
            <Link href={basicDashboardUrl} style={primaryLinkStyle}>Back to Famlo+</Link>
          </div>
        </section>
      </main>
    );
  }

  const access = await loadHostProAccess(supabase, familyId);

  if (!famloProEnabled || !access.allowed) {
    redirect(basicDashboardUrl);
  }

  const familyRecordResult = await supabase
    .from("families")
    .select("id,name,property_name,host_id,city,state,admin_notes,is_active,is_accepting,lat,lng,bathroom_type,google_maps_link,amenities,common_areas,house_rules,food_type,host_phone,host_photo_url,street_address,about,description,famlo_experience,family_composition,languages,languages_spoken,id_document_type,id_document_url,live_selfie_url,max_guests,active_quarters,blocked_dates,booking_requires_host_approval,price_morning,price_afternoon,price_evening,price_fullday,village")
    .eq("id", familyId)
    .maybeSingle();
  const familyRecord =
    familyRecordResult.error && isSchemaCompatibilityError(familyRecordResult.error.message)
      ? await supabase
          .from("families")
          .select("id,name,host_id,city,state,admin_notes,is_active,is_accepting,lat,lng,bathroom_type,google_maps_link,amenities,common_areas,house_rules,food_type,host_phone,host_photo_url,street_address,about,description,famlo_experience,family_composition,languages,languages_spoken,id_document_type,id_document_url,live_selfie_url,max_guests,active_quarters,blocked_dates,booking_requires_host_approval,price_morning,price_afternoon,price_evening,price_fullday,village")
          .eq("id", familyId)
          .maybeSingle()
      : familyRecordResult;

  const [{ data: family }, { data: host }] = await Promise.all([
    Promise.resolve({ data: familyRecord.data }),
    supabase
      .from("hosts")
      .select("id,legacy_family_id,display_name,status")
      .eq("legacy_family_id", familyId)
      .maybeSingle(),
  ]);

  const meta = parseHostListingMeta(asString(family?.admin_notes));
  const { data: latestDraft } = await supabase
    .from("host_onboarding_drafts")
    .select("payload")
    .eq("family_id", familyId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const familyProfileSeed: Record<string, unknown> = {
    ...((family ?? {}) as Record<string, unknown>),
    latest_onboarding_payload:
      latestDraft?.payload && typeof latestDraft.payload === "object" && !Array.isArray(latestDraft.payload)
        ? latestDraft.payload
        : null,
  };
  const preloadBookingWorkspace = shouldPreloadBookingWorkspace(initialSection);
  const preloadCalendarWorkspace = shouldPreloadCalendarWorkspace(initialSection);
  const needsChannelOperatorHistory =
    initialSection === "connected-channels" ||
    initialSection === "room-mapping" ||
    initialSection === "rate-mapping" ||
    initialSection === "sync-logs" ||
    initialSection === "conflicts";
  const needsChannelSyncHistory =
    needsChannelOperatorHistory || initialSection === "inventory-calendar";
  const needsChannelSyncJobs =
    needsChannelOperatorHistory || initialSection === "inventory-calendar";
  const needsBookingRevisions =
    initialSection === "bookings" ||
    initialSection === "inventory-calendar" ||
    needsChannelOperatorHistory;
  const [
    storedProSettings,
    channelFoundation,
    rooms,
    bookingRowsResult,
  ] = await Promise.all([
    loadHostProSettings(supabase, familyId),
    loadHostProChannelFoundation(supabase, familyId, {
      includeSyncLogs: needsChannelSyncHistory,
      includeSyncJobs: needsChannelSyncJobs,
      includeBookingRevisions: needsBookingRevisions,
    }),
    loadStayUnitsForSelector(supabase, {
      hostId: asString(host?.id),
      legacyFamilyId: familyId,
    }),
    host?.id && !isInventoryCalendarSection
      ? supabase
          .from("bookings_v2")
          .select("id,status,payment_status,total_price,start_date,created_at")
          .eq("host_id", host.id)
          .order("created_at", { ascending: false })
          .limit(120)
      : Promise.resolve({ data: [] }),
  ]);
  const propertyLocalityLabel =
    asString(meta.neighbourhood) ??
    asString(meta.neighborhoodDesc);
  const resolvedPropertyCity = storedProSettings.city ?? asString(family?.city);
  const resolvedPropertyState = storedProSettings.state ?? asString(family?.state);
  const resolvedPropertyCountry = storedProSettings.country ?? null;
  let propertyOptions: PropertySwitcherOption[] = [];

  if (effectiveHostUserId) {
    const familyRowsResult = await supabase
      .from("families")
      .select("id,name,property_name,city,state,admin_notes,is_active,user_id")
      .eq("user_id", effectiveHostUserId);
    const familyRowsSafe =
      familyRowsResult.error && isSchemaCompatibilityError(familyRowsResult.error.message)
        ? await supabase
            .from("families")
            .select("id,name,city,state,admin_notes,is_active,user_id")
            .eq("user_id", effectiveHostUserId)
        : familyRowsResult;

    const [{ data: familyRows }, { data: hostRows }] = await Promise.all([
      Promise.resolve({ data: familyRowsSafe.data }),
      supabase
        .from("hosts")
        .select("legacy_family_id,display_name,user_id,status")
        .eq("user_id", effectiveHostUserId),
    ]);

    const currentFamilyRecord = family
      ? [{
          id: asString(family.id) ?? familyId,
          name: asString(family.name),
          property_name: asString((family as Record<string, unknown>).property_name),
          city: asString(family.city),
          state: asString(family.state),
          admin_notes: asString(family.admin_notes),
          is_active: family.is_active !== false,
          user_id: effectiveHostUserId,
        }]
      : [];

    const familyRowsCombined = [...((familyRows ?? []) as Array<Record<string, unknown>>), ...currentFamilyRecord];
    const familyById = new Map<string, Record<string, unknown>>();
    for (const row of familyRowsCombined) {
      const id = asString(row.id);
      if (!id) continue;
      if (!familyById.has(id)) {
        familyById.set(id, row);
      }
    }

    const hostByFamilyId = new Map(
      ((hostRows ?? []) as Array<Record<string, unknown>>)
        .map((row) => [asString(row.legacy_family_id), row] as const)
        .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry[0]))
    );

    const familyIds = Array.from(familyById.keys());
    const accessMap = await loadHostProAccessMap(supabase, familyIds);

    propertyOptions = familyIds
      .map((id) => {
        const row = familyById.get(id) ?? {};
        const hostRow = hostByFamilyId.get(id) ?? null;
        const meta = parseHostListingMeta(asString(row.admin_notes));
        return {
          familyId: id,
          name:
            asString(row.property_name) ??
            asString(row.name) ??
            asString(hostRow?.display_name) ??
            "Famlo Property",
          city: asString(row.city),
          state: asString(row.state),
          country: null,
          locality:
            asString(meta.neighbourhood) ??
            asString(meta.neighborhoodDesc),
          famloPlusStatus: accessMap[id]?.status ?? null,
          isActive: row.is_active !== false,
          activeRoomCount: activeRoomCountByFamilyId.get(id) ?? 0,
        } satisfies PropertySwitcherOption;
      })
      .sort((left, right) => {
        if (left.familyId === familyId) return -1;
        if (right.familyId === familyId) return 1;
        return left.name.localeCompare(right.name);
      });
  }

  if (!propertyOptions.some((option) => option.familyId === familyId)) {
    const currentMeta = parseHostListingMeta(asString(family?.admin_notes));
    propertyOptions = [
      {
        familyId,
        name:
          asString((family as Record<string, unknown> | null)?.property_name) ??
          asString(family?.name) ??
          asString(host?.display_name) ??
          "Famlo Property",
        city: resolvedPropertyCity,
        state: resolvedPropertyState,
        country: resolvedPropertyCountry,
        locality:
          propertyLocalityLabel ??
          asString(currentMeta.neighbourhood) ??
          asString(currentMeta.neighborhoodDesc),
        famloPlusStatus: access.status,
        isActive: family?.is_active !== false,
        activeRoomCount: activeRoomCountByFamilyId.get(familyId) ?? 0,
      },
      ...propertyOptions,
    ];
  }

  const propertyName =
    asString((family as Record<string, unknown> | null)?.property_name) ??
    asString(family?.name) ??
    asString(host?.display_name) ??
    "Famlo Property";
  const hostCode = asString(family?.host_id);
  const locationLabel =
    [propertyLocalityLabel, resolvedPropertyCity, resolvedPropertyState, resolvedPropertyCountry].filter(Boolean).join(", ") ||
    "Location pending";
  const channexConfig = getChannexConfigSummary();
  const proSettings = {
    ...storedProSettings,
    otaTitle: storedProSettings.otaTitle ?? propertyName,
    state: resolvedPropertyState,
    city: resolvedPropertyCity,
    addressLine: storedProSettings.addressLine ?? asString(meta.propertyAddress),
  };
  const mediaLoadStartedAt = Date.now();
  const propertyMedia: ResolvedPublicPropertyMedia = isInventoryCalendarSection
    ? {
        gallery: [],
        reels: [],
        debug: {
          familyId,
          hostId: asString(host?.id) ?? "",
          gallerySource: "none",
          reelSource: "none",
          galleryCount: 0,
          reelCount: 0,
        },
      }
    : await resolvePublicPropertyMedia(supabase, {
        familyId,
        hostId: asString(host?.id),
        familyRow: familyProfileSeed,
        hostRow: host as Record<string, unknown> | null,
        approvedDraftRow: latestDraft as Record<string, unknown> | null,
        debugContext: "profile-config-loader",
      });
  const mediaLoadDurationMs = Date.now() - mediaLoadStartedAt;
  const primaryRoom = rooms.find((room) => room.isPrimary) ?? rooms[0] ?? null;
  const liveProfileSeed: Record<string, unknown> = {
    ...familyProfileSeed,
    host_display_name: asString(host?.display_name),
    locality: asString((host as Record<string, unknown> | null)?.locality),
    primary_stay_unit_amenities: primaryRoom?.amenities ?? [],
    canonical_host_reel_public_url: propertyMedia.reels[0]?.publicUrl ?? "",
    canonical_host_reel_storage_key: propertyMedia.reels[0]?.storageKey ?? "",
    canonical_host_reel_mime_type: propertyMedia.reels[0]?.mimeType ?? "",
    canonical_host_reel_size_bytes: propertyMedia.reels[0]?.sizeBytes ?? null,
    canonical_host_reel_uploaded_at: propertyMedia.reels[0]?.updatedAt ?? propertyMedia.reels[0]?.createdAt ?? "",
  };
  const propertyPhotos: PhotoItem[] = propertyMedia.gallery.map((photo) => ({
    id: photo.id || `photo-${Math.random()}`,
    url: photo.url,
    isPrimary: photo.isPrimary,
    family_id: familyId,
  })).filter((photo) => photo.url.length > 0);
  const baseInitialProfile = buildProfileFromFamily(liveProfileSeed, meta);
  const resolvedHostProfile = await resolveHostDisplayProfile(supabase, {
    hostUserId: effectiveHostUserId,
    familyId,
    hostRow: host as Record<string, unknown> | null,
    familyRow: liveProfileSeed,
    authUser,
    onboardingPayload: familyProfileSeed.latest_onboarding_payload,
    gallery: propertyMedia.gallery,
    reel: propertyMedia.reels[0] ?? null,
    rooms,
    channelFoundation,
    proStatus: access.status,
  });
  const initialProfile = {
    ...baseInitialProfile,
    hostDisplayName: resolvedHostProfile.hostName || baseInitialProfile.hostDisplayName,
    email:
      resolvedHostProfile.hostEmail !== "Not added"
        ? resolvedHostProfile.hostEmail
        : baseInitialProfile.email,
    mobileNumber:
      resolvedHostProfile.hostPhone !== "Not added"
        ? resolvedHostProfile.hostPhone
        : baseInitialProfile.mobileNumber,
    languages:
      resolvedHostProfile.preferredLanguage !== "Not added"
        ? resolvedHostProfile.preferredLanguage
        : baseInitialProfile.languages,
    hostSelfieUrl: resolvedHostProfile.profilePhoto ?? baseInitialProfile.hostSelfieUrl,
  };
  const initialSchedule = buildScheduleFromFamily(familyProfileSeed);
  const initialCompliance = buildComplianceFromFamily(liveProfileSeed, meta);
  const propertyContent = buildListingFromFamily(liveProfileSeed, meta);
  const roomSummaries = rooms.map((room) => ({
    id: room.id,
    name: room.name,
    unitType: room.unitType,
    description: room.description,
    maxGuests: room.maxGuests,
    bedInfo: room.bedInfo,
    bathroomType: room.bathroomType,
    priceMorning: room.priceMorning,
    priceAfternoon: room.priceAfternoon,
    priceEvening: room.priceEvening,
    priceFullday: room.priceFullday,
    quarterEnabled: room.quarterEnabled,
    isActive: room.isActive,
    isPrimary: room.isPrimary,
    amenitiesCount: room.amenities.length,
    photosCount: room.photos.length + room.localityPhotos.length,
    photoUrl: room.photos[0] ?? room.localityPhotos[0] ?? null,
  }));
  const activeRoomIds = roomSummaries.filter((room) => room.isActive).map((room) => room.id);
  const roomMappingsByRoomId = new Map(
    channelFoundation.roomMappings.map((mapping) => [mapping.stayUnitId, mapping])
  );
  const providerRowsExist = channelFoundation.providers.length > 0;
  const propertyConnected = channelFoundation.properties.some(
    (property) => property.syncStatus === "connected"
  );
  const roomMappingsReady =
    activeRoomIds.length > 0 &&
    activeRoomIds.every((roomId) => Boolean(roomMappingsByRoomId.get(roomId)?.externalRoomTypeId));
  const ratePlansReady =
    channelFoundation.ratePlans.length > 0 &&
    channelFoundation.ratePlans.some((ratePlan) => Boolean(ratePlan.externalRatePlanId));

  const bookingRows = bookingRowsResult.data;

  const { data: platformSettings } = await supabase
    .from("admin_platform_settings")
    .select("global_family_commission_pct")
    .maybeSingle();
  const globalCommission = Number(platformSettings?.global_family_commission_pct) || 16;

  const now = new Date();
  const openRooms = roomSummaries.filter((room) => room.isActive).length;
  const closedRooms = roomSummaries.length - openRooms;
  const nonCancelledBookings = ((bookingRows ?? []) as Array<Record<string, unknown>>).filter((row) => {
    const status = String(row.status ?? "").toLowerCase();
    return !status.startsWith("cancelled");
  });
  const revenueThisMonth = nonCancelledBookings
    .filter((row) => {
      const startDate = asString(row.start_date);
      const createdAt = asString(row.created_at);
      return isCurrentMonth(startDate, now) || isCurrentMonth(createdAt, now);
    })
    .reduce((sum, row) => sum + asNumber(row.total_price), 0);

  const setupReadiness = buildHostProSetupReadiness({
    propertyName,
    locationLabel,
    familyExists: Boolean(family?.id),
    hostExists: Boolean(host?.id),
    settings: proSettings,
    legacyHouseTypeHint: asString(meta.houseType),
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
  const setupItems = setupReadiness.items;

  const metrics = [
    {
      label: "Setup Progress",
      value: `${setupReadiness.progressPercent}%`,
      hint: "Core readiness across property identity, inventory, and future channel setup.",
    },
    {
      label: "Sync Health",
      value: "Not connected",
      hint: "No provider or webhook traffic is active in this phase.",
    },
    {
      label: "Active Channels",
      value: String(
        channelFoundation.properties.filter((property) => property.syncStatus === "connected").length
      ),
      hint: providerRowsExist
        ? "Provider-neutral foundation is present, but providers remain disconnected unless a property row is marked connected."
        : "No provider rows are seeded yet, so channel readiness remains blocked.",
    },
    {
      label: "Rooms Open / Closed",
      value: `${openRooms}/${closedRooms}`,
      hint: roomSummaries.length > 0 ? "Read-only room status from current Famlo inventory." : "No room inventory available yet.",
    },
    {
      label: "OTA Bookings",
      value: "0",
      hint: "OTA import stays disabled until future provider integration phases.",
    },
    {
      label: "Revenue This Month",
      value: formatCurrency(revenueThisMonth),
      hint: "Read-only view from current Famlo bookings this month. OTA revenue is not connected yet.",
    },
  ];

  const feedItems = [
    {
      title: "Famlo+ entitlement confirmed",
      body: `Pro access is open under ${formatAccessReason(access.reason)} and remains scoped to this authorized property only.`,
      tone: "success" as const,
    },
    {
      title: "Provider environment still disconnected",
      body: "Channex appears first in the future roadmap, but no provider API, webhook, or sync job is active yet.",
      tone: "info" as const,
    },
    {
      title: "Channel foundation loaded",
      body: `${channelFoundation.providers.length} provider rows, ${channelFoundation.roomMappings.length} room mappings, ${channelFoundation.ratePlans.length} rate plans, and ${channelFoundation.syncLogs.length} sync logs were loaded from the provider-neutral foundation.`,
      tone: channelFoundation.providers.length > 0 ? ("success" as const) : ("warning" as const),
    },
    {
      title: "Inventory foundation reviewed",
      body: roomSummaries.length > 0
        ? `${roomSummaries.length} stay units were loaded from the existing Famlo inventory path without writing any room changes.`
        : "No safe room inventory surfaced, so this dashboard falls back to an inventory placeholder state.",
      tone: roomSummaries.length > 0 ? ("success" as const) : ("warning" as const),
    },
    {
      title: "Setup readiness scored",
      body: `${setupReadiness.completedCount} of ${setupReadiness.totalCount} setup signals are complete. Next action: ${setupReadiness.nextAction}`,
      tone: setupReadiness.missingItems.length === 0 ? ("success" as const) : ("info" as const),
    },
    {
      title: "Bookings remain source-of-truth in Famlo",
      body: `${nonCancelledBookings.length} read-only bookings were considered for dashboard context. OTA imports remain disabled.`,
      tone: "info" as const,
    },
  ];

  const calendarFrom = requestedCalendarStart ?? getTodayInIndia();
  const calendarDates = enumerateIndiaDates(calendarFrom, 30);
  const calendarTo = calendarDates[calendarDates.length - 1] ?? calendarFrom;
  const calendarColumns: CalendarColumn[] = calendarDates.map((date) => ({
    date,
    dayLabel: formatCalendarDayLabel(date),
    dateLabel: formatCalendarDateLabel(date),
    isPast: date < calendarFrom,
  }));
  const calendarWorkspaceErrors: Array<{ source: string; message: string }> = [];
  let bookingsLoaded = !preloadCalendarWorkspace || !host?.id;
  let blockedDatesLoaded = !preloadCalendarWorkspace || roomSummaries.length === 0;

  let bookingRowsForCalendar: Array<Record<string, unknown>> = [];
  let bookingRowsForWorkspace: Array<Record<string, unknown>> = [];
  if (host?.id && preloadCalendarWorkspace) {
    const selectWithStayUnit =
      "id,status,payment_status,total_price,start_date,end_date,stay_unit_id,pricing_snapshot,users!user_id(name)";
    const selectFallback =
      "id,status,payment_status,total_price,start_date,end_date,pricing_snapshot,users!user_id(name)";

    let bookingCalendarInitialQuery = supabase
      .from("bookings_v2")
      .select(selectWithStayUnit)
      .eq("host_id", host.id)
      .lte("start_date", calendarTo)
      .gte("end_date", calendarFrom);
    if (roomRouteState?.roomId) {
      bookingCalendarInitialQuery = bookingCalendarInitialQuery.eq("stay_unit_id", roomRouteState.roomId);
    }
    const bookingCalendarInitialResult = await bookingCalendarInitialQuery;

    if (
      bookingCalendarInitialResult.error &&
      String(bookingCalendarInitialResult.error.message ?? "").includes("stay_unit_id")
    ) {
      let bookingCalendarFallbackQuery = supabase
        .from("bookings_v2")
        .select(selectFallback)
        .eq("host_id", host.id)
        .lte("start_date", calendarTo)
        .gte("end_date", calendarFrom);
      if (roomRouteState?.roomId) {
        bookingCalendarFallbackQuery = bookingCalendarFallbackQuery.eq("pricing_snapshot->>stay_unit_id", roomRouteState.roomId);
      }
      const bookingCalendarFallbackResult = await bookingCalendarFallbackQuery;

      if (!bookingCalendarFallbackResult.error) {
        bookingRowsForCalendar = (bookingCalendarFallbackResult.data ?? []) as Array<Record<string, unknown>>;
      } else {
        calendarWorkspaceErrors.push({
          source: "bookings",
          message: bookingCalendarFallbackResult.error.message,
        });
      }
    } else if (!bookingCalendarInitialResult.error) {
      bookingRowsForCalendar = (bookingCalendarInitialResult.data ?? []) as Array<Record<string, unknown>>;
    } else {
      calendarWorkspaceErrors.push({
        source: "bookings",
        message: bookingCalendarInitialResult.error.message,
      });
    }

    bookingsLoaded = true;

  }

  if (host?.id && preloadBookingWorkspace) {
    const workspaceSelectWithStayUnit =
      "id,status,payment_status,total_price,partner_payout_amount,start_date,end_date,created_at,guests_count,stay_unit_id,pricing_snapshot,users!user_id(name,email)";
    const workspaceSelectFallback =
      "id,status,payment_status,total_price,partner_payout_amount,start_date,end_date,created_at,guests_count,pricing_snapshot,users!user_id(name,email)";

    const bookingWorkspaceInitialResult = await supabase
      .from("bookings_v2")
      .select(workspaceSelectWithStayUnit)
      .eq("host_id", host.id)
      .order("start_date", { ascending: false })
      .limit(120);

    if (
      bookingWorkspaceInitialResult.error &&
      String(bookingWorkspaceInitialResult.error.message ?? "").includes("stay_unit_id")
    ) {
      const bookingWorkspaceFallbackResult = await supabase
        .from("bookings_v2")
        .select(workspaceSelectFallback)
        .eq("host_id", host.id)
        .order("start_date", { ascending: false })
        .limit(120);

      if (!bookingWorkspaceFallbackResult.error) {
        bookingRowsForWorkspace = (bookingWorkspaceFallbackResult.data ?? []) as Array<Record<string, unknown>>;
      }
    } else if (!bookingWorkspaceInitialResult.error) {
      bookingRowsForWorkspace = (bookingWorkspaceInitialResult.data ?? []) as Array<Record<string, unknown>>;
    }
  }

  const selectedRoomIds = new Set(roomSummaries.map((room) => room.id));
  const belongsToSelectedProperty = (row: Record<string, unknown>): boolean => {
    const pricingSnapshot = asObject(row.pricing_snapshot) ?? {};
    const stayUnitId = asString(row.stay_unit_id) ?? asString(pricingSnapshot.stay_unit_id);
    if (stayUnitId && selectedRoomIds.has(stayUnitId)) return true;
    return (
      asString(pricingSnapshot.family_id) === familyId ||
      asString(pricingSnapshot.legacy_family_id) === familyId ||
      asString(pricingSnapshot.property_id) === familyId
    );
  };

  bookingRowsForWorkspace = bookingRowsForWorkspace.filter(belongsToSelectedProperty);

  const bookingWorkspaceIds = bookingRowsForWorkspace
    .map((row) => asString(row.id))
    .filter((value): value is string => Boolean(value));
  const payoutRowsByBookingId = new Map<string, Array<Record<string, unknown>>>();
  const reservationsByBookingId = new Map<string, Record<string, unknown>>();
  const foliosByBookingId = new Map<string, Record<string, unknown>>();
  const settlementLineByBookingId = new Map<string, Record<string, unknown>>();
  const settlementsById = new Map<string, Record<string, unknown>>();
  const payoutExecutionBySettlementId = new Map<string, Record<string, unknown>>();
  const platformInvoiceByBookingId = new Map<string, Record<string, unknown>>();
  const creditNoteTotalByBookingId = new Map<string, number>();
  let hostRevenueCompliance: HostRevenueCompliance = { panVerified: false, payoutAccountActive: false };
  let hostPayoutHold: Record<string, unknown> | null = null;
  let propertyPayoutHold: Record<string, unknown> | null = null;

  if (bookingWorkspaceIds.length > 0) {
    const [
      payoutRowsResult,
      reservationRowsResult,
      folioRowsResult,
      settlementLineRowsResult,
      platformInvoicesResult,
      creditNotesResult,
    ] = await Promise.all([
      supabase
        .from("payouts_v2")
        .select("booking_id,amount,status,processed_at,created_at")
        .in("booking_id", bookingWorkspaceIds),
      supabase
        .from("reservations_v2")
        .select("booking_id,operational_status,check_out_date")
        .in("booking_id", bookingWorkspaceIds),
      supabase
        .from("reservation_folios_v2")
        .select("booking_id,guest_total_amount,host_payout_amount,refund_total_amount,booking_status,payment_status,metadata,property_id")
        .in("booking_id", bookingWorkspaceIds),
      supabase
        .from("settlement_line_items_v2")
        .select("booking_id,settlement_id,amount,metadata,is_active")
        .eq("is_active", true)
        .in("booking_id", bookingWorkspaceIds),
      supabase
        .from("platform_fee_invoices")
        .select("booking_id,total_amount,status,issued_at,created_at")
        .in("booking_id", bookingWorkspaceIds),
      supabase
        .from("credit_notes")
        .select("booking_id,total_reversal_amount,status,created_at")
        .in("booking_id", bookingWorkspaceIds),
    ]);

    if (!payoutRowsResult.error) {
      for (const row of (payoutRowsResult.data ?? []) as Array<Record<string, unknown>>) {
        const bookingId = asString(row.booking_id);
        if (!bookingId) continue;
        payoutRowsByBookingId.set(bookingId, [...(payoutRowsByBookingId.get(bookingId) ?? []), row]);
      }
    }

    if (!reservationRowsResult.error) {
      for (const row of (reservationRowsResult.data ?? []) as Array<Record<string, unknown>>) {
        const bookingId = asString(row.booking_id);
        if (!bookingId || reservationsByBookingId.has(bookingId)) continue;
        reservationsByBookingId.set(bookingId, row);
      }
    }

    if (!folioRowsResult.error) {
      for (const row of (folioRowsResult.data ?? []) as Array<Record<string, unknown>>) {
        const bookingId = asString(row.booking_id);
        if (!bookingId || foliosByBookingId.has(bookingId)) continue;
        foliosByBookingId.set(bookingId, row);
      }
    }

    if (!settlementLineRowsResult.error) {
      const settlementIds = new Set<string>();
      for (const row of (settlementLineRowsResult.data ?? []) as Array<Record<string, unknown>>) {
        const bookingId = asString(row.booking_id);
        const settlementId = asString(row.settlement_id);
        if (bookingId && !settlementLineByBookingId.has(bookingId)) {
          settlementLineByBookingId.set(bookingId, row);
        }
        if (settlementId) settlementIds.add(settlementId);
      }

      if (settlementIds.size > 0) {
        const [settlementsResult, payoutExecutionsResult] = await Promise.all([
          supabase
            .from("host_settlements_v2")
            .select("id,status,paid_at,approved_at,failed_at,property_id,net_payable_amount,payout_hold_status,payout_hold_reason,payout_hold_is_host_actionable")
            .in("id", Array.from(settlementIds))
            .eq("property_id", familyId),
          supabase
            .from("host_payout_executions")
            .select("settlement_id,status,amount,processed_at,created_at,payout_hold_status,payout_hold_reason,payout_hold_is_host_actionable")
            .in("settlement_id", Array.from(settlementIds))
            .order("created_at", { ascending: false }),
        ]);

        if (!settlementsResult.error) {
          for (const row of (settlementsResult.data ?? []) as Array<Record<string, unknown>>) {
            const id = asString(row.id);
            if (!id) continue;
            settlementsById.set(id, row);
          }
        }

        if (!payoutExecutionsResult.error) {
          for (const row of (payoutExecutionsResult.data ?? []) as Array<Record<string, unknown>>) {
            const settlementId = asString(row.settlement_id);
            if (!settlementId || payoutExecutionBySettlementId.has(settlementId)) continue;
            payoutExecutionBySettlementId.set(settlementId, row);
          }
        }
      }
    }

    if (!platformInvoicesResult.error) {
      for (const row of (platformInvoicesResult.data ?? []) as Array<Record<string, unknown>>) {
        const bookingId = asString(row.booking_id);
        if (!bookingId || platformInvoiceByBookingId.has(bookingId)) continue;
        platformInvoiceByBookingId.set(bookingId, row);
      }
    }

    if (!creditNotesResult.error) {
      for (const row of (creditNotesResult.data ?? []) as Array<Record<string, unknown>>) {
        const bookingId = asString(row.booking_id);
        if (!bookingId) continue;
        creditNoteTotalByBookingId.set(
          bookingId,
          (creditNoteTotalByBookingId.get(bookingId) ?? 0) + asNumber(row.total_reversal_amount)
        );
      }
    }
  }

  if (host?.id && preloadBookingWorkspace) {
    const [{ data: payoutAccount }, { data: hostTaxDetails }, { data: hostHold }, { data: propertyHold }] = await Promise.all([
      supabase
        .from("host_payout_accounts")
        .select("account_number_masked,vpa,is_active,validation_status")
        .eq("host_id", host.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .maybeSingle(),
        hostSession?.hostUserId
        ? supabase
            .from("host_tax_details")
            .select("verification_status,is_verified")
            .eq("user_id", hostSession.hostUserId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("hosts")
        .select("payout_hold_status,payout_hold_reason,payout_hold_is_host_actionable")
        .eq("id", host.id)
        .maybeSingle(),
      supabase
        .from("families")
        .select("payout_hold_status,payout_hold_reason,payout_hold_is_host_actionable")
        .eq("id", familyId)
        .maybeSingle(),
    ]);

    hostRevenueCompliance = {
      panVerified:
        ((hostTaxDetails as Record<string, unknown> | null)?.is_verified === true) ||
        normalizeToken((hostTaxDetails as Record<string, unknown> | null)?.verification_status) === "verified" ||
        normalizeToken((hostTaxDetails as Record<string, unknown> | null)?.verification_status) === "approved",
      payoutAccountActive: (payoutAccount as Record<string, unknown> | null)?.is_active === true,
    };
    hostPayoutHold = (hostHold as Record<string, unknown> | null) ?? null;
    propertyPayoutHold = (propertyHold as Record<string, unknown> | null) ?? null;
  }

  const roomManualBlockDates = new Map<string, Set<string>>();
  const roomDailyRateOverrides = new Map<string, Map<string, number>>();
  const roomProjectedRates = new Map<string, Map<string, number>>();
  const roomProjectedAvailability = new Map<string, Map<string, { availableUnits: number; stopSell: boolean }>>();
  let calendarProjectionDurationMs = 0;
  let calendarSync: CalendarSyncSummary = buildCalendarSyncMetadata({
    connected: Boolean(channelFoundation.properties.find((property) => property.providerCode === "channex" && property.externalPropertyId)),
    ok: false,
    observedAt: new Date().toISOString(),
    error: null,
  });
  const channexProperty = channelFoundation.properties.find(
    (property) => property.providerCode === "channex" && property.externalPropertyId
  ) ?? null;

  if (preloadCalendarWorkspace && roomSummaries.length > 0) {
    try {
      const calendarRoomsForSync = roomRouteState?.roomId
        ? roomSummaries.filter((room) => room.id === roomRouteState.roomId)
        : roomSummaries;
      calendarSync = await loadHostProCalendarSyncSnapshot({
        supabase,
        familyId,
        stayUnitIds: calendarRoomsForSync.map((room) => room.id),
        observedAt: new Date().toISOString(),
      });
    } catch (error) {
      calendarSync = buildCalendarSyncMetadata({
        connected: Boolean(channexProperty?.externalPropertyId),
        ok: false,
        observedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Failed to load calendar sync status.",
      });
      calendarWorkspaceErrors.push({
        source: "channel-mappings",
        message: error instanceof Error ? error.message : "Failed to load calendar sync status.",
      });
    }
  }

  if (preloadCalendarWorkspace && roomSummaries.length > 0) {
    const calendarRooms = roomRouteState?.roomId
      ? roomSummaries.filter((room) => room.id === roomRouteState.roomId)
      : roomSummaries;
    const calendarProjectionStartedAt = Date.now();
    const projectedInventoryByRoom = await Promise.all(
      calendarRooms.map(async (room) => {
        try {
          return {
            roomId: room.id,
            days: await ensureProjectedInventory(supabase, {
              familyId,
              stayUnitId: room.id,
              from: calendarFrom,
              to: calendarTo,
            }),
          };
        } catch (error) {
          calendarWorkspaceErrors.push({
            source: "blocked-dates",
            message:
              error instanceof Error
                ? `Failed to project inventory for ${room.name}: ${error.message}`
                : `Failed to project inventory for ${room.name}.`,
          });
          return {
            roomId: room.id,
            days: [],
          };
        }
      })
    );
    calendarProjectionDurationMs = Date.now() - calendarProjectionStartedAt;

    for (const roomProjection of projectedInventoryByRoom) {
      const rates = new Map<string, number>();
      const blockedDates = new Set<string>();
      const availability = new Map<string, { availableUnits: number; stopSell: boolean }>();
      for (const day of roomProjection.days) {
        if (day.effectiveRate > 0) {
          rates.set(day.date, day.effectiveRate);
        }
        availability.set(day.date, {
          availableUnits: day.availableUnits,
          stopSell: day.stopSell,
        });
        if (day.manualBlockPresent) {
          blockedDates.add(day.date);
        }
      }
      roomProjectedRates.set(roomProjection.roomId, rates);
      roomProjectedAvailability.set(roomProjection.roomId, availability);
      roomManualBlockDates.set(roomProjection.roomId, blockedDates);
    }

    const roomCalendarEvents = await Promise.all(
      calendarRooms.map(async (room) => {
        try {
          return {
            roomId: room.id,
            events: await loadCanonicalCalendar(supabase, {
              ownerType: "stay_unit",
              ownerId: room.id,
              from: calendarFrom,
              to: calendarTo,
            }),
          };
        } catch (error) {
          calendarWorkspaceErrors.push({
            source: "blocked-dates",
            message:
              error instanceof Error
                ? `Failed to load calendar events for ${room.name}: ${error.message}`
                : `Failed to load calendar events for ${room.name}.`,
          });
          return {
            roomId: room.id,
            events: [],
          };
        }
      })
    );

    for (const roomCalendar of roomCalendarEvents) {
      const rateOverrides = new Map<string, number>();
      for (const event of roomCalendar.events) {
        if (event.sourceType === "manual_rate" && event.status !== "released") {
          const amountRaw =
            event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
              ? event.payload.amount
              : null;
          const amount = asNumber(amountRaw);
          if (amount <= 0) continue;
          let cursor = event.startDate;
          while (cursor <= event.endDate) {
            rateOverrides.set(cursor, amount);
            cursor = addIndiaDays(cursor, 1);
          }
        }
      }
      roomDailyRateOverrides.set(roomCalendar.roomId, rateOverrides);
    }

    blockedDatesLoaded = true;
  }

  const bookingStatusByRoomDate = new Map<string, CalendarCellStatus>();
  const bookingDetailByRoomDate = new Map<string, CalendarBookingDetail>();
  const roomNameById = new Map(roomSummaries.map((room) => [room.id, room.name]));
  const roomIdByExternalRoomTypeId = new Map(
    channelFoundation.roomMappings
      .filter((mapping) => mapping.providerCode === "channex" && Boolean(mapping.externalRoomTypeId) && Boolean(mapping.stayUnitId))
      .map((mapping) => [mapping.externalRoomTypeId as string, mapping.stayUnitId] as const)
  );
  const bookingRevisionByLinkedBookingId = new Map(
    channelFoundation.bookingRevisions
      .filter((revision) => revision.linkedBookingId)
      .map((revision) => [revision.linkedBookingId as string, revision])
  );
  const bookingRevisionByExternalBookingId = new Map(
    channelFoundation.bookingRevisions
      .filter((revision) => revision.externalBookingId)
      .map((revision) => [revision.externalBookingId as string, revision])
  );
  const persistedProBookings: ProBookingSummary[] = bookingRowsForWorkspace
    .flatMap((row) => {
      const pricingSnapshot =
        row.pricing_snapshot && typeof row.pricing_snapshot === "object" && !Array.isArray(row.pricing_snapshot)
          ? (row.pricing_snapshot as Record<string, unknown>)
          : {};
      const userRecord =
        row.users && typeof row.users === "object" && !Array.isArray(row.users)
          ? (row.users as Record<string, unknown>)
          : {};
      const bookingId = asString(row.id);
      const startDate = asString(row.start_date);
      const endDate = asString(row.end_date);
      const stayUnitId = asString(row.stay_unit_id) ?? asString(pricingSnapshot.stay_unit_id);
      if (!bookingId || !startDate || !endDate) return [];

      const externalBookingId = asString(pricingSnapshot.channel_external_booking_id);
      const matchedRevision =
        bookingRevisionByLinkedBookingId.get(bookingId) ??
        (externalBookingId ? bookingRevisionByExternalBookingId.get(externalBookingId) : null) ??
        null;
      const matchedRevisionPayload = asObject(matchedRevision?.rawPayload) ?? {};
      const reviewReasonLabels = asStringArray(matchedRevisionPayload.review_conflict_labels);
      const reviewTitle =
        asString(matchedRevisionPayload.review_title) ??
        (reviewReasonLabels.length > 0 ? "Channex booking needs review" : null);
      const persistedReviewOnly = reviewReasonLabels.length > 0;
      const channelProvider = asString(pricingSnapshot.channel_provider);
      const sourceChannel = asString(row.source_channel);
      const otaName = asString(pricingSnapshot.ota_name) ?? matchedRevision?.otaName ?? null;
      const isOta = channelProvider === "channex";
      const bookingCurrency = asString(pricingSnapshot.currency) ?? matchedRevision?.currency ?? "INR";
      const totalPrice = asNumber(row.total_price);
      const amountValue = totalPrice > 0 ? totalPrice : matchedRevision?.amount ?? null;
      const adultCountRaw =
        asNumber(pricingSnapshot.adult_count) ||
        asNumber(pricingSnapshot.adults) ||
        asNumber(pricingSnapshot.guest_adults);
      const childCountRaw =
        asNumber(pricingSnapshot.child_count) ||
        asNumber(pricingSnapshot.children) ||
        asNumber(pricingSnapshot.guest_children);
      const guestCountRaw =
        asNumber(row.guests_count) ||
        asNumber(pricingSnapshot.guests_count) ||
        asNumber(pricingSnapshot.guest_count) ||
        adultCountRaw + childCountRaw;
      const reservation = reservationsByBookingId.get(bookingId) ?? null;
      const reservationStatus = asString(reservation?.operational_status) ?? null;
      const checkoutDate = asString(reservation?.check_out_date) ?? endDate;
      const folio = foliosByBookingId.get(bookingId) ?? null;
      const folioMetadata = asObject(folio?.metadata) ?? {};
      const settlementLine = settlementLineByBookingId.get(bookingId) ?? null;
      const settlementId = asString(settlementLine?.settlement_id);
      const settlement = settlementId ? settlementsById.get(settlementId) ?? null : null;
      const payoutExecution = settlementId ? payoutExecutionBySettlementId.get(settlementId) ?? null : null;
      const payoutHoldStatus =
        asString(payoutExecution?.payout_hold_status) ??
        asString(settlement?.payout_hold_status) ??
        asString(propertyPayoutHold?.payout_hold_status) ??
        asString(hostPayoutHold?.payout_hold_status) ??
        "active";
      const payoutHoldIsHostActionable =
        payoutExecution?.payout_hold_is_host_actionable === true ||
        settlement?.payout_hold_is_host_actionable === true ||
        propertyPayoutHold?.payout_hold_is_host_actionable === true ||
        hostPayoutHold?.payout_hold_is_host_actionable === true;
      const platformInvoice = platformInvoiceByBookingId.get(bookingId) ?? null;
      const creditNoteAmount = creditNoteTotalByBookingId.get(bookingId) ?? 0;
      const sourceCategory: ProBookingSummary["sourceCategory"] = isOta
        ? "ota"
        : sourceChannel === "pms_manual"
          ? "direct"
          : "famlo";
      const financeSnapshot = asObject(pricingSnapshot.finance_snapshot) ?? {};
      const financeContract = asObject(financeSnapshot.contract_v1) ?? {};
      const payoutBreakdown = asObject(financeSnapshot.payout_breakdown) ?? {};
      const latestPayout = resolveLatestPayoutRow(payoutRowsByBookingId.get(bookingId) ?? []);
      const payoutAmountValue = asNumber(settlementLine?.amount) || null;
      const platformFeeAmount =
        asNumber(platformInvoice?.total_amount) ||
        asNumber(pricingSnapshot.platform_fee) ||
        asNumber(financeContract.platform_fee) ||
        asNumber(pricingSnapshot.famlo_platform_fee_incl_gst) ||
        0;
      const taxAmount =
        asNumber(pricingSnapshot.platform_fee_tax) ||
        asNumber(financeContract.gst_on_platform_fee) ||
        asNumber(pricingSnapshot.famlo_platform_fee_gst) ||
        asNumber(pricingSnapshot.tax_amount) ||
        0;
      const refundAdjustmentAmount =
        asNumber(asObject(settlementLine?.metadata)?.refund_adjustment_amount) ||
        asNumber(folio?.refund_total_amount) ||
        creditNoteAmount ||
        asNumber(financeSnapshot.refund_adjustments) ||
        asNumber(pricingSnapshot.refund_adjustment) ||
        0;
      const netPayoutAmount = (() => {
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
      const otaCommissionAmount =
        isOta && amountValue != null && netPayoutAmount != null
          ? Math.max(0, amountValue - netPayoutAmount - platformFeeAmount - taxAmount + refundAdjustmentAmount)
          : null;
      const payoutStatus =
        asString(payoutExecution?.status) ??
        asString(settlement?.status) ??
        asString(latestPayout?.status) ??
        null;
      const payoutPaidAt =
        asString(payoutExecution?.processed_at) ??
        asString(settlement?.paid_at) ??
        asString(latestPayout?.processed_at) ??
        asString(latestPayout?.created_at) ??
        null;
      const paymentCollectMode =
        sourceChannel === "pms_manual"
          ? "PROPERTY_COLLECT"
          : sourceCategory === "famlo"
            ? "FAMLO_COLLECT"
            : resolveOtaPaymentCollectMode(
                asString(folioMetadata.payment_collect_mode) ??
                  asString(folioMetadata.payment_collect) ??
                  asString(pricingSnapshot.payment_collect_mode) ??
                  asString(pricingSnapshot.payment_collect) ??
                  null
              );
      const settlementEligible =
        folioMetadata.is_settlement_eligible === true ||
        Boolean(settlementLine) ||
        Boolean(settlement);
      const famloPayoutEligible =
        paymentCollectMode === "FAMLO_COLLECT" && Boolean(settlementLine);
      const complianceBlocked = !(hostRevenueCompliance.panVerified && hostRevenueCompliance.payoutAccountActive);
      const revenueDate =
        isCompletedRevenueStatus(reservationStatus) || isCompletedRevenueStatus(row.status) || Boolean(settlementLine)
          ? checkoutDate
          : null;
      return [{
        bookingId,
        roomId: stayUnitId,
        roomName: stayUnitId ? roomNameById.get(stayUnitId) ?? "Room" : "Room",
        startDate,
        endDate,
        checkoutDate,
        revenueDate,
        createdAt: asString(row.created_at),
        guestDisplayName:
          asString(pricingSnapshot.channel_guest_display_name) ??
          asString(pricingSnapshot.channel_guest_name) ??
          asString(pricingSnapshot.guest_name) ??
          asString(userRecord.name) ??
          (isOta ? "OTA Guest" : "Famlo Guest"),
        status: String(row.status ?? "unknown"),
        reservationStatus,
        paymentStatus: asString(row.payment_status),
        amount:
          totalPrice > 0
            ? formatCalendarAmount(totalPrice, bookingCurrency)
            : matchedRevision?.amount != null
              ? formatCalendarAmount(matchedRevision.amount, matchedRevision.currency ?? bookingCurrency)
              : null,
        amountValue,
        currency: bookingCurrency,
        netPayoutAmount,
        payoutAmountValue,
        paidPayoutAmount: isPaidPayoutStatus(payoutStatus) ? payoutAmountValue : null,
        sourceLabel: isOta ? `${otaName ?? "OTA"} / Channex` : sourceChannel === "pms_manual" ? "Famlo PMS" : "Famlo Direct",
        sourceCategory,
        paymentCollectMode,
        famloPayoutEligible,
        settlementEligible,
        payoutHoldStatus,
        payoutHoldIsHostActionable,
        settlementStatus: asString(settlement?.status) ?? null,
        payoutExecutionStatus: asString(payoutExecution?.status) ?? null,
        complianceBlocked,
        payoutStatus,
        payoutPaidAt,
        estimatedPayoutDate: payoutStatus === "paid" ? payoutPaidAt : endDate,
        famloRevenueAmount:
          asNumber(platformInvoice?.total_amount) ||
          asNumber(financeContract.famlo_net_revenue) ||
          asNumber(pricingSnapshot.famlo_platform_fee_taxable) ||
          null,
        platformFeeAmount: platformFeeAmount > 0 ? platformFeeAmount : null,
        otaCommissionAmount: otaCommissionAmount && otaCommissionAmount > 0 ? otaCommissionAmount : null,
        refundAdjustmentAmount: refundAdjustmentAmount > 0 ? refundAdjustmentAmount : null,
        creditNoteAmount: creditNoteAmount > 0 ? creditNoteAmount : null,
        taxAmount: taxAmount > 0 ? taxAmount : null,
        externalBookingId: externalBookingId ?? matchedRevision?.externalBookingId ?? null,
        externalRevisionId:
          asString(pricingSnapshot.channel_external_revision_id) ?? matchedRevision?.externalRevisionId ?? null,
        importStatus: isOta ? matchedRevision?.importStatus ?? "preview" : "not_applicable",
        ackStatus: isOta ? matchedRevision?.ackStatus ?? "not_acknowledged" : "not_applicable",
        linkedBookingId: matchedRevision?.linkedBookingId ?? bookingId,
        isOta,
        isReviewOnly: persistedReviewOnly,
        reviewTitle,
        reviewReasonLabels,
        guestEmail: asString(userRecord.email) ?? asString(pricingSnapshot.guest_email) ?? null,
        guestCount: guestCountRaw > 0 ? guestCountRaw : null,
        adultCount: adultCountRaw > 0 ? adultCountRaw : null,
        childCount: childCountRaw > 0 ? childCountRaw : null,
      } satisfies ProBookingSummary];
    })
  const visibleBookingIds = new Set(persistedProBookings.map((booking) => booking.bookingId));
  const visibleExternalBookingIds = new Set(
    persistedProBookings
      .map((booking) => booking.externalBookingId)
      .filter((value): value is string => Boolean(value))
  );
  const revisionBackfilledBookings: ProBookingSummary[] = channelFoundation.bookingRevisions.flatMap((revision) => {
    if (revision.providerCode !== "channex") return [];
    if (revision.linkedBookingId && visibleBookingIds.has(revision.linkedBookingId)) return [];
    if (revision.externalBookingId && visibleExternalBookingIds.has(revision.externalBookingId)) return [];

    const roomId = revision.externalRoomTypeId ? roomIdByExternalRoomTypeId.get(revision.externalRoomTypeId) ?? null : null;
    const roomName = roomId ? roomNameById.get(roomId) ?? "Room" : "Room";
    const reviewReasonLabels = asStringArray(asObject(revision.rawPayload)?.review_conflict_labels);
    const reviewTitle =
      asString(asObject(revision.rawPayload)?.review_title) ??
      (reviewReasonLabels.length > 0 ? "Channex booking needs review" : null);
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
      amount:
        revision.amount != null
          ? formatCalendarAmount(revision.amount, revision.currency ?? "INR")
          : null,
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
      guestEmail: asString(asObject(revision.rawPayload)?.guest_email) ?? null,
      guestCount: null,
      adultCount: null,
      childCount: null,
    } satisfies ProBookingSummary];
  });
  const proBookings: ProBookingSummary[] = [...persistedProBookings, ...revisionBackfilledBookings]
    .sort((left, right) => {
      if (left.isOta !== right.isOta) return left.isOta ? -1 : 1;
      return right.startDate.localeCompare(left.startDate);
    });
  for (const row of bookingRowsForCalendar) {
    const pricingSnapshot =
      row.pricing_snapshot && typeof row.pricing_snapshot === "object" && !Array.isArray(row.pricing_snapshot)
        ? (row.pricing_snapshot as Record<string, unknown>)
        : {};
    const userRecord =
      row.users && typeof row.users === "object" && !Array.isArray(row.users)
        ? (row.users as Record<string, unknown>)
        : {};
    const stayUnitId = asString(row.stay_unit_id) ?? asString(pricingSnapshot.stay_unit_id);
    const startDate = asString(row.start_date);
    const endDate = asString(row.end_date) ?? startDate;
    const status = String(row.status ?? "").trim().toLowerCase();
    const channelProvider = asString(pricingSnapshot.channel_provider);
    const bookingId = asString(row.id);
    const externalBookingId = asString(pricingSnapshot.channel_external_booking_id);
    const matchedRevision =
      (bookingId ? bookingRevisionByLinkedBookingId.get(bookingId) : null) ??
      (externalBookingId ? bookingRevisionByExternalBookingId.get(externalBookingId) : null) ??
      null;
    const isOtaBooking = channelProvider === "channex";
    const guestDisplayName =
      asString(pricingSnapshot.channel_guest_display_name) ??
      asString(pricingSnapshot.channel_guest_name) ??
      asString(pricingSnapshot.guest_name) ??
      asString(pricingSnapshot.guest_display_name) ??
      asString(userRecord.name) ??
      (isOtaBooking ? "OTA Guest" : "Famlo Guest");
    const bookingCurrency = asString(pricingSnapshot.currency) ?? matchedRevision?.currency ?? "INR";
    const totalPrice = asNumber(row.total_price);
    const bookingAmount =
      totalPrice > 0
        ? formatCalendarAmount(totalPrice, bookingCurrency)
        : matchedRevision?.amount != null
          ? formatCalendarAmount(matchedRevision.amount, matchedRevision.currency ?? bookingCurrency)
          : null;

    if (!stayUnitId || !startDate || !endDate) continue;
    if (status === "cancelled" || status === "cancelled_by_user" || status === "cancelled_by_partner" || status === "rejected") {
      continue;
    }

    let cellStatus: CalendarCellStatus = "famlo";
    if (status === "pending" || status === "pending_host_approval" || status === "awaiting_payment") {
      cellStatus = "pending";
    } else if (channelProvider === "channex") {
      cellStatus = "ota";
    }

    const externalRevisionId =
      asString(pricingSnapshot.channel_external_revision_id) ??
      matchedRevision?.externalRevisionId ??
      null;
    const rawPayload =
      matchedRevision?.rawPayload && typeof matchedRevision.rawPayload === "object" && !Array.isArray(matchedRevision.rawPayload)
        ? (matchedRevision.rawPayload as Record<string, unknown>)
        : {};
    const bookingListRevisionId =
      asString(pricingSnapshot.channel_booking_list_revision_id) ??
      asString(rawPayload.booking_list_revision_id) ??
      null;
    const isCrsOnly =
      isOtaBooking &&
      (rawPayload.is_crs_revision === true ||
        rawPayload.booking_list_is_crs_revision === true ||
        (Object.prototype.hasOwnProperty.call(rawPayload, "channel_id") && !asString(rawPayload.channel_id)) ||
        (Object.prototype.hasOwnProperty.call(rawPayload, "booking_list_channel_id") && !asString(rawPayload.booking_list_channel_id)));
    const ackEligible = isOtaBooking && Boolean(externalRevisionId);
    const resolvedLinkedBookingId = isOtaBooking
      ? matchedRevision?.linkedBookingId ?? bookingId ?? null
      : bookingId ?? null;
    const resolvedImportStatus =
      !isOtaBooking
        ? "not_applicable"
        : matchedRevision?.importStatus === "failed"
          ? "failed"
          : resolvedLinkedBookingId || matchedRevision?.importStatus === "imported"
            ? "imported"
            : matchedRevision?.importStatus ?? "preview";
    const bookingDetail: CalendarBookingDetail = {
      bookingId: bookingId ?? "",
      roomName: roomNameById.get(stayUnitId) ?? "Room",
      startDate,
      endDate,
      sourceLabel: isOtaBooking ? "Channex / OTA" : "Famlo Direct",
      externalBookingId: externalBookingId ?? matchedRevision?.externalBookingId ?? null,
      guestDisplayName,
      amount: bookingAmount,
      currency: bookingCurrency,
      paymentStatus: asString(row.payment_status),
      importStatus: resolvedImportStatus,
      ackStatus: isOtaBooking ? matchedRevision?.ackStatus ?? "not_acknowledged" : "not_applicable",
      linkedBookingId: resolvedLinkedBookingId,
      externalRevisionId,
      bookingListRevisionId,
      feedStatus: !isOtaBooking ? "not_applicable" : externalRevisionId ? "found" : "empty",
      isCrsOnly,
      ackEligible,
      importedIntoFamlo: !isOtaBooking || resolvedImportStatus === "imported",
      acknowledged: isOtaBooking ? matchedRevision?.ackStatus === "acknowledged" : false,
      acknowledgementNote:
        isOtaBooking && !externalRevisionId
          ? bookingListRevisionId
            ? "Booking List exposed a revision id, but acknowledgement stays blocked until a real Booking Revision Feed id is stored."
            : "Cannot acknowledge Booking List preview; requires Booking Revision Feed id."
          : null,
    };

    const renderedEndDate =
      isOtaBooking && endDate > startDate
        ? addIndiaDays(endDate, -1)
        : endDate;

    let cursor = startDate;
    while (cursor <= renderedEndDate && cursor <= calendarTo) {
      if (cursor >= calendarFrom) {
        bookingStatusByRoomDate.set(`${stayUnitId}:${cursor}`, cellStatus);
        bookingDetailByRoomDate.set(`${stayUnitId}:${cursor}`, bookingDetail);
      }
      cursor = addIndiaDays(cursor, 1);
    }
  }

  const calendarRows: CalendarRow[] = roomSummaries.map((room) => ({
    roomId: room.id,
    roomName: room.name,
    unitType: room.unitType,
    rate: room.priceFullday,
    availabilityCells: calendarColumns.map((column) => {
      const bookingStatus = bookingStatusByRoomDate.get(`${room.id}:${column.date}`);
      const projectedAvailability = roomProjectedAvailability.get(room.id)?.get(column.date) ?? null;
      const projectedAvailableUnits = projectedAvailability?.availableUnits ?? null;
      const isProjectedUnavailable = projectedAvailableUnits != null && projectedAvailableUnits <= 0;
      const status: CalendarCellStatus =
        column.isPast
          ? "past"
          : bookingStatus ??
            (roomManualBlockDates.get(room.id)?.has(column.date)
              ? "manual_block"
              : isProjectedUnavailable
                ? "unavailable"
                : "available");

      return {
        date: column.date,
        status,
        label:
          status === "famlo"
            ? "Famlo booking"
            : status === "ota"
              ? "OTA booking"
              : status === "manual_block"
                ? "Manual block"
                : status === "pending"
                  ? "Pending approval"
                  : status === "unavailable"
                    ? projectedAvailability?.stopSell
                      ? "Stop sell"
                      : "Unavailable"
                    : status === "past"
                    ? "Past date"
                    : "Available",
        availableUnits:
          status === "famlo" || status === "ota" || status === "manual_block" || status === "pending" || status === "unavailable"
            ? 0
            : status === "past"
              ? null
              : projectedAvailableUnits ?? 1,
        bookingDetail: bookingDetailByRoomDate.get(`${room.id}:${column.date}`) ?? null,
      };
    }),
    rateCells: calendarColumns.map((column) => {
      const overrideAmount = roomDailyRateOverrides.get(room.id)?.get(column.date) ?? null;
      const projectedAmount = roomProjectedRates.get(room.id)?.get(column.date) ?? null;
      const displayAmount =
        overrideAmount ??
        projectedAmount ??
        (room.priceFullday > 0 ? room.priceFullday : null) ??
        null;
      return {
        date: column.date,
        displayValue:
          column.isPast
            ? "Past"
            : displayAmount != null && displayAmount > 0
              ? (formatCalendarAmount(displayAmount, "INR") ?? "Missing")
              : "Missing",
        amount: displayAmount,
        baseAmount: room.priceFullday,
        isPast: column.isPast,
        isOverridden: overrideAmount != null || (projectedAmount != null && projectedAmount !== room.priceFullday),
      } satisfies CalendarRateCell;
    }),
  }));

  const bookingComVerificationTarget =
    proBookings.find(
      (booking) =>
        booking.isOta &&
        booking.startDate === "2026-06-10" &&
        booking.endDate === "2026-06-11"
    ) ?? null;
  const juneVerificationWindowStart = bookingComVerificationTarget ? "2026-06-01" : null;
  const calendarWindow: CalendarWindowSummary = {
    startDate: calendarFrom,
    endDate: calendarTo,
    isCustomRange: Boolean(requestedCalendarStart),
    verificationUrl: juneVerificationWindowStart
      ? `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(familyId)}&section=inventory-calendar&calendarStart=${encodeURIComponent(juneVerificationWindowStart)}`
      : null,
    verificationTargetLabel: bookingComVerificationTarget
      ? `${bookingComVerificationTarget.startDate} → ${bookingComVerificationTarget.endDate}`
      : null,
  };
  const computedCalendarVerification: CalendarVerificationSummary | null =
    bookingComVerificationTarget &&
    bookingComVerificationTarget.roomId &&
    calendarDates.includes(bookingComVerificationTarget.startDate) &&
    calendarDates.includes(bookingComVerificationTarget.endDate)
      ? {
          targetDate: bookingComVerificationTarget.startDate,
          checkoutDate: bookingComVerificationTarget.endDate,
          roomName: bookingComVerificationTarget.roomName,
          sourceLabel: bookingComVerificationTarget.sourceLabel,
          targetDateBlocked:
            bookingStatusByRoomDate.get(`${bookingComVerificationTarget.roomId}:${bookingComVerificationTarget.startDate}`) === "ota",
          checkoutDateBlocked: Boolean(
            bookingStatusByRoomDate.get(`${bookingComVerificationTarget.roomId}:${bookingComVerificationTarget.endDate}`)
          ),
        }
      : null;
  const dedupedCalendarErrorSources = Array.from(new Set(calendarWorkspaceErrors.map((entry) => entry.source)));
  const calendarWorkspaceStatus: CalendarWorkspaceStatus = {
    selectedFamilyLoaded: Boolean(familyId),
    selectedPropertyLoaded: propertyOptions.some((option) => option.familyId === familyId),
    roomsLoaded: true,
    bookingsLoaded,
    blockedDatesLoaded,
    channelMappingsLoaded: true,
    errorMessage: calendarWorkspaceErrors[0]?.message ?? null,
    errorSources: dedupedCalendarErrorSources,
  };
  const dashboardLoadMetrics: ProDashboardLoadMetrics = {
    familyId,
    initialSection,
    generatedAt: new Date().toISOString(),
    serverRenderMs: Date.now() - renderStartedAt,
    mediaLoadMs: mediaLoadDurationMs,
    calendarProjectionMs: calendarProjectionDurationMs,
    snapshotOnly:
      initialSection === "dashboard" &&
      !preloadCalendarWorkspace &&
      !needsChannelSyncHistory &&
      !needsChannelSyncJobs &&
      !needsBookingRevisions,
    preloadBookingWorkspace,
    preloadCalendarWorkspace,
    counts: {
      rooms: roomSummaries.length,
      bookings: proBookings.length,
      calendarRows: calendarRows.length,
      syncLogs: channelFoundation.syncLogs.length,
      syncJobs: channelFoundation.syncJobs.length,
      bookingRevisions: channelFoundation.bookingRevisions.length,
    },
  };

  if (process.env.NODE_ENV !== "production" && isInventoryCalendarSection) {
    console.info("[famlo-pro-calendar-render]", {
      familyId,
      selectedRoomId: roomRouteState?.roomId ?? null,
      totalRenderMs: Date.now() - renderStartedAt,
      calendarProjectionMs: calendarProjectionDurationMs,
      mediaLoadMs: mediaLoadDurationMs,
      roomCount: roomSummaries.length,
      dateCount: calendarColumns.length,
      projectedCellCount: calendarRows.reduce((sum, row) => sum + row.availabilityCells.length + row.rateCells.length, 0),
      mediaSkipped: propertyMedia.debug.gallerySource === "none" && propertyMedia.debug.reelSource === "none",
    });
  }

  return (
    <FamloProDashboardShell
      embeddedAppView={embeddedAppView}
      roomRouteState={roomRouteState}
      isAdminView={isAdminView}
      hostUserId={hostSession?.hostUserId ?? null}
      propertyName={propertyName}
      propertyLocalityLabel={propertyLocalityLabel}
      propertyHomeLat={typeof family?.lat === "number" ? family.lat : null}
      propertyHomeLng={typeof family?.lng === "number" ? family.lng : null}
      hostCode={hostCode}
      locationLabel={locationLabel}
      famloPlusStatus={access.status}
      entitlementLabel={
        access.status === "grace"
          ? `Famlo Pro grace till ${formatLongDateLabel(access.grace_until)}`
          : `Famlo Pro active till ${formatLongDateLabel(access.current_period_end)}`
      }
      accessReason={formatAccessReason(access.reason)}
      initialSection={initialSection}
      rooms={roomSummaries}
      metrics={metrics}
      setupItems={setupItems}
      feedItems={feedItems}
      basicRoomUrl={basicRoomUrl}
      familyId={familyId}
      propertyOptions={propertyOptions}
      initialProfile={initialProfile}
      initialPropertyContent={propertyContent}
      initialSchedule={initialSchedule}
      initialCompliance={initialCompliance}
      propertyPhotos={propertyPhotos}
      initialSettings={proSettings}
      channelFoundation={channelFoundation}
      channexConfig={channexConfig}
      globalCommission={globalCommission}
      proBookings={proBookings}
      hostRevenueCompliance={hostRevenueCompliance}
      calendarColumns={calendarColumns}
      calendarRows={calendarRows}
      calendarWindow={calendarWindow}
      calendarSync={calendarSync}
      calendarWorkspaceStatus={calendarWorkspaceStatus}
      calendarVerification={computedCalendarVerification}
      dashboardLoadMetrics={dashboardLoadMetrics}
    />
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f8fafc",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 20px",
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: "720px",
  background: "white",
  borderRadius: "24px",
  padding: "32px",
  border: "1px solid rgba(14,43,87,0.08)",
  boxShadow: "0 20px 48px rgba(15, 23, 42, 0.06)",
  display: "grid",
  gap: "16px",
};

const eyebrowStyle: CSSProperties = {
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#165dcc",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "36px",
  lineHeight: 1.05,
  fontWeight: 900,
  color: "#0e2b57",
};

const copyStyle: CSSProperties = {
  margin: 0,
  color: "rgba(14,43,87,0.72)",
  lineHeight: 1.8,
  fontSize: "16px",
  fontWeight: 600,
};

const statusBoxStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  padding: "18px",
  borderRadius: "18px",
  background: "#f8fafc",
  border: "1px solid rgba(14,43,87,0.06)",
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  marginTop: "8px",
};

const primaryLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "14px 20px",
  borderRadius: "14px",
  background: "#165dcc",
  color: "white",
  fontWeight: 800,
  textDecoration: "none",
};

const secondaryLinkStyle: CSSProperties = {
  ...primaryLinkStyle,
  background: "#e0ebff",
  color: "#0e2b57",
};
