"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState, useTransition } from "react";
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
  Plus,
  RefreshCcw,
  Settings2,
  ShieldAlert,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";

import HostRoomsManager from "@/components/partners/rooms/HostRoomsManager";
import PropertyContentManager from "@/components/partners/property/PropertyContentManager";
import MessagesTab from "@/components/partners/tabs/MessagesTab";
import type { PhotoItem } from "@/components/partners/HostDashboardEditor";
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

type RoomSummary = {
  id: string;
  name: string;
  unitType: string;
  description: string | null;
  maxGuests: number;
  bedInfo: string | null;
  bathroomType: string | null;
  priceMorning: number;
  priceAfternoon: number;
  priceEvening: number;
  priceFullday: number;
  quarterEnabled: boolean;
  isActive: boolean;
  isPrimary: boolean;
  amenitiesCount: number;
  photosCount: number;
  photoUrl: string | null;
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

type BookingWorkspaceFilter =
  | "All"
  | "Famlo Direct"
  | "OTA"
  | "Pending approval"
  | "Confirmed"
  | "Cancelled"
  | "Modified / Review needed"
  | "Action needed";

type RoomEditorTabId =
  | "details"
  | "pricing"
  | "calendar"
  | "channels"
  | "mapping"
  | "sync-health";

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
  targetSection?: ProSectionId;
  actionLabel?: string | null;
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
  country: string | null;
  locality: string | null;
  famloPlusStatus: string | null;
  isActive: boolean;
};

type PropertyContentDraft = {
  propertyName: string;
  listingTitle: string;
  journeyStory: string;
  specialExperience: string;
  localExperience: string;
  houseType: string;
  interactionType: string;
  bathroomType: string;
  propertyAddress: string;
  commonAreas: string;
  amenities: string;
  includedItems: string;
  houseRules: string;
  googleMapsLink: string;
  foodType: string;
  checkInTime: string;
  checkOutTime: string;
};

interface FamloProDashboardShellProps {
  familyId: string;
  hostUserId: string | null;
  roomRouteState?: {
    mode: "edit" | "create";
    roomId?: string;
  } | null;
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
  initialPropertyContent: PropertyContentDraft;
  propertyPhotos: PhotoItem[];
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
  ["properties-home", "properties"],
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

const ROOM_EDITOR_TABS: Array<{
  id: RoomEditorTabId;
  title: string;
  description: string;
}> = [
  { id: "details", title: "Details", description: "Room name, photos, occupancy, and Famlo room settings." },
  { id: "pricing", title: "Pricing", description: "Base price readiness and the existing pricing workspace." },
  { id: "calendar", title: "Calendar", description: "Availability visibility for this room inside the property calendar." },
  { id: "channels", title: "Channels", description: "Connected channel readiness for this room." },
  { id: "mapping", title: "Mapping", description: "Room and rate mapping status for connected providers." },
  { id: "sync-health", title: "Sync Health", description: "Room-specific issues, logs, and follow-up actions." },
];

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
  if (target === "properties") return "properties-home";
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

const BOOKING_FILTERS: BookingWorkspaceFilter[] = [
  "All",
  "Famlo Direct",
  "OTA",
  "Pending approval",
  "Confirmed",
  "Cancelled",
  "Modified / Review needed",
  "Action needed",
];
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

function normalizeToken(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function isPendingApprovalBooking(booking: ProBookingSummary): boolean {
  const status = normalizeToken(booking.status);
  return !booking.isOta && (status === "pending" || status === "pending_host_approval");
}

function isCancelledBooking(booking: ProBookingSummary): boolean {
  const status = normalizeToken(booking.status);
  const importStatus = normalizeToken(booking.importStatus);
  return (
    status.startsWith("cancel") ||
    status === "rejected" ||
    importStatus.startsWith("cancel") ||
    importStatus.includes("cancelled")
  );
}

function isConfirmedBooking(booking: ProBookingSummary): boolean {
  const status = normalizeToken(booking.status);
  return status === "accepted" || status === "confirmed" || status === "checked_in" || status === "completed";
}

function isModifiedReviewBooking(booking: ProBookingSummary): boolean {
  const status = normalizeToken(booking.status);
  const importStatus = normalizeToken(booking.importStatus);
  return (
    status.includes("modified") ||
    importStatus.includes("modified") ||
    importStatus.includes("manual_review") ||
    importStatus.includes("pending_review")
  );
}

function hasPaymentAttention(booking: ProBookingSummary): boolean {
  const paymentStatus = normalizeToken(booking.paymentStatus);
  return paymentStatus === "failed" || paymentStatus === "requires_action" || paymentStatus === "unpaid";
}

function isActionNeededBooking(booking: ProBookingSummary): boolean {
  const importStatus = normalizeToken(booking.importStatus);
  const ackStatus = normalizeToken(booking.ackStatus);

  if (isPendingApprovalBooking(booking) || hasPaymentAttention(booking)) return true;
  if (isModifiedReviewBooking(booking) || isCancelledBooking(booking)) return true;
  if (!booking.isOta) return false;

  return (
    importStatus === "preview" ||
    importStatus.includes("failed") ||
    importStatus.includes("missing") ||
    importStatus.includes("manual_review") ||
    importStatus.includes("pending_review") ||
    (ackStatus !== "acknowledged" &&
      importStatus !== "not_applicable" &&
      importStatus !== "imported" &&
      importStatus !== "modified_applied")
  );
}

function matchesBookingFilter(booking: ProBookingSummary, filter: BookingWorkspaceFilter): boolean {
  switch (filter) {
    case "All":
      return true;
    case "Famlo Direct":
      return !booking.isOta;
    case "OTA":
      return booking.isOta;
    case "Pending approval":
      return isPendingApprovalBooking(booking);
    case "Confirmed":
      return isConfirmedBooking(booking);
    case "Cancelled":
      return isCancelledBooking(booking);
    case "Modified / Review needed":
      return isModifiedReviewBooking(booking);
    case "Action needed":
      return isActionNeededBooking(booking);
    default:
      return true;
  }
}

function bookingHealthLabel(booking: ProBookingSummary): string {
  if (isPendingApprovalBooking(booking)) return "Pending approval";
  if (isModifiedReviewBooking(booking)) return "Review needed";
  if (isCancelledBooking(booking)) return "Cancelled";
  if (hasPaymentAttention(booking)) return "Payment issue";
  if (booking.isOta) {
    const importStatus = normalizeToken(booking.importStatus);
    if (importStatus.includes("failed")) return "Import issue";
    if (normalizeToken(booking.ackStatus) !== "acknowledged" && importStatus === "preview") return "Awaiting import";
    return "Synced";
  }
  if (isConfirmedBooking(booking)) return "Confirmed";
  return labelizeToken(booking.status, "unknown");
}

function bookingNextAction(booking: ProBookingSummary): string {
  if (isPendingApprovalBooking(booking)) {
    return "Handle this in the current Famlo direct-booking flow.";
  }
  if (isModifiedReviewBooking(booking)) {
    return "Review the OTA change before acknowledging it.";
  }
  if (isCancelledBooking(booking) && booking.isOta) {
    return "Check whether the OTA cancellation was applied cleanly.";
  }
  if (hasPaymentAttention(booking)) {
    return "Review the booking payment state before arrival.";
  }
  if (booking.isOta) {
    const importStatus = normalizeToken(booking.importStatus);
    if (importStatus === "preview") return "Review the OTA import state below.";
    if (normalizeToken(booking.ackStatus) !== "acknowledged") return "Review OTA acknowledgement details below.";
    return "No immediate OTA action needed.";
  }
  return "No immediate action needed.";
}

function countCalendarCellsByStatus(
  calendarRows: CalendarRow[],
  status: CalendarCell["status"]
): number {
  return calendarRows.reduce(
    (sum, row) => sum + row.availabilityCells.filter((cell) => cell.status === status).length,
    0
  );
}

function parseBookingAmount(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/[^0-9.-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
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

function countRoomsMissingPhotos(rooms: RoomSummary[]): number {
  return rooms.filter((room) => room.photosCount <= 0).length;
}

function countRoomsMissingPrice(rooms: RoomSummary[]): number {
  return rooms.filter((room) => room.priceFullday <= 0).length;
}

function hasPrimaryReadyRoom(rooms: RoomSummary[]): boolean {
  return rooms.some((room) => room.isPrimary);
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
      copy: "Booking value and payment-status summary for this property using existing reservations only.",
      status: "Pilot summary",
    };
  }

  if (section === "reports") {
    return {
      eyebrow: "Insights",
      title: "Reports",
      copy: "Early pilot reporting for bookings, source mix, room activity, and visible calendar usage.",
      status: "Pilot insights",
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
  hostUserId,
  roomRouteState = null,
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
  initialPropertyContent,
  propertyPhotos,
  initialSettings,
  channelFoundation,
  channexConfig,
  proBookings,
  calendarColumns,
  calendarRows,
  calendarWindow,
  calendarVerification,
}: Readonly<FamloProDashboardShellProps>): React.JSX.Element {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<ProSectionId>(initialSection);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(roomRouteState?.roomId ?? rooms[0]?.id ?? null);
  const [roomEditorTab, setRoomEditorTab] = useState<RoomEditorTabId>("details");
  const [propertyContent, setPropertyContent] = useState<PropertyContentDraft>(initialPropertyContent);
  const [propertyGallery, setPropertyGallery] = useState<PhotoItem[]>(propertyPhotos);
  const [propertyContentSaving, startPropertyContentSaving] = useTransition();
  const [isPropertySwitchPending, startPropertySwitchTransition] = useTransition();
  const [isSidebarLogoBroken, setIsSidebarLogoBroken] = useState(false);
  const [propertyContentFeedback, setPropertyContentFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedCalendarBooking, setSelectedCalendarBooking] = useState<CalendarBookingDetail | null>(null);
  const [bookingFilter, setBookingFilter] = useState<BookingWorkspaceFilter>("All");
  const [selectedBooking, setSelectedBooking] = useState<ProBookingSummary | null>(null);
  const [activeMessageConversationId, setActiveMessageConversationId] = useState<string | null>(null);
  const [timeAnchor] = useState(() => Date.now());
  const activeTopLevel = resolveTopLevelSection(activeSection);
  const activePropertyTab = resolvePropertyTab(activeSection);
  const activePropertyTabLinks = PROPERTY_TAB_SECTION_LINKS[activePropertyTab];
  const currentPropertyOption = propertyOptions.find((option) => option.familyId === familyId) ?? null;
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0] ?? null;
  const simplePropertiesHref = `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(familyId)}&section=properties-home`;

  useEffect(() => {
    setPropertyContent(initialPropertyContent);
    setPropertyGallery(propertyPhotos);
    setPropertyContentFeedback(null);
    setBookingFilter("All");
    setSelectedBooking(null);
    setActiveMessageConversationId(null);
    setRoomEditorTab("details");
    setSelectedRoomId((current) => {
      if (roomRouteState?.mode === "edit" && roomRouteState.roomId && rooms.some((room) => room.id === roomRouteState.roomId)) {
        return roomRouteState.roomId;
      }
      if (current && rooms.some((room) => room.id === current)) return current;
      return rooms[0]?.id ?? null;
    });
  }, [familyId, initialPropertyContent, propertyPhotos, roomRouteState, rooms]);

  const handleSavePropertyContent = async (options: {
    updatedListing: PropertyContentDraft;
    updatedPhotos: PhotoItem[];
  }): Promise<void> => {
    setPropertyContentFeedback(null);
    startPropertyContentSaving(async () => {
      try {
        const response = await fetch("/api/onboarding/home/dashboard-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId,
            listing: options.updatedListing,
            photos: [
              ...options.updatedPhotos.filter((photo) => photo.isPrimary),
              ...options.updatedPhotos.filter((photo) => !photo.isPrimary),
            ].map((photo) => ({
              url: photo.url,
              isPrimary: photo.isPrimary,
            })),
          }),
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to save property content.");
        }

        setPropertyContentFeedback({
          type: "success",
          text: "Property content saved for this listing. Refreshing the latest Famlo property view now.",
        });
        router.refresh();
      } catch (error) {
        setPropertyContentFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to save property content.",
        });
      }
    });
  };

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
  const totalBookingsCount = proBookings.length;
  const famloDirectBookingsCount = proBookings.filter((booking) => !booking.isOta).length;
  const otaBookingsCount = proBookings.filter((booking) => booking.isOta).length;
  const pendingApprovalBookingsCount = proBookings.filter(isPendingApprovalBooking).length;
  const cancelledBookingsCount = proBookings.filter(isCancelledBooking).length;
  const modifiedReviewBookingsCount = proBookings.filter(isModifiedReviewBooking).length;
  const actionNeededBookingsCount = proBookings.filter(isActionNeededBooking).length;
  const confirmedBookingsCount = proBookings.filter(isConfirmedBooking).length;
  const filteredProBookings = proBookings.filter((booking) => matchesBookingFilter(booking, bookingFilter));
  const bookingsWithValue = proBookings
    .map((booking) => ({ booking, parsedAmount: parseBookingAmount(booking.amount) }))
    .filter((entry): entry is { booking: ProBookingSummary; parsedAmount: number } => entry.parsedAmount != null);
  const totalBookingValue = bookingsWithValue.reduce((sum, entry) => sum + entry.parsedAmount, 0);
  const famloDirectBookingValue = bookingsWithValue
    .filter((entry) => !entry.booking.isOta)
    .reduce((sum, entry) => sum + entry.parsedAmount, 0);
  const otaBookingValue = bookingsWithValue
    .filter((entry) => entry.booking.isOta)
    .reduce((sum, entry) => sum + entry.parsedAmount, 0);
  const confirmedBookingValue = bookingsWithValue
    .filter((entry) => isConfirmedBooking(entry.booking))
    .reduce((sum, entry) => sum + entry.parsedAmount, 0);
  const pendingBookingValue = bookingsWithValue
    .filter((entry) => isPendingApprovalBooking(entry.booking) || normalizeToken(entry.booking.paymentStatus) === "awaiting_payment")
    .reduce((sum, entry) => sum + entry.parsedAmount, 0);
  const cancelledBookingValue = bookingsWithValue
    .filter((entry) => isCancelledBooking(entry.booking))
    .reduce((sum, entry) => sum + entry.parsedAmount, 0);
  const averageBookingValue = bookingsWithValue.length > 0 ? totalBookingValue / bookingsWithValue.length : null;
  const topRoomByBookingCount =
    Object.entries(
      proBookings.reduce<Record<string, number>>((acc, booking) => {
        const roomName = booking.roomName || "Room";
        acc[roomName] = (acc[roomName] ?? 0) + 1;
        return acc;
      }, {})
    )
      .sort((left, right) => right[1] - left[1])[0] ?? null;
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
  const inactiveRoomsCount = Math.max(rooms.length - activeRoomsCount, 0);
  const pricedRooms = rooms.filter((room) => room.priceFullday > 0);
  const roomsMissingPrice = rooms.filter((room) => room.priceFullday <= 0).length;
  const lowestRoomPrice = pricedRooms.length > 0 ? Math.min(...pricedRooms.map((room) => room.priceFullday)) : null;
  const highestRoomPrice = pricedRooms.length > 0 ? Math.max(...pricedRooms.map((room) => room.priceFullday)) : null;
  const primaryRoom = rooms.find((room) => room.isPrimary) ?? null;
  const roomsWithSmartPricing = rooms.filter((room) => room.quarterEnabled || room.priceMorning > 0 || room.priceEvening > 0).length;
  const roomPlaceholder: RoomSummary = {
    id: "placeholder",
    name: "No rooms surfaced",
    unitType: "",
    description: null,
    maxGuests: 0,
    bedInfo: null,
    bathroomType: null,
    priceMorning: 0,
    priceAfternoon: 0,
    priceEvening: 0,
    priceFullday: 0,
    quarterEnabled: false,
    isActive: false,
    isPrimary: false,
    amenitiesCount: 0,
    photosCount: 0,
    photoUrl: null,
  };
  const propertyContentReadyCount = propertyContentChecks.filter((item) => item.ready).length;
  const contactReadyCount = contactChecks.filter((item) => item.ready).length;
  const locationReadyCount = locationChecks.filter((item) => item.ready).length;
  const policyReadyCount = policyChecks.filter((item) => item.ready).length;
  const roomMappingRows = (rooms.length > 0
    ? rooms
    : [roomPlaceholder]).map((room) => {
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
    : [roomPlaceholder]).map((room) => {
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
  const roomMappingsReadyCount = roomMappingRows.filter((row) => Boolean(row.mapping?.externalRoomTypeId)).length;
  const rateMappingsReadyCount = rateMappingRows.filter((row) => Boolean(row.ratePlan?.externalRatePlanId)).length;
  const roomMappingsMissingCount = Math.max(activeRoomsCount - roomMappingsReadyCount, 0);
  const rateMappingsMissingCount = Math.max(activeRoomsCount - rateMappingsReadyCount, 0);
  const bookingFeedHealthy = Boolean(channelFeedHealth?.lastSuccessfulPollAt) && !channelFeedHealth?.lastError;
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
  const ariSyncHealthy = ariHealth.statusLabel === "Synced";
  const cancellationFlowAvailable = (channelFeedHealth?.autoCancelledCount ?? 0) > 0;
  const modificationReviewAvailable = (channelFeedHealth?.pendingManualReviewCount ?? 0) > 0 || (channelFeedHealth?.lastAutoApplyState === "waiting_for_manual_review");
  const connectedChannelCards = channelFoundation.providers.length > 0
    ? channelFoundation.providers.map((provider) => {
        const providerProperty = channelFoundation.properties.find((property) => property.providerCode === provider.code) ?? null;
        const isConnected = providerProperty?.syncStatus === "connected" || Boolean(providerProperty?.externalPropertyId);
        const providerCodeMatches = (value: string | null | undefined) => value === provider.code;
        const mappedRoomsCount = channelFoundation.roomMappings.filter((mapping) => providerCodeMatches(mapping.providerCode) && mapping.externalRoomTypeId).length;
        const mappedRatesCount = channelFoundation.ratePlans.filter((plan) => providerCodeMatches(plan.providerCode) && plan.externalRatePlanId).length;
        const recommendedAction =
          !isConnected
            ? "Needs setup"
            : mappedRoomsCount < activeRoomsCount
              ? "Finish room mapping"
              : mappedRatesCount < activeRoomsCount
                ? "Finish rate mapping"
                : channelHealthNeedsAttention
                  ? "Famlo team may need to review"
                  : "Ready";

        return {
          key: provider.code,
          name: provider.name,
          statusLabel: isConnected ? "Connected" : "Not connected",
          mappedRoomsCount,
          mappedRatesCount,
          lastFeedSuccess: formatDateTime(channelFeedHealth?.lastSuccessfulPollAt ?? null),
          ariStatus: ariHealth.statusLabel,
          recommendedAction,
        };
      })
    : [];
  const channelReadinessChecklist = [
    {
      label: "Property connected to channel",
      ready: channelAriHealth
        ? channelAriHealth.channelAttached && channelAriHealth.channelActive
        : (channelFeedHealth?.channelAttached ?? false) && (channelFeedHealth?.channelActive ?? false),
      value:
        channelAriHealth
          ? channelAriHealth.channelAttached && channelAriHealth.channelActive
            ? "Connected"
            : "Not connected"
          : (channelFeedHealth?.channelAttached ?? false) && (channelFeedHealth?.channelActive ?? false)
            ? "Connected"
            : "Not connected",
    },
    {
      label: "At least one active room exists",
      ready: activeRoomsCount > 0,
      value: activeRoomsCount > 0 ? `${activeRoomsCount} active` : "No active rooms",
    },
    {
      label: "Room mapping ready",
      ready: activeRoomsCount > 0 && roomMappingsReadyCount >= activeRoomsCount,
      value: `${roomMappingsReadyCount}/${activeRoomsCount || 0} mapped`,
    },
    {
      label: "Rate mapping ready",
      ready: activeRoomsCount > 0 && rateMappingsReadyCount >= activeRoomsCount,
      value: `${rateMappingsReadyCount}/${activeRoomsCount || 0} mapped`,
    },
    {
      label: "ARI sync checked",
      ready: Boolean(channelAriHealth?.lastAriSyncAt || ariHealth.lastAriSyncAt),
      value: ariSyncHealthy ? "Healthy" : ariHealth.statusLabel,
    },
    {
      label: "Booking feed checked",
      ready: Boolean(channelFeedHealth?.lastPollAt),
      value: bookingFeedHealthy ? "Healthy" : (channelFeedHealth?.lastPollAt ? "Action needed" : "Not checked"),
    },
    {
      label: "Cancellation flow proof",
      ready: cancellationFlowAvailable,
      value: cancellationFlowAvailable ? "Available" : "Not proven here yet",
    },
    {
      label: "Modification review available",
      ready: modificationReviewAvailable,
      value: modificationReviewAvailable ? "Available" : "Not visible yet",
    },
  ];
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
      title: "Booking feed still needs review",
      summary: "A Booking.com reservation reached Famlo, but the final sync review is still pending.",
      recommendedAction: revision.externalRevisionId
        ? "Review the booking in Famlo Pro before marking the sync fully complete."
        : "Wait for the Booking Revision Feed to surface a revision id before treating this sync as complete.",
      severity: "warning",
      relatedLabel: revision.externalBookingId ?? revision.linkedBookingId ?? "Booking revision",
      lastDetectedAt: revision.updatedAt ?? revision.createdAt ?? null,
      targetSection: "sync-logs" as const,
      actionLabel: "View sync logs",
    }));
  const bookingListPreviewConflicts: ConflictItem[] = channelFoundation.bookingRevisions
    .filter((revision) => revision.source === "booking_list_api" && !revision.externalRevisionId && revision.ackStatus !== "acknowledged")
    .map((revision) => ({
      key: `booking-list-preview-${revision.id}`,
      title: "Booking feed is still waiting for a final revision",
      summary: "A preview booking was found, but the final provider revision has not appeared yet.",
      recommendedAction: "Check the booking feed again later before treating this reservation as fully synced.",
      severity: "info",
      relatedLabel: revision.externalBookingId ?? "Booking preview",
      lastDetectedAt: revision.updatedAt ?? revision.createdAt ?? null,
      targetSection: "sync-logs" as const,
      actionLabel: "View sync logs",
    }));
  const unmappedRoomConflicts: ConflictItem[] = rooms
    .filter((room) => room.isActive && !roomMappingsByRoomId.get(room.id)?.externalRoomTypeId)
    .map((room) => ({
      key: `unmapped-room-${room.id}`,
      title: "Some rooms are not connected to the channel",
      summary: `${room.name} is active in Famlo, but it is not mapped to the connected OTA yet.`,
      recommendedAction: "Complete room mapping before expecting this room to sell through connected channels.",
      severity: "warning",
      relatedLabel: room.name,
      lastDetectedAt: new Date(timeAnchor).toISOString(),
      targetSection: "room-mapping" as const,
      actionLabel: "Fix room mapping",
    }));
  const unmappedRateConflicts: ConflictItem[] = rooms
    .filter((room) => room.isActive && !ratePlansByRoomId.get(room.id)?.externalRatePlanId)
    .map((room) => ({
      key: `unmapped-rate-${room.id}`,
      title: "Price setup is incomplete",
      summary: `${room.name} is missing a connected channel rate plan for ${standardRatePlanName}.`,
      recommendedAction: "Finish rate mapping before expecting this room’s price to flow to connected channels.",
      severity: "warning",
      relatedLabel: room.name,
      lastDetectedAt: new Date(timeAnchor).toISOString(),
      targetSection: "rate-mapping" as const,
      actionLabel: "Fix rate mapping",
    }));
  const failedSyncConflicts: ConflictItem[] = channelFoundation.syncLogs
    .filter((log) => log.status !== "success")
    .map((log) => ({
      key: `failed-log-${log.id}`,
      title: log.status === "failed" ? "Availability sync needs review" : "Sync issue needs review",
      summary: `${labelizeToken(log.action, "Sync step")} reported a ${labelizeToken(log.status, "warning")} state for this property.`,
      recommendedAction: "Open the sync logs and review the latest issue before trusting unattended channel sync.",
      severity: log.status === "failed" ? "critical" : "warning",
      relatedLabel: labelizeToken(log.action, "sync action"),
      lastDetectedAt: log.createdAt,
      targetSection: "sync-logs" as const,
      actionLabel: "View sync logs",
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
          targetSection: "sync-logs" as const,
          actionLabel: "View sync logs",
        }]),
    ...(ariHealth.lastProblemSync
      ? [{
          key: `ari-problem-${ariHealth.lastProblemSync.action}-${ariHealth.lastProblemSync.createdAt ?? "unknown"}`,
          title: "Availability sync needs review",
          summary: `${labelizeToken(ariHealth.lastProblemSync.action, "Availability sync")} reported a ${labelizeToken(ariHealth.lastProblemSync.status, "warning")} state for this property.`,
          recommendedAction: "Review the last ARI sync summary and rerun the 365-day sync when the issue is cleared.",
          severity: ariHealth.lastProblemSync.status === "failed" ? "critical" as const : "warning" as const,
          relatedLabel: currentPropertyLabel,
          lastDetectedAt: ariHealth.lastProblemSync.createdAt ?? null,
          targetSection: "sync-logs" as const,
          actionLabel: "View sync logs",
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
          targetSection: "sync-logs" as const,
          actionLabel: "View sync logs",
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
          targetSection: "sync-logs" as const,
          actionLabel: "View sync logs",
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
          title: "Booking.com connection needs attention",
          summary: "This property does not currently have an active connected channel.",
          recommendedAction: "Check the channel connection before relying on automatic booking feed polling.",
          severity: "critical" as const,
          relatedLabel: currentPropertyLabel,
          lastDetectedAt: channelFeedHealth?.lastPollAt ?? null,
          targetSection: "connected-channels" as const,
          actionLabel: "Check channels",
        }]
      : []),
    ...(channelFeedHealth?.channelAttached && !channelFeedHealth.channelActive
      ? [{
          key: "channel-inactive",
          title: "Booking.com connection needs attention",
          summary: "The property is attached to a channel, but that connection is not active right now.",
          recommendedAction: "Activate the channel in Channex before relying on feed polling or ARI sync.",
          severity: "critical" as const,
          relatedLabel: channelFeedHealth?.activeChannelTitle ?? currentPropertyLabel,
          lastDetectedAt: channelFeedHealth?.lastPollAt ?? null,
          targetSection: "connected-channels" as const,
          actionLabel: "Check channels",
        }]
      : []),
    ...(channelFeedHealth?.lastError
      ? [{
          key: "channel-feed-last-error",
          title: "Booking feed needs attention",
          summary: "The latest booking feed check did not complete cleanly for this property.",
          recommendedAction: "Review the latest sync log and clear the feed issue before trusting unattended booking sync.",
          severity: "critical" as const,
          relatedLabel: channelFeedHealth?.activeChannelTitle ?? currentPropertyLabel,
          lastDetectedAt: channelFeedHealth?.lastErrorAt ?? channelFeedHealth?.lastPollAt ?? null,
          targetSection: "sync-logs" as const,
          actionLabel: "View sync logs",
        }]
      : []),
    ...((channelFeedHealth?.unackedRevisionsCount ?? 0) > 0
      ? [{
          key: "channel-feed-unacked",
          title: "Booking sync still needs review",
          summary: `${channelFeedHealth?.unackedRevisionsCount ?? 0} booking sync update${(channelFeedHealth?.unackedRevisionsCount ?? 0) === 1 ? "" : "s"} are still waiting for final review.`,
          recommendedAction: "Open the sync logs or booking review flow and finish the pending review steps.",
          severity: "warning" as const,
          relatedLabel: channelFeedHealth?.activeChannelTitle ?? currentPropertyLabel,
          lastDetectedAt: channelFeedHealth?.lastPollAt ?? null,
          targetSection: "sync-logs" as const,
          actionLabel: "View sync logs",
        }]
      : []),
    ...((channelFeedHealth?.failedImportCount ?? 0) > 0
      ? [{
          key: "channel-feed-failed-import",
          title: "Booking import needs review",
          summary: `${channelFeedHealth?.failedImportCount ?? 0} booking update${(channelFeedHealth?.failedImportCount ?? 0) === 1 ? "" : "s"} could not be imported automatically.`,
          recommendedAction: "Famlo team may need to review this before the booking feed is fully healthy again.",
          severity: "critical" as const,
          relatedLabel: channelFeedHealth?.activeChannelTitle ?? currentPropertyLabel,
          lastDetectedAt: channelFeedHealth?.lastPollAt ?? null,
          targetSection: "conflicts" as const,
          actionLabel: "View conflicts",
        }]
      : []),
    ...((channelFeedHealth?.pendingApplyCount ?? 0) > 0
      ? [{
          key: "channel-feed-pending-apply",
          title: "Booking update is still pending",
          summary: `${channelFeedHealth?.pendingApplyCount ?? 0} booking update${(channelFeedHealth?.pendingApplyCount ?? 0) === 1 ? "" : "s"} still need to be applied safely.`,
          recommendedAction: "Review the pending sync items before treating the booking feed as fully healthy.",
          severity: "warning" as const,
          relatedLabel: channelFeedHealth?.activeChannelTitle ?? currentPropertyLabel,
          lastDetectedAt: channelFeedHealth?.lastPollAt ?? null,
          targetSection: "conflicts" as const,
          actionLabel: "View conflicts",
        }]
      : []),
    ...((channelFeedHealth?.pendingManualReviewCount ?? 0) > 0
      ? [{
          key: "channel-feed-manual-review",
          title: "Modification review needed",
          summary: `${channelFeedHealth?.pendingManualReviewCount ?? 0} booking change${(channelFeedHealth?.pendingManualReviewCount ?? 0) === 1 ? "" : "s"} are waiting for manual review.`,
          recommendedAction: "Famlo team may need to review this before the change is accepted safely.",
          severity: "info" as const,
          relatedLabel: channelFeedHealth?.activeChannelTitle ?? currentPropertyLabel,
          lastDetectedAt: channelFeedHealth?.lastPollAt ?? null,
          targetSection: "conflicts" as const,
          actionLabel: "View conflicts",
        }]
      : []),
    ...((channelFeedHealth?.failedAutoApplyCount ?? 0) > 0
      ? [{
          key: "channel-feed-auto-apply-failed",
          title: "Cancellation or booking sync needs review",
          summary: `${channelFeedHealth?.failedAutoApplyCount ?? 0} automatic booking update${(channelFeedHealth?.failedAutoApplyCount ?? 0) === 1 ? "" : "s"} could not be completed safely.`,
          recommendedAction: "Famlo team may need to review this before sync can return to healthy.",
          severity: "critical" as const,
          relatedLabel: channelFeedHealth?.activeChannelTitle ?? currentPropertyLabel,
          lastDetectedAt: channelFeedHealth?.lastAutoApplyAt ?? channelFeedHealth?.lastPollAt ?? null,
          targetSection: "conflicts" as const,
          actionLabel: "View conflicts",
        }]
      : []),
    ...(ariHealth.statusLabel === "Channel disconnected"
      ? [{
          key: "ari-channel-disconnected",
          title: "Availability sync needs review",
          summary: "Daily price and calendar sync is blocked because the current channel is detached or inactive.",
          recommendedAction: "Reconnect the Channex channel before relying on daily inventory sync.",
          severity: "critical" as const,
          relatedLabel: currentPropertyLabel,
          lastDetectedAt: ariHealth.lastAriSyncAt ?? null,
          targetSection: "connected-channels" as const,
          actionLabel: "Check channels",
        }]
      : []),
    ...(rooms.filter((room) => room.isActive).length === 0
      ? [{
          key: "no-active-room",
          title: "No active room is ready to sell",
          summary: "This property has no active room available for booking sync or OTA setup.",
          recommendedAction: "Activate at least one room before expecting channel readiness.",
          severity: "critical" as const,
          relatedLabel: currentPropertyLabel,
          lastDetectedAt: new Date(timeAnchor).toISOString(),
          targetSection: "conflicts" as const,
          actionLabel: "View conflicts",
        }]
      : []),
    ...(roomsMissingPrice > 0
      ? [{
          key: "rooms-missing-price",
          title: "Some rooms are missing prices",
          summary: `${roomsMissingPrice} room${roomsMissingPrice === 1 ? "" : "s"} still need a base price before this property is ready to sell cleanly.`,
          recommendedAction: "Finish room pricing setup before relying on channel readiness.",
          severity: "warning" as const,
          relatedLabel: currentPropertyLabel,
          lastDetectedAt: new Date(timeAnchor).toISOString(),
          targetSection: "conflicts" as const,
          actionLabel: "View conflicts",
        }]
      : []),
    ...(photosReadiness.missingRooms > 0
      ? [{
          key: "rooms-missing-photos",
          title: "Some rooms still need photos",
          summary: `${photosReadiness.missingRooms} room${photosReadiness.missingRooms === 1 ? "" : "s"} do not yet have photos counted for distribution readiness.`,
          recommendedAction: "Add room photos before relying on OTA-ready content quality.",
          severity: "info" as const,
          relatedLabel: currentPropertyLabel,
          lastDetectedAt: new Date(timeAnchor).toISOString(),
          targetSection: "conflicts" as const,
          actionLabel: "View conflicts",
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
  const infoConflictCount = conflictItems.filter((item) => item.severity === "info").length;
  const syncHealthChecks = [
    { label: "Channel connected", healthy: currentChannelAttached },
    { label: "At least one active room", healthy: rooms.some((room) => room.isActive) },
    { label: "Room mapping ready", healthy: allActiveRoomsMapped },
    { label: "Rate mapping ready", healthy: allActiveRoomsHaveRatePlans },
    { label: "Booking feed healthy", healthy: bookingFeedHealthy },
    { label: "Availability sync healthy", healthy: ariHealth.status === "healthy" },
    { label: "Room prices complete", healthy: roomsMissingPrice === 0 && rooms.length > 0 },
    { label: "Room photos coverage", healthy: photosReadiness.missingRooms === 0 && rooms.length > 0 },
  ];
  const healthySyncCheckCount = syncHealthChecks.filter((item) => item.healthy).length;
  const syncHealthLastCheckedAt =
    channelFeedHealth?.lastPollAt ??
    channelAriHealth?.lastAriSyncAt ??
    lastBookingFeedLog?.createdAt ??
    null;
  const visibleRoomsInCalendar = calendarRows.length;
  const famloCalendarCells = countCalendarCellsByStatus(calendarRows, "famlo");
  const otaCalendarCells = countCalendarCellsByStatus(calendarRows, "ota");
  const pendingCalendarCells = countCalendarCellsByStatus(calendarRows, "pending");
  const manualBlockCalendarCells = countCalendarCellsByStatus(calendarRows, "manual_block");
  const pastCalendarCells = countCalendarCellsByStatus(calendarRows, "past");
  const occupiedOrBlockedCalendarCells =
    famloCalendarCells + otaCalendarCells + pendingCalendarCells + manualBlockCalendarCells;
  const calendarAttentionCount =
    pendingCalendarCells +
    (calendarVerification && !calendarVerification.targetDateBlocked ? 1 : 0) +
    (calendarVerification && calendarVerification.checkoutDateBlocked ? 1 : 0) +
    (conflictItems.length > 0 ? 1 : 0);
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
      title: "Famlo Pro active",
      status: famloPlusStatus === "active" || famloPlusStatus === "grace" ? "ready" : "blocked",
      statusLabel: checklistStatusLabel(famloPlusStatus === "active" || famloPlusStatus === "grace" ? "ready" : "blocked"),
      explanation:
        famloPlusStatus === "active" || famloPlusStatus === "grace"
          ? `Famlo Pro access is currently ${labelizeToken(famloPlusStatus, famloPlusStatus)} for this property.`
          : `Famlo Pro access is ${labelizeToken(famloPlusStatus, "inactive")}, so live channel launch should stay blocked.`,
      recommendedAction:
        famloPlusStatus === "active" || famloPlusStatus === "grace"
          ? "Keep the current Famlo Pro entitlement active through pilot launch."
          : "Renew or activate Famlo Pro before planning live channel connection.",
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
    currentPropertyOption?.country ?? null,
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
  const propertyCardRows = propertyOptions.map((option) => {
    const isSelected = option.familyId === familyId;
    const optionLocation = [option.locality, option.city, option.state, option.country].filter(Boolean).join(", ") || "Location details pending";
    return {
      option,
      isSelected,
      location: optionLocation,
      activeRoomsLabel: isSelected ? `${activeRoomsCount} active rooms` : "Open property to review rooms",
      contentLabel: isSelected
        ? `${propertyContentReadyCount}/${propertyContentChecks.length} content ready`
        : "Open property to review content",
      healthLabel: isSelected ? selectedPropertyChannelStatus : "Open property to review channel health",
      actionLabel: isSelected
        ? `${conflictItems.length + actionNeededBookingsCount} action needed`
        : formatPropertySwitcherStatusLabel(option.famloPlusStatus),
    };
  });
  const roomCards = rooms.map((room) => {
    const roomMapping = roomMappingsByRoomId.get(room.id) ?? null;
    const roomRatePlan = ratePlansByRoomId.get(room.id) ?? null;
    const hasRoomMapping = Boolean(roomMapping?.externalRoomTypeId);
    const hasRateMapping = Boolean(roomRatePlan?.externalRatePlanId);
    const providerMappingLabel =
      hasRoomMapping && hasRateMapping
        ? "Mapped"
        : hasRoomMapping || hasRateMapping
          ? "Needs review"
          : roomMapping || roomRatePlan
            ? "Check Channels"
            : "Check Channels";
    return {
      room,
      selected: room.id === selectedRoom?.id,
      famloStatus: room.isActive ? "Active in Famlo" : "Inactive in Famlo",
      channelStatus: room.isActive
        ? roomMapping?.externalRoomTypeId
          ? roomRatePlan?.externalRatePlanId
            ? "Booking.com ready"
            : "Rate mapping needed"
          : "Room mapping needed"
        : "Activate room to continue",
      warning:
        room.photosCount <= 0
          ? "Missing photos"
          : room.priceFullday <= 0
            ? "Missing price"
            : null,
      providerMappingLabel,
    };
  });
  const selectedRoomCard = roomCards.find((item) => item.room.id === selectedRoom?.id) ?? null;
  const selectedRoomCalendarRow = calendarRows.find((row) => row.roomId === selectedRoom?.id) ?? null;
  const selectedRoomConflictCount = selectedRoom
    ? conflictItems.filter((item) => item.relatedLabel === selectedRoom.name).length
    : 0;
  const selectedRoomCalendarHealthy = Boolean(selectedRoom && selectedRoomCalendarRow);
  const roomEditorMode = roomRouteState?.mode ?? null;
  const roomEditorRoom = roomEditorMode === "edit" ? selectedRoom : null;
  const roomEditorDisplayName =
    roomEditorMode === "create" ? "Create room" : roomEditorRoom?.name ?? "Select a room";
  const roomEditorDisplayStatus =
    roomEditorMode === "create"
      ? "Draft room"
      : roomEditorRoom?.isActive
        ? "Active"
        : roomEditorRoom
          ? "Inactive"
          : "No room selected";
  const roomEditorBasePriceLabel =
    roomEditorMode === "create"
      ? "Set after saving"
      : roomEditorRoom && roomEditorRoom.priceFullday > 0
        ? formatCurrency(roomEditorRoom.priceFullday)
        : "Price missing";
  const roomEditorPhotoStatusLabel =
    roomEditorMode === "create"
      ? "Add after draft opens"
      : roomEditorRoom && roomEditorRoom.photosCount > 0
        ? `${roomEditorRoom.photosCount} photo${roomEditorRoom.photosCount === 1 ? "" : "s"} ready`
        : "Photos missing";
  const roomEditorChannelStatusLabel =
    roomEditorMode === "create"
      ? "Connect after room exists"
      : selectedRoomCard?.channelStatus ?? "Channel status pending";
  const roomEditorSyncStatusLabel =
    roomEditorMode === "create"
      ? "No sync checks yet"
      : `${selectedRoomConflictCount} issue${selectedRoomConflictCount === 1 ? "" : "s"}`;
  const roomEditorPrimaryActionLabel = roomEditorMode === "create" ? "Create room" : "Edit room";
  const selectedPropertyDisplayLabel = currentPropertyOption
    ? `${currentPropertyOption.name || propertyName}${selectedPropertyLocation ? ` · ${selectedPropertyLocation}` : ""}`
    : `${propertyName}${selectedPropertyLocation ? ` · ${selectedPropertyLocation}` : ""}`;
  const pilotHomeCards = [
    {
      label: "Selected property",
      value: propertyName || "Selected property",
      hint: selectedPropertyLocation,
    },
    {
      label: "Active rooms",
      value: `${activeRoomsCount}`,
      hint: inactiveRoomsCount > 0 ? `${inactiveRoomsCount} inactive room${inactiveRoomsCount === 1 ? "" : "s"}` : "All surfaced rooms are active",
    },
    {
      label: "Content readiness",
      value: `${propertyContentReadyCount}/${propertyContentChecks.length}`,
      hint: propertyContentReadyCount === propertyContentChecks.length ? "Core property content is ready" : `Missing: ${joinMissingLabels(propertyContentChecks)}`,
    },
    {
      label: "Rooms missing setup",
      value: `${roomsMissingPrice + photosReadiness.missingRooms}`,
      hint: `${roomsMissingPrice} missing price · ${photosReadiness.missingRooms} missing photos`,
    },
    {
      label: "Bookings",
      value: `${totalBookingsCount}`,
      hint: actionNeededBookingsCount > 0 ? `${actionNeededBookingsCount} still need attention` : "No open booking attention",
    },
    {
      label: "Calendar attention",
      value: `${calendarAttentionCount}`,
      hint: calendarAttentionCount > 0 ? "Review pending or verification signals" : "Calendar window looks clear",
    },
    {
      label: "Channels",
      value: selectedPropertyChannelStatus,
      hint: `${roomMappingsReadyCount}/${activeRoomsCount || 0} rooms mapped · ${rateMappingsReadyCount}/${activeRoomsCount || 0} rates mapped`,
    },
    {
      label: "Sync Health",
      value: `${healthySyncCheckCount}/${syncHealthChecks.length}`,
      hint: criticalConflictCount > 0 ? `${criticalConflictCount} critical issue${criticalConflictCount === 1 ? "" : "s"}` : "No critical sync issue detected",
    },
    {
      label: "Booking value",
      value: formatCurrency(totalBookingValue),
      hint: "Booking value only, not final payout",
    },
    {
      label: "Action needed",
      value: `${conflictItems.length + actionNeededBookingsCount}`,
      hint: conflictItems.length > 0 ? `${conflictItems.length} sync or setup issue${conflictItems.length === 1 ? "" : "s"}` : "No urgent host action right now",
    },
  ];
  const quickActionItems = [
    {
      title: "Manage Rooms",
      body: "Add rooms, update prices, upload photos, and keep this property inventory accurate.",
      badge: `${rooms.length} room${rooms.length === 1 ? "" : "s"}`,
      targetSection: "rooms-units" as const,
    },
    {
      title: "Edit Content & Photos",
      body: "Shape how this property appears on Famlo with its own story, vibe, and gallery.",
      badge: `${propertyContentReadyCount}/${propertyContentChecks.length} ready`,
      targetSection: "ota-content" as const,
    },
    {
      title: "Review Pricing & Rules",
      body: "Catch missing prices and confirm stay rules before going live.",
      badge: roomsMissingPrice === 0 ? "Pricing ready" : `${roomsMissingPrice} missing price`,
      targetSection: "rates-restrictions" as const,
    },
    {
      title: "View Bookings",
      body: "Manage Famlo and OTA reservations from one place for this property.",
      badge: `${totalBookingsCount} bookings`,
      targetSection: "bookings" as const,
    },
    {
      title: "Open Calendar",
      body: "Review availability, bookings, manual blocks, and checkout-day correctness.",
      badge: `${calendarAttentionCount} attention`,
      targetSection: "inventory-calendar" as const,
    },
    {
      title: "Check Channels",
      body: "See whether this property is connected, mapped, and healthy across OTAs.",
      badge: selectedPropertyChannelStatus,
      targetSection: "connected-channels" as const,
    },
    {
      title: "Fix Sync Issues",
      body: "Review conflicts, mapping gaps, and sync issues before relying on unattended operations.",
      badge: `${conflictItems.length} open`,
      targetSection: criticalConflictCount > 0 ? ("conflicts" as const) : ("sync-logs" as const),
    },
    {
      title: "View Revenue",
      body: "Understand booking value and payment status for this property.",
      badge: formatCurrency(totalBookingValue),
      targetSection: "revenue" as const,
    },
    {
      title: "View Reports",
      body: "Review booking mix, room activity, and early pilot performance insights.",
      badge: `${activeRoomsCount} active rooms`,
      targetSection: "reports" as const,
    },
  ];
  const goLiveHostChecklist = [
    {
      title: "Property profile and content complete",
      statusLabel: propertyContentReadyCount === propertyContentChecks.length ? "Done" : "Needs attention",
      statusClass: propertyContentReadyCount === propertyContentChecks.length ? styles.readinessPillOk : styles.readinessPillReview,
      detail: propertyContentReadyCount === propertyContentChecks.length
        ? "Title and core property content are in place for this property."
        : `Complete the missing property content: ${joinMissingLabels(propertyContentChecks)}.`,
      targetSection: "ota-content" as const,
    },
    {
      title: "At least one active room",
      statusLabel: activeRoomsCount > 0 ? "Done" : "Needs attention",
      statusClass: activeRoomsCount > 0 ? styles.readinessPillOk : styles.readinessPillMissing,
      detail: activeRoomsCount > 0 ? `${activeRoomsCount} active room${activeRoomsCount === 1 ? "" : "s"} ready in Famlo.` : "Activate at least one room before expecting this property to sell.",
      targetSection: "rooms-units" as const,
    },
    {
      title: "Room photos added",
      statusLabel: rooms.length === 0 ? "Needs attention" : photosReadiness.missingRooms === 0 ? "Done" : "Needs attention",
      statusClass: rooms.length > 0 && photosReadiness.missingRooms === 0 ? styles.readinessPillOk : styles.readinessPillReview,
      detail: rooms.length === 0
        ? "Add rooms first so photo coverage can be reviewed."
        : photosReadiness.missingRooms === 0
          ? "Every surfaced room has photo coverage."
          : `${photosReadiness.missingRooms} room${photosReadiness.missingRooms === 1 ? "" : "s"} still need photos.`,
      targetSection: "rooms-units" as const,
    },
    {
      title: "Room price added",
      statusLabel: rooms.length === 0 ? "Needs attention" : roomsMissingPrice === 0 ? "Done" : "Needs attention",
      statusClass: rooms.length > 0 && roomsMissingPrice === 0 ? styles.readinessPillOk : styles.readinessPillReview,
      detail: rooms.length === 0
        ? "Add rooms first so pricing can be reviewed."
        : roomsMissingPrice === 0
          ? "Every surfaced room has a base price."
          : `${roomsMissingPrice} room${roomsMissingPrice === 1 ? "" : "s"} still need a base price.`,
      targetSection: "rates-restrictions" as const,
    },
    {
      title: "Calendar ready",
      statusLabel: visibleRoomsInCalendar > 0 ? "Done" : "Needs attention",
      statusClass: visibleRoomsInCalendar > 0 ? styles.readinessPillOk : styles.readinessPillReview,
      detail: visibleRoomsInCalendar > 0
        ? `${visibleRoomsInCalendar} room row${visibleRoomsInCalendar === 1 ? "" : "s"} are visible in the property calendar.`
        : "Calendar rows are not yet visible for this property.",
      targetSection: "inventory-calendar" as const,
    },
    {
      title: "Booking workspace ready",
      statusLabel: "Done",
      statusClass: styles.readinessPillOk,
      detail: "Famlo direct and OTA reservations are available together in the Pro bookings workspace.",
      targetSection: "bookings" as const,
    },
    {
      title: "Channel connected",
      statusLabel: currentChannelAttached ? "Done" : "Famlo team review",
      statusClass: currentChannelAttached ? styles.readinessPillOk : styles.readinessPillMissing,
      detail: currentChannelAttached
        ? "This property currently has an active connected channel."
        : "A connected OTA channel is not healthy yet for this property.",
      targetSection: "connected-channels" as const,
    },
    {
      title: "Room mapping ready",
      statusLabel: activeRoomsCount === 0 ? "Needs attention" : allActiveRoomsMapped ? "Done" : "Famlo team review",
      statusClass: activeRoomsCount > 0 && allActiveRoomsMapped ? styles.readinessPillOk : styles.readinessPillReview,
      detail: activeRoomsCount === 0
        ? "Add and activate rooms before mapping can be reviewed."
        : `${roomMappingsReadyCount}/${activeRoomsCount} active room${activeRoomsCount === 1 ? "" : "s"} are mapped.`,
      targetSection: "room-mapping" as const,
    },
    {
      title: "Rate mapping ready",
      statusLabel: activeRoomsCount === 0 ? "Needs attention" : allActiveRoomsHaveRatePlans ? "Done" : "Famlo team review",
      statusClass: activeRoomsCount > 0 && allActiveRoomsHaveRatePlans ? styles.readinessPillOk : styles.readinessPillReview,
      detail: activeRoomsCount === 0
        ? "Add and activate rooms before rate mapping can be reviewed."
        : `${rateMappingsReadyCount}/${activeRoomsCount} active room${activeRoomsCount === 1 ? "" : "s"} have connected rate plans.`,
      targetSection: "rate-mapping" as const,
    },
    {
      title: "Sync Health checked",
      statusLabel: criticalConflictCount === 0 && warningConflictCount === 0 ? "Done" : "Needs attention",
      statusClass: criticalConflictCount === 0 && warningConflictCount === 0 ? styles.readinessPillOk : styles.readinessPillReview,
      detail: syncHealthLastCheckedAt
        ? `Last checked ${formatDateTime(syncHealthLastCheckedAt)} with ${conflictItems.length} open issue${conflictItems.length === 1 ? "" : "s"}.`
        : "No recent sync health check is recorded yet.",
      targetSection: conflictItems.length > 0 ? ("conflicts" as const) : ("sync-logs" as const),
    },
    {
      title: "Revenue and reports available",
      statusLabel: "Coming later",
      statusClass: styles.readinessPillReview,
      detail: "Revenue and Reports are available as pilot summaries today. Final payout and export workflows will come later.",
      targetSection: "revenue" as const,
    },
  ];
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
          <div className={styles.brandLogoWrap}>
            {isSidebarLogoBroken ? (
              <span className={styles.brandLogoFallback}>Famlo Pro</span>
            ) : (
              <img
                src="/famlo-pro-logo.png"
                alt="Famlo Pro"
                className={styles.brandLogoImage}
                onError={() => setIsSidebarLogoBroken(true)}
              />
            )}
          </div>
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
                onClick={() => {
                  if (item.id === "properties") {
                    router.push(simplePropertiesHref);
                    return;
                  }
                  setActiveSection(resolveTopLevelDefaultSection(item.id, activeSection));
                }}
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
              {formatPropertySwitcherStatusLabel(famloPlusStatus)}
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
          {activeTopLevel === "properties" && !roomRouteState && (
            <section className={styles.propertyCenterShell}>
              <div className={styles.propertyCenterHeader}>
                <div>
                  <div className={styles.sectionEyebrow}>Famlo Pro</div>
                  <h2 className={styles.propertyCenterTitle}>Choose a property, then choose a room</h2>
                  <p className={styles.propertyCenterCopy}>
                    Keep the main Properties page simple. Pick a property, review the room cards, then open a room editor
                    with tabs for details, pricing, calendar, channels, mapping, and sync health.
                  </p>
                </div>
                <div className={styles.propertyCenterStatus}>
                  <span className={styles.sectionStatus}>{activeRoomsCount} active rooms</span>
                  <span className={styles.sectionStatus}>{selectedPropertyChannelStatus}</span>
                  <span className={styles.sectionStatus}>{goLiveSummary.label}</span>
                </div>
              </div>

              <div className={styles.propertySelectorBar}>
                <div className={styles.propertySelectorHeadline}>SELECT PROPERTY</div>
                <div className={styles.propertySelectorControls}>
                  <Link href="/partners/home" className={styles.addPropertyControlLink}>
                    <span className={styles.addPropertyIconWrap}>
                      <Plus size={18} />
                    </span>
                    <span>Add Property</span>
                  </Link>

                  <label className={styles.propertySelectorField}>
                    <span className={styles.srOnly}>Select property</span>
                    <select
                      className={styles.propertySelectorSelect}
                      value={familyId}
                      onChange={(event) => {
                        const nextFamilyId = event.target.value;
                        if (!nextFamilyId || nextFamilyId === familyId) return;
                        startPropertySwitchTransition(() => {
                          router.push(
                            `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(nextFamilyId)}&section=${encodeURIComponent(activeSection)}`
                          );
                        });
                      }}
                      disabled={propertyOptions.length <= 1 || isPropertySwitchPending}
                    >
                      {propertyOptions.map((option) => {
                        const optionLocation = [option.locality, option.city, option.state, option.country]
                          .filter(Boolean)
                          .join(", ");
                        return (
                          <option key={option.familyId} value={option.familyId}>
                            {option.name || "Selected property"}
                            {optionLocation ? ` - ${optionLocation}` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </div>
              </div>

              <div className={styles.propertySelectorMetaRow}>
                <span className={styles.propertySelectorMetaPill}>{selectedPropertyDisplayLabel}</span>
                <span className={styles.propertySelectorMetaPill}>
                  Property story and host presence can be different for each property.
                </span>
                <span className={styles.propertySelectorMetaPill}>Account and legal identity stay separate.</span>
                {isPropertySwitchPending ? <span className={styles.propertySelectorMetaPill}>Switching property…</span> : null}
              </div>

              <div className={styles.propertiesRoomShowcaseGrid}>
                {roomCards.map((item) => (
                  <Link
                    key={item.room.id}
                    href={`/partnerslogin/home/pro/properties/${encodeURIComponent(familyId)}/rooms/${encodeURIComponent(item.room.id)}`}
                    className={`${styles.propertyRoomShowcaseCard} ${item.selected && roomEditorMode === "edit" ? styles.propertyRoomShowcaseCardActive : ""}`}
                  >
                    <div
                      className={styles.propertyRoomShowcaseMedia}
                      style={
                        item.room.photoUrl
                          ? {
                              backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.04), rgba(15, 23, 42, 0.74)), url(${item.room.photoUrl})`,
                            }
                          : undefined
                      }
                    >
                      <div className={styles.propertyRoomShowcaseTopRow}>
                        <span className={styles.propertyRoomTypePill}>{item.room.unitType || "Room"}</span>
                        <span
                          className={`${styles.propertyRoomStatePill} ${
                            item.room.isActive ? styles.propertyRoomStatePillActive : styles.propertyRoomStatePillMuted
                          }`}
                        >
                          {item.room.isActive ? "Available" : "Inactive"}
                        </span>
                      </div>

                      <div className={styles.propertyRoomShowcaseBottom}>
                        <div className={styles.propertyRoomShowcaseTitle}>{item.room.name || "Untitled room"}</div>
                        <div className={styles.propertyRoomShowcasePrice}>
                          {item.room.priceFullday > 0 ? formatCurrency(item.room.priceFullday) : "Price missing"}
                          <span>/ room</span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.propertyRoomShowcaseBody}>
                      <div className={styles.propertyRoomShowcaseChips}>
                        <span className={styles.propertyRoomChip}>{item.room.maxGuests} guests</span>
                        <span className={styles.propertyRoomChip}>{item.room.bedInfo || "Bed info pending"}</span>
                        <span className={styles.propertyRoomChip}>{item.room.bathroomType || "Bathroom pending"}</span>
                      </div>

                      <div className={styles.propertyRoomShowcaseFooter}>
                        <div className={styles.propertyRoomFooterBadges}>
                          <span className={`${styles.readinessPill} ${item.warning ? styles.readinessPillReview : styles.readinessPillOk}`}>
                            {item.warning ?? "Ready for edit"}
                          </span>
                          <span className={styles.readinessPill}>{item.providerMappingLabel}</span>
                          {item.room.isPrimary ? <span className={styles.readinessPill}>Primary room</span> : null}
                        </div>
                        <span className={styles.propertyRoomManageLabel}>Edit Room</span>
                      </div>
                    </div>
                  </Link>
                ))}

                <Link
                  href={`/partnerslogin/home/pro/properties/${encodeURIComponent(familyId)}/rooms/new`}
                  className={styles.addRoomShowcaseCard}
                >
                  <span className={styles.addRoomShowcaseIcon}>
                    <Plus size={36} />
                  </span>
                  <span className={styles.addRoomShowcaseTitle}>Add Room</span>
                  <span className={styles.addRoomShowcaseCopy}>Create a new room inside the selected property.</span>
                </Link>
              </div>

              <article className={styles.propertyCenterHintCard}>
                <div className={styles.listTitle}>Choose a room to manage</div>
                <div className={styles.cardCopy}>
                  Click a room card to open a separate Pro room page. The room page contains Details, Pricing, Calendar,
                  Channels, Mapping, and Sync Health so the main Properties screen stays clean.
                </div>
              </article>

              <div className={styles.propertySubSectionBar}>
                <div>
                  <div className={styles.propertySubSectionTitle}>Existing property workspaces</div>
                  <div className={styles.propertySubSectionCopy}>
                    Existing routes and deep links stay available below so current technical workflows remain safe.
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

          {roomRouteState && activeSection === "rooms-units" && (
            <section className={styles.roomControlCenterShell}>
              <div className={styles.roomControlCenterHeader}>
                <div>
                  <div className={styles.sectionEyebrow}>{roomEditorPrimaryActionLabel}</div>
                  <h2 className={styles.roomControlCenterTitle}>{roomEditorDisplayName}</h2>
                  <p className={styles.roomControlCenterCopy}>
                    Manage this room&apos;s details, photos, pricing, calendar, channels, and sync health from one
                    place. Advanced channel setup remains under Mapping and Sync Health.
                  </p>
                </div>

                <Link
                  href={simplePropertiesHref}
                  className={styles.roomControlBackLink}
                >
                  Back to Properties
                </Link>
              </div>

              <div className={styles.roomControlMetaRow}>
                <span className={styles.propertySelectorMetaPill}>Property: {currentPropertyOption?.name ?? propertyName}</span>
                <span className={styles.propertySelectorMetaPill}>Status: {roomEditorDisplayStatus}</span>
                <span className={styles.propertySelectorMetaPill}>Base price: {roomEditorBasePriceLabel}</span>
                <span className={styles.propertySelectorMetaPill}>Photos: {roomEditorPhotoStatusLabel}</span>
                <span className={styles.propertySelectorMetaPill}>Channels: {roomEditorChannelStatusLabel}</span>
                <span className={styles.propertySelectorMetaPill}>Sync Health: {roomEditorSyncStatusLabel}</span>
              </div>

              <div className={styles.roomControlTabRow}>
                {ROOM_EDITOR_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`${styles.roomControlTabButton} ${roomEditorTab === tab.id ? styles.roomControlTabButtonActive : ""}`}
                    onClick={() => setRoomEditorTab(tab.id)}
                  >
                    <span className={styles.roomControlTabTitle}>{tab.title}</span>
                    <span className={styles.roomControlTabHint}>{tab.description}</span>
                  </button>
                ))}
              </div>

              <div className={styles.roomControlPanel}>
                {roomEditorTab === "details" ? (
                  <HostRoomsManager
                    familyId={familyId}
                    homeLat={propertyHomeLat ?? undefined}
                    homeLng={propertyHomeLng ?? undefined}
                    title={roomEditorMode === "create" ? "Create Room" : "Edit Room"}
                    description={
                      roomEditorMode === "create"
                        ? "Create a room for this selected property. Save the room before expecting pricing, channel, or sync workflows."
                        : "Edit this room using the existing Famlo room inventory flow."
                    }
                    propertyLabel={propertyLocalityLabel ?? locationLabel}
                    showChannelManager={false}
                    viewRoomPage
                    emptyTitle="No rooms yet"
                    emptyCopy="Create the first room for this property to start building your Famlo inventory."
                    selectedRoomId={roomEditorMode === "edit" ? selectedRoomId : null}
                    createMode={roomEditorMode === "create"}
                    compactMode
                  />
                ) : null}

                {roomEditorTab === "pricing" ? (
                  <article className={styles.roomControlPlaceholder}>
                    <div className={styles.placeholderTitle}>Pricing</div>
                    <div className={styles.placeholderCopy}>
                      {roomEditorMode === "create"
                        ? "Finish the room draft in Details first. The existing pricing workspace will become useful once the room exists."
                        : "Room-level pricing already lives in the existing Famlo room flow. Channel-wise pricing is not connected here yet."}
                    </div>
                    <div className={styles.placeholderGrid}>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderLabel}>Base price</div>
                        <div className={styles.placeholderValue}>{roomEditorBasePriceLabel}</div>
                      </div>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderLabel}>Smart pricing</div>
                        <div className={styles.placeholderValue}>
                          {roomEditorRoom?.quarterEnabled ? "Enabled" : roomEditorMode === "create" ? "Set after save" : "Disabled"}
                        </div>
                      </div>
                    </div>
                    <div className={styles.inlineActionRow}>
                      <button type="button" className={styles.primaryActionButton} onClick={() => setActiveSection("rates-restrictions")}>
                        Open Pricing Workspace
                      </button>
                    </div>
                  </article>
                ) : null}

                {roomEditorTab === "calendar" ? (
                  <article className={styles.roomControlPlaceholder}>
                    <div className={styles.placeholderTitle}>Calendar</div>
                    <div className={styles.placeholderCopy}>
                      View this room&apos;s availability through the existing calendar workspace. Checkout-day logic stays unchanged.
                    </div>
                    <div className={styles.placeholderGrid}>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderLabel}>Calendar status</div>
                        <div className={styles.placeholderValue}>{selectedRoomCalendarHealthy ? "Visible in property calendar" : "Needs review"}</div>
                      </div>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderLabel}>Selected room</div>
                        <div className={styles.placeholderValue}>{roomEditorRoom?.name ?? "Save room first"}</div>
                      </div>
                    </div>
                    <div className={styles.inlineActionRow}>
                      <button type="button" className={styles.primaryActionButton} onClick={() => router.push(`/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(familyId)}&section=inventory-calendar`)}>
                        Open Calendar
                      </button>
                    </div>
                  </article>
                ) : null}

                {roomEditorTab === "channels" ? (
                  <article className={styles.roomControlPlaceholder}>
                    <div className={styles.placeholderTitle}>Channels</div>
                    <div className={styles.placeholderCopy}>
                      Review connected channel readiness for this room. Existing integrations remain connected only through the current channel workspaces.
                    </div>
                    <div className={styles.placeholderGrid}>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderLabel}>Room status</div>
                        <div className={styles.placeholderValue}>{selectedRoomCard?.channelStatus ?? "Save room first"}</div>
                      </div>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderLabel}>Provider mapping</div>
                        <div className={styles.placeholderValue}>{selectedRoomCard?.providerMappingLabel ?? "Check Channels"}</div>
                      </div>
                    </div>
                    <div className={styles.inlineActionRow}>
                      <button type="button" className={styles.primaryActionButton} onClick={() => setActiveSection("connected-channels")}>
                        Open Channels
                      </button>
                    </div>
                  </article>
                ) : null}

                {roomEditorTab === "mapping" ? (
                  <article className={styles.roomControlPlaceholder}>
                    <div className={styles.placeholderTitle}>Mapping</div>
                    <div className={styles.placeholderCopy}>
                      Use the existing mapping tools for room and rate connections. This panel stays honest and does not create new mapping logic.
                    </div>
                    <div className={styles.placeholderGrid}>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderLabel}>Room mapping</div>
                        <div className={styles.placeholderValue}>
                          {roomEditorRoom && roomMappingsByRoomId.get(roomEditorRoom.id)?.externalRoomTypeId ? "Mapped" : "Needs review"}
                        </div>
                      </div>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderLabel}>Rate mapping</div>
                        <div className={styles.placeholderValue}>
                          {roomEditorRoom && ratePlansByRoomId.get(roomEditorRoom.id)?.externalRatePlanId ? "Mapped" : "Needs review"}
                        </div>
                      </div>
                    </div>
                    <div className={styles.inlineActionRow}>
                      <button type="button" className={styles.primaryActionButton} onClick={() => setActiveSection("room-mapping")}>
                        Open Room Mapping
                      </button>
                      <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection("rate-mapping")}>
                        Open Rate Mapping
                      </button>
                    </div>
                  </article>
                ) : null}

                {roomEditorTab === "sync-health" ? (
                  <article className={styles.roomControlPlaceholder}>
                    <div className={styles.placeholderTitle}>Sync Health</div>
                    <div className={styles.placeholderCopy}>
                      Review room-specific issues using the existing Sync Health and logs sections. No new sync behavior is introduced here.
                    </div>
                    <div className={styles.placeholderGrid}>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderLabel}>Open issues</div>
                        <div className={styles.placeholderValue}>{roomEditorSyncStatusLabel}</div>
                      </div>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderLabel}>Next review</div>
                        <div className={styles.placeholderValue}>
                          {selectedRoomConflictCount === 0 ? "Sync logs" : "Conflicts"}
                        </div>
                      </div>
                    </div>
                    <div className={styles.inlineActionRow}>
                      <button
                        type="button"
                        className={styles.primaryActionButton}
                        onClick={() => setActiveSection(selectedRoomConflictCount > 0 ? "conflicts" : "sync-logs")}
                      >
                        Open Sync Health
                      </button>
                    </div>
                  </article>
                ) : null}
              </div>
            </section>
          )}

          {activeSection === "dashboard" && !roomRouteState && (
            <>
              <section className={styles.heroCard}>
                <div className={styles.heroGrid}>
                  <div>
                    <div className={styles.eyebrow}>Famlo Pro</div>
                    <h2 className={styles.heroTitle}>
                      Famlo Pro command center
                    </h2>
                    <p className={styles.heroText}>
                      Manage this property&apos;s rooms, content, pricing, bookings, calendar, channels, and sync
                      health from one place. Existing provider, sync, and OTA workflows continue to run safely
                      underneath without changing their current logic.
                    </p>
                    <div className={styles.heroMeta}>
                      <div className={styles.heroMetaItem}>
                        <span className={styles.heroMetaLabel}>Selected property</span>
                        <span className={styles.heroMetaValue}>{propertyName}</span>
                      </div>
                      <div className={styles.heroMetaItem}>
                        <span className={styles.heroMetaLabel}>Location</span>
                        <span className={styles.heroMetaValue}>{selectedPropertyLocation}</span>
                      </div>
                      <div className={styles.heroMetaItem}>
                        <span className={styles.heroMetaLabel}>Family scope</span>
                        <span className={styles.heroMetaValue}>{familyId}</span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.heroPanel}>
                    <div className={styles.heroPanelTitle}>Pilot go-live snapshot</div>
                    <div className={styles.inlineBadgeRow}>
                      <span className={`${styles.readinessPill} ${goLiveSummary.toneClass}`}>{goLiveSummary.label}</span>
                      <span className={styles.readinessPill}>{goLiveChecklist.filter((item) => item.status === "ready").length}/{goLiveChecklist.length} ready</span>
                    </div>
                    <div className={styles.feedCopy}>{goLiveSummary.explanation}</div>
                    <div className={styles.heroPanelList}>
                      <div className={styles.heroPanelItem}>
                        <span>Channel status</span>
                        <strong>{selectedPropertyChannelStatus}</strong>
                      </div>
                      <div className={styles.heroPanelItem}>
                        <span>Active rooms</span>
                        <strong>{activeRoomsCount === 0 ? "None yet" : `${activeRoomsCount} ready`}</strong>
                      </div>
                      <div className={styles.heroPanelItem}>
                        <span>Rooms missing setup</span>
                        <strong>{roomsMissingPrice + photosReadiness.missingRooms === 0 ? "None open" : `${roomsMissingPrice + photosReadiness.missingRooms} open`}</strong>
                      </div>
                      <div className={styles.heroPanelItem}>
                        <span>Bookings</span>
                        <strong>{totalBookingsCount === 0 ? "No reservations yet" : `${totalBookingsCount} total`}</strong>
                      </div>
                      <div className={styles.heroPanelItem}>
                        <span>Action needed</span>
                        <strong>{conflictItems.length + actionNeededBookingsCount === 0 ? "All clear" : `${conflictItems.length + actionNeededBookingsCount} open`}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className={styles.statGrid}>
                {pilotHomeCards.map((metric) => (
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
                      <h3 className={styles.cardTitle}>Pilot go-live checklist</h3>
                      <p className={styles.cardCopy}>
                        See what is ready for this property, what still needs attention, and what Famlo team may need
                        to review before pilot go-live.
                      </p>
                    </div>
                    <span className={styles.badge}>{setupProgressPercent}% ready</span>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.checkGrid}>
                      {goLiveHostChecklist.slice(0, 6).map((item) => (
                        <div key={item.title} className={styles.checkItem}>
                          <div>
                            <div className={styles.checkTitle}>{item.title}</div>
                            <div className={styles.checkMeta}>{item.detail}</div>
                          </div>
                          <span className={`${styles.readinessPill} ${item.statusClass}`}>{item.statusLabel}</span>
                        </div>
                      ))}
                    </div>
                    <div className={styles.inlineActionRow}>
                      <button type="button" className={styles.primaryActionButton} onClick={() => setActiveSection("setup-guide")}>
                        Open setup guide
                      </button>
                    </div>
                  </div>
                </article>

                <article className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <h3 className={styles.cardTitle}>Quick actions</h3>
                      <p className={styles.cardCopy}>
                        Jump straight into the place where you need to manage this property next.
                      </p>
                    </div>
                    <span className={`${styles.readinessPill} ${goLiveSummary.toneClass}`}>{goLiveSummary.label}</span>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.stack}>
                      {quickActionItems.slice(0, 6).map((item) => (
                        <div key={item.title} className={styles.actionItem}>
                          <div>
                            <div className={styles.actionTitle}>{item.title}</div>
                            <div className={styles.actionCopy}>{item.body}</div>
                          </div>
                          <div className={styles.inlineActionRow}>
                            <span className={styles.badge}>{item.badge}</span>
                            <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection(item.targetSection)}>
                              Open
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              </section>

              <section className={styles.twoCol}>
                <article className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <h3 className={styles.cardTitle}>Property readiness focus</h3>
                      <p className={styles.cardCopy}>
                        Priority signals that tell you whether this property is ready for cleaner pilot operations.
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
                      <h3 className={styles.cardTitle}>Workspace shortcuts</h3>
                      <p className={styles.cardCopy}>
                        Open the right section fast when a host asks what to do next for this property.
                      </p>
                    </div>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.stack}>
                      {quickActionItems.slice(6).map((item) => (
                        <div key={item.title} className={styles.feedItem}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                            <div className={styles.feedTitle}>{item.title}</div>
                            <span className={styles.badge}>{item.badge}</span>
                          </div>
                          <div className={styles.feedCopy}>{item.body}</div>
                          <div className={styles.inlineActionRow}>
                            <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection(item.targetSection)}>
                              Open section
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              </section>
            </>
          )}

          {activeSection !== "dashboard" && activeSection !== "properties-home" && (
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
                        Use this host-friendly checklist to see what is ready for this property, what still needs
                        attention, and what Famlo team may need to review before pilot go-live.
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
                  <div className={styles.summaryLabel}>Pilot go-live guidance</div>
                  <div className={styles.recommendationText}>
                    Review this selected property from top to bottom: complete content, activate at least one room,
                    confirm pricing and photos, then check channels and Sync Health before expecting OTA-ready operations.
                  </div>
                  <div className={styles.inlineActionRow}>
                    <button type="button" className={styles.primaryActionButton} onClick={() => setActiveSection("rooms-units")}>
                      Manage rooms
                    </button>
                    <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection("connected-channels")}>
                      Check channels
                    </button>
                  </div>
                </div>

                <div className={styles.listCard}>
                  <div className={styles.cardHeaderCompact}>
                    <div>
                      <div className={styles.listTitle}>Host go-live checklist</div>
                      <div className={styles.cardCopy}>
                        Simple pilot checks for this property using current Famlo Pro data only.
                      </div>
                    </div>
                    <span className={`${styles.readinessPill} ${goLiveSummary.toneClass}`}>{goLiveSummary.label}</span>
                  </div>
                  <div className={styles.logList}>
                    {goLiveHostChecklist.map((item) => (
                      <article key={item.title} className={styles.logRow}>
                        <div>
                          <div className={styles.logTitle}>{item.title}</div>
                          <div className={styles.logCopy}>{item.detail}</div>
                        </div>
                        <div className={styles.logMeta}>
                          <span className={`${styles.readinessPill} ${item.statusClass}`}>{item.statusLabel}</span>
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

                <div className={styles.listCard}>
                  <div className={styles.cardHeaderCompact}>
                    <div>
                      <div className={styles.listTitle}>Go-live readiness checklist</div>
                      <div className={styles.cardCopy}>
                        Live connection summary for Famlo Pro, mapping, ARI, booking proof, and safety guardrails.
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

          {activeSection === "rooms-units" && !roomRouteState && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Rooms</h3>
                  <p className={styles.cardCopy}>
                    Rooms for this property. Changes here update the Famlo room inventory for the selected property.
                  </p>
                </div>
                <span className={styles.badge}>{rooms.length} units</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.listGrid}>
                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Room readiness</div>
                    <div className={styles.roomStats}>
                      <div className={styles.miniStat}>
                        <div className={styles.miniLabel}>Total rooms</div>
                        <div className={styles.miniValue}>{rooms.length}</div>
                      </div>
                      <div className={styles.miniStat}>
                        <div className={styles.miniLabel}>Active rooms</div>
                        <div className={styles.miniValue}>{rooms.filter((room) => room.isActive).length}</div>
                      </div>
                      <div className={styles.miniStat}>
                        <div className={styles.miniLabel}>Missing photos</div>
                        <div className={styles.miniValue}>{countRoomsMissingPhotos(rooms)}</div>
                      </div>
                      <div className={styles.miniStat}>
                        <div className={styles.miniLabel}>Missing price</div>
                        <div className={styles.miniValue}>{countRoomsMissingPrice(rooms)}</div>
                      </div>
                    </div>
                    <div className={styles.roomReadinessRow}>
                      <span className={`${styles.readinessPill} ${hasPrimaryReadyRoom(rooms) ? styles.readinessPillOk : styles.readinessPillMissing}`}>
                        Primary room: {hasPrimaryReadyRoom(rooms) ? "Selected" : "Missing"}
                      </span>
                      <span className={styles.readinessPill}>
                        Property scope: {familyId}
                      </span>
                    </div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Room publishing notes</div>
                    <div className={styles.stack}>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Famlo inventory first</div>
                        <div className={styles.feedCopy}>Use this area to update rooms, photos, amenities, pricing, and room locations for the selected property.</div>
                      </div>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>OTA controls stay separate</div>
                        <div className={styles.feedCopy}>OTA/channel listing controls will stay under Channels and Advanced, not inside room editing.</div>
                      </div>
                      {rooms.length > 0 && rooms.every((room) => !room.isActive) ? (
                        <div className={styles.feedItem}>
                          <div className={styles.feedTitle}>All rooms are inactive</div>
                          <div className={styles.feedCopy}>Turn on at least one room if you want this property to stay bookable on Famlo.</div>
                        </div>
                      ) : null}
                    </div>
                  </article>
                </div>

                <HostRoomsManager
                  familyId={familyId}
                  homeLat={propertyHomeLat ?? undefined}
                  homeLng={propertyHomeLng ?? undefined}
                  title="Rooms for this property"
                  description="Changes here update the Famlo room inventory for the selected property."
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
                        const roomMapping = roomMappingsByRoomId.get(room.id) ?? null;
                        const roomRatePlan = ratePlansByRoomId.get(room.id) ?? null;
                        const providerMappingLabel =
                          roomMapping?.externalRoomTypeId && roomRatePlan?.externalRatePlanId
                            ? "Mapped"
                            : roomMapping?.externalRoomTypeId || roomRatePlan?.externalRatePlanId
                              ? "Needs review"
                              : "Check Channels";
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
                                <strong>{providerMappingLabel}</strong>
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
                  <h3 className={styles.cardTitle}>Pricing & Rules</h3>
                  <p className={styles.cardCopy}>
                    Pricing & Rules for this property. Use this page to catch missing prices and review stay rules before going live.
                  </p>
                </div>
                <span className={`${styles.badge} ${styles.badgeMuted}`}>Manual only</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.listGrid}>
                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Pricing summary</div>
                    <div className={styles.roomStats}>
                      <div className={styles.miniStat}>
                        <div className={styles.miniLabel}>Total rooms</div>
                        <div className={styles.miniValue}>{rooms.length}</div>
                      </div>
                      <div className={styles.miniStat}>
                        <div className={styles.miniLabel}>Rooms with price</div>
                        <div className={styles.miniValue}>{pricedRooms.length}</div>
                      </div>
                      <div className={styles.miniStat}>
                        <div className={styles.miniLabel}>Missing price</div>
                        <div className={styles.miniValue}>{roomsMissingPrice}</div>
                      </div>
                      <div className={styles.miniStat}>
                        <div className={styles.miniLabel}>Active / inactive</div>
                        <div className={styles.miniValue}>{activeRoomsCount} / {inactiveRoomsCount}</div>
                      </div>
                      <div className={styles.miniStat}>
                        <div className={styles.miniLabel}>Smart pricing rooms</div>
                        <div className={styles.miniValue}>{roomsWithSmartPricing}</div>
                      </div>
                    </div>
                    <div className={styles.roomReadinessRow}>
                      <span className={styles.readinessPill}>
                        Lowest room price: {lowestRoomPrice != null ? formatCurrency(lowestRoomPrice) : "Missing"}
                      </span>
                      <span className={styles.readinessPill}>
                        Highest room price: {highestRoomPrice != null ? formatCurrency(highestRoomPrice) : "Missing"}
                      </span>
                      <span className={styles.readinessPill}>
                        Primary room price: {primaryRoom?.priceFullday && primaryRoom.priceFullday > 0 ? formatCurrency(primaryRoom.priceFullday) : "Missing"}
                      </span>
                    </div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>How pricing works today</div>
                    <div className={styles.stack}>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Room prices stay room-level</div>
                        <div className={styles.feedCopy}>Room prices are managed from Rooms and continue to use the current Famlo price fields.</div>
                      </div>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Rules stay lightweight</div>
                        <div className={styles.feedCopy}>Check-in, check-out, and house-rule context stays property-level. Advanced stay rules are coming later.</div>
                      </div>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Channel pricing comes later</div>
                        <div className={styles.feedCopy}>Room-level pricing works today. Channel-wise pricing will come later and is not added in this phase.</div>
                      </div>
                    </div>
                  </article>
                </div>

                <div className={styles.listGrid}>
                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Room pricing by inventory</div>
                    <div className={styles.feedCopy} style={{ marginBottom: 12 }}>
                      Review each room’s current price setup here, then open Rooms to edit the actual values.
                    </div>
                    <div className={styles.stack}>
                      {(rooms.length > 0 ? rooms : [roomPlaceholder]).map((room) => (
                        <div key={room.id} className={styles.feedItem}>
                          <div className={styles.feedTitle}>
                            {room.name}
                            {room.id !== "placeholder" ? ` · ${room.isActive ? "Active" : "Inactive"}` : ""}
                          </div>
                          <div className={styles.feedCopy}>
                            {room.id === "placeholder"
                              ? "No room inventory is available yet for this property."
                              : `${room.unitType || "Famlo room"} · Base ${room.priceFullday > 0 ? formatCurrency(room.priceFullday) : "Missing"} · Low demand ${room.priceMorning > 0 ? formatCurrency(room.priceMorning) : "Not set"} · High demand ${room.priceEvening > 0 ? formatCurrency(room.priceEvening) : "Not set"} · ${room.quarterEnabled ? "Smart pricing on" : "Smart pricing off"}`}
                          </div>
                          {room.id !== "placeholder" ? (
                            <div className={styles.roomReadinessRow}>
                              <span className={`${styles.readinessPill} ${room.priceFullday > 0 ? styles.readinessPillOk : styles.readinessPillMissing}`}>
                                {room.priceFullday > 0 ? "Base price set" : "Missing base price"}
                              </span>
                              <span className={styles.readinessPill}>
                                {room.isPrimary ? "Primary room" : "Secondary room"}
                              </span>
                              <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection("rooms-units")}>
                                Edit in Rooms
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Property rules snapshot</div>
                    <div className={styles.placeholderGrid}>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderTitle}>Check-in time</div>
                        <div className={styles.placeholderValue}>{propertyContent.checkInTime || initialSettings.checkInTime || "Not set"}</div>
                        <div className={styles.placeholderCopy}>Saved from current property content settings.</div>
                      </div>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderTitle}>Check-out time</div>
                        <div className={styles.placeholderValue}>{propertyContent.checkOutTime || initialSettings.checkOutTime || "Not set"}</div>
                        <div className={styles.placeholderCopy}>Guests will continue seeing the existing Famlo timing until later OTA-specific rules exist.</div>
                      </div>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderTitle}>House rules</div>
                        <div className={styles.placeholderValue}>{propertyContent.houseRules ? "Available" : "Needs review"}</div>
                        <div className={styles.placeholderCopy}>{propertyContent.houseRules || initialSettings.houseRules || "Add property house rules from Content & Photos to complete the stay policy summary."}</div>
                      </div>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderTitle}>Cancellation / stay rules</div>
                        <div className={styles.placeholderValue}>{initialSettings.cancellationPolicyLabel || "Coming later"}</div>
                        <div className={styles.placeholderCopy}>
                          {initialSettings.cancellationPolicyLabel
                            ? "Current cancellation label is saved in OTA readiness settings."
                            : "Advanced stay rules such as min stay and max stay are coming later. No new DB fields are added in this phase."}
                        </div>
                      </div>
                    </div>
                  </article>
                </div>

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
                  {(rooms.length > 0 ? rooms : [roomPlaceholder]).map((room) => (
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
                    Calendar for this property. View Famlo bookings, OTA bookings, manual blocks, and availability from one place. Checkout-day availability rules are preserved.
                  </p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.listGrid}>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Visible rooms</div>
                    <div className={styles.metricValue}>{visibleRoomsInCalendar}</div>
                    <div className={styles.metricHint}>Room rows currently shown in this property calendar window.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Famlo bookings</div>
                    <div className={styles.metricValue}>{famloCalendarCells}</div>
                    <div className={styles.metricHint}>Calendar cells blocked by direct Famlo reservations.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>OTA bookings</div>
                    <div className={styles.metricValue}>{otaCalendarCells}</div>
                    <div className={styles.metricHint}>Cells blocked by Booking.com or other OTA-linked stays.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Pending / attention</div>
                    <div className={styles.metricValue}>{pendingCalendarCells}</div>
                    <div className={styles.metricHint}>Pending approval or awaiting-payment cells that still need review.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Manual blocks</div>
                    <div className={styles.metricValue}>{manualBlockCalendarCells}</div>
                    <div className={styles.metricHint}>Manual blocked dates derived from the current Famlo calendar path.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Past dates</div>
                    <div className={styles.metricValue}>{pastCalendarCells}</div>
                    <div className={styles.metricHint}>Older dates remain visible for context but stay read-only here.</div>
                  </article>
                </div>

                <div className={styles.listGrid}>
                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Unified calendar view</div>
                    <div className={styles.feedCopy}>
                      This view keeps Famlo bookings, OTA bookings, manual blocks, and availability in one room-by-room workspace without changing any existing calendar or sync rules.
                    </div>
                    <div className={styles.roomReadinessRow}>
                      <span className={styles.readinessPill}>Famlo booking</span>
                      <span className={styles.readinessPill}>OTA booking</span>
                      <span className={styles.readinessPill}>Pending approval</span>
                      <span className={styles.readinessPill}>Manual block</span>
                      <span className={styles.readinessPill}>Past date</span>
                      <span className={styles.readinessPill}>Available</span>
                    </div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Calendar attention</div>
                    <div className={styles.feedCopy}>
                      Use this summary to spot whether the current property window needs operational review before you rely on availability.
                    </div>
                    <div className={styles.stack}>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Checkout-day rule</div>
                        <div className={styles.feedCopy}>
                          {calendarVerification
                            ? calendarVerification.targetDateBlocked && !calendarVerification.checkoutDateBlocked
                              ? `${calendarVerification.roomName} keeps checkout-day availability correct in the current verification window.`
                              : `${calendarVerification.roomName} needs review because the verification window does not match the expected checkout-day state.`
                            : "Checkout-day verification remains available below whenever a Booking.com verification target is present."}
                        </div>
                      </div>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Calendar attention count</div>
                        <div className={styles.feedCopy}>
                          {calendarAttentionCount > 0
                            ? `${calendarAttentionCount} calendar signal${calendarAttentionCount === 1 ? "" : "s"} currently need review across pending stays, verification, or open sync issues.`
                            : "No open calendar attention signals are visible in the current Pro calendar."}
                        </div>
                      </div>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Sync health context</div>
                        <div className={styles.feedCopy}>
                          {conflictItems.length > 0
                            ? `${conflictItems.length} broader sync health issue${conflictItems.length === 1 ? "" : "s"} are open for this property. Review Sync Health if the calendar looks unexpected.`
                            : "No broader sync-health blocker is currently flagged for this property."}
                        </div>
                      </div>
                    </div>
                  </article>
                </div>

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
                                Review the selected calendar reservation or blocked stay context without changing any existing booking or availability rules.
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
                <div className={styles.listGrid}>
                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Operational calendar checks</div>
                    <div className={styles.feedCopy}>
                      Advanced calendar verification stays available here so OTA and checkout-day correctness can still be reviewed without changing any current availability logic.
                    </div>
                  </article>
                </div>
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
                  <h3 className={styles.cardTitle}>Channels</h3>
                  <p className={styles.cardCopy}>
                    Channels for this property. Use this page to understand whether this property is ready to sell on connected OTAs. Technical mapping and logs remain available under Advanced.
                  </p>
                </div>
                <span className={`${styles.badge} ${primaryProperty?.externalPropertyId ? "" : styles.badgeMuted}`.trim()}>
                  {primaryProperty?.externalPropertyId ? "Connected foundation" : "Needs setup"}
                </span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.listGrid}>
                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Channel summary</div>
                    <div className={styles.roomStats}>
                      <div className={styles.miniStat}>
                        <div className={styles.miniLabel}>Connected channels</div>
                        <div className={styles.miniValue}>{currentChannelAttached ? 1 : 0}</div>
                      </div>
                      <div className={styles.miniStat}>
                        <div className={styles.miniLabel}>Booking.com / Channex</div>
                        <div className={styles.miniValue}>{currentChannelAttached ? (currentChannelAttached ? ((channelFeedHealth?.channelActive ?? false) ? "Connected" : "Attached") : "Needs setup") : "Needs setup"}</div>
                      </div>
                      <div className={styles.miniStat}>
                        <div className={styles.miniLabel}>Room mapping</div>
                        <div className={styles.miniValue}>{roomMappingsReadyCount}/{rooms.length || 0}</div>
                      </div>
                      <div className={styles.miniStat}>
                        <div className={styles.miniLabel}>Rate mapping</div>
                        <div className={styles.miniValue}>{rateMappingsReadyCount}/{rooms.length || 0}</div>
                      </div>
                    </div>
                    <div className={styles.roomReadinessRow}>
                      <span className={`${styles.readinessPill} ${channelHealthNeedsAttention ? styles.readinessPillReview : styles.readinessPillOk}`}>
                        {channelHealthNeedsAttention ? "Action needed" : "Sync healthy"}
                      </span>
                      <span className={`${styles.readinessPill} ${(channelFeedHealth?.pendingManualReviewCount ?? 0) > 0 ? styles.readinessPillReview : styles.readinessPillOk}`}>
                        Famlo team review: {(channelFeedHealth?.pendingManualReviewCount ?? 0) > 0 ? "Needed" : "Not needed"}
                      </span>
                      <span className={`${styles.readinessPill} ${ariHealth.statusLabel === "Synced" ? styles.readinessPillOk : styles.readinessPillReview}`}>
                        ARI: {ariHealth.statusLabel}
                      </span>
                    </div>
                    <div className={styles.feedCopy} style={{ marginTop: 12 }}>
                      {connectedChannelCards.length === 0
                        ? "No connected channel data is available yet for this property."
                        : roomMappingsMissingCount > 0 || rateMappingsMissingCount > 0
                          ? `Setup is still needed: ${roomMappingsMissingCount} active rooms still need room mapping and ${rateMappingsMissingCount} still need rate mapping.`
                          : channelHealthNeedsAttention
                            ? "A sync or review issue is visible for this property, so Famlo team may need to review."
                            : "This property looks healthy enough to move through connected OTA setup with the current foundation."}
                    </div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>What stays here</div>
                    <div className={styles.stack}>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Host-safe channel status</div>
                        <div className={styles.feedCopy}>Use this tab to understand if the property is connected, healthy, and ready for OTA flow.</div>
                      </div>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Technical tools stay separate</div>
                        <div className={styles.feedCopy}>Room mapping, rate mapping, and sync logs remain available under Advanced so this tab stays simple.</div>
                      </div>
                      <div className={styles.inlineActionRow}>
                        <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection("room-mapping")}>
                          Open Advanced tools
                        </button>
                        <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection("conflicts")}>
                          Open Sync Health
                        </button>
                      </div>
                    </div>
                  </article>
                </div>

                <div className={styles.listGrid}>
                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Channel readiness checklist</div>
                    <div className={styles.stack}>
                      {channelReadinessChecklist.map((item) => (
                        <div key={item.label} className={styles.feedItem}>
                          <div className={styles.feedTitle}>{item.label}</div>
                          <div className={styles.roomReadinessRow}>
                            <span className={`${styles.readinessPill} ${item.ready ? styles.readinessPillOk : styles.readinessPillMissing}`}>
                              {item.ready ? "Ready" : "Needs setup"}
                            </span>
                            <span className={styles.readinessPill}>{item.value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Connected channel actions</div>
                    <div className={styles.feedCopy} style={{ marginBottom: 12 }}>
                      These are the safest next actions using the data already loaded for this property.
                    </div>
                    {connectedChannelCards.length > 0 ? (
                      <div className={styles.stack}>
                        {connectedChannelCards.map((channel) => (
                          <div key={channel.key} className={styles.feedItem}>
                            <div className={styles.feedTitle}>{channel.name}</div>
                            <div className={styles.roomReadinessRow}>
                              <span className={`${styles.readinessPill} ${channel.statusLabel === "Connected" ? styles.readinessPillOk : styles.readinessPillMissing}`}>
                                {channel.statusLabel}
                              </span>
                              <span className={styles.readinessPill}>Rooms mapped: {channel.mappedRoomsCount}/{activeRoomsCount || 0}</span>
                              <span className={styles.readinessPill}>Rates mapped: {channel.mappedRatesCount}/{activeRoomsCount || 0}</span>
                              <span className={`${styles.readinessPill} ${channel.ariStatus === "Synced" ? styles.readinessPillOk : styles.readinessPillReview}`}>
                                ARI: {channel.ariStatus}
                              </span>
                            </div>
                            <div className={styles.feedCopy}>
                              Feed health: {channel.lastFeedSuccess !== "Not checked" ? `last success ${channel.lastFeedSuccess}` : "not checked yet"}. Recommended next action: {channel.recommendedAction}.
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyState}>
                        <div className={styles.emptyTitle}>No channel connected</div>
                        <div className={styles.emptyCopy}>
                          Channel data is unavailable for this property right now. Once a provider foundation is attached, this space will show host-safe readiness and next actions.
                        </div>
                      </div>
                    )}
                  </article>
                </div>

                <div className={styles.providerCard}>
                  <div className={styles.providerCardHeader}>
                    <div>
                      <div className={styles.cardTitle}>{primaryProvider?.name ?? "Channex"}</div>
                      <div className={styles.cardCopy}>
                        Current provider connection for this property.
                      </div>
                    </div>
                    <span className={`${styles.badge} ${primaryProperty?.externalPropertyId ? "" : styles.badgeMuted}`.trim()}>
                      {labelizeToken(primaryProperty?.syncStatus ?? "not_connected", primaryProperty?.externalPropertyId ? "Created" : "Not connected")}
                    </span>
                  </div>
                  <div className={styles.providerMetaRow}>
                    <span className={styles.filterChip}>Environment: {formatChannexEnvironmentLabel(channexConfig.environment)}</span>
                    <span className={styles.filterChip}>Foundation: {providerFoundationReady ? "Ready" : "Missing"}</span>
                    <span className={styles.filterChip}>Property connection: {primaryProperty?.externalPropertyId ? "Connected" : "Needs setup"}</span>
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
                    ? "Action needed: this property has a channel health issue, pending revision work, or a disconnected channel."
                    : "Sync healthy: the current channel health looks stable for this property."}
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
                <div className={styles.placeholderGrid}>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Host-facing note</div>
                    <div className={styles.placeholderValue}>No OTA listing buttons yet</div>
                    <div className={styles.placeholderCopy}>
                      Famlo Pro is showing channel status only in this phase. OTA room creation and listing controls will come later.
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
                  <h3 className={styles.cardTitle}>Sync Health</h3>
                  <p className={styles.cardCopy}>
                    Use this page to understand what needs attention before this property is truly healthy on connected OTAs.
                  </p>
                </div>
                <span className={`${styles.badge} ${conflictItems.length > 0 ? styles.badgeMuted : ""}`.trim()}>
                  {conflictItems.length > 0 ? `${conflictItems.length} issues` : "Everything looks healthy"}
                </span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.summaryGrid}>
                  <article className={styles.summaryCard}>
                    <div className={styles.summaryLabel}>Total issues</div>
                    <div className={styles.summaryValue}>{conflictItems.length}</div>
                    <div className={styles.summaryCopy}>Current Sync Health issues surfaced from channels, mappings, booking feed, and room readiness.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.summaryLabel}>Critical issues</div>
                    <div className={styles.summaryValue}>{criticalConflictCount}</div>
                    <div className={styles.summaryCopy}>These usually block a property from being safely ready to sell.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.summaryLabel}>Warnings</div>
                    <div className={styles.summaryValue}>{warningConflictCount + infoConflictCount}</div>
                    <div className={styles.summaryCopy}>These do not always block launch, but they still need review.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.summaryLabel}>Healthy checks</div>
                    <div className={styles.summaryValue}>{healthySyncCheckCount}/{syncHealthChecks.length}</div>
                    <div className={styles.summaryCopy}>
                      Last checked: {syncHealthLastCheckedAt ? formatDateTime(syncHealthLastCheckedAt) : "No recent check recorded"}
                    </div>
                  </article>
                </div>

                <div className={styles.listGrid}>
                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Health checklist</div>
                    <div className={styles.summaryCopy}>
                      Quick view of whether this property is connected, mapped, priced, and syncing cleanly.
                    </div>
                    <div className={styles.inlineBadgeRow}>
                      {syncHealthChecks.map((item) => (
                        <span
                          key={item.label}
                          className={`${styles.readinessPill} ${item.healthy ? styles.readinessPillOk : styles.readinessPillReview}`}
                        >
                          {item.label}: {item.healthy ? "Healthy" : "Needs review"}
                        </span>
                      ))}
                    </div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Next actions</div>
                    <div className={styles.summaryCopy}>
                      Technical mapping and logs remain available under Advanced, while channel setup stays under Channels.
                    </div>
                    <div className={styles.inlineActionRow}>
                      <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection("connected-channels")}>
                        Check channels
                      </button>
                      <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection("room-mapping")}>
                        Fix room mapping
                      </button>
                      <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection("rate-mapping")}>
                        Fix rate mapping
                      </button>
                      <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection("sync-logs")}>
                        View sync logs
                      </button>
                    </div>
                  </article>
                </div>

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
                          {item.targetSection ? (
                            <div className={styles.inlineActionRow}>
                              <button
                                type="button"
                                className={styles.secondaryActionButton}
                                onClick={() => setActiveSection(item.targetSection!)}
                              >
                                {item.actionLabel ?? "Open related section"}
                              </button>
                            </div>
                          ) : null}
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
                    <div className={styles.emptyTitle}>Everything looks healthy</div>
                    <div className={styles.emptyCopy}>
                      There are no open channel, mapping, feed, or availability sync issues for this property right now.
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
                    Bookings for this property. Manage Famlo and OTA reservations from one place.
                  </p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.listGrid}>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Total bookings</div>
                    <div className={styles.metricValue}>{totalBookingsCount}</div>
                    <div className={styles.metricHint}>All Famlo direct and OTA reservations scoped to this property.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Famlo direct</div>
                    <div className={styles.metricValue}>{famloDirectBookingsCount}</div>
                    <div className={styles.metricHint}>
                      {famloDirectBookingsCount > 0
                        ? "Existing direct reservations and pending host approvals."
                        : "No direct Famlo reservations are linked to this property yet."}
                    </div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>OTA bookings</div>
                    <div className={styles.metricValue}>{otaBookingsCount}</div>
                    <div className={styles.metricHint}>
                      {otaBookingsCount > 0
                        ? "Booking.com and other OTA reservations already linked to this property."
                        : "No OTA reservations have been imported for this property yet."}
                    </div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Pending approval</div>
                    <div className={styles.metricValue}>{pendingApprovalBookingsCount}</div>
                    <div className={styles.metricHint}>
                      {pendingApprovalBookingsCount > 0
                        ? "Direct booking requests that still need a host decision."
                        : "There are no pending approval requests right now."}
                    </div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Cancelled</div>
                    <div className={styles.metricValue}>{cancelledBookingsCount}</div>
                    <div className={styles.metricHint}>Reservations already cancelled or carrying OTA cancellation state.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Action needed</div>
                    <div className={styles.metricValue}>{actionNeededBookingsCount}</div>
                    <div className={styles.metricHint}>
                      {actionNeededBookingsCount > 0
                        ? "Bookings that need approval, OTA review, payment attention, or sync follow-up."
                        : "No bookings currently need host or operational follow-up."}
                    </div>
                  </article>
                </div>

                <div className={styles.listGrid}>
                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Unified bookings workspace</div>
                    <div className={styles.feedCopy}>
                      Manage Famlo and OTA reservations from one place. Advanced OTA diagnostics are shown below for operational review.
                    </div>
                    <div className={styles.roomReadinessRow}>
                      <span className={styles.readinessPill}>Confirmed: {confirmedBookingsCount}</span>
                      <span className={styles.readinessPill}>Modified / review needed: {modifiedReviewBookingsCount}</span>
                      <span className={styles.readinessPill}>Property scope: {familyId}</span>
                    </div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>How to use this workspace</div>
                    <div className={styles.stack}>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Famlo direct stays keep their current host flow</div>
                        <div className={styles.feedCopy}>Pending approvals, guest check-in, checkout, and chat continue to use the existing Famlo booking actions.</div>
                      </div>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>OTA bookings stay operationally safe</div>
                        <div className={styles.feedCopy}>Import, cancellation, modification, and acknowledgement workflows remain unchanged and visible below.</div>
                      </div>
                    </div>
                  </article>
                </div>

                <div className={styles.filterRow}>
                  {BOOKING_FILTERS.map((filter) => {
                    const active = bookingFilter === filter;
                    return (
                      <button
                        key={filter}
                        type="button"
                        className={`${styles.propertyTabLinkButton} ${active ? styles.propertyTabLinkButtonActive : ""}`}
                        onClick={() => setBookingFilter(filter)}
                      >
                        <span className={styles.propertyTabText}>
                          <span className={styles.propertyTabTitle}>{filter}</span>
                          <span className={styles.propertyTabHint}>
                            {filter === "All"
                              ? "See every reservation"
                              : filter === "Famlo Direct"
                                ? "Direct Famlo stays only"
                                : filter === "OTA"
                                  ? "Booking.com and OTA stays"
                                  : filter === "Pending approval"
                                    ? "Host decision still pending"
                                    : filter === "Confirmed"
                                      ? "Confirmed or active stays"
                                      : filter === "Cancelled"
                                        ? "Cancelled reservations"
                                        : filter === "Modified / Review needed"
                                          ? "Changes that need review"
                                          : "Bookings that need attention"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {proBookings.length > 0 ? (
                  <>
                    <div className={styles.mappingTable}>
                      <div className={styles.mappingHeader}>Reservation</div>
                      <div className={styles.mappingHeader}>Source</div>
                      <div className={styles.mappingHeader}>Stay dates</div>
                      <div className={styles.mappingHeader}>Guest / Room</div>
                      <div className={styles.mappingHeader}>Status / next action</div>
                      <div className={styles.mappingHeader}>Amount / payment</div>
                      {filteredProBookings.map((booking) => (
                        <Fragment key={booking.bookingId}>
                          <div className={styles.mappingCell}>
                            <div className={styles.mappingTitle}>{booking.guestDisplayName}</div>
                            <div className={styles.mappingSubcopy}>
                              {booking.isOta ? `OTA ref ${booking.externalBookingId ?? "pending"}` : `Famlo booking ${booking.bookingId}`}
                            </div>
                            <div className={styles.roomReadinessRow} style={{ marginTop: 10 }}>
                              <span className={`${styles.badge} ${isActionNeededBooking(booking) ? styles.badgeMuted : ""}`}>
                                {bookingHealthLabel(booking)}
                              </span>
                              <button
                                type="button"
                                className={styles.secondaryActionButton}
                                onClick={() => setSelectedBooking(booking)}
                              >
                                View details
                              </button>
                            </div>
                          </div>
                          <div className={styles.mappingCell}>
                            <div className={styles.mappingTitle}>{booking.sourceLabel}</div>
                            <div className={styles.mappingSubcopy}>
                              {booking.isOta ? "OTA reservation" : "Famlo direct reservation"}
                            </div>
                          </div>
                          <div className={styles.mappingCell}>
                            <div className={styles.mappingTitle}>{booking.startDate} → {booking.endDate}</div>
                            <div className={styles.mappingSubcopy}>Created {formatDateTime(booking.createdAt)}</div>
                          </div>
                          <div className={styles.mappingCell}>
                            <div className={styles.mappingTitle}>{booking.roomName}</div>
                            <div className={styles.mappingSubcopy}>
                              {booking.isOta ? "Linked through current OTA flow" : "Direct stay inventory"}
                            </div>
                          </div>
                          <div className={styles.mappingCell}>
                            <div className={styles.mappingTitle}>{labelizeToken(booking.status, "unknown")}</div>
                            <div className={styles.mappingSubcopy}>{bookingNextAction(booking)}</div>
                            {booking.isOta ? (
                              <div className={styles.roomReadinessRow} style={{ marginTop: 10 }}>
                                <span className={styles.readinessPill}>
                                  Import: {labelizeToken(booking.importStatus, "preview")}
                                </span>
                                <span className={styles.readinessPill}>
                                  Ack: {labelizeToken(booking.ackStatus, "not_acknowledged")}
                                </span>
                              </div>
                            ) : null}
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

                    {filteredProBookings.length === 0 ? (
                      <div className={styles.emptyState}>
                        <div className={styles.emptyTitle}>No bookings match this filter</div>
                        <div className={styles.emptyCopy}>
                          {bookingFilter === "Famlo Direct"
                            ? "This property does not have any direct Famlo reservations in the current list."
                            : bookingFilter === "OTA"
                              ? "No OTA reservations are available in the current property-scoped list."
                              : bookingFilter === "Pending approval"
                                ? "There are no direct booking requests waiting for host approval right now."
                                : bookingFilter === "Cancelled"
                                  ? "No cancelled reservations are surfaced for this property right now."
                                  : bookingFilter === "Modified / Review needed"
                                    ? "There are no OTA modifications or review-needed bookings in the current list."
                                    : bookingFilter === "Action needed"
                                      ? "No bookings currently need approval, OTA review, payment attention, or sync follow-up."
                                      : "Try a different filter to review direct bookings, OTA reservations, pending approvals, or bookings that need attention."}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyTitle}>No bookings surfaced yet</div>
                    <div className={styles.emptyCopy}>
                      Direct Famlo reservations and OTA-linked bookings will appear here once this property starts receiving stays.
                    </div>
                  </div>
                )}

                {selectedBooking ? (
                  <div className={styles.calendarDrawerOverlay} onClick={() => setSelectedBooking(null)}>
                    <aside
                      className={styles.calendarDrawer}
                      onClick={(event) => event.stopPropagation()}
                      aria-label="Booking details"
                    >
                      <div className={styles.calendarDrawerHeader}>
                        <div>
                          <div className={styles.listTitle}>Booking details</div>
                          <div className={styles.cardCopy}>
                            {selectedBooking.isOta
                              ? "Review the source, stay, and OTA state for this reservation."
                              : "Review the direct-booking summary for this reservation."}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={styles.drawerCloseButton}
                          onClick={() => setSelectedBooking(null)}
                          aria-label="Close booking details"
                        >
                          <X className={styles.drawerCloseIcon} />
                        </button>
                      </div>

                      <div className={styles.drawerSummaryGrid}>
                        <div className={styles.placeholderRow}>
                          <div className={styles.placeholderTitle}>Guest</div>
                          <div className={styles.placeholderValue}>{selectedBooking.guestDisplayName}</div>
                        </div>
                        <div className={styles.placeholderRow}>
                          <div className={styles.placeholderTitle}>Source</div>
                          <div className={styles.placeholderValue}>{selectedBooking.sourceLabel}</div>
                          <div className={styles.placeholderCopy}>
                            {selectedBooking.isOta
                              ? "OTA operational details stay secondary to the guest and stay summary."
                              : "Direct booking host actions continue to use the current Famlo flow."}
                          </div>
                        </div>
                        <div className={styles.placeholderRow}>
                          <div className={styles.placeholderTitle}>Room</div>
                          <div className={styles.placeholderValue}>{selectedBooking.roomName}</div>
                        </div>
                        <div className={styles.placeholderRow}>
                          <div className={styles.placeholderTitle}>Stay dates</div>
                          <div className={styles.placeholderValue}>{selectedBooking.startDate} → {selectedBooking.endDate}</div>
                        </div>
                        <div className={styles.placeholderRow}>
                          <div className={styles.placeholderTitle}>Amount</div>
                          <div className={styles.placeholderValue}>{selectedBooking.amount ?? "Not available"}</div>
                        </div>
                        <div className={styles.placeholderRow}>
                          <div className={styles.placeholderTitle}>Payment</div>
                          <div className={styles.placeholderValue}>{labelizeToken(selectedBooking.paymentStatus, "unknown")}</div>
                        </div>
                      </div>

                      <div className={styles.drawerDetailTable}>
                        <div className={styles.mappingHeader}>Field</div>
                        <div className={styles.mappingHeader}>Value</div>

                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>Booking status</div>
                        </div>
                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>{labelizeToken(selectedBooking.status, "unknown")}</div>
                        </div>

                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>Recommended next step</div>
                        </div>
                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>{bookingNextAction(selectedBooking)}</div>
                        </div>

                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>Linked Famlo booking</div>
                        </div>
                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>{selectedBooking.linkedBookingId ?? selectedBooking.bookingId}</div>
                        </div>

                        {selectedBooking.isOta ? (
                          <>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>External booking ID</div>
                            </div>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>{selectedBooking.externalBookingId ?? "Not available"}</div>
                            </div>

                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>Import state</div>
                            </div>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>{labelizeToken(selectedBooking.importStatus, "preview")}</div>
                            </div>

                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>Acknowledgement state</div>
                            </div>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>{labelizeToken(selectedBooking.ackStatus, "not_acknowledged")}</div>
                            </div>

                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>Operational review</div>
                            </div>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>{bookingHealthLabel(selectedBooking)}</div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>Direct booking flow</div>
                            </div>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>Existing host approval, check-in, checkout, and chat actions remain unchanged.</div>
                            </div>
                          </>
                        )}
                      </div>

                      <div className={styles.inlineActionRow}>
                        {selectedBooking.isOta ? (
                          <>
                            <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection("connected-channels")}>
                              Check channels
                            </button>
                            <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection("conflicts")}>
                              View conflicts
                            </button>
                            <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection("sync-logs")}>
                              View sync logs
                            </button>
                          </>
                        ) : (
                          <span className={styles.filterChip}>
                            Direct-booking host actions stay in the existing Famlo booking flow.
                          </span>
                        )}
                      </div>
                    </aside>
                  </div>
                ) : null}

                <div className={styles.listGrid}>
                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Advanced booking diagnostics</div>
                    <div className={styles.feedCopy}>
                      Technical OTA import and acknowledgement details remain available below for operator review without changing the host-friendly bookings list above.
                    </div>
                  </article>
                </div>

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
              </div>
            </section>
          )}

          {activeSection === "messages-reviews" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Messages</h3>
                  <p className={styles.cardCopy}>
                    Messages for this property. The existing working Famlo host inbox is embedded below, while OTA threads and
                    review workflows stay in a later phase.
                  </p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.listGrid}>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Live inbox</div>
                    <div className={styles.metricValue}>Embedded</div>
                    <div className={styles.metricHint}>
                      Guest messaging continues to use the same working Famlo host inbox and existing conversation APIs.
                    </div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>What stays for later</div>
                    <div className={styles.metricValue}>OTA threads later</div>
                    <div className={styles.metricHint}>
                      OTA guest threads, review ingestion, and response queues are not being introduced in this safe pilot phase.
                    </div>
                  </article>
                </div>

                {hostUserId ? (
                  <div className={styles.listCard} style={{ padding: 0, overflow: "hidden" }}>
                    <MessagesTab
                      familyId={familyId}
                      hostUserId={hostUserId}
                      activeFamily={{ property_name: propertyName }}
                      initialConversationId={activeMessageConversationId}
                      setActiveConversationId={setActiveMessageConversationId}
                    />
                  </div>
                ) : (
                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Messages are being upgraded</div>
                    <div className={styles.feedCopy}>
                      We could not safely resolve the authenticated host inbox in this Pro session, so use the working Basic inbox below.
                    </div>
                  </article>
                )}

                <div className={styles.listGrid}>
                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Fallback inbox access</div>
                    <div className={styles.stack}>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Use the existing Famlo host inbox</div>
                        <div className={styles.feedCopy}>
                          If you ever need the original host messaging page, this link still opens the same working inbox for the current property.
                        </div>
                      </div>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Urgent guest communication</div>
                        <div className={styles.feedCopy}>
                          If a host needs something immediately, use booking details and the current Famlo inbox instead of waiting
                          for a Pro-only inbox.
                        </div>
                      </div>
                    </div>
                    <div className={styles.inlineActionRow}>
                      <Link
                        href={`/partnerslogin/home/dashboard?tab=messages&family=${encodeURIComponent(familyId)}`}
                        className={styles.primaryActionLink}
                      >
                        Open Messages
                      </Link>
                      <Link href={basicDashboardUrl} className={styles.secondaryActionLink}>
                        Open Basic Dashboard
                      </Link>
                    </div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Why this is safer</div>
                    <div className={styles.stack}>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>No new messaging backend</div>
                        <div className={styles.feedCopy}>
                          Pro now avoids pretending a separate inbox exists when the live, working conversation UI is still the Basic host inbox.
                        </div>
                      </div>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>No broken host trust</div>
                        <div className={styles.feedCopy}>
                          Hosts see one clear path for guest communication instead of a placeholder that looks like a broken feature.
                        </div>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            </section>
          )}

          {activeSection === "revenue" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Revenue</h3>
                  <p className={styles.cardCopy}>
                    Revenue for this property. This view shows booking value and payment status from existing reservations. Final payouts and settlements will be added later.
                  </p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.listGrid}>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Total booking value</div>
                    <div className={styles.metricValue}>{formatCurrency(totalBookingValue)}</div>
                    <div className={styles.metricHint}>Combined booking value from all visible reservations in the current Pro workspace.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Famlo direct value</div>
                    <div className={styles.metricValue}>{formatCurrency(famloDirectBookingValue)}</div>
                    <div className={styles.metricHint}>Booking value currently coming from direct Famlo reservations.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>OTA value</div>
                    <div className={styles.metricValue}>{formatCurrency(otaBookingValue)}</div>
                    <div className={styles.metricHint}>Booking value currently linked to OTA or Booking.com reservations.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Confirmed value</div>
                    <div className={styles.metricValue}>{formatCurrency(confirmedBookingValue)}</div>
                    <div className={styles.metricHint}>Reservations already confirmed, checked in, or completed.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Pending / awaiting payment</div>
                    <div className={styles.metricValue}>{formatCurrency(pendingBookingValue)}</div>
                    <div className={styles.metricHint}>Value still sitting in pending approval or awaiting-payment bookings.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Cancelled value</div>
                    <div className={styles.metricValue}>{formatCurrency(cancelledBookingValue)}</div>
                    <div className={styles.metricHint}>Cancelled reservation value is shown for visibility only, not as final payout.</div>
                  </article>
                </div>

                <div className={styles.listGrid}>
                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Revenue notes</div>
                    <div className={styles.stack}>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Booking value, not final payout</div>
                        <div className={styles.feedCopy}>These figures come from current booking amounts only. They do not represent final payout, settlement, refund, or commission calculations.</div>
                      </div>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Estimated host earning</div>
                        <div className={styles.feedCopy}>Coming later. The current Pro shell does not invent payout numbers when commission, payout timing, or settlement state cannot be derived safely.</div>
                      </div>
                    </div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Payment status snapshot</div>
                    <div className={styles.roomReadinessRow}>
                      <span className={styles.readinessPill}>Confirmed bookings: {confirmedBookingsCount}</span>
                      <span className={styles.readinessPill}>Pending approvals: {pendingApprovalBookingsCount}</span>
                      <span className={styles.readinessPill}>Action needed: {actionNeededBookingsCount}</span>
                      <span className={styles.readinessPill}>Cancelled: {cancelledBookingsCount}</span>
                    </div>
                  </article>
                </div>

                {proBookings.length > 0 ? (
                  <div className={styles.mappingTable}>
                    <div className={styles.mappingHeader}>Source</div>
                    <div className={styles.mappingHeader}>Guest / Room</div>
                    <div className={styles.mappingHeader}>Date</div>
                    <div className={styles.mappingHeader}>Amount</div>
                    <div className={styles.mappingHeader}>Payment status</div>
                    <div className={styles.mappingHeader}>Booking status</div>
                    {proBookings.map((booking) => (
                      <Fragment key={`revenue-${booking.bookingId}`}>
                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>{booking.sourceLabel}</div>
                          <div className={styles.mappingSubcopy}>{booking.isOta ? "OTA reservation" : "Famlo direct reservation"}</div>
                        </div>
                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>{booking.guestDisplayName}</div>
                          <div className={styles.mappingSubcopy}>{booking.roomName}</div>
                        </div>
                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>{booking.startDate} → {booking.endDate}</div>
                          <div className={styles.mappingSubcopy}>Created {formatDateTime(booking.createdAt)}</div>
                        </div>
                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>{booking.amount ?? "Not available"}</div>
                          <div className={styles.mappingSubcopy}>Booking value</div>
                        </div>
                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>{labelizeToken(booking.paymentStatus, "unknown")}</div>
                          <div className={styles.mappingSubcopy}>Current payment state only</div>
                        </div>
                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>{labelizeToken(booking.status, "unknown")}</div>
                          <div className={styles.mappingSubcopy}>{bookingHealthLabel(booking)}</div>
                        </div>
                      </Fragment>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyTitle}>No booking value to summarize yet</div>
                    <div className={styles.emptyCopy}>
                      Once this property has direct or OTA reservations, their booking value and payment-status summary will appear here.
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeSection === "reports" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Reports</h3>
                  <p className={styles.cardCopy}>
                    Reports for this property. Use these early insights to understand bookings, source mix, and room activity. Advanced occupancy, ADR, RevPAR, and monthly exports will come later.
                  </p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.listGrid}>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Total bookings</div>
                    <div className={styles.metricValue}>{totalBookingsCount}</div>
                    <div className={styles.metricHint}>All current direct and OTA reservations surfaced in Pro.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Direct vs OTA mix</div>
                    <div className={styles.metricValue}>{famloDirectBookingsCount} / {otaBookingsCount}</div>
                    <div className={styles.metricHint}>Direct first, OTA second, based on the current unified bookings workspace.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Active rooms</div>
                    <div className={styles.metricValue}>{rooms.filter((room) => room.isActive).length}</div>
                    <div className={styles.metricHint}>Rooms currently marked active in the selected property inventory.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Occupied / blocked cells</div>
                    <div className={styles.metricValue}>{occupiedOrBlockedCalendarCells}</div>
                    <div className={styles.metricHint}>Calendar cells currently occupied or manually blocked in the visible Pro window.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Cancelled bookings</div>
                    <div className={styles.metricValue}>{cancelledBookingsCount}</div>
                    <div className={styles.metricHint}>Reservations currently carrying cancelled or rejected state.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Action-needed bookings</div>
                    <div className={styles.metricValue}>{actionNeededBookingsCount}</div>
                    <div className={styles.metricHint}>Bookings that still need approval, OTA review, payment attention, or sync follow-up.</div>
                  </article>
                </div>

                <div className={styles.listGrid}>
                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Pilot performance snapshot</div>
                    <div className={styles.placeholderGrid}>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderTitle}>Average booking value</div>
                        <div className={styles.placeholderValue}>{averageBookingValue != null ? formatCurrency(averageBookingValue) : "Not available"}</div>
                        <div className={styles.placeholderCopy}>Calculated only from bookings where a safe booking-value amount is already visible.</div>
                      </div>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderTitle}>Top room by booking count</div>
                        <div className={styles.placeholderValue}>{topRoomByBookingCount ? topRoomByBookingCount[0] : "Not available"}</div>
                        <div className={styles.placeholderCopy}>
                          {topRoomByBookingCount
                            ? `${topRoomByBookingCount[1]} booking${topRoomByBookingCount[1] === 1 ? "" : "s"} currently surfaced for this room.`
                            : "No booking mix is available yet for room ranking."}
                        </div>
                      </div>
                    </div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>What this report covers today</div>
                    <div className={styles.stack}>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Bookings and source mix</div>
                        <div className={styles.feedCopy}>This shell reports on direct versus OTA booking mix, room activity, and visible calendar usage using existing Pro data only.</div>
                      </div>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Advanced reporting comes later</div>
                        <div className={styles.feedCopy}>ADR, RevPAR, occupancy trends, monthly exports, and finance-grade settlement reporting are intentionally out of scope in this pilot phase.</div>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            </section>
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
                  <h3 className={styles.cardTitle}>Content & Photos</h3>
                  <p className={styles.cardCopy}>
                    This content shapes how this property appears on Famlo and prepares it for OTA channels.
                  </p>
                </div>
                <span className={`${styles.badge} ${styles.badgeMuted}`}>No provider sync yet</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.listGrid}>
                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Property content summary</div>
                    <div className={styles.placeholderGrid}>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderTitle}>Property title</div>
                        <div className={styles.placeholderValue}>{propertyName}</div>
                        <div className={styles.placeholderCopy}>{propertyLocalityLabel ?? locationLabel}</div>
                      </div>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderTitle}>Story / vibe</div>
                        <div className={styles.placeholderValue}>{initialSettings.propertyDescription ? "Available" : "Needs review"}</div>
                        <div className={styles.placeholderCopy}>
                          {initialSettings.propertyDescription
                            ? initialSettings.propertyDescription
                            : "Add a strong property description so this property feels complete on Famlo and OTA channels."}
                        </div>
                      </div>
                    </div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Readiness snapshot</div>
                    <div className={styles.roomReadinessRow}>
                      <span className={`${styles.readinessPill} ${contentStatusClass(propertyContentReadyCount, propertyContentChecks.length)}`}>
                        Property content: {propertyContentReadyCount}/{propertyContentChecks.length}
                      </span>
                      <span className={`${styles.readinessPill} ${contentStatusClass(contactReadyCount, contactChecks.length)}`}>
                        Contact details: {contactReadyCount}/{contactChecks.length}
                      </span>
                      <span className={`${styles.readinessPill} ${contentStatusClass(locationReadyCount, locationChecks.length)}`}>
                        Location: {locationReadyCount}/{locationChecks.length}
                      </span>
                      <span className={`${styles.readinessPill} ${contentStatusClass(policyReadyCount, policyChecks.length)}`}>
                        Policies: {policyReadyCount}/{policyChecks.length}
                      </span>
                      <span className={`${styles.readinessPill} ${contentStatusClass(photosReadiness.readyRooms, Math.max(rooms.length, 1))}`}>
                        Photos ready: {photosReadiness.readyRooms}/{rooms.length || 0}
                      </span>
                    </div>
                    <div className={styles.feedCopy}>
                      Use this tab for property content and OTA-ready details. Room-level photos and prices continue to come from Rooms.
                    </div>
                  </article>
                </div>

                <section className={styles.cardInset}>
                  <div className={styles.listTitle}>Content &amp; Photos for this property</div>
                  <div className={styles.feedCopy} style={{ marginBottom: "16px" }}>
                    Use this to shape how this property appears on Famlo. For multi-property hosts, each property can have its own story, vibe, and gallery.
                  </div>

                  {familyId ? (
                    <PropertyContentManager
                      familyId={familyId}
                      listing={propertyContent}
                      setListing={setPropertyContent}
                      photos={propertyGallery}
                      setPhotos={setPropertyGallery}
                      onSave={handleSavePropertyContent}
                      saving={propertyContentSaving}
                    />
                  ) : (
                    <div className={styles.feedbackBox}>
                      No selected property was found, so property content editing is unavailable right now.
                    </div>
                  )}

                  {propertyContentFeedback ? (
                    <div className={`${styles.feedbackBox} ${propertyContentFeedback.type === "error" ? styles.feedbackError : styles.feedbackSuccess}`}>
                      {propertyContentFeedback.text}
                    </div>
                  ) : null}
                </section>

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
              const location = [option.locality, option.city, option.state, option.country].filter(Boolean).join(", ");
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
