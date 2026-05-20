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
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

import HostRoomsManager from "@/components/partners/rooms/HostRoomsManager";
import PropertyContentManager from "@/components/partners/property/PropertyContentManager";
import ChannelSetupWizard, {
  type ChannelSetupWizardSummary,
} from "@/components/partners/pro/ChannelSetupWizard";
import MessagesTab from "@/components/partners/tabs/MessagesTab";
import type { PhotoItem } from "@/components/partners/HostDashboardEditor";
import {
  CHANNEL_PROVIDER_REGISTRY,
  getChannelProviderDefinition,
  type ChannelProviderKey,
} from "@/lib/channel-providers/provider-registry";
import { resolveProviderFromOtaName } from "@/lib/channel-providers/provider-capabilities";
import { getProviderMutationPrimitiveAudit } from "@/lib/channel-providers/provider-mutation-primitives";
import {
  createDefaultChannelSetupState,
  buildChannelReadinessModel,
  buildChannelGoLiveReadinessModel,
  buildChannelTestSyncReadinessModel,
  getChannelSetupStatusLabel,
  readChannelSetupState,
  type ChannelReadinessModel,
  type ChannelGoLiveReadinessModel,
  type ChannelTestSyncReadinessModel,
  type ChannelSetupState,
} from "@/lib/channel-setup-state";
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
import { isHostBookingVisibleToPartner } from "@/lib/host-booking-state";
import styles from "./pro-dashboard.module.css";

type ProSectionId =
  | "dashboard"
  | "host-profile"
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

type CalendarRateCell = {
  date: string;
  displayValue: string;
  amount: number | null;
  baseAmount: number;
  isPast: boolean;
  isOverridden: boolean;
};

type CalendarRateOverrideState = {
  amount: number | null;
  displayValue: string;
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
  createdAt: string | null;
  guestDisplayName: string;
  status: string;
  paymentStatus: string | null;
  amount: string | null;
  netPayoutAmount: number | null;
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

type BookingDateFilter = "Check-in" | "Check-out" | "Booking Dates" | "Staying Today";

type RevenueWindowFilter = "Today" | "This week" | "This month" | "All time";
type ReportWindowFilter = "This week" | "This month" | "This year";

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
  activeRoomCount: number;
};

type HostProfileSummary = {
  hostName: string;
  accountLabel: string | null;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  sharedIdentityNote: string;
  selectedPropertyName: string;
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
  isAdminView: boolean;
  hostUserId: string | null;
  hostProfile: HostProfileSummary;
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
  feedItems: FeedItem[];
  basicDashboardUrl: string;
  basicRoomUrl: string;
  initialPropertyContent: PropertyContentDraft;
  propertyPhotos: PhotoItem[];
  initialSettings: HostProSettings;
  channelFoundation: HostProChannelFoundation;
  channexConfig: ChannexSummary;
  globalCommission: number;
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
  | "host-profile"
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

type ChannelCardSummary = {
  key: ChannelProviderKey;
  status: string;
  nextStep: string;
  roomStatus: string;
  priceStatus: string;
  calendarStatus: string;
  testSyncStatus: string;
  goLiveStatus: string;
  goLiveNextStep: string;
  cta: string;
  setupModeLabel: string;
  roomSupportLabel: string;
  priceSupportLabel: string;
  calendarSupportLabel: string;
  progressPercent: number;
  warningLabel: string | null;
};

type ChannelMatchingRoomRow = {
  famloRoomName: string;
  famloRoomType: string;
  isActive: boolean;
  basePriceLabel: string;
  photoReadinessLabel: string;
  providerRoomLabel: string;
  statusLabel: "matched" | "needs match" | "provider room unavailable" | "needs channel connection";
  note: string | null;
};

type ChannelMatchingRateRow = {
  famloRoomName: string;
  famloRoomType: string;
  isActive: boolean;
  basePriceLabel: string;
  providerRateLabel: string;
  statusLabel: "matched" | "needs match" | "provider rate unavailable" | "needs channel connection";
  note: string | null;
};

type ChannelMatchingSnapshot = {
  providerDataAvailable: boolean;
  providerDataLabel: string;
  roomRows: ChannelMatchingRoomRow[];
  rateRows: ChannelMatchingRateRow[];
  reviewLabel: string;
};

type ChannelTestSyncSnapshot = ChannelTestSyncReadinessModel;
type ChannelGoLiveSnapshot = ChannelGoLiveReadinessModel;

type ChannelOperatorReviewRow = {
  providerKey: ChannelProviderKey;
  providerName: string;
  propertyName: string;
  providerReference: string;
  setupStatus: string;
  goLiveStatus: string;
  reviewRequested: string;
  requestedAt: string;
  testSyncRequested: string;
  testSyncRequestedAt: string;
  roomMatchingStatus: string;
  priceMatchingStatus: string;
  testSyncStatus: string;
  blockers: string[];
  nextAction: string;
};

const TOP_LEVEL_NAV_ITEMS: NavItem[] = [
  { id: "dashboard", title: "Dashboard", hint: "Action center", icon: Activity },
  { id: "host-profile", title: "Host Profile", hint: "Shared host identity", icon: UserRound },
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
  ["host-profile", "host-profile"],
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
    { id: "details", title: "Details", description: "Room details, photos, occupancy, amenities, and Famlo room settings." },
    { id: "pricing", title: "Pricing", description: "Editable Famlo room pricing using the existing room save flow." },
    { id: "calendar", title: "Calendar", description: "Availability visibility for this room inside the property calendar." },
    { id: "channels", title: "Channels", description: "Connected channel readiness for this room." },
    { id: "mapping", title: "Room & Price Matching", description: "Room and price matching status for connected channels." },
    { id: "sync-health", title: "Issues & Sync Status", description: "Room issues, channel readiness, and advanced sync links." },
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
  if (target === "host-profile") return "host-profile";
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
const BOOKING_DATE_FILTERS: BookingDateFilter[] = ["Check-in", "Check-out", "Booking Dates", "Staying Today"];
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
  { key: "ari", title: "ARI push", actions: ["push_ari_30_day", "push_ari_365_day", "push_ari_limited_test"] },
  { key: "booking-feed", title: "Booking feed / list", actions: ["fetch_booking_feed", "poll_booking_feed_cron", "store_booking_feed_preview", "verify_booking_list", "verify_booking_revision_visibility"] },
  { key: "booking-import", title: "Booking import", actions: ["import_booking_preview", "apply_booking_modification", "mark_assisted_go_live_ready"] },
  { key: "ack", title: "Acknowledgement", actions: ["acknowledge_booking_revision"] },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCalendarCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
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

function formatShortDate(dateValue: string): string {
  const value = new Date(`${dateValue}T12:00:00+05:30`);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(value);
}

function formatMonthLong(dateValue: string): string {
  const value = new Date(`${dateValue}T12:00:00+05:30`);
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(value);
}

function isoDateFromLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthShort(dateValue: string): string {
  const value = new Date(`${dateValue}T12:00:00+05:30`);
  return new Intl.DateTimeFormat("en-IN", { month: "short" }).format(value);
}

function formatWeekdayShort(dateValue: string): string {
  const value = new Date(`${dateValue}T12:00:00+05:30`);
  return new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(value);
}

function shiftLocalDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildSvgLinePath(values: number[], width: number, height: number, maxValue: number): string {
  if (values.length === 0) return "";
  const safeMax = Math.max(maxValue, 1);
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / safeMax) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
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

  if (section === "host-profile") {
    return {
      eyebrow: "Workspace",
      title: "Host Profile",
      copy: "Shared host identity for the Famlo Pro workspace across all properties owned by this host.",
      status: "View only",
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
  isAdminView,
  hostUserId,
  hostProfile,
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
  feedItems,
  basicDashboardUrl,
  basicRoomUrl,
  initialPropertyContent,
  propertyPhotos,
  initialSettings,
  channelFoundation,
  channexConfig,
  globalCommission,
  proBookings,
  calendarColumns,
  calendarRows,
  calendarWindow,
  calendarVerification,
}: Readonly<FamloProDashboardShellProps>): React.JSX.Element {
  const getCalendarRateOverrideKey = (roomId: string, date: string): string => `${roomId}:${date}`;
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<ProSectionId>(initialSection);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(roomRouteState?.roomId ?? rooms[0]?.id ?? null);
  const [roomEditorTab, setRoomEditorTab] = useState<RoomEditorTabId>("details");
  const [propertyContent, setPropertyContent] = useState<PropertyContentDraft>(initialPropertyContent);
  const [propertyGallery, setPropertyGallery] = useState<PhotoItem[]>(propertyPhotos);
  const [propertyContentSaving, startPropertyContentSaving] = useTransition();
  const [isPropertySwitchPending, setIsPropertySwitchPending] = useState(false);
  const [isSidebarLogoBroken, setIsSidebarLogoBroken] = useState(false);
  const [pendingPropertyLabel, setPendingPropertyLabel] = useState<string | null>(null);
  const [propertyContentFeedback, setPropertyContentFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedCalendarBooking, setSelectedCalendarBooking] = useState<CalendarBookingDetail | null>(null);
  const [calendarActionFeedback, setCalendarActionFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [bulkCalendarFeedback, setBulkCalendarFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [calendarActionDate, setCalendarActionDate] = useState<string | null>(null);
  const [isCalendarActionPending, startCalendarAction] = useTransition();
  const [selectedCalendarRateCell, setSelectedCalendarRateCell] = useState<{
    roomId: string;
    roomName: string;
    date: string;
    displayValue: string;
    amount: number | null;
    baseAmount: number;
    isOverridden: boolean;
  } | null>(null);
  const [calendarRateDraft, setCalendarRateDraft] = useState("");
  const [calendarRateFeedback, setCalendarRateFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [calendarRateActionDate, setCalendarRateActionDate] = useState<string | null>(null);
  const [calendarRateOverrides, setCalendarRateOverrides] = useState<Record<string, CalendarRateOverrideState>>({});
  const [isCalendarRatePending, startCalendarRateTransition] = useTransition();
  const [bulkCalendarDraft, setBulkCalendarDraft] = useState<{
    roomId: string;
    applyToAllRooms: boolean;
    dateFrom: string;
    dateTo: string;
    availabilityAction: "none" | "block" | "unblock";
    rateAmount: string;
    minStay: string;
    minStayArrival: string;
    maxStay: string;
    cta: "unchanged" | "true" | "false";
    ctd: "unchanged" | "true" | "false";
    stopSell: "unchanged" | "true" | "false";
  }>(() => ({
    roomId: rooms[0]?.id ?? "",
    applyToAllRooms: false,
    dateFrom: calendarWindow.startDate,
    dateTo: calendarWindow.startDate,
    availabilityAction: "none",
    rateAmount: "",
    minStay: "",
    minStayArrival: "",
    maxStay: "",
    cta: "unchanged",
    ctd: "unchanged",
    stopSell: "unchanged",
  }));
  const [isBulkCalendarPending, startBulkCalendarTransition] = useTransition();
  const [isCalendarJumpPending, startCalendarJumpTransition] = useTransition();
  const [bookingFilter, setBookingFilter] = useState<BookingWorkspaceFilter>("All");
  const [bookingDateFilter, setBookingDateFilter] = useState<BookingDateFilter>("Check-in");
  const [revenueWindow, setRevenueWindow] = useState<RevenueWindowFilter>("This month");
  const [reportWindow, setReportWindow] = useState<ReportWindowFilter>("This month");
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [bookingActionFeedback, setBookingActionFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [activeMessageConversationId, setActiveMessageConversationId] = useState<string | null>(null);
  const [activeChannelSetup, setActiveChannelSetup] = useState<ChannelProviderKey | null>(null);
  const [selectedChannelToAdd, setSelectedChannelToAdd] = useState<ChannelProviderKey>("booking");
  const [channelSetupOverrides, setChannelSetupOverrides] = useState<Partial<Record<ChannelProviderKey, ChannelSetupState>>>({});
  const [timeAnchor] = useState(() => Date.now());
  const initialCalendarDate = new Date(`${calendarWindow.startDate}T12:00:00+05:30`);
  const [calendarJumpMonth, setCalendarJumpMonth] = useState(String(initialCalendarDate.getMonth() + 1).padStart(2, "0"));
  const [calendarJumpYear, setCalendarJumpYear] = useState(String(initialCalendarDate.getFullYear()));
  useEffect(() => {
    setChannelSetupOverrides({});
    setCalendarActionFeedback(null);
    setBulkCalendarFeedback(null);
    setCalendarActionDate(null);
    setCalendarRateFeedback(null);
    setCalendarRateActionDate(null);
    setCalendarRateOverrides({});
    setSelectedCalendarRateCell(null);
  }, [familyId]);
  useEffect(() => {
    const nextDate = new Date(`${calendarWindow.startDate}T12:00:00+05:30`);
    setCalendarJumpMonth(String(nextDate.getMonth() + 1).padStart(2, "0"));
    setCalendarJumpYear(String(nextDate.getFullYear()));
    setBulkCalendarDraft((current) => ({
      ...current,
      roomId: current.roomId || rooms[0]?.id || "",
      applyToAllRooms: current.roomId === "__all__" ? current.applyToAllRooms : false,
      dateFrom: calendarWindow.startDate,
      dateTo: calendarWindow.startDate,
    }));
    setBulkCalendarFeedback(null);
  }, [calendarWindow.startDate]);
  const activeTopLevel = resolveTopLevelSection(activeSection);
  const activePropertyTab = resolvePropertyTab(activeSection);
  const activePropertyTabLinks = PROPERTY_TAB_SECTION_LINKS[activePropertyTab];
  const isPropertiesHomeView = activeSection === "properties-home" && !roomRouteState;
  const currentPropertyOption = propertyOptions.find((option) => option.familyId === familyId) ?? null;
  const calendarJumpYearOptions = Array.from({ length: 5 }, (_, index) => String(initialCalendarDate.getFullYear() - 1 + index));
  const calendarJumpMonthOptions = Array.from({ length: 12 }, (_, index) => {
    const monthValue = String(index + 1).padStart(2, "0");
    return {
      value: monthValue,
      label: new Intl.DateTimeFormat("en-IN", { month: "long" }).format(new Date(`2026-${monthValue}-01T12:00:00+05:30`)),
    };
  });
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0] ?? null;
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const showChannelOperatorDiagnostics = isAdminView;
  const simplePropertiesHref = `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(familyId)}&section=properties-home`;
  const hostWorkspacePropertyCount = propertyOptions.length;
  const hostProfilePhotoUrl = hostProfile.photoUrl;
  const sharedHostContactLabel = hostProfile.email ?? hostProfile.phone ?? "Saved in the current host account";

  const switchPropertyContext = (nextFamilyId: string, options?: { section?: ProSectionId }): void => {
    const normalizedFamilyId = nextFamilyId.trim();
    if (!normalizedFamilyId || normalizedFamilyId === familyId) return;
    const nextOption = propertyOptions.find((option) => option.familyId === normalizedFamilyId) ?? null;
    setPendingPropertyLabel(nextOption?.name ?? "Selected property");
    setIsPropertySwitchPending(true);
    router.push(
      `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(normalizedFamilyId)}&section=${encodeURIComponent(
        options?.section ?? "properties-home"
      )}`
    );
  };

  const handleCalendarCellAction = (cell: CalendarCell, roomId: string, roomName: string): void => {
    if (cell.status === "past") return;

    if (cell.bookingDetail) {
      setSelectedCalendarBooking(cell.bookingDetail);
      return;
    }

    if (cell.status !== "available" && cell.status !== "manual_block") {
      return;
    }

    const action = cell.status === "manual_block" ? "unblock" : "block";
    setCalendarActionFeedback(null);
    setCalendarActionDate(cell.date);

    startCalendarAction(async () => {
      try {
        const response = await fetch("/api/host/pro/calendar/manual-block", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId,
            roomId,
            date: cell.date,
            action,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to update the property calendar block.");
        }

        setCalendarActionFeedback({
          type: "success",
          text:
            action === "block"
              ? `Blocked ${cell.date} for ${roomName}.`
              : `Unblocked ${cell.date} for ${roomName}.`,
        });
        router.refresh();
      } catch (error) {
        setCalendarActionFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to update the property calendar block.",
        });
      } finally {
        setCalendarActionDate(null);
      }
    });
  };

  const handleCalendarRateCellAction = (cell: CalendarRateCell, row: CalendarRow): void => {
    if (cell.isPast) return;
    setCalendarActionFeedback(null);
    setCalendarRateFeedback(null);
    setBulkCalendarFeedback(null);
    setSelectedCalendarRateCell({
      roomId: row.roomId,
      roomName: row.roomName,
      date: cell.date,
      displayValue: cell.displayValue,
      amount: cell.amount,
      baseAmount: cell.baseAmount,
      isOverridden: cell.isOverridden,
    });
    setCalendarRateDraft(cell.amount != null && cell.amount > 0 ? String(cell.amount) : cell.baseAmount > 0 ? String(cell.baseAmount) : "");
  };

  const goToCalendarStart = (nextCalendarStart: string): void => {
    startCalendarJumpTransition(() => {
      router.replace(
        `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(familyId)}&section=inventory-calendar&calendarStart=${encodeURIComponent(nextCalendarStart)}`
      );
      router.refresh();
    });
  };

  const handleCalendarJump = (): void => {
    const nextCalendarStart = `${calendarJumpYear}-${calendarJumpMonth}-01`;
    goToCalendarStart(nextCalendarStart);
  };

  const handleCalendarToday = (): void => {
    const today = new Date();
    const todayIsoDate = isoDateFromLocalDate(today);
    setCalendarJumpMonth(String(today.getMonth() + 1).padStart(2, "0"));
    setCalendarJumpYear(String(today.getFullYear()));
    goToCalendarStart(todayIsoDate);
  };

  const submitCalendarRate = (action: "save" | "reset"): void => {
    if (!selectedCalendarRateCell) return;
    const parsedAmount = Number(calendarRateDraft);
    if (action === "save" && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
      setCalendarRateFeedback({ type: "error", text: "Enter a valid positive daily rate." });
      return;
    }

    setCalendarRateFeedback(null);
    setCalendarRateActionDate(selectedCalendarRateCell.date);

    startCalendarRateTransition(async () => {
      try {
        const response = await fetch("/api/host/pro/calendar/manual-rate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId,
            roomId: selectedCalendarRateCell.roomId,
            date: selectedCalendarRateCell.date,
            action,
            amount: action === "save" ? parsedAmount : null,
          }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to update daily room rate.");
        }

        setCalendarRateFeedback({
          type: "success",
          text:
            action === "save"
              ? `Saved ${formatCalendarCurrency(parsedAmount)} for ${selectedCalendarRateCell.roomName} on ${formatShortDate(selectedCalendarRateCell.date)}.`
              : `Reset ${selectedCalendarRateCell.roomName} on ${formatShortDate(selectedCalendarRateCell.date)} back to base price.`,
        });
        if (action === "save") {
          setCalendarRateOverrides((current) => ({
            ...current,
            [getCalendarRateOverrideKey(selectedCalendarRateCell.roomId, selectedCalendarRateCell.date)]: {
              amount: parsedAmount,
              displayValue: formatCalendarCurrency(parsedAmount),
              isOverridden: true,
            },
          }));
          setSelectedCalendarRateCell({
            ...selectedCalendarRateCell,
            amount: parsedAmount,
            displayValue: formatCalendarCurrency(parsedAmount),
            isOverridden: true,
          });
          setCalendarRateDraft(String(parsedAmount));
        } else {
          setCalendarRateOverrides((current) => ({
            ...current,
            [getCalendarRateOverrideKey(selectedCalendarRateCell.roomId, selectedCalendarRateCell.date)]: {
              amount: selectedCalendarRateCell.baseAmount > 0 ? selectedCalendarRateCell.baseAmount : null,
              displayValue: selectedCalendarRateCell.baseAmount > 0 ? formatCalendarCurrency(selectedCalendarRateCell.baseAmount) : "Missing",
              isOverridden: false,
            },
          }));
          setSelectedCalendarRateCell({
            ...selectedCalendarRateCell,
            amount: selectedCalendarRateCell.baseAmount > 0 ? selectedCalendarRateCell.baseAmount : null,
            displayValue: selectedCalendarRateCell.baseAmount > 0 ? formatCalendarCurrency(selectedCalendarRateCell.baseAmount) : "Missing",
            isOverridden: false,
          });
          setCalendarRateDraft(
            selectedCalendarRateCell.baseAmount > 0 ? String(selectedCalendarRateCell.baseAmount) : ""
          );
        }
        router.refresh();
      } catch (error) {
        setCalendarRateFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to update daily room rate.",
        });
      } finally {
        setCalendarRateActionDate(null);
      }
    });
  };

  const submitBulkCalendarUpdate = (overrides?: Partial<typeof bulkCalendarDraft>): void => {
    const effectiveDraft = {
      ...bulkCalendarDraft,
      ...overrides,
    };

    const targetRoomIds =
      effectiveDraft.roomId === "__all__"
        ? calendarRows.map((row) => row.roomId)
        : effectiveDraft.roomId
          ? [effectiveDraft.roomId]
          : [];

    const hasRestrictionPayload =
      effectiveDraft.minStay.trim().length > 0 ||
      effectiveDraft.minStayArrival.trim().length > 0 ||
      effectiveDraft.maxStay.trim().length > 0 ||
      effectiveDraft.cta !== "unchanged" ||
      effectiveDraft.ctd !== "unchanged" ||
      effectiveDraft.stopSell !== "unchanged";

    if (targetRoomIds.length === 0) {
      setBulkCalendarFeedback({ type: "error", text: "Select at least one room for the bulk calendar update." });
      return;
    }
    if (effectiveDraft.roomId === "__all__" && !effectiveDraft.applyToAllRooms) {
      setBulkCalendarFeedback({ type: "error", text: "Confirm all-room bulk apply before updating every visible room." });
      return;
    }
    if (!effectiveDraft.dateFrom || !effectiveDraft.dateTo || effectiveDraft.dateTo < effectiveDraft.dateFrom) {
      setBulkCalendarFeedback({ type: "error", text: "Choose a valid bulk date range." });
      return;
    }
    if (
      effectiveDraft.availabilityAction === "none" &&
      effectiveDraft.rateAmount.trim().length === 0 &&
      !hasRestrictionPayload
    ) {
      setBulkCalendarFeedback({ type: "error", text: "Choose at least one bulk rate, availability, or restriction change." });
      return;
    }

    setCalendarActionFeedback(null);
    setBulkCalendarFeedback(null);
    startBulkCalendarTransition(async () => {
      try {
        const response = await fetch("/api/host/pro/calendar/bulk-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId,
            roomIds: targetRoomIds,
            roomScope: effectiveDraft.roomId === "__all__" ? "all" : "single",
            selectedRoomId: effectiveDraft.roomId === "__all__" ? null : effectiveDraft.roomId,
            applyToAllRooms: effectiveDraft.roomId === "__all__" ? effectiveDraft.applyToAllRooms : false,
            dateFrom: effectiveDraft.dateFrom,
            dateTo: effectiveDraft.dateTo,
            rateAction: effectiveDraft.rateAmount.trim().length > 0 ? "save" : null,
            rateAmount: effectiveDraft.rateAmount.trim().length > 0 ? Number(effectiveDraft.rateAmount) : null,
            availabilityAction: effectiveDraft.availabilityAction === "none" ? null : effectiveDraft.availabilityAction,
            restrictions: {
              minStay: effectiveDraft.minStay.trim().length > 0 ? Number(effectiveDraft.minStay) : undefined,
              minStayArrival:
                effectiveDraft.minStayArrival.trim().length > 0 ? Number(effectiveDraft.minStayArrival) : undefined,
              maxStay: effectiveDraft.maxStay.trim().length > 0 ? Number(effectiveDraft.maxStay) : undefined,
              cta:
                effectiveDraft.cta === "unchanged" ? undefined : effectiveDraft.cta === "true",
              ctd:
                effectiveDraft.ctd === "unchanged" ? undefined : effectiveDraft.ctd === "true",
              stopSell:
                effectiveDraft.stopSell === "unchanged" ? undefined : effectiveDraft.stopSell === "true",
            },
          }),
        });
        const payload = (await response.json()) as { error?: string; affectedRoomCount?: number };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to apply bulk calendar update.");
        }

        setCalendarActionFeedback(null);
        setBulkCalendarFeedback({
          type: "success",
          text: `Applied bulk PMS calendar update for ${payload.affectedRoomCount ?? targetRoomIds.length} room(s) and queued Channex sync safely.`,
        });
        router.refresh();
      } catch (error) {
        setCalendarActionFeedback(null);
        setBulkCalendarFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to apply bulk calendar update.",
        });
      }
    });
  };

  const handleHostBookingCancel = async (booking: ProBookingSummary): Promise<void> => {
    if (booking.isOta || cancellingBookingId === booking.bookingId) return;

    try {
      setCancellingBookingId(booking.bookingId);
      setBookingActionFeedback(null);

      const response = await fetch("/api/bookings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-famlo-actor-role": "host" },
        body: JSON.stringify({ bookingId: booking.bookingId, action: "cancel" }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to cancel booking.");
      }

      setBookingActionFeedback({
        type: "success",
        text: `Booking ${booking.bookingId.slice(0, 8)} was cancelled.`,
      });
    } catch (error) {
      setBookingActionFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to cancel booking.",
      });
    } finally {
      setCancellingBookingId(null);
    }
  };

  useEffect(() => {
    setActiveSection(initialSection);
    setPropertyContent(initialPropertyContent);
    setPropertyGallery(propertyPhotos);
    setPropertyContentFeedback(null);
    setBookingFilter("All");
    setExpandedBookingId(null);
    setBookingActionFeedback(null);
    setActiveMessageConversationId(null);
    setRoomEditorTab("details");
    setSelectedRoomId((current) => {
      if (roomRouteState?.mode === "edit" && roomRouteState.roomId && rooms.some((room) => room.id === roomRouteState.roomId)) {
        return roomRouteState.roomId;
      }
      if (current && rooms.some((room) => room.id === current)) return current;
      return rooms[0]?.id ?? null;
    });
    setIsPropertySwitchPending(false);
    setPendingPropertyLabel(null);
  }, [familyId, initialSection, initialPropertyContent, propertyPhotos, roomRouteState, rooms]);

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
  const bookingsTodayIsoDate = isoDateFromLocalDate(new Date());
  const filteredProBookings = proBookings
    .filter((booking) => matchesBookingFilter(booking, bookingFilter))
    .filter((booking) => {
      if (bookingDateFilter !== "Staying Today") return true;
      return booking.startDate <= bookingsTodayIsoDate && booking.endDate >= bookingsTodayIsoDate;
    })
    .sort((left, right) => {
      if (bookingDateFilter === "Check-out") {
        return right.endDate.localeCompare(left.endDate);
      }
      if (bookingDateFilter === "Booking Dates") {
        const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
        const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
        return rightTime - leftTime;
      }
      return right.startDate.localeCompare(left.startDate);
    });
  const bookingsWithValue = proBookings
    .map((booking) => ({ booking, parsedAmount: parseBookingAmount(booking.amount) }))
    .filter((entry): entry is { booking: ProBookingSummary; parsedAmount: number } => entry.parsedAmount != null);
  const bookingsWithNetPayout = proBookings.filter(
    (booking): booking is ProBookingSummary & { netPayoutAmount: number } => booking.netPayoutAmount != null
  );
  const revenueEligibleBookings = bookingsWithNetPayout.filter(
    (booking) =>
      isHostBookingVisibleToPartner(booking.status, booking.paymentStatus) &&
      (
        normalizeToken(booking.paymentStatus) === "paid" ||
        isConfirmedBooking(booking)
      )
  );
  const todayDate = new Date();
  const todayIsoDate = isoDateFromLocalDate(todayDate);
  const weekStartDate = new Date(todayDate);
  weekStartDate.setDate(todayDate.getDate() - todayDate.getDay());
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 6);
  const weekStartIsoDate = isoDateFromLocalDate(weekStartDate);
  const weekEndIsoDate = isoDateFromLocalDate(weekEndDate);
  const currentMonthPrefix = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  })();
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
  const revenueThisMonthNetPayout = bookingsWithNetPayout
    .filter(
      (booking) =>
        isHostBookingVisibleToPartner(booking.status, booking.paymentStatus) &&
        isConfirmedBooking(booking) &&
        booking.startDate.startsWith(currentMonthPrefix)
    )
    .reduce((sum, booking) => sum + booking.netPayoutAmount, 0);
  const revenueTodayBookings = revenueEligibleBookings.filter((booking) => booking.startDate === todayIsoDate);
  const revenueThisWeekBookings = revenueEligibleBookings.filter(
    (booking) => booking.startDate >= weekStartIsoDate && booking.startDate <= weekEndIsoDate
  );
  const revenueTodayNetPayout = revenueTodayBookings.reduce((sum, booking) => sum + booking.netPayoutAmount, 0);
  const revenueThisWeekNetPayout = revenueThisWeekBookings.reduce((sum, booking) => sum + booking.netPayoutAmount, 0);
  const totalNetPayout = revenueEligibleBookings.reduce((sum, booking) => sum + booking.netPayoutAmount, 0);
  const revenueBookingsByWindow: Record<RevenueWindowFilter, typeof revenueEligibleBookings> = {
    Today: revenueTodayBookings,
    "This week": revenueThisWeekBookings,
    "This month": revenueEligibleBookings.filter((booking) => booking.startDate.startsWith(currentMonthPrefix)),
    "All time": revenueEligibleBookings,
  };
  const selectedRevenueBookings = revenueBookingsByWindow[revenueWindow];
  const selectedRevenueNetPayout = selectedRevenueBookings.reduce((sum, booking) => sum + booking.netPayoutAmount, 0);
  const selectedRevenueGrossValue = selectedRevenueBookings.reduce(
    (sum, booking) => sum + (parseBookingAmount(booking.amount) ?? 0),
    0
  );
  const selectedRevenueWindowHint =
    revenueWindow === "Today"
      ? `Payout view for bookings starting on ${formatShortDate(todayIsoDate)}.`
      : revenueWindow === "This week"
        ? `Payout view from ${formatShortDate(weekStartIsoDate)} to ${formatShortDate(weekEndIsoDate)}.`
        : revenueWindow === "This month"
          ? "Payout view for the current month."
          : "Payout view across all eligible visible bookings.";
  const confirmedNetPayout = bookingsWithNetPayout
    .filter((booking) => isConfirmedBooking(booking))
    .reduce((sum, booking) => sum + booking.netPayoutAmount, 0);
  const pendingNetPayout = bookingsWithNetPayout
    .filter((booking) => isPendingApprovalBooking(booking) || normalizeToken(booking.paymentStatus) === "awaiting_payment")
    .reduce((sum, booking) => sum + booking.netPayoutAmount, 0);
  const averageBookingValue = bookingsWithValue.length > 0 ? totalBookingValue / bookingsWithValue.length : null;
  const directAverageBookingValue = (() => {
    const directValues = bookingsWithValue.filter((entry) => !entry.booking.isOta);
    return directValues.length > 0
      ? directValues.reduce((sum, entry) => sum + entry.parsedAmount, 0) / directValues.length
      : null;
  })();
  const otaAverageBookingValue = (() => {
    const otaValues = bookingsWithValue.filter((entry) => entry.booking.isOta);
    return otaValues.length > 0
      ? otaValues.reduce((sum, entry) => sum + entry.parsedAmount, 0) / otaValues.length
      : null;
  })();
  const sourceCountEntries = Object.entries(
    proBookings.reduce<Record<string, number>>((acc, booking) => {
      const key = booking.sourceLabel || (booking.isOta ? "OTA" : "Famlo Direct");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((left, right) => right[1] - left[1]);
  const topSourceByBookingCount = sourceCountEntries[0] ?? null;
  const reportWindowAnchors = (() => {
    const today = new Date();
    if (reportWindow === "This week") {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay());
      return Array.from({ length: 7 }, (_, index) => {
        const date = shiftLocalDays(start, index);
        const iso = isoDateFromLocalDate(date);
        return {
          key: iso,
          label: formatWeekdayShort(iso),
        };
      });
    }

    if (reportWindow === "This month") {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return Array.from({ length: last.getDate() }, (_, index) => {
        const date = shiftLocalDays(first, index);
        const iso = isoDateFromLocalDate(date);
        return {
          key: iso,
          label: String(index + 1),
        };
      });
    }

    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(today.getFullYear(), index, 1);
      const iso = isoDateFromLocalDate(date);
      return {
        key: `${today.getFullYear()}-${String(index + 1).padStart(2, "0")}`,
        label: formatMonthShort(iso),
      };
    });
  })();
  const reportTrendRows = reportWindowAnchors.map((anchor) => {
    const directCount = proBookings.filter((booking) => {
      if (booking.isOta) return false;
      return reportWindow === "This year"
        ? booking.startDate.startsWith(anchor.key)
        : booking.startDate === anchor.key;
    }).length;
    const otaCount = proBookings.filter((booking) => {
      if (!booking.isOta) return false;
      return reportWindow === "This year"
        ? booking.startDate.startsWith(anchor.key)
        : booking.startDate === anchor.key;
    }).length;
    return {
      ...anchor,
      directCount,
      otaCount,
      totalCount: directCount + otaCount,
    };
  });
  const reportMaxCount = reportTrendRows.reduce((max, row) => Math.max(max, row.directCount, row.otaCount, row.totalCount), 0);
  const chartWidth = 640;
  const chartHeight = 220;
  const directTrendPath = buildSvgLinePath(reportTrendRows.map((row) => row.directCount), chartWidth, chartHeight, reportMaxCount);
  const otaTrendPath = buildSvgLinePath(reportTrendRows.map((row) => row.otaCount), chartWidth, chartHeight, reportMaxCount);
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

  const REVENUE_WINDOWS: RevenueWindowFilter[] = ["Today", "This week", "This month", "All time"];
  const REPORT_WINDOWS: ReportWindowFilter[] = ["This week", "This month", "This year"];
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
  const lastLimitedAriSyncLog = channelFoundation.syncLogs.find((log) => log.action === "push_ari_limited_test") ?? null;
  const lastAriSyncLog = lastAri365SyncLog ?? lastAri30SyncLog;
  const ariHealth = computeAriHealthSnapshot(channelFoundation.syncLogs, timeAnchor, channelAriHealth);
  const ariSyncHealthy = ariHealth.statusLabel === "Synced";
  const lastBookingFeedLog = channelFoundation.syncLogs.find((log) => log.action === "fetch_booking_feed") ?? null;
  const lastCreatePropertyLog = channelFoundation.syncLogs.find((log) => log.action === "create_property") ?? null;
  const lastCreateRoomTypeLog = channelFoundation.syncLogs.find((log) => log.action === "create_room_type") ?? null;
  const lastCreateRatePlanLog = channelFoundation.syncLogs.find((log) => log.action === "create_rate_plan") ?? null;
  const lastAssistedGoLiveLog = channelFoundation.syncLogs.find((log) => log.action === "mark_assisted_go_live_ready") ?? null;
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
  const missingRoomMappingNames = activeRooms
    .filter((room) => !roomMappingsByRoomId.get(room.id)?.externalRoomTypeId)
    .map((room) => room.name);
  const missingRatePlanNames = activeRooms
    .filter((room) => !ratePlansByRoomId.get(room.id)?.externalRatePlanId)
    .map((room) => room.name);
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
  const bookingComRoomMatched = activeRoomsCount > 0 && roomMappingsReadyCount >= activeRoomsCount;
  const bookingComPriceMatched = activeRoomsCount > 0 && rateMappingsReadyCount >= activeRoomsCount;
  const bookingComReadyForActivation =
    currentChannelAttached &&
    bookingComRoomMatched &&
    bookingComPriceMatched &&
    !channelHealthNeedsAttention &&
    bookingFeedHealthy &&
    ariSyncHealthy;
  const baseChannelSetupStatesByKey = CHANNEL_PROVIDER_REGISTRY.reduce((acc, provider) => {
    const matchingProperty = channelFoundation.properties.find((property) => property.providerCode === provider.key) ?? null;
    acc[provider.key] = matchingProperty
      ? readChannelSetupState(matchingProperty)
      : createDefaultChannelSetupState(familyId, provider.key);
    return acc;
  }, {} as Record<ChannelProviderKey, ChannelSetupState>);
  const channelSetupStatesByKey = {
    ...baseChannelSetupStatesByKey,
    ...channelSetupOverrides,
  };
  const bookingSetupState = channelSetupStatesByKey.booking;
  const bookingSetupModeLabel =
    bookingSetupState.setupMode === "existing_listing"
      ? "Existing listing"
      : bookingSetupState.setupMode === "prepare_listing"
        ? "Prepare listing"
        : "Not chosen yet";
  const bookingConnectionStatus = bookingSetupState.metadata.booking_connection_status;
  const bookingComChannelStatus = currentChannelAttached
    ? channelHealthNeedsAttention || !bookingComRoomMatched || !bookingComPriceMatched
      ? "Needs review"
      : "Connected"
    : bookingConnectionStatus === "channel_visible_in_channex"
      ? "Channel detected"
      : bookingConnectionStatus === "verified"
        ? "Verification complete"
        : bookingConnectionStatus === "failed"
          ? "Verification failed"
          : bookingConnectionStatus === "verification_requested"
            ? "Verification requested"
            : bookingSetupState.status === "setup_started" || bookingSetupState.status === "ready_for_test_sync"
              ? "Setup in progress"
              : bookingSetupState.status === "connection_requested"
                ? "Assisted setup requested"
                : bookingSetupState.status === "needs_review"
                  ? "Needs review"
                  : primaryProperty?.externalPropertyId
                    ? "Setup in progress"
                    : "Not started";
  const bookingComNextStep = currentChannelAttached
    ? !bookingComRoomMatched
      ? "Finish room matching before test activation."
      : !bookingComPriceMatched
        ? "Finish price matching before test activation."
        : channelHealthNeedsAttention
          ? "Review the latest sync issue before activation."
          : "Run a test sync and keep activation disabled until the operator review is complete."
    : bookingConnectionStatus === "verified"
      ? "Booking.com connection was verified. Continue with room and price matching."
      : bookingConnectionStatus === "channel_visible_in_channex"
        ? "Booking.com channel is visible in Channex. Continue with room and price matching, then run operator verification."
        : bookingConnectionStatus === "failed"
          ? bookingSetupState.metadata.booking_connection_error ?? "Fix the Booking.com connection details and request verification again."
          : bookingConnectionStatus === "verification_requested"
            ? "Famlo operator verification is pending. Wait for Channex channel confirmation."
            : bookingSetupState.status === "connection_requested"
              ? "Famlo setup help is requested. Continue with safe details once the assisted setup is ready."
              : bookingSetupState.setupMode === "existing_listing"
                ? "Continue the existing Booking.com setup, then match rooms and prices."
                : bookingSetupState.setupMode === "prepare_listing"
                  ? "Prepare the Booking.com listing first, then continue with setup."
                  : primaryProperty?.externalPropertyId
                    ? "Continue the existing Booking.com setup, then match rooms and prices."
                    : "Confirm the Booking.com listing exists before starting setup.";
  const providerHasRealConnection = (providerKey: ChannelProviderKey): boolean => {
    if (providerKey === "booking") {
      return currentChannelAttached || bookingSetupState.metadata.provider_channel_attached === true;
    }
    const state = channelSetupStatesByKey[providerKey];
    return state?.metadata.provider_channel_attached === true;
  };
  const channelReadinessModelsByKey = CHANNEL_PROVIDER_REGISTRY.reduce((acc, provider) => {
    acc[provider.key] = buildChannelReadinessModel(provider.key, channelSetupStatesByKey[provider.key], {
      activeRoomsCount,
      roomMappingsReadyCount,
      rateMappingsReadyCount,
      hasRealConnection: providerHasRealConnection(provider.key),
      channelHealthNeedsAttention,
      bookingReadyForActivation: provider.key === "booking" ? bookingComReadyForActivation : false,
    });
    return acc;
  }, {} as Record<ChannelProviderKey, ChannelReadinessModel>);
  const channelTestSyncReadinessByKey = CHANNEL_PROVIDER_REGISTRY.reduce((acc, provider) => {
    acc[provider.key] = buildChannelTestSyncReadinessModel(provider.key, channelSetupStatesByKey[provider.key], {
      activeRoomsCount,
      roomMappingsReadyCount,
      rateMappingsReadyCount,
      hasRealConnection: providerHasRealConnection(provider.key),
      channelHealthNeedsAttention,
      bookingReadyForActivation: provider.key === "booking" ? bookingComReadyForActivation : false,
      bookingFeedHealthy,
      ariSyncHealthy,
    });
    return acc;
  }, {} as Record<ChannelProviderKey, ChannelTestSyncSnapshot>);
  const channelGoLiveReadinessByKey = CHANNEL_PROVIDER_REGISTRY.reduce((acc, provider) => {
    acc[provider.key] = buildChannelGoLiveReadinessModel(provider.key, channelSetupStatesByKey[provider.key], {
      activeRoomsCount,
      roomMappingsReadyCount,
      rateMappingsReadyCount,
      hasRealConnection: providerHasRealConnection(provider.key),
      channelHealthNeedsAttention,
      bookingReadyForActivation: provider.key === "booking" ? bookingComReadyForActivation : false,
      bookingFeedHealthy,
      ariSyncHealthy,
    });
    return acc;
  }, {} as Record<ChannelProviderKey, ChannelGoLiveSnapshot>);
  const channelOperatorReviewRows: ChannelOperatorReviewRow[] = CHANNEL_PROVIDER_REGISTRY.map((provider) => {
    const setupState = channelSetupStatesByKey[provider.key];
    const readinessModel = channelReadinessModelsByKey[provider.key];
    const testSyncModel = channelTestSyncReadinessByKey[provider.key];
    const goLiveModel = channelGoLiveReadinessByKey[provider.key];
    const reviewRequested = setupState.metadata.go_live_review_requested === true || setupState.status === "review_requested";
    const testSyncRequested = setupState.metadata.test_sync_review_requested === true || setupState.status === "ready_for_test_sync" || setupState.status === "needs_review";
    const requestedAt = setupState.metadata.go_live_review_requested_at ?? setupState.metadata.requested_at ?? setupState.updatedAt ?? setupState.metadata.updated_at ?? null;
    const testSyncRequestedAt = setupState.metadata.test_sync_review_requested_at ?? setupState.metadata.requested_at ?? setupState.updatedAt ?? setupState.metadata.updated_at ?? null;
    const blockerLabels = [
      goLiveModel.nextRequiredAction,
      testSyncModel.nextRequiredAction,
      readinessModel.warningLabel,
    ].filter((item): item is string => Boolean(item));

    return {
      providerKey: provider.key,
      providerName: provider.displayName,
      propertyName: currentPropertyLabel,
      providerReference: [
        setupState.metadata.booking_hotel_id ? `Hotel ID ${setupState.metadata.booking_hotel_id}` : null,
        setupState.metadata.booking_property_code ? `Property code ${setupState.metadata.booking_property_code}` : null,
        setupState.metadata.provider_listing_id ? `Listing ID ${setupState.metadata.provider_listing_id}` : null,
        setupState.metadata.provider_property_code ? `Provider code ${setupState.metadata.provider_property_code}` : null,
        setupState.metadata.provider_listing_url ? "Listing URL saved" : null,
      ].filter(Boolean).join(" · ") || "No safe provider details saved",
      setupStatus: getChannelSetupStatusLabel(setupState.status),
      goLiveStatus: goLiveModel.statusLabel,
      reviewRequested: reviewRequested ? "Yes" : "No",
      requestedAt: requestedAt ? formatDateTime(requestedAt) : "Not requested",
      testSyncRequested: testSyncRequested ? "Yes" : "No",
      testSyncRequestedAt: testSyncRequestedAt ? formatDateTime(testSyncRequestedAt) : "Not requested",
      roomMatchingStatus:
        readinessModel.items[4]?.status === "ready"
          ? "Ready"
          : readinessModel.items[4]?.status === "blocked"
            ? "Blocked"
            : readinessModel.items[4]?.status === "in_progress"
              ? "In progress"
              : readinessModel.items[4]?.status === "needed"
                ? "Needed"
                : "Not available",
      priceMatchingStatus:
        readinessModel.items[5]?.status === "ready"
          ? "Ready"
          : readinessModel.items[5]?.status === "blocked"
            ? "Blocked"
            : readinessModel.items[5]?.status === "in_progress"
              ? "In progress"
              : readinessModel.items[5]?.status === "needed"
                ? "Needed"
                : "Not available",
      testSyncStatus:
        testSyncModel.statusLabel,
      blockers: blockerLabels.length > 0 ? blockerLabels : ["No blockers recorded"],
      nextAction: goLiveModel.nextRequiredAction,
    };
  });
  const channelSetupSummariesByKey = CHANNEL_PROVIDER_REGISTRY.reduce((acc, provider) => {
    const setupState = channelSetupStatesByKey[provider.key];
    const readinessModel = channelReadinessModelsByKey[provider.key];
    const testSyncModel = channelTestSyncReadinessByKey[provider.key];
    const goLiveModel = channelGoLiveReadinessByKey[provider.key];

    if (provider.key === "booking") {
      acc.booking = {
        statusLabel: bookingComChannelStatus,
        nextStep: bookingComNextStep,
        listedOnOtaLabel: bookingSetupState.setupMode === "existing_listing"
          ? "Yes. The property is already listed on Booking.com."
          : bookingSetupState.setupMode === "prepare_listing"
            ? "No. Famlo will prepare the Booking.com listing flow first."
            : currentChannelAttached
              ? "Yes. The current Booking.com staging property is already loaded."
              : "Not yet. Confirm the Booking.com listing exists before connection.",
        requirementsLabel: currentChannelAttached
          ? "The live property data is already loaded, so the remaining work is readiness and review."
          : bookingSetupState.metadata.required_items_acknowledged
            ? "The safe Booking.com requirements were acknowledged and the setup can continue."
            : bookingSetupState.setupMode === "existing_listing"
              ? "The listing exists, but it still needs guided connection details and readiness checks."
              : "Collect the live Booking.com listing details and prepare the property before setup starts.",
        connectionLabel: currentChannelAttached
          ? "Connected property is available in Famlo's loaded readiness view."
          : bookingSetupState.metadata.booking_connection_status === "verified"
            ? "Famlo operator verified the Booking.com connection in Channex. Continue with room and price matching."
            : bookingSetupState.metadata.booking_connection_status === "verification_requested"
              ? "Booking.com verification was requested. Famlo must confirm the Channex-attached channel before matching can begin."
              : bookingSetupState.metadata.booking_connection_status === "failed"
                ? bookingSetupState.metadata.booking_connection_error ?? "Booking.com verification failed. Update the safe connection details and retry."
                : bookingSetupState.status === "connection_requested"
                  ? "Famlo setup help has been requested for the Booking.com connection."
                  : "Connect the existing Booking.com listing through the guided Channex-assisted flow.",
        roomMatchingLabel: currentChannelAttached
          ? activeRoomsCount > 0
            ? `${roomMappingsReadyCount}/${activeRoomsCount} active rooms matched.`
            : "Add at least one active room before matching can begin."
          : bookingSetupState.status === "matching_needed"
            ? "Room matching has been saved and still needs completion."
            : "Add at least one active room before matching can begin.",
        priceMatchingLabel: currentChannelAttached
          ? activeRoomsCount > 0
            ? `${rateMappingsReadyCount}/${activeRoomsCount} active rooms matched for pricing.`
            : "Add pricing before price matching can begin."
          : bookingSetupState.status === "matching_needed"
            ? "Price matching has been saved and still needs completion."
            : "Add pricing before price matching can begin.",
        syncReadinessLabel: testSyncModel.statusLabel,
        testSyncLabel: testSyncModel.statusLabel,
        activationLabel: goLiveModel.statusLabel,
        activationReady: goLiveModel.status === "ready_for_review" || goLiveModel.status === "review_requested" || goLiveModel.status === "live",
        activationBlockedReason: goLiveModel.nextRequiredAction,
        readinessLines: readinessModel.items.map((item) => `${item.label}: ${item.status === "ready" ? "Done" : item.status === "blocked" ? "Blocked" : item.status === "in_progress" ? "In progress" : item.status === "not_available" ? "Not available" : item.status === "needed" ? "Needed" : "Not started"}`),
      };
      return acc;
    }

    const statusLabel = getChannelSetupStatusLabel(setupState.status);
    const setupModeLabel =
      setupState.setupMode === "existing_listing"
        ? "Existing listing"
        : setupState.setupMode === "prepare_listing"
          ? "Prepare listing"
          : provider.setupMode === "self-serve"
            ? "Self-serve"
            : "Assisted setup";

    acc[provider.key] = {
      statusLabel,
      nextStep:
        setupState.status === "connection_requested"
          ? "Famlo setup help has been requested. Continue with safe details once assisted setup is ready."
          : setupState.status === "needs_details"
            ? "Collect the remaining listing details before room and price matching can begin."
            : setupState.status === "matching_needed"
              ? "Match rooms and prices once the provider details are ready."
              : setupState.status === "ready_for_test_sync"
                ? "Run a readiness check before any activation attempt."
                : setupState.status === "needs_review"
                  ? "Review the open issues before proceeding."
                  : setupState.setupMode === "existing_listing"
                    ? "Continue setup from the existing listing details."
                    : setupState.setupMode === "prepare_listing"
                      ? "Prepare the listing before starting provider setup."
                      : provider.setupMode === "self-serve"
                        ? "Authorize the provider and confirm the listing before room matching."
                        : "Prepare the provider details before Famlo can continue setup.",
      listedOnOtaLabel:
        readinessModel.items[0]?.explanation ?? "Confirm whether the listing already exists before setup begins.",
      requirementsLabel:
        readinessModel.items[1]?.explanation ?? "The provider still needs the safe requirements below before activation can proceed.",
      connectionLabel:
        readinessModel.items[2]?.explanation ?? provider.connectionMode,
      roomMatchingLabel:
        readinessModel.items[4]?.explanation ?? "Room matching is supported after setup.",
      priceMatchingLabel:
        readinessModel.items[5]?.explanation ?? "Price matching is supported after setup.",
      syncReadinessLabel:
        testSyncModel.statusLabel,
      testSyncLabel: testSyncModel.statusLabel,
      activationLabel: goLiveModel.statusLabel,
      activationReady: goLiveModel.status === "ready_for_review" || goLiveModel.status === "review_requested" || goLiveModel.status === "live",
      activationBlockedReason: goLiveModel.nextRequiredAction,
      readinessLines: readinessModel.items.map((item) => `${item.label}: ${item.status}`),
    };

    return acc;
  }, {} as Record<ChannelProviderKey, ChannelSetupWizardSummary>);
  const channelProviderCards: ChannelCardSummary[] = CHANNEL_PROVIDER_REGISTRY.map((provider) => {
    const summary = channelSetupSummariesByKey[provider.key];
    const setupState = channelSetupStatesByKey[provider.key];
    const readinessModel = channelReadinessModelsByKey[provider.key];
    const testSyncModel = channelTestSyncReadinessByKey[provider.key];
    const goLiveModel = channelGoLiveReadinessByKey[provider.key];
    const mutationAudit = getProviderMutationPrimitiveAudit(provider.key);
    const isInProgress = setupState.status !== "not_started";
    const hasSavedCredentials =
      provider.key === "booking"
        ? Boolean(setupState.metadata.booking_hotel_id || setupState.metadata.booking_property_code)
        : Boolean(
          setupState.metadata.provider_listing_id ||
          setupState.metadata.provider_property_code ||
          setupState.metadata.provider_listing_url ||
          setupState.metadata.provider_access_token_stored
        );
    const providerStructureFound =
      setupState.metadata.provider_channel_attached === true ||
      (setupState.metadata.provider_room_types_found_count ?? 0) > 0 ||
      (setupState.metadata.provider_rate_plans_found_count ?? 0) > 0 ||
      setupState.metadata.provider_structure_verified === true;
    const roomReady = readinessModel.items.find((item) => item.key === "room_matching")?.status === "ready";
    const rateReady = readinessModel.items.find((item) => item.key === "price_matching")?.status === "ready";
    const mappingConfirmed = roomReady && rateReady;
    const testSyncStatusLabel =
      testSyncModel.status === "ready"
        ? "Ready"
        : testSyncModel.status === "assisted_only"
          ? "Assisted"
          : testSyncModel.status === "blocked"
            ? "Blocked"
            : testSyncModel.status === "unavailable"
              ? "Unavailable"
              : "Not ready";
    const goLiveStatusLabel =
      goLiveModel.status === "ready_for_review"
        ? "Ready for review"
        : goLiveModel.status === "review_requested"
          ? "Review requested"
          : goLiveModel.status === "blocked"
            ? "Blocked"
            : goLiveModel.status === "assisted_only"
              ? "Assisted"
              : goLiveModel.status === "live"
                ? "Live"
                : "Not ready";
    const providerStatusLabel =
      provider.key === "booking" && testSyncModel.status === "ready"
        ? "Sync ready"
        : mappingConfirmed
          ? "Mapping confirmed"
          : providerStructureFound
            ? "Auto-mapping ready"
            : hasSavedCredentials
              ? provider.key !== "booking" &&
                (!mutationAudit.createChannelApiAvailable || !mutationAudit.testConnectionApiAvailable)
                ? "Assisted setup needed"
                : "Credentials entered"
              : readinessModel.setupRowExists && !readinessModel.actuallyConnected
                ? setupState.status === "not_started"
                  ? "Setup started"
                  : summary.statusLabel
                : summary.statusLabel;

    return {
      key: provider.key,
      status: providerStatusLabel,
      nextStep: readinessModel.nextRequiredAction,
      roomStatus:
        provider.key === "booking"
          ? summary.roomMatchingLabel
          : setupState.status === "matching_needed"
            ? "Matching needed"
            : provider.supportsRoomMatching
              ? isInProgress
                ? "Setup started"
                : "Not started"
              : "Not supported",
      priceStatus:
        provider.key === "booking"
          ? summary.priceMatchingLabel
          : setupState.status === "matching_needed"
            ? "Matching needed"
            : provider.supportsPriceMatching
              ? isInProgress
                ? "Setup started"
                : "Not started"
              : "Not supported",
      calendarStatus:
        provider.key === "booking"
          ? summary.syncReadinessLabel
          : setupState.status === "ready_for_test_sync"
            ? "Ready for test sync"
            : provider.supportsCalendarRateSync
              ? isInProgress
                ? "Setup started"
                : "Not started"
              : "Not supported",
      testSyncStatus: testSyncStatusLabel,
      goLiveStatus: goLiveStatusLabel,
      goLiveNextStep: goLiveModel.nextRequiredAction,
      cta:
        provider.key === "booking"
          ? currentChannelAttached || Boolean(primaryProperty?.externalPropertyId) || roomMappingsReadyCount > 0 || rateMappingsReadyCount > 0 || isInProgress
            ? "Continue connection"
            : "Connect"
          : isInProgress
            ? "Continue connection"
            : "Connect",
      setupModeLabel:
        setupState.setupMode === "existing_listing"
          ? "Existing listing"
          : setupState.setupMode === "prepare_listing"
            ? "Prepare listing"
            : provider.setupMode === "self-serve"
              ? "Self-serve"
              : "Assisted setup",
      roomSupportLabel: provider.supportsRoomMatching ? "Room matching: Supported" : "Room matching: Not available",
      priceSupportLabel: provider.supportsPriceMatching ? "Price matching: Supported" : "Price matching: Not available",
      calendarSupportLabel: provider.supportsCalendarRateSync ? "Calendar / rate sync: Supported" : "Calendar / rate sync: Not available",
      progressPercent: readinessModel.progressPercent,
      warningLabel: readinessModel.warningLabel,
    };
  });
  const connectedProviderCount = CHANNEL_PROVIDER_REGISTRY.filter((provider) => {
    const setupState = channelSetupStatesByKey[provider.key];
    return provider.key === "booking"
      ? currentChannelAttached || setupState.metadata.provider_channel_attached === true
      : setupState.metadata.provider_channel_attached === true;
  }).length;
  const anyProviderReadyForTestSyncReview = CHANNEL_PROVIDER_REGISTRY.some((provider) => {
    const testSyncModel = channelTestSyncReadinessByKey[provider.key];
    const setupState = channelSetupStatesByKey[provider.key];
    return testSyncModel.readyForLimitedTestSync || setupState.metadata.provider_ready_for_test_sync_review === true;
  });
  const famloControlSurfaces = [
    {
      key: "connection",
      title: "Channel connection",
      status: connectedProviderCount > 0 ? "Live" : "Needed",
      tone: connectedProviderCount > 0 ? styles.readinessPillOk : styles.readinessPillMissing,
      detail:
        connectedProviderCount > 0
          ? `${connectedProviderCount} provider ${connectedProviderCount === 1 ? "is" : "are"} visible for this property.`
          : "Connect at least one OTA first.",
    },
    {
      key: "pricing",
      title: "Pricing control",
      status: currentChannelAttached && allActiveRoomsHaveRatePlans ? "Prepared" : "Blocked",
      tone: currentChannelAttached && allActiveRoomsHaveRatePlans ? styles.readinessPillOk : styles.readinessPillReview,
      detail:
        currentChannelAttached && allActiveRoomsHaveRatePlans
          ? "Famlo prices are mapped. Limited sync review is the next safe gate before live OTA rate control."
          : "Finish channel connection and rate mapping before Famlo can safely control OTA pricing.",
    },
    {
      key: "calendar",
      title: "Calendar / inventory control",
      status: anyProviderReadyForTestSyncReview ? "Review ready" : currentChannelAttached ? "Blocked" : "Needed",
      tone: anyProviderReadyForTestSyncReview
        ? styles.readinessPillOk
        : currentChannelAttached
          ? styles.readinessPillReview
          : styles.readinessPillMissing,
      detail:
        anyProviderReadyForTestSyncReview
          ? "Channel structure and mapping are strong enough for operator test-sync review."
          : currentChannelAttached
            ? "Connection exists, but sync review still blocks Famlo from becoming the OTA availability source."
            : "Connect the channel first.",
    },
    {
      key: "bookings",
      title: "Bookings import",
      status: bookingFeedHealthy ? "Live" : currentChannelAttached ? "Partial" : "Needed",
      tone: bookingFeedHealthy
        ? styles.readinessPillOk
        : currentChannelAttached
          ? styles.readinessPillReview
          : styles.readinessPillMissing,
      detail:
        bookingFeedHealthy
          ? "Booking.com operator feed path is available for selected-property import preview and acknowledgement."
          : currentChannelAttached
            ? "Connected channels exist, but booking-feed proof is not complete for every provider."
            : "No OTA booking import path is active yet.",
    },
    {
      key: "messages",
      title: "Messages",
      status: "Famlo inbox",
      tone: styles.readinessPillOk,
      detail: "Famlo direct guest messaging is live. OTA guest threads still stay outside this phase.",
    },
    {
      key: "revenue",
      title: "Revenue",
      status: proBookings.length > 0 ? "Visible" : "Waiting",
      tone: proBookings.length > 0 ? styles.readinessPillOk : styles.readinessPillMissing,
      detail:
        proBookings.length > 0
          ? "Famlo Pro already reports booking value from current direct and imported reservations."
          : "Revenue view activates as soon as this property has bookings in Famlo.",
    },
  ] as const;
  const channelMatchingSnapshotsByKey = CHANNEL_PROVIDER_REGISTRY.reduce((acc, provider) => {
    const setupState = channelSetupStatesByKey[provider.key];
    const hasRealProviderData = provider.key === "booking" ? currentChannelAttached : false;
    const providerDataAvailable = hasRealProviderData && provider.key === "booking";
    const providerDataLabel = provider.key === "booking"
      ? hasRealProviderData
        ? "Real Booking.com / Channex room and rate data is loaded."
        : "Booking.com provider data is not connected yet."
      : "Provider data unavailable. Assisted setup required.";
    const roomRows: ChannelMatchingRoomRow[] = rooms.map((room) => {
      const mapping = roomMappingsByRoomId.get(room.id) ?? null;
      const hasPhotoReadiness = room.photosCount > 0;
      const hasPriceReadiness = room.priceFullday > 0;
      if (!providerDataAvailable) {
        return {
          famloRoomName: room.name,
          famloRoomType: room.unitType || "Famlo room",
          isActive: room.isActive,
          basePriceLabel: room.priceFullday > 0 ? formatCurrency(room.priceFullday) : "Missing price",
          photoReadinessLabel: hasPhotoReadiness ? "Photos ready" : "Needs photos",
          providerRoomLabel: provider.key === "booking" ? "Needs channel connection" : "Provider room unavailable",
          statusLabel: provider.key === "booking" && setupState.status !== "not_started" ? "needs channel connection" : provider.key === "booking" ? "needs channel connection" : "provider room unavailable",
          note: provider.key === "booking"
            ? "Connect the channel first to compare Famlo rooms with Booking.com room types."
            : "Room matching remains assisted until provider data exists.",
        };
      }

      const providerRoomLabel = mapping?.externalRoomTypeId ?? "Not mapped";
      const statusLabel: ChannelMatchingRoomRow["statusLabel"] = mapping?.externalRoomTypeId ? "matched" : "needs match";
      return {
        famloRoomName: room.name,
        famloRoomType: room.unitType || "Famlo room",
        isActive: room.isActive,
        basePriceLabel: room.priceFullday > 0 ? formatCurrency(room.priceFullday) : "Missing price",
        photoReadinessLabel: hasPhotoReadiness ? "Photos ready" : "Needs photos",
        providerRoomLabel,
        statusLabel,
        note: hasPriceReadiness ? null : "Set a base price in Famlo before price matching is considered complete.",
      };
    });
    const rateRows: ChannelMatchingRateRow[] = rooms.map((room) => {
      const ratePlan = ratePlansByRoomId.get(room.id) ?? null;
      if (!providerDataAvailable) {
        return {
          famloRoomName: room.name,
          famloRoomType: room.unitType || "Famlo room",
          isActive: room.isActive,
          basePriceLabel: room.priceFullday > 0 ? formatCurrency(room.priceFullday) : "Missing price",
          providerRateLabel: provider.key === "booking" ? "Needs channel connection" : "Provider rate unavailable",
          statusLabel: provider.key === "booking" && setupState.status !== "not_started" ? "needs channel connection" : provider.key === "booking" ? "needs channel connection" : "provider rate unavailable",
          note: provider.key === "booking"
            ? "Connect the channel first to compare Famlo prices with Booking.com rate plans."
            : "Price matching remains assisted until provider data exists.",
        };
      }

      const providerRateLabel = ratePlan?.externalRatePlanId ?? "Not mapped";
      const statusLabel: ChannelMatchingRateRow["statusLabel"] = ratePlan?.externalRatePlanId ? "matched" : "needs match";
      return {
        famloRoomName: room.name,
        famloRoomType: room.unitType || "Famlo room",
        isActive: room.isActive,
        basePriceLabel: room.priceFullday > 0 ? formatCurrency(room.priceFullday) : "Missing price",
        providerRateLabel,
        statusLabel,
        note: room.priceFullday > 0 ? null : "Set a base price in Famlo before price matching is considered complete.",
      };
    });

    acc[provider.key] = {
      providerDataAvailable,
      providerDataLabel,
      roomRows,
      rateRows,
      reviewLabel: provider.key === "booking"
        ? hasRealProviderData
          ? "Review the real Booking.com / Channex room and rate mappings below."
          : "Booking.com needs channel connection before real matching can be reviewed."
        : "Matching stays assisted until provider data exists.",
    };
    return acc;
  }, {} as Record<ChannelProviderKey, ChannelMatchingSnapshot>);
  const selectedChannelSetupSummary = activeChannelSetup ? channelSetupSummariesByKey[activeChannelSetup] : null;
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
  const selectedRoomMappingStatus = roomEditorRoom
    ? roomMappingsByRoomId.get(roomEditorRoom.id)?.externalRoomTypeId
      ? "Matched"
      : "Needs review"
    : "Save room first";
  const selectedRoomRateMappingStatus = roomEditorRoom
    ? ratePlansByRoomId.get(roomEditorRoom.id)?.externalRatePlanId
      ? "Matched"
      : "Needs review"
    : "Save room first";
  const selectedRoomHasRoomMapping = Boolean(
    roomEditorRoom && roomMappingsByRoomId.get(roomEditorRoom.id)?.externalRoomTypeId
  );
  const selectedRoomHasRateMapping = Boolean(
    roomEditorRoom && ratePlansByRoomId.get(roomEditorRoom.id)?.externalRatePlanId
  );
  const bookingComRoomStatus = currentChannelAttached
    ? selectedRoomHasRoomMapping && selectedRoomHasRateMapping
      ? "Ready"
      : selectedRoomHasRoomMapping || selectedRoomHasRateMapping
        ? "Needs matching review"
        : "Needs setup"
    : "Not connected";
  const bookingComCalendarStatus =
    currentChannelAttached && selectedRoomHasRoomMapping && selectedRoomHasRateMapping
      ? "Ready after sync checks"
      : "Not ready";
  const makeMyTripStatus = "Not connected";
  const roomEditorIssues =
    roomEditorMode === "create"
      ? []
      : [
        roomEditorRoom && !roomEditorRoom.isActive
          ? {
            title: "Room is inactive",
            detail: "Turn this room on before expecting it to be available to guests.",
          }
          : null,
        roomEditorRoom && roomEditorRoom.photosCount <= 0
          ? {
            title: "Photos missing",
            detail: "Add room photos before relying on this room for host-facing presentation or channel setup.",
          }
          : null,
        roomEditorRoom && roomEditorRoom.priceFullday <= 0
          ? {
            title: "Base price missing",
            detail: "Set a full-day or base room price so this room is ready for booking and pricing review.",
          }
          : null,
        roomEditorRoom && !roomMappingsByRoomId.get(roomEditorRoom.id)?.externalRoomTypeId
          ? {
            title: "Room is not matched",
            detail: "Match this Famlo room to the channel room before expecting OTA readiness.",
          }
          : null,
        roomEditorRoom && !ratePlansByRoomId.get(roomEditorRoom.id)?.externalRatePlanId
          ? {
            title: "Price is not matched",
            detail: "Match this room price to a channel rate plan before expecting channel pricing readiness.",
          }
          : null,
        !currentChannelAttached
          ? {
            title: "Channel is not connected",
            detail: "Connect or review the channel setup before expecting OTA calendar or booking sync.",
          }
          : null,
        selectedRoomConflictCount > 0
          ? {
            title: "Sync issues detected",
            detail: `${selectedRoomConflictCount} room-specific sync issue${selectedRoomConflictCount === 1 ? "" : "s"} are currently open.`,
          }
          : null,
      ].filter(Boolean) as Array<{ title: string; detail: string }>;
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
  const dashboardSummaryCards = [
    {
      label: "Active rooms",
      value: `${activeRoomsCount}`,
      hint: inactiveRoomsCount > 0 ? `${inactiveRoomsCount} inactive room${inactiveRoomsCount === 1 ? "" : "s"}` : "All surfaced rooms are active",
    },
    {
      label: "Content ready",
      value: `${propertyContentReadyCount}/${propertyContentChecks.length}`,
      hint: propertyContentReadyCount === propertyContentChecks.length ? "Property basics are ready" : `Missing: ${joinMissingLabels(propertyContentChecks)}`,
    },
    {
      label: "Bookings",
      value: `${totalBookingsCount}`,
      hint: actionNeededBookingsCount > 0 ? `${actionNeededBookingsCount} still need attention` : "No booking action pending",
    },
    {
      label: "Calendar attention",
      value: `${calendarAttentionCount}`,
      hint: calendarAttentionCount > 0 ? "Review pending or verification signals" : "Calendar looks clear",
    },
  ];
  const dashboardPrimaryActions = quickActionItems.slice(0, 6);
  const dashboardChecklistItems = goLiveHostChecklist.slice(0, 5);
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

        <div className={`${styles.content} ${isPropertiesHomeView ? styles.propertiesHomeContent : ""}`}>
          {activeTopLevel === "properties" && !roomRouteState && (
            <section
              className={`${styles.propertyCenterShell} ${isPropertiesHomeView ? styles.propertyCenterShellLuxury : ""}`}
            >
              <div className={styles.propertyCenterHeader}>
                <div>
                  <div className={styles.sectionEyebrow}>Famlo Pro</div>
                  <h2 className={styles.propertyCenterTitle}>Choose a property, then choose a room</h2>
                  <p className={styles.propertyCenterCopy}>
                    Keep the main Properties page simple. Pick a property, review the room cards, then open a room editor
                    with tabs for details, pricing, calendar, channels, room and price matching, and issues.
                  </p>
                </div>
                <div className={styles.propertyCenterStatus}>
                  <span className={styles.sectionStatus}>{activeRoomsCount} active rooms</span>
                  <span className={styles.sectionStatus}>{selectedPropertyChannelStatus}</span>
                  <span className={styles.sectionStatus}>{goLiveSummary.label}</span>
                </div>
              </div>

              <div className={styles.propertySelectorBar}>
                <div className={styles.propertySelectorHeadline}>Select Property</div>
                <div className={styles.propertySelectorControls}>
                  <Link href="/partnerslogin/home/pro/properties/new" className={styles.addPropertyControlLink}>
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
                        switchPropertyContext(event.target.value, { section: "properties-home" });
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
                {isPropertySwitchPending ? (
                  <span className={styles.propertySelectorMetaPill}>
                    Opening {pendingPropertyLabel ?? "selected property"}…
                  </span>
                ) : null}
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
                          className={`${styles.propertyRoomStatePill} ${item.room.isActive ? styles.propertyRoomStatePillActive : styles.propertyRoomStatePillMuted
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
                    place. Advanced channel setup remains under Room & Price Matching and Issues & Sync Status.
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
                <span className={styles.propertySelectorMetaPill}>Issues: {roomEditorSyncStatusLabel}</span>
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
                        ? "Create a room for this selected property. Details, photos, amenities, and room identity can all be managed here."
                        : "Edit this room’s details and photos on the same page using the existing Famlo room save flow."
                    }
                    propertyLabel={propertyLocalityLabel ?? locationLabel}
                    showChannelManager={false}
                    viewRoomPage
                    emptyTitle="No rooms yet"
                    emptyCopy="Create the first room for this property to start building your Famlo inventory."
                    selectedRoomId={roomEditorMode === "edit" ? selectedRoomId : null}
                    createMode={roomEditorMode === "create"}
                    compactMode
                    focusSection="details"
                  />
                ) : null}

                {roomEditorTab === "pricing" ? (
                  <HostRoomsManager
                    familyId={familyId}
                    homeLat={propertyHomeLat ?? undefined}
                    homeLng={propertyHomeLng ?? undefined}
                    title="Edit Room Pricing"
                    description={
                      roomEditorMode === "create"
                        ? "Finish the room draft and set Famlo room pricing here. Currently this edits Famlo room price. OTA/channel-wise pricing will work only after that channel is connected and pricing sync is enabled."
                        : "Edit Famlo room pricing on this page using the existing room save flow. Currently this edits Famlo room price. OTA/channel-wise pricing will work only after that channel is connected and pricing sync is enabled."
                    }
                    propertyLabel={propertyLocalityLabel ?? locationLabel}
                    showChannelManager={false}
                    viewRoomPage
                    emptyTitle="No rooms yet"
                    emptyCopy="Create the first room for this property before editing pricing."
                    selectedRoomId={roomEditorMode === "edit" ? selectedRoomId : null}
                    createMode={roomEditorMode === "create"}
                    compactMode
                    focusSection="pricing"
                  />
                ) : null}

                {roomEditorTab === "calendar" ? (
                  <article className={styles.roomControlPlaceholder}>
                    <div className={styles.placeholderTitle}>Calendar</div>
                    <div className={styles.placeholderCopy}>
                      Review this room&apos;s live calendar here. Click an available date to block it, click a manual block to unblock it, or click a future rate cell to edit pricing for this room.
                    </div>
                    <div className={`${styles.filterRow} ${styles.calendarLuxuryLegend}`} style={{ marginBottom: "20px" }}>
                      {CALENDAR_LEGEND.map((item) => (
                        <span key={item.title} className={styles.filterChip}>
                          {item.title} = {item.copy}
                        </span>
                      ))}
                    </div>
                    {calendarActionFeedback ? (
                      <div
                        className={`${styles.feedbackBox} ${calendarActionFeedback.type === "error" ? styles.feedbackError : styles.feedbackSuccess}`}
                        style={{ marginBottom: "20px" }}
                      >
                        {calendarActionFeedback.text}
                      </div>
                    ) : null}
                    {calendarRateFeedback ? (
                      <div
                        className={`${styles.feedbackBox} ${calendarRateFeedback.type === "error" ? styles.feedbackError : styles.feedbackSuccess}`}
                        style={{ marginBottom: "20px" }}
                      >
                        {calendarRateFeedback.text}
                      </div>
                    ) : null}
                    {selectedRoomCalendarRow ? (
                      <div className={`${styles.calendarBoard} ${styles.calendarBoardLuxury}`}>
                        <div className={styles.calendarGrid}>
                          <div className={`${styles.calendarHeaderCell} ${styles.calendarRoomHeader}`}>Room / Unit</div>
                          {calendarColumns.map((column) => (
                            <div key={column.date} className={styles.calendarHeaderCell}>
                              <div className={styles.calendarHeaderDay}>{column.dayLabel}</div>
                              <div className={styles.calendarHeaderDate}>{column.dateLabel}</div>
                            </div>
                          ))}

                          <div className={styles.calendarRowSpacer} style={{ gridColumn: `span ${calendarColumns.length + 1}` }} />

                          <div className={styles.calendarRoomCell}>
                            <div className={styles.calendarRoomName}>{selectedRoomCalendarRow.roomName}</div>
                            <div className={styles.calendarRoomType}>{selectedRoomCalendarRow.unitType}</div>
                            <div className={styles.calendarMetricLabel}>Availability</div>
                          </div>
                          {selectedRoomCalendarRow.availabilityCells.map((cell) => {
                            const isActionable =
                              Boolean(cell.bookingDetail) || cell.status === "available" || cell.status === "manual_block";
                            const isBusy = isCalendarActionPending && calendarActionDate === cell.date;
                            const title =
                              cell.bookingDetail
                                ? cell.label
                                : cell.status === "available"
                                  ? `${cell.label}. Click to block this date for ${selectedRoomCalendarRow.roomName}.`
                                  : cell.status === "manual_block"
                                    ? `${cell.label}. Click to unblock this date for ${selectedRoomCalendarRow.roomName}.`
                                    : cell.label;

                            return (
                              <button
                                type="button"
                                key={`${selectedRoomCalendarRow.roomId}-${cell.date}-availability`}
                                className={`${styles.calendarCell} ${calendarCellClass(cell.status)} ${isActionable ? styles.calendarCellInteractive : ""}`}
                                title={title}
                                onClick={() => handleCalendarCellAction(cell, selectedRoomCalendarRow.roomId, selectedRoomCalendarRow.roomName)}
                                disabled={!isActionable || isBusy}
                              >
                                {isBusy ? "..." : cell.status === "available" ? "1" : cell.status === "past" ? "—" : "0"}
                              </button>
                            );
                          })}

                          <div className={`${styles.calendarRoomCell} ${styles.calendarRateLabel}`}>
                            <div className={styles.calendarMetricLabel}>Rate</div>
                            <div className={styles.calendarRoomType}>Click a future date to edit room price</div>
                          </div>
                          {selectedRoomCalendarRow.rateCells.map((cell, index) => {
                            const override =
                              calendarRateOverrides[getCalendarRateOverrideKey(selectedRoomCalendarRow.roomId, cell.date)] ?? null;
                            const visibleCell = override
                              ? {
                                  ...cell,
                                  amount: override.amount,
                                  displayValue: override.displayValue,
                                  isOverridden: override.isOverridden,
                                }
                              : cell;

                            return (
                              <button
                                type="button"
                                key={`${selectedRoomCalendarRow.roomId}-${calendarColumns[index]?.date ?? index}-rate`}
                                className={`${styles.calendarCell} ${visibleCell.isPast ? styles.calendarCellPast : styles.calendarRateCell} ${!visibleCell.isPast ? styles.calendarCellInteractive : ""}`}
                                disabled={visibleCell.isPast}
                                onClick={() => handleCalendarRateCellAction(visibleCell, selectedRoomCalendarRow)}
                                title={
                                  visibleCell.isPast
                                    ? `${selectedRoomCalendarRow.roomName} rate on ${cell.date} is in the past.`
                                    : `${selectedRoomCalendarRow.roomName} rate on ${cell.date}: ${visibleCell.displayValue}. Click to edit.`
                                }
                              >
                                {visibleCell.displayValue}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className={styles.placeholderGrid}>
                        <div className={styles.placeholderRow}>
                          <div className={styles.placeholderLabel}>Room calendar status</div>
                          <div className={styles.placeholderValue}>{selectedRoomCalendarHealthy ? "Visible" : "Needs review"}</div>
                        </div>
                        <div className={styles.placeholderRow}>
                          <div className={styles.placeholderLabel}>What to do</div>
                          <div className={styles.placeholderValue}>Save the room and check the property calendar if dates are still missing.</div>
                        </div>
                      </div>
                    )}
                    <div className={styles.inlineActionRow}>
                      <button type="button" className={styles.primaryActionButton} onClick={() => router.push(`/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(familyId)}&section=inventory-calendar`)}>
                        Open Property Calendar
                      </button>
                      <button type="button" className={styles.secondaryActionButton} onClick={() => router.push(`/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(familyId)}&section=bookings`)}>
                        Open Bookings
                      </button>
                    </div>
                  </article>
                ) : null}

                {roomEditorTab === "channels" ? (
                  <article className={styles.roomControlPlaceholder}>
                    <div className={styles.placeholderTitle}>Channels</div>
                    <div className={styles.placeholderCopy}>
                      See whether this room is ready for each channel. This page does not create channel listings or pricing rules.
                    </div>
                    <div className={styles.placeholderGrid}>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderTitle}>Booking.com</div>
                        <div className={styles.placeholderCopy}>
                          Status: {currentChannelAttached ? "Connected" : "Not connected"} · Readiness: {bookingComRoomStatus} · Room: {selectedRoomMappingStatus} · Price: {selectedRoomRateMappingStatus} · Calendar sync: {bookingComCalendarStatus}
                        </div>
                      </div>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderTitle}>MakeMyTrip / Goibibo</div>
                        <div className={styles.placeholderCopy}>
                          {makeMyTripStatus}. Connect MakeMyTrip setup coming next. Requires existing MMT/Goibibo listing or assisted onboarding.
                        </div>
                      </div>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderTitle}>Airbnb and other channels</div>
                        <div className={styles.placeholderCopy}>Coming later. No channel controls are active here yet.</div>
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
                    <div className={styles.placeholderTitle}>Room & Price Matching</div>
                    <div className={styles.placeholderCopy}>
                      Match the Famlo room and Famlo price to the connected channel records. Advanced matching tools stay unchanged.
                    </div>
                    <div className={styles.roomInlineSummaryGrid}>
                      <div className={styles.summaryCard}>
                        <div className={styles.summaryLabel}>Famlo room</div>
                        <div className={styles.summaryValue}>{roomEditorRoom?.name ?? "Save room first"}</div>
                        <div className={styles.summaryCopy}>Room being managed in Famlo Pro.</div>
                      </div>
                      <div className={styles.summaryCard}>
                        <div className={styles.summaryLabel}>OTA room match</div>
                        <div className={styles.summaryValue}>{selectedRoomMappingStatus}</div>
                        <div className={styles.summaryCopy}>Matched channel room, if available.</div>
                      </div>
                      <div className={styles.summaryCard}>
                        <div className={styles.summaryLabel}>Price match</div>
                        <div className={styles.summaryValue}>{selectedRoomRateMappingStatus}</div>
                        <div className={styles.summaryCopy}>Matched channel rate plan, if available.</div>
                      </div>
                    </div>
                    <div className={styles.placeholderGrid}>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderLabel}>Room match</div>
                        <div className={styles.placeholderValue}>{selectedRoomMappingStatus}</div>
                      </div>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderLabel}>Price match</div>
                        <div className={styles.placeholderValue}>{selectedRoomRateMappingStatus}</div>
                      </div>
                    </div>
                    <div className={styles.inlineActionRow}>
                      <button type="button" className={styles.primaryActionButton} onClick={() => setActiveSection("room-mapping")}>
                        Open Room Matching
                      </button>
                      <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection("rate-mapping")}>
                        Open Price Matching
                      </button>
                    </div>
                  </article>
                ) : null}

                {roomEditorTab === "sync-health" ? (
                  <article className={styles.roomControlPlaceholder}>
                    <div className={styles.placeholderTitle}>Issues & Sync Status</div>
                    <div className={styles.placeholderCopy}>
                      Review the selected room&apos;s useful issues here first. Advanced sync logs remain available for operational review.
                    </div>
                    <div className={styles.roomInlineSummaryGrid}>
                      <div className={styles.summaryCard}>
                        <div className={styles.summaryLabel}>Open issues</div>
                        <div className={styles.summaryValue}>{roomEditorSyncStatusLabel}</div>
                        <div className={styles.summaryCopy}>
                          {roomEditorIssues.length === 0 ? "No issues found for this room." : "Use the checklist below to review what still needs attention."}
                        </div>
                      </div>
                      <div className={styles.summaryCard}>
                        <div className={styles.summaryLabel}>Advanced review</div>
                        <div className={styles.summaryValue}>{selectedRoomConflictCount === 0 ? "Sync logs" : "Open issues"}</div>
                        <div className={styles.summaryCopy}>Advanced sync checks remain available in the existing Pro sections.</div>
                      </div>
                    </div>
                    <div className={styles.placeholderGrid}>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderLabel}>Open issues</div>
                        <div className={styles.placeholderValue}>{roomEditorSyncStatusLabel}</div>
                      </div>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderLabel}>Advanced review</div>
                        <div className={styles.placeholderValue}>
                          {selectedRoomConflictCount === 0 ? "Sync logs" : "Open issues"}
                        </div>
                      </div>
                    </div>
                    {roomEditorIssues.length > 0 ? (
                      <div className={styles.stack}>
                        {roomEditorIssues.map((issue) => (
                          <div key={issue.title} className={styles.placeholderRow}>
                            <div className={styles.placeholderTitle}>{issue.title}</div>
                            <div className={styles.placeholderCopy}>{issue.detail}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className={styles.inlineActionRow}>
                      <button
                        type="button"
                        className={styles.secondaryActionButton}
                        onClick={() => setActiveSection("sync-logs")}
                      >
                        View Sync Logs
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
                      Property dashboard
                    </h2>
                    <p className={styles.heroText}>
                      A simple home for this property. Use it to check readiness fast and jump into the main PMS
                      workspaces without repeating everything that already exists in the other sections.
                    </p>
                    <div className={styles.heroMeta}>
                      <div className={styles.heroMetaItem}>
                        <span className={styles.heroMetaLabel}>Selected property</span>
                        <span className={styles.heroMetaValue}>{selectedPropertyDisplayLabel}</span>
                      </div>
                      <div className={styles.heroMetaItem}>
                        <span className={styles.heroMetaLabel}>Go-live status</span>
                        <span className={styles.heroMetaValue}>{goLiveSummary.label}</span>
                      </div>
                      <div className={styles.heroMetaItem}>
                        <span className={styles.heroMetaLabel}>Channel</span>
                        <span className={styles.heroMetaValue}>{selectedPropertyChannelStatus}</span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.heroPanel}>
                    <div className={styles.heroPanelTitle}>Today&apos;s focus</div>
                    <div className={styles.inlineBadgeRow}>
                      <span className={`${styles.readinessPill} ${goLiveSummary.toneClass}`}>{goLiveSummary.label}</span>
                      <span className={styles.readinessPill}>{completedSetupCount}/{setupItems.length} ready</span>
                    </div>
                    <div className={styles.feedCopy}>{goLiveSummary.explanation}</div>
                    <div className={styles.heroPanelList}>
                      <div className={styles.heroPanelItem}>
                        <span>Rooms to fix</span>
                        <strong>{roomsMissingPrice + photosReadiness.missingRooms === 0 ? "All set" : `${roomsMissingPrice + photosReadiness.missingRooms} open`}</strong>
                      </div>
                      <div className={styles.heroPanelItem}>
                        <span>Bookings needing attention</span>
                        <strong>{actionNeededBookingsCount === 0 ? "All clear" : `${actionNeededBookingsCount} open`}</strong>
                      </div>
                      <div className={styles.heroPanelItem}>
                        <span>Open calendar issues</span>
                        <strong>{calendarAttentionCount === 0 ? "None" : `${calendarAttentionCount} flagged`}</strong>
                      </div>
                      <div className={styles.heroPanelItem}>
                        <span>Next best place</span>
                        <strong>{roomsMissingPrice > 0 ? "Pricing" : photosReadiness.missingRooms > 0 ? "Rooms" : actionNeededBookingsCount > 0 ? "Bookings" : "Calendar"}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className={styles.statGrid}>
                {dashboardSummaryCards.map((metric) => (
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
                      <h3 className={styles.cardTitle}>Core actions</h3>
                      <p className={styles.cardCopy}>
                        Open the main PMS areas directly. This keeps the dashboard simple and avoids a second layer of
                        workspace clutter.
                      </p>
                    </div>
                    <span className={styles.badge}>{propertyName}</span>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.stack}>
                      {dashboardPrimaryActions.map((item) => (
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

                <article className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <h3 className={styles.cardTitle}>Setup checklist</h3>
                      <p className={styles.cardCopy}>
                        The essentials only. If these are healthy, the property is ready to be managed from the deeper
                        pages without needing more dashboard layers.
                      </p>
                    </div>
                    <span className={styles.badge}>{setupProgressPercent}% ready</span>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.checkGrid}>
                      {dashboardChecklistItems.map((item) => (
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
              </section>
            </>
          )}

          {activeSection !== "dashboard" && activeSection !== "properties-home" && activeSection !== "bookings" && activeSection !== "inventory-calendar" && activeSection !== "messages-reviews" && activeSection !== "revenue" && activeSection !== "reports" && (
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
            <section className={`${styles.propertyCenterShell} ${styles.propertyCenterShellLuxury} ${styles.calendarLuxuryShell}`}>
              <div>
                <h3 className={styles.propertyCenterTitle}>Calendar</h3>
              </div>
              <div className={styles.cardBody}>
                <div className={`${styles.filterRow} ${styles.calendarLuxuryLegend}`} style={{ marginBottom: "24px" }}>
                  {CALENDAR_LEGEND.map((item) => (
                    <span key={item.title} className={styles.filterChip}>
                      {item.title} = {item.copy}
                    </span>
                  ))}
                </div>
                {calendarActionFeedback ? (
                  <div
                    className={`${styles.feedbackBox} ${calendarActionFeedback.type === "error" ? styles.feedbackError : styles.feedbackSuccess}`}
                    style={{ marginBottom: "24px" }}
                  >
                    {calendarActionFeedback.text}
                  </div>
                ) : null}
                {calendarRateFeedback ? (
                  <div
                    className={`${styles.feedbackBox} ${calendarRateFeedback.type === "error" ? styles.feedbackError : styles.feedbackSuccess}`}
                    style={{ marginBottom: "24px" }}
                  >
                    {calendarRateFeedback.text}
                  </div>
                ) : null}
                {calendarRows.length > 0 ? (
                  <div className={`${styles.calendarBoard} ${styles.calendarBoardLuxury}`}>
                    <div className={styles.calendarGrid}>
                      <div className={`${styles.calendarHeaderCell} ${styles.calendarRoomHeader}`}>Room / Unit</div>
                      {calendarColumns.map((column) => (
                        <div key={column.date} className={styles.calendarHeaderCell}>
                          <div className={styles.calendarHeaderDay}>{column.dayLabel}</div>
                          <div className={styles.calendarHeaderDate}>{column.dateLabel}</div>
                        </div>
                      ))}

                      {/* Spacer between header row and first room row */}
                      <div className={styles.calendarRowSpacer} style={{ gridColumn: `span ${calendarColumns.length + 1}` }} />

                      {calendarRows.map((row) => (
                        <Fragment key={row.roomId}>
                          <div className={styles.calendarRoomCell}>
                            <div className={styles.calendarRoomName}>{row.roomName}</div>
                            <div className={styles.calendarRoomType}>{row.unitType}</div>
                            <div className={styles.calendarMetricLabel}>Availability</div>
                          </div>
                          {row.availabilityCells.map((cell) => {
                            const isActionable =
                              Boolean(cell.bookingDetail) || cell.status === "available" || cell.status === "manual_block";
                            const isBusy = isCalendarActionPending && calendarActionDate === cell.date;
                            const title =
                              cell.bookingDetail
                                ? cell.label
                                : cell.status === "available"
                                  ? `${cell.label}. Click to block this date for ${row.roomName}.`
                                  : cell.status === "manual_block"
                                    ? `${cell.label}. Click to unblock this date for ${row.roomName}.`
                                    : cell.label;

                            return (
                              <button
                                type="button"
                                key={`${row.roomId}-${cell.date}-availability`}
                                className={`${styles.calendarCell} ${calendarCellClass(cell.status)} ${isActionable ? styles.calendarCellInteractive : ""}`}
                                title={title}
                                onClick={() => handleCalendarCellAction(cell, row.roomId, row.roomName)}
                                disabled={!isActionable || isBusy}
                              >
                                {isBusy ? "..." : cell.status === "available" ? "1" : cell.status === "past" ? "—" : "0"}
                              </button>
                            );
                          })}

                          <div className={`${styles.calendarRoomCell} ${styles.calendarRateLabel}`}>
                            <div className={styles.calendarMetricLabel}>Rate</div>
                            <div className={styles.calendarRoomType}>Click a future date to edit room price</div>
                          </div>
                          {row.rateCells.map((cell, index) => {
                            const override = calendarRateOverrides[getCalendarRateOverrideKey(row.roomId, cell.date)] ?? null;
                            const visibleCell = override
                              ? {
                                ...cell,
                                amount: override.amount,
                                displayValue: override.displayValue,
                                isOverridden: override.isOverridden,
                              }
                              : cell;

                            return (
                              <button
                                type="button"
                                key={`${row.roomId}-${calendarColumns[index]?.date ?? index}-rate`}
                                className={`${styles.calendarCell} ${visibleCell.isPast ? styles.calendarCellPast : styles.calendarRateCell} ${!visibleCell.isPast ? styles.calendarCellInteractive : ""}`}
                                disabled={visibleCell.isPast}
                                onClick={() => handleCalendarRateCellAction(visibleCell, row)}
                                title={
                                  visibleCell.isPast
                                    ? `${row.roomName} rate on ${visibleCell.date}`
                                    : visibleCell.isOverridden
                                      ? `${row.roomName} has a custom rate on ${visibleCell.date}. Click to edit or reset it.`
                                      : `Click to set a daily rate for ${row.roomName} on ${visibleCell.date}.`
                                }
                              >
                                <span style={{ display: "grid", gap: "4px", justifyItems: "center" }}>
                                  <span>{visibleCell.displayValue}</span>
                                  {!visibleCell.isPast ? (
                                    <span style={{ fontSize: "10px", opacity: 0.72 }}>
                                      {visibleCell.isOverridden ? "Custom" : "Base"}
                                    </span>
                                  ) : null}
                                </span>
                              </button>
                            );
                          })}

                          {/* Spacer between different rooms */}
                          <div className={styles.calendarRowSpacer} style={{ gridColumn: `span ${calendarColumns.length + 1}` }} />
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
                <div className={styles.listGrid} style={{ marginTop: "24px" }}>
                  <article className={styles.listCard} style={{ display: "flex", flexDirection: "column" }}>
                    <div className={styles.listTitle}>Daily room rate</div>
                    <div className={styles.feedCopy} style={{ marginBottom: 14 }}>
                      Click any future rate cell above to set a room-specific daily rate override for that exact date.
                    </div>
                    {selectedCalendarRateCell ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
                        <div className={styles.placeholderRow}>
                          <div className={styles.placeholderTitle}>{selectedCalendarRateCell.roomName}</div>
                          <div className={styles.placeholderValue}>{formatShortDate(selectedCalendarRateCell.date)}</div>
                          <div className={styles.placeholderCopy}>
                            Base price {selectedCalendarRateCell.baseAmount > 0 ? formatCalendarCurrency(selectedCalendarRateCell.baseAmount) : "Missing"}
                            {selectedCalendarRateCell.isOverridden ? ` · Override active (${selectedCalendarRateCell.displayValue})` : " · No override yet"}
                          </div>
                        </div>
                        <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                          <span className={styles.fieldLabel}>Daily rate (INR)</span>
                          <input
                            className={styles.fieldInput}
                            inputMode="numeric"
                            value={calendarRateDraft}
                            onChange={(event) => setCalendarRateDraft(event.target.value)}
                            placeholder={selectedCalendarRateCell.baseAmount > 0 ? String(selectedCalendarRateCell.baseAmount) : "1500"}
                          />
                        </label>
                        <div className={styles.roomReadinessRow} style={{ marginTop: "auto" }}>
                          <button
                            type="button"
                            className={styles.secondaryActionButton}
                            onClick={() => submitCalendarRate("save")}
                            disabled={isCalendarRatePending && calendarRateActionDate === selectedCalendarRateCell.date}
                          >
                            {isCalendarRatePending && calendarRateActionDate === selectedCalendarRateCell.date ? "Saving..." : "Save daily rate"}
                          </button>
                          <button
                            type="button"
                            className={styles.secondaryActionButton}
                            onClick={() => submitCalendarRate("reset")}
                            disabled={isCalendarRatePending && calendarRateActionDate === selectedCalendarRateCell.date}
                          >
                            Reset to base
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.feedCopy}>No day selected yet. Click a future rate cell above to edit one room on one date.</div>
                    )}
                  </article>

                  <article className={styles.listCard} style={{ display: "flex", flexDirection: "column" }}>
                    <div className={styles.listTitle}>Multiple block / unblock</div>
                    <div className={styles.feedCopy} style={{ marginBottom: 14 }}>
                      Quickly block or unblock a date range for the selected room scope. This uses the same Famlo-to-Channex bulk availability path as the existing calendar sync.
                    </div>
                    <div className={styles.roomReadinessRow} style={{ marginTop: "auto", paddingTop: 14 }}>
                      <button
                        type="button"
                        className={styles.secondaryActionButton}
                        onClick={() =>
                          submitBulkCalendarUpdate({
                            availabilityAction: "block",
                            rateAmount: "",
                          })}
                        disabled={isBulkCalendarPending}
                      >
                        {isBulkCalendarPending ? "Applying..." : "Block selected dates"}
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryActionButton}
                        onClick={() =>
                          submitBulkCalendarUpdate({
                            availabilityAction: "unblock",
                            rateAmount: "",
                          })}
                        disabled={isBulkCalendarPending}
                      >
                        {isBulkCalendarPending ? "Applying..." : "Unblock selected dates"}
                      </button>
                    </div>
                  </article>

                  <article className={styles.listCard} style={{ display: "flex", flexDirection: "column" }}>
                    <div className={styles.listTitle}>Bulk calendar and restrictions</div>
                    <div className={styles.feedCopy} style={{ marginBottom: 14 }}>
                      Use one PMS save flow to batch prices, availability, and restriction changes across a date range. Famlo queues the resulting Channex ARI updates instead of pushing directly from the browser.
                    </div>
                    {bulkCalendarFeedback ? (
                      <div
                        className={`${styles.feedbackBox} ${bulkCalendarFeedback.type === "error" ? styles.feedbackError : styles.feedbackSuccess}`}
                        style={{ marginBottom: 14 }}
                      >
                        {bulkCalendarFeedback.text}
                      </div>
                    ) : null}
                    <div style={{ display: "grid", gap: 12 }}>
                      <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                        <span className={styles.fieldLabel}>Room scope</span>
                        <select
                          className={styles.fieldInput}
                          value={bulkCalendarDraft.roomId}
                          onChange={(event) =>
                            setBulkCalendarDraft((current) => ({
                              ...current,
                              roomId: event.target.value,
                              applyToAllRooms: event.target.value === "__all__" ? current.applyToAllRooms : false,
                            }))}
                        >
                          <option value="__all__">All visible rooms</option>
                          {calendarRows.map((row) => (
                            <option key={row.roomId} value={row.roomId}>
                              {row.roomName}
                            </option>
                          ))}
                        </select>
                      </label>
                      {bulkCalendarDraft.roomId === "__all__" ? (
                        <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                          <span className={styles.fieldLabel}>Confirm all-room apply</span>
                          <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <input
                              type="checkbox"
                              checked={bulkCalendarDraft.applyToAllRooms}
                              onChange={(event) =>
                                setBulkCalendarDraft((current) => ({
                                  ...current,
                                  applyToAllRooms: event.target.checked,
                                }))}
                            />
                            <span className={styles.feedCopy} style={{ marginBottom: 0 }}>
                              I want this bulk change to affect every visible room.
                            </span>
                          </label>
                        </label>
                      ) : null}
                      <div className={styles.calendarJumpForm}>
                        <label className={`${styles.fieldGroup} ${styles.calendarJumpField}`} style={{ marginBottom: 0 }}>
                          <span className={styles.fieldLabel}>From</span>
                          <input
                            className={styles.fieldInput}
                            type="date"
                            value={bulkCalendarDraft.dateFrom}
                            onChange={(event) => setBulkCalendarDraft((current) => ({ ...current, dateFrom: event.target.value }))}
                          />
                        </label>
                        <label className={`${styles.fieldGroup} ${styles.calendarJumpField}`} style={{ marginBottom: 0 }}>
                          <span className={styles.fieldLabel}>To</span>
                          <input
                            className={styles.fieldInput}
                            type="date"
                            value={bulkCalendarDraft.dateTo}
                            onChange={(event) => setBulkCalendarDraft((current) => ({ ...current, dateTo: event.target.value }))}
                          />
                        </label>
                      </div>
                      <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                        <span className={styles.fieldLabel}>Daily rate override (optional)</span>
                        <input
                          className={styles.fieldInput}
                          inputMode="numeric"
                          placeholder="Leave blank to keep current rates"
                          value={bulkCalendarDraft.rateAmount}
                          onChange={(event) => setBulkCalendarDraft((current) => ({ ...current, rateAmount: event.target.value }))}
                        />
                      </label>
                      <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                        <span className={styles.fieldLabel}>Availability action</span>
                        <select
                          className={styles.fieldInput}
                          value={bulkCalendarDraft.availabilityAction}
                          onChange={(event) =>
                            setBulkCalendarDraft((current) => ({
                              ...current,
                              availabilityAction: event.target.value as "none" | "block" | "unblock",
                            }))
                          }
                        >
                          <option value="none">No availability change</option>
                          <option value="block">Block / stop selling selected dates</option>
                          <option value="unblock">Unblock selected dates</option>
                        </select>
                      </label>
                      <div className={styles.calendarJumpForm}>
                        <label className={`${styles.fieldGroup} ${styles.calendarJumpField}`} style={{ marginBottom: 0 }}>
                          <span className={styles.fieldLabel}>Min stay through</span>
                          <input
                            className={styles.fieldInput}
                            inputMode="numeric"
                            placeholder="Optional"
                            value={bulkCalendarDraft.minStay}
                            onChange={(event) => setBulkCalendarDraft((current) => ({ ...current, minStay: event.target.value }))}
                          />
                        </label>
                        <label className={`${styles.fieldGroup} ${styles.calendarJumpField}`} style={{ marginBottom: 0 }}>
                          <span className={styles.fieldLabel}>Min stay arrival</span>
                          <input
                            className={styles.fieldInput}
                            inputMode="numeric"
                            placeholder="Optional"
                            value={bulkCalendarDraft.minStayArrival}
                            onChange={(event) => setBulkCalendarDraft((current) => ({ ...current, minStayArrival: event.target.value }))}
                          />
                        </label>
                      </div>
                      <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                        <span className={styles.fieldLabel}>Max stay</span>
                        <input
                          className={styles.fieldInput}
                          inputMode="numeric"
                          placeholder="Optional"
                          value={bulkCalendarDraft.maxStay}
                          onChange={(event) => setBulkCalendarDraft((current) => ({ ...current, maxStay: event.target.value }))}
                        />
                      </label>
                      <div className={styles.calendarJumpForm}>
                        <label className={`${styles.fieldGroup} ${styles.calendarJumpField}`} style={{ marginBottom: 0 }}>
                          <span className={styles.fieldLabel}>CTA</span>
                          <select
                            className={styles.fieldInput}
                            value={bulkCalendarDraft.cta}
                            onChange={(event) => setBulkCalendarDraft((current) => ({ ...current, cta: event.target.value as "unchanged" | "true" | "false" }))}
                          >
                            <option value="unchanged">Keep current</option>
                            <option value="true">Closed to arrival</option>
                            <option value="false">Open to arrival</option>
                          </select>
                        </label>
                        <label className={`${styles.fieldGroup} ${styles.calendarJumpField}`} style={{ marginBottom: 0 }}>
                          <span className={styles.fieldLabel}>CTD</span>
                          <select
                            className={styles.fieldInput}
                            value={bulkCalendarDraft.ctd}
                            onChange={(event) => setBulkCalendarDraft((current) => ({ ...current, ctd: event.target.value as "unchanged" | "true" | "false" }))}
                          >
                            <option value="unchanged">Keep current</option>
                            <option value="true">Closed to departure</option>
                            <option value="false">Open to departure</option>
                          </select>
                        </label>
                      </div>
                      <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                        <span className={styles.fieldLabel}>Stop sell</span>
                        <select
                          className={styles.fieldInput}
                          value={bulkCalendarDraft.stopSell}
                          onChange={(event) => setBulkCalendarDraft((current) => ({ ...current, stopSell: event.target.value as "unchanged" | "true" | "false" }))}
                        >
                          <option value="unchanged">Keep current</option>
                          <option value="true">Enable stop sell</option>
                          <option value="false">Disable stop sell</option>
                        </select>
                      </label>
                    </div>
                    <div className={styles.roomReadinessRow} style={{ marginTop: "auto", paddingTop: 14 }}>
                      <button
                        type="button"
                        className={styles.secondaryActionButton}
                        onClick={() => submitBulkCalendarUpdate()}
                        disabled={isBulkCalendarPending}
                      >
                        {isBulkCalendarPending ? "Applying..." : "Apply bulk PMS update"}
                      </button>
                    </div>
                  </article>

                  <article className={styles.listCard} style={{ display: "flex", flexDirection: "column" }}>
                    <div className={styles.listTitle}>Jump to month</div>
                    <div className={styles.feedCopy} style={{ marginBottom: 14 }}>
                      Move the calendar above to the month where you want to block dates or edit room pricing.
                    </div>
                    <div className={styles.calendarJumpForm}>
                      <label className={`${styles.fieldGroup} ${styles.calendarJumpField}`} style={{ marginBottom: 0 }}>
                        <span className={styles.fieldLabel}>Month</span>
                        <select className={styles.fieldInput} value={calendarJumpMonth} onChange={(event) => setCalendarJumpMonth(event.target.value)}>
                          {calendarJumpMonthOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={`${styles.fieldGroup} ${styles.calendarJumpField}`} style={{ marginBottom: 0 }}>
                        <span className={styles.fieldLabel}>Year</span>
                        <select className={styles.fieldInput} value={calendarJumpYear} onChange={(event) => setCalendarJumpYear(event.target.value)}>
                          {calendarJumpYearOptions.map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className={styles.calendarJumpActions} style={{ marginTop: "auto", paddingTop: 14 }}>
                      <button type="button" className={styles.secondaryActionButton} onClick={handleCalendarJump} disabled={isCalendarJumpPending}>
                        {isCalendarJumpPending ? "Finding..." : "Find month"}
                      </button>
                      <button type="button" className={styles.secondaryActionButton} onClick={handleCalendarToday} disabled={isCalendarJumpPending}>
                        {isCalendarJumpPending ? "Opening..." : "Go to today"}
                      </button>
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
                    Add one OTA channel at a time. Pick the OTA, press Add channel, then enter the connection details.
                  </p>
                </div>
                <span className={currentChannelAttached ? styles.badge : styles.badge + " " + styles.badgeMuted}>
                  {currentChannelAttached ? "Connected property loaded" : "Needs setup"}
                </span>
              </div>
              <div className={styles.cardBody}>
                <article className={styles.listCard}>
                  <div className={styles.listTitle}>Add channel</div>
                  <div className={styles.cardCopy}>
                    Choose the OTA you want to connect for this property. The setup form will open immediately after you add it.
                  </div>
                  <div className={styles.listGrid} style={{ marginTop: 12 }}>
                    <label>
                      <span className={styles.fieldLabel}>Select OTA</span>
                      <select
                        className={styles.fieldInput}
                        value={selectedChannelToAdd}
                        onChange={(event) => setSelectedChannelToAdd(event.target.value as ChannelProviderKey)}
                      >
                        {CHANNEL_PROVIDER_REGISTRY.map((provider) => (
                          <option key={provider.key} value={provider.key}>
                            {provider.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className={styles.placeholderRow}>
                      <div className={styles.placeholderTitle}>{getChannelProviderDefinition(selectedChannelToAdd).displayName}</div>
                      <div className={styles.placeholderCopy}>{getChannelProviderDefinition(selectedChannelToAdd).description}</div>
                    </div>
                  </div>
                  <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className={styles.primaryActionButton}
                      onClick={() => setActiveChannelSetup(selectedChannelToAdd)}
                    >
                      Add channel
                    </button>
                    {activeChannelSetup ? (
                      <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveChannelSetup(null)}>
                        Close setup
                      </button>
                    ) : null}
                  </div>
                </article>

                <article className={styles.listCard}>
                  <div className={styles.listTitle}>Added channels</div>
                  <div className={styles.mappingTable} style={{ marginTop: 12 }}>
                    <div className={styles.mappingHeader}>OTA</div>
                    <div className={styles.mappingHeader}>Status</div>
                    <div className={styles.mappingHeader}>Next action</div>
                    <div className={styles.mappingHeader}>Action</div>
                    {channelProviderCards
                      .filter((channel) => channel.status !== "Not started" || channel.key === activeChannelSetup)
                      .map((channel) => {
                        const provider = getChannelProviderDefinition(channel.key);
                        return (
                          <Fragment key={channel.key}>
                            <div className={styles.mappingCell}>
                              <div className={styles.mappingTitle}>{provider.displayName}</div>
                              <div className={styles.mappingSubcopy}>{channel.progressPercent}% complete</div>
                            </div>
                            <div className={styles.mappingCell}>
                              <span className={channel.status === "Connected" ? styles.badge : styles.badge + " " + styles.badgeMuted}>
                                {channel.status}
                              </span>
                            </div>
                            <div className={styles.mappingCellMuted}>{channel.goLiveNextStep ?? channel.nextStep}</div>
                            <div className={styles.mappingCell}>
                              <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveChannelSetup(channel.key)}>
                                Open setup
                              </button>
                            </div>
                          </Fragment>
                        );
                      })}
                  </div>
                </article>

                {activeChannelSetup ? (
                  <ChannelSetupWizard
                    providerKey={activeChannelSetup}
                    familyId={familyId}
                    channexPropertyId={primaryProperty?.externalPropertyId ?? null}
                    summary={selectedChannelSetupSummary ?? channelSetupSummariesByKey.booking}
                    readinessModel={channelReadinessModelsByKey[activeChannelSetup]}
                    testSyncReadiness={channelTestSyncReadinessByKey[activeChannelSetup]}
                    goLiveReadiness={channelGoLiveReadinessByKey[activeChannelSetup]}
                    matchingSnapshot={channelMatchingSnapshotsByKey[activeChannelSetup]}
                    initialState={channelSetupStatesByKey[activeChannelSetup] ?? null}
                    onSaved={(savedState) => {
                      setChannelSetupOverrides((current) => ({
                        ...current,
                        [savedState.providerKey]: savedState,
                      }));
                    }}
                    onOpenRoomMatching={() => {
                      setActiveChannelSetup(null);
                      setActiveSection("room-mapping");
                    }}
                    onOpenPriceMatching={() => {
                      setActiveChannelSetup(null);
                      setActiveSection("rate-mapping");
                    }}
                    onClose={() => setActiveChannelSetup(null)}
                  />
                ) : (
                  <div className={styles.feedbackBox}>
                    Pick a provider card above to continue the guided setup. The wizard will show the safe next step without exposing raw technical identifiers.
                  </div>
                )}

                <div className={styles.listGrid}>
                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Famlo control status</div>
                    <div className={styles.cardCopy}>
                      This shows what Famlo actually controls after connection, mapping, and sync review. It stays honest and does not pretend every OTA is fully live.
                    </div>
                    <div className={styles.mappingTable} style={{ marginTop: 12 }}>
                      <div className={styles.mappingHeader}>Surface</div>
                      <div className={styles.mappingHeader}>Status</div>
                      <div className={styles.mappingHeader}>Reality</div>
                      {famloControlSurfaces.map((surface) => (
                        <Fragment key={surface.key}>
                          <div className={styles.mappingCell}>
                            <div className={styles.mappingTitle}>{surface.title}</div>
                          </div>
                          <div className={styles.mappingCell}>
                            <span className={`${styles.readinessPill} ${surface.tone}`}>{surface.status}</span>
                          </div>
                          <div className={styles.mappingCellMuted}>{surface.detail}</div>
                        </Fragment>
                      ))}
                    </div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>What this engine does now</div>
                    <div className={styles.stack}>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>One registry for every provider</div>
                        <div className={styles.feedCopy}>Booking.com, MakeMyTrip / Goibibo, Airbnb, Agoda, Expedia, and Google Hotel all use the same guided setup surface.</div>
                      </div>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>No fake connection state</div>
                        <div className={styles.feedCopy}>A provider only looks connected when real loaded readiness exists. Otherwise the card stays assisted or not started.</div>
                      </div>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Secure credential storage is live</div>
                        <div className={styles.feedCopy}>Assisted providers like MakeMyTrip / Goibibo can now store access tokens encrypted on the server without exposing them back to the browser.</div>
                      </div>
                    </div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Current Booking.com readiness</div>
                    <div className={styles.roomReadinessRow}>
                      <span className={currentChannelAttached ? styles.readinessPill + " " + styles.readinessPillOk : styles.readinessPill + " " + styles.readinessPillMissing}>
                        Property connected: {currentChannelAttached ? "Yes" : "No"}
                      </span>
                      <span className={bookingComRoomMatched ? styles.readinessPill + " " + styles.readinessPillOk : styles.readinessPill + " " + styles.readinessPillReview}>
                        Rooms matched: {roomMappingsReadyCount}/{activeRoomsCount || 0}
                      </span>
                      <span className={bookingComPriceMatched ? styles.readinessPill + " " + styles.readinessPillOk : styles.readinessPill + " " + styles.readinessPillReview}>
                        Prices matched: {rateMappingsReadyCount}/{activeRoomsCount || 0}
                      </span>
                      <span className={channelHealthNeedsAttention ? styles.readinessPill + " " + styles.readinessPillReview : styles.readinessPill + " " + styles.readinessPillOk}>
                        Sync review: {channelHealthNeedsAttention ? "Needs review" : "Clear"}
                      </span>
                    </div>
                    <div className={styles.feedCopy} style={{ marginTop: 12 }}>
                      {bookingComReadyForActivation
                        ? "The loaded Booking.com / Channex property is ready for an operator-approved activation review."
                        : "The loaded Booking.com / Channex property still needs readiness work, so activation remains disabled."}
                    </div>
                  </article>
                </div>

                {showChannelOperatorDiagnostics ? (
                  <details className={styles.operatorDetails}>
                    <summary className={styles.operatorSummary}>Advanced / Operator diagnostics</summary>
                    <div className={styles.listGrid}>
                      <article className={styles.listCard}>
                        <div className={styles.listTitle}>Channex / booking summary</div>
                        <div className={styles.roomStats}>
                          <div className={styles.miniStat}>
                            <div className={styles.miniLabel}>Connected channels</div>
                            <div className={styles.miniValue}>{currentChannelAttached ? 1 : 0}</div>
                          </div>
                          <div className={styles.miniStat}>
                            <div className={styles.miniLabel}>Property row</div>
                            <div className={styles.miniValue}>{primaryProperty?.externalPropertyId ? "Loaded" : "Missing"}</div>
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
                          <span className={channelHealthNeedsAttention ? styles.readinessPill + " " + styles.readinessPillReview : styles.readinessPill + " " + styles.readinessPillOk}>
                            {channelHealthNeedsAttention ? "Action needed" : "Sync healthy"}
                          </span>
                          <span className={(channelFeedHealth?.pendingManualReviewCount ?? 0) > 0 ? styles.readinessPill + " " + styles.readinessPillReview : styles.readinessPill + " " + styles.readinessPillOk}>
                            Famlo team review: {(channelFeedHealth?.pendingManualReviewCount ?? 0) > 0 ? "Needed" : "Not needed"}
                          </span>
                          <span className={ariHealth.statusLabel === "Synced" ? styles.readinessPill + " " + styles.readinessPillOk : styles.readinessPill + " " + styles.readinessPillReview}>
                            ARI: {ariHealth.statusLabel}
                          </span>
                        </div>
                        <div className={styles.feedCopy} style={{ marginTop: 12 }}>
                          {currentChannelAttached
                            ? "The loaded channel is " + (currentChannelReference ?? "not visible") + " and remains tied to the current staging property."
                            : "No connected channel data is available yet for this property."}
                        </div>
                      </article>

                      <article className={styles.listCard}>
                        <div className={styles.listTitle}>Booking.com staging checklist</div>
                        <div className={styles.mappingTable}>
                          <div className={styles.mappingHeader}>Item</div>
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
                                  <span className={ready ? styles.badge : styles.badge + " " + styles.badgeMuted}>
                                    {ready ? "Ready" : "Needs action"}
                                  </span>
                                </div>
                              </Fragment>
                            );
                          })}
                        </div>
                      </article>
                    </div>

                    <div className={styles.listGrid}>
                      <article className={styles.listCard}>
                        <div className={styles.listTitle}>Technical fields kept out of the host flow</div>
                        <div className={styles.stack}>
                          <div className={styles.feedItem}>
                            <div className={styles.feedTitle}>Last feed poll</div>
                            <div className={styles.feedCopy}>{formatDateTime(channelFeedHealth?.lastPollAt ?? null)}</div>
                          </div>
                          <div className={styles.feedItem}>
                            <div className={styles.feedTitle}>Active channel id</div>
                            <div className={styles.feedCopy}>{channelFeedHealth?.activeChannelId ?? "Missing"}</div>
                          </div>
                          <div className={styles.feedItem}>
                            <div className={styles.feedTitle}>Hotel id</div>
                            <div className={styles.feedCopy}>{channelFeedHealth?.hotelId ?? "Missing"}</div>
                          </div>
                          <div className={styles.feedItem}>
                            <div className={styles.feedTitle}>Attached count</div>
                            <div className={styles.feedCopy}>{channelFeedHealth?.accChannelsCount ?? 0}</div>
                          </div>
                          <div className={styles.feedItem}>
                            <div className={styles.feedTitle}>Last ARI range</div>
                            <div className={styles.feedCopy}>
                              {ariHealth.syncedDateRange
                                ? ariHealth.syncedDateRange.from + " → " + ariHealth.syncedDateRange.to
                                : "Not synced yet"}
                            </div>
                          </div>
                          <div className={styles.feedItem}>
                            <div className={styles.feedTitle}>Last ARI error</div>
                            <div className={styles.feedCopy}>{ariHealth.lastAriSyncError ?? "None"}</div>
                          </div>
                        </div>
                      </article>

                      <article className={styles.listCard}>
                        <div className={styles.listTitle}>Operator notes</div>
                        <div className={styles.stack}>
                          {getChannelProviderDefinition(activeChannelSetup ?? "booking").operatorNotes.map((note) => (
                            <div key={note} className={styles.feedItem}>
                              <div className={styles.feedCopy}>{note}</div>
                            </div>
                          ))}
                        </div>
                      </article>
                    </div>

                    <div className={styles.listGrid}>
                      <BookingComVerificationCard
                        familyId={familyId}
                        setupState={bookingSetupState}
                        externalPropertyId={primaryProperty?.externalPropertyId ?? null}
                        discoveredHotelId={channelFeedHealth?.hotelId ?? null}
                        activeChannelId={channelFeedHealth?.activeChannelId ?? channelAriHealth?.activeChannelId ?? null}
                        channelAttached={channelFeedHealth?.channelAttached ?? channelAriHealth?.channelAttached ?? false}
                        channelActive={channelFeedHealth?.channelActive ?? channelAriHealth?.channelActive ?? false}
                        attachedCount={channelFeedHealth?.accChannelsCount ?? channelAriHealth?.accChannelsCount ?? 0}
                      />
                      <BookingComAssistedChannelManagerCard
                        familyId={familyId}
                        setupState={bookingSetupState}
                        externalPropertyId={primaryProperty?.externalPropertyId ?? null}
                        channelAttached={channelFeedHealth?.channelAttached ?? channelAriHealth?.channelAttached ?? false}
                        channelActive={channelFeedHealth?.channelActive ?? channelAriHealth?.channelActive ?? false}
                        activeRoomsCount={activeRooms.length}
                        roomMappingsReadyCount={roomMappingsReadyCount}
                        ratePlansReadyCount={rateMappingsReadyCount}
                        missingRoomMappings={missingRoomMappingNames}
                        missingRatePlans={missingRatePlanNames}
                        lastCreatePropertyLog={lastCreatePropertyLog}
                        lastCreateRoomTypeLog={lastCreateRoomTypeLog}
                        lastCreateRatePlanLog={lastCreateRatePlanLog}
                        lastLimitedAriSyncLog={lastLimitedAriSyncLog}
                        lastBookingFeedLog={lastBookingFeedLog}
                        lastAssistedGoLiveLog={lastAssistedGoLiveLog}
                        bookingRevisionsCount={channelFoundation.bookingRevisions.length}
                      />
                    </div>

                    <div className={styles.listGrid}>
                      {CHANNEL_PROVIDER_REGISTRY.filter((provider) => provider.key !== "booking").map((provider) => (
                        <ProviderOperatorVerificationCard
                          key={provider.key}
                          familyId={familyId}
                          providerKey={provider.key}
                          setupState={channelSetupStatesByKey[provider.key]}
                          channexPropertyId={primaryProperty?.externalPropertyId ?? null}
                          readinessModel={channelReadinessModelsByKey[provider.key]}
                          testSyncReadiness={channelTestSyncReadinessByKey[provider.key]}
                          goLiveReadiness={channelGoLiveReadinessByKey[provider.key]}
                          activeRoomsCount={activeRoomsCount}
                          roomMappingsReadyCount={roomMappingsReadyCount}
                          rateMappingsReadyCount={rateMappingsReadyCount}
                        />
                      ))}
                    </div>

                    <div className={styles.listGrid}>
                      <article className={styles.listCard}>
                        <div className={styles.listTitle}>Read-only operator review panel</div>
                        <div className={styles.cardCopy}>
                          Safe review queue for channel setup and go-live requests. This panel is read-only and does not approve or activate any channel.
                        </div>
                        <div className={styles.mappingTable} style={{ marginTop: 12 }}>
                          <div className={styles.mappingHeader}>Provider</div>
                          <div className={styles.mappingHeader}>Safe details</div>
                          <div className={styles.mappingHeader}>Setup / Go-live</div>
                          <div className={styles.mappingHeader}>Go-live requested</div>
                          <div className={styles.mappingHeader}>Test sync requested</div>
                          <div className={styles.mappingHeader}>Matching / Test sync</div>
                          <div className={styles.mappingHeader}>Blockers</div>
                          <div className={styles.mappingHeader}>Next action</div>
                          {channelOperatorReviewRows.map((row) => (
                            <Fragment key={row.providerKey}>
                              <div className={styles.mappingCell}>
                                <div className={styles.mappingTitle}>{row.providerName}</div>
                                <div className={styles.mappingSubcopy}>{row.propertyName}</div>
                              </div>
                              <div className={styles.mappingCell}>
                                <div className={styles.mappingSubcopy}>{row.providerReference}</div>
                              </div>
                              <div className={styles.mappingCell}>
                                <div className={styles.mappingTitle}>{row.setupStatus}</div>
                                <div className={styles.mappingSubcopy}>{row.goLiveStatus}</div>
                              </div>
                              <div className={styles.mappingCell}>
                                <div className={styles.mappingTitle}>{row.reviewRequested}</div>
                                <div className={styles.mappingSubcopy}>{row.requestedAt}</div>
                              </div>
                              <div className={styles.mappingCell}>
                                <div className={styles.mappingTitle}>{row.testSyncRequested}</div>
                                <div className={styles.mappingSubcopy}>{row.testSyncRequestedAt}</div>
                              </div>
                              <div className={styles.mappingCell}>
                                <div className={styles.mappingTitle}>{row.roomMatchingStatus}</div>
                                <div className={styles.mappingSubcopy}>{row.priceMatchingStatus}</div>
                                <div className={styles.mappingSubcopy} style={{ marginTop: 4 }}>
                                  {row.testSyncStatus}
                                </div>
                              </div>
                              <div className={styles.mappingCell}>
                                <div className={styles.mappingSubcopy}>{row.blockers.join(" · ")}</div>
                              </div>
                              <div className={styles.mappingCell}>
                                <div className={styles.mappingTitle}>{row.nextAction}</div>
                              </div>
                            </Fragment>
                          ))}
                        </div>
                      </article>
                    </div>
                  </details>
                ) : null}
              </div>
            </section>
          )}
          {activeSection === "room-mapping" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Room Matching</h3>
                  <p className={styles.cardCopy}>
                    This matches your Famlo rooms with connected OTA room records. Setup actions stay under Advanced so hosts do not accidentally run operator tools.
                  </p>
                </div>
                <span className={`${styles.badge} ${currentChannelAttached ? "" : styles.badgeMuted}`.trim()}>
                  {currentChannelAttached ? "Channel connected" : "Needs channel connection"}
                </span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.mappingTable}>
                  <div className={styles.mappingHeader}>Famlo Room</div>
                  <div className={styles.mappingHeader}>OTA Room</div>
                  <div className={styles.mappingHeader}>Status</div>
                  {roomMappingRows.map(({ room, mapping, providerRoomType, statusLabel }) => {
                    const displayStatus = !currentChannelAttached
                      ? mapping?.externalRoomTypeId ? "Prepared" : "Needs channel connection"
                      : mapping?.externalRoomTypeId ? "Matched" : statusLabel === "Not mapped" ? "Needs review" : statusLabel;
                    return (
                      <Fragment key={room.id}>
                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>{room.name}</div>
                          <div className={styles.mappingSubcopy}>{room.unitType || "Famlo inventory unit"}</div>
                        </div>
                        <div className={styles.mappingCellMuted}>{mapping?.externalRoomTypeId ? providerRoomType : "Connect channel before final matching"}</div>
                        <div className={styles.mappingCell}>
                          <span className={`${styles.badge} ${mapping?.externalRoomTypeId && currentChannelAttached ? "" : styles.badgeMuted}`.trim()}>
                            {displayStatus}
                          </span>
                        </div>
                      </Fragment>
                    );
                  })}
                </div>
                <details className={styles.operatorDetails}>
                  <summary className={styles.operatorSummary}>Advanced / Operator tools</summary>
                  <ChannexRoomTypeBatchCard
                    familyId={familyId}
                    propertyCreated={canCreateRoomTypes}
                  />
                </details>
              </div>
            </section>
          )}

          {activeSection === "rate-mapping" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Price Matching</h3>
                  <p className={styles.cardCopy}>
                    This matches your Famlo room price with the connected OTA rate plan. It does not create channel-wise pricing in this phase.
                  </p>
                </div>
                <span className={`${styles.badge} ${currentChannelAttached ? "" : styles.badgeMuted}`.trim()}>
                  {currentChannelAttached ? "Channel connected" : "Needs channel connection"}
                </span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.mappingTable}>
                  <div className={styles.mappingHeader}>Famlo Rate</div>
                  <div className={styles.mappingHeader}>OTA Rate Plan</div>
                  <div className={styles.mappingHeader}>Status</div>
                  {rateMappingRows.map(({ room, ratePlan, providerRatePlan, statusLabel }) => {
                    const displayStatus = !currentChannelAttached
                      ? ratePlan?.externalRatePlanId ? "Prepared" : "Needs channel connection"
                      : ratePlan?.externalRatePlanId ? "Matched" : statusLabel === "Not mapped" ? "Needs review" : statusLabel;
                    return (
                      <Fragment key={room.id}>
                        <div className={styles.mappingCell}>
                          <div className={styles.mappingTitle}>{standardRatePlanName}</div>
                          <div className={styles.mappingSubcopy}>{room.name}</div>
                        </div>
                        <div className={styles.mappingCellMuted}>{ratePlan?.externalRatePlanId ? providerRatePlan : "Connect channel before final price matching"}</div>
                        <div className={styles.mappingCell}>
                          <span className={`${styles.badge} ${ratePlan?.externalRatePlanId && currentChannelAttached ? "" : styles.badgeMuted}`.trim()}>
                            {displayStatus}
                          </span>
                        </div>
                      </Fragment>
                    );
                  })}
                </div>
                <details className={styles.operatorDetails}>
                  <summary className={styles.operatorSummary}>Advanced / Operator tools</summary>
                  <ChannexRatePlanBatchCard
                    familyId={familyId}
                    propertyCreated={canCreateRoomTypes}
                    roomTypesCreated={canCreateRatePlans}
                  />
                </details>
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
                            className={`${styles.readinessPill} ${item.severity === "critical"
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
            <section className={`${styles.propertyCenterShell} ${styles.propertyCenterShellLuxury}`}>
              <div>
                <h3 className={styles.propertyCenterTitle}>Bookings</h3>
              </div>
              <div className={styles.cardBody}>


                <div className={styles.filterRow}>
                  {BOOKING_FILTERS.map((filter) => {
                    const active = bookingFilter === filter;
                    const count = filter === "All"
                      ? totalBookingsCount
                      : filter === "Famlo Direct"
                        ? famloDirectBookingsCount
                        : filter === "OTA"
                          ? otaBookingsCount
                          : filter === "Pending approval"
                            ? pendingApprovalBookingsCount
                            : filter === "Confirmed"
                              ? confirmedBookingsCount
                              : filter === "Cancelled"
                                ? cancelledBookingsCount
                                : filter === "Modified / Review needed"
                                  ? modifiedReviewBookingsCount
                                  : filter === "Action needed"
                                    ? actionNeededBookingsCount
                                    : 0;

                    return (
                      <button
                        key={filter}
                        type="button"
                        className={`${styles.propertyTabLinkButton} ${active ? styles.propertyTabLinkButtonActive : ""}`}
                        onClick={() => setBookingFilter(filter)}
                      >
                        <span className={styles.propertyTabText}>
                          <span className={styles.propertyTabTitle}>{filter} ({count})</span>
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
                <div className={styles.listGrid} style={{ marginTop: "24px" }}>
                  <article className={styles.listCard} style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                    <div className={styles.listTitle} style={{ color: "#ffffff" }}>Date Filters</div>
                    <div style={{ display: "grid", gap: "14px" }}>
                      {BOOKING_DATE_FILTERS.map((filter) => {
                        const active = bookingDateFilter === filter;
                        return (
                          <button
                            key={filter}
                            type="button"
                            onClick={() => setBookingDateFilter(filter)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "14px",
                              background: "transparent",
                              border: "none",
                              color: active ? "#ffffff" : "rgba(255, 255, 255, 0.62)",
                              padding: 0,
                              cursor: "pointer",
                              textAlign: "left",
                              fontSize: "16px",
                              fontWeight: active ? 800 : 600,
                            }}
                          >
                            <span
                              style={{
                                width: "18px",
                                height: "18px",
                                borderRadius: "999px",
                                border: active ? "5px solid #4f5bd5" : "2px solid rgba(255, 255, 255, 0.62)",
                                boxSizing: "border-box",
                                flexShrink: 0,
                                background: active ? "#ffffff" : "transparent",
                              }}
                            />
                            <span>{filter}</span>
                          </button>
                        );
                      })}
                    </div>
                  </article>
                  <article className={styles.listCard} style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                    <div className={styles.listTitle} style={{ color: "#ffffff" }}>Current booking view</div>
                    <div className={styles.feedCopy} style={{ color: "rgba(255, 255, 255, 0.62)" }}>
                      {bookingDateFilter === "Check-in"
                        ? "Bookings are ordered by check-in date."
                        : bookingDateFilter === "Check-out"
                          ? "Bookings are ordered by check-out date."
                          : bookingDateFilter === "Booking Dates"
                            ? "Bookings are ordered by the date they were created."
                            : "Only bookings that are staying today are shown."}
                    </div>
                  </article>
                </div>
                {proBookings.length > 0 ? (
                  <>
                    <div className={styles.propertiesRoomShowcaseGrid} style={{ marginTop: "24px" }}>
                      {filteredProBookings.map((booking) => {
                        const linkedRoom = booking.roomId ? roomById.get(booking.roomId) ?? null : null;
                        const isActionNeeded = isActionNeededBooking(booking);
                        const isCancelled = booking.status === "cancelled" || booking.status === "cancelled_by_guest" || booking.status === "cancelled_by_host";
                        const healthLabel = bookingHealthLabel(booking);
                        const paymentStatus = labelizeToken(booking.paymentStatus, "unknown");
                        const bookingStatus = labelizeToken(booking.status, "unknown");
                        const isExpanded = expandedBookingId === booking.bookingId;
                        const canHostCancel = !booking.isOta && !isCancelled;

                        return (
                          <div
                            key={booking.bookingId}
                            className={styles.propertyRoomShowcaseCard}
                            style={{ display: "flex", flexDirection: "column", height: "100%" }}
                          >
                            {/* Visual Card Banner representation */}
                            <div
                              className={styles.propertyRoomShowcaseMedia}
                              style={{
                                backgroundImage: linkedRoom?.photoUrl
                                  ? `linear-gradient(180deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.84)), url(${linkedRoom.photoUrl})`
                                  : booking.isOta
                                    ? "linear-gradient(135deg, rgba(37, 99, 235, 0.18) 0%, rgba(30, 58, 138, 0.92) 100%)"
                                    : "linear-gradient(135deg, rgba(16, 185, 129, 0.18) 0%, rgba(6, 78, 59, 0.92) 100%)",
                                aspectRatio: "16 / 10",
                                padding: "20px",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "space-between",
                              }}
                            >
                              <div className={styles.propertyRoomShowcaseTopRow}>
                                <span className={styles.propertyRoomTypePill} style={{ background: booking.isOta ? "#2563eb" : "#10b981", color: "#ffffff", padding: "4px 10px", fontSize: "10px" }}>
                                  {booking.sourceLabel}
                                </span>
                                <span
                                  className={`${styles.propertyRoomStatePill} ${isCancelled ? styles.propertyRoomStatePillMuted : styles.propertyRoomStatePillActive
                                    }`}
                                  style={{
                                    background: isCancelled ? "rgba(239, 68, 68, 0.2)" : isActionNeeded ? "rgba(245, 158, 11, 0.2)" : "rgba(16, 185, 129, 0.2)",
                                    color: isCancelled ? "#ef4444" : isActionNeeded ? "#f59e0b" : "#10b981",
                                    border: isCancelled ? "1px solid rgba(239, 68, 68, 0.3)" : isActionNeeded ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid rgba(16, 185, 129, 0.3)",
                                    padding: "4px 10px",
                                    fontSize: "10px"
                                  }}
                                >
                                  {bookingStatus}
                                </span>
                              </div>

                              <div className={styles.propertyRoomShowcaseBottom}>
                                <div className={styles.propertyRoomShowcaseTitle} style={{ fontSize: "20px", fontWeight: 800 }}>
                                  {booking.guestDisplayName}
                                </div>
                                <div className={styles.propertyRoomShowcasePrice} style={{ fontSize: "18px", color: "#ffffff", fontWeight: 800 }}>
                                  {booking.amount ?? "Amount pending"}
                                  <span style={{ fontSize: "12px", opacity: 0.8, color: "#cbd5e1", fontWeight: 500 }}> / stay</span>
                                </div>
                                <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.78)", fontWeight: 700 }}>
                                  {booking.netPayoutAmount != null ? `Net payout ${formatCurrency(booking.netPayoutAmount)}` : "Net payout pending"}
                                </div>
                              </div>
                            </div>

                            {/* Card Details Body */}
                            <div className={styles.propertyRoomShowcaseBody} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px", flexGrow: 1 }}>
                              <div className={styles.propertyRoomShowcaseChips} style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                <span className={styles.propertyRoomChip} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                  <CalendarDays size={13} /> {booking.startDate} → {booking.endDate}
                                </span>
                                <span className={styles.propertyRoomChip}>
                                  Room: {booking.roomName}
                                </span>
                                <span className={styles.propertyRoomChip}>
                                  Payment: {paymentStatus}
                                </span>
                              </div>

                              {isExpanded ? (
                                <div
                                  style={{
                                    fontSize: "12px",
                                    color: "rgba(255, 255, 255, 0.72)",
                                    display: "grid",
                                    gap: "8px",
                                    padding: "14px",
                                    borderRadius: "16px",
                                    background: "rgba(255, 255, 255, 0.04)",
                                    border: "1px solid rgba(255, 255, 255, 0.08)",
                                  }}
                                >
                                  <div>Booking status: {bookingStatus}</div>
                                  <div>
                                    {booking.isOta
                                      ? `OTA import ${labelizeToken(booking.importStatus, "preview")} and acknowledgement ${labelizeToken(booking.ackStatus, "not_acknowledged")}.`
                                      : "Direct Famlo booking inside the host workspace."}
                                  </div>
                                  {booking.netPayoutAmount != null ? <div>Net payout: {formatCurrency(booking.netPayoutAmount)}</div> : null}
                                </div>
                              ) : null}

                              {/* Card Footer badges & action row */}
                              <div className={styles.propertyRoomShowcaseFooter} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginTop: "auto", paddingTop: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
                                <div className={styles.propertyRoomFooterBadges} style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                  <span className={`${styles.readinessPill} ${isActionNeeded ? styles.readinessPillReview : styles.readinessPillOk}`}>
                                    {healthLabel}
                                  </span>
                                  {booking.isOta && (
                                    <>
                                      <span className={styles.readinessPill}>Import: {labelizeToken(booking.importStatus, "preview")}</span>
                                      <span className={styles.readinessPill}>Ack: {labelizeToken(booking.ackStatus, "not_acknowledged")}</span>
                                    </>
                                  )}
                                </div>

                                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                  {canHostCancel ? (
                                    <button
                                      type="button"
                                      className={styles.secondaryActionButton}
                                      onClick={() => void handleHostBookingCancel(booking)}
                                      disabled={cancellingBookingId === booking.bookingId}
                                      style={{
                                        border: "1px solid rgba(239, 68, 68, 0.24)",
                                        background: "rgba(239, 68, 68, 0.08)",
                                        color: "#fecaca",
                                        borderRadius: "12px",
                                        padding: "8px 16px",
                                        fontSize: "12px",
                                        fontWeight: 700,
                                        cursor: "pointer",
                                        transition: "all 0.2s ease",
                                        opacity: cancellingBookingId === booking.bookingId ? 0.7 : 1,
                                      }}
                                    >
                                      {cancellingBookingId === booking.bookingId ? "Cancelling..." : "Cancel"}
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className={styles.secondaryActionButton}
                                    onClick={() => setExpandedBookingId((current) => (current === booking.bookingId ? null : booking.bookingId))}
                                    style={{
                                      border: "1px solid rgba(255, 255, 255, 0.15)",
                                      background: "rgba(255, 255, 255, 0.05)",
                                      color: "#ffffff",
                                      borderRadius: "12px",
                                      padding: "8px 16px",
                                      fontSize: "12px",
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      transition: "all 0.2s ease"
                                    }}
                                  >
                                    {isExpanded ? "Hide details" : "Details"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
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

                {bookingActionFeedback ? (
                  <div className={styles.listGrid}>
                    <article className={styles.listCard}>
                      <div className={styles.listTitle}>{bookingActionFeedback.type === "success" ? "Booking updated" : "Booking action failed"}</div>
                      <div className={styles.feedCopy}>{bookingActionFeedback.text}</div>
                    </article>
                  </div>
                ) : null}

              </div>
            </section>
          )}

          {activeSection === "messages-reviews" && (
            <section className={`${styles.propertyCenterShell} ${styles.propertyCenterShellLuxury} ${styles.proLuxurySection}`}>
              <div>
                <h3 className={styles.propertyCenterTitle}>Messages</h3>
              </div>
              <div className={styles.cardBody} style={{ padding: 0 }}>
                {hostUserId ? (
                  <div className={styles.listCard} style={{ padding: 0, overflow: "hidden", border: "none" }}>
                    <MessagesTab
                      familyId={familyId}
                      hostUserId={hostUserId}
                      activeFamily={{ property_name: propertyName }}
                      initialConversationId={activeMessageConversationId}
                      setActiveConversationId={setActiveMessageConversationId}
                    />
                  </div>
                ) : (
                  <div style={{ padding: "22px" }}>
                    <article className={styles.listCard}>
                      <div className={styles.listTitle}>Messages are being upgraded</div>
                      <div className={styles.feedCopy}>
                        We could not safely resolve the authenticated host inbox in this Pro session, so use the working Basic inbox.
                      </div>
                    </article>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeSection === "host-profile" && (
            <section className={`${styles.propertyCenterShell} ${styles.propertyCenterShellLuxury} ${styles.proLuxurySection}`}>
              <div>
                <div className={styles.sectionEyebrow}>Host Profile</div>
                <h3 className={styles.propertyCenterTitle}>Shared host identity in the same Pro glass style</h3>
                <p className={styles.heroText}>
                  Keep the shared host account, contact identity, and workspace ownership details in the same premium
                  shell as the rest of Famlo Pro.
                </p>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.listGrid}>
                  <article className={`${styles.listCard} ${styles.hostProfileIdentityCard}`}>
                    <div className={styles.listTitle}>Shared host identity</div>
                    <div className={styles.hostProfileMetaGrid}>
                      {hostProfilePhotoUrl ? (
                        <div className={styles.hostProfileMetaItem}>
                          <span className={styles.hostProfileMetaLabel}>Host photo</span>
                          <img src={hostProfilePhotoUrl} alt={hostProfile.hostName} style={{ width: 72, height: 72, borderRadius: 18, objectFit: "cover", marginTop: 8 }} />
                        </div>
                      ) : null}
                      <div className={styles.hostProfileMetaItem}>
                        <span className={styles.hostProfileMetaLabel}>Host name</span>
                        <span className={styles.hostProfileMetaValue}>{hostProfile.hostName}</span>
                      </div>
                      <div className={styles.hostProfileMetaItem}>
                        <span className={styles.hostProfileMetaLabel}>Host account</span>
                        <span className={styles.hostProfileMetaValue}>{hostProfile.accountLabel ?? "Same Famlo host workspace"}</span>
                      </div>
                      <div className={styles.hostProfileMetaItem}>
                        <span className={styles.hostProfileMetaLabel}>Contact</span>
                        <span className={styles.hostProfileMetaValue}>{sharedHostContactLabel}</span>
                      </div>
                      <div className={styles.hostProfileMetaItem}>
                        <span className={styles.hostProfileMetaLabel}>Properties owned</span>
                        <span className={styles.hostProfileMetaValue}>{hostWorkspacePropertyCount}</span>
                      </div>
                      <div className={styles.hostProfileMetaItem}>
                        <span className={styles.hostProfileMetaLabel}>Selected property</span>
                        <span className={styles.hostProfileMetaValue}>{hostProfile.selectedPropertyName}</span>
                      </div>
                    </div>
                    <div className={styles.feedCopy} style={{ marginTop: 16 }}>
                      {hostProfile.sharedIdentityNote} New properties should start with this host identity as the default.
                    </div>
                    <div className={styles.inlineActionRow}>
                      <Link
                        href={`/partnerslogin/home/dashboard?tab=profile&family=${encodeURIComponent(familyId)}`}
                        className={styles.primaryActionLink}
                      >
                        Edit Shared Host Profile
                      </Link>
                      <Link
                        href={`/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(familyId)}&section=ota-content`}
                        className={styles.secondaryActionLink}
                      >
                        Edit This Property’s Host Presence
                      </Link>
                    </div>
                  </article>

                  <article className={styles.listCard}>
                    <div className={styles.listTitle}>Shared identity note</div>
                    <div className={styles.stack}>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>One host, multiple properties</div>
                        <div className={styles.feedCopy}>
                          The same host account can own multiple properties inside one Famlo Pro workspace, while each property keeps its own local story, gallery, rooms, pricing, and channels.
                        </div>
                      </div>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Property-specific presence stays separate</div>
                        <div className={styles.feedCopy}>
                          Use each property’s Content &amp; Photos area to shape that property’s vibe and presentation without changing the shared host identity above.
                        </div>
                      </div>
                    </div>
                  </article>
                </div>

                <div className={styles.listCard}>
                  <div className={styles.listTitle}>Properties in this host workspace</div>
                  <div className={styles.feedCopy} style={{ marginBottom: 12 }}>
                    Open any property below to manage its rooms, content, pricing, and channels in the same Famlo Pro workspace.
                  </div>
                  <div className={styles.mappingTable}>
                    <div className={styles.mappingHeader}>Property</div>
                    <div className={styles.mappingHeader}>Location</div>
                    <div className={styles.mappingHeader}>Status</div>
                    <div className={styles.mappingHeader}>Active rooms</div>
                    <div className={styles.mappingHeader}>Famlo Pro</div>
                    <div className={styles.mappingHeader}>Actions</div>
                    {propertyOptions.map((option) => {
                      const optionLocation = [option.locality, option.city, option.state, option.country].filter(Boolean).join(", ") || "Location pending";
                      const isSelected = option.familyId === familyId;
                      return (
                        <Fragment key={`host-profile-${option.familyId}`}>
                          <div className={styles.mappingCell}>
                            <div className={styles.mappingTitle}>{option.name}</div>
                            <div className={styles.mappingSubcopy}>{isSelected ? "Currently selected" : "Same host workspace"}</div>
                          </div>
                          <div className={styles.mappingCell}>
                            <div className={styles.mappingTitle}>{optionLocation}</div>
                            <div className={styles.mappingSubcopy}>{isSelected ? "Selected property" : "Property context"}</div>
                          </div>
                          <div className={styles.mappingCell}>
                            <div className={styles.mappingTitle}>{option.isActive ? "Active" : "Inactive"}</div>
                            <div className={styles.mappingSubcopy}>{option.isActive ? "Visible in workspace" : "Needs activation review"}</div>
                          </div>
                          <div className={styles.mappingCell}>
                            <div className={styles.mappingTitle}>{option.activeRoomCount}</div>
                            <div className={styles.mappingSubcopy}>Active room{option.activeRoomCount === 1 ? "" : "s"}</div>
                          </div>
                          <div className={styles.mappingCell}>
                            <div className={styles.mappingTitle}>{formatPropertySwitcherStatusLabel(option.famloPlusStatus)}</div>
                            <div className={styles.mappingSubcopy}>{isSelected ? "Current Pro context" : "Shared Pro workspace"}</div>
                          </div>
                          <div className={styles.mappingCell}>
                            <div className={styles.inlineActionRow} style={{ marginTop: 0 }}>
                              <Link
                                href={`/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(option.familyId)}&section=properties-home`}
                                className={isSelected ? styles.secondaryActionLink : styles.primaryActionLink}
                              >
                                {isSelected ? "Current property" : "Open in Pro"}
                              </Link>
                              <Link
                                href={`/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(option.familyId)}&section=ota-content`}
                                className={styles.secondaryActionLink}
                              >
                                Edit property presence
                              </Link>
                            </div>
                          </div>
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === "revenue" && (
            <section className={`${styles.propertyCenterShell} ${styles.propertyCenterShellLuxury} ${styles.proLuxurySection}`}>
              <div>
                <div className={styles.sectionEyebrow}>Revenue</div>
                <h3 className={styles.propertyCenterTitle}>Revenue</h3>
                <p className={styles.heroText}>
                  Keep one active time lens in focus while the important PMS numbers stay fixed underneath.
                </p>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.filterRow} style={{ marginBottom: "24px" }}>
                  {REVENUE_WINDOWS.map((window) => (
                    <button
                      key={window}
                      type="button"
                      className={`${styles.propertyTabLinkButton} ${revenueWindow === window ? styles.propertyTabLinkButtonActive : ""}`}
                      onClick={() => setRevenueWindow(window)}
                    >
                      <span className={styles.propertyTabTitle}>{window}</span>
                    </button>
                  ))}
                </div>
                <div className={styles.listGrid}>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>{revenueWindow}</div>
                    <div className={styles.metricValue}>{formatCurrency(selectedRevenueNetPayout)}</div>
                    <div className={styles.metricHint}>
                      {selectedRevenueBookings.length} booking{selectedRevenueBookings.length === 1 ? "" : "s"} · {selectedRevenueWindowHint}
                    </div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>{revenueWindow} gross value</div>
                    <div className={styles.metricValue}>{formatCurrency(selectedRevenueGrossValue)}</div>
                    <div className={styles.metricHint}>What guests paid in the selected time window before payout split.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>All time</div>
                    <div className={styles.metricValue}>{formatCurrency(totalNetPayout)}</div>
                    <div className={styles.metricHint}>Static net payout anchor across all eligible visible bookings.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>This month</div>
                    <div className={styles.metricValue}>{formatCurrency(revenueThisMonthNetPayout)}</div>
                    <div className={styles.metricHint}>Static monthly payout reference for the current month.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Pending payout</div>
                    <div className={styles.metricValue}>{formatCurrency(pendingNetPayout)}</div>
                    <div className={styles.metricHint}>Expected payout still waiting on approval or payment.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Direct / OTA</div>
                    <div className={styles.metricValue}>
                      {formatCurrency(famloDirectBookingValue)} / {formatCurrency(otaBookingValue)}
                    </div>
                    <div className={styles.metricHint}>Gross booking split by source for quick comparison.</div>
                  </article>
                </div>

                <hr style={{ border: 0, height: "1px", background: "rgba(255, 255, 255, 0.1)", margin: "32px 0" }} />

                {selectedRevenueBookings.length > 0 ? (
                  <div className={styles.listGrid}>
                    {selectedRevenueBookings.map((booking) => (
                      <article key={`revenue-${booking.bookingId}`} className={styles.listCard} style={{ padding: "20px", display: "grid", gap: "16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
                          <div>
                            <div className={styles.listTitle}>{booking.guestDisplayName}</div>
                            <div className={styles.feedCopy}>{booking.roomName}</div>
                          </div>
                          <div>
                            <div className={styles.listTitle}>{booking.amount ?? "Not available"}</div>
                            <div className={styles.feedCopy}>
                              {booking.netPayoutAmount != null ? `Net payout ${formatCurrency(booking.netPayoutAmount)}` : "Net payout not available"}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
                          <div>
                            <div className={styles.miniLabel}>Guest</div>
                            <div className={styles.feedCopy}>{booking.guestDisplayName}</div>
                          </div>
                          <div>
                            <div className={styles.miniLabel}>Source</div>
                            <div className={styles.feedCopy}>{booking.sourceLabel}</div>
                          </div>
                          <div>
                            <div className={styles.miniLabel}>Dates</div>
                            <div className={styles.feedCopy}>{formatCalendarDetailDateRange(booking.startDate, booking.endDate)}</div>
                          </div>
                          <div>
                            <div className={styles.miniLabel}>Paid amount</div>
                            <div className={styles.feedCopy}>{booking.amount ?? "Not available"}</div>
                          </div>
                          <div>
                            <div className={styles.miniLabel}>Payment</div>
                            <div className={styles.feedCopy}>{labelizeToken(booking.paymentStatus, "unknown")}</div>
                          </div>
                          <div>
                            <div className={styles.miniLabel}>Status</div>
                            <div className={styles.feedCopy}>{labelizeToken(booking.status, "unknown")}</div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyTitle}>No revenue bookings in this view yet</div>
                    <div className={styles.emptyCopy}>
                      Switch the revenue filter above to another time window, or wait for direct and OTA bookings to land in this selected range.
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeSection === "reports" && (
            <section className={`${styles.propertyCenterShell} ${styles.propertyCenterShellLuxury} ${styles.proLuxurySection}`}>
              <div>
                <h3 className={styles.propertyCenterTitle}>Reports</h3>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.filterRow} style={{ marginBottom: "24px" }}>
                  {REPORT_WINDOWS.map((window) => (
                    <button
                      key={window}
                      type="button"
                      className={`${styles.propertyTabLinkButton} ${reportWindow === window ? styles.propertyTabLinkButtonActive : ""}`}
                      onClick={() => setReportWindow(window)}
                    >
                      <span className={styles.propertyTabTitle}>{window}</span>
                    </button>
                  ))}
                </div>

                <div className={styles.listGrid} style={{ marginBottom: "24px" }}>
                  <article className={styles.listCard} style={{ gridColumn: "1 / -1", display: "grid", gap: "18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
                      <div>
                        <div className={styles.listTitle}>Booking trend</div>
                        <div className={styles.feedCopy}>
                          Blue shows Famlo Direct. Green shows OTA bookings. The selected filter changes the timeline.
                        </div>
                      </div>
                      <div className={styles.inlineBadgeRow} style={{ marginTop: 0 }}>
                        <span className={styles.readinessPill} style={{ background: "rgba(37, 99, 235, 0.16)", color: "#93c5fd", borderColor: "rgba(59, 130, 246, 0.35)" }}>
                          Famlo Direct
                        </span>
                        <span className={styles.readinessPill} style={{ background: "rgba(16, 185, 129, 0.14)", color: "#6ee7b7", borderColor: "rgba(16, 185, 129, 0.35)" }}>
                          OTA
                        </span>
                      </div>
                    </div>
                    <div style={{ position: "relative", borderRadius: "20px", border: "1px solid rgba(255, 255, 255, 0.08)", background: "linear-gradient(180deg, rgba(15, 23, 42, 0.88) 0%, rgba(11, 18, 32, 0.98) 100%)", padding: "18px" }}>
                      <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 36}`} style={{ width: "100%", height: "280px", display: "block" }} role="img" aria-label="Booking trend chart">
                        {[0, 1, 2, 3].map((step) => {
                          const y = (chartHeight / 3) * step;
                          return (
                            <line
                              key={`grid-${step}`}
                              x1="0"
                              y1={y}
                              x2={chartWidth}
                              y2={y}
                              stroke="rgba(148, 163, 184, 0.18)"
                              strokeWidth="1"
                            />
                          );
                        })}
                        {reportTrendRows.map((row, index) => {
                          const x = reportTrendRows.length === 1 ? chartWidth / 2 : (index / (reportTrendRows.length - 1)) * chartWidth;
                          return (
                            <g key={row.key}>
                              <line
                                x1={x}
                                y1="0"
                                x2={x}
                                y2={chartHeight}
                                stroke="rgba(148, 163, 184, 0.08)"
                                strokeWidth="1"
                              />
                              <text
                                x={x}
                                y={chartHeight + 22}
                                textAnchor="middle"
                                fill="rgba(226, 232, 240, 0.72)"
                                fontSize="11"
                                fontWeight="700"
                              >
                                {row.label}
                              </text>
                            </g>
                          );
                        })}
                        {directTrendPath ? (
                          <path
                            d={directTrendPath}
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ) : null}
                        {otaTrendPath ? (
                          <path
                            d={otaTrendPath}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ) : null}
                        {reportTrendRows.map((row, index) => {
                          const x = reportTrendRows.length === 1 ? chartWidth / 2 : (index / (reportTrendRows.length - 1)) * chartWidth;
                          const directY = chartHeight - (row.directCount / Math.max(reportMaxCount, 1)) * chartHeight;
                          const otaY = chartHeight - (row.otaCount / Math.max(reportMaxCount, 1)) * chartHeight;
                          return (
                            <g key={`dots-${row.key}`}>
                              <circle cx={x} cy={directY} r="5" fill="#3b82f6" />
                              <circle cx={x} cy={otaY} r="5" fill="#10b981" />
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  </article>
                </div>

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
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Average booking value</div>
                    <div className={styles.metricValue}>{averageBookingValue != null ? formatCurrency(averageBookingValue) : "N/A"}</div>
                    <div className={styles.metricHint}>Average gross booking value across bookings that expose a safe amount.</div>
                  </article>
                  <article className={styles.summaryCard}>
                    <div className={styles.miniLabel}>Top source</div>
                    <div className={styles.metricValue}>{topSourceByBookingCount ? topSourceByBookingCount[0] : "N/A"}</div>
                    <div className={styles.metricHint}>
                      {topSourceByBookingCount
                        ? `${topSourceByBookingCount[1]} booking${topSourceByBookingCount[1] === 1 ? "" : "s"} currently come from this source.`
                        : "No source leader yet."}
                    </div>
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
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderTitle}>Famlo Direct average</div>
                        <div className={styles.placeholderValue}>{directAverageBookingValue != null ? formatCurrency(directAverageBookingValue) : "Not available"}</div>
                        <div className={styles.placeholderCopy}>Average booking value for direct Famlo reservations only.</div>
                      </div>
                      <div className={styles.placeholderRow}>
                        <div className={styles.placeholderTitle}>OTA average</div>
                        <div className={styles.placeholderValue}>{otaAverageBookingValue != null ? formatCurrency(otaAverageBookingValue) : "Not available"}</div>
                        <div className={styles.placeholderCopy}>Average booking value for OTA-connected reservations only.</div>
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
                    Property story and host presence for this property. This can be different from the shared Host Profile.
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
                    Use this to shape how this property appears on Famlo. For multi-property hosts, each property can have its own story, vibe, gallery, and host presence without changing the shared Host Profile.
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
            <section className={`${styles.propertyCenterShell} ${styles.propertyCenterShellLuxury} ${styles.proLuxurySection}`}>
              <div>
                <div className={styles.sectionEyebrow}>Settings</div>
                <h3 className={styles.propertyCenterTitle}>Operational settings in the glass Pro system</h3>
                <p className={styles.heroText}>
                  Save OTA-readiness and property operations without dropping out of the same premium Famlo Pro design language.
                </p>
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
            <section className={`${styles.propertyCenterShell} ${styles.propertyCenterShellLuxury} ${styles.proLuxurySection}`}>
              <div>
                <div className={styles.sectionEyebrow}>Support</div>
                <h3 className={styles.propertyCenterTitle}>Support that matches the rest of Famlo Pro</h3>
                <p className={styles.heroText}>
                  Keep support, launch guidance, and provider escalation notes inside the same glass-style workspace.
                </p>
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
        `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(nextFamilyId)}&section=properties-home`
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
                const response = await fetch("/api/host/pro/channel/channex/operator/setup", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ familyId, action: "create_property" }),
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

function BookingComVerificationCard({
  familyId,
  setupState,
  externalPropertyId,
  discoveredHotelId,
  activeChannelId,
  channelAttached,
  channelActive,
  attachedCount,
}: Readonly<{
  familyId: string;
  setupState: ChannelSetupState;
  externalPropertyId: string | null;
  discoveredHotelId: string | null;
  activeChannelId: string | null;
  channelAttached: boolean;
  channelActive: boolean;
  attachedCount: number;
}>): React.JSX.Element {
  const router = useRouter();
  const [isChecking, startChecking] = useTransition();
  const [isMarkingVerified, startMarkingVerified] = useTransition();
  const [isMarkingFailed, startMarkingFailed] = useTransition();
  const [failureReason, setFailureReason] = useState(setupState.metadata.booking_connection_error ?? "");
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    status: string;
    message: string;
    verification?: {
      hotelId: string | null;
      activeChannelId: string | null;
      channelAttached: boolean;
      channelActive: boolean;
      accChannelsCount: number;
    };
  } | null>(null);

  const displayedHotelId = feedback?.verification?.hotelId ?? discoveredHotelId ?? "Missing";
  const displayedActiveChannelId = feedback?.verification?.activeChannelId ?? activeChannelId ?? "Missing";
  const displayedChannelAttached = feedback?.verification?.channelAttached ?? channelAttached;
  const displayedChannelActive = feedback?.verification?.channelActive ?? channelActive;
  const displayedAttachedCount = feedback?.verification?.accChannelsCount ?? attachedCount;
  const canMarkVerified = displayedChannelAttached && (displayedChannelActive || displayedActiveChannelId !== "Missing");

  const sendVerificationAction = (action: "check" | "mark_verified" | "mark_failed", reason?: string): void => {
    const runner =
      action === "check" ? startChecking : action === "mark_verified" ? startMarkingVerified : startMarkingFailed;

    runner(async () => {
      setFeedback(null);

      try {
        const response = await fetch("/api/host/pro/channel/channex/booking/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            familyId,
            action,
            reason,
          }),
        });

        const payload = (await response.json()) as {
          ok?: boolean;
          status?: string;
          error?: string;
          verification?: {
            hotelId: string | null;
            activeChannelId: string | null;
            channelAttached: boolean;
            channelActive: boolean;
            accChannelsCount: number;
          };
        };

        setFeedback({
          ok: Boolean(response.ok && payload.ok),
          status: payload.status ?? "failed",
          message:
            typeof payload.error === "string" && payload.error.trim().length > 0
              ? payload.error
              : action === "check"
                ? "Checked the current Booking.com channel state in Channex."
                : action === "mark_verified"
                  ? "Marked the Booking.com connection as verified."
                  : "Marked the Booking.com verification as failed.",
          verification: payload.verification,
        });
        router.refresh();
      } catch (error) {
        setFeedback({
          ok: false,
          status: "failed",
          message: error instanceof Error ? error.message : "Unable to complete the Booking.com verification action.",
        });
      }
    });
  };

  return (
    <article className={styles.listCard}>
      <div className={styles.listTitle}>Booking.com operator verification</div>
      <div className={styles.cardCopy}>
        Operator-only bridge between the host request and a real Channex-attached Booking.com channel. This does not activate the channel or run sync.
      </div>

      <div className={styles.placeholderGrid} style={{ marginTop: 12 }}>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Host-entered Hotel ID</div>
          <div className={styles.placeholderCopy}>{setupState.metadata.booking_hotel_id ?? "Missing"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Host-entered Property Code</div>
          <div className={styles.placeholderCopy}>{setupState.metadata.booking_property_code ?? "Missing"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Connectivity provider requested</div>
          <div className={styles.placeholderCopy}>
            {setupState.metadata.connectivity_provider_requested ? "Yes" : "No"}
            {setupState.metadata.connectivity_provider_requested_at ? ` · ${formatDateTime(setupState.metadata.connectivity_provider_requested_at)}` : ""}
          </div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Current Channex property id</div>
          <div className={styles.placeholderCopy}>{externalPropertyId ?? "Missing"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Discovered hotelId</div>
          <div className={styles.placeholderCopy}>{displayedHotelId}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Discovered activeChannelId</div>
          <div className={styles.placeholderCopy}>{displayedActiveChannelId}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Channel attached</div>
          <div className={styles.placeholderCopy}>{displayedChannelAttached ? "Yes" : "No"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Channel active</div>
          <div className={styles.placeholderCopy}>{displayedChannelActive ? "Yes" : "No"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Attached count</div>
          <div className={styles.placeholderCopy}>{displayedAttachedCount}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Last verification status</div>
          <div className={styles.placeholderCopy}>{setupState.metadata.booking_connection_status ?? "Not checked"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Last error</div>
          <div className={styles.placeholderCopy}>{setupState.metadata.booking_connection_error ?? "None"}</div>
        </div>
      </div>

      {feedback ? (
        <div className={`${styles.feedbackBox} ${feedback.ok ? styles.feedbackSuccess : styles.feedbackError}`} style={{ marginTop: 12 }}>
          {feedback.message}
        </div>
      ) : null}

      <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
        <button
          type="button"
          className={styles.secondaryActionButton}
          disabled={isChecking}
          onClick={() => sendVerificationAction("check")}
        >
          {isChecking ? "Checking..." : "Check Booking.com channel in Channex"}
        </button>
        <button
          type="button"
          className={styles.primaryActionButton}
          disabled={isMarkingVerified || !canMarkVerified}
          onClick={() => sendVerificationAction("mark_verified")}
        >
          {isMarkingVerified ? "Saving..." : "Mark Booking.com connection verified"}
        </button>
      </div>

      <div className={styles.stack} style={{ marginTop: 12 }}>
        <label>
          <span className={styles.fieldLabel}>Verification failure reason</span>
          <input
            className={styles.fieldInput}
            value={failureReason}
            onChange={(event) => setFailureReason(event.target.value)}
            placeholder="Example: Channel not attached yet in Channex"
          />
        </label>
        <div className={styles.inlineActionRow}>
          <button
            type="button"
            className={styles.secondaryActionButton}
            disabled={isMarkingFailed}
            onClick={() => sendVerificationAction("mark_failed", failureReason)}
          >
            {isMarkingFailed ? "Saving..." : "Mark verification failed"}
          </button>
        </div>
      </div>
    </article>
  );
}

function ProviderOperatorVerificationCard({
  familyId,
  providerKey,
  setupState,
  channexPropertyId,
  readinessModel,
  testSyncReadiness,
  goLiveReadiness,
  activeRoomsCount,
  roomMappingsReadyCount,
  rateMappingsReadyCount,
}: Readonly<{
  familyId: string;
  providerKey: ChannelProviderKey;
  setupState: ChannelSetupState;
  channexPropertyId: string | null;
  readinessModel: ChannelReadinessModel;
  testSyncReadiness: ChannelTestSyncSnapshot;
  goLiveReadiness: ChannelGoLiveSnapshot;
  activeRoomsCount: number;
  roomMappingsReadyCount: number;
  rateMappingsReadyCount: number;
}>): React.JSX.Element {
  const router = useRouter();
  const provider = getChannelProviderDefinition(providerKey);
  const [isChecking, startChecking] = useTransition();
  const [isMarkingApproved, startMarkingApproved] = useTransition();
  const [isMarkingFailed, startMarkingFailed] = useTransition();
  const [isOpeningWorkspace, startOpeningWorkspace] = useTransition();
  const [isVerifyingStructure, startVerifyingStructure] = useTransition();
  const [failureReason, setFailureReason] = useState(setupState.metadata.provider_connection_error ?? "");
  const [workspaceUrl, setWorkspaceUrl] = useState<string | null>(null);
  const [workspaceHint, setWorkspaceHint] = useState<string | null>(null);
  const [structureFeedback, setStructureFeedback] = useState<{
    ok: boolean;
    status: string;
    message: string;
    nextAction?: string;
    blockers?: string[];
    readyForTestSyncReview?: boolean;
  } | null>(null);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    status: string;
    message: string;
    inspection?: {
      propertyTitle?: string | null;
      hotelId?: string | null;
      activeChannelId?: string | null;
      discoveredChannelTitle?: string | null;
      channelAttached?: boolean;
      channelActive?: boolean;
      matchedChannelCount?: number;
      roomTypesFoundCount?: number;
      ratePlansFoundCount?: number;
    };
  } | null>(null);

  const displayedHotelId = feedback?.inspection?.hotelId ?? setupState.metadata.provider_discovered_hotel_id ?? "Missing";
  const displayedChannelId = feedback?.inspection?.activeChannelId ?? setupState.metadata.provider_discovered_channel_id ?? "Missing";
  const displayedChannelTitle = feedback?.inspection?.discoveredChannelTitle ?? setupState.metadata.provider_discovered_channel_title ?? "Missing";
  const displayedChannelAttached = feedback?.inspection?.channelAttached ?? setupState.metadata.provider_channel_attached ?? false;
  const displayedChannelActive = feedback?.inspection?.channelActive ?? setupState.metadata.provider_channel_active ?? false;
  const displayedMatchedCount = feedback?.inspection?.matchedChannelCount ?? (setupState.metadata.provider_channel_attached ? 1 : 0);
  const displayedRoomTypes = feedback?.inspection?.roomTypesFoundCount ?? setupState.metadata.provider_room_types_found_count ?? 0;
  const displayedRatePlans = feedback?.inspection?.ratePlansFoundCount ?? setupState.metadata.provider_rate_plans_found_count ?? 0;
  const canMarkApproved = displayedChannelAttached && (displayedChannelActive || displayedChannelId !== "Missing");
  const readinessBlockers = readinessModel.items.filter((item) => item.status !== "ready" && item.status !== "not_available");
  const primaryBlockers = [
    readinessModel.nextRequiredAction,
    testSyncReadiness.nextRequiredAction,
    goLiveReadiness.nextRequiredAction,
  ].filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
  const readinessSummaryPills = [
    `Progress ${readinessModel.progressPercent}%`,
    `Rooms ${roomMappingsReadyCount}/${activeRoomsCount}`,
    `Rates ${rateMappingsReadyCount}/${activeRoomsCount}`,
    `Test sync ${testSyncReadiness.statusLabel}`,
    `Go live ${goLiveReadiness.statusLabel}`,
  ];
  const providerStructureStatusLabel = setupState.metadata.provider_structure_verified
    ? "Verified"
    : setupState.metadata.provider_structure_blockers.length > 0
      ? "Blocked"
      : "Not verified";
  const providerStructureBlockers = structureFeedback?.blockers ?? setupState.metadata.provider_structure_blockers;
  const providerReadyForTestReview = structureFeedback?.readyForTestSyncReview ?? setupState.metadata.provider_ready_for_test_sync_review ?? false;
  const mutationAudit = getProviderMutationPrimitiveAudit(providerKey);

  const openWorkspace = (): void => {
    startOpeningWorkspace(async () => {
      setFeedback(null);
      try {
        const response = await fetch("/api/host/pro/channel/channex/iframe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            familyId,
            providerKey,
          }),
        });

        const payload = (await response.json()) as {
          ok?: boolean;
          iframeUrl?: string;
          providerHint?: string;
          error?: string;
        };

        if (!response.ok || !payload.iframeUrl) {
          throw new Error(payload.error ?? "Unable to open the real Channex workspace.");
        }

        setWorkspaceUrl(payload.iframeUrl);
        setWorkspaceHint(payload.providerHint ?? null);
        setFeedback({
          ok: true,
          status: "workspace_ready",
          message: `${provider.displayName} workspace is ready. Complete create/test/mapping in Channex, then come back and run Check in Channex.`,
        });
      } catch (error) {
        setFeedback({
          ok: false,
          status: "failed",
          message: error instanceof Error ? error.message : `Unable to open the ${provider.displayName} Channex workspace.`,
        });
      }
    });
  };

  const sendAction = (action: "check_channel_attachment" | "mark_ota_approved" | "mark_failed", reason?: string): void => {
    const runner =
      action === "check_channel_attachment"
        ? startChecking
        : action === "mark_ota_approved"
          ? startMarkingApproved
          : startMarkingFailed;

    runner(async () => {
      setFeedback(null);

      try {
        const response = await fetch("/api/host/pro/channel/operator/provider-verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            familyId,
            providerKey,
            action,
            reason,
          }),
        });

        const payload = (await response.json()) as {
          ok?: boolean;
          status?: string;
          error?: string;
          message?: string;
          inspection?: {
            propertyTitle?: string | null;
            hotelId?: string | null;
            activeChannelId?: string | null;
            discoveredChannelTitle?: string | null;
            channelAttached?: boolean;
            channelActive?: boolean;
            matchedChannelCount?: number;
            roomTypesFoundCount?: number;
            ratePlansFoundCount?: number;
          };
        };

        setFeedback({
          ok: Boolean(response.ok && payload.ok),
          status: payload.status ?? "failed",
          message:
            payload.message ??
            payload.error ??
            (action === "check_channel_attachment"
              ? `Checked ${provider.displayName} channel state in Channex.`
              : action === "mark_ota_approved"
                ? `Marked ${provider.displayName} approval as verified.`
                : `Marked ${provider.displayName} verification as failed.`),
          inspection: payload.inspection,
        });
        router.refresh();
      } catch (error) {
        setFeedback({
          ok: false,
          status: "failed",
          message: error instanceof Error ? error.message : `Unable to complete the ${provider.displayName} verification action.`,
        });
      }
    });
  };

  const verifyMappedStructure = (): void => {
    startVerifyingStructure(async () => {
      setStructureFeedback(null);
      try {
        const response = await fetch("/api/host/pro/channel/channex/operator/provider-structure-verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            familyId,
            providerKey,
          }),
        });

        const payload = (await response.json()) as {
          ok?: boolean;
          status?: string;
          message?: string;
          nextAction?: string;
          blockers?: string[];
          readyForTestSyncReview?: boolean;
          error?: string;
        };

        setStructureFeedback({
          ok: Boolean(response.ok && payload.ok),
          status: payload.status ?? "failed",
          message: payload.message ?? payload.error ?? `Unable to verify ${provider.displayName} mapped structure.`,
          nextAction: payload.nextAction,
          blockers: Array.isArray(payload.blockers) ? payload.blockers : [],
          readyForTestSyncReview: payload.readyForTestSyncReview === true,
        });
        router.refresh();
      } catch (error) {
        setStructureFeedback({
          ok: false,
          status: "failed",
          message: error instanceof Error ? error.message : `Unable to verify ${provider.displayName} mapped structure.`,
          blockers: [],
          readyForTestSyncReview: false,
        });
      }
    });
  };

  return (
    <article className={styles.listCard}>
      <div className={styles.listTitle}>{provider.displayName} operator verification</div>
      <div className={styles.cardCopy}>
        Operator-only connection check for the selected property. This reads Channex server-side, refreshes real channel state, and never activates the OTA.
      </div>
      <div className={styles.inlineBadgeRow} style={{ marginTop: 12 }}>
        {readinessSummaryPills.map((pill) => (
          <span key={pill} className={styles.readinessPill}>
            {pill}
          </span>
        ))}
      </div>
      <div className={styles.feedbackBox} style={{ marginTop: 12 }}>
        {providerKey === "mmt"
          ? "Real MMT / Goibibo create and test-connection steps still happen inside Channex. Famlo opens the property-scoped workspace, then checks back the attached channel and mapping structures."
          : providerKey === "airbnb"
            ? "Real Airbnb connection still depends on authorization inside Channex or Airbnb-side access. Famlo checks the result after the real connection flow."
            : providerKey === "agoda"
              ? "Real Agoda / YCS connection still depends on Agoda-side approval and Channex channel setup. Famlo checks the result after the real connection flow."
              : providerKey === "expedia"
                ? "Real Expedia create and test-connection steps still happen inside Channex after Expedia connectivity approval. Famlo checks the result after the real connection flow."
                : "Real Google Hotel feed/channel setup still happens inside Channex. Famlo checks the resulting channel state after the real setup flow."}
      </div>
      <div className={styles.stack} style={{ marginTop: 12 }}>
        <div className={styles.listTitle}>Provider mutation primitive audit</div>
        <div className={styles.feedCopy}>{mutationAudit.summary}</div>
        <div className={styles.inlineBadgeRow} style={{ marginTop: 8 }}>
          <span className={`${styles.readinessPill} ${mutationAudit.createChannelApiAvailable ? styles.readinessPillOk : styles.readinessPillReview}`}>
            Create API: {mutationAudit.createChannelApiAvailable ? "Available" : "Missing"}
          </span>
          <span className={`${styles.readinessPill} ${mutationAudit.testConnectionApiAvailable ? styles.readinessPillOk : styles.readinessPillReview}`}>
            Test API: {mutationAudit.testConnectionApiAvailable ? "Available" : "Missing"}
          </span>
          <span className={styles.readinessPill}>
            Path: {mutationAudit.workspaceRequired ? "Real Channex workspace" : "Famlo API"}
          </span>
        </div>
        {mutationAudit.missingPrimitive ? (
          <div className={styles.feedbackBox} style={{ marginTop: 8 }}>
            {mutationAudit.missingPrimitive}
          </div>
        ) : null}
        <div className={styles.stack} style={{ marginTop: 8 }}>
          {mutationAudit.notes.map((note) => (
            <div key={note} className={styles.feedCopy}>
              {note}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.placeholderGrid} style={{ marginTop: 12 }}>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Host-entered listing id</div>
          <div className={styles.placeholderCopy}>{setupState.metadata.provider_listing_id ?? "Missing"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Host-entered property code</div>
          <div className={styles.placeholderCopy}>{setupState.metadata.provider_property_code ?? "Missing"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Reference URL</div>
          <div className={styles.placeholderCopy}>{setupState.metadata.provider_listing_url ?? "Missing"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Provider approval requested</div>
          <div className={styles.placeholderCopy}>
            {setupState.metadata.provider_extranet_request_acknowledged ? "Yes" : "No"}
            {setupState.metadata.provider_verification_requested_at ? ` · ${formatDateTime(setupState.metadata.provider_verification_requested_at)}` : ""}
          </div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Current Channex property id</div>
          <div className={styles.placeholderCopy}>{channexPropertyId ?? "Missing"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Discovered hotel/provider id</div>
          <div className={styles.placeholderCopy}>{displayedHotelId}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Discovered channel title</div>
          <div className={styles.placeholderCopy}>{displayedChannelTitle}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Discovered channel id</div>
          <div className={styles.placeholderCopy}>{displayedChannelId}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Channel attached</div>
          <div className={styles.placeholderCopy}>{displayedChannelAttached ? "Yes" : "No"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Channel active</div>
          <div className={styles.placeholderCopy}>{displayedChannelActive ? "Yes" : "No"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Matched channel count</div>
          <div className={styles.placeholderCopy}>{displayedMatchedCount}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Room types / Rate plans</div>
          <div className={styles.placeholderCopy}>{displayedRoomTypes} / {displayedRatePlans}</div>
        </div>
        {providerKey === "mmt" ? (
          <div className={styles.placeholderRow}>
            <div className={styles.placeholderTitle}>MMT token storage</div>
            <div className={styles.placeholderCopy}>
              {setupState.metadata.provider_access_token_stored
                ? `Stored securely${setupState.metadata.provider_access_token_last_four ? ` · ending ${setupState.metadata.provider_access_token_last_four}` : ""}`
                : "Missing"}
            </div>
          </div>
        ) : null}
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Mapped structure</div>
          <div className={styles.placeholderCopy}>{providerStructureStatusLabel}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Ready for test sync review</div>
          <div className={styles.placeholderCopy}>{providerReadyForTestReview ? "Yes" : "No"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Last verification status</div>
          <div className={styles.placeholderCopy}>{setupState.metadata.provider_connection_status ?? "Not checked"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Last error</div>
          <div className={styles.placeholderCopy}>{setupState.metadata.provider_connection_error ?? "None"}</div>
        </div>
      </div>

      {feedback ? (
        <div className={`${styles.feedbackBox} ${feedback.ok ? styles.feedbackSuccess : styles.feedbackError}`} style={{ marginTop: 12 }}>
          {feedback.message}
        </div>
      ) : null}

      {structureFeedback ? (
        <div className={`${styles.feedbackBox} ${structureFeedback.ok ? styles.feedbackSuccess : styles.feedbackError}`} style={{ marginTop: 12 }}>
          {structureFeedback.message}
        </div>
      ) : null}

      <div className={styles.stack} style={{ marginTop: 12 }}>
        <div className={styles.listTitle}>Readiness verification after mapping</div>
        <div className={styles.feedCopy}>
          {readinessBlockers.length === 0
            ? "This provider has no safe readiness blockers left in Famlo’s current model. Keep activation disabled until operator test sync and go-live review are complete."
            : "These are the exact blockers Famlo still sees before operator test sync or go-live review."}
        </div>
        <div className={styles.placeholderGrid} style={{ marginTop: 8 }}>
          {readinessModel.items
            .filter((item) => item.key === "connection_verified" || item.key === "room_matching" || item.key === "price_matching" || item.key === "test_sync" || item.key === "activation")
            .map((item) => (
              <div key={item.key} className={styles.placeholderRow}>
                <div className={styles.placeholderTitle}>{item.label}</div>
                <div className={styles.placeholderCopy}>{item.explanation}</div>
                <div className={styles.inlineBadgeRow} style={{ marginTop: 6 }}>
                  <span
                    className={`${styles.readinessPill} ${item.status === "ready"
                      ? styles.readinessPillOk
                      : item.status === "blocked" || item.status === "in_progress"
                        ? styles.readinessPillReview
                        : styles.readinessPillMissing
                      }`}
                  >
                    {item.status === "ready"
                      ? "Done"
                      : item.status === "blocked"
                        ? "Blocked"
                        : item.status === "in_progress"
                          ? "In progress"
                          : item.status === "needed"
                            ? "Needed"
                            : item.status}
                  </span>
                  {item.operatorNote ? <span className={styles.readinessPill}>{item.operatorNote}</span> : null}
                </div>
              </div>
            ))}
        </div>
        <div className={styles.feedbackBox} style={{ marginTop: 8 }}>
          {structureFeedback?.nextAction ?? primaryBlockers[0] ?? "No blockers recorded."}
        </div>
        {providerStructureBlockers.length > 0 ? (
          <div className={styles.stack} style={{ marginTop: 8 }}>
            {providerStructureBlockers.map((blocker) => (
              <div key={blocker} className={styles.feedCopy}>
                {blocker}
              </div>
            ))}
          </div>
        ) : null}
        {primaryBlockers.length > 1 ? (
          <div className={styles.stack} style={{ marginTop: 8 }}>
            {primaryBlockers.slice(1).map((blocker) => (
              <div key={blocker} className={styles.feedCopy}>
                {blocker}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
        <button
          type="button"
          className={styles.secondaryActionButton}
          disabled={isOpeningWorkspace}
          onClick={openWorkspace}
        >
          {isOpeningWorkspace ? "Opening..." : "Open real Channex setup"}
        </button>
        <button
          type="button"
          className={styles.secondaryActionButton}
          disabled={isChecking}
          onClick={() => sendAction("check_channel_attachment")}
        >
          {isChecking ? "Checking..." : `Check ${provider.displayName} in Channex`}
        </button>
        <button
          type="button"
          className={styles.secondaryActionButton}
          disabled={isVerifyingStructure}
          onClick={verifyMappedStructure}
        >
          {isVerifyingStructure ? "Verifying..." : "Verify mapped structure"}
        </button>
        <button
          type="button"
          className={styles.primaryActionButton}
          disabled={isMarkingApproved || !canMarkApproved}
          onClick={() => sendAction("mark_ota_approved")}
        >
          {isMarkingApproved ? "Saving..." : `Mark ${provider.displayName} approved`}
        </button>
      </div>

      {workspaceUrl ? (
        <div className={styles.stack} style={{ marginTop: 12 }}>
          <div className={styles.feedbackBox}>
            {workspaceHint ?? "This opens the real property-scoped Channex setup UI for this provider."}
          </div>
          <div className={styles.inlineActionRow}>
            <a
              className={styles.secondaryActionButton}
              href={workspaceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open in new tab
            </a>
          </div>
        </div>
      ) : null}

      <div className={styles.stack} style={{ marginTop: 12 }}>
        <label>
          <span className={styles.fieldLabel}>Verification failure reason</span>
          <input
            className={styles.fieldInput}
            value={failureReason}
            onChange={(event) => setFailureReason(event.target.value)}
            placeholder={`Example: ${provider.displayName} channel not attached yet in Channex`}
          />
        </label>
        <div className={styles.inlineActionRow}>
          <button
            type="button"
            className={styles.secondaryActionButton}
            disabled={isMarkingFailed}
            onClick={() => sendAction("mark_failed", failureReason)}
          >
            {isMarkingFailed ? "Saving..." : "Mark verification failed"}
          </button>
        </div>
      </div>
    </article>
  );
}

function BookingComAssistedChannelManagerCard({
  familyId,
  setupState,
  externalPropertyId,
  channelAttached,
  channelActive,
  activeRoomsCount,
  roomMappingsReadyCount,
  ratePlansReadyCount,
  missingRoomMappings,
  missingRatePlans,
  lastCreatePropertyLog,
  lastCreateRoomTypeLog,
  lastCreateRatePlanLog,
  lastLimitedAriSyncLog,
  lastBookingFeedLog,
  lastAssistedGoLiveLog,
  bookingRevisionsCount,
}: Readonly<{
  familyId: string;
  setupState: ChannelSetupState;
  externalPropertyId: string | null;
  channelAttached: boolean;
  channelActive: boolean;
  activeRoomsCount: number;
  roomMappingsReadyCount: number;
  ratePlansReadyCount: number;
  missingRoomMappings: string[];
  missingRatePlans: string[];
  lastCreatePropertyLog: HostProChannelFoundation["syncLogs"][number] | null;
  lastCreateRoomTypeLog: HostProChannelFoundation["syncLogs"][number] | null;
  lastCreateRatePlanLog: HostProChannelFoundation["syncLogs"][number] | null;
  lastLimitedAriSyncLog: HostProChannelFoundation["syncLogs"][number] | null;
  lastBookingFeedLog: HostProChannelFoundation["syncLogs"][number] | null;
  lastAssistedGoLiveLog: HostProChannelFoundation["syncLogs"][number] | null;
  bookingRevisionsCount: number;
}>): React.JSX.Element {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
    blockers?: string[];
    summary?: string;
  } | null>(null);

  const bookingVerified =
    setupState.metadata.operator_verified_booking_connection === true ||
    setupState.metadata.booking_connection_status === "verified" ||
    setupState.metadata.booking_connection_status === "ready_for_assisted_go_live";
  const structureReady = Boolean(externalPropertyId) && activeRoomsCount > 0 && missingRoomMappings.length === 0 && missingRatePlans.length === 0;
  const limitedSyncReady = bookingVerified && structureReady && channelAttached && channelActive;
  const feedReady = bookingVerified && Boolean(externalPropertyId);
  const goLiveReady = setupState.metadata.channel_ready_for_assisted_go_live === true;
  const goLiveBlockers = [
    bookingVerified ? null : "Booking.com connection not operator-verified",
    externalPropertyId ? null : "Channex property missing",
    activeRoomsCount > 0 ? null : "No active room",
    missingRoomMappings.length === 0 ? null : `Missing room mappings: ${missingRoomMappings.join(", ")}`,
    missingRatePlans.length === 0 ? null : `Missing rate plans: ${missingRatePlans.join(", ")}`,
    lastLimitedAriSyncLog?.status === "success" ? null : "Limited ARI test sync not successful yet",
    lastBookingFeedLog?.status === "success" ? null : "Booking feed poll not successful yet",
    channelAttached ? null : "Channel not attached",
    channelActive ? null : "Channel not active",
  ].filter((item): item is string => Boolean(item));

  const formatLog = (log: HostProChannelFoundation["syncLogs"][number] | null): string =>
    log ? `${labelizeToken(log.status, "status")} · ${formatDateTime(log.createdAt)}` : "Not run";

  const runOperatorAction = async (
    action: string,
    url: string,
    body: Record<string, unknown>
  ): Promise<void> => {
    setPendingAction(action);
    setFeedback(null);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        status?: string;
        message?: string;
        error?: string;
        blockers?: string[];
        windowDays?: number;
        eligibleRooms?: number;
        revisionsFound?: number;
        storedCount?: number;
        insertedCount?: number;
        updatedCount?: number;
      };

      const message =
        payload.message ??
        payload.error ??
        (response.ok ? "Operator action completed." : "Operator action failed.");
      const summary =
        typeof payload.windowDays === "number"
          ? `${payload.windowDays}-day window · ${payload.eligibleRooms ?? 0} eligible room${payload.eligibleRooms === 1 ? "" : "s"}`
          : typeof payload.revisionsFound === "number"
            ? `${payload.revisionsFound} matched revision${payload.revisionsFound === 1 ? "" : "s"} · ${payload.storedCount ?? 0} stored`
            : payload.status
              ? labelizeToken(payload.status, "status")
              : undefined;

      setFeedback({
        ok: Boolean(response.ok && payload.ok !== false),
        message,
        blockers: Array.isArray(payload.blockers) ? payload.blockers : undefined,
        summary,
      });

      router.refresh();
    } catch (error) {
      setFeedback({
        ok: false,
        message: error instanceof Error ? error.message : "Unable to run operator action.",
      });
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <article className={styles.listCard}>
      <div className={styles.listTitle}>Booking.com assisted channel manager</div>
      <div className={styles.cardCopy}>
        Operator-only path for creating/linking Channex structure, running a limited selected-property test sync, polling the selected-property booking feed, and marking assisted go-live readiness. This never activates a channel.
      </div>

      <div className={styles.placeholderGrid} style={{ marginTop: 12 }}>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Famlo family/property id</div>
          <div className={styles.placeholderCopy}>{familyId}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Channex property id</div>
          <div className={styles.placeholderCopy}>{externalPropertyId ?? "Missing"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Booking.com verification</div>
          <div className={styles.placeholderCopy}>{bookingVerified ? "Operator verified" : "Not verified"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Channel attached / active</div>
          <div className={styles.placeholderCopy}>{channelAttached ? "Attached" : "Detached"} · {channelActive ? "Active" : "Inactive"}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Room mappings</div>
          <div className={styles.placeholderCopy}>{roomMappingsReadyCount}/{activeRoomsCount} ready</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Rate plans</div>
          <div className={styles.placeholderCopy}>{ratePlansReadyCount}/{activeRoomsCount} ready</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Limited ARI test</div>
          <div className={styles.placeholderCopy}>{formatLog(lastLimitedAriSyncLog)}</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Booking feed poll</div>
          <div className={styles.placeholderCopy}>{formatLog(lastBookingFeedLog)} · {bookingRevisionsCount} stored previews</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Assisted go-live</div>
          <div className={styles.placeholderCopy}>
            {goLiveReady ? "Ready for assisted review" : "Not ready"} · {formatLog(lastAssistedGoLiveLog)}
          </div>
        </div>
      </div>

      <div className={styles.mappingTable} style={{ marginTop: 14 }}>
        <div className={styles.mappingHeader}>Step</div>
        <div className={styles.mappingHeader}>Last result</div>
        <div className={styles.mappingHeader}>Operator action</div>

        <div className={styles.mappingCell}>
          <div className={styles.mappingTitle}>Create/link Channex property</div>
          <div className={styles.mappingSubcopy}>Selected family only.</div>
        </div>
        <div className={styles.mappingCellMuted}>{formatLog(lastCreatePropertyLog)}</div>
        <div className={styles.mappingCell}>
          <button
            type="button"
            className={styles.secondaryActionButton}
            disabled={pendingAction != null || Boolean(externalPropertyId)}
            onClick={() => runOperatorAction("create-property", "/api/host/pro/channel/channex/operator/setup", { familyId, action: "create_property" })}
          >
            {pendingAction === "create-property" ? "Creating..." : externalPropertyId ? "Property linked" : "Create/link property"}
          </button>
        </div>

        <div className={styles.mappingCell}>
          <div className={styles.mappingTitle}>Create/link room types</div>
          <div className={styles.mappingSubcopy}>{missingRoomMappings.length > 0 ? `Missing: ${missingRoomMappings.join(", ")}` : "All active rooms prepared."}</div>
        </div>
        <div className={styles.mappingCellMuted}>{formatLog(lastCreateRoomTypeLog)}</div>
        <div className={styles.mappingCell}>
          <button
            type="button"
            className={styles.secondaryActionButton}
            disabled={pendingAction != null || !externalPropertyId}
            onClick={() => runOperatorAction("create-rooms", "/api/host/pro/channel/channex/operator/setup", { familyId, action: "create_room_types" })}
          >
            {pendingAction === "create-rooms" ? "Creating..." : "Create/link room types"}
          </button>
        </div>

        <div className={styles.mappingCell}>
          <div className={styles.mappingTitle}>Create/link rate plans</div>
          <div className={styles.mappingSubcopy}>{missingRatePlans.length > 0 ? `Missing: ${missingRatePlans.join(", ")}` : "All active room prices prepared."}</div>
        </div>
        <div className={styles.mappingCellMuted}>{formatLog(lastCreateRatePlanLog)}</div>
        <div className={styles.mappingCell}>
          <button
            type="button"
            className={styles.secondaryActionButton}
            disabled={pendingAction != null || !externalPropertyId || missingRoomMappings.length > 0}
            onClick={() => runOperatorAction("create-rates", "/api/host/pro/channel/channex/operator/setup", { familyId, action: "create_rate_plans" })}
          >
            {pendingAction === "create-rates" ? "Creating..." : "Create/link rate plans"}
          </button>
        </div>

        <div className={styles.mappingCell}>
          <div className={styles.mappingTitle}>Run limited ARI test sync</div>
          <div className={styles.mappingSubcopy}>Booking.com / Channex only. Selected property only. Default 7 days, hard cap 14 days.</div>
        </div>
        <div className={styles.mappingCellMuted}>{limitedSyncReady ? "Ready to run" : "Blocked until verified, mapped, and active"}</div>
        <div className={styles.mappingCell}>
          <button
            type="button"
            className={styles.primaryActionButton}
            disabled={pendingAction != null || !limitedSyncReady}
            onClick={() => runOperatorAction("limited-ari", "/api/host/pro/channel/channex/operator/ari-test", { familyId, providerKey: "booking", windowDays: 7 })}
          >
            {pendingAction === "limited-ari" ? "Running..." : "Run limited ARI test sync"}
          </button>
        </div>

        <div className={styles.mappingCell}>
          <div className={styles.mappingTitle}>Poll booking feed</div>
          <div className={styles.mappingSubcopy}>Stores selected-property preview rows only. Import and acknowledgement are not automatic.</div>
        </div>
        <div className={styles.mappingCellMuted}>{feedReady ? "Ready to poll" : "Blocked until property and verification are ready"}</div>
        <div className={styles.mappingCell}>
          <button
            type="button"
            className={styles.secondaryActionButton}
            disabled={pendingAction != null || !feedReady}
            onClick={() => runOperatorAction("booking-feed", "/api/host/pro/channel/channex/operator/bookings/feed", { familyId, providerKey: "booking" })}
          >
            {pendingAction === "booking-feed" ? "Polling..." : "Poll selected-property booking feed"}
          </button>
        </div>

        <div className={styles.mappingCell}>
          <div className={styles.mappingTitle}>Mark ready for assisted go-live</div>
          <div className={styles.mappingSubcopy}>{goLiveBlockers.length > 0 ? goLiveBlockers.join(" · ") : "All safe gates are satisfied."}</div>
        </div>
        <div className={styles.mappingCellMuted}>{goLiveReady ? "Ready metadata saved" : "No activation will occur"}</div>
        <div className={styles.mappingCell}>
          <button
            type="button"
            className={styles.secondaryActionButton}
            disabled={pendingAction != null}
            onClick={() => runOperatorAction("go-live-ready", "/api/host/pro/channel/channex/operator/go-live-readiness", { familyId, providerKey: "booking" })}
          >
            {pendingAction === "go-live-ready" ? "Checking..." : "Mark assisted go-live ready"}
          </button>
        </div>
      </div>

      {feedback ? (
        <div className={`${styles.feedbackBox} ${feedback.ok ? styles.feedbackSuccess : styles.feedbackError}`} style={{ marginTop: 12 }}>
          {feedback.message}
          {feedback.summary ? <div className={styles.feedCopy} style={{ marginTop: 8 }}>{feedback.summary}</div> : null}
          {feedback.blockers && feedback.blockers.length > 0 ? (
            <div className={styles.stack} style={{ marginTop: 8 }}>
              {feedback.blockers.map((blocker) => (
                <div key={blocker} className={styles.feedCopy}>- {blocker}</div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.feedbackBox} style={{ marginTop: 12 }}>
        Import, cancellation apply, and acknowledgement remain in the existing booking diagnostics below. Nothing here activates Booking.com, starts scheduled sync, or acknowledges provider bookings.
      </div>
    </article>
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
                const response = await fetch("/api/host/pro/channel/channex/operator/setup", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ familyId, action: "create_room_types" }),
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
                const response = await fetch("/api/host/pro/channel/channex/operator/setup", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ familyId, action: "create_rate_plans" }),
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
  const [isPreviewingRevision, startPreviewingRevision] = useTransition();
  const [isImportingPreview, startImportingPreview] = useTransition();
  const [isApplyingModification, startApplyingModification] = useTransition();
  const [isApplyingCancellation, startApplyingCancellation] = useTransition();
  const [isAcknowledgingPreview, startAcknowledgingPreview] = useTransition();
  const [previewingRevisionId, setPreviewingRevisionId] = useState<string | null>(null);
  const [importingPreviewId, setImportingPreviewId] = useState<string | null>(null);
  const [applyingModificationId, setApplyingModificationId] = useState<string | null>(null);
  const [applyingCancellationId, setApplyingCancellationId] = useState<string | null>(null);
  const [acknowledgingPreviewId, setAcknowledgingPreviewId] = useState<string | null>(null);
  const [selectedFeedProvider, setSelectedFeedProvider] = useState<ChannelProviderKey>("booking");
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
    providerKey: resolveProviderFromOtaName(revision.otaName) ?? "booking",
  }));

  return (
    <section className={styles.cardInset}>
      <div className={styles.cardHeaderCompact}>
        <div>
          <div className={styles.listTitle}>OTA import test flow</div>
          <div className={styles.cardCopy}>
            Operator-only Channex booking previews for the selected property. Preview before apply, import before acknowledge, and no payment/refund logic runs here.
          </div>
        </div>
        <span className={`${styles.badge} ${blockedMessage ? styles.badgeMuted : ""}`.trim()}>
          {blockedMessage ? "Blocked" : "Operator-only"}
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
      <div className={styles.inlineActionRow} style={{ marginTop: 10 }}>
        <select
          className={styles.fieldInput}
          value={selectedFeedProvider}
          onChange={(event) => setSelectedFeedProvider(event.target.value as ChannelProviderKey)}
          disabled={isFetching}
        >
          {CHANNEL_PROVIDER_REGISTRY.filter((provider) => provider.key !== "google-hotel").map((provider) => (
            <option key={provider.key} value={provider.key}>
              {provider.displayName}
            </option>
          ))}
        </select>
        <span className={styles.readinessPill}>Feed scope: {getChannelProviderDefinition(selectedFeedProvider).displayName}</span>
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
                  {(() => {
                    const revisionProviderKey =
                      "providerKey" in revision && revision.providerKey
                        ? (revision.providerKey as ChannelProviderKey)
                        : (resolveProviderFromOtaName(revision.otaName) ?? "booking");
                    const revisionProviderLabel = getChannelProviderDefinition(revisionProviderKey).displayName;
                    return (
                      <>
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
                    <div className={styles.mappingSubcopy}>{revisionProviderLabel} · {revision.paymentCollect ?? "collection unknown"}</div>
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
                            isPreviewingRevision ||
                            isImportingPreview ||
                            isApplyingCancellation ||
                            Boolean(blockedMessage) ||
                            !revision.externalRoomTypeId
                          }
                          onClick={() => {
                            startPreviewingRevision(async () => {
                              setPreviewingRevisionId(typeof revision.id === "string" ? revision.id : null);
                              try {
                                const response = await fetch("/api/host/pro/channel/channex/operator/bookings/preview", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    familyId,
                                    providerKey: revisionProviderKey,
                                    channelBookingRevisionId: revision.id,
                                  }),
                                });

                                const payload = (await response.json()) as {
                                  ok?: boolean;
                                  message?: string;
                                  error?: string;
                                  blockers?: string[];
                                };

                                if (!response.ok || !payload.ok) {
                                  throw new Error(payload.error ?? payload.message ?? `Unable to preview this ${revisionProviderLabel} revision.`);
                                }

                                const blockers = Array.isArray(payload.blockers) && payload.blockers.length > 0
                                  ? ` Blockers: ${payload.blockers.join(" · ")}`
                                  : "";
                                setFeedback({
                                  ok: true,
                                  message: `${payload.message ?? "Preview loaded for the selected property."}${blockers}`,
                                });
                              } catch (error) {
                                setFeedback({
                                  ok: false,
                                  message: error instanceof Error ? error.message : `Unable to preview this ${revisionProviderLabel} revision.`,
                                });
                              } finally {
                                setPreviewingRevisionId(null);
                              }
                            });
                          }}
                        >
                          {isPreviewingRevision && previewingRevisionId === revision.id ? "Previewing..." : "Preview safety"}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryActionButton}
                          disabled={
                            isImportingPreview ||
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
                                const response = await fetch("/api/host/pro/channel/channex/operator/bookings/apply", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    familyId,
                                    providerKey: revisionProviderKey,
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
                                  const response = await fetch("/api/host/pro/channel/channex/operator/bookings/modify", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      familyId,
                                      providerKey: revisionProviderKey,
                                      channelBookingRevisionId: revision.id,
                                    }),
                                  });

                                  const payload = (await response.json()) as {
                                    ok?: boolean;
                                    message?: string;
                                    error?: string;
                                  };

                                  if (!response.ok || !payload.ok) {
                                    throw new Error(payload.error ?? payload.message ?? "Unable to apply this booking modification.");
                                  }

                                  setFeedback({
                                    ok: true,
                                    message:
                                      typeof payload.message === "string" && payload.message.trim().length > 0
                                        ? payload.message
                                        : `Applied this ${revisionProviderLabel} modification in Famlo. Acknowledgement still depends on supported lifecycle state.`,
                                  });
                                  router.refresh();
                                } catch (error) {
                                  setFeedback({
                                    ok: false,
                                    message: error instanceof Error ? error.message : "Unable to apply this booking modification.",
                                  });
                                } finally {
                                  setApplyingModificationId(null);
                                }
                              });
                            }}
                          >
                            {isApplyingModification && applyingModificationId === revision.id ? "Applying..." : "Apply modification"}
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
                                  const response = await fetch("/api/host/pro/channel/channex/operator/bookings/cancel", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      familyId,
                                      providerKey: revisionProviderKey,
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
                                    const response = await fetch("/api/host/pro/channel/channex/operator/bookings/acknowledge", {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                        body: JSON.stringify({
                                          familyId,
                                          providerKey: revisionProviderKey,
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
                      </>
                    );
                  })()}
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
                const response = await fetch("/api/host/pro/channel/channex/operator/bookings/feed", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ familyId, providerKey: selectedFeedProvider }),
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
