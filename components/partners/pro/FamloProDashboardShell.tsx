"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import {
  Activity,
  ArrowRightLeft,
  BadgeIndianRupee,
  BellRing,
  BookCheck,
  Building2,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileBarChart2,
  Flag,
  Hotel,
  Layers3,
  Link2,
  Lock,
  MessageSquareMore,
  RefreshCcw,
  Settings2,
  ShieldAlert,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";

import HostRoomsManager from "@/components/partners/rooms/HostRoomsManager";
import {
  PRO_PROPERTY_MODEL_OPTIONS,
  PRO_PROPERTY_TYPE_OPTIONS,
  propertyModelLabel,
  propertyTypeLabel,
  type HostProSettings,
} from "@/lib/host-pro-settings";
import { type HostProChannelFoundation } from "@/lib/host-pro-channel-foundation";
import {
  formatChannexEnvironmentLabel,
  type ChannexConfigSummary as ChannexSummary,
} from "@/lib/channel-providers/channex/client";
import styles from "./pro-dashboard.module.css";

type ProSectionId =
  | "dashboard"
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

type RoomSummary = {
  id: string;
  name: string;
  unitType: string;
  description: string | null;
  maxGuests: number;
  bedInfo: string | null;
  bathroomType: string | null;
  priceFullday: number;
  isActive: boolean;
  amenitiesCount: number;
  photosCount: number;
};

type CalendarColumn = {
  date: string;
  dayLabel: string;
  dateLabel: string;
  isPast: boolean;
};

type CalendarCell = {
  date: string;
  status: "available" | "famlo" | "ota" | "manual_block" | "pending" | "past";
  label: string;
  bookingDetail: CalendarBookingDetail | null;
};

type CalendarRow = {
  roomId: string;
  roomName: string;
  unitType: string;
  rate: number;
  availabilityCells: CalendarCell[];
  rateCells: string[];
};

type ProBookingSummary = {
  bookingId: string;
  roomId: string | null;
  roomName: string;
  startDate: string;
  endDate: string;
  createdAt: string | null;
  guestDisplayName: string;
  status: string;
  paymentStatus: string | null;
  amount: string | null;
  sourceLabel: string;
  externalBookingId: string | null;
  externalRevisionId: string | null;
  importStatus: string | null;
  ackStatus: string | null;
  linkedBookingId: string | null;
  isOta: boolean;
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

type SetupItem = {
  key: string;
  title: string;
  complete: boolean;
  hint: string;
  valueLabel?: string | null;
};

type FeedItem = {
  title: string;
  body: string;
  tone: "info" | "warning" | "success";
};

type ActionItem = {
  title: string;
  body: string;
  badge: string;
};

type DashboardMetric = {
  label: string;
  value: string;
  hint: string;
};

type SyncLogGroup = {
  key: string;
  title: string;
  actions: string[];
};

type ConflictItem = {
  key: string;
  title: string;
  summary: string;
  recommendedAction: string;
  severity: "info" | "warning" | "critical";
  relatedLabel?: string | null;
  lastDetectedAt?: string | null;
};

type AriHealthStatus = "healthy" | "warning" | "failed" | "never_synced";

type AriHealthSnapshot = {
  status: AriHealthStatus;
  statusLabel: string;
  recommendation: string | null;
  lastAriSyncAt: string | null;
  lastSuccessfulAriSyncAt: string | null;
  lastAriSyncError: string | null;
  consecutiveAriFailures: number;
  syncedDateRange: { from: string; to: string; windowDays: number } | null;
  channelAttached: boolean;
  channelActive: boolean;
  lastSuccessful30DaySync: {
    createdAt: string | null;
    message: string | null;
  } | null;
  lastSuccessful365DaySync: {
    createdAt: string | null;
    message: string | null;
  } | null;
  lastProblemSync: {
    action: string;
    status: string;
    createdAt: string | null;
    message: string | null;
  } | null;
};

type ChannelAriHealthSnapshot = {
  lastAriSyncAt: string | null;
  lastSuccessfulAriSyncAt: string | null;
  lastAriSyncError: string | null;
  lastAriSyncErrorAt: string | null;
  consecutiveAriFailures: number;
  syncedDateRange: { from: string; to: string; windowDays: number } | null;
  verifiedAvailabilityCount: number;
  verifiedRateCount: number;
  verifiedMinStayThroughCount: number;
  availabilityMismatchCount: number;
  rateMismatchCount: number;
  lastAriSyncAction: string | null;
  lastAriSyncStatus: "synced" | "sync_failed" | "sync_overdue" | "channel_disconnected" | "not_started";
  lastAriSyncMessage: string | null;
  channelAttached: boolean;
  channelActive: boolean;
  accChannelsCount: number | null;
  activeChannelId: string | null;
  activeChannelTitle: string | null;
  hotelId: string | null;
};

type ChannelFeedHealthSnapshot = {
  lastPollAt: string | null;
  lastSuccessfulPollAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  channelAttached: boolean;
  channelActive: boolean;
  accChannelsCount: number | null;
  activeChannelId: string | null;
  activeChannelTitle: string | null;
  hotelId: string | null;
  unackedRevisionsCount: number;
  failedImportCount: number;
  pendingApplyCount: number;
  consecutiveFailures: number;
  autoAppliedCount: number;
  autoImportedCount: number;
  autoCancelledCount: number;
  pendingManualReviewCount: number;
  failedAutoApplyCount: number;
  acknowledgedCount: number;
  lastAutoApplyAt: string | null;
  lastAutoApplyState: "synced" | "needs_review" | "failed_import" | "failed_cancellation_apply" | "waiting_for_manual_review";
  lastAutoApplyMessage: string | null;
};

type GoLiveChecklistStatus = "ready" | "needs_action" | "blocked";

type GoLiveChecklistItem = {
  key: string;
  title: string;
  status: GoLiveChecklistStatus;
  statusLabel: string;
  explanation: string;
  recommendedAction: string;
  targetSection: ProSectionId;
};

type PropertySwitcherOption = {
  familyId: string;
  name: string;
  city: string | null;
  state: string | null;
  locality: string | null;
  famloPlusStatus: string | null;
  isActive: boolean;
};

interface FamloProDashboardShellProps {
  familyId: string;
  propertyOptions: PropertySwitcherOption[];
  propertyName: string;
  propertyLocalityLabel: string | null;
  propertyHomeLat?: number | null;
  propertyHomeLng?: number | null;
  hostCode: string | null;
  locationLabel: string;
  famloPlusStatus: string;
  entitlementLabel: string;
  accessReason: string;
  initialSection: ProSectionId;
  rooms: RoomSummary[];
  metrics: DashboardMetric[];
  setupItems: SetupItem[];
  actionItems: ActionItem[];
  feedItems: FeedItem[];
  basicDashboardUrl: string;
  basicRoomUrl: string;
  initialSettings: HostProSettings;
  channelFoundation: HostProChannelFoundation;
  channexConfig: ChannexSummary;
  proBookings: ProBookingSummary[];
  calendarColumns: CalendarColumn[];
  calendarRows: CalendarRow[];
  calendarWindow: {
    startDate: string;
    endDate: string;
    isCustomRange: boolean;
    verificationUrl: string | null;
    verificationTargetLabel: string | null;
  };
  calendarVerification: {
    targetDate: string;
    checkoutDate: string;
    roomName: string;
    sourceLabel: string;
    targetDateBlocked: boolean;
    checkoutDateBlocked: boolean;
  } | null;
}

type NavItem = {
  id: ProTopLevelId;
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
};

type PropertyTabItem = {
  id: ProSectionId;
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
};

type ProTopLevelId =
  | "dashboard"
  | "properties"
  | "bookings"
  | "calendar"
  | "messages"
  | "revenue"
  | "reports"
  | "support"
  | "settings";

type PropertyCenterTabId =
  | "overview"
  | "rooms"
  | "content"
  | "pricing"
  | "channels"
  | "sync-health"
  | "advanced";

const TOP_LEVEL_NAV_ITEMS: NavItem[] = [
  { id: "dashboard", title: "Dashboard", hint: "Action center", icon: Activity },
  { id: "properties", title: "Properties", hint: "Rooms, channels, and content", icon: Building2 },
  { id: "bookings", title: "Bookings", hint: "Reservations and OTA flow", icon: BookCheck },
  { id: "calendar", title: "Calendar", hint: "Availability and stays", icon: CalendarDays },
  { id: "messages", title: "Messages", hint: "Guest conversations", icon: MessageSquareMore },
  { id: "revenue", title: "Revenue", hint: "Performance snapshot", icon: WalletCards },
  { id: "reports", title: "Reports", hint: "Exports and summaries", icon: FileBarChart2 },
  { id: "support", title: "Support", hint: "Pilot help", icon: BellRing },
  { id: "settings", title: "Settings", hint: "Workspace controls", icon: Settings2 },
];

const PROPERTY_TABS: Array<{
  id: PropertyCenterTabId;
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultSection: ProSectionId;
  sections: ProSectionId[];
}> = [
  { id: "overview", title: "Overview", hint: "Identity, setup, and arrival basics", icon: Building2, defaultSection: "property", sections: ["property", "setup-guide"] },
  { id: "rooms", title: "Rooms", hint: "Inventory and unit structure", icon: Hotel, defaultSection: "rooms-units", sections: ["rooms-units"] },
  { id: "content", title: "Content & Photos", hint: "Story, gallery, and OTA content", icon: ClipboardList, defaultSection: "ota-content", sections: ["ota-content"] },
  { id: "pricing", title: "Pricing & Rules", hint: "Rates, stay rules, and check times", icon: BadgeIndianRupee, defaultSection: "rates-restrictions", sections: ["rates-restrictions", "availability-rules", "check-times"] },
  { id: "channels", title: "Channels", hint: "Distribution connections", icon: Link2, defaultSection: "connected-channels", sections: ["connected-channels"] },
  { id: "sync-health", title: "Sync Health", hint: "Conflicts and polling health", icon: ShieldAlert, defaultSection: "conflicts", sections: ["conflicts"] },
  { id: "advanced", title: "Advanced", hint: "Mappings and logs", icon: Layers3, defaultSection: "room-mapping", sections: ["room-mapping", "rate-mapping", "sync-logs"] },
];

const PROPERTY_TAB_BY_SECTION = new Map<ProSectionId, PropertyCenterTabId>(
  PROPERTY_TABS.flatMap((tab) => tab.sections.map((section) => [section, tab.id] as const))
);

const TOP_LEVEL_BY_SECTION = new Map<ProSectionId, ProTopLevelId>([
  ["dashboard", "dashboard"],
  ["setup-guide", "properties"],
  ["rooms-units", "properties"],
  ["rates-restrictions", "properties"],
  ["availability-rules", "properties"],
  ["check-times", "properties"],
  ["connected-channels", "properties"],
  ["room-mapping", "properties"],
  ["rate-mapping", "properties"],
  ["sync-logs", "properties"],
  ["conflicts", "properties"],
  ["property", "properties"],
  ["ota-content", "properties"],
  ["bookings", "bookings"],
  ["inventory-calendar", "calendar"],
  ["messages-reviews", "messages"],
  ["revenue", "revenue"],
  ["reports", "reports"],
  ["support", "support"],
  ["settings", "settings"],
  ["team-groups", "settings"],
]);

const PROPERTY_TAB_SECTION_LINKS: Record<PropertyCenterTabId, PropertyTabItem[]> = {
  overview: [
    { id: "property", title: "Property overview", hint: "Identity, location, and setup copy", icon: Building2 },
    { id: "setup-guide", title: "Setup guide", hint: "Go-live readiness checklist", icon: ClipboardList },
  ],
  rooms: [
    { id: "rooms-units", title: "Rooms", hint: "Current room inventory", icon: Hotel },
  ],
  content: [
    { id: "ota-content", title: "Content & Photos", hint: "Story, gallery, and channel-ready content", icon: ClipboardList },
  ],
  pricing: [
    { id: "rates-restrictions", title: "Pricing", hint: "Base pricing shell", icon: BadgeIndianRupee },
    { id: "availability-rules", title: "Stay rules", hint: "Minimum and maximum stay controls", icon: Flag },
    { id: "check-times", title: "Check-in / Check-out", hint: "Arrival and departure windows", icon: Clock3 },
  ],
  channels: [
    { id: "connected-channels", title: "Channels", hint: "Channel status and provider links", icon: Link2 },
  ],
  "sync-health": [
    { id: "conflicts", title: "Sync Health", hint: "Needs-attention queue", icon: ShieldAlert },
  ],
  advanced: [
    { id: "room-mapping", title: "Advanced room mapping", hint: "Map Famlo rooms to provider rooms", icon: Layers3 },
    { id: "rate-mapping", title: "Advanced rate mapping", hint: "Map Famlo pricing to provider plans", icon: ArrowRightLeft },
    { id: "sync-logs", title: "Advanced sync logs", hint: "Operational audit history", icon: RefreshCcw },
  ],
};

function resolveTopLevelSection(section: ProSectionId): ProTopLevelId {
  return TOP_LEVEL_BY_SECTION.get(section) ?? "dashboard";
}

function resolvePropertyTab(section: ProSectionId): PropertyCenterTabId {
  return PROPERTY_TAB_BY_SECTION.get(section) ?? "overview";
}

function isPropertyCenterSection(section: ProSectionId): boolean {
  return resolveTopLevelSection(section) === "properties";
}

function isPropertyTabActive(tabId: PropertyCenterTabId, section: ProSectionId): boolean {
  return resolvePropertyTab(section) === tabId;
}

function resolveTopLevelDefaultSection(target: ProTopLevelId, currentSection: ProSectionId): ProSectionId {
  if (target === "dashboard") return "dashboard";
  if (target === "properties") {
    return isPropertyCenterSection(currentSection) ? currentSection : "property";
  }
  if (target === "bookings") return "bookings";
  if (target === "calendar") return "inventory-calendar";
  if (target === "messages") return "messages-reviews";
  if (target === "revenue") return "revenue";
  if (target === "reports") return "reports";
  if (target === "support") return "support";
  return currentSection === "team-groups" ? "team-groups" : "settings";
}

function propertyCenterStatusLabel(tabId: PropertyCenterTabId, activeSection: ProSectionId): string {
  const links = PROPERTY_TAB_SECTION_LINKS[tabId];
  if (links.length <= 1) return "Focused view";
  const current = links.find((link) => link.id === activeSection);
  return current ? `Current view: ${current.title}` : `${links.length} tools`;
}

function formatPropertySwitcherStatusLabel(value: string | null): string {
  if (!value) return "Status pending";
  if (value === "active") return "Famlo Pro active";
  if (value === "grace") return "Famlo Pro grace";
  if (value === "expired") return "Famlo Pro expired";
  if (value === "cancelled") return "Famlo Pro cancelled";
  return `Famlo Pro ${value}`;
}

const CHANNEL_CARDS = [
  "Airbnb",
  "Booking.com",
  "Agoda",
  "Expedia",
  "MakeMyTrip / Goibibo",
  "VRBO",
  "Google Hotel",
];

const BOOKING_FILTERS = ["All", "Famlo Direct", "Airbnb", "Booking.com", "Agoda", "Expedia", "Cancelled", "Modified", "Unmapped"];
const MEAL_PLAN_OPTIONS = [
  { value: "room_only", label: "Room Only" },
  { value: "breakfast", label: "Breakfast" },
  { value: "half_board", label: "Half Board" },
  { value: "full_board", label: "Full Board" },
];

const ROLE_CARDS = [
  { title: "Owner", copy: "Full control over go-live settings, channel strategy, and operational approvals." },
  { title: "Manager", copy: "Daily operational oversight for inventory, channel checks, and reporting reviews." },
  { title: "Booking Staff", copy: "Placeholder role for reservation handling, guest coordination, and mapping checks." },
  { title: "Accountant", copy: "Placeholder role for payout review, reconciliation, and revenue tracking." },
];

const CALENDAR_LEGEND = [
  { title: "Blue", copy: "Famlo booking" },
  { title: "Purple", copy: "OTA booking" },
  { title: "Red", copy: "Manual block" },
  { title: "Yellow", copy: "Pending approval" },
  { title: "Grey", copy: "Past date" },
];

const SYNC_LOG_GROUPS: SyncLogGroup[] = [
  { key: "property", title: "Property creation", actions: ["create_property", "connection_check", "verify_channex_structure"] },
  { key: "room", title: "Room creation", actions: ["create_room_type"] },
  { key: "rate", title: "Rate creation", actions: ["create_rate_plan"] },
  { key: "ari", title: "ARI push", actions: ["push_ari_30_day", "push_ari_365_day"] },
  { key: "booking-feed", title: "Booking feed / list", actions: ["fetch_booking_feed", "poll_booking_feed_cron", "store_booking_feed_preview", "verify_booking_list", "verify_booking_revision_visibility"] },
  { key: "booking-import", title: "Booking import", actions: ["import_booking_preview", "apply_booking_modification"] },
  { key: "ack", title: "Acknowledgement", actions: ["acknowledge_booking_revision"] },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string | null): string {
  if (!value) return "Not synced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not synced";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatRelativeAge(value: string | null, referenceNow: number): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  const diffMs = referenceNow - date.getTime();
  if (diffMs < 0) return "Just now";
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return "Less than 1 hour ago";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function isStaleByHours(value: string | null, referenceNow: number, hours: number): boolean {
  if (!value) return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return true;
  return referenceNow - date.getTime() > hours * 60 * 60 * 1000;
}

function labelizeToken(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  return value.replaceAll("_", " ");
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toneBadgeClass(tone: FeedItem["tone"]): string {
  return tone === "success" ? styles.badge : tone === "warning" ? `${styles.badge} ${styles.badgeMuted}` : styles.badge;
}

function checklistStatusClass(status: GoLiveChecklistStatus): string {
  if (status === "ready") return `${styles.readinessPill} ${styles.readinessPillOk}`;
  if (status === "blocked") return `${styles.readinessPill} ${styles.readinessPillMissing}`;
  return `${styles.readinessPill} ${styles.readinessPillReview}`;
}

function checklistStatusLabel(status: GoLiveChecklistStatus): string {
  if (status === "ready") return "Ready";
  if (status === "blocked") return "Blocked";
  return "Needs action";
}

function roomReadinessChecklist(room: RoomSummary): Array<{ label: string; complete: boolean }> {
  return [
    { label: "Name", complete: room.name.trim().length > 0 },
    { label: "Max guests", complete: room.maxGuests > 0 },
    { label: "Base price", complete: room.priceFullday > 0 },
    { label: "Bathroom type", complete: Boolean(room.bathroomType) },
    { label: "Bed info", complete: Boolean(room.bedInfo) },
    { label: "Photos", complete: room.photosCount > 0 },
    { label: "Active", complete: room.isActive },
  ];
}

function contentStatusLabel(complete: number, total: number): string {
  if (complete === 0) return "Missing";
  if (complete === total) return "Complete";
  return "Needs review";
}

function contentStatusClass(complete: number, total: number): string {
  if (complete === 0) return styles.readinessPillMissing;
  if (complete === total) return styles.readinessPillOk;
  return styles.readinessPillReview;
}

function calendarCellClass(status: CalendarCell["status"]): string {
  if (status === "famlo") return styles.calendarCellFamlo;
  if (status === "ota") return styles.calendarCellOta;
  if (status === "manual_block") return styles.calendarCellManual;
  if (status === "pending") return styles.calendarCellPending;
  if (status === "past") return styles.calendarCellPast;
  return styles.calendarCellAvailable;
}

function formatCalendarDetailDateRange(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T12:00:00+05:30`);
  const end = new Date(`${endDate}T12:00:00+05:30`);
  const formatter = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${formatter.format(start)} → ${formatter.format(end)}`;
}

function summarizeSafePayload(payload: Record<string, unknown>): string[] {
  const hiddenKeys = new Set(["token", "api_key", "authorization", "raw_payload", "secret"]);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(payload)) {
    if (lines.length >= 4) break;
    if (hiddenKeys.has(key)) continue;
    if (typeof value === "string" && value.trim().length > 0) {
      lines.push(`${labelizeToken(key, key)}: ${value}`);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      lines.push(`${labelizeToken(key, key)}: ${String(value)}`);
      continue;
    }
    if (Array.isArray(value) && value.length > 0) {
      lines.push(`${labelizeToken(key, key)}: ${value.length} item${value.length === 1 ? "" : "s"}`);
      continue;
    }
  }

  return lines;
}

function computeAriHealthSnapshot(
  syncLogs: HostProChannelFoundation["syncLogs"],
  referenceNow: number,
  metadataHealth: ChannelAriHealthSnapshot | null
): AriHealthSnapshot {
  const ariLogs = syncLogs.filter((log) => log.action === "push_ari_30_day" || log.action === "push_ari_365_day");
  const lastSuccessful30DaySync =
    ariLogs.find((log) => log.action === "push_ari_30_day" && log.status === "success")
      ? {
          createdAt: ariLogs.find((log) => log.action === "push_ari_30_day" && log.status === "success")?.createdAt ?? null,
          message: ariLogs.find((log) => log.action === "push_ari_30_day" && log.status === "success")?.message ?? null,
        }
      : null;
  const lastSuccessful365DaySync =
    ariLogs.find((log) => log.action === "push_ari_365_day" && log.status === "success")
      ? {
          createdAt: ariLogs.find((log) => log.action === "push_ari_365_day" && log.status === "success")?.createdAt ?? null,
          message: ariLogs.find((log) => log.action === "push_ari_365_day" && log.status === "success")?.message ?? null,
        }
      : null;
  const lastProblemSync =
    ariLogs.find((log) => log.status === "failed" || log.status === "warning")
      ? {
          action: ariLogs.find((log) => log.status === "failed" || log.status === "warning")?.action ?? "push_ari_30_day",
          status: ariLogs.find((log) => log.status === "failed" || log.status === "warning")?.status ?? "warning",
          createdAt: ariLogs.find((log) => log.status === "failed" || log.status === "warning")?.createdAt ?? null,
          message: ariLogs.find((log) => log.status === "failed" || log.status === "warning")?.message ?? null,
        }
      : null;

  if (metadataHealth?.lastAriSyncStatus === "channel_disconnected") {
    return {
      status: "failed",
      statusLabel: "Channel disconnected",
      recommendation: "Reconnect or reactivate the Channex channel before relying on daily ARI sync.",
      lastAriSyncAt: metadataHealth.lastAriSyncAt,
      lastSuccessfulAriSyncAt: metadataHealth.lastSuccessfulAriSyncAt,
      lastAriSyncError: metadataHealth.lastAriSyncError,
      consecutiveAriFailures: metadataHealth.consecutiveAriFailures,
      syncedDateRange: metadataHealth.syncedDateRange,
      channelAttached: metadataHealth.channelAttached,
      channelActive: metadataHealth.channelActive,
      lastSuccessful30DaySync,
      lastSuccessful365DaySync,
      lastProblemSync,
    };
  }

  if (
    metadataHealth?.lastSuccessfulAriSyncAt &&
    isStaleByHours(metadataHealth.lastSuccessfulAriSyncAt, referenceNow, 26)
  ) {
    return {
      status: "warning",
      statusLabel: "Sync overdue",
      recommendation: "Run Sync now or let the daily ARI cron catch up before relying on channel inventory.",
      lastAriSyncAt: metadataHealth.lastAriSyncAt,
      lastSuccessfulAriSyncAt: metadataHealth.lastSuccessfulAriSyncAt,
      lastAriSyncError: metadataHealth.lastAriSyncError,
      consecutiveAriFailures: metadataHealth.consecutiveAriFailures,
      syncedDateRange: metadataHealth.syncedDateRange,
      channelAttached: metadataHealth.channelAttached,
      channelActive: metadataHealth.channelActive,
      lastSuccessful30DaySync,
      lastSuccessful365DaySync,
      lastProblemSync,
    };
  }

  if (metadataHealth?.lastAriSyncStatus === "sync_failed") {
    return {
      status: "failed",
      statusLabel: "Sync failed",
      recommendation: metadataHealth.lastAriSyncError ?? "Review the last ARI sync failure and rerun after the issue is cleared.",
      lastAriSyncAt: metadataHealth.lastAriSyncAt,
      lastSuccessfulAriSyncAt: metadataHealth.lastSuccessfulAriSyncAt,
      lastAriSyncError: metadataHealth.lastAriSyncError,
      consecutiveAriFailures: metadataHealth.consecutiveAriFailures,
      syncedDateRange: metadataHealth.syncedDateRange,
      channelAttached: metadataHealth.channelAttached,
      channelActive: metadataHealth.channelActive,
      lastSuccessful30DaySync,
      lastSuccessful365DaySync,
      lastProblemSync,
    };
  }

  if (metadataHealth?.lastAriSyncStatus === "synced") {
    return {
      status: "healthy",
      statusLabel: "Synced",
      recommendation: null,
      lastAriSyncAt: metadataHealth.lastAriSyncAt,
      lastSuccessfulAriSyncAt: metadataHealth.lastSuccessfulAriSyncAt,
      lastAriSyncError: metadataHealth.lastAriSyncError,
      consecutiveAriFailures: metadataHealth.consecutiveAriFailures,
      syncedDateRange: metadataHealth.syncedDateRange,
      channelAttached: metadataHealth.channelAttached,
      channelActive: metadataHealth.channelActive,
      lastSuccessful30DaySync,
      lastSuccessful365DaySync,
      lastProblemSync,
    };
  }

  if (!lastSuccessful30DaySync && !lastSuccessful365DaySync && !lastProblemSync) {
    return {
      status: "never_synced",
      statusLabel: "Never synced",
      recommendation: "Run 365-day sync before connecting live channels.",
      lastAriSyncAt: metadataHealth?.lastAriSyncAt ?? null,
      lastSuccessfulAriSyncAt: metadataHealth?.lastSuccessfulAriSyncAt ?? null,
      lastAriSyncError: metadataHealth?.lastAriSyncError ?? null,
      consecutiveAriFailures: metadataHealth?.consecutiveAriFailures ?? 0,
      syncedDateRange: metadataHealth?.syncedDateRange ?? null,
      channelAttached: metadataHealth?.channelAttached ?? false,
      channelActive: metadataHealth?.channelActive ?? false,
      lastSuccessful30DaySync: null,
      lastSuccessful365DaySync: null,
      lastProblemSync: null,
    };
  }

  if (lastProblemSync && (!lastSuccessful365DaySync || (lastProblemSync.createdAt ?? "") >= (lastSuccessful365DaySync.createdAt ?? ""))) {
    return {
      status: lastProblemSync.status === "failed" ? "failed" : "warning",
      statusLabel: lastProblemSync.status === "failed" ? "Failed" : "Warning",
      recommendation:
        !lastSuccessful365DaySync || isStaleByHours(lastSuccessful365DaySync.createdAt, referenceNow, 24)
          ? "Run 365-day sync before connecting live channels."
          : "Review the latest sync warning before connecting live channels.",
      lastAriSyncAt: metadataHealth?.lastAriSyncAt ?? null,
      lastSuccessfulAriSyncAt: metadataHealth?.lastSuccessfulAriSyncAt ?? null,
      lastAriSyncError: metadataHealth?.lastAriSyncError ?? null,
      consecutiveAriFailures: metadataHealth?.consecutiveAriFailures ?? 0,
      syncedDateRange: metadataHealth?.syncedDateRange ?? null,
      channelAttached: metadataHealth?.channelAttached ?? false,
      channelActive: metadataHealth?.channelActive ?? false,
      lastSuccessful30DaySync,
      lastSuccessful365DaySync,
      lastProblemSync,
    };
  }

  if (!lastSuccessful365DaySync || isStaleByHours(lastSuccessful365DaySync.createdAt, referenceNow, 24)) {
    return {
      status: "warning",
      statusLabel: "Warning",
      recommendation: "Run 365-day sync before connecting live channels.",
      lastAriSyncAt: metadataHealth?.lastAriSyncAt ?? null,
      lastSuccessfulAriSyncAt: metadataHealth?.lastSuccessfulAriSyncAt ?? null,
      lastAriSyncError: metadataHealth?.lastAriSyncError ?? null,
      consecutiveAriFailures: metadataHealth?.consecutiveAriFailures ?? 0,
      syncedDateRange: metadataHealth?.syncedDateRange ?? null,
      channelAttached: metadataHealth?.channelAttached ?? false,
      channelActive: metadataHealth?.channelActive ?? false,
      lastSuccessful30DaySync,
      lastSuccessful365DaySync,
      lastProblemSync,
    };
  }

  return {
    status: "healthy",
    statusLabel: "Healthy",
    recommendation: null,
    lastAriSyncAt: metadataHealth?.lastAriSyncAt ?? null,
    lastSuccessfulAriSyncAt: metadataHealth?.lastSuccessfulAriSyncAt ?? null,
    lastAriSyncError: metadataHealth?.lastAriSyncError ?? null,
    consecutiveAriFailures: metadataHealth?.consecutiveAriFailures ?? 0,
    syncedDateRange: metadataHealth?.syncedDateRange ?? null,
    channelAttached: metadataHealth?.channelAttached ?? false,
    channelActive: metadataHealth?.channelActive ?? false,
    lastSuccessful30DaySync,
    lastSuccessful365DaySync,
    lastProblemSync,
  };
}

function joinMissingLabels(items: Array<{ label: string; ready: boolean }>): string {
  const missing = items.filter((item) => !item.ready).map((item) => item.label);
  return missing.length > 0 ? missing.join(", ") : "Nothing missing";
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readChannelFeedHealth(metadata: Record<string, unknown> | null): ChannelFeedHealthSnapshot | null {
  const health = asObject(metadata?.channexFeedHealth);
  if (!health) return null;

  return {
    lastPollAt: asStringOrNull(health.lastPollAt),
    lastSuccessfulPollAt: asStringOrNull(health.lastSuccessfulPollAt),
    lastError: asStringOrNull(health.lastError),
    lastErrorAt: asStringOrNull(health.lastErrorAt),
    channelAttached: health.channelAttached === true,
    channelActive: health.channelActive === true,
    accChannelsCount: asNumberOrNull(health.accChannelsCount),
    activeChannelId: asStringOrNull(health.activeChannelId),
    activeChannelTitle: asStringOrNull(health.activeChannelTitle),
    hotelId: asStringOrNull(health.hotelId),
    unackedRevisionsCount: asNumberOrNull(health.unackedRevisionsCount) ?? 0,
    failedImportCount: asNumberOrNull(health.failedImportCount) ?? 0,
    pendingApplyCount: asNumberOrNull(health.pendingApplyCount) ?? 0,
    consecutiveFailures: asNumberOrNull(health.consecutiveFailures) ?? 0,
    autoAppliedCount: asNumberOrNull(health.autoAppliedCount) ?? 0,
    autoImportedCount: asNumberOrNull(health.autoImportedCount) ?? 0,
    autoCancelledCount: asNumberOrNull(health.autoCancelledCount) ?? 0,
    pendingManualReviewCount: asNumberOrNull(health.pendingManualReviewCount) ?? 0,
    failedAutoApplyCount: asNumberOrNull(health.failedAutoApplyCount) ?? 0,
    acknowledgedCount: asNumberOrNull(health.acknowledgedCount) ?? 0,
    lastAutoApplyAt: asStringOrNull(health.lastAutoApplyAt),
    lastAutoApplyState:
      asStringOrNull(health.lastAutoApplyState) === "failed_import" ||
      asStringOrNull(health.lastAutoApplyState) === "failed_cancellation_apply" ||
      asStringOrNull(health.lastAutoApplyState) === "waiting_for_manual_review" ||
      asStringOrNull(health.lastAutoApplyState) === "needs_review"
        ? (asStringOrNull(health.lastAutoApplyState) as ChannelFeedHealthSnapshot["lastAutoApplyState"])
        : "synced",
    lastAutoApplyMessage: asStringOrNull(health.lastAutoApplyMessage),
  };
}

function readChannelAriHealth(metadata: Record<string, unknown> | null): ChannelAriHealthSnapshot | null {
  const health = asObject(metadata?.channexAriHealth);
  if (!health) return null;
  const syncedDateRange = asObject(health.syncedDateRange);
  return {
    lastAriSyncAt: asStringOrNull(health.lastAriSyncAt),
    lastSuccessfulAriSyncAt: asStringOrNull(health.lastSuccessfulAriSyncAt),
    lastAriSyncError: asStringOrNull(health.lastAriSyncError),
    lastAriSyncErrorAt: asStringOrNull(health.lastAriSyncErrorAt),
    consecutiveAriFailures: asNumberOrNull(health.consecutiveAriFailures) ?? 0,
    syncedDateRange:
      syncedDateRange && asStringOrNull(syncedDateRange.from) && asStringOrNull(syncedDateRange.to)
        ? {
            from: asStringOrNull(syncedDateRange.from) ?? "",
            to: asStringOrNull(syncedDateRange.to) ?? "",
            windowDays: asNumberOrNull(syncedDateRange.windowDays) ?? 365,
          }
        : null,
    verifiedAvailabilityCount: asNumberOrNull(health.verifiedAvailabilityCount) ?? 0,
    verifiedRateCount: asNumberOrNull(health.verifiedRateCount) ?? 0,
    verifiedMinStayThroughCount: asNumberOrNull(health.verifiedMinStayThroughCount) ?? 0,
    availabilityMismatchCount: asNumberOrNull(health.availabilityMismatchCount) ?? 0,
    rateMismatchCount: asNumberOrNull(health.rateMismatchCount) ?? 0,
    lastAriSyncAction: asStringOrNull(health.lastAriSyncAction),
    lastAriSyncStatus:
      asStringOrNull(health.lastAriSyncStatus) === "sync_failed" ||
      asStringOrNull(health.lastAriSyncStatus) === "sync_overdue" ||
      asStringOrNull(health.lastAriSyncStatus) === "channel_disconnected" ||
      asStringOrNull(health.lastAriSyncStatus) === "synced"
        ? (asStringOrNull(health.lastAriSyncStatus) as ChannelAriHealthSnapshot["lastAriSyncStatus"])
        : "not_started",
    lastAriSyncMessage: asStringOrNull(health.lastAriSyncMessage),
    channelAttached: health.channelAttached === true,
    channelActive: health.channelActive === true,
    accChannelsCount: asNumberOrNull(health.accChannelsCount),
    activeChannelId: asStringOrNull(health.activeChannelId),
    activeChannelTitle: asStringOrNull(health.activeChannelTitle),
    hotelId: asStringOrNull(health.hotelId),
  };
}

function buildSectionDescriptor(
  section: ProSectionId,
  setupProgressPercent: number,
  missingSetupCount: number,
  roomsCount: number,
  syncLogCount: number,
  conflictCount: number
): {
  eyebrow: string;
  title: string;
  copy: string;
  status: string;
} {
  if (section === "setup-guide") {
    return {
      eyebrow: "Property Center",
      title: "Setup Guide",
      copy: "Go-live readiness for this property, including content quality, room setup, channel preparation, and launch safety checks.",
      status: `${setupProgressPercent}% ready`,
    };
  }

  if (section === "rooms-units") {
    return {
      eyebrow: "Property Center",
      title: "Rooms",
      copy: "Manage the room inventory structure that powers this property across Famlo and future OTA distribution.",
      status: `${roomsCount} units`,
    };
  }

  if (section === "rates-restrictions") {
    return {
      eyebrow: "Property Center",
      title: "Pricing & Rules",
      copy: "Review pricing controls for this property. This stays connected to current Famlo data without changing sync behavior.",
      status: "Shell only",
    };
  }

  if (section === "inventory-calendar") {
    return {
      eyebrow: "Inventory",
      title: "Calendar",
      copy: "Compact Pro calendar shell with no changes to existing Famlo calendar or iCal behavior.",
      status: "Read-only shell",
    };
  }

  if (section === "availability-rules") {
    return {
      eyebrow: "Property Center",
      title: "Pricing & Rules",
      copy: "Stay controls for minimum nights, maximum nights, and future availability logic for this property.",
      status: "Coming soon",
    };
  }

  if (section === "check-times") {
    return {
      eyebrow: "Property Center",
      title: "Pricing & Rules",
      copy: "Arrival and departure timing for this property. Keep these rules aligned before distributing to channels.",
      status: missingSetupCount === 0 ? "Ready to map" : "Read-only",
    };
  }

  if (section === "connected-channels") {
    return {
      eyebrow: "Property Center",
      title: "Channels",
      copy: "Choose where this property is distributed and review the current channel connection without changing any live sync logic.",
      status: "Channel overview",
    };
  }

  if (section === "room-mapping") {
    return {
      eyebrow: "Advanced",
      title: "Room Mapping",
      copy: "Advanced mapping workspace for matching Famlo rooms with external channel room types.",
      status: "Mapping pending",
    };
  }

  if (section === "rate-mapping") {
    return {
      eyebrow: "Advanced",
      title: "Rate Mapping",
      copy: "Advanced mapping workspace for connecting Famlo pricing with external provider rate plans.",
      status: "Mapping pending",
    };
  }

  if (section === "sync-logs") {
    return {
      eyebrow: "Advanced",
      title: "Sync Logs",
      copy: "Detailed sync history for operators who need to inspect ARI runs, booking feed checks, and acknowledgement events.",
      status: syncLogCount > 0 ? "History available" : "No sync activity",
    };
  }

  if (section === "conflicts") {
    return {
      eyebrow: "Property Center",
      title: "Sync Health",
      copy: "Needs-attention queue for this property, including import issues, missing mappings, and channel health blockers.",
      status: conflictCount > 0 ? `${conflictCount} issue${conflictCount === 1 ? "" : "s"}` : "No conflicts",
    };
  }

  if (section === "bookings") {
    return {
      eyebrow: "Operations",
      title: "Bookings",
      copy: "Source-aware booking workspace shell. Existing booking flows and booking APIs remain unchanged.",
      status: "Read-only shell",
    };
  }

  if (section === "messages-reviews") {
    return {
      eyebrow: "Operations",
      title: "Messages & Reviews",
      copy: "Compact placeholder for future OTA inbox, guest communication threads, and review workflows.",
      status: "Coming soon",
    };
  }

  if (section === "revenue") {
    return {
      eyebrow: "Insights",
      title: "Revenue",
      copy: "Commercial summary shell for source mix, ADR, occupancy, and payout timing.",
      status: "Coming soon",
    };
  }

  if (section === "reports") {
    return {
      eyebrow: "Insights",
      title: "Reports",
      copy: "Placeholder for exportable operational and commercial reporting across reservations and sync health.",
      status: "Coming soon",
    };
  }

  if (section === "property") {
    return {
      eyebrow: "Property Center",
      title: "Property",
      copy: "Manage the core identity of this property using the existing Famlo source-of-truth records.",
      status: "Read-only",
    };
  }

  if (section === "ota-content") {
    return {
      eyebrow: "Property Center",
      title: "Content & Photos",
      copy: "Prepare the property story, structured content, and gallery details needed before distributing to OTA channels.",
      status: "Readiness layer",
    };
  }

  if (section === "team-groups") {
    return {
      eyebrow: "Admin",
      title: "Team & Groups",
      copy: "Professional role and permissions shell with no invite or write flow enabled yet.",
      status: "Placeholder roles",
    };
  }

  if (section === "settings") {
    return {
      eyebrow: "Admin",
      title: "Settings",
      copy: "Provider environment placeholders for future connectivity and sync readiness.",
      status: "Not connected",
    };
  }

  if (section === "support") {
    return {
      eyebrow: "Admin",
      title: "Support",
      copy: "Pilot support shell for early Pro launches before live provider connectivity is introduced.",
      status: "Pilot support",
    };
  }

  return {
    eyebrow: "Core",
    title: "Dashboard",
    copy: "Operational overview for setup, inventory health, and future multi-channel readiness.",
    status: `${setupProgressPercent}% ready`,
  };
}

export default function FamloProDashboardShell({
  familyId,
  propertyOptions,
  propertyName,
  propertyLocalityLabel,
  propertyHomeLat,
  propertyHomeLng,
  hostCode,
  locationLabel,
  famloPlusStatus,
  entitlementLabel,
  accessReason,
  initialSection,
  rooms,
  metrics,
  setupItems,
  actionItems,
  feedItems,
  basicDashboardUrl,
  basicRoomUrl,
  initialSettings,
  channelFoundation,
  channexConfig,
  proBookings,
  calendarColumns,
  calendarRows,
  calendarWindow,
  calendarVerification,
}: Readonly<FamloProDashboardShellProps>): React.JSX.Element {
  const [activeSection, setActiveSection] = useState<ProSectionId>(initialSection);
  const [selectedCalendarBooking, setSelectedCalendarBooking] = useState<CalendarBookingDetail | null>(null);
  const [timeAnchor] = useState(() => Date.now());
  const activeTopLevel = resolveTopLevelSection(activeSection);
  const activePropertyTab = resolvePropertyTab(activeSection);
  const activePropertyTabLinks = PROPERTY_TAB_SECTION_LINKS[activePropertyTab];
  const currentPropertyOption = propertyOptions.find((option) => option.familyId === familyId) ?? null;

  const completedSetupCount = setupItems.filter((item) => item.complete).length;
  const missingSetupItems = setupItems.filter((item) => !item.complete);
  const setupProgressPercent = Math.round((completedSetupCount / setupItems.length) * 100);
  const recommendedNextAction =
    missingSetupItems[0]?.hint ??
    "Core Pro setup signals look healthy. Provider mapping and sync steps can follow in a future phase.";
  const standardRatePlanName = initialSettings.standardRatePlanName || "Standard Rate";
  const primaryProvider =
    channelFoundation.providers.find((provider) => provider.code === "channex") ??
    channelFoundation.providers[0] ??
    null;
  const primaryProperty =
    (primaryProvider
      ? channelFoundation.properties.find((property) => property.providerCode === primaryProvider.code)
      : null) ?? null;
  const roomMappingsByRoomId = new Map(
    channelFoundation.roomMappings.map((mapping) => [mapping.stayUnitId, mapping])
  );
  const ratePlansByRoomId = new Map(
    channelFoundation.ratePlans
      .filter((plan) => Boolean(plan.stayUnitId))
      .map((plan) => [plan.stayUnitId as string, plan])
  );
  const providerFoundationReady = channelFoundation.providers.length > 0;
  const connectedPropertyCount = channelFoundation.properties.filter(
    (property) => property.syncStatus === "connected"
  ).length;
  const propertyContentChecks = [
    { label: "OTA title", ready: Boolean(initialSettings.otaTitle) && initialSettings.exists },
    { label: "Property description", ready: Boolean(initialSettings.propertyDescription) },
  ];
  const contactChecks = [
    { label: "Contact email", ready: Boolean(initialSettings.contactEmail) },
    { label: "Contact phone", ready: Boolean(initialSettings.contactPhone) },
    { label: "Website", ready: Boolean(initialSettings.website) },
  ];
  const locationChecks = [
    { label: "Country", ready: Boolean(initialSettings.country) && initialSettings.exists },
    { label: "State", ready: Boolean(initialSettings.state) && initialSettings.exists },
    { label: "City", ready: Boolean(initialSettings.city) && initialSettings.exists },
    { label: "Postal code", ready: Boolean(initialSettings.postalCode) },
    { label: "Address line", ready: Boolean(initialSettings.addressLine) },
    { label: "Latitude", ready: initialSettings.latitude != null },
    { label: "Longitude", ready: initialSettings.longitude != null },
  ];
  const policyChecks = [
    { label: "Check-in instructions", ready: Boolean(initialSettings.checkInInstructions) },
    { label: "House rules", ready: Boolean(initialSettings.houseRules) },
    { label: "Cancellation policy", ready: Boolean(initialSettings.cancellationPolicyLabel) },
  ];
  const roomContentRows = rooms.map((room) => {
    const roomChecks = [
      { label: "Room title", ready: room.name.trim().length > 0 },
      { label: "Room type", ready: room.unitType.trim().length > 0 },
      { label: "Count of rooms preview", ready: true },
      { label: "Max guests", ready: room.maxGuests > 0 },
      { label: "Adult spaces", ready: false },
      { label: "Children spaces", ready: false },
      { label: "Cot spaces", ready: false },
      { label: "Bed info", ready: Boolean(room.bedInfo) },
      { label: "Bathroom type", ready: Boolean(room.bathroomType) },
      { label: "Base price", ready: room.priceFullday > 0 },
      { label: "Photo count", ready: room.photosCount > 0 },
      { label: "Description", ready: Boolean(room.description) },
    ];

    return {
      room,
      roomChecks,
      readyCount: roomChecks.filter((item) => item.ready).length,
      statusLabel: contentStatusLabel(roomChecks.filter((item) => item.ready).length, roomChecks.length),
    };
  });
  const photosReadiness = {
    readyRooms: rooms.filter((room) => room.photosCount > 0).length,
    missingRooms: rooms.filter((room) => room.photosCount <= 0).length,
  };
  const activeRoomsCount = rooms.filter((room) => room.isActive).length;
  const roomMappingRows = (rooms.length > 0
    ? rooms
    : [{
        id: "placeholder",
        name: "No rooms surfaced",
        unitType: "",
        description: null,
        maxGuests: 0,
        bedInfo: null,
        bathroomType: null,
        priceFullday: 0,
        isActive: false,
        amenitiesCount: 0,
        photosCount: 0,
      }]).map((room) => {
    const mapping = room.id === "placeholder" ? null : roomMappingsByRoomId.get(room.id) ?? null;
    return {
      room,
      mapping,
      providerRoomType: mapping?.externalRoomTypeId ?? "Not mapped",
      statusLabel: mapping?.externalRoomTypeId ? "Mapped" : labelizeToken(mapping?.syncStatus, "Not mapped"),
    };
  });
  const rateMappingRows = (rooms.length > 0
    ? rooms
    : [{
        id: "placeholder",
        name: "No rooms surfaced",
        unitType: "",
        description: null,
        maxGuests: 0,
        bedInfo: null,
        bathroomType: null,
        priceFullday: 0,
        isActive: false,
        amenitiesCount: 0,
        photosCount: 0,
      }]).map((room) => {
    const ratePlan = room.id === "placeholder" ? null : ratePlansByRoomId.get(room.id) ?? null;
    return {
      room,
      ratePlan,
      providerRatePlan: ratePlan?.externalRatePlanId ?? "Not mapped",
      statusLabel: ratePlan?.externalRatePlanId ? "Mapped" : labelizeToken(ratePlan?.syncStatus, "Not mapped"),
    };
  });
  const canCreateRoomTypes = Boolean(primaryProperty?.externalPropertyId);
  const canCreateRatePlans = canCreateRoomTypes && rooms.filter((room) => room.isActive).every((room) => {
    const mapping = roomMappingsByRoomId.get(room.id);
    return Boolean(mapping?.externalRoomTypeId);
  });
  const channelFeedHealth = readChannelFeedHealth(primaryProperty?.metadata ?? null);
  const channelAriHealth = readChannelAriHealth(primaryProperty?.metadata ?? null);
  const autoApplyStateLabel =
    channelFeedHealth?.lastAutoApplyState === "failed_import"
      ? "Failed import"
      : channelFeedHealth?.lastAutoApplyState === "failed_cancellation_apply"
        ? "Failed cancellation apply"
        : channelFeedHealth?.lastAutoApplyState === "waiting_for_manual_review"
          ? "Waiting for manual review"
          : channelFeedHealth?.pendingManualReviewCount
            ? "Needs review"
            : "Synced";
  const channelHealthNeedsAttention = Boolean(
    (channelFeedHealth || channelAriHealth) &&
      ((channelAriHealth ? (!channelAriHealth.channelAttached || !channelAriHealth.channelActive) : false) ||
        (channelFeedHealth ? (!channelFeedHealth.channelAttached || !channelFeedHealth.channelActive) : false) ||
        (channelFeedHealth?.unackedRevisionsCount ?? 0) > 0 ||
        (channelFeedHealth?.failedImportCount ?? 0) > 0 ||
        (channelFeedHealth?.pendingApplyCount ?? 0) > 0 ||
        (channelFeedHealth?.failedAutoApplyCount ?? 0) > 0 ||
        (channelFeedHealth?.pendingManualReviewCount ?? 0) > 0 ||
        Boolean(channelFeedHealth?.lastError))
  );
  const channelHealthSummaryBadges = [
    `Attached: ${channelFeedHealth?.channelAttached ? "Yes" : "No"}`,
    `Active: ${channelFeedHealth?.channelActive ? "Yes" : "No"}`,
    `Last poll: ${formatDateTime(channelFeedHealth?.lastPollAt ?? null)}`,
    `Last success: ${formatDateTime(channelFeedHealth?.lastSuccessfulPollAt ?? null)}`,
    `Unacked revisions: ${channelFeedHealth?.unackedRevisionsCount ?? 0}`,
    `Failed imports: ${channelFeedHealth?.failedImportCount ?? 0}`,
    `Auto-applied: ${channelFeedHealth?.autoAppliedCount ?? 0}`,
  ];
  const firstMappedRoom = roomMappingRows.find((row) => Boolean(row.mapping?.externalRoomTypeId)) ?? null;
  const firstMappedRatePlan = rateMappingRows.find((row) => Boolean(row.ratePlan?.externalRatePlanId)) ?? null;
  const bookingComManualChecklist = [
    {
      label: "Channex property id",
      value: primaryProperty?.externalPropertyId ?? "Missing",
    },
    {
      label: "Booking.com staging/test channel",
      value: "Connect manually in Channex dashboard",
    },
    {
      label: "Room type id",
      value: firstMappedRoom?.mapping?.externalRoomTypeId ?? "Missing",
    },
    {
      label: "Rate plan id",
      value: firstMappedRatePlan?.ratePlan?.externalRatePlanId ?? "Missing",
    },
    {
      label: "Feed poll health",
      value: channelFeedHealth?.lastSuccessfulPollAt
        ? `Last success ${formatDateTime(channelFeedHealth.lastSuccessfulPollAt)}`
        : "No successful poll yet",
    },
  ];
  const ariSyncEligibleRooms = rooms.filter((room) => {
    if (!room.isActive) return false;
    const roomMapping = roomMappingsByRoomId.get(room.id);
    const ratePlan = ratePlansByRoomId.get(room.id);
    return Boolean(roomMapping?.externalRoomTypeId && ratePlan?.externalRatePlanId && room.priceFullday > 0);
  }).length;
  const ariMissingRooms = rooms.filter((room) => {
    if (!room.isActive) return false;
    const roomMapping = roomMappingsByRoomId.get(room.id);
    const ratePlan = ratePlansByRoomId.get(room.id);
    return !(roomMapping?.externalRoomTypeId && ratePlan?.externalRatePlanId && room.priceFullday > 0);
  }).length;
  const lastAri30SyncLog = channelFoundation.syncLogs.find((log) => log.action === "push_ari_30_day") ?? null;
  const lastAri365SyncLog = channelFoundation.syncLogs.find((log) => log.action === "push_ari_365_day") ?? null;
  const lastAriSyncLog = lastAri365SyncLog ?? lastAri30SyncLog;
  const ariHealth = computeAriHealthSnapshot(channelFoundation.syncLogs, timeAnchor, channelAriHealth);
  channelHealthSummaryBadges.push(`ARI: ${ariHealth.statusLabel}`);
  const lastBookingFeedLog = channelFoundation.syncLogs.find((log) => log.action === "fetch_booking_feed") ?? null;
  const groupedSyncLogs = SYNC_LOG_GROUPS.map((group) => ({
    ...group,
    logs: channelFoundation.syncLogs.filter((log) => group.actions.includes(log.action)),
  })).filter((group) => group.logs.length > 0);
  const currentPropertyLabel = primaryProperty?.externalPropertyId
    ? `Property ${primaryProperty.externalPropertyId}`
    : "Current property";
  const importedNotAcknowledgedConflicts: ConflictItem[] = channelFoundation.bookingRevisions
    .filter((revision) => revision.importStatus === "imported" && revision.ackStatus !== "acknowledged")
    .map((revision) => ({
      key: `booking-imported-${revision.id}`,
      title: "Booking imported but not acknowledged",
      summary: `${revision.externalBookingId ?? "Unknown booking"} is linked to Famlo${revision.linkedBookingId ? ` via ${revision.linkedBookingId}` : ""} but still awaits Channex acknowledgement.`,
      recommendedAction: revision.externalRevisionId
        ? "Review the imported booking in Famlo and acknowledge it from the Bookings workspace when operational checks are complete."
        : "This booking came from Booking List preview only. Wait for Booking Revision Feed to surface a revision id before acknowledgement.",
      severity: "warning",
      relatedLabel: revision.externalBookingId ?? revision.linkedBookingId ?? "Booking revision",
      lastDetectedAt: revision.updatedAt ?? revision.createdAt ?? null,
    }));
  const bookingListPreviewConflicts: ConflictItem[] = channelFoundation.bookingRevisions
    .filter((revision) => revision.source === "booking_list_api" && !revision.externalRevisionId && revision.ackStatus !== "acknowledged")
    .map((revision) => ({
      key: `booking-list-preview-${revision.id}`,
      title: "Booking List preview cannot acknowledge yet",
      summary: `${revision.externalBookingId ?? "Unknown booking"} has no Booking Revision Feed id, so Channex acknowledgement cannot be sent.`,
      recommendedAction: "Fetch the Booking Revision Feed again later and wait for a revision id before acknowledging this booking.",
      severity: "info",
      relatedLabel: revision.externalBookingId ?? "Booking preview",
      lastDetectedAt: revision.updatedAt ?? revision.createdAt ?? null,
    }));
  const unmappedRoomConflicts: ConflictItem[] = rooms
    .filter((room) => room.isActive && !roomMappingsByRoomId.get(room.id)?.externalRoomTypeId)
    .map((room) => ({
      key: `unmapped-room-${room.id}`,
      title: "Room mapping missing",
      summary: `${room.name} does not have an external Channex room type id yet.`,
      recommendedAction: "Complete room-type creation or mapping before relying on channel distribution for this room.",
      severity: "warning",
      relatedLabel: room.name,
      lastDetectedAt: new Date(timeAnchor).toISOString(),
    }));
  const unmappedRateConflicts: ConflictItem[] = rooms
    .filter((room) => room.isActive && !ratePlansByRoomId.get(room.id)?.externalRatePlanId)
    .map((room) => ({
      key: `unmapped-rate-${room.id}`,
      title: "Rate mapping missing",
      summary: `${standardRatePlanName} for ${room.name} does not have an external provider rate plan id yet.`,
      recommendedAction: "Create or map the standard rate plan before expecting rate distribution for this room.",
      severity: "warning",
      relatedLabel: room.name,
      lastDetectedAt: new Date(timeAnchor).toISOString(),
    }));
  const failedSyncConflicts: ConflictItem[] = channelFoundation.syncLogs
    .filter((log) => log.status !== "success")
    .map((log) => ({
      key: `failed-log-${log.id}`,
      title: "Failed or warning sync log",
      summary: `${labelizeToken(log.action, "sync action")} returned ${labelizeToken(log.status, "unknown")}${log.message ? `: ${log.message}` : "."}`,
      recommendedAction: "Review the sync log payload summary and rerun the relevant operational step only after the underlying issue is cleared.",
      severity: log.status === "failed" ? "critical" : "warning",
      relatedLabel: labelizeToken(log.action, "sync action"),
      lastDetectedAt: log.createdAt,
    }));
  const ariHealthConflicts: ConflictItem[] = [
    ...(ariHealth.lastSuccessful365DaySync
      ? []
      : [{
          key: "ari-365-never-run",
          title: "365-day sync has never run",
          summary: "No successful 365-day ARI sync has been recorded for this property yet.",
          recommendedAction: "Run 365-day sync before connecting live channels.",
          severity: "warning" as const,
          relatedLabel: currentPropertyLabel,
          lastDetectedAt: ariHealth.lastAriSyncAt ?? null,
        }]),
    ...(ariHealth.lastProblemSync
      ? [{
          key: `ari-problem-${ariHealth.lastProblemSync.action}-${ariHealth.lastProblemSync.createdAt ?? "unknown"}`,
          title: "365-day sync failed or warned",
          summary: `${labelizeToken(ariHealth.lastProblemSync.action, "ARI sync")} returned ${labelizeToken(ariHealth.lastProblemSync.status, "unknown")}${ariHealth.lastProblemSync.message ? `: ${ariHealth.lastProblemSync.message}` : "."}`,
          recommendedAction: "Review the last ARI sync summary and rerun the 365-day sync when the issue is cleared.",
          severity: ariHealth.lastProblemSync.status === "failed" ? "critical" as const : "warning" as const,
          relatedLabel: currentPropertyLabel,
          lastDetectedAt: ariHealth.lastProblemSync.createdAt ?? null,
        }]
      : []),
    ...(ariHealth.lastSuccessful365DaySync && isStaleByHours(ariHealth.lastSuccessful365DaySync.createdAt, timeAnchor, 24)
      ? [{
          key: "ari-365-stale",
          title: "365-day sync is stale",
          summary: `The latest successful 365-day sync ran ${formatRelativeAge(ariHealth.lastSuccessful365DaySync.createdAt, timeAnchor)}.`,
          recommendedAction: "Run 365-day sync before connecting live channels.",
          severity: "warning" as const,
          relatedLabel: currentPropertyLabel,
          lastDetectedAt: ariHealth.lastSuccessful365DaySync.createdAt ?? null,
        }]
      : []),
    ...(ariHealth.statusLabel === "Sync overdue"
      ? [{
          key: "ari-sync-overdue",
          title: "ARI sync is overdue",
          summary: "The daily ARI sync has gone stale, so inventory freshness is no longer trusted.",
          recommendedAction: "Run Sync now or restore the daily cron before relying on channel inventory.",
          severity: "warning" as const,
          relatedLabel: currentPropertyLabel,
          lastDetectedAt: ariHealth.lastAriSyncAt ?? null,
        }]
      : []),
  ];
  const conflictItems: ConflictItem[] = [
    ...importedNotAcknowledgedConflicts,
    ...bookingListPreviewConflicts,
    ...unmappedRoomConflicts,
    ...unmappedRateConflicts,
    ...failedSyncConflicts,
    ...ariHealthConflicts,
    ...(channelFeedHealth && !channelFeedHealth.channelAttached
      ? [{
          key: "channel-detached",
          title: "Channel detached or missing",
          summary: "Channex feed health says the property currently has no attached channel.",
          recommendedAction: "Check the Channex channel attachment before relying on automatic booking feed polling.",
          severity: "critical" as const,
          relatedLabel: currentPropertyLabel,
          lastDetectedAt: channelFeedHealth?.lastPollAt ?? null,
        }]
      : []),
    ...(channelFeedHealth?.channelAttached && !channelFeedHealth.channelActive
      ? [{
          key: "channel-inactive",
          title: "Channel is attached but inactive",
          summary: "Channex can still see a channel relationship, but the active state is off.",
          recommendedAction: "Activate the channel in Channex before relying on feed polling or ARI sync.",
          severity: "critical" as const,
          relatedLabel: channelFeedHealth?.activeChannelTitle ?? currentPropertyLabel,
          lastDetectedAt: channelFeedHealth?.lastPollAt ?? null,
        }]
      : []),
    ...(channelFeedHealth?.lastError
      ? [{
          key: "channel-feed-last-error",
          title: "Feed poll failed",
          summary: channelFeedHealth?.lastError ?? "Unknown feed polling error.",
          recommendedAction: "Review the latest cron poll log and clear the Channex feed issue before trusting unattended sync.",
          severity: "critical" as const,
          relatedLabel: channelFeedHealth?.activeChannelTitle ?? currentPropertyLabel,
          lastDetectedAt: channelFeedHealth?.lastErrorAt ?? channelFeedHealth?.lastPollAt ?? null,
        }]
      : []),
    ...((channelFeedHealth?.unackedRevisionsCount ?? 0) > 0
      ? [{
          key: "channel-feed-unacked",
          title: "Unacknowledged revisions exist",
          summary: `${channelFeedHealth?.unackedRevisionsCount ?? 0} Channex revision${(channelFeedHealth?.unackedRevisionsCount ?? 0) === 1 ? "" : "s"} still need acknowledgement.`,
          recommendedAction: "Open Bookings and complete review or acknowledgement for pending revisions.",
          severity: "warning" as const,
          relatedLabel: channelFeedHealth?.activeChannelTitle ?? currentPropertyLabel,
          lastDetectedAt: channelFeedHealth?.lastPollAt ?? null,
        }]
      : []),
    ...((channelFeedHealth?.failedImportCount ?? 0) > 0
      ? [{
          key: "channel-feed-failed-import",
          title: "Feed import needs operator review",
          summary: `${channelFeedHealth?.failedImportCount ?? 0} feed revision${(channelFeedHealth?.failedImportCount ?? 0) === 1 ? "" : "s"} failed automatic storage/import handling.`,
          recommendedAction: "Review the preview rows and rerun the appropriate booking action from Famlo Pro.",
          severity: "critical" as const,
          relatedLabel: channelFeedHealth?.activeChannelTitle ?? currentPropertyLabel,
          lastDetectedAt: channelFeedHealth?.lastPollAt ?? null,
        }]
      : []),
    ...((channelFeedHealth?.pendingApplyCount ?? 0) > 0
      ? [{
          key: "channel-feed-pending-apply",
          title: "New or cancelled revision is pending apply",
          summary: `${channelFeedHealth?.pendingApplyCount ?? 0} feed revision${(channelFeedHealth?.pendingApplyCount ?? 0) === 1 ? "" : "s"} are stored but still need import/apply action.`,
          recommendedAction: "Open Bookings and finish the pending import or cancellation apply steps.",
          severity: "warning" as const,
          relatedLabel: channelFeedHealth?.activeChannelTitle ?? currentPropertyLabel,
          lastDetectedAt: channelFeedHealth?.lastPollAt ?? null,
        }]
      : []),
    ...((channelFeedHealth?.pendingManualReviewCount ?? 0) > 0
      ? [{
          key: "channel-feed-manual-review",
          title: "Modification revision is waiting for manual review",
          summary: `${channelFeedHealth?.pendingManualReviewCount ?? 0} Channex revision${(channelFeedHealth?.pendingManualReviewCount ?? 0) === 1 ? "" : "s"} were intentionally held for manual review.`,
          recommendedAction: "Open Bookings and review the stored modification preview before any acknowledgement is sent.",
          severity: "info" as const,
          relatedLabel: channelFeedHealth?.activeChannelTitle ?? currentPropertyLabel,
          lastDetectedAt: channelFeedHealth?.lastPollAt ?? null,
        }]
      : []),
    ...((channelFeedHealth?.failedAutoApplyCount ?? 0) > 0
      ? [{
          key: "channel-feed-auto-apply-failed",
          title: "Automatic booking sync needs intervention",
          summary: `${channelFeedHealth?.failedAutoApplyCount ?? 0} automatic import/apply step${(channelFeedHealth?.failedAutoApplyCount ?? 0) === 1 ? "" : "s"} failed.`,
          recommendedAction: "Inspect the latest auto-process sync log and fix the affected booking revision before acknowledging it.",
          severity: "critical" as const,
          relatedLabel: channelFeedHealth?.activeChannelTitle ?? currentPropertyLabel,
          lastDetectedAt: channelFeedHealth?.lastAutoApplyAt ?? channelFeedHealth?.lastPollAt ?? null,
        }]
      : []),
    ...(ariHealth.statusLabel === "Channel disconnected"
      ? [{
          key: "ari-channel-disconnected",
          title: "Daily ARI sync is blocked by channel state",
          summary: "The latest ARI health snapshot says the Channex channel is detached or inactive.",
          recommendedAction: "Reconnect the Channex channel before relying on daily inventory sync.",
          severity: "critical" as const,
          relatedLabel: currentPropertyLabel,
          lastDetectedAt: ariHealth.lastAriSyncAt ?? null,
        }]
      : []),
  ];
  const activeRooms = rooms.filter((room) => room.isActive);
  const allActiveRoomsMapped = activeRooms.length > 0 && activeRooms.every((room) => Boolean(roomMappingsByRoomId.get(room.id)?.externalRoomTypeId));
  const allActiveRoomsHaveRatePlans = activeRooms.length > 0 && activeRooms.every((room) => Boolean(ratePlansByRoomId.get(room.id)?.externalRatePlanId));
  const bookingImportTested = channelFoundation.bookingRevisions.some((revision) =>
    Boolean(revision.linkedBookingId) ||
    revision.importStatus === "imported" ||
    revision.importStatus === "modified_applied"
  );
  const bookingProofCompleted = channelFoundation.bookingRevisions.some((revision) =>
    revision.importStatus === "imported" && revision.ackStatus === "acknowledged"
  );
  const cancellationProofCompleted = channelFoundation.bookingRevisions.some((revision) =>
    revision.importStatus === "cancelled_applied" && revision.ackStatus === "acknowledged"
  );
  const modificationWorkflowAvailable = channelFoundation.bookingRevisions.some((revision) =>
    revision.importStatus === "modified_applied" || revision.importStatus === "modified_pending_review"
  );
  const latestFeedPollSuccessful = Boolean(
    channelFeedHealth?.lastSuccessfulPollAt &&
    !channelFeedHealth?.lastError &&
    !isStaleByHours(channelFeedHealth.lastSuccessfulPollAt, timeAnchor, 24)
  );
  const currentChannelAttached =
    channelAriHealth
      ? channelAriHealth.channelAttached && channelAriHealth.channelActive
      : (channelFeedHealth?.channelAttached ?? false) && (channelFeedHealth?.channelActive ?? false);
  const currentChannelReference =
    channelAriHealth?.activeChannelTitle ??
    channelFeedHealth?.activeChannelTitle ??
    currentPropertyLabel;
  const criticalConflictCount = conflictItems.filter((item) => item.severity === "critical").length;
  const warningConflictCount = conflictItems.filter((item) => item.severity === "warning").length;
  const acknowledgementGuardHealthy = channelFoundation.bookingRevisions.every((revision) => {
    if (revision.ackStatus !== "acknowledged") return true;
    return Boolean(revision.externalRevisionId);
  });
  const latestAriSyncFailed = lastAriSyncLog?.status === "failed";
  const latestAriSyncWarned = lastAriSyncLog?.status === "warning";
  const hasRecent365DaySuccess = Boolean(
    ariHealth.lastSuccessful365DaySync && !isStaleByHours(ariHealth.lastSuccessful365DaySync.createdAt, timeAnchor, 24)
  );
  const goLiveChecklist: GoLiveChecklistItem[] = [
    {
      key: "famlo-plus-active",
      title: "Famlo+ active",
      status: famloPlusStatus === "active" || famloPlusStatus === "grace" ? "ready" : "blocked",
      statusLabel: checklistStatusLabel(famloPlusStatus === "active" || famloPlusStatus === "grace" ? "ready" : "blocked"),
      explanation:
        famloPlusStatus === "active" || famloPlusStatus === "grace"
          ? `Famlo Pro access is currently ${labelizeToken(famloPlusStatus, famloPlusStatus)} for this property.`
          : `Famlo Pro access is ${labelizeToken(famloPlusStatus, "inactive")}, so live channel launch should stay blocked.`,
      recommendedAction:
        famloPlusStatus === "active" || famloPlusStatus === "grace"
          ? "Keep the current Famlo+ entitlement active through pilot launch."
          : "Renew or activate Famlo+ before planning live channel connection.",
      targetSection: "dashboard",
    },
    {
      key: "channex-environment-configured",
      title: "Channex environment configured",
      status: channexConfig.configured ? "ready" : "blocked",
      statusLabel: checklistStatusLabel(channexConfig.configured ? "ready" : "blocked"),
      explanation: channexConfig.configured
        ? `${formatChannexEnvironmentLabel(channexConfig.environment)} is configured with a server-side base URL and API key.`
        : `${formatChannexEnvironmentLabel(channexConfig.environment)} is missing required server configuration.`,
      recommendedAction: channexConfig.configured
        ? "Use the current environment intentionally and avoid switching modes casually."
        : "Add the correct Channex base URL and API key before testing further.",
      targetSection: "settings",
    },
    {
      key: "production-mutation-guard",
      title: "Production mutation guard status shown",
      status:
        channexConfig.environment === "production"
          ? (channexConfig.productionMutationsAllowed ? "ready" : "needs_action")
          : "ready",
      statusLabel: checklistStatusLabel(
        channexConfig.environment === "production"
          ? (channexConfig.productionMutationsAllowed ? "ready" : "needs_action")
          : "ready"
      ),
      explanation:
        channexConfig.environment === "production"
          ? channexConfig.productionMutationsAllowed
            ? "Production mode is explicitly allowed for mutations through the safety flag."
            : "Production mode is selected, but write mutations are still blocked by the safety flag."
          : "Staging mode is selected, so production mutations remain safely blocked by default.",
      recommendedAction:
        channexConfig.environment === "production" && !channexConfig.productionMutationsAllowed
          ? "Leave the guard in place until you are ready for pilot, then set the explicit production allow flag."
          : "Keep this guard visible during launch checks so operators know which environment is active.",
      targetSection: "settings",
    },
    {
      key: "channel-attached-active",
      title: "Channel attached and active",
      status: currentChannelAttached ? "ready" : "blocked",
      statusLabel: checklistStatusLabel(currentChannelAttached ? "ready" : "blocked"),
      explanation:
        currentChannelAttached
          ? `The active Channex channel is attached${currentChannelReference ? ` as ${currentChannelReference}` : ""}.`
          : "The Channex channel is detached or inactive, so staging/test routing is not healthy enough for go-live.",
      recommendedAction:
        currentChannelAttached
          ? "Keep this channel stable and avoid remapping unless the provider setup changes."
          : "Reconnect or reactivate the Channex channel first. Shared Booking.com staging ids can detach, so treat this as a staging safety issue until restored.",
      targetSection: "connected-channels",
    },
    {
      key: "provider-property-created",
      title: "Provider property created",
      status: primaryProperty?.externalPropertyId ? "ready" : "blocked",
      statusLabel: checklistStatusLabel(primaryProperty?.externalPropertyId ? "ready" : "blocked"),
      explanation: primaryProperty?.externalPropertyId
        ? `Channex property mapping exists with external property id ${primaryProperty.externalPropertyId}.`
        : "No Channex property mapping exists yet for this Famlo property.",
      recommendedAction: primaryProperty?.externalPropertyId
        ? "Keep this mapping stable and avoid recreating the provider property unnecessarily."
        : "Create the provider property before attempting room, rate, or ARI workflows.",
      targetSection: "connected-channels",
    },
    {
      key: "all-active-rooms-mapped",
      title: "All active rooms mapped",
      status: activeRooms.length === 0 ? "blocked" : allActiveRoomsMapped ? "ready" : "needs_action",
      statusLabel: checklistStatusLabel(activeRooms.length === 0 ? "blocked" : allActiveRoomsMapped ? "ready" : "needs_action"),
      explanation:
        activeRooms.length === 0
          ? "No active rooms are available for channel launch."
          : allActiveRoomsMapped
            ? `All ${activeRooms.length} active room${activeRooms.length === 1 ? "" : "s"} have Channex room type mappings.`
            : `${activeRooms.filter((room) => !roomMappingsByRoomId.get(room.id)?.externalRoomTypeId).length} active room${activeRooms.filter((room) => !roomMappingsByRoomId.get(room.id)?.externalRoomTypeId).length === 1 ? " is" : "s are"} still missing room mappings.`,
      recommendedAction:
        activeRooms.length === 0
          ? "Activate and review room inventory before planning channel launch."
          : allActiveRoomsMapped
            ? "Re-check mappings only when room inventory changes."
            : "Finish room mapping for every active room before going live.",
      targetSection: "room-mapping",
    },
    {
      key: "all-active-rooms-have-rate-plans",
      title: "All active rooms have rate plans",
      status: activeRooms.length === 0 ? "blocked" : allActiveRoomsHaveRatePlans ? "ready" : "needs_action",
      statusLabel: checklistStatusLabel(activeRooms.length === 0 ? "blocked" : allActiveRoomsHaveRatePlans ? "ready" : "needs_action"),
      explanation:
        activeRooms.length === 0
          ? "There are no active rooms to price for channel launch."
          : allActiveRoomsHaveRatePlans
            ? `All ${activeRooms.length} active room${activeRooms.length === 1 ? "" : "s"} have mapped provider rate plans.`
            : `${activeRooms.filter((room) => !ratePlansByRoomId.get(room.id)?.externalRatePlanId).length} active room${activeRooms.filter((room) => !ratePlansByRoomId.get(room.id)?.externalRatePlanId).length === 1 ? " is" : "s are"} still missing rate plans.`,
      recommendedAction:
        activeRooms.length === 0
          ? "Add active rooms before attempting rate distribution."
          : allActiveRoomsHaveRatePlans
            ? "Keep rate-plan mapping stable and review only when pricing structure changes."
            : "Create or map a provider rate plan for every active room.",
      targetSection: "rate-mapping",
    },
    {
      key: "ari-365-fresh",
      title: "Latest ARI sync successful",
      status:
        ariHealth.statusLabel === "Channel disconnected"
          ? "blocked"
          : hasRecent365DaySuccess
            ? "ready"
            : latestAriSyncFailed
              ? "blocked"
              : "needs_action",
      statusLabel: checklistStatusLabel(
        ariHealth.statusLabel === "Channel disconnected"
          ? "blocked"
          : hasRecent365DaySuccess
            ? "ready"
            : latestAriSyncFailed
              ? "blocked"
              : "needs_action"
      ),
      explanation: hasRecent365DaySuccess
        ? `A verified 365-day ARI sync completed ${formatRelativeAge(ariHealth.lastSuccessful365DaySync?.createdAt ?? null, timeAnchor)}.`
        : ariHealth.statusLabel === "Channel disconnected"
          ? "Daily ARI sync is intentionally blocked because the staging Channex channel is currently detached."
        : ariHealth.lastSuccessful365DaySync
          ? `The last successful 365-day ARI sync is stale at ${formatRelativeAge(ariHealth.lastSuccessful365DaySync.createdAt, timeAnchor)}.`
          : "No successful 365-day ARI sync has been recorded yet.",
      recommendedAction: hasRecent365DaySuccess
        ? "Keep the 365-day sync fresh before any live channel launch decision."
        : "Run a fresh 365-day sync and verify read-back before connecting live channels.",
      targetSection: "rates-restrictions",
    },
    {
      key: "latest-feed-poll-successful",
      title: "Latest feed poll successful",
      status:
        !currentChannelAttached
          ? "blocked"
          : latestFeedPollSuccessful
            ? "ready"
            : "needs_action",
      statusLabel: checklistStatusLabel(
        !currentChannelAttached
          ? "blocked"
          : latestFeedPollSuccessful
            ? "ready"
            : "needs_action"
      ),
      explanation:
        !currentChannelAttached
          ? "Feed polling is not trustworthy because the channel is currently detached."
          : latestFeedPollSuccessful
            ? `The latest successful Booking Revision Feed poll ran on ${formatDateTime(channelFeedHealth?.lastSuccessfulPollAt ?? null)}.`
            : channelFeedHealth?.lastError
              ? `The latest feed poll recorded an error: ${channelFeedHealth?.lastError}`
              : "No fresh successful feed poll is visible yet for this property.",
      recommendedAction:
        latestFeedPollSuccessful
          ? "Keep the feed cron running and monitor the Connected Channels health snapshot."
          : "Restore a healthy channel attachment and rerun feed polling before relying on unattended booking sync.",
      targetSection: "connected-channels",
    },
    {
      key: "unacked-revisions-zero",
      title: "Unacknowledged revisions = 0",
      status: (channelFeedHealth?.unackedRevisionsCount ?? 0) === 0 ? "ready" : "needs_action",
      statusLabel: checklistStatusLabel((channelFeedHealth?.unackedRevisionsCount ?? 0) === 0 ? "ready" : "needs_action"),
      explanation:
        (channelFeedHealth?.unackedRevisionsCount ?? 0) === 0
          ? "No unacknowledged Channex feed revisions are waiting right now."
          : `${channelFeedHealth?.unackedRevisionsCount ?? 0} revision${(channelFeedHealth?.unackedRevisionsCount ?? 0) === 1 ? "" : "s"} still need acknowledgement.`,
      recommendedAction:
        (channelFeedHealth?.unackedRevisionsCount ?? 0) === 0
          ? "Keep acknowledgement tied to real feed revisions only."
          : "Open Bookings and finish the required review before acknowledging pending revisions.",
      targetSection: "bookings",
    },
    {
      key: "failed-imports-zero",
      title: "Failed imports = 0",
      status: (channelFeedHealth?.failedImportCount ?? 0) === 0 && (channelFeedHealth?.failedAutoApplyCount ?? 0) === 0 ? "ready" : "blocked",
      statusLabel: checklistStatusLabel((channelFeedHealth?.failedImportCount ?? 0) === 0 && (channelFeedHealth?.failedAutoApplyCount ?? 0) === 0 ? "ready" : "blocked"),
      explanation:
        (channelFeedHealth?.failedImportCount ?? 0) === 0 && (channelFeedHealth?.failedAutoApplyCount ?? 0) === 0
          ? "No failed automatic import or apply steps are visible in the current feed health."
          : `${channelFeedHealth?.failedImportCount ?? 0} failed import${(channelFeedHealth?.failedImportCount ?? 0) === 1 ? "" : "s"} and ${channelFeedHealth?.failedAutoApplyCount ?? 0} failed auto-apply step${(channelFeedHealth?.failedAutoApplyCount ?? 0) === 1 ? "" : "s"} need operator review.`,
      recommendedAction:
        (channelFeedHealth?.failedImportCount ?? 0) === 0 && (channelFeedHealth?.failedAutoApplyCount ?? 0) === 0
          ? "Keep this at zero before any pilot launch decision."
          : "Clear failed feed processing issues before calling the property launch-ready.",
      targetSection: "conflicts",
    },
    {
      key: "booking-proof-completed",
      title: "Booking proof completed",
      status: bookingProofCompleted ? "ready" : bookingImportTested ? "needs_action" : "blocked",
      statusLabel: checklistStatusLabel(bookingProofCompleted ? "ready" : bookingImportTested ? "needs_action" : "blocked"),
      explanation: bookingProofCompleted
        ? "A real Booking.com new booking has been imported into Famlo and acknowledged successfully."
        : bookingImportTested
          ? "A booking preview/import test exists, but the fully acknowledged new-booking proof is incomplete."
          : "No real Booking.com booking proof is visible yet in the current data.",
      recommendedAction: bookingProofCompleted
        ? "Keep using this as the baseline proof for live booking ingestion."
        : "Complete a real Booking.com new-booking proof before any launch decision.",
      targetSection: "bookings",
    },
    {
      key: "cancellation-proof-completed",
      title: "Cancellation proof completed",
      status: cancellationProofCompleted ? "ready" : "needs_action",
      statusLabel: checklistStatusLabel(cancellationProofCompleted ? "ready" : "needs_action"),
      explanation: cancellationProofCompleted
        ? "A real Booking.com cancellation has already updated Famlo and been acknowledged successfully."
        : "No real acknowledged cancellation proof is visible yet for this property.",
      recommendedAction: cancellationProofCompleted
        ? "Use this proof to validate checkout-day unblocking and channel-cancelled handling."
        : "Run a real cancellation proof before trusting unattended live cancellation handling.",
      targetSection: "bookings",
    },
    {
      key: "modification-workflow-available",
      title: "Modification workflow available",
      status: modificationWorkflowAvailable ? "ready" : "needs_action",
      statusLabel: checklistStatusLabel(modificationWorkflowAvailable ? "ready" : "needs_action"),
      explanation: modificationWorkflowAvailable
        ? "Modification revisions can be held for manual review, applied in place, and acknowledged safely."
        : "The current property has not yet demonstrated the manual modification review/apply workflow.",
      recommendedAction: modificationWorkflowAvailable
        ? "Keep manual review in place until you are comfortable with broader automation."
        : "Run a real modification proof before trusting the operator workflow.",
      targetSection: "bookings",
    },
    {
      key: "no-critical-conflicts",
      title: "Open critical conflicts = 0",
      status: criticalConflictCount === 0 ? "ready" : "blocked",
      statusLabel: checklistStatusLabel(criticalConflictCount === 0 ? "ready" : "blocked"),
      explanation: criticalConflictCount === 0
        ? "No critical conflicts are currently open in the Pro conflict queue."
        : `${criticalConflictCount} critical conflict${criticalConflictCount === 1 ? " remains" : "s remain"} open in the conflict queue.`,
      recommendedAction: criticalConflictCount === 0
        ? "Keep the conflict queue clean before any pilot launch."
        : "Resolve critical conflicts before declaring this property ready for live connection.",
      targetSection: "conflicts",
    },
    {
      key: "acknowledgement-gated",
      title: "Acknowledgement not enabled unless feed revision id exists",
      status: acknowledgementGuardHealthy ? "ready" : "blocked",
      statusLabel: checklistStatusLabel(acknowledgementGuardHealthy ? "ready" : "blocked"),
      explanation: acknowledgementGuardHealthy
        ? channelFoundation.bookingRevisions.some((revision) => revision.source === "booking_list_api" && !revision.externalRevisionId)
          ? "Booking List previews without feed revision ids are still present, but acknowledgement remains correctly blocked for them."
          : "No invalid acknowledgement state was found in the current booking revision data."
        : "At least one acknowledged booking revision is missing a feed revision id, which should not happen.",
      recommendedAction: acknowledgementGuardHealthy
        ? "Keep acknowledgement manual and feed-id-aware until the live workflow is fully proven."
        : "Audit booking revision history before any live acknowledgement workflow is enabled.",
      targetSection: "bookings",
    },
  ];
  const blockedChecklistCount = goLiveChecklist.filter((item) => item.status === "blocked").length;
  const needsActionChecklistCount = goLiveChecklist.filter((item) => item.status === "needs_action").length;
  const channelDetachedStagingIssue = !currentChannelAttached;
  const goLiveSummary = channelDetachedStagingIssue
    ? {
        label: "Not ready",
        toneClass: styles.readinessPillMissing,
        explanation: "Channel disconnected. This may be a shared Booking.com staging test-channel issue, but Famlo should still stay blocked from go-live decisions until attachment is healthy again.",
      }
    : blockedChecklistCount > 0
    ? {
        label: "Not ready",
        toneClass: styles.readinessPillMissing,
        explanation: "Critical launch blockers still exist, so this property should not connect live channels yet.",
      }
    : channexConfig.environment === "production" && channexConfig.productionMutationsAllowed && needsActionChecklistCount === 0
      ? {
          label: "Ready for pilot",
          toneClass: styles.readinessPillOk,
          explanation: "Core setup, mapping, booking proof, and ARI health signals are aligned for a controlled live pilot.",
        }
      : needsActionChecklistCount === 0
        ? {
            label: "Ready for staging test",
            toneClass: styles.readinessPillOk,
            explanation: "This property looks healthy for staging proof, but production launch controls are not fully open yet.",
        }
      : {
          label: "Not ready",
          toneClass: styles.readinessPillReview,
          explanation: `Core blockers are cleared, but ${needsActionChecklistCount} launch action${needsActionChecklistCount === 1 ? "" : "s"} and ${warningConflictCount} warning-level conflict${warningConflictCount === 1 ? "" : "s"} still need review before a safe pilot decision.`,
        };
  const selectedPropertyLocation = [
    currentPropertyOption?.locality ?? null,
    currentPropertyOption?.city ?? null,
    currentPropertyOption?.state ?? null,
  ]
    .filter(Boolean)
    .join(", ") || locationLabel || "Location details pending";
  const selectedPropertyChannelStatus = channelFeedHealth
    ? channelFeedHealth.channelAttached
      ? channelFeedHealth.channelActive
        ? "Channel active"
        : "Channel inactive"
      : "Channel disconnected"
    : primaryProperty?.syncStatus === "connected"
      ? "Channel active"
      : "Channel health unavailable";
  const sectionDescriptor = buildSectionDescriptor(
    activeSection,
    setupProgressPercent,
    missingSetupItems.length,
    rooms.length,
    channelFoundation.syncLogs.length,
    conflictItems.length
  );

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brandBlock}>
          <div className={styles.brandEyebrow}>Famlo Pro</div>
          <div className={styles.brandTitle}>Property OS</div>
          <p className={styles.brandCopy}>
            Multi-property workspace for rooms, pricing, content, channels, and sync health. Existing provider logic
            stays exactly as it is underneath.
          </p>
        </div>

        <div className={styles.navGroup}>
          <div className={styles.navGroupLabel}>Workspace</div>
          {TOP_LEVEL_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTopLevel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.navButton} ${active ? styles.navButtonActive : ""}`}
                onClick={() => setActiveSection(resolveTopLevelDefaultSection(item.id, activeSection))}
              >
                <Icon className={styles.navIcon} />
                <span className={styles.navText}>
                  <span className={styles.navTitle}>{item.title}</span>
                  <span className={styles.navHint}>{item.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className={styles.sidebarFooter}>
          <div className={styles.brandEyebrow}>Current property</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "white" }}>{propertyName}</div>
          <p className={styles.brandCopy}>
            This Pro shell still scopes all actions to the current `familyId`, so existing Booking.com and Channex
            workflows stay safe.
          </p>
          <div className={styles.brandEyebrow}>Go-live</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>
            {setupProgressPercent}%
          </div>
          <p className={styles.brandCopy}>
            {completedSetupCount}/{setupItems.length} readiness signals are complete. Channel sync remains intentionally disconnected.
          </p>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.headerTitle}>{propertyName}</h1>
            <p className={styles.headerCopy}>
              {locationLabel} · Famlo Pro property workspace
            </p>
          </div>

          <div className={styles.headerActions}>
            <span className={`${styles.chip} ${styles.chipPrimary}`}>
              <Sparkles size={14} />
              Famlo+ {famloPlusStatus}
            </span>
            <span className={styles.chip}>
              <CalendarClock size={14} />
              {entitlementLabel}
            </span>
            <Link href={basicDashboardUrl} className={`${styles.headerLink} ${styles.headerSecondaryLink}`}>
              Back to Basic Dashboard
            </Link>
          </div>
        </header>

        <div className={styles.content}>
          {activeTopLevel === "properties" && (
            <section className={styles.propertyCenterShell}>
              <div className={styles.propertyCenterHeader}>
                <div>
                  <div className={styles.sectionEyebrow}>Selected property</div>
                  <h2 className={styles.propertyCenterTitle}>{currentPropertyOption?.name ?? propertyName ?? "Selected property"}</h2>
                  <p className={styles.propertyCenterCopy}>
                    Manage this property's rooms, content, pricing, channels, and sync health. Advanced technical screens
                    stay available under Advanced without changing any current sync logic.
                  </p>
                  <div className={styles.propertyHeaderMeta}>
                    <span className={styles.propertyHeaderMetaItem}>{selectedPropertyLocation}</span>
                    <span className={styles.propertyHeaderMetaItem}>Family scope: {familyId}</span>
                  </div>
                </div>
                <div className={styles.propertyCenterStatus}>
                  <span className={styles.sectionStatus}>{selectedPropertyChannelStatus}</span>
                  <span className={styles.sectionStatus}>{activeRoomsCount} active rooms</span>
                  <span className={styles.sectionStatus}>{goLiveSummary.label}</span>
                  <span className={styles.sectionStatus}>{formatPropertySwitcherStatusLabel(currentPropertyOption?.famloPlusStatus ?? famloPlusStatus)}</span>
                </div>
              </div>

              <PropertySwitcherControl
                propertyOptions={propertyOptions}
                currentFamilyId={familyId}
                activeSection={activeSection}
              />

              <div className={styles.propertyTabGrid}>
                {PROPERTY_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = isPropertyTabActive(tab.id, activeSection);
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={`${styles.propertyTabButton} ${active ? styles.propertyTabButtonActive : ""}`}
                      onClick={() => setActiveSection(active ? activeSection : tab.defaultSection)}
                    >
                      <div className={styles.propertyTabIconWrap}>
                        <Icon className={styles.propertyTabIcon} />
                      </div>
                      <div className={styles.propertyTabText}>
                        <span className={styles.propertyTabTitle}>{tab.title}</span>
                        <span className={styles.propertyTabHint}>{tab.hint}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className={styles.propertySubSectionBar}>
                <div>
                  <div className={styles.propertySubSectionTitle}>
                    {PROPERTY_TABS.find((tab) => tab.id === activePropertyTab)?.title ?? "Overview"}
                  </div>
                  <div className={styles.propertySubSectionCopy}>
                    {PROPERTY_TABS.find((tab) => tab.id === activePropertyTab)?.hint ?? "Property workspace"}
                  </div>
                </div>
                <span className={styles.sectionStatus}>{propertyCenterStatusLabel(activePropertyTab, activeSection)}</span>
              </div>

              <div className={styles.propertyTabLinks}>
                {activePropertyTabLinks.map((item) => {
                  const Icon = item.icon;
                  const active = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.propertyTabLinkButton} ${active ? styles.propertyTabLinkButtonActive : ""}`}
                      onClick={() => setActiveSection(item.id)}
                    >
                      <Icon className={styles.propertyTabLinkIcon} />
                      <span className={styles.propertyTabLinkText}>
                        <span className={styles.propertyTabLinkTitle}>{item.title}</span>
                        <span className={styles.propertyTabLinkHint}>{item.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {activeSection === "dashboard" && (
            <>
              <section className={styles.heroCard}>
                <div className={styles.heroGrid}>
                  <div>
                    <div className={styles.eyebrow}>Famlo Pro</div>
                    <h2 className={styles.heroTitle}>
                      Multi-property control for serious homestay operations
                    </h2>
                    <p className={styles.heroText}>
                      This Pro workspace keeps Famlo as the source of truth for property identity, rooms, bookings,
                      and availability. Use Property Center for host-facing management while the existing channel engine
                      continues to run safely underneath.
                    </p>
                    <div className={styles.heroMeta}>
                      <div className={styles.heroMetaItem}>
                        <span className={styles.heroMetaLabel}>Property</span>
                        <span className={styles.heroMetaValue}>{propertyName}</span>
                      </div>
                      <div className={styles.heroMetaItem}>
                        <span className={styles.heroMetaLabel}>Host ID</span>
                        <span className={styles.heroMetaValue}>{hostCode ?? "Pending"}</span>
                      </div>
                      <div className={styles.heroMetaItem}>
                        <span className={styles.heroMetaLabel}>Access</span>
                        <span className={styles.heroMetaValue}>{accessReason}</span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.heroPanel}>
                    <div className={styles.heroPanelTitle}>Go-live readiness</div>
                    <div className={styles.inlineBadgeRow}>
                      <span className={`${styles.readinessPill} ${goLiveSummary.toneClass}`}>{goLiveSummary.label}</span>
                      <span className={styles.readinessPill}>{goLiveChecklist.filter((item) => item.status === "ready").length}/{goLiveChecklist.length} ready</span>
                    </div>
                    <div className={styles.feedCopy}>{goLiveSummary.explanation}</div>
                    <div className={styles.heroPanelList}>
                      <div className={styles.heroPanelItem}>
                        <span>Environment</span>
                        <strong>{formatChannexEnvironmentLabel(channexConfig.environment)}</strong>
                      </div>
                      <div className={styles.heroPanelItem}>
                        <span>365-day sync</span>
                        <strong>{ariHealth.lastSuccessful365DaySync ? ariHealth.statusLabel : "Never synced"}</strong>
                      </div>
                      <div className={styles.heroPanelItem}>
                        <span>Critical conflicts</span>
                        <strong>{criticalConflictCount === 0 ? "None open" : `${criticalConflictCount} open`}</strong>
                      </div>
                      <div className={styles.heroPanelItem}>
                        <span>Open issues</span>
                        <strong>{conflictItems.length === 0 ? "None open" : `${conflictItems.length} open`}</strong>
                      </div>
                      <div className={styles.heroPanelItem}>
                        <span>Booking proof</span>
                        <strong>{bookingProofCompleted ? "Completed" : bookingImportTested ? "Partial" : "Needs test"}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className={styles.statGrid}>
                {metrics.map((metric) => (
                  <article key={metric.label} className={`${styles.card} ${styles.statCard}`}>
                    <div className={styles.statLabel}>{metric.label}</div>
                    <div className={styles.statValue}>{metric.value}</div>
                    <div className={styles.statHint}>{metric.hint}</div>
                  </article>
                ))}
              </section>

              <section className={styles.twoCol}>
                <article className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <h3 className={styles.cardTitle}>Setup Progress</h3>
                      <p className={styles.cardCopy}>
                        Go-live readiness for inventory, identity, and future provider mapping.
                      </p>
                    </div>
                    <span className={styles.badge}>{setupProgressPercent}% ready</span>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.checkGrid}>
                      {setupItems.slice(0, 6).map((item) => (
                        <div key={item.key} className={styles.checkItem}>
                          <div className={`${styles.checkIcon} ${item.complete ? styles.checkIconDone : styles.checkIconTodo}`}>
                            {item.complete ? <Check size={18} /> : <X size={18} />}
                          </div>
                          <div>
                            <div className={styles.checkTitle}>{item.title}</div>
                            <div className={styles.checkMeta}>{item.hint}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>

                <article className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <h3 className={styles.cardTitle}>Go-live readiness</h3>
                      <p className={styles.cardCopy}>
                        Read-only launch summary built from current Pro setup, mapping, booking, and sync signals.
                      </p>
                    </div>
                    <span className={`${styles.readinessPill} ${goLiveSummary.toneClass}`}>{goLiveSummary.label}</span>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.stack}>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Environment + guardrails</div>
                        <div className={styles.feedCopy}>
                          {formatChannexEnvironmentLabel(channexConfig.environment)} is selected and
                          {" "}
                          {channexConfig.environment === "production" && !channexConfig.productionMutationsAllowed
                            ? "production writes are still blocked by the safety flag."
                            : "the current mutation guardrails are aligned with this mode."}
                        </div>
                      </div>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Fresh 365-day sync</div>
                        <div className={styles.feedCopy}>
                          {hasRecent365DaySuccess
                            ? `A recent 365-day ARI sync is available from ${formatDateTime(ariHealth.lastSuccessful365DaySync?.createdAt ?? null)}.`
                            : "A fresh 365-day ARI sync is still required before live connection."}
                        </div>
                      </div>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Conflict queue</div>
                        <div className={styles.feedCopy}>
                          {criticalConflictCount === 0
                            ? "No critical conflicts are currently blocking launch."
                            : `${criticalConflictCount} critical conflicts still need review before any pilot decision.`}
                        </div>
                      </div>
                      {channelDetachedStagingIssue ? (
                        <div className={styles.feedItem}>
                          <div className={styles.feedTitle}>Staging channel reality</div>
                          <div className={styles.feedCopy}>
                            The current Booking.com staging channel looks detached or inactive. This can happen with shared test ids, but Famlo should still show the property as not ready until the channel is healthy again.
                          </div>
                        </div>
                      ) : null}
                      <div className={styles.inlineActionRow}>
                        <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection("setup-guide")}>
                          Open readiness checklist
                        </button>
                        <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection("conflicts")}>
                          Review conflicts
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              </section>

              <section className={styles.twoCol}>
                <article className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <h3 className={styles.cardTitle}>Action Center</h3>
                      <p className={styles.cardCopy}>
                        Priority tasks before a future multi-channel go-live.
                      </p>
                    </div>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.stack}>
                      {actionItems.map((item) => (
                        <div key={item.title} className={styles.actionItem}>
                          <div>
                            <div className={styles.actionTitle}>{item.title}</div>
                            <div className={styles.actionCopy}>{item.body}</div>
                          </div>
                          <span className={styles.badge}>{item.badge}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>

                <article className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <h3 className={styles.cardTitle}>Live Feed</h3>
                      <p className={styles.cardCopy}>
                        Operational feed placeholder for sync jobs, imports, and setup events.
                      </p>
                    </div>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.stack}>
                      {feedItems.map((item) => (
                        <div key={item.title} className={styles.feedItem}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                            <div className={styles.feedTitle}>{item.title}</div>
                            <span className={toneBadgeClass(item.tone)}>
                              {item.tone === "success" ? "Ready" : item.tone === "warning" ? "Blocked" : "Info"}
                            </span>
                          </div>
                          <div className={styles.feedCopy}>{item.body}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              </section>
            </>
          )}

          {activeSection !== "dashboard" && (
            <section className={styles.sectionIntro}>
              <div>
                <div className={styles.sectionEyebrow}>{sectionDescriptor.eyebrow}</div>
                <h2 className={styles.sectionTitle}>{sectionDescriptor.title}</h2>
                <p className={styles.sectionCopy}>{sectionDescriptor.copy}</p>
              </div>
              <span className={styles.sectionStatus}>{sectionDescriptor.status}</span>
            </section>
          )}

          {activeSection === "setup-guide" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                    <div>
                      <h3 className={styles.cardTitle}>Setup Guide</h3>
                      <p className={styles.cardCopy}>
                        Future PMS onboarding checklist for property identity, rates, rules, and channel readiness.
                      </p>
                    </div>
                <span className={styles.badge}>{setupProgressPercent}% ready</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.summaryGrid}>
                  <div className={styles.summaryCard}>
                    <div className={styles.summaryLabel}>Progress</div>
                    <div className={styles.summaryValue}>{setupProgressPercent}%</div>
                    <div className={styles.summaryCopy}>{completedSetupCount} of {setupItems.length} signals complete</div>
                  </div>
                  <div className={styles.summaryCard}>
                    <div className={styles.summaryLabel}>Completed</div>
                    <div className={styles.summaryValue}>{completedSetupCount}</div>
                    <div className={styles.summaryCopy}>Readiness signals already available from current Famlo data</div>
                  </div>
                  <div className={styles.summaryCard}>
                    <div className={styles.summaryLabel}>Missing</div>
                    <div className={styles.summaryValue}>{missingSetupItems.length}</div>
                    <div className={styles.summaryCopy}>Signals still blocked by missing Pro settings or future integrations</div>
                  </div>
                  <div className={styles.summaryCard}>
                    <div className={styles.summaryLabel}>Go-live verdict</div>
                    <div className={styles.summaryValue}>{goLiveSummary.label}</div>
                    <div className={styles.summaryCopy}>{goLiveSummary.explanation}</div>
                  </div>
                </div>

                <div className={styles.recommendationCard}>
                  <div className={styles.summaryLabel}>Recommended next action</div>
                  <div className={styles.recommendationText}>{recommendedNextAction}</div>
                  <div className={styles.inlineActionRow}>
                    <button type="button" className={styles.primaryActionButton} onClick={() => setActiveSection("settings")}>
                      Open Pro Settings
                    </button>
                  </div>
                </div>

                <div className={styles.listCard}>
                  <div className={styles.cardHeaderCompact}>
                    <div>
                      <div className={styles.listTitle}>Go-live readiness checklist</div>
                      <div className={styles.cardCopy}>
                        Live connection summary for Famlo+, mapping, ARI, booking proof, and safety guardrails.
                      </div>
                    </div>
                    <span className={`${styles.readinessPill} ${goLiveSummary.toneClass}`}>{goLiveSummary.label}</span>
                  </div>
                  <div className={styles.logList}>
                    {goLiveChecklist.map((item) => (
                      <article key={item.key} className={styles.logRow}>
                        <div>
                          <div className={styles.logTitle}>{item.title}</div>
                          <div className={styles.logCopy}>{item.explanation}</div>
                          <div className={styles.conflictActionCopy}>Recommended action: {item.recommendedAction}</div>
                        </div>
                        <div className={styles.logMeta}>
                          <span className={checklistStatusClass(item.status)}>{item.statusLabel}</span>
                          <button
                            type="button"
                            className={styles.secondaryActionButton}
                            onClick={() => setActiveSection(item.targetSection)}
                          >
                            Open section
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <div className={styles.checkGrid}>
                  {setupItems.map((item) => (
                    <div key={item.key} className={styles.checkItem}>
                      <div className={`${styles.checkIcon} ${item.complete ? styles.checkIconDone : styles.checkIconTodo}`}>
                        {item.complete ? <CheckCircle2 size={18} /> : <Lock size={18} />}
                      </div>
                      <div>
                        <div className={styles.checkTitle}>{item.title}</div>
                        {item.valueLabel ? <div className={styles.checkValue}>{item.valueLabel}</div> : null}
                        <div className={styles.checkMeta}>{item.hint}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className={styles.listGrid}>
                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Completed items</div>
                    <div className={styles.stack}>
                      {setupItems.filter((item) => item.complete).map((item) => (
                        <div key={item.key} className={styles.feedItem}>
                          <div className={styles.feedTitle}>{item.title}</div>
                          <div className={styles.feedCopy}>{item.hint}</div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Missing items</div>
                    <div className={styles.stack}>
                      {missingSetupItems.map((item) => (
                        <div key={item.key} className={styles.feedItem}>
                          <div className={styles.feedTitle}>{item.title}</div>
                          <div className={styles.feedCopy}>{item.hint}</div>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>
              </div>
            </section>
          )}

          {activeSection === "rooms-units" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Rooms</h3>
                  <p className={styles.cardCopy}>
                    Manage rooms for this selected property. Changes here update the Famlo property inventory.
                  </p>
                </div>
                <span className={styles.badge}>{rooms.length} units</span>
              </div>
              <div className={styles.cardBody}>
                <HostRoomsManager
                  familyId={familyId}
                  homeLat={propertyHomeLat ?? undefined}
                  homeLng={propertyHomeLng ?? undefined}
                  title="Rooms"
                  description="Manage rooms for this selected property."
                  propertyLabel={propertyLocalityLabel ?? locationLabel}
                  showChannelManager={false}
                  viewRoomPage
                  emptyTitle="No rooms yet"
                  emptyCopy="Create the first room for this property to start building your Famlo inventory."
                />

                {rooms.length > 0 ? (
                  <>
                    <div className={styles.inlineActionRow}>
                      <Link href={basicRoomUrl} className={styles.secondaryActionLink}>
                        Open the same room tools in Basic Dashboard
                      </Link>
                    </div>
                    <div className={styles.roomGrid}>
                      {rooms.map((room) => {
                        const readiness = roomReadinessChecklist(room);
                        const completedReadiness = readiness.filter((item) => item.complete).length;
                        return (
                          <article key={room.id} className={styles.roomCard}>
                            <div className={styles.roomHeader}>
                              <div>
                                <div className={styles.roomTitle}>{room.name}</div>
                                <div className={styles.roomCopy}>{room.unitType}</div>
                              </div>
                              <span className={`${styles.badge} ${room.isActive ? "" : styles.badgeMuted}`}>
                                {room.isActive ? "Open" : "Closed"}
                              </span>
                            </div>
                            <div className={styles.roomStats}>
                              <div className={styles.miniStat}>
                                <div className={styles.miniLabel}>Guests</div>
                                <div className={styles.miniValue}>{room.maxGuests}</div>
                              </div>
                              <div className={styles.miniStat}>
                                <div className={styles.miniLabel}>Base price</div>
                                <div className={styles.miniValue}>{formatCurrency(room.priceFullday)}</div>
                              </div>
                              <div className={styles.miniStat}>
                                <div className={styles.miniLabel}>Amenities</div>
                                <div className={styles.miniValue}>{room.amenitiesCount}</div>
                              </div>
                            </div>
                            <div className={styles.roomMetaGrid}>
                              <div className={styles.roomMetaItem}>
                                <span className={styles.roomMetaLabel}>Bed info</span>
                                <strong>{room.bedInfo ?? "Missing"}</strong>
                              </div>
                              <div className={styles.roomMetaItem}>
                                <span className={styles.roomMetaLabel}>Bathroom</span>
                                <strong>{room.bathroomType ?? "Missing"}</strong>
                              </div>
                              <div className={styles.roomMetaItem}>
                                <span className={styles.roomMetaLabel}>Photos</span>
                                <strong>{room.photosCount}</strong>
                              </div>
                              <div className={styles.roomMetaItem}>
                                <span className={styles.roomMetaLabel}>Provider mapping</span>
                                <strong>Not mapped</strong>
                              </div>
                            </div>
                            <div className={styles.roomReadinessRow}>
                              <span className={styles.badge}>{completedReadiness}/{readiness.length} ready</span>
                              {readiness.map((item) => (
                                <span
                                  key={item.label}
                                  className={`${styles.readinessPill} ${item.complete ? styles.readinessPillOk : styles.readinessPillMissing}`}
                                >
                                  {item.label}: {item.complete ? "Done" : "Missing"}
                                </span>
                              ))}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyTitle}>No room units surfaced yet</div>
                    <div className={styles.emptyCopy}>
                      Famlo Pro looks for existing room data through the current `stay_units_v2` helper path. If no safe
                      room rows are available yet, this section remains a placeholder until inventory is ready.
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeSection === "rates-restrictions" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Rates & Restrictions</h3>
                  <p className={styles.cardCopy}>
                    Manual staging ARI push is available here. Automated sync, scheduling, and production rollout are still intentionally disabled.
                  </p>
                </div>
                <span className={`${styles.badge} ${styles.badgeMuted}`}>Manual only</span>
              </div>
              <div className={styles.cardBody}>
                <ChannexAriSyncCard
                  familyId={familyId}
                  eligibleRooms={ariSyncEligibleRooms}
                  missingRooms={ariMissingRooms}
                  propertyCreated={canCreateRoomTypes}
                  roomTypesCreated={canCreateRatePlans}
                  lastSyncLog={lastAriSyncLog}
                  ariHealth={ariHealth}
                />
                <div className={styles.placeholderGrid}>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Standard Rate Plan</div>
                    <div className={styles.placeholderValue}>{standardRatePlanName}</div>
                    <div className={styles.placeholderCopy}>Saved from Famlo Pro settings and ready for future distribution mapping.</div>
                  </div>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Provider Sync</div>
                    <div className={styles.placeholderValue}>Manual staging</div>
                    <div className={styles.placeholderCopy}>30-day and 365-day pushes are operator-triggered only. No cron or automatic sync is enabled yet.</div>
                  </div>
                </div>
                <div className={styles.rateTable}>
                  <div className={styles.mappingHeader}>Room</div>
                  <div className={styles.mappingHeader}>Standard Base Price</div>
                  <div className={styles.mappingHeader}>Weekend Rate</div>
                  <div className={styles.mappingHeader}>Min Stay</div>
                  <div className={styles.mappingHeader}>Max Stay</div>
                  <div className={styles.mappingHeader}>Stop Sell</div>
                  <div className={styles.mappingHeader}>CTA / CTD</div>
                  <div className={styles.mappingHeader}>Meal Plan</div>
                  {(rooms.length > 0 ? rooms : [{ id: "placeholder", name: "No rooms surfaced", unitType: "", description: null, maxGuests: 0, bedInfo: null, bathroomType: null, priceFullday: 0, isActive: false, amenitiesCount: 0, photosCount: 0 }]).map((room) => (
                    <Fragment key={room.id}>
                      <div className={styles.mappingCell}>
                        <div className={styles.mappingTitle}>{room.name}</div>
                        <div className={styles.mappingSubcopy}>{room.unitType || "Famlo room"}</div>
                      </div>
                      <div className={styles.mappingCell}>
                        <div className={styles.mappingTitle}>{room.priceFullday > 0 ? formatCurrency(room.priceFullday) : "Missing"}</div>
                        <div className={styles.mappingSubcopy}>Derived from existing room price fields</div>
                      </div>
                      <div className={styles.mappingCellMuted}>Coming soon</div>
                      <div className={styles.mappingCellMuted}>Coming soon</div>
                      <div className={styles.mappingCellMuted}>Coming soon</div>
                      <div className={styles.mappingCellMuted}>Coming soon</div>
                      <div className={styles.mappingCellMuted}>Coming soon</div>
                      <div className={styles.mappingCellMuted}>{initialSettings.defaultMealPlan.replaceAll("_", " ")}</div>
                    </Fragment>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeSection === "inventory-calendar" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Calendar</h3>
                  <p className={styles.cardCopy}>
                    Professional read-only channel-manager view for the next 30 days. Existing Famlo calendar logic and iCal behavior remain untouched in this phase.
                  </p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.placeholderGrid}>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Calendar window</div>
                    <div className={styles.placeholderValue}>
                      {calendarWindow.startDate} → {calendarWindow.endDate}
                    </div>
                    <div className={styles.placeholderCopy}>
                      {calendarWindow.isCustomRange
                        ? "Custom verification window is active for this Pro calendar view."
                        : "Default rolling 30-day Pro calendar window."}
                    </div>
                  </div>
                  {calendarWindow.verificationUrl ? (
                    <div className={styles.placeholderRow}>
                      <div className={styles.placeholderTitle}>Booking.com verification</div>
                      <div className={styles.placeholderValue}>{calendarWindow.verificationTargetLabel ?? "Ready"}</div>
                      <div className={styles.placeholderCopy}>
                        Open the June verification window to inspect the real Booking.com test stay without changing booking logic.
                      </div>
                      <div className={styles.inlineActionRow}>
                        <Link href={calendarWindow.verificationUrl} className={styles.secondaryActionLink}>
                          Open June verification window
                        </Link>
                      </div>
                    </div>
                  ) : null}
                </div>
                {calendarVerification ? (
                  <div className={`${styles.feedbackBox} ${calendarVerification.targetDateBlocked && !calendarVerification.checkoutDateBlocked ? styles.feedbackSuccess : styles.feedbackError}`}>
                    {calendarVerification.sourceLabel} for {calendarVerification.roomName}:{" "}
                    {calendarVerification.targetDate} {calendarVerification.targetDateBlocked ? "is blocked" : "is not blocked"} and{" "}
                    {calendarVerification.checkoutDate} {calendarVerification.checkoutDateBlocked ? "is blocked" : "stays available"}.
                  </div>
                ) : null}
                <div className={styles.filterRow}>
                  {CALENDAR_LEGEND.map((item) => (
                    <span key={item.title} className={styles.filterChip}>
                      {item.title} = {item.copy}
                    </span>
                  ))}
                </div>
                {calendarRows.length > 0 ? (
                  <div className={styles.calendarBoard}>
                    <div className={styles.calendarGrid}>
                      <div className={`${styles.calendarHeaderCell} ${styles.calendarRoomHeader}`}>Room / Unit</div>
                      {calendarColumns.map((column) => (
                        <div key={column.date} className={styles.calendarHeaderCell}>
                          <div className={styles.calendarHeaderDay}>{column.dayLabel}</div>
                          <div className={styles.calendarHeaderDate}>{column.dateLabel}</div>
                        </div>
                      ))}

                      {calendarRows.map((row) => (
                        <Fragment key={row.roomId}>
                          <div className={styles.calendarRoomCell}>
                            <div className={styles.calendarRoomName}>{row.roomName}</div>
                            <div className={styles.calendarRoomType}>{row.unitType}</div>
                            <div className={styles.calendarMetricLabel}>Availability</div>
                          </div>
                          {row.availabilityCells.map((cell) => (
                            <button
                              type="button"
                              key={`${row.roomId}-${cell.date}-availability`}
                              className={`${styles.calendarCell} ${calendarCellClass(cell.status)} ${cell.bookingDetail ? styles.calendarCellInteractive : ""}`}
                              title={cell.label}
                              onClick={() => {
                                if (cell.bookingDetail) {
                                  setSelectedCalendarBooking(cell.bookingDetail);
                                }
                              }}
                              disabled={!cell.bookingDetail}
                            >
                              {cell.status === "available" ? "1" : cell.status === "past" ? "—" : "0"}
                            </button>
                          ))}

                          <div className={`${styles.calendarRoomCell} ${styles.calendarRateLabel}`}>
                            <div className={styles.calendarMetricLabel}>Rate</div>
                            <div className={styles.calendarRoomType}>Read-only base price</div>
                          </div>
                          {row.rateCells.map((value, index) => (
                            <div
                              key={`${row.roomId}-${calendarColumns[index]?.date ?? index}-rate`}
                              className={`${styles.calendarCell} ${calendarColumns[index]?.isPast ? styles.calendarCellPast : styles.calendarRateCell}`}
                            >
                              {value}
                            </div>
                          ))}
                        </Fragment>
                      ))}
                    </div>
                    {selectedCalendarBooking ? (
                      <div className={styles.calendarDrawerOverlay} onClick={() => setSelectedCalendarBooking(null)}>
                        <aside
                          className={styles.calendarDrawer}
                          onClick={(event) => event.stopPropagation()}
                          aria-label="Booking details"
                        >
                          <div className={styles.calendarDrawerHeader}>
                            <div>
                              <div className={styles.listTitle}>Booking details</div>
                              <div className={styles.cardCopy}>
                                Read-only operational view for the selected Pro calendar booking cell.
                              </div>
                            </div>
                            <button
                              type="button"
                              className={styles.drawerCloseButton}
                              onClick={() => setSelectedCalendarBooking(null)}
                              aria-label="Close booking details"
                            >
                              <X className={styles.drawerCloseIcon} />
                            </button>
                          </div>

                          <div className={styles.drawerSummaryGrid}>
                            <div className={styles.placeholderRow}>
                              <div className={styles.placeholderTitle}>Booking source</div>
                              <div className={styles.placeholderValue}>{selectedCalendarBooking.sourceLabel}</div>
                            </div>
                            <div className={styles.placeholderRow}>
                              <div className={styles.placeholderTitle}>Room name</div>
                              <div className={styles.placeholderValue}>{selectedCalendarBooking.roomName}</div>
                            </div>
                            <div className={styles.placeholderRow}>
                              <div className={styles.placeholderTitle}>Dates</div>
                              <div className={styles.placeholderValue}>
                                {formatCalendarDetailDateRange(
                                  selectedCalendarBooking.startDate,
                                  selectedCalendarBooking.endDate
                                )}
                              </div>
                            </div>
                            <div className={styles.placeholderRow}>
                              <div className={styles.placeholderTitle}>Guest</div>
                              <div className={styles.placeholderValue}>{selectedCalendarBooking.guestDisplayName}</div>
                            </div>
                            <div className={styles.placeholderRow}>
                              <div className={styles.placeholderTitle}>Amount / currency</div>
                              <div className={styles.placeholderValue}>
                                {selectedCalendarBooking.amount ?? "Not available"}
                                {selectedCalendarBooking.currency ? ` · ${selectedCalendarBooking.currency}` : ""}
                              </div>
                            </div>
                            <div className={styles.placeholderRow}>
                              <div className={styles.placeholderTitle}>Payment status</div>
                              <div className={styles.placeholderValue}>
                                {labelizeToken(selectedCalendarBooking.paymentStatus, "unknown")}
                              </div>
                            </div>
                          </div>

                          <div className={styles.drawerDetailTable}>
                            <div className={styles.mappingHeader}>Field</div>
                            <div className={styles.mappingHeader}>Value</div>

                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>Famlo booking ID</div>
                            </div>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>
                                {selectedCalendarBooking.linkedBookingId ?? selectedCalendarBooking.bookingId ?? "Not linked"}
                              </div>
                            </div>

                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>External booking ID</div>
                            </div>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>{selectedCalendarBooking.externalBookingId ?? "Not available"}</div>
                            </div>

                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>Import status</div>
                            </div>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>
                                {selectedCalendarBooking.sourceLabel === "Channex / OTA"
                                  ? labelizeToken(selectedCalendarBooking.importStatus, "unknown")
                                  : "Not applicable"}
                              </div>
                            </div>

                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>Ack status</div>
                            </div>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>
                                {selectedCalendarBooking.sourceLabel === "Channex / OTA"
                                  ? labelizeToken(selectedCalendarBooking.ackStatus, "unknown")
                                  : "Not applicable"}
                              </div>
                            </div>

                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>Imported into Famlo</div>
                            </div>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>{selectedCalendarBooking.importedIntoFamlo ? "Yes" : "No"}</div>
                            </div>

                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>Acknowledged</div>
                            </div>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>{selectedCalendarBooking.acknowledged ? "Yes" : "No"}</div>
                            </div>

                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>Feed revision ID</div>
                            </div>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>{selectedCalendarBooking.externalRevisionId ?? "Not available"}</div>
                            </div>

                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>Booking List revision ID</div>
                            </div>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>{selectedCalendarBooking.bookingListRevisionId ?? "Not available"}</div>
                            </div>

                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>Feed status</div>
                            </div>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>
                                {selectedCalendarBooking.feedStatus === "not_applicable"
                                  ? "Not applicable"
                                  : labelizeToken(selectedCalendarBooking.feedStatus, "unknown")}
                              </div>
                            </div>

                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>CRS-only / manual indicator</div>
                            </div>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>{selectedCalendarBooking.isCrsOnly ? "Yes" : "No"}</div>
                            </div>

                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>Ack eligibility</div>
                            </div>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>
                                {selectedCalendarBooking.sourceLabel === "Channex / OTA"
                                  ? selectedCalendarBooking.ackEligible
                                    ? "Eligible"
                                    : "Blocked until real feed revision"
                                  : "Not applicable"}
                              </div>
                            </div>
                          </div>

                          {selectedCalendarBooking.acknowledgementNote ? (
                            <div className={`${styles.feedbackBox} ${styles.feedbackError}`}>
                              {selectedCalendarBooking.acknowledgementNote}
                            </div>
                          ) : null}
                        </aside>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyTitle}>No room inventory available for Pro calendar</div>
                    <div className={styles.emptyCopy}>
                      The read-only Pro calendar needs existing stay units to render rows. Once rooms are available, Famlo and imported OTA bookings will appear here without changing the current calendar system.
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeSection === "availability-rules" && (
            <PlaceholderSection
              title="Availability Rules"
              copy="Placeholder shell for length-of-stay controls, stop-sell logic, and future rule inheritance."
              items={[
                "Lead time rules",
                "Minimum stay by date range",
                "Maximum stay by season",
                "Arrival / departure restrictions",
              ]}
            />
          )}

          {activeSection === "check-times" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Check-in / Check-out Time</h3>
                  <p className={styles.cardCopy}>
                    Read-only operating-time state from current Famlo setup, with future policy controls held back for a later phase.
                  </p>
                </div>
                <span className={`${styles.badge} ${styles.badgeMuted}`}>Read-only</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.placeholderGrid}>
                  {[
                    setupItems.find((item) => item.key === "check-in-time"),
                    setupItems.find((item) => item.key === "check-out-time"),
                  ]
                    .filter((item): item is SetupItem => Boolean(item))
                    .map((item) => (
                      <div key={item.key} className={styles.placeholderRow}>
                        <div className={styles.placeholderTitle}>{item.title}</div>
                        <div className={styles.placeholderValue}>{item.valueLabel ?? "Not set"}</div>
                        <div className={styles.placeholderCopy}>{item.hint}</div>
                      </div>
                    ))}
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Early check-in policy</div>
                    <div className={styles.placeholderValue}>Coming soon</div>
                    <div className={styles.placeholderCopy}>Future Pro policy controls will appear here without changing current booking flows.</div>
                  </div>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Late check-out policy</div>
                    <div className={styles.placeholderValue}>Coming soon</div>
                    <div className={styles.placeholderCopy}>Distribution-facing departure rules remain intentionally inactive in this phase.</div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === "connected-channels" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Connected Channels</h3>
                  <p className={styles.cardCopy}>
                    Provider-neutral shell. Use this panel as the safe handoff checklist before you connect the Booking.com staging channel inside Channex.
                  </p>
                </div>
                <span className={`${styles.badge} ${primaryProperty?.externalPropertyId ? "" : styles.badgeMuted}`.trim()}>
                  {primaryProperty?.externalPropertyId ? "Property ready" : "Not connected"}
                </span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.providerCard}>
                  <div className={styles.providerCardHeader}>
                    <div>
                      <div className={styles.cardTitle}>{primaryProvider?.name ?? "Channex"}</div>
                      <div className={styles.cardCopy}>
                        First planned provider inside a provider-neutral Famlo foundation.
                      </div>
                    </div>
                    <span className={`${styles.badge} ${primaryProperty?.externalPropertyId ? "" : styles.badgeMuted}`.trim()}>
                      {labelizeToken(primaryProperty?.syncStatus ?? "not_connected", primaryProperty?.externalPropertyId ? "Created" : "Not connected")}
                    </span>
                  </div>
                  <div className={styles.providerMetaRow}>
                    <span className={styles.filterChip}>Environment: {formatChannexEnvironmentLabel(channexConfig.environment)}</span>
                    <span className={styles.filterChip}>Foundation: {providerFoundationReady ? "Ready" : "Missing"}</span>
                    <span className={styles.filterChip}>Property id: {primaryProperty?.externalPropertyId ?? "Missing"}</span>
                    <span className={styles.filterChip}>Last sync: {formatDateTime(primaryProperty?.lastSyncedAt ?? null)}</span>
                  </div>
                  <div className={styles.providerMetaRow}>
                    {channelHealthSummaryBadges.map((badge) => (
                      <span key={badge} className={styles.filterChip}>{badge}</span>
                    ))}
                  </div>
                  <div className={styles.providerActionRow}>
                    <button
                      type="button"
                      className={styles.secondaryActionButton}
                      onClick={() => setActiveSection("room-mapping")}
                    >
                      Prepare mapping
                    </button>
                  </div>
                </div>
                <div className={`${styles.feedbackBox} ${channelHealthNeedsAttention ? styles.feedbackError : styles.feedbackSuccess}`}>
                  {channelHealthNeedsAttention
                    ? "Needs attention: Channex channel health shows a detached channel, poll error, pending apply work, or unacknowledged revisions."
                    : "Channel health looks stable: attached, active, and recently polled without pending feed work."}
                  <div className={styles.inlineBadgeRow}>
                    <span className={`${styles.readinessPill} ${currentChannelAttached ? styles.readinessPillOk : styles.readinessPillMissing}`}>
                      Attached: {currentChannelAttached ? "Yes" : "No"}
                    </span>
                    <span className={`${styles.readinessPill} ${currentChannelAttached ? styles.readinessPillOk : styles.readinessPillMissing}`}>
                      Active: {currentChannelAttached ? "Yes" : "No"}
                    </span>
                    <span className={`${styles.readinessPill} ${(channelFeedHealth?.unackedRevisionsCount ?? 0) === 0 ? styles.readinessPillOk : styles.readinessPillReview}`}>
                      Unacked: {channelFeedHealth?.unackedRevisionsCount ?? 0}
                    </span>
                    <span className={`${styles.readinessPill} ${(channelFeedHealth?.failedImportCount ?? 0) === 0 ? styles.readinessPillOk : styles.readinessPillMissing}`}>
                      Failed imports: {channelFeedHealth?.failedImportCount ?? 0}
                    </span>
                    <span className={`${styles.readinessPill} ${(channelFeedHealth?.pendingApplyCount ?? 0) === 0 ? styles.readinessPillOk : styles.readinessPillReview}`}>
                      Pending apply: {channelFeedHealth?.pendingApplyCount ?? 0}
                    </span>
                    <span className={`${styles.readinessPill} ${channelHealthNeedsAttention ? styles.readinessPillReview : styles.readinessPillOk}`}>
                      Auto-apply state: {autoApplyStateLabel}
                    </span>
                    <span className={`${styles.readinessPill} ${
                      ariHealth.statusLabel === "Synced"
                        ? styles.readinessPillOk
                        : ariHealth.statusLabel === "Channel disconnected" || ariHealth.statusLabel === "Sync failed"
                          ? styles.readinessPillMissing
                          : styles.readinessPillReview
                    }`}>
                      Daily ARI: {ariHealth.statusLabel}
                    </span>
                  </div>
                  <div className={styles.placeholderGrid} style={{ marginTop: 14 }}>
                    <div className={styles.placeholderRow}>
                      <div className={styles.placeholderTitle}>Last feed poll</div>
                      <div className={styles.placeholderValue}>{formatDateTime(channelFeedHealth?.lastPollAt ?? null)}</div>
                      <div className={styles.placeholderCopy}>
                        Last successful poll: {formatDateTime(channelFeedHealth?.lastSuccessfulPollAt ?? null)}
                      </div>
                    </div>
                    <div className={styles.placeholderRow}>
                      <div className={styles.placeholderTitle}>Active channel</div>
                      <div className={styles.placeholderValue}>{currentChannelReference ?? "Not visible"}</div>
                      <div className={styles.placeholderCopy}>
                        Feed health: channel id {channelFeedHealth?.activeChannelId ?? "Missing"} · hotel {channelFeedHealth?.hotelId ?? "Missing"} · attached count {channelFeedHealth?.accChannelsCount ?? 0}
                        {channelAriHealth ? ` · Daily ARI sees attached count ${channelAriHealth.accChannelsCount ?? 0}` : ""}
                      </div>
                    </div>
                    <div className={styles.placeholderRow}>
                      <div className={styles.placeholderTitle}>Last error</div>
                      <div className={styles.placeholderValue}>{channelFeedHealth?.lastError ? "Present" : "None"}</div>
                      <div className={styles.placeholderCopy}>
                        {channelFeedHealth?.lastError
                          ? `${channelFeedHealth.lastError} (${formatDateTime(channelFeedHealth.lastErrorAt ?? null)})`
                          : "No recent polling error recorded."}
                      </div>
                    </div>
                    <div className={styles.placeholderRow}>
                      <div className={styles.placeholderTitle}>Auto-apply summary</div>
                      <div className={styles.placeholderValue}>
                        {channelFeedHealth?.autoAppliedCount ?? 0} applied · {channelFeedHealth?.pendingManualReviewCount ?? 0} waiting review
                      </div>
                      <div className={styles.placeholderCopy}>
                        Last auto-apply: {formatDateTime(channelFeedHealth?.lastAutoApplyAt ?? null)}. {channelFeedHealth?.lastAutoApplyMessage ?? "No automatic apply run recorded yet."}
                      </div>
                    </div>
                    <div className={styles.placeholderRow}>
                      <div className={styles.placeholderTitle}>Auto-apply counters</div>
                      <div className={styles.placeholderValue}>
                        New imports {channelFeedHealth?.autoImportedCount ?? 0} · Cancellations {channelFeedHealth?.autoCancelledCount ?? 0}
                      </div>
                      <div className={styles.placeholderCopy}>
                        Failed auto-apply: {channelFeedHealth?.failedAutoApplyCount ?? 0} · acknowledged automatically: {channelFeedHealth?.acknowledgedCount ?? 0}
                      </div>
                    </div>
                    <div className={styles.placeholderRow}>
                      <div className={styles.placeholderTitle}>Daily ARI sync</div>
                      <div className={styles.placeholderValue}>{ariHealth.statusLabel}</div>
                      <div className={styles.placeholderCopy}>
                        Last sync: {formatDateTime(ariHealth.lastAriSyncAt)} · Last success: {formatDateTime(ariHealth.lastSuccessfulAriSyncAt)}
                      </div>
                    </div>
                    <div className={styles.placeholderRow}>
                      <div className={styles.placeholderTitle}>ARI range + verification</div>
                      <div className={styles.placeholderValue}>
                        {ariHealth.syncedDateRange
                          ? `${ariHealth.syncedDateRange.from} → ${ariHealth.syncedDateRange.to}`
                          : "Not synced yet"}
                      </div>
                      <div className={styles.placeholderCopy}>
                        {channelAriHealth
                          ? `${channelAriHealth.verifiedAvailabilityCount} availability · ${channelAriHealth.verifiedRateCount} rates · ${channelAriHealth.verifiedMinStayThroughCount} min-stay checks`
                          : "No daily ARI verification summary yet."}
                      </div>
                    </div>
                    <div className={styles.placeholderRow}>
                      <div className={styles.placeholderTitle}>ARI last error</div>
                      <div className={styles.placeholderValue}>{ariHealth.lastAriSyncError ? "Present" : "None"}</div>
                      <div className={styles.placeholderCopy}>
                        {ariHealth.lastAriSyncError
                          ? `${ariHealth.lastAriSyncError} · failures in a row ${ariHealth.consecutiveAriFailures}`
                          : "No daily ARI sync error recorded."}
                      </div>
                    </div>
                  </div>
                </div>
                <div className={styles.mappingTable}>
                  <div className={styles.mappingHeader}>Booking.com staging checklist</div>
                  <div className={styles.mappingHeader}>Value</div>
                  <div className={styles.mappingHeader}>Status</div>
                  {bookingComManualChecklist.map((item) => {
                    const ready = item.value !== "Missing";
                    return (
                      <Fragment key={item.label}>
                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>{item.label}</div>
                        </div>
                        <div className={styles.mappingCellMuted}>{item.value}</div>
                        <div className={styles.mappingCell}>
                          <span className={`${styles.badge} ${ready ? "" : styles.badgeMuted}`.trim()}>
                            {ready ? "Ready" : "Needs action"}
                          </span>
                        </div>
                      </Fragment>
                    );
                  })}
                </div>
                <div className={styles.placeholderGrid}>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Manual Channex steps</div>
                    <div className={styles.placeholderValue}>Booking.com staging/test channel</div>
                    <div className={styles.placeholderCopy}>
                      In Channex dashboard, connect the Booking.com test channel for this GBP property, map room type
                      <strong> {firstMappedRoom?.mapping?.externalRoomTypeId ?? " MISSING "}</strong>
                      and rate plan
                      <strong> {firstMappedRatePlan?.ratePlan?.externalRatePlanId ?? " MISSING "}</strong>,
                      then activate the channel before feed polling. Automatic cron polling now reads preview revisions, but pending imports/cancellations still stay visible for operator review.
                    </div>
                  </div>
                </div>
                <div className={styles.channelGrid}>
                  {CHANNEL_CARDS.map((channel) => (
                    <article key={channel} className={styles.channelCard}>
                      <div className={styles.channelHeader}>
                        <div>
                          <div className={styles.channelTitle}>{channel}</div>
                          <div className={styles.channelCopy}>Provider connection placeholder</div>
                        </div>
                        <span className={`${styles.badge} ${channel === "Booking.com" && (channelFeedHealth?.channelAttached ?? false) ? "" : styles.badgeMuted}`.trim()}>
                          {channel === "Booking.com"
                            ? ((channelFeedHealth?.channelAttached ?? false) ? ((channelFeedHealth?.channelActive ?? false) ? "Active" : "Attached") : "Not connected")
                            : "Not connected"}
                        </span>
                      </div>
                      <div className={styles.channelMeta}>
                        <span className={styles.filterChip}>Environment: {formatChannexEnvironmentLabel(channexConfig.environment)}</span>
                        <span className={styles.filterChip}>
                          {channel === "Booking.com"
                            ? `Last poll: ${formatDateTime(channelFeedHealth?.lastPollAt ?? null)}`
                            : "Full sync: Not started"}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeSection === "room-mapping" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Room Mapping</h3>
                  <p className={styles.cardCopy}>
                    Placeholder mapping workspace for future room-type linking. No provider mapping exists yet.
                  </p>
                </div>
                <span className={`${styles.badge} ${styles.badgeMuted}`}>Not connected</span>
              </div>
              <div className={styles.cardBody}>
                <ChannexRoomTypeBatchCard
                  familyId={familyId}
                  propertyCreated={canCreateRoomTypes}
                />
                <div className={styles.mappingTable}>
                  <div className={styles.mappingHeader}>Famlo Room</div>
                  <div className={styles.mappingHeader}>Provider Room Type</div>
                  <div className={styles.mappingHeader}>Status</div>
                  {roomMappingRows.map(({ room, mapping, providerRoomType, statusLabel }) => (
                    <Fragment key={room.id}>
                      <div className={styles.mappingCell}>
                        <div className={styles.mappingTitle}>{room.name}</div>
                        <div className={styles.mappingSubcopy}>{room.unitType || "Famlo inventory unit"}</div>
                      </div>
                      <div className={styles.mappingCellMuted}>{providerRoomType}</div>
                      <div className={styles.mappingCell}>
                        <span className={`${styles.badge} ${mapping?.externalRoomTypeId ? "" : styles.badgeMuted}`.trim()}>
                          {statusLabel}
                        </span>
                      </div>
                    </Fragment>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeSection === "rate-mapping" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Rate Mapping</h3>
                  <p className={styles.cardCopy}>
                    Placeholder mapping workspace for future standard and derived rate plans.
                  </p>
                </div>
                <span className={`${styles.badge} ${styles.badgeMuted}`}>Not connected</span>
              </div>
              <div className={styles.cardBody}>
                <ChannexRatePlanBatchCard
                  familyId={familyId}
                  propertyCreated={canCreateRoomTypes}
                  roomTypesCreated={canCreateRatePlans}
                />
                <div className={styles.mappingTable}>
                  <div className={styles.mappingHeader}>Famlo Rate</div>
                  <div className={styles.mappingHeader}>Provider Rate Plan</div>
                  <div className={styles.mappingHeader}>Status</div>
                  {rateMappingRows.map(({ room, ratePlan, providerRatePlan, statusLabel }) => (
                    <Fragment key={room.id}>
                      <div className={styles.mappingCell}>
                        <div className={styles.mappingTitle}>{standardRatePlanName}</div>
                        <div className={styles.mappingSubcopy}>{room.name}</div>
                      </div>
                      <div className={styles.mappingCellMuted}>{providerRatePlan}</div>
                      <div className={styles.mappingCell}>
                        <span className={`${styles.badge} ${ratePlan?.externalRatePlanId ? "" : styles.badgeMuted}`.trim()}>
                          {statusLabel}
                        </span>
                      </div>
                    </Fragment>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeSection === "sync-logs" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Sync Logs</h3>
                  <p className={styles.cardCopy}>
                    Read-only operational history for Channex and provider-neutral channel actions already recorded for this property.
                  </p>
                </div>
                <span className={`${styles.badge} ${styles.badgeMuted}`}>
                  {channelFoundation.syncLogs.length > 0 ? "History available" : "No activity"}
                </span>
              </div>
              <div className={styles.cardBody}>
                {groupedSyncLogs.length > 0 ? (
                  <div className={styles.stack}>
                    {groupedSyncLogs.map((group) => (
                      <section key={group.key} className={styles.cardInset}>
                        <div className={styles.cardHeaderCompact}>
                          <div>
                            <div className={styles.listTitle}>{group.title}</div>
                            <div className={styles.cardCopy}>
                              {group.logs.length} log {group.logs.length === 1 ? "entry" : "entries"} in this operational group.
                            </div>
                          </div>
                          <span className={styles.badge}>{group.logs.length}</span>
                        </div>
                        <div className={styles.logList}>
                          {group.logs.map((log) => {
                            const payloadSummary = summarizeSafePayload(log.payload);
                            return (
                              <article key={log.id} className={styles.logRow}>
                                <div>
                                  <div className={styles.logTitle}>{labelizeToken(log.action, "Sync action")}</div>
                                  <div className={styles.logCopy}>{log.message ?? "No detail message stored."}</div>
                                  <div className={styles.inlineBadgeRow} style={{ marginTop: 10 }}>
                                    <span className={styles.readinessPill}>{labelizeToken(log.providerCode, "provider")}</span>
                                    <span className={`${styles.readinessPill} ${log.status === "success" ? styles.readinessPillOk : styles.readinessPillReview}`}>
                                      {labelizeToken(log.status, "Unknown")}
                                    </span>
                                  </div>
                                  {payloadSummary.length > 0 ? (
                                    <div className={styles.payloadSummaryList}>
                                      {payloadSummary.map((line) => (
                                        <div key={`${log.id}-${line}`} className={styles.payloadSummaryItem}>
                                          {line}
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                                <div className={styles.logMeta}>
                                  <span className={styles.logTimestamp}>{formatDateTime(log.createdAt)}</span>
                                  <span className={styles.logTimestamp}>{formatRelativeAge(log.createdAt, timeAnchor)}</span>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyTitle}>No sync jobs yet</div>
                    <div className={styles.emptyCopy}>
                      No provider actions have been recorded for this property yet. Once property creation, mapping, ARI push, or booking workflows run, their safe summaries will appear here.
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeSection === "conflicts" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Conflicts</h3>
                  <p className={styles.cardCopy}>
                    Read-only operational queue for booking acknowledgement gaps, mapping issues, failed syncs, and stale provider state.
                  </p>
                </div>
                <span className={`${styles.badge} ${conflictItems.length > 0 ? styles.badgeMuted : ""}`.trim()}>
                  {conflictItems.length > 0 ? `${conflictItems.length} issues` : "No conflicts"}
                </span>
              </div>
              <div className={styles.cardBody}>
                {conflictItems.length > 0 ? (
                  <div className={styles.logList}>
                    {conflictItems.map((item) => (
                      <article key={item.key} className={styles.logRow}>
                        <div>
                          <div className={styles.logTitle}>{item.title}</div>
                          <div className={styles.logCopy}>{item.summary}</div>
                          {item.relatedLabel ? (
                            <div className={styles.conflictActionCopy}>Related: {item.relatedLabel}</div>
                          ) : null}
                          {item.lastDetectedAt ? (
                            <div className={styles.conflictActionCopy}>Last detected: {formatDateTime(item.lastDetectedAt)}</div>
                          ) : null}
                          <div className={styles.conflictActionCopy}>Recommended action: {item.recommendedAction}</div>
                        </div>
                        <div className={styles.logMeta}>
                          <span
                            className={`${styles.readinessPill} ${
                              item.severity === "critical"
                                ? styles.readinessPillMissing
                                : item.severity === "warning"
                                  ? styles.readinessPillReview
                                  : styles.readinessPillOk
                            }`}
                          >
                            {item.severity === "critical"
                              ? "Critical"
                              : item.severity === "warning"
                                ? "Warning"
                                : "Info"}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyTitle}>Nothing to reconcile</div>
                    <div className={styles.emptyCopy}>
                      With {connectedPropertyCount} connected properties and the current sync state, there are no room, rate, acknowledgement, or stale-sync issues to review right now.
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeSection === "bookings" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Bookings</h3>
                  <p className={styles.cardCopy}>
                    Source-aware booking workspace shell. Existing `bookings_v2` and booking APIs remain untouched.
                  </p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <ChannexBookingFeedCard
                  familyId={familyId}
                  propertyCreated={canCreateRoomTypes}
                  externalPropertyId={primaryProperty?.externalPropertyId ?? null}
                  lastSyncLog={lastBookingFeedLog}
                  storedRevisions={channelFoundation.bookingRevisions}
                  proBookings={proBookings}
                />
                <ChannexBookingListVerifyCard
                  familyId={familyId}
                  propertyCreated={canCreateRoomTypes}
                  externalPropertyId={primaryProperty?.externalPropertyId ?? null}
                  storedRevisions={channelFoundation.bookingRevisions}
                />
                <ChannexBookingRevisionVisibilityCard
                  familyId={familyId}
                  propertyCreated={canCreateRoomTypes}
                  externalPropertyId={primaryProperty?.externalPropertyId ?? null}
                  lastFeedLog={lastBookingFeedLog}
                  storedRevisions={channelFoundation.bookingRevisions}
                />
                <div className={styles.filterRow}>
                  {BOOKING_FILTERS.map((filter) => (
                    <span key={filter} className={styles.filterChip}>{filter}</span>
                  ))}
                </div>
                {proBookings.length > 0 ? (
                  <div className={styles.mappingTable}>
                    <div className={styles.mappingHeader}>Booking</div>
                    <div className={styles.mappingHeader}>Source</div>
                    <div className={styles.mappingHeader}>Dates</div>
                    <div className={styles.mappingHeader}>Guest / Room</div>
                    <div className={styles.mappingHeader}>Import / Ack</div>
                    <div className={styles.mappingHeader}>Amount / payment</div>
                    {proBookings.map((booking) => (
                      <Fragment key={booking.bookingId}>
                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>{booking.externalBookingId ?? booking.bookingId}</div>
                          <div className={styles.mappingSubcopy}>
                            {labelizeToken(booking.status, "unknown")} · {booking.linkedBookingId ?? booking.bookingId}
                          </div>
                        </div>
                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>{booking.sourceLabel}</div>
                          <div className={styles.mappingSubcopy}>
                            {booking.isOta ? `Feed ${booking.externalRevisionId ?? "missing"}` : "Famlo direct"}
                          </div>
                        </div>
                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>{booking.startDate} → {booking.endDate}</div>
                          <div className={styles.mappingSubcopy}>Created {formatDateTime(booking.createdAt)}</div>
                        </div>
                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>{booking.guestDisplayName}</div>
                          <div className={styles.mappingSubcopy}>{booking.roomName}</div>
                        </div>
                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>
                            {booking.isOta
                              ? `${labelizeToken(booking.importStatus, "preview")} · ${labelizeToken(booking.ackStatus, "not_acknowledged")}`
                              : "Direct booking"}
                          </div>
                          <div className={styles.mappingSubcopy}>
                            {booking.isOta ? "Scoped to this property" : "Existing Famlo flow"}
                          </div>
                        </div>
                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>{booking.amount ?? "Not available"}</div>
                          <div className={styles.mappingSubcopy}>
                            Payment {labelizeToken(booking.paymentStatus, "unknown")}
                          </div>
                        </div>
                      </Fragment>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyTitle}>No provider bookings connected yet</div>
                    <div className={styles.emptyCopy}>
                      Future OTA imports, modifications, cancellations, and unmapped reservations will surface here once
                      providers are connected. Famlo direct bookings continue to live in existing booking flows today.
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeSection === "messages-reviews" && (
            <PlaceholderSection
              title="Messages & Reviews"
              copy="Placeholder inbox for future OTA guest threads, review ingestion, and response workflows."
              items={[
                "Unified guest inbox placeholder",
                "Review feed placeholder",
                "Unanswered review queue placeholder",
                "Internal notes placeholder",
              ]}
            />
          )}

          {activeSection === "revenue" && (
            <PlaceholderSection
              title="Revenue"
              copy="Commercial shell for source mix, ADR, occupancy, and direct versus OTA contribution analysis."
              items={[
                "Revenue by source",
                "Occupancy placeholder",
                "ADR / RevPAR placeholder",
                "Payout timing placeholder",
              ]}
            />
          )}

          {activeSection === "reports" && (
            <PlaceholderSection
              title="Reports"
              copy="Placeholder for future exports across reservations, room nights, source mix, and sync health."
              items={[
                "Reservation report placeholder",
                "Source mix report placeholder",
                "Inventory report placeholder",
                "Finance export placeholder",
              ]}
            />
          )}

          {activeSection === "property" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Property</h3>
                  <p className={styles.cardCopy}>
                    Read-only shell for property identity using existing Famlo source-of-truth records.
                  </p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.placeholderGrid}>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Property Identity</div>
                    <div className={styles.placeholderCopy}>{propertyName} · {locationLabel}</div>
                  </div>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Business Model</div>
                    <div className={styles.placeholderValue}>
                      {propertyModelLabel(initialSettings.propertyModel)}
                    </div>
                    <div className={styles.placeholderCopy}>
                      {initialSettings.exists
                        ? "Read-only from saved Famlo Pro settings."
                        : "Save business model in Famlo Pro settings to prepare this property for OTA sync."}
                    </div>
                  </div>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Property Type</div>
                    <div className={styles.placeholderValue}>
                      {propertyTypeLabel(initialSettings.propertyType)}
                    </div>
                    <div className={styles.placeholderCopy}>
                      {initialSettings.exists
                        ? "Read-only from saved Famlo Pro settings."
                        : "Save a Pro property type such as Homestay, Villa, or Hotel/B&B."}
                    </div>
                  </div>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Channel Readiness</div>
                    <div className={styles.placeholderCopy}>Property mapping, room mapping, and rate mapping readiness will be tracked here.</div>
                  </div>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>OTA Listing Readiness</div>
                    <div className={styles.placeholderCopy}>Open the OTA Content section to prepare structured fields required by providers like Channex and Booking.com.</div>
                    <div className={styles.inlineActionRow}>
                      <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection("ota-content")}>
                        Open OTA Content
                      </button>
                    </div>
                  </div>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Property Content</div>
                    <div className={styles.placeholderCopy}>Photos and media remain untouched and continue using existing Famlo sources only.</div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === "ota-content" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>OTA Content Readiness</h3>
                  <p className={styles.cardCopy}>
                    Basic Famlo listing can stay simple. OTA channels need extra structured fields before sync can begin.
                  </p>
                </div>
                <span className={`${styles.badge} ${styles.badgeMuted}`}>No provider sync yet</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.mappingPreviewGrid}>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Famlo Property → Provider Property</div>
                    <div className={styles.placeholderCopy}>Future provider property creation will use saved OTA title, address, contacts, policies, and property content.</div>
                  </div>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Famlo Room / Stay Unit → Provider Room Type</div>
                    <div className={styles.placeholderCopy}>Current stay units remain the source of truth for room title, occupancy, bathroom type, base price, and photo counts.</div>
                  </div>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Famlo Standard Rate → Provider Rate Plan</div>
                    <div className={styles.placeholderCopy}>The Pro standard rate plan and room base prices will later map to provider rate plans.</div>
                  </div>
                </div>

                <div className={styles.contentReadinessGrid}>
                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Property content</div>
                    <div className={styles.inlineBadgeRow}>
                      <span className={`${styles.readinessPill} ${contentStatusClass(propertyContentChecks.filter((item) => item.ready).length, propertyContentChecks.length)}`}>
                        {contentStatusLabel(propertyContentChecks.filter((item) => item.ready).length, propertyContentChecks.length)}
                      </span>
                    </div>
                    <div className={styles.feedCopy}>Missing: {joinMissingLabels(propertyContentChecks)}</div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Contact details</div>
                    <div className={styles.inlineBadgeRow}>
                      <span className={`${styles.readinessPill} ${contentStatusClass(contactChecks.filter((item) => item.ready).length, contactChecks.length)}`}>
                        {contentStatusLabel(contactChecks.filter((item) => item.ready).length, contactChecks.length)}
                      </span>
                    </div>
                    <div className={styles.feedCopy}>Missing: {joinMissingLabels(contactChecks)}</div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Location</div>
                    <div className={styles.inlineBadgeRow}>
                      <span className={`${styles.readinessPill} ${contentStatusClass(locationChecks.filter((item) => item.ready).length, locationChecks.length)}`}>
                        {contentStatusLabel(locationChecks.filter((item) => item.ready).length, locationChecks.length)}
                      </span>
                    </div>
                    <div className={styles.feedCopy}>Missing: {joinMissingLabels(locationChecks)}</div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Policies</div>
                    <div className={styles.inlineBadgeRow}>
                      <span className={`${styles.readinessPill} ${contentStatusClass(policyChecks.filter((item) => item.ready).length, policyChecks.length)}`}>
                        {contentStatusLabel(policyChecks.filter((item) => item.ready).length, policyChecks.length)}
                      </span>
                    </div>
                    <div className={styles.feedCopy}>Missing: {joinMissingLabels(policyChecks)}</div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Room content readiness</div>
                    <div className={styles.inlineBadgeRow}>
                      <span className={`${styles.readinessPill} ${contentStatusClass(roomContentRows.filter((row) => row.readyCount === row.roomChecks.length).length, Math.max(roomContentRows.length, 1))}`}>
                        {roomContentRows.length > 0 ? `${roomContentRows.filter((row) => row.readyCount === row.roomChecks.length).length}/${roomContentRows.length} complete` : "Missing"}
                      </span>
                    </div>
                    <div className={styles.feedCopy}>Adult/children/cot occupancy splits remain missing until a future Pro room-content layer is added.</div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Photos readiness</div>
                    <div className={styles.inlineBadgeRow}>
                      <span className={`${styles.readinessPill} ${contentStatusClass(photosReadiness.readyRooms, Math.max(rooms.length, 1))}`}>
                        {contentStatusLabel(photosReadiness.readyRooms, Math.max(rooms.length, 1))}
                      </span>
                    </div>
                    <div className={styles.feedCopy}>
                      {photosReadiness.readyRooms} rooms have photos counted. {photosReadiness.missingRooms} rooms still need photo coverage for OTA readiness.
                    </div>
                  </article>
                </div>

                <OtaContentForm
                  key={`${familyId}:${initialSettings.updatedAt ?? "new"}:ota`}
                  familyId={familyId}
                  initialSettings={initialSettings}
                />

                <section className={styles.cardInset}>
                  <div className={styles.listTitle}>Room content readiness</div>
                  <div className={styles.otaRoomGrid}>
                    {roomContentRows.length > 0 ? roomContentRows.map(({ room, roomChecks, readyCount, statusLabel }) => (
                      <article key={room.id} className={styles.roomCard}>
                        <div className={styles.roomHeader}>
                          <div>
                            <div className={styles.roomTitle}>{room.name}</div>
                            <div className={styles.roomCopy}>{room.unitType}</div>
                          </div>
                          <span className={`${styles.readinessPill} ${contentStatusClass(readyCount, roomChecks.length)}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className={styles.roomMetaGrid}>
                          <div className={styles.roomMetaItem}>
                            <span className={styles.roomMetaLabel}>Count of rooms preview</span>
                            <strong>1</strong>
                          </div>
                          <div className={styles.roomMetaItem}>
                            <span className={styles.roomMetaLabel}>Photo count</span>
                            <strong>{room.photosCount}</strong>
                          </div>
                          <div className={styles.roomMetaItem}>
                            <span className={styles.roomMetaLabel}>Description</span>
                            <strong>{room.description ? "Available" : "Missing"}</strong>
                          </div>
                          <div className={styles.roomMetaItem}>
                            <span className={styles.roomMetaLabel}>Provider room type</span>
                            <strong>Not mapped</strong>
                          </div>
                        </div>
                        <div className={styles.roomReadinessRow}>
                          {roomChecks.map((item) => (
                            <span
                              key={item.label}
                              className={`${styles.readinessPill} ${item.ready ? styles.readinessPillOk : styles.readinessPillMissing}`}
                            >
                              {item.label}: {item.ready ? "Done" : "Missing"}
                            </span>
                          ))}
                        </div>
                      </article>
                    )) : (
                      <div className={styles.emptyState}>
                        <div className={styles.emptyTitle}>No stay units surfaced yet</div>
                        <div className={styles.emptyCopy}>Room OTA readiness will populate from existing stay units once inventory is available.</div>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </section>
          )}

          {activeSection === "team-groups" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Team & Groups</h3>
                  <p className={styles.cardCopy}>
                    UI shell only. No invite flow or permissions write path is enabled yet.
                  </p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.roleGrid}>
                  {ROLE_CARDS.map((role) => (
                    <article key={role.title} className={styles.roleCard}>
                      <div className={styles.roleTitle}>{role.title}</div>
                      <div className={styles.roleCopy}>{role.copy}</div>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeSection === "settings" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Settings</h3>
                  <p className={styles.cardCopy}>
                    Save operational Pro setup so your property is genuinely ready for future OTA sync and channel mapping.
                  </p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <ProSettingsForm
                  key={`${familyId}:${initialSettings.updatedAt ?? "new"}:${initialSettings.exists ? "saved" : "draft"}`}
                  familyId={familyId}
                  initialSettings={initialSettings}
                  onOpenSetupGuide={() => setActiveSection("setup-guide")}
                />

                <ChannexConnectionCard
                  familyId={familyId}
                  config={channexConfig}
                />
                <ChannexStructureVerifyCard
                  familyId={familyId}
                  propertyCreated={canCreateRoomTypes}
                  externalPropertyId={primaryProperty?.externalPropertyId ?? null}
                />
                <ChannexPropertyCard
                  familyId={familyId}
                  propertyStatus={primaryProperty?.syncStatus ?? "not_created"}
                  externalPropertyId={primaryProperty?.externalPropertyId ?? null}
                />
              </div>
            </section>
          )}

          {activeSection === "support" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Support</h3>
                  <p className={styles.cardCopy}>
                    Pilot support area for early Famlo Pro hosts before live provider connectivity is enabled.
                  </p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.feedGrid}>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Go-live Support</div>
                    <div className={styles.placeholderCopy}>Famlo team can review setup readiness, mapping assumptions, and launch sequence here.</div>
                  </div>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Provider Escalations</div>
                    <div className={styles.placeholderCopy}>Future staging credentials, webhook health, and sync escalation workflows will appear here.</div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function PropertySwitcherControl({
  propertyOptions,
  currentFamilyId,
  activeSection,
}: Readonly<{
  propertyOptions: PropertySwitcherOption[];
  currentFamilyId: string;
  activeSection: ProSectionId;
}>): React.JSX.Element {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const switchProperty = (nextFamilyId: string) => {
    if (!nextFamilyId || nextFamilyId === currentFamilyId) return;
    startTransition(() => {
      router.push(
        `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(nextFamilyId)}&section=${encodeURIComponent(activeSection)}`
      );
    });
  };

  const currentOption = propertyOptions.find((option) => option.familyId === currentFamilyId) ?? null;

  return (
    <section className={styles.propertySwitcherCard}>
      <div className={styles.propertySwitcherInfo}>
        <div className={styles.propertySwitcherLabel}>Switch property</div>
        <div className={styles.propertySwitcherCopy}>
          {propertyOptions.length > 1
            ? "Move between your properties without changing any sync, mapping, or booking logic."
            : "No other properties were found for this host yet. More properties will appear here when available."}
        </div>
      </div>

      <div className={styles.propertySwitcherControls}>
        <label className={styles.propertySwitcherField}>
          <span className={styles.propertySwitcherFieldLabel}>Selected property</span>
          <select
            className={styles.propertySwitcherSelect}
            value={currentFamilyId}
            onChange={(event) => switchProperty(event.target.value)}
            disabled={propertyOptions.length <= 1 || isPending}
          >
            {propertyOptions.map((option) => {
              const location = [option.locality, option.city, option.state].filter(Boolean).join(", ");
              return (
                <option key={option.familyId} value={option.familyId}>
                  {option.name || "Selected property"}
                  {location ? ` · ${location}` : " · Location pending"}
                </option>
              );
            })}
          </select>
        </label>

        <div className={styles.propertySwitcherStatusRow}>
          <span className={styles.propertySwitcherStatusPill}>
            {currentOption ? formatPropertySwitcherStatusLabel(currentOption.famloPlusStatus) : "Famlo Pro"}
          </span>
          <span className={styles.propertySwitcherStatusPill}>
            {currentOption?.isActive === false ? "Inactive listing" : "Active listing"}
          </span>
          {isPending ? <span className={styles.propertySwitcherStatusPill}>Switching…</span> : null}
        </div>
      </div>
    </section>
  );
}

function ProSettingsForm({
  familyId,
  initialSettings,
  onOpenSetupGuide,
}: Readonly<{
  familyId: string;
  initialSettings: HostProSettings;
  onOpenSetupGuide: () => void;
}>): React.JSX.Element {
  const router = useRouter();
  const [isSavingSettings, startSavingSettings] = useTransition();
  const [settingsForm, setSettingsForm] = useState({
    propertyModel: initialSettings.propertyModel ?? "",
    propertyType: initialSettings.propertyType ?? "",
    timezone: initialSettings.timezone,
    currency: initialSettings.currency,
    checkInTime: initialSettings.checkInTime ?? "",
    checkOutTime: initialSettings.checkOutTime ?? "",
    defaultMealPlan: initialSettings.defaultMealPlan,
    standardRatePlanName: initialSettings.standardRatePlanName,
  });
  const [settingsFeedback, setSettingsFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleSettingsFieldChange = (field: keyof typeof settingsForm, value: string): void => {
    setSettingsForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSettingsSave = (): void => {
    setSettingsFeedback(null);
    startSavingSettings(async () => {
      try {
        const response = await fetch("/api/host/pro/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId,
            propertyModel: settingsForm.propertyModel || null,
            propertyType: settingsForm.propertyType || null,
            timezone: settingsForm.timezone || null,
            currency: settingsForm.currency || null,
            checkInTime: settingsForm.checkInTime || null,
            checkOutTime: settingsForm.checkOutTime || null,
            defaultMealPlan: settingsForm.defaultMealPlan || null,
            standardRatePlanName: settingsForm.standardRatePlanName || null,
          }),
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to save Pro settings.");
        }

        setSettingsFeedback({
          type: "success",
          text: "Famlo Pro settings saved. Setup readiness is refreshing.",
        });
        router.refresh();
      } catch (error) {
        setSettingsFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to save Pro settings.",
        });
      }
    });
  };

  return (
    <>
      <div className={styles.settingsGrid}>
        <label className={styles.fieldBlock}>
          <span className={styles.fieldLabel}>Business Model</span>
          <select
            className={styles.fieldInput}
            value={settingsForm.propertyModel}
            onChange={(event) => handleSettingsFieldChange("propertyModel", event.target.value)}
          >
            <option value="">Select business model</option>
            {PRO_PROPERTY_MODEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.fieldBlock}>
          <span className={styles.fieldLabel}>Property Type</span>
          <select
            className={styles.fieldInput}
            value={settingsForm.propertyType}
            onChange={(event) => handleSettingsFieldChange("propertyType", event.target.value)}
          >
            <option value="">Select property type</option>
            {PRO_PROPERTY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.fieldBlock}>
          <span className={styles.fieldLabel}>Timezone</span>
          <input
            className={styles.fieldInput}
            value={settingsForm.timezone}
            onChange={(event) => handleSettingsFieldChange("timezone", event.target.value)}
            placeholder="Asia/Kolkata"
          />
        </label>

        <label className={styles.fieldBlock}>
          <span className={styles.fieldLabel}>Currency</span>
          <input
            className={styles.fieldInput}
            value={settingsForm.currency}
            onChange={(event) => handleSettingsFieldChange("currency", event.target.value)}
            placeholder="INR"
          />
        </label>

        <label className={styles.fieldBlock}>
          <span className={styles.fieldLabel}>Check-in Time</span>
          <input
            className={styles.fieldInput}
            type="time"
            value={settingsForm.checkInTime}
            onChange={(event) => handleSettingsFieldChange("checkInTime", event.target.value)}
          />
        </label>

        <label className={styles.fieldBlock}>
          <span className={styles.fieldLabel}>Check-out Time</span>
          <input
            className={styles.fieldInput}
            type="time"
            value={settingsForm.checkOutTime}
            onChange={(event) => handleSettingsFieldChange("checkOutTime", event.target.value)}
          />
        </label>

        <label className={styles.fieldBlock}>
          <span className={styles.fieldLabel}>Default Meal Plan</span>
          <select
            className={styles.fieldInput}
            value={settingsForm.defaultMealPlan}
            onChange={(event) => handleSettingsFieldChange("defaultMealPlan", event.target.value)}
          >
            {MEAL_PLAN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.fieldBlock}>
          <span className={styles.fieldLabel}>Standard Rate Plan Name</span>
          <input
            className={styles.fieldInput}
            value={settingsForm.standardRatePlanName}
            onChange={(event) => handleSettingsFieldChange("standardRatePlanName", event.target.value)}
            placeholder="Standard Rate"
          />
        </label>
      </div>

      <div className={styles.inlineActionRow}>
        <button
          type="button"
          className={styles.primaryActionButton}
          onClick={handleSettingsSave}
          disabled={isSavingSettings}
        >
          {isSavingSettings ? "Saving..." : "Save Pro Settings"}
        </button>
        <button
          type="button"
          className={styles.secondaryActionButton}
          onClick={onOpenSetupGuide}
        >
          Review Setup Guide
        </button>
      </div>

      {settingsFeedback ? (
        <div className={`${styles.feedbackBox} ${settingsFeedback.type === "error" ? styles.feedbackError : styles.feedbackSuccess}`}>
          {settingsFeedback.text}
        </div>
      ) : null}
    </>
  );
}

function ChannexConnectionCard({
  familyId,
  config,
}: Readonly<{
  familyId: string;
  config: ChannexSummary;
}>): React.JSX.Element {
  const router = useRouter();
  const [isChecking, startChecking] = useTransition();
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
    statusLabel: string;
  } | null>(null);

  return (
    <section className={styles.cardInset}>
      <div className={styles.cardHeaderCompact}>
        <div>
          <div className={styles.listTitle}>Channex configuration</div>
          <div className={styles.cardCopy}>
            Safe adapter check for the current Channex environment. No properties, rooms, rates, availability, or bookings are created here.
          </div>
        </div>
        <span className={`${styles.badge} ${config.configured ? "" : styles.badgeMuted}`.trim()}>
          {config.configured ? "Configured" : "Config incomplete"}
        </span>
      </div>

      <div className={styles.placeholderGrid}>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Provider</div>
          <div className={styles.placeholderCopy}>Channex</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Environment</div>
          <div className={styles.placeholderCopy}>{formatChannexEnvironmentLabel(config.environment)}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>API key</div>
          <div className={styles.placeholderCopy}>{config.apiKeyConfigured ? "Configured" : "Missing"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Connection</div>
          <div className={styles.placeholderCopy}>{feedback?.statusLabel ?? "Not checked"}</div>
        </div>
      </div>

      {feedback ? (
        <div className={`${styles.feedbackBox} ${feedback.ok ? styles.feedbackSuccess : styles.feedbackError}`}>
          {feedback.message}
        </div>
      ) : null}
      {config.environment === "production" && !config.productionMutationsAllowed ? (
        <div className={`${styles.feedbackBox} ${styles.feedbackError}`}>
          Production mutations are blocked until <code>FAMLO_CHANNEX_ALLOW_PRODUCTION_MUTATIONS=true</code>.
        </div>
      ) : null}

      <div className={styles.inlineActionRow}>
        <button
          type="button"
          className={styles.secondaryActionButton}
          disabled={isChecking}
          onClick={() => {
            startChecking(async () => {
              setFeedback(null);

              try {
                const response = await fetch("/api/host/pro/channel/channex/check", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ familyId }),
                });

                const payload = (await response.json()) as {
                  configured?: boolean;
                  ok?: boolean;
                  message?: string;
                };

                setFeedback({
                  ok: Boolean(response.ok && payload.ok),
                  statusLabel:
                    response.ok && payload.ok
                      ? "Connected"
                      : payload.configured === false
                        ? "Missing"
                        : "Failed",
                  message:
                    typeof payload.message === "string" && payload.message.trim().length > 0
                      ? payload.message
                      : `Unable to verify ${formatChannexEnvironmentLabel(config.environment).toLowerCase()} connection.`,
                });
                router.refresh();
              } catch (error) {
                setFeedback({
                  ok: false,
                  statusLabel: "Failed",
                  message:
                    error instanceof Error
                      ? error.message
                      : `Unable to verify ${formatChannexEnvironmentLabel(config.environment).toLowerCase()} connection.`,
                });
              }
            });
          }}
        >
          {isChecking ? "Checking..." : "Check connection"}
        </button>
      </div>
    </section>
  );
}

function ChannexPropertyCard({
  familyId,
  propertyStatus,
  externalPropertyId,
}: Readonly<{
  familyId: string;
  propertyStatus: string;
  externalPropertyId: string | null;
}>): React.JSX.Element {
  const router = useRouter();
  const [isCreating, startCreating] = useTransition();
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
    statusLabel: string;
    missingFields?: string[];
    invalidFields?: string[];
    validationDetails?: string[];
  } | null>(null);

  const alreadyCreated = Boolean(externalPropertyId);
  const derivedStatusLabel = alreadyCreated
    ? "Created"
    : propertyStatus === "failed"
      ? "Failed"
      : "Not created";

  return (
    <section className={styles.cardInset}>
      <div className={styles.cardHeaderCompact}>
        <div>
          <div className={styles.listTitle}>Provider property</div>
          <div className={styles.cardCopy}>
            Create the first Channex staging property from Famlo Pro settings and OTA content. No room types, rates, or sync jobs are created here.
          </div>
        </div>
        <span className={`${styles.badge} ${alreadyCreated ? "" : styles.badgeMuted}`.trim()}>
          {feedback?.statusLabel ?? derivedStatusLabel}
        </span>
      </div>

      <div className={styles.placeholderGrid}>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Status</div>
          <div className={styles.placeholderCopy}>{feedback?.statusLabel ?? derivedStatusLabel}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>External Property ID</div>
          <div className={styles.placeholderCopy}>{externalPropertyId ?? "Not created"}</div>
        </div>
      </div>

      {feedback ? (
        <div className={`${styles.feedbackBox} ${feedback.ok ? styles.feedbackSuccess : styles.feedbackError}`}>
          {feedback.message}
          {feedback.missingFields && feedback.missingFields.length > 0 ? ` Missing: ${feedback.missingFields.join(", ")}.` : ""}
          {feedback.invalidFields && feedback.invalidFields.length > 0 ? ` Invalid: ${feedback.invalidFields.join(", ")}.` : ""}
          {feedback.validationDetails && feedback.validationDetails.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              {feedback.validationDetails.map((detail) => (
                <div key={detail} className={styles.feedCopy}>
                  - {detail}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={styles.inlineActionRow}>
        <button
          type="button"
          className={styles.primaryActionButton}
          disabled={isCreating || alreadyCreated}
          onClick={() => {
            startCreating(async () => {
              setFeedback(null);

              try {
                const response = await fetch("/api/host/pro/channel/channex/property", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ familyId }),
                });

                const payload = (await response.json()) as {
                  ok?: boolean;
                  status?: string;
                  message?: string;
                  externalPropertyId?: string | null;
                  missingFields?: string[];
                  invalidFields?: string[];
                  validationDetails?: string[];
                };

                setFeedback({
                  ok: Boolean(response.ok && payload.ok),
                  statusLabel:
                    payload.status === "already_created"
                      ? "Created"
                      : payload.status === "created"
                        ? "Created"
                        : payload.status === "validation_failed"
                          ? "Missing"
                          : "Failed",
                  message:
                    typeof payload.message === "string" && payload.message.trim().length > 0
                      ? payload.message
                      : "Unable to create Channex staging property.",
                  missingFields: Array.isArray(payload.missingFields) ? payload.missingFields : undefined,
                  invalidFields: Array.isArray(payload.invalidFields) ? payload.invalidFields : undefined,
                  validationDetails: Array.isArray(payload.validationDetails) ? payload.validationDetails : undefined,
                });
                router.refresh();
              } catch (error) {
                setFeedback({
                  ok: false,
                  statusLabel: "Failed",
                  message: error instanceof Error ? error.message : "Unable to create Channex staging property.",
                });
              }
            });
          }}
        >
          {alreadyCreated ? "Already created" : isCreating ? "Creating..." : "Create staging property"}
        </button>
      </div>
    </section>
  );
}

function ChannexBookingListVerifyCard({
  familyId,
  propertyCreated,
  externalPropertyId,
  storedRevisions,
}: Readonly<{
  familyId: string;
  propertyCreated: boolean;
  externalPropertyId: string | null;
  storedRevisions: Array<{
    externalBookingId: string | null;
    source: string;
    importStatus: string;
    ackStatus: string;
    rawPayload?: Record<string, unknown> | null;
  }>;
}>): React.JSX.Element | null {
  const [isVerifyingList, startVerifyingList] = useTransition();
  const [bookingUniqueIdInput, setBookingUniqueIdInput] = useState("ABB-TEST-FAMLO-001");
  const [listFeedback, setListFeedback] = useState<{
    ok: boolean;
    message: string;
    totalFetched?: number;
    propertyMatchedCount?: number;
    foundCount?: number;
    searchedUniqueId?: string | null;
    bookings?: Array<{
      bookingId: string | null;
      uniqueId: string | null;
      bookingListRevisionId: string | null;
      status: string | null;
      propertyId: string | null;
      arrivalDate: string | null;
      departureDate: string | null;
      roomTypeId: string | null;
      ratePlanId: string | null;
      amount: string | null;
      currency: string | null;
      otaName: string | null;
      channelId: string | null;
      hasUnackedRevisions: boolean;
      acknowledgeStatus: string | null;
      isCrsRevision: boolean;
    }>;
  } | null>(null);

  if (!externalPropertyId) {
    return null;
  }

  const blockedMessage = !propertyCreated
    ? "Create provider property first."
    : !externalPropertyId
      ? "Provider property is not mapped yet."
      : null;

  const previewMap = new Map(
    storedRevisions
      .filter((revision) => revision.source === "booking_list_api" && revision.externalBookingId)
      .map((revision) => [
        revision.externalBookingId as string,
        {
          importStatus: revision.importStatus,
          ackStatus: revision.ackStatus,
          source: revision.source,
          bookingListRevisionId: asStringOrNull(revision.rawPayload?.booking_list_revision_id),
          feedRevisionId: asStringOrNull(revision.rawPayload?.external_revision_id),
        },
      ])
  );

  return (
    <section className={styles.cardInset}>
      <div className={styles.cardHeaderCompact}>
        <div>
          <div className={styles.listTitle}>Verify Channex Booking List</div>
          <div className={styles.cardCopy}>
            Read-only Booking List API check for this mapped Channex property. This does not import into Famlo bookings and does not acknowledge Channex.
          </div>
        </div>
        <span className={`${styles.badge} ${blockedMessage ? styles.badgeMuted : ""}`.trim()}>
          {blockedMessage ? "Blocked" : "Read-only"}
        </span>
      </div>

      <div className={styles.placeholderGrid}>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>External property ID</div>
          <div className={styles.placeholderCopy}>{externalPropertyId}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Default booking ID</div>
          <div className={styles.placeholderCopy}>ABB-TEST-FAMLO-001</div>
        </div>
      </div>

      {blockedMessage ? <div className={`${styles.feedbackBox} ${styles.feedbackError}`}>{blockedMessage}</div> : null}

      {listFeedback ? (
        <div className={`${styles.feedbackBox} ${listFeedback.ok ? styles.feedbackSuccess : styles.feedbackError}`}>
          {listFeedback.message}
          {typeof listFeedback.totalFetched === "number" ? (
            <div className={styles.inlineBadgeRow}>
              <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>Total bookings returned: {listFeedback.totalFetched}</span>
              <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>Property matched: {listFeedback.propertyMatchedCount ?? 0}</span>
              <span className={`${styles.readinessPill} ${(listFeedback.foundCount ?? 0) > 0 ? styles.readinessPillOk : styles.readinessPillReview}`}>
                Found: {listFeedback.foundCount ?? 0}
              </span>
            </div>
          ) : null}

          {listFeedback.bookings && listFeedback.bookings.length > 0 ? (
            <div className={styles.mappingTable} style={{ marginTop: 14 }}>
              <div className={styles.mappingHeader}>Booking</div>
              <div className={styles.mappingHeader}>Status</div>
              <div className={styles.mappingHeader}>Revision visibility</div>
              <div className={styles.mappingHeader}>Property ID</div>
              <div className={styles.mappingHeader}>Dates</div>
              <div className={styles.mappingHeader}>Room / Rate</div>
              <div className={styles.mappingHeader}>Amount</div>
              {listFeedback.bookings.map((booking, index) => {
                const preview = booking.uniqueId ? previewMap.get(booking.uniqueId) : null;
                return (
                  <Fragment key={`${booking.uniqueId ?? booking.bookingId ?? "booking"}-${index}`}>
                    <div className={styles.mappingCell}>
                      <div className={styles.mappingTitle}>{booking.uniqueId ?? "Unknown booking"}</div>
                      <div className={styles.mappingSubcopy}>Booking {booking.bookingId ?? "Unknown"}</div>
                    </div>
                    <div className={styles.mappingCell}>
                      <div className={styles.mappingTitle}>{labelizeToken(booking.status, "unknown")}</div>
                      <div className={styles.mappingSubcopy}>
                        {preview
                          ? `${preview.importStatus} · ${preview.ackStatus} · ${labelizeToken(preview.source, "booking_list_api")}`
                          : "Read-only list API"}
                      </div>
                    </div>
                    <div className={styles.mappingCell}>
                      <div className={styles.mappingTitle}>
                        List rev {booking.bookingListRevisionId ?? "Missing"}
                      </div>
                      <div className={styles.mappingSubcopy}>
                        {booking.isCrsRevision || !booking.channelId
                          ? "CRS-only / manual candidate"
                          : "Channel-linked candidate"}
                        {booking.hasUnackedRevisions ? " · unacked revisions present" : ""}
                        {booking.acknowledgeStatus ? ` · ${booking.acknowledgeStatus}` : ""}
                      </div>
                    </div>
                    <div className={styles.mappingCell}>
                      <div className={styles.mappingTitle}>{booking.propertyId ?? "Missing"}</div>
                      <div className={styles.mappingSubcopy}>Mapped Channex property</div>
                    </div>
                    <div className={styles.mappingCell}>
                      <div className={styles.mappingTitle}>{booking.arrivalDate ?? "Unknown"} → {booking.departureDate ?? "Unknown"}</div>
                    </div>
                    <div className={styles.mappingCell}>
                      <div className={styles.mappingTitle}>{booking.roomTypeId ?? "Room missing"}</div>
                      <div className={styles.mappingSubcopy}>{booking.ratePlanId ?? "Rate missing"}</div>
                    </div>
                    <div className={styles.mappingCell}>
                      <div className={styles.mappingTitle}>
                        {booking.amount && booking.currency ? `${booking.amount} ${booking.currency}` : booking.amount ?? booking.currency ?? "Not available"}
                      </div>
                      <div className={styles.mappingSubcopy}>Read-only, not imported, not acknowledged</div>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.inlineActionRow}>
        <input
          type="text"
          value={bookingUniqueIdInput}
          onChange={(event) => setBookingUniqueIdInput(event.target.value)}
          placeholder="Booking unique ID"
          aria-label="Booking unique ID"
          style={{
            minWidth: 220,
            borderRadius: 10,
            border: "1px solid rgba(15,33,64,0.16)",
            padding: "10px 12px",
            fontSize: 14,
            background: "#fff",
            color: "#11233f",
          }}
        />
        <button
          type="button"
          className={styles.secondaryActionButton}
          disabled={isVerifyingList || Boolean(blockedMessage)}
          onClick={() => {
            startVerifyingList(async () => {
              try {
                const response = await fetch("/api/host/pro/channel/channex/bookings/list", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ familyId, uniqueId: bookingUniqueIdInput }),
                });

                const payload = (await response.json()) as {
                  ok?: boolean;
                  message?: string;
                  totalFetched?: number;
                  propertyMatchedCount?: number;
                  foundCount?: number;
                  searchedUniqueId?: string | null;
                  bookings?: Array<{
                    bookingId: string | null;
                    uniqueId: string | null;
                    bookingListRevisionId: string | null;
                    status: string | null;
                    propertyId: string | null;
                    arrivalDate: string | null;
                    departureDate: string | null;
                    roomTypeId: string | null;
                    ratePlanId: string | null;
                    amount: string | null;
                    currency: string | null;
                    otaName: string | null;
                    channelId: string | null;
                    hasUnackedRevisions: boolean;
                    acknowledgeStatus: string | null;
                    isCrsRevision: boolean;
                  }>;
                };

                setListFeedback({
                  ok: Boolean(response.ok && payload.ok),
                  message:
                    typeof payload.message === "string" && payload.message.trim().length > 0
                      ? payload.message
                      : "Unable to verify Channex booking list.",
                  totalFetched: typeof payload.totalFetched === "number" ? payload.totalFetched : undefined,
                  propertyMatchedCount: typeof payload.propertyMatchedCount === "number" ? payload.propertyMatchedCount : undefined,
                  foundCount: typeof payload.foundCount === "number" ? payload.foundCount : undefined,
                  searchedUniqueId: typeof payload.searchedUniqueId === "string" ? payload.searchedUniqueId : null,
                  bookings: Array.isArray(payload.bookings) ? payload.bookings : undefined,
                });
              } catch (error) {
                setListFeedback({
                  ok: false,
                  message: error instanceof Error ? error.message : "Unable to verify Channex booking list.",
                });
              }
            });
          }}
        >
          {isVerifyingList ? "Verifying..." : "Verify booking list"}
        </button>
      </div>
    </section>
  );
}

function ChannexBookingRevisionVisibilityCard({
  familyId,
  propertyCreated,
  externalPropertyId,
  lastFeedLog,
  storedRevisions,
}: Readonly<{
  familyId: string;
  propertyCreated: boolean;
  externalPropertyId: string | null;
  lastFeedLog: {
    status: string;
    message: string | null;
    createdAt: string | null;
  } | null;
  storedRevisions: Array<{
    externalBookingId: string | null;
    externalRevisionId: string | null;
    source: string;
    importStatus: string;
    ackStatus: string;
    rawPayload: Record<string, unknown>;
  }>;
}>): React.JSX.Element | null {
  const [isChecking, startChecking] = useTransition();
  const [bookingUniqueIdInput, setBookingUniqueIdInput] = useState("ABB-TEST-FAMLO-001");
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
    feedStatus?: string;
    feedMatchCount?: number;
    revisionsFound?: number;
    revisions?: Array<{
      revisionId: string | null;
      externalBookingId: string | null;
      bookingId: string | null;
      propertyId: string | null;
      status: string | null;
      otaName: string | null;
      arrivalDate: string | null;
      departureDate: string | null;
      externalRoomTypeId: string | null;
      externalRatePlanId: string | null;
      amount: string | null;
      currency: string | null;
      paymentCollect: string | null;
      paymentType: string | null;
      channelId: string | null;
      isCrsRevision: boolean;
      acknowledgeStatus: string | null;
      insertedAt: string | null;
    }>;
  } | null>(null);

  if (!externalPropertyId) return null;

  const blockedMessage = !propertyCreated
    ? "Create provider property first."
    : !externalPropertyId
      ? "Provider property is not mapped yet."
      : null;

  const storedPreview = storedRevisions.find((revision) => revision.externalBookingId === bookingUniqueIdInput) ?? null;
  const storedBookingListRevisionId = asStringOrNull(storedPreview?.rawPayload?.booking_list_revision_id);
  const storedIsCrsOnly =
    storedPreview?.rawPayload?.is_crs_revision === true ||
    storedPreview?.rawPayload?.booking_list_is_crs_revision === true ||
    (storedPreview?.rawPayload && Object.prototype.hasOwnProperty.call(storedPreview.rawPayload, "channel_id") && !asStringOrNull(storedPreview.rawPayload.channel_id)) ||
    (storedPreview?.rawPayload && Object.prototype.hasOwnProperty.call(storedPreview.rawPayload, "booking_list_channel_id") && !asStringOrNull(storedPreview.rawPayload.booking_list_channel_id));

  return (
    <section className={styles.cardInset}>
      <div className={styles.cardHeaderCompact}>
        <div>
          <div className={styles.listTitle}>Booking revision visibility</div>
          <div className={styles.cardCopy}>
            Read-only comparison of Booking List revision id, Booking Revisions history, and Booking Revision Feed status for one booking.
          </div>
        </div>
        <span className={`${styles.badge} ${blockedMessage ? styles.badgeMuted : ""}`.trim()}>
          {blockedMessage ? "Blocked" : "Diagnostics"}
        </span>
      </div>

      <div className={styles.placeholderGrid}>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Stored feed revision ID</div>
          <div className={styles.placeholderCopy}>{storedPreview?.externalRevisionId ?? "Missing"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Stored Booking List revision ID</div>
          <div className={styles.placeholderCopy}>{storedBookingListRevisionId ?? "Missing"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Stored ack eligibility</div>
          <div className={styles.placeholderCopy}>{storedPreview?.externalRevisionId ? "Eligible via feed revision" : "Blocked until real feed revision"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Stored CRS/manual indicator</div>
          <div className={styles.placeholderCopy}>{storedIsCrsOnly ? "Yes" : "No / unknown"}</div>
        </div>
      </div>

      {lastFeedLog?.message ? <div className={styles.feedCopy}>{lastFeedLog.message}</div> : null}
      {blockedMessage ? <div className={`${styles.feedbackBox} ${styles.feedbackError}`}>{blockedMessage}</div> : null}

      {feedback ? (
        <div className={`${styles.feedbackBox} ${feedback.ok ? styles.feedbackSuccess : styles.feedbackError}`}>
          {feedback.message}
          {typeof feedback.revisionsFound === "number" ? (
            <div className={styles.inlineBadgeRow}>
              <span className={`${styles.readinessPill} ${feedback.feedStatus === "found" ? styles.readinessPillOk : styles.readinessPillReview}`}>
                Feed: {labelizeToken(feedback.feedStatus, "unknown")}
              </span>
              <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>History rows: {feedback.revisionsFound}</span>
              <span className={`${styles.readinessPill} ${feedback.feedMatchCount ? styles.readinessPillOk : styles.readinessPillReview}`}>
                Feed matches: {feedback.feedMatchCount ?? 0}
              </span>
            </div>
          ) : null}

          {feedback.revisions && feedback.revisions.length > 0 ? (
            <div className={styles.mappingTable} style={{ marginTop: 14 }}>
              <div className={styles.mappingHeader}>Revision</div>
              <div className={styles.mappingHeader}>Status</div>
              <div className={styles.mappingHeader}>Feed / CRS</div>
              <div className={styles.mappingHeader}>Dates</div>
              <div className={styles.mappingHeader}>Room / Rate</div>
              <div className={styles.mappingHeader}>Amount</div>
              {feedback.revisions.map((revision, index) => (
                <Fragment key={`${revision.revisionId ?? revision.bookingId ?? "visibility"}-${index}`}>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{revision.externalBookingId ?? "Unknown booking"}</div>
                    <div className={styles.mappingSubcopy}>Revision {revision.revisionId ?? "Unknown"}</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{labelizeToken(revision.status, "unknown")}</div>
                    <div className={styles.mappingSubcopy}>{revision.acknowledgeStatus ?? "ack status unknown"}</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{revision.channelId ?? "channel_id = null"}</div>
                    <div className={styles.mappingSubcopy}>
                      {revision.isCrsRevision ? "CRS-only / manual" : "Channel-linked"}
                      {feedback.feedStatus === "found" ? " · feed found" : " · feed empty"}
                    </div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{revision.arrivalDate ?? "Unknown"} → {revision.departureDate ?? "Unknown"}</div>
                    <div className={styles.mappingSubcopy}>Received {formatDateTime(revision.insertedAt)}</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{revision.externalRoomTypeId ?? "Room missing"}</div>
                    <div className={styles.mappingSubcopy}>{revision.externalRatePlanId ?? "Rate missing"}</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>
                      {revision.amount && revision.currency ? `${revision.amount} ${revision.currency}` : revision.amount ?? revision.currency ?? "Not available"}
                    </div>
                    <div className={styles.mappingSubcopy}>
                      {revision.revisionId ? "History row only" : "No revision id"}
                    </div>
                  </div>
                </Fragment>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.inlineActionRow}>
        <input
          type="text"
          value={bookingUniqueIdInput}
          onChange={(event) => setBookingUniqueIdInput(event.target.value)}
          placeholder="Booking unique ID"
          aria-label="Booking revision unique ID"
          style={{
            minWidth: 220,
            borderRadius: 10,
            border: "1px solid rgba(15,33,64,0.16)",
            padding: "10px 12px",
            fontSize: 14,
            background: "#fff",
            color: "#11233f",
          }}
        />
        <button
          type="button"
          className={styles.secondaryActionButton}
          disabled={isChecking || Boolean(blockedMessage)}
          onClick={() => {
            startChecking(async () => {
              try {
                const response = await fetch("/api/host/pro/channel/channex/bookings/revisions", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ familyId, uniqueId: bookingUniqueIdInput }),
                });

                const payload = (await response.json()) as {
                  ok?: boolean;
                  message?: string;
                  feedStatus?: string;
                  feedMatchCount?: number;
                  revisionsFound?: number;
                  revisions?: Array<{
                    revisionId: string | null;
                    externalBookingId: string | null;
                    bookingId: string | null;
                    propertyId: string | null;
                    status: string | null;
                    otaName: string | null;
                    arrivalDate: string | null;
                    departureDate: string | null;
                    externalRoomTypeId: string | null;
                    externalRatePlanId: string | null;
                    amount: string | null;
                    currency: string | null;
                    paymentCollect: string | null;
                    paymentType: string | null;
                    channelId: string | null;
                    isCrsRevision: boolean;
                    acknowledgeStatus: string | null;
                    insertedAt: string | null;
                  }>;
                };

                setFeedback({
                  ok: Boolean(response.ok && payload.ok),
                  message:
                    typeof payload.message === "string" && payload.message.trim().length > 0
                      ? payload.message
                      : "Unable to inspect booking revision visibility.",
                  feedStatus: typeof payload.feedStatus === "string" ? payload.feedStatus : undefined,
                  feedMatchCount: typeof payload.feedMatchCount === "number" ? payload.feedMatchCount : undefined,
                  revisionsFound: typeof payload.revisionsFound === "number" ? payload.revisionsFound : undefined,
                  revisions: Array.isArray(payload.revisions) ? payload.revisions : undefined,
                });
              } catch (error) {
                setFeedback({
                  ok: false,
                  message: error instanceof Error ? error.message : "Unable to inspect booking revision visibility.",
                });
              }
            });
          }}
        >
          {isChecking ? "Checking..." : "Inspect revision visibility"}
        </button>
      </div>
    </section>
  );
}

function ChannexStructureVerifyCard({
  familyId,
  propertyCreated,
  externalPropertyId,
}: Readonly<{
  familyId: string;
  propertyCreated: boolean;
  externalPropertyId: string | null;
}>): React.JSX.Element {
  const [isVerifying, startVerifying] = useTransition();
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
    propertyTitle?: string | null;
    roomTypesFoundCount?: number;
    ratePlansFoundCount?: number;
    availabilityVisibleCount?: number;
    rateVisibleCount?: number;
    mappedRoomRows?: Array<{ famloRoomName: string; externalRoomTypeId: string | null; found: boolean }>;
    mappedRateRows?: Array<{ famloRateTitle: string; externalRatePlanId: string | null; found: boolean }>;
  } | null>(null);

  const blockedMessage = !propertyCreated
    ? "Create provider property first."
    : !externalPropertyId
      ? "Provider property is not mapped yet."
      : null;

  return (
    <section className={styles.cardInset}>
      <div className={styles.cardHeaderCompact}>
        <div>
          <div className={styles.listTitle}>Verify Channex structure</div>
          <div className={styles.cardCopy}>
            Read-only API check for the mapped property, room types, and rate plans. If API shows room/rate but Channex UI is empty, check property selector, group, filters, or refresh.
          </div>
        </div>
        <span className={`${styles.badge} ${blockedMessage ? styles.badgeMuted : ""}`.trim()}>
          {blockedMessage ? "Blocked" : "Read-only"}
        </span>
      </div>

      <div className={styles.placeholderGrid}>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>External property ID</div>
          <div className={styles.placeholderCopy}>{externalPropertyId ?? "Missing"}</div>
        </div>
      </div>

      {blockedMessage ? <div className={`${styles.feedbackBox} ${styles.feedbackError}`}>{blockedMessage}</div> : null}

      {feedback ? (
        <div className={`${styles.feedbackBox} ${feedback.ok ? styles.feedbackSuccess : styles.feedbackError}`}>
          {feedback.message}
          <div className={styles.inlineBadgeRow}>
            <span className={`${styles.readinessPill} ${feedback.ok ? styles.readinessPillOk : styles.readinessPillReview}`}>
              Property: {feedback.propertyTitle ?? "Missing"}
            </span>
            <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>Room types: {feedback.roomTypesFoundCount ?? 0}</span>
            <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>Rate plans: {feedback.ratePlansFoundCount ?? 0}</span>
            <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>Availability visible: {feedback.availabilityVisibleCount ?? 0}</span>
            <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>Rates visible: {feedback.rateVisibleCount ?? 0}</span>
          </div>

          {feedback.mappedRoomRows && feedback.mappedRoomRows.length > 0 ? (
            <div className={styles.mappingTable} style={{ marginTop: 14 }}>
              <div className={styles.mappingHeader}>Famlo room</div>
              <div className={styles.mappingHeader}>External room type ID</div>
              <div className={styles.mappingHeader}>Visible in Channex API</div>
              {feedback.mappedRoomRows.map((row, index) => (
                <Fragment key={`${row.externalRoomTypeId ?? "room"}-${index}`}>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{row.famloRoomName}</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{row.externalRoomTypeId ?? "Missing"}</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{row.found ? "Found" : "Missing"}</div>
                  </div>
                </Fragment>
              ))}
            </div>
          ) : null}

          {feedback.mappedRateRows && feedback.mappedRateRows.length > 0 ? (
            <div className={styles.mappingTable} style={{ marginTop: 14 }}>
              <div className={styles.mappingHeader}>Famlo rate</div>
              <div className={styles.mappingHeader}>External rate plan ID</div>
              <div className={styles.mappingHeader}>Visible in Channex API</div>
              {feedback.mappedRateRows.map((row, index) => (
                <Fragment key={`${row.externalRatePlanId ?? "rate"}-${index}`}>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{row.famloRateTitle}</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{row.externalRatePlanId ?? "Missing"}</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{row.found ? "Found" : "Missing"}</div>
                  </div>
                </Fragment>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.inlineActionRow}>
        <button
          type="button"
          className={styles.secondaryActionButton}
          disabled={isVerifying || Boolean(blockedMessage)}
          onClick={() => {
            startVerifying(async () => {
              try {
                const response = await fetch("/api/host/pro/channel/channex/structure/verify", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ familyId }),
                });

                const payload = (await response.json()) as {
                  ok?: boolean;
                  message?: string;
                  property?: { title?: string | null } | null;
                  roomTypesFoundCount?: number;
                  ratePlansFoundCount?: number;
                  availabilityVisibleCount?: number;
                  rateVisibleCount?: number;
                  mappedRoomRows?: Array<{ famloRoomName: string; externalRoomTypeId: string | null; found: boolean }>;
                  mappedRateRows?: Array<{ famloRateTitle: string; externalRatePlanId: string | null; found: boolean }>;
                };

                setFeedback({
                  ok: Boolean(response.ok && payload.ok),
                  message:
                    typeof payload.message === "string" && payload.message.trim().length > 0
                      ? payload.message
                      : "Unable to verify Channex structure.",
                  propertyTitle: payload.property?.title ?? null,
                  roomTypesFoundCount: typeof payload.roomTypesFoundCount === "number" ? payload.roomTypesFoundCount : 0,
                  ratePlansFoundCount: typeof payload.ratePlansFoundCount === "number" ? payload.ratePlansFoundCount : 0,
                  availabilityVisibleCount: typeof payload.availabilityVisibleCount === "number" ? payload.availabilityVisibleCount : 0,
                  rateVisibleCount: typeof payload.rateVisibleCount === "number" ? payload.rateVisibleCount : 0,
                  mappedRoomRows: Array.isArray(payload.mappedRoomRows) ? payload.mappedRoomRows : [],
                  mappedRateRows: Array.isArray(payload.mappedRateRows) ? payload.mappedRateRows : [],
                });
              } catch (error) {
                setFeedback({
                  ok: false,
                  message: error instanceof Error ? error.message : "Unable to verify Channex structure.",
                });
              }
            });
          }}
        >
          {isVerifying ? "Verifying..." : "Verify Channex structure"}
        </button>
      </div>
    </section>
  );
}

function ChannexRoomTypeBatchCard({
  familyId,
  propertyCreated,
}: Readonly<{
  familyId: string;
  propertyCreated: boolean;
}>): React.JSX.Element {
  const router = useRouter();
  const [isCreating, startCreating] = useTransition();
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
    roomResults?: Array<{
      name: string;
      status: string;
      externalRoomTypeId: string | null;
      missingFields: string[];
    }>;
  } | null>(null);

  return (
    <section className={styles.cardInset}>
      <div className={styles.cardHeaderCompact}>
        <div>
          <div className={styles.listTitle}>Channex staging room types</div>
          <div className={styles.cardCopy}>
            Create room types in staging from active Famlo stay units only. Incomplete active rooms are skipped and reported without blocking the whole batch.
          </div>
        </div>
        <span className={`${styles.badge} ${propertyCreated ? "" : styles.badgeMuted}`.trim()}>
          {propertyCreated ? "Ready" : "Create property first"}
        </span>
      </div>

      {!propertyCreated ? (
        <div className={`${styles.feedbackBox} ${styles.feedbackError}`}>
          Create provider property first.
        </div>
      ) : null}

      {feedback ? (
        <div className={`${styles.feedbackBox} ${feedback.ok ? styles.feedbackSuccess : styles.feedbackError}`}>
          {feedback.message}
          {feedback.roomResults && feedback.roomResults.length > 0 ? (
            <div className={styles.inlineBadgeRow}>
              {feedback.roomResults.map((room) => (
                <span key={`${room.name}:${room.status}`} className={`${styles.readinessPill} ${room.status === "created" || room.status === "already_mapped" ? styles.readinessPillOk : styles.readinessPillMissing}`}>
                  {room.name}: {labelizeToken(room.status, room.status)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.inlineActionRow}>
        <button
          type="button"
          className={styles.secondaryActionButton}
          disabled={isCreating || !propertyCreated}
          onClick={() => {
            startCreating(async () => {
              setFeedback(null);

              try {
                const response = await fetch("/api/host/pro/channel/channex/rooms", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ familyId }),
                });

                const payload = (await response.json()) as {
                  ok?: boolean;
                  status?: string;
                  message?: string;
                  results?: Array<{
                    name: string;
                    status: string;
                    externalRoomTypeId: string | null;
                    missingFields: string[];
                  }>;
                };

                setFeedback({
                  ok: Boolean(response.ok && payload.ok),
                  message:
                    typeof payload.message === "string" && payload.message.trim().length > 0
                      ? payload.message
                      : response.ok
                        ? "Room-type batch completed."
                        : "Unable to create Channex staging room types.",
                  roomResults: Array.isArray(payload.results) ? payload.results : undefined,
                });
                router.refresh();
              } catch (error) {
                setFeedback({
                  ok: false,
                  message: error instanceof Error ? error.message : "Unable to create Channex staging room types.",
                });
              }
            });
          }}
        >
          {isCreating ? "Creating..." : "Create staging room types"}
        </button>
      </div>
    </section>
  );
}

function ChannexRatePlanBatchCard({
  familyId,
  propertyCreated,
  roomTypesCreated,
}: Readonly<{
  familyId: string;
  propertyCreated: boolean;
  roomTypesCreated: boolean;
}>): React.JSX.Element {
  const router = useRouter();
  const [isCreating, startCreating] = useTransition();
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
    rateResults?: Array<{
      name: string;
      status: string;
      externalRatePlanId: string | null;
      missingFields: string[];
    }>;
  } | null>(null);

  const blockedMessage = !propertyCreated
    ? "Create provider property first."
    : !roomTypesCreated
      ? "Create room types first."
      : null;

  return (
    <section className={styles.cardInset}>
      <div className={styles.cardHeaderCompact}>
        <div>
          <div className={styles.listTitle}>Channex staging rate plans</div>
          <div className={styles.cardCopy}>
            Create one staging rate plan per mapped active Famlo room. This only establishes provider rate-plan mappings and does not push prices or restrictions.
          </div>
        </div>
        <span className={`${styles.badge} ${blockedMessage ? styles.badgeMuted : ""}`.trim()}>
          {blockedMessage ? blockedMessage.replace(".", "") : "Ready"}
        </span>
      </div>

      {blockedMessage ? (
        <div className={`${styles.feedbackBox} ${styles.feedbackError}`}>
          {blockedMessage}
        </div>
      ) : null}

      {feedback ? (
        <div className={`${styles.feedbackBox} ${feedback.ok ? styles.feedbackSuccess : styles.feedbackError}`}>
          {feedback.message}
          {feedback.rateResults && feedback.rateResults.length > 0 ? (
            <div className={styles.inlineBadgeRow}>
              {feedback.rateResults.map((rate) => (
                <span key={`${rate.name}:${rate.status}`} className={`${styles.readinessPill} ${rate.status === "created" || rate.status === "already_mapped" ? styles.readinessPillOk : styles.readinessPillMissing}`}>
                  {rate.name}: {labelizeToken(rate.status, rate.status)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.inlineActionRow}>
        <button
          type="button"
          className={styles.secondaryActionButton}
          disabled={isCreating || Boolean(blockedMessage)}
          onClick={() => {
            startCreating(async () => {
              setFeedback(null);

              try {
                const response = await fetch("/api/host/pro/channel/channex/rate-plans", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ familyId }),
                });

                const payload = (await response.json()) as {
                  ok?: boolean;
                  status?: string;
                  message?: string;
                  results?: Array<{
                    name: string;
                    status: string;
                    externalRatePlanId: string | null;
                    missingFields: string[];
                  }>;
                };

                setFeedback({
                  ok: Boolean(response.ok && payload.ok),
                  message:
                    typeof payload.message === "string" && payload.message.trim().length > 0
                      ? payload.message
                      : response.ok
                        ? "Rate-plan batch completed."
                        : "Unable to create Channex staging rate plans.",
                  rateResults: Array.isArray(payload.results) ? payload.results : undefined,
                });
                router.refresh();
              } catch (error) {
                setFeedback({
                  ok: false,
                  message: error instanceof Error ? error.message : "Unable to create Channex staging rate plans.",
                });
              }
            });
          }}
        >
          {isCreating ? "Creating..." : "Create staging rate plans"}
        </button>
      </div>
    </section>
  );
}

function ChannexAriSyncCard({
  familyId,
  eligibleRooms,
  missingRooms,
  propertyCreated,
  roomTypesCreated,
  lastSyncLog,
  ariHealth,
}: Readonly<{
  familyId: string;
  eligibleRooms: number;
  missingRooms: number;
  propertyCreated: boolean;
  roomTypesCreated: boolean;
  lastSyncLog: {
    action?: string;
    status: string;
    message: string | null;
    createdAt: string | null;
  } | null;
  ariHealth: AriHealthSnapshot;
}>): React.JSX.Element {
  const router = useRouter();
  const [isPushing, startPushing] = useTransition();
  const [isPushing365, startPushing365] = useTransition();
  const [isVerifying, startVerifying] = useTransition();
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
    summary?: {
      mode?: "push_30" | "push_365" | "verify";
      windowDays?: number;
      eligibleRooms: number;
      availabilityChanges: number;
      restrictionChanges: number;
      verifiedAvailabilityCount?: number;
      verifiedRateCount?: number;
      verifiedMinStayThroughCount?: number;
      availabilityMatchedCount?: number;
      rateMatchedCount?: number;
      availabilityChunkCount?: number;
      restrictionChunkCount?: number;
      dateRange?: { from: string; to: string };
    };
    rooms?: Array<{
      stayUnitId: string;
      name: string;
      status: "eligible" | "missing_fields";
      missingFields: string[];
    }>;
    pushedRanges?: Array<{
      roomName: string;
      roomTypeId: string;
      ratePlanId: string;
      availabilityRanges: Array<{ dateFrom: string; dateTo: string; availability: number }>;
      rateRanges: Array<{ dateFrom: string; dateTo: string; rate: string; stopSell: boolean; minStayThrough: number }>;
    }>;
    warnings?: string[];
    verificationFailed?: boolean;
  } | null>(null);

  const blockedMessage = !propertyCreated
    ? "Create provider property first."
    : !roomTypesCreated
      ? "Create room types and rate plans first."
      : eligibleRooms <= 0
        ? "No eligible active mapped rooms are ready for staging sync."
        : null;

  return (
    <section className={styles.cardInset}>
      <div className={styles.cardHeaderCompact}>
        <div>
          <div className={styles.listTitle}>Manual staging ARI sync</div>
          <div className={styles.cardCopy}>
            Manual Sync now reuses the same verified 365-day ARI flow. Daily cron can keep active Channex channels fresh, while manual runs stay available for operator checks.
          </div>
        </div>
        <span className={`${styles.badge} ${blockedMessage ? styles.badgeMuted : ""}`.trim()}>
          {blockedMessage ? "Blocked" : "Ready"}
        </span>
      </div>

      <div className={styles.placeholderGrid}>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Eligible rooms</div>
          <div className={styles.placeholderCopy}>{eligibleRooms}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Missing mappings</div>
          <div className={styles.placeholderCopy}>{missingRooms}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Date range</div>
          <div className={styles.placeholderCopy}>30-day and 365-day manual push</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Last sync status</div>
          <div className={styles.placeholderCopy}>
            {lastSyncLog ? `${labelizeToken(lastSyncLog.action, "unknown")} · ${labelizeToken(lastSyncLog.status, "unknown")} · ${formatDateTime(lastSyncLog.createdAt)}` : "Not started"}
          </div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Sync health</div>
          <div className={styles.placeholderCopy}>{ariHealth.statusLabel}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Last daily sync</div>
          <div className={styles.placeholderCopy}>
            {ariHealth.lastAriSyncAt ? formatDateTime(ariHealth.lastAriSyncAt) : "Not started"}
          </div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Synced range</div>
          <div className={styles.placeholderCopy}>
            {ariHealth.syncedDateRange
              ? `${ariHealth.syncedDateRange.from} → ${ariHealth.syncedDateRange.to}`
              : "Not available"}
          </div>
        </div>
      </div>

      {lastSyncLog?.message ? (
        <div className={styles.feedCopy}>{lastSyncLog.message}</div>
      ) : null}

      <div className={styles.placeholderGrid} style={{ marginTop: 12 }}>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Last successful 30-day sync</div>
          <div className={styles.placeholderCopy}>
            {ariHealth.lastSuccessful30DaySync?.createdAt ? formatDateTime(ariHealth.lastSuccessful30DaySync.createdAt) : "Never"}
          </div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Last successful 365-day sync</div>
          <div className={styles.placeholderCopy}>
            {ariHealth.lastSuccessful365DaySync?.createdAt ? formatDateTime(ariHealth.lastSuccessful365DaySync.createdAt) : "Never"}
          </div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Last failed / warning sync</div>
          <div className={styles.placeholderCopy}>
            {ariHealth.lastProblemSync?.createdAt
              ? `${labelizeToken(ariHealth.lastProblemSync.action, "ARI sync")} · ${formatDateTime(ariHealth.lastProblemSync.createdAt)}`
              : "None"}
          </div>
        </div>
      </div>

      {ariHealth.recommendation ? (
        <div className={`${styles.feedbackBox} ${styles.feedbackError}`} style={{ marginTop: 12 }}>
          {ariHealth.recommendation}
        </div>
      ) : null}

      {ariHealth.lastProblemSync?.message ? (
        <div className={styles.feedCopy} style={{ marginTop: 8 }}>
          Latest sync issue: {ariHealth.lastProblemSync.message}
        </div>
      ) : null}

      {ariHealth.lastAriSyncError ? (
        <div className={styles.feedCopy} style={{ marginTop: 8 }}>
          Daily sync error: {ariHealth.lastAriSyncError}
        </div>
      ) : null}

      {blockedMessage ? (
        <div className={`${styles.feedbackBox} ${styles.feedbackError}`}>{blockedMessage}</div>
      ) : null}

      {feedback ? (
        <div className={`${styles.feedbackBox} ${feedback.ok ? styles.feedbackSuccess : styles.feedbackError}`}>
          {feedback.message}
          {feedback.summary ? (
            <div className={styles.inlineBadgeRow}>
              <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>Eligible rooms: {feedback.summary.eligibleRooms}</span>
              {typeof feedback.summary.windowDays === "number" ? (
                <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>Date window: {feedback.summary.windowDays} days</span>
              ) : null}
              <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>Availability changes: {feedback.summary.availabilityChanges}</span>
              <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>Restriction changes: {feedback.summary.restrictionChanges}</span>
              {typeof feedback.summary.verifiedAvailabilityCount === "number" ? (
                <span className={`${styles.readinessPill} ${feedback.verificationFailed ? styles.readinessPillReview : styles.readinessPillOk}`}>
                  Verified availability: {feedback.summary.verifiedAvailabilityCount}
                </span>
              ) : null}
              {typeof feedback.summary.verifiedRateCount === "number" ? (
                <span className={`${styles.readinessPill} ${feedback.verificationFailed ? styles.readinessPillReview : styles.readinessPillOk}`}>
                  Verified rate: {feedback.summary.verifiedRateCount}
                </span>
              ) : null}
              {typeof feedback.summary.verifiedMinStayThroughCount === "number" ? (
                <span className={`${styles.readinessPill} ${feedback.verificationFailed ? styles.readinessPillReview : styles.readinessPillOk}`}>
                  Verified min stay: {feedback.summary.verifiedMinStayThroughCount}
                </span>
              ) : null}
              {typeof feedback.summary.availabilityChunkCount === "number" ? (
                <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>
                  Availability chunks: {feedback.summary.availabilityChunkCount}
                </span>
              ) : null}
              {typeof feedback.summary.restrictionChunkCount === "number" ? (
                <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>
                  Restriction chunks: {feedback.summary.restrictionChunkCount}
                </span>
              ) : null}
              {typeof feedback.summary.availabilityMatchedCount === "number" ? (
                <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>
                  Current availability rows: {feedback.summary.availabilityMatchedCount}
                </span>
              ) : null}
              {typeof feedback.summary.rateMatchedCount === "number" ? (
                <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>
                  Current rate rows: {feedback.summary.rateMatchedCount}
                </span>
              ) : null}
            </div>
          ) : null}
          {feedback.summary?.dateRange ? (
            <div className={styles.feedCopy} style={{ marginTop: 10 }}>
              Date range: {feedback.summary.dateRange.from} → {feedback.summary.dateRange.to}
            </div>
          ) : null}
          {feedback.rooms && feedback.rooms.length > 0 ? (
            <div className={styles.mappingTable} style={{ marginTop: 14 }}>
              <div className={styles.mappingHeader}>Room</div>
              <div className={styles.mappingHeader}>Status</div>
              <div className={styles.mappingHeader}>Missing fields</div>
              {feedback.rooms.map((room) => (
                <Fragment key={room.stayUnitId}>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{room.name}</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{labelizeToken(room.status, "unknown")}</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingSubcopy}>{room.missingFields.length > 0 ? room.missingFields.join(", ") : "None"}</div>
                  </div>
                </Fragment>
              ))}
            </div>
          ) : null}
          {feedback.pushedRanges && feedback.pushedRanges.length > 0 ? (
            <div className={styles.mappingTable} style={{ marginTop: 14 }}>
              <div className={styles.mappingHeader}>Room</div>
              <div className={styles.mappingHeader}>Availability ranges</div>
              <div className={styles.mappingHeader}>Rate ranges</div>
              {feedback.pushedRanges.map((summary) => (
                <Fragment key={`${summary.roomTypeId}-${summary.ratePlanId}`}>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{summary.roomName}</div>
                    <div className={styles.mappingSubcopy}>{summary.roomTypeId}</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingSubcopy}>
                      {summary.availabilityRanges.slice(0, 6).map((range) => `${range.dateFrom} → ${range.dateTo}: ${range.availability}`).join(" | ")}
                      {summary.availabilityRanges.length > 6 ? ` | +${summary.availabilityRanges.length - 6} more` : ""}
                    </div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingSubcopy}>
                      {summary.rateRanges.slice(0, 6).map((range) => `${range.dateFrom} → ${range.dateTo}: ${range.rate}, stop_sell=${range.stopSell ? 1 : 0}, min=${range.minStayThrough}`).join(" | ")}
                      {summary.rateRanges.length > 6 ? ` | +${summary.rateRanges.length - 6} more` : ""}
                    </div>
                  </div>
                </Fragment>
              ))}
            </div>
          ) : null}
          {feedback.warnings && feedback.warnings.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              {feedback.warnings.map((warning) => (
                <div key={warning} className={styles.feedCopy}>- {warning}</div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.inlineActionRow}>
        <button
          type="button"
          className={styles.primaryActionButton}
          disabled={isPushing || isPushing365 || Boolean(blockedMessage)}
          onClick={() => {
            startPushing(async () => {
              setFeedback(null);

              try {
                const response = await fetch("/api/host/pro/channel/channex/ari/push", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ familyId }),
                });

                const payload = (await response.json()) as {
                  ok?: boolean;
                  status?: string;
                  message?: string;
                  eligibleRooms?: number;
                  availabilityChanges?: number;
                  restrictionChanges?: number;
                  verifiedAvailabilityCount?: number;
                  verifiedRateCount?: number;
                  verifiedMinStayThroughCount?: number;
                  windowDays?: number;
                  chunkSummary?: { availabilityChunkCount?: number; restrictionChunkCount?: number };
                  dateRange?: { from: string; to: string };
                  rooms?: Array<{
                    stayUnitId: string;
                    name: string;
                    status: "eligible" | "missing_fields";
                    missingFields: string[];
                  }>;
                  pushedRanges?: Array<{
                    roomName: string;
                    roomTypeId: string;
                    ratePlanId: string;
                    availabilityRanges: Array<{ dateFrom: string; dateTo: string; availability: number }>;
                    rateRanges: Array<{ dateFrom: string; dateTo: string; rate: string; stopSell: boolean; minStayThrough: number }>;
                  }>;
                  warnings?: string[];
                  verificationFailed?: boolean;
                };

                setFeedback({
                  ok: Boolean(response.ok && payload.ok),
                  message:
                    typeof payload.message === "string" && payload.message.trim().length > 0
                      ? payload.message
                      : "Unable to push Channex staging ARI.",
                  summary:
                    typeof payload.eligibleRooms === "number" &&
                    typeof payload.availabilityChanges === "number" &&
                    typeof payload.restrictionChanges === "number"
                      ? {
                          mode: "push_30",
                          windowDays: typeof payload.windowDays === "number" ? payload.windowDays : 30,
                          eligibleRooms: payload.eligibleRooms,
                          availabilityChanges: payload.availabilityChanges,
                          restrictionChanges: payload.restrictionChanges,
                          verifiedAvailabilityCount:
                            typeof payload.verifiedAvailabilityCount === "number" ? payload.verifiedAvailabilityCount : undefined,
                          verifiedRateCount:
                            typeof payload.verifiedRateCount === "number" ? payload.verifiedRateCount : undefined,
                          verifiedMinStayThroughCount:
                            typeof payload.verifiedMinStayThroughCount === "number" ? payload.verifiedMinStayThroughCount : undefined,
                          availabilityChunkCount:
                            typeof payload.chunkSummary?.availabilityChunkCount === "number" ? payload.chunkSummary.availabilityChunkCount : undefined,
                          restrictionChunkCount:
                            typeof payload.chunkSummary?.restrictionChunkCount === "number" ? payload.chunkSummary.restrictionChunkCount : undefined,
                          dateRange: payload.dateRange,
                        }
                      : undefined,
                  rooms: Array.isArray(payload.rooms) ? payload.rooms : undefined,
                  pushedRanges: Array.isArray(payload.pushedRanges) ? payload.pushedRanges : undefined,
                  warnings: Array.isArray(payload.warnings) ? payload.warnings : undefined,
                  verificationFailed: Boolean(payload.verificationFailed || payload.status === "verification_failed"),
                });
                router.refresh();
              } catch (error) {
                setFeedback({
                  ok: false,
                  message: error instanceof Error ? error.message : "Unable to push Channex staging ARI.",
                });
              }
            });
          }}
        >
          {isPushing ? "Pushing..." : "Push 30-day staging sync"}
        </button>
        <button
          type="button"
          className={styles.secondaryActionButton}
          disabled={isPushing || isPushing365 || Boolean(blockedMessage)}
          onClick={() => {
            startPushing365(async () => {
              setFeedback(null);

              try {
                const response = await fetch("/api/host/pro/channel/channex/ari/push", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ familyId, windowDays: 365 }),
                });

                const payload = (await response.json()) as {
                  ok?: boolean;
                  status?: string;
                  message?: string;
                  eligibleRooms?: number;
                  availabilityChanges?: number;
                  restrictionChanges?: number;
                  verifiedAvailabilityCount?: number;
                  verifiedRateCount?: number;
                  verifiedMinStayThroughCount?: number;
                  windowDays?: number;
                  chunkSummary?: { availabilityChunkCount?: number; restrictionChunkCount?: number };
                  dateRange?: { from: string; to: string };
                  rooms?: Array<{
                    stayUnitId: string;
                    name: string;
                    status: "eligible" | "missing_fields";
                    missingFields: string[];
                  }>;
                  pushedRanges?: Array<{
                    roomName: string;
                    roomTypeId: string;
                    ratePlanId: string;
                    availabilityRanges: Array<{ dateFrom: string; dateTo: string; availability: number }>;
                    rateRanges: Array<{ dateFrom: string; dateTo: string; rate: string; stopSell: boolean; minStayThrough: number }>;
                  }>;
                  warnings?: string[];
                  verificationFailed?: boolean;
                };

                setFeedback({
                  ok: Boolean(response.ok && payload.ok),
                  message:
                    typeof payload.message === "string" && payload.message.trim().length > 0
                      ? payload.message
                      : "Unable to push Channex 365-day staging ARI.",
                  summary:
                    typeof payload.eligibleRooms === "number" &&
                    typeof payload.availabilityChanges === "number" &&
                    typeof payload.restrictionChanges === "number"
                      ? {
                          mode: "push_365",
                          windowDays: typeof payload.windowDays === "number" ? payload.windowDays : 365,
                          eligibleRooms: payload.eligibleRooms,
                          availabilityChanges: payload.availabilityChanges,
                          restrictionChanges: payload.restrictionChanges,
                          verifiedAvailabilityCount:
                            typeof payload.verifiedAvailabilityCount === "number" ? payload.verifiedAvailabilityCount : undefined,
                          verifiedRateCount:
                            typeof payload.verifiedRateCount === "number" ? payload.verifiedRateCount : undefined,
                          verifiedMinStayThroughCount:
                            typeof payload.verifiedMinStayThroughCount === "number" ? payload.verifiedMinStayThroughCount : undefined,
                          availabilityChunkCount:
                            typeof payload.chunkSummary?.availabilityChunkCount === "number" ? payload.chunkSummary.availabilityChunkCount : undefined,
                          restrictionChunkCount:
                            typeof payload.chunkSummary?.restrictionChunkCount === "number" ? payload.chunkSummary.restrictionChunkCount : undefined,
                          dateRange: payload.dateRange,
                        }
                      : undefined,
                  rooms: Array.isArray(payload.rooms) ? payload.rooms : undefined,
                  pushedRanges: Array.isArray(payload.pushedRanges) ? payload.pushedRanges : undefined,
                  warnings: Array.isArray(payload.warnings) ? payload.warnings : undefined,
                  verificationFailed: Boolean(payload.verificationFailed || payload.status === "verification_failed"),
                });
                router.refresh();
              } catch (error) {
                setFeedback({
                  ok: false,
                  message: error instanceof Error ? error.message : "Unable to push Channex 365-day staging ARI.",
                });
              }
            });
          }}
        >
          {isPushing365 ? "Pushing..." : "Push 365-day staging sync"}
        </button>
        <button
          type="button"
          className={styles.secondaryActionButton}
          disabled={isPushing || isPushing365 || Boolean(blockedMessage)}
          onClick={() => {
            startPushing365(async () => {
              setFeedback(null);

              try {
                const response = await fetch("/api/host/pro/channel/channex/ari/push", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ familyId, windowDays: 365 }),
                });

                const payload = (await response.json()) as {
                  ok?: boolean;
                  status?: string;
                  message?: string;
                  eligibleRooms?: number;
                  availabilityChanges?: number;
                  restrictionChanges?: number;
                  verifiedAvailabilityCount?: number;
                  verifiedRateCount?: number;
                  verifiedMinStayThroughCount?: number;
                  windowDays?: number;
                  chunkSummary?: { availabilityChunkCount?: number; restrictionChunkCount?: number };
                  dateRange?: { from: string; to: string };
                  rooms?: Array<{
                    stayUnitId: string;
                    name: string;
                    status: "eligible" | "missing_fields";
                    missingFields: string[];
                  }>;
                  pushedRanges?: Array<{
                    roomName: string;
                    roomTypeId: string;
                    ratePlanId: string;
                    availabilityRanges: Array<{ dateFrom: string; dateTo: string; availability: number }>;
                    rateRanges: Array<{ dateFrom: string; dateTo: string; rate: string; stopSell: boolean; minStayThrough: number }>;
                  }>;
                  warnings?: string[];
                  verificationFailed?: boolean;
                };

                setFeedback({
                  ok: Boolean(response.ok && payload.ok),
                  message:
                    typeof payload.message === "string" && payload.message.trim().length > 0
                      ? payload.message
                      : "Unable to sync Channex 365-day ARI now.",
                  summary:
                    typeof payload.eligibleRooms === "number" &&
                    typeof payload.availabilityChanges === "number" &&
                    typeof payload.restrictionChanges === "number"
                      ? {
                          mode: "push_365",
                          windowDays: typeof payload.windowDays === "number" ? payload.windowDays : 365,
                          eligibleRooms: payload.eligibleRooms,
                          availabilityChanges: payload.availabilityChanges,
                          restrictionChanges: payload.restrictionChanges,
                          verifiedAvailabilityCount:
                            typeof payload.verifiedAvailabilityCount === "number" ? payload.verifiedAvailabilityCount : undefined,
                          verifiedRateCount:
                            typeof payload.verifiedRateCount === "number" ? payload.verifiedRateCount : undefined,
                          verifiedMinStayThroughCount:
                            typeof payload.verifiedMinStayThroughCount === "number" ? payload.verifiedMinStayThroughCount : undefined,
                          availabilityChunkCount:
                            typeof payload.chunkSummary?.availabilityChunkCount === "number" ? payload.chunkSummary.availabilityChunkCount : undefined,
                          restrictionChunkCount:
                            typeof payload.chunkSummary?.restrictionChunkCount === "number" ? payload.chunkSummary.restrictionChunkCount : undefined,
                          dateRange: payload.dateRange,
                        }
                      : undefined,
                  rooms: Array.isArray(payload.rooms) ? payload.rooms : undefined,
                  pushedRanges: Array.isArray(payload.pushedRanges) ? payload.pushedRanges : undefined,
                  warnings: Array.isArray(payload.warnings) ? payload.warnings : undefined,
                  verificationFailed: Boolean(payload.verificationFailed || payload.status === "verification_failed"),
                });
                router.refresh();
              } catch (error) {
                setFeedback({
                  ok: false,
                  message: error instanceof Error ? error.message : "Unable to sync Channex 365-day ARI now.",
                });
              }
            });
          }}
        >
          {isPushing365 ? "Syncing..." : "Sync now"}
        </button>
        <button
          type="button"
          className={styles.secondaryActionButton}
          disabled={isVerifying || !propertyCreated}
          onClick={() => {
            startVerifying(async () => {
              try {
                const response = await fetch("/api/host/pro/channel/channex/ari/verify", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ familyId }),
                });

                const payload = (await response.json()) as {
                  ok?: boolean;
                  message?: string;
                  availabilityMatchedCount?: number;
                  rateMatchedCount?: number;
                  dateRange?: { from: string; to: string };
                };

                setFeedback({
                  ok: Boolean(response.ok && payload.ok),
                  message:
                    typeof payload.message === "string" && payload.message.trim().length > 0
                      ? payload.message
                      : "Unable to verify current Channex inventory.",
                  summary:
                    typeof payload.availabilityMatchedCount === "number" && typeof payload.rateMatchedCount === "number"
                      ? {
                          mode: "verify",
                          eligibleRooms,
                          availabilityChanges: 0,
                          restrictionChanges: 0,
                          availabilityMatchedCount: payload.availabilityMatchedCount,
                          rateMatchedCount: payload.rateMatchedCount,
                          dateRange: payload.dateRange,
                        }
                      : undefined,
                });
              } catch (error) {
                setFeedback({
                  ok: false,
                  message: error instanceof Error ? error.message : "Unable to verify current Channex inventory.",
                });
              }
            });
          }}
        >
          {isVerifying ? "Verifying..." : "Verify current Channex inventory"}
        </button>
      </div>
    </section>
  );
}

function ChannexBookingFeedCard({
  familyId,
  propertyCreated,
  externalPropertyId,
  lastSyncLog,
  storedRevisions,
  proBookings,
}: Readonly<{
  familyId: string;
  propertyCreated: boolean;
  externalPropertyId: string | null;
  lastSyncLog: {
    status: string;
    message: string | null;
    createdAt: string | null;
  } | null;
  storedRevisions: Array<{
    id: string;
    externalBookingId: string | null;
    externalRevisionId: string | null;
    status: string | null;
    otaName: string | null;
    arrivalDate: string | null;
    departureDate: string | null;
    guestName: string | null;
    externalRoomTypeId: string | null;
    externalRatePlanId: string | null;
    amount: number | null;
    currency: string | null;
    paymentCollect: string | null;
    source: string;
    importStatus: string;
    ackStatus: string;
    linkedBookingId: string | null;
    updatedAt: string | null;
    rawPayload: Record<string, unknown>;
  }>;
  proBookings: ProBookingSummary[];
}>): React.JSX.Element {
  const router = useRouter();
  const [isFetching, startFetching] = useTransition();
  const [isImportingPreview, startImportingPreview] = useTransition();
  const [isApplyingModification, startApplyingModification] = useTransition();
  const [isApplyingCancellation, startApplyingCancellation] = useTransition();
  const [isAcknowledgingPreview, startAcknowledgingPreview] = useTransition();
  const [importingPreviewId, setImportingPreviewId] = useState<string | null>(null);
  const [applyingModificationId, setApplyingModificationId] = useState<string | null>(null);
  const [applyingCancellationId, setApplyingCancellationId] = useState<string | null>(null);
  const [acknowledgingPreviewId, setAcknowledgingPreviewId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
    summary?: {
      totalFetched: number;
      revisionsFound: number;
      unmatchedCount: number;
      unmatchedRoomCount: number;
      lastCheckedAt: string | null;
    };
    latestSafeBookingIds?: string[];
    unmatchedRevisions?: Array<{
      externalBookingId: string | null;
      revisionId: string | null;
      otaName: string | null;
      status: string | null;
      arrivalDate: string | null;
      departureDate: string | null;
      reason: "property_id_missing" | "property_id_mismatch" | "room_type_id_missing" | "unsupported_shape";
      discoveredPropertyIds: string[];
    }>;
    revisions?: Array<{
      externalBookingId: string | null;
      revisionId: string | null;
      status: string | null;
      otaName: string | null;
      arrivalDate: string | null;
      departureDate: string | null;
      guestName: string | null;
      externalRoomTypeId: string | null;
      externalRatePlanId: string | null;
      amount: string | null;
      currency: string | null;
      paymentCollect: string | null;
      paymentType: string | null;
      unmatchedRoom: boolean;
      insertedAt: string | null;
      source?: string | null;
      importStatus?: string | null;
      ackStatus?: string | null;
      linkedBookingId?: string | null;
      bookingListRevisionId?: string | null;
      isCrsOnly?: boolean;
      ackEligible?: boolean;
      currentBooking?: ProBookingSummary | null;
    }>;
  } | null>(null);
  const blockedMessage = !propertyCreated
    ? "Create provider property first."
    : !externalPropertyId
      ? "Provider property is not mapped yet."
      : null;
  const proBookingsById = new Map(proBookings.map((booking) => [booking.bookingId, booking]));
  const displayedStoredRevisions = storedRevisions.map((revision) => ({
    id: revision.id,
    externalBookingId: revision.externalBookingId,
    revisionId: revision.externalRevisionId,
    status: revision.status,
    otaName: revision.otaName,
    arrivalDate: revision.arrivalDate,
    departureDate: revision.departureDate,
    guestName: revision.guestName,
    externalRoomTypeId: revision.externalRoomTypeId,
    externalRatePlanId: revision.externalRatePlanId,
    amount: revision.amount != null ? revision.amount.toFixed(2) : null,
    currency: revision.currency,
    paymentCollect: revision.paymentCollect,
    paymentType: null,
    unmatchedRoom: false,
    insertedAt: revision.updatedAt,
    source: revision.source,
    importStatus: revision.importStatus,
    ackStatus: revision.ackStatus,
    linkedBookingId: revision.linkedBookingId,
    bookingListRevisionId: asStringOrNull(revision.rawPayload?.booking_list_revision_id),
    isCrsOnly:
      revision.rawPayload?.is_crs_revision === true ||
      revision.rawPayload?.booking_list_is_crs_revision === true ||
      (Object.prototype.hasOwnProperty.call(revision.rawPayload, "channel_id") && !asStringOrNull(revision.rawPayload?.channel_id)) ||
      (Object.prototype.hasOwnProperty.call(revision.rawPayload, "booking_list_channel_id") && !asStringOrNull(revision.rawPayload?.booking_list_channel_id)),
    ackEligible: Boolean(revision.externalRevisionId),
    currentBooking: revision.linkedBookingId ? proBookingsById.get(revision.linkedBookingId) ?? null : null,
  }));

  return (
    <section className={styles.cardInset}>
      <div className={styles.cardHeaderCompact}>
        <div>
          <div className={styles.listTitle}>Channex booking feed</div>
          <div className={styles.cardCopy}>
            Preview of Channex staging booking revisions. New bookings and cancellations can sync automatically, while modification revisions stay operator-reviewed before acknowledgement.
          </div>
        </div>
        <span className={`${styles.badge} ${blockedMessage ? styles.badgeMuted : ""}`.trim()}>
          {blockedMessage ? "Blocked" : "Read-only"}
        </span>
      </div>

      <div className={styles.placeholderGrid}>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>External property ID</div>
          <div className={styles.placeholderCopy}>{externalPropertyId ?? "Missing"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Acknowledgement</div>
          <div className={styles.placeholderCopy}>Only after successful import/apply</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Last checked</div>
          <div className={styles.placeholderCopy}>{lastSyncLog ? formatDateTime(lastSyncLog.createdAt) : "Not checked"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Last status</div>
          <div className={styles.placeholderCopy}>{lastSyncLog ? labelizeToken(lastSyncLog.status, "unknown") : "Not checked"}</div>
        </div>
      </div>

      <div className={styles.feedCopy}>
        Feed returned 0 can still mean the booking exists in Booking List API. Verify the booking list below without importing or acknowledging anything.
      </div>

      {lastSyncLog?.message ? <div className={styles.feedCopy}>{lastSyncLog.message}</div> : null}
      {blockedMessage ? <div className={`${styles.feedbackBox} ${styles.feedbackError}`}>{blockedMessage}</div> : null}

      {feedback ? (
        <div className={`${styles.feedbackBox} ${feedback.ok ? styles.feedbackSuccess : styles.feedbackError}`}>
          {feedback.message}
          {feedback.summary ? (
            <div className={styles.inlineBadgeRow}>
              <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>Total returned: {feedback.summary.totalFetched}</span>
              <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>Revisions found: {feedback.summary.revisionsFound}</span>
              <span className={`${styles.readinessPill} ${feedback.summary.unmatchedCount > 0 ? styles.readinessPillReview : styles.readinessPillOk}`}>
                Unmatched: {feedback.summary.unmatchedCount}
              </span>
              <span className={`${styles.readinessPill} ${feedback.summary.unmatchedRoomCount > 0 ? styles.readinessPillReview : styles.readinessPillOk}`}>
                Unmatched rooms: {feedback.summary.unmatchedRoomCount}
              </span>
              <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>Last checked: {formatDateTime(feedback.summary.lastCheckedAt)}</span>
            </div>
          ) : null}

          {feedback.latestSafeBookingIds && feedback.latestSafeBookingIds.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div className={styles.feedCopy}>Latest booking IDs: {feedback.latestSafeBookingIds.join(", ")}</div>
            </div>
          ) : null}

          {feedback.unmatchedRevisions && feedback.unmatchedRevisions.length > 0 ? (
            <div className={styles.mappingTable} style={{ marginTop: 14 }}>
              <div className={styles.mappingHeader}>Unmatched booking</div>
              <div className={styles.mappingHeader}>Status</div>
              <div className={styles.mappingHeader}>Dates</div>
              <div className={styles.mappingHeader}>Reason</div>
              <div className={styles.mappingHeader}>Discovered property IDs</div>
              {feedback.unmatchedRevisions.map((revision, index) => (
                <Fragment key={`${revision.revisionId ?? revision.externalBookingId ?? "unmatched"}-${index}`}>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{revision.externalBookingId ?? "Unknown booking"}</div>
                    <div className={styles.mappingSubcopy}>Revision {revision.revisionId ?? "Unknown"}</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{labelizeToken(revision.status, "unknown")}</div>
                    <div className={styles.mappingSubcopy}>{revision.otaName ?? "Unknown OTA"}</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{revision.arrivalDate ?? "Unknown"} → {revision.departureDate ?? "Unknown"}</div>
                    <div className={styles.mappingSubcopy}>Unmatched preview only</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{revision.reason}</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>
                      {revision.discoveredPropertyIds.length > 0 ? revision.discoveredPropertyIds.join(", ") : "None found"}
                    </div>
                  </div>
                </Fragment>
              ))}
            </div>
          ) : null}

          {displayedStoredRevisions.length > 0 || (feedback.revisions && feedback.revisions.length > 0) ? (
            <div className={styles.mappingTable} style={{ marginTop: 14 }}>
              <div className={styles.mappingHeader}>Booking</div>
              <div className={styles.mappingHeader}>Status</div>
              <div className={styles.mappingHeader}>Visibility</div>
              <div className={styles.mappingHeader}>Channel</div>
              <div className={styles.mappingHeader}>Dates</div>
              <div className={styles.mappingHeader}>Guest</div>
              <div className={styles.mappingHeader}>Room / Rate</div>
              <div className={styles.mappingHeader}>Amount</div>
              {(displayedStoredRevisions.length > 0 ? displayedStoredRevisions : feedback.revisions ?? []).map((revision, index) => (
                <Fragment key={revision.revisionId ?? revision.externalBookingId ?? revision.insertedAt ?? `revision-${index}`}>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{revision.externalBookingId ?? "Unknown booking"}</div>
                    <div className={styles.mappingSubcopy}>Revision {revision.revisionId ?? "Unknown"}</div>
                  </div>
                    <div className={styles.mappingCell}>
                      <div className={styles.mappingTitle}>{labelizeToken(revision.status, "unknown")}</div>
                      <div className={styles.mappingSubcopy}>
                        {revision.importStatus ?? "preview"} · {revision.ackStatus ?? "not_acknowledged"} · {labelizeToken((revision as { source?: string | null }).source, "unknown_source")}
                      </div>
                    </div>
                    <div className={styles.mappingCell}>
                      <div className={styles.mappingTitle}>
                        Feed {revision.revisionId ?? "missing"} · List {revision.bookingListRevisionId ?? "missing"}
                      </div>
                      <div className={styles.mappingSubcopy}>
                        {revision.isCrsOnly ? "CRS-only / manual" : "Channel-linked"}
                        {revision.ackEligible ? " · ack eligible" : " · ack blocked"}
                      </div>
                    </div>
                    <div className={styles.mappingCell}>
                      <div className={styles.mappingTitle}>{revision.otaName ?? "Unknown"}</div>
                      <div className={styles.mappingSubcopy}>{revision.paymentCollect ?? "collection unknown"}</div>
                    </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{revision.arrivalDate ?? "Unknown"} → {revision.departureDate ?? "Unknown"}</div>
                    <div className={styles.mappingSubcopy}>Received {formatDateTime(revision.insertedAt)}</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{revision.guestName ?? "Guest hidden / unavailable"}</div>
                    <div className={styles.mappingSubcopy}>{revision.paymentType ?? "payment type unknown"}</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{revision.externalRoomTypeId ?? "Room unmapped"}</div>
                    <div className={styles.mappingSubcopy}>
                      {revision.externalRatePlanId ?? "Rate unmapped"}
                      {revision.unmatchedRoom ? " · review mapping" : ""}
                    </div>
                  </div>
                    <div className={styles.mappingCell}>
                      <div className={styles.mappingTitle}>
                        {revision.amount && revision.currency ? `${revision.amount} ${revision.currency}` : revision.amount ?? revision.currency ?? "Not available"}
                      </div>
                      <div className={styles.mappingSubcopy}>
                      {revision.importStatus === "modified_applied"
                        ? `Modification applied to Famlo${revision.linkedBookingId ? ` · ${revision.linkedBookingId}` : ""} · ${revision.ackStatus === "acknowledged" ? "Acknowledged" : "Not acknowledged yet"}`
                        : revision.importStatus === "cancelled_applied"
                        ? `Cancellation applied to Famlo${revision.linkedBookingId ? ` · ${revision.linkedBookingId}` : ""} · ${revision.ackStatus === "acknowledged" ? "Acknowledged" : "Not acknowledged yet"}`
                        : revision.importStatus === "imported"
                        ? `Imported into Famlo${revision.linkedBookingId ? ` · ${revision.linkedBookingId}` : ""} · ${revision.ackStatus === "acknowledged" ? "Acknowledged" : "Not acknowledged yet"}`
                        : revision.importStatus === "modified_pending_review"
                          ? `Modification preview pending review${revision.linkedBookingId ? ` · ${revision.linkedBookingId}` : ""}`
                          : "Preview only, not imported yet"}
                    </div>
                    {revision.importStatus === "modified_pending_review" ? (
                      <div className={styles.mappingSubcopy} style={{ marginTop: 6 }}>
                        Current Famlo: {revision.currentBooking?.startDate ?? "Unknown"} → {revision.currentBooking?.endDate ?? "Unknown"} · {revision.currentBooking?.amount ?? "Amount unknown"}
                      </div>
                    ) : null}
                    {revision.importStatus === "modified_pending_review" ? (
                      <div className={styles.mappingSubcopy}>
                        Incoming channel: {revision.arrivalDate ?? "Unknown"} → {revision.departureDate ?? "Unknown"} · {revision.amount && revision.currency ? `${revision.amount} ${revision.currency}` : "Amount unknown"}
                      </div>
                    ) : null}
                    {revision.importStatus === "modified_pending_review" ? (
                      <div className={styles.mappingSubcopy}>
                        Warning: Will update the existing Famlo booking and acknowledge after success.
                      </div>
                    ) : null}
                    {"id" in revision && revision.id ? (
                      <div className={styles.inlineActionRow} style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className={styles.secondaryActionButton}
                          disabled={
                            isImportingPreview ||
                            isApplyingModification ||
                            isApplyingCancellation ||
                            Boolean(blockedMessage) ||
                            revision.importStatus === "imported" ||
                            revision.importStatus === "modified_pending_review" ||
                            revision.importStatus === "modified_applied" ||
                            revision.importStatus === "cancelled_applied" ||
                            !revision.externalRoomTypeId
                          }
                          onClick={() => {
                            startImportingPreview(async () => {
                                setImportingPreviewId(typeof revision.id === "string" ? revision.id : null);
                              try {
                                const response = await fetch("/api/host/pro/channel/channex/bookings/import-preview", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    familyId,
                                    channelBookingRevisionId: revision.id,
                                  }),
                                });

                                const payload = (await response.json()) as {
                                  ok?: boolean;
                                  message?: string;
                                  error?: string;
                                  bookingId?: string | null;
                                };

                                if (!response.ok || !payload.ok) {
                                  throw new Error(payload.error ?? payload.message ?? "Unable to import this preview booking.");
                                }

                                setFeedback({
                                  ok: true,
                                  message:
                                    typeof payload.message === "string" && payload.message.trim().length > 0
                                      ? payload.message
                                      : "Imported the preview booking into Famlo without acknowledging Channex.",
                                });
                                router.refresh();
                              } catch (error) {
                                setFeedback({
                                  ok: false,
                                  message: error instanceof Error ? error.message : "Unable to import this preview booking.",
                                });
                              } finally {
                                setImportingPreviewId(null);
                              }
                            });
                          }}
                        >
                          {isImportingPreview && importingPreviewId === revision.id
                            ? "Importing..."
                            : revision.importStatus === "imported"
                              ? "Imported into Famlo"
                              : "Import to Famlo"}
                        </button>
                        {revision.importStatus === "modified_pending_review" ? (
                          <button
                            type="button"
                            className={styles.secondaryActionButton}
                            disabled={isApplyingModification || Boolean(blockedMessage)}
                            onClick={() => {
                              startApplyingModification(async () => {
                                setApplyingModificationId(typeof revision.id === "string" ? revision.id : null);
                                try {
                                  const response = await fetch("/api/host/pro/channel/channex/bookings/apply-modification", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      channelBookingRevisionId: revision.id,
                                    }),
                                  });

                                  const payload = (await response.json()) as {
                                    ok?: boolean;
                                    message?: string;
                                    error?: string;
                                    status?: string;
                                  };

                                  if (!response.ok || !payload.ok) {
                                    throw new Error(payload.error ?? payload.message ?? "Unable to apply this Channex booking modification.");
                                  }

                                  setFeedback({
                                    ok: true,
                                    message:
                                      typeof payload.message === "string" && payload.message.trim().length > 0
                                        ? payload.message
                                        : "Modification applied to Famlo. Not acknowledged yet.",
                                  });
                                  router.refresh();
                                } catch (error) {
                                  setFeedback({
                                    ok: false,
                                    message: error instanceof Error ? error.message : "Unable to apply this Channex booking modification.",
                                  });
                                } finally {
                                  setApplyingModificationId(null);
                                }
                              });
                            }}
                          >
                            {isApplyingModification && applyingModificationId === revision.id
                              ? "Applying..."
                              : "Apply modification"}
                          </button>
                        ) : null}
                        {revision.importStatus === "modified_pending_review" ? (
                          <button
                            type="button"
                            className={styles.secondaryActionButton}
                            onClick={() => {
                              setFeedback({
                                ok: true,
                                message: "Left this Channex modification for later manual review. No Famlo booking change and no acknowledgement were sent.",
                              });
                            }}
                          >
                            Leave for later
                          </button>
                        ) : null}
                        {revision.status === "cancelled" &&
                        revision.importStatus !== "cancelled_applied" &&
                        revision.linkedBookingId ? (
                          <button
                            type="button"
                            className={styles.secondaryActionButton}
                            disabled={isApplyingCancellation || Boolean(blockedMessage)}
                            onClick={() => {
                              startApplyingCancellation(async () => {
                                setApplyingCancellationId(typeof revision.id === "string" ? revision.id : null);
                                try {
                                  const response = await fetch("/api/host/pro/channel/channex/bookings/apply-cancellation", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      channelBookingRevisionId: revision.id,
                                    }),
                                  });

                                  const payload = (await response.json()) as {
                                    ok?: boolean;
                                    message?: string;
                                    error?: string;
                                    status?: string;
                                  };

                                  if (!response.ok || !payload.ok) {
                                    throw new Error(payload.error ?? payload.message ?? "Unable to apply this Channex booking cancellation.");
                                  }

                                  setFeedback({
                                    ok: true,
                                    message:
                                      typeof payload.message === "string" && payload.message.trim().length > 0
                                        ? payload.message
                                        : "Cancellation applied to Famlo. Not acknowledged yet.",
                                  });
                                  router.refresh();
                                } catch (error) {
                                  setFeedback({
                                    ok: false,
                                    message: error instanceof Error ? error.message : "Unable to apply this Channex booking cancellation.",
                                  });
                                } finally {
                                  setApplyingCancellationId(null);
                                }
                              });
                            }}
                          >
                            {isApplyingCancellation && applyingCancellationId === revision.id
                              ? "Applying..."
                              : "Apply cancellation"}
                          </button>
                        ) : null}
                        {revision.importStatus === "imported" || revision.importStatus === "modified_applied" || revision.importStatus === "cancelled_applied" ? (
                          revision.ackStatus === "acknowledged" ? (
                            <button
                              type="button"
                              className={styles.secondaryActionButton}
                              disabled
                            >
                              Acknowledged
                            </button>
                          ) : revision.revisionId ? (
                            <button
                              type="button"
                              className={styles.secondaryActionButton}
                              disabled={isAcknowledgingPreview || Boolean(blockedMessage)}
                              onClick={() => {
                                startAcknowledgingPreview(async () => {
                                  setAcknowledgingPreviewId(typeof revision.id === "string" ? revision.id : null);
                                  try {
                                    const response = await fetch("/api/host/pro/channel/channex/bookings/acknowledge", {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        channelBookingRevisionId: revision.id,
                                      }),
                                    });

                                    const payload = (await response.json()) as {
                                      ok?: boolean;
                                      message?: string;
                                      error?: string;
                                      status?: string;
                                    };

                                    if (!response.ok || !payload.ok) {
                                      throw new Error(payload.error ?? payload.message ?? "Unable to acknowledge this Channex booking revision.");
                                    }

                                    setFeedback({
                                      ok: true,
                                      message:
                                        typeof payload.message === "string" && payload.message.trim().length > 0
                                          ? payload.message
                                          : "Acknowledged this imported Channex booking revision.",
                                    });
                                    router.refresh();
                                  } catch (error) {
                                    setFeedback({
                                      ok: false,
                                      message: error instanceof Error ? error.message : "Unable to acknowledge this Channex booking revision.",
                                    });
                                  } finally {
                                    setAcknowledgingPreviewId(null);
                                  }
                                });
                              }}
                            >
                              {isAcknowledgingPreview && acknowledgingPreviewId === revision.id
                                ? "Acknowledging..."
                                : "Acknowledge Channex"}
                            </button>
                          ) : (
                            <div className={styles.mappingSubcopy}>
                              Cannot acknowledge Booking List preview; requires feed revision id
                            </div>
                          )
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </Fragment>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.inlineActionRow}>
        <button
          type="button"
          className={styles.primaryActionButton}
          disabled={isFetching || Boolean(blockedMessage)}
          onClick={() => {
            startFetching(async () => {
              setFeedback(null);

              try {
                const response = await fetch("/api/host/pro/channel/channex/bookings/feed", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ familyId }),
                });

                const payload = (await response.json()) as {
                  ok?: boolean;
                  message?: string;
                  totalFetched?: number;
                  revisionsFound?: number;
                  unmatchedCount?: number;
                  unmatchedRoomCount?: number;
                  lastCheckedAt?: string | null;
                  latestSafeBookingIds?: string[];
                  unmatchedRevisions?: Array<{
                    externalBookingId: string | null;
                    revisionId: string | null;
                    otaName: string | null;
                    status: string | null;
                    arrivalDate: string | null;
                    departureDate: string | null;
                    reason: "property_id_missing" | "property_id_mismatch" | "room_type_id_missing" | "unsupported_shape";
                    discoveredPropertyIds: string[];
                  }>;
                  revisions?: Array<{
                    externalBookingId: string | null;
                    revisionId: string | null;
                    status: string | null;
                    otaName: string | null;
                    arrivalDate: string | null;
                    departureDate: string | null;
                    guestName: string | null;
                    externalRoomTypeId: string | null;
                    externalRatePlanId: string | null;
                    amount: string | null;
                    currency: string | null;
                    paymentCollect: string | null;
                    paymentType: string | null;
                    unmatchedRoom: boolean;
                    insertedAt: string | null;
                    importStatus?: string | null;
                    ackStatus?: string | null;
                  }>;
                };

                setFeedback({
                  ok: Boolean(response.ok && payload.ok),
                  message:
                    typeof payload.message === "string" && payload.message.trim().length > 0
                      ? payload.message
                      : "Unable to fetch the Channex staging booking feed.",
                  summary:
                    typeof payload.totalFetched === "number" &&
                    typeof payload.revisionsFound === "number" &&
                    typeof payload.unmatchedCount === "number" &&
                    typeof payload.unmatchedRoomCount === "number"
                      ? {
                          totalFetched: payload.totalFetched,
                          revisionsFound: payload.revisionsFound,
                          unmatchedCount: payload.unmatchedCount,
                          unmatchedRoomCount: payload.unmatchedRoomCount,
                          lastCheckedAt: typeof payload.lastCheckedAt === "string" ? payload.lastCheckedAt : null,
                        }
                      : undefined,
                  latestSafeBookingIds: Array.isArray(payload.latestSafeBookingIds) ? payload.latestSafeBookingIds : undefined,
                  unmatchedRevisions: Array.isArray(payload.unmatchedRevisions) ? payload.unmatchedRevisions : undefined,
                  revisions: Array.isArray(payload.revisions) ? payload.revisions : undefined,
                });
                router.refresh();
              } catch (error) {
                setFeedback({
                  ok: false,
                  message: error instanceof Error ? error.message : "Unable to fetch the Channex staging booking feed.",
                });
              }
            });
          }}
        >
          {isFetching ? "Fetching..." : "Fetch staging booking feed"}
        </button>
      </div>
    </section>
  );
}

function OtaContentForm({
  familyId,
  initialSettings,
}: Readonly<{
  familyId: string;
  initialSettings: HostProSettings;
}>): React.JSX.Element {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [form, setForm] = useState({
    otaTitle: initialSettings.otaTitle ?? "",
    contactEmail: initialSettings.contactEmail ?? "",
    contactPhone: initialSettings.contactPhone ?? "",
    website: initialSettings.website ?? "",
    country: initialSettings.country ?? "India",
    state: initialSettings.state ?? "",
    city: initialSettings.city ?? "",
    postalCode: initialSettings.postalCode ?? "",
    addressLine: initialSettings.addressLine ?? "",
    latitude: initialSettings.latitude != null ? String(initialSettings.latitude) : "",
    longitude: initialSettings.longitude != null ? String(initialSettings.longitude) : "",
    propertyDescription: initialSettings.propertyDescription ?? "",
    checkInInstructions: initialSettings.checkInInstructions ?? "",
    houseRules: initialSettings.houseRules ?? "",
    cancellationPolicyLabel: initialSettings.cancellationPolicyLabel ?? "",
  });
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const updateField = (field: keyof typeof form, value: string): void => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSave = (): void => {
    setFeedback(null);
    startSaving(async () => {
      try {
        const response = await fetch("/api/host/pro/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId,
            otaTitle: form.otaTitle || null,
            contactEmail: form.contactEmail || null,
            contactPhone: form.contactPhone || null,
            website: form.website || null,
            country: form.country || null,
            state: form.state || null,
            city: form.city || null,
            postalCode: form.postalCode || null,
            addressLine: form.addressLine || null,
            latitude: form.latitude || null,
            longitude: form.longitude || null,
            propertyDescription: form.propertyDescription || null,
            checkInInstructions: form.checkInInstructions || null,
            houseRules: form.houseRules || null,
            cancellationPolicyLabel: form.cancellationPolicyLabel || null,
          }),
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to save OTA content settings.");
        }

        setFeedback({
          type: "success",
          text: "OTA content readiness settings saved. Refreshing the checklist now.",
        });
        router.refresh();
      } catch (error) {
        setFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to save OTA content settings.",
        });
      }
    });
  };

  return (
    <section className={styles.cardInset}>
      <div className={styles.listTitle}>Save OTA content</div>
      <div className={styles.contentSectionGrid}>
        <div className={styles.fieldGroup}>
          <div className={styles.groupTitle}>Property content</div>
          <div className={styles.settingsGrid}>
            <label className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>OTA title</span>
              <input className={styles.fieldInput} value={form.otaTitle} onChange={(event) => updateField("otaTitle", event.target.value)} />
            </label>
            <label className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>Website</span>
              <input className={styles.fieldInput} value={form.website} onChange={(event) => updateField("website", event.target.value)} placeholder="https://..." />
            </label>
            <label className={styles.fieldBlock} style={{ gridColumn: "1 / -1" }}>
              <span className={styles.fieldLabel}>Property description</span>
              <textarea className={styles.fieldTextarea} value={form.propertyDescription} onChange={(event) => updateField("propertyDescription", event.target.value)} />
            </label>
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <div className={styles.groupTitle}>Contact details</div>
          <div className={styles.settingsGrid}>
            <label className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>Contact email</span>
              <input className={styles.fieldInput} value={form.contactEmail} onChange={(event) => updateField("contactEmail", event.target.value)} />
            </label>
            <label className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>Contact phone</span>
              <input className={styles.fieldInput} value={form.contactPhone} onChange={(event) => updateField("contactPhone", event.target.value)} />
            </label>
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <div className={styles.groupTitle}>Location</div>
          <div className={styles.settingsGrid}>
            <label className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>Country</span>
              <input className={styles.fieldInput} value={form.country} onChange={(event) => updateField("country", event.target.value)} />
            </label>
            <label className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>State</span>
              <input className={styles.fieldInput} value={form.state} onChange={(event) => updateField("state", event.target.value)} />
            </label>
            <label className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>City</span>
              <input className={styles.fieldInput} value={form.city} onChange={(event) => updateField("city", event.target.value)} />
            </label>
            <label className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>Postal code</span>
              <input className={styles.fieldInput} value={form.postalCode} onChange={(event) => updateField("postalCode", event.target.value)} />
            </label>
            <label className={styles.fieldBlock} style={{ gridColumn: "1 / -1" }}>
              <span className={styles.fieldLabel}>Address line</span>
              <input className={styles.fieldInput} value={form.addressLine} onChange={(event) => updateField("addressLine", event.target.value)} />
            </label>
            <label className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>Latitude</span>
              <input className={styles.fieldInput} value={form.latitude} onChange={(event) => updateField("latitude", event.target.value)} />
            </label>
            <label className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>Longitude</span>
              <input className={styles.fieldInput} value={form.longitude} onChange={(event) => updateField("longitude", event.target.value)} />
            </label>
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <div className={styles.groupTitle}>Policies</div>
          <div className={styles.settingsGrid}>
            <label className={styles.fieldBlock}>
              <span className={styles.fieldLabel}>Cancellation policy label</span>
              <input className={styles.fieldInput} value={form.cancellationPolicyLabel} onChange={(event) => updateField("cancellationPolicyLabel", event.target.value)} placeholder="Flexible / Moderate / Strict" />
            </label>
            <label className={styles.fieldBlock} style={{ gridColumn: "1 / -1" }}>
              <span className={styles.fieldLabel}>Check-in instructions</span>
              <textarea className={styles.fieldTextarea} value={form.checkInInstructions} onChange={(event) => updateField("checkInInstructions", event.target.value)} />
            </label>
            <label className={styles.fieldBlock} style={{ gridColumn: "1 / -1" }}>
              <span className={styles.fieldLabel}>House rules</span>
              <textarea className={styles.fieldTextarea} value={form.houseRules} onChange={(event) => updateField("houseRules", event.target.value)} />
            </label>
          </div>
        </div>
      </div>

      <div className={styles.inlineActionRow}>
        <button type="button" className={styles.primaryActionButton} onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save OTA Content"}
        </button>
      </div>

      {feedback ? (
        <div className={`${styles.feedbackBox} ${feedback.type === "error" ? styles.feedbackError : styles.feedbackSuccess}`}>
          {feedback.text}
        </div>
      ) : null}
    </section>
  );
}

function PlaceholderSection({
  title,
  copy,
  items,
}: Readonly<{
  title: string;
  copy: string;
  items: string[];
}>): React.JSX.Element {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>{title}</h3>
          <p className={styles.cardCopy}>{copy}</p>
        </div>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.placeholderGrid}>
          {items.map((item) => (
            <div key={item} className={styles.placeholderRow}>
              <div className={styles.placeholderTitle}>{item}</div>
              <div className={styles.placeholderCopy}>Coming soon in the next Famlo Pro implementation phases.</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
