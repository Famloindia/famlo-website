"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, type CSSProperties, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Activity,
  ArrowRightLeft,
  BadgeIndianRupee,
  BellRing,
  BookCheck,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Download,
  FileBarChart2,
  Filter,
  Flag,
  Hotel,
  Layers3,
  Link2,
  Lock,
  MessageSquareMore,
  Plus,
  Play,
  RefreshCcw,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

import type { PhotoItem } from "@/components/partners/HostDashboardEditor";
import { useUser } from "@/components/auth/UserContext";
import CalendarWorkspaceSkeleton from "@/components/partners/pro/CalendarWorkspaceSkeleton";
import ProHostProfileCenter from "@/components/partners/pro/ProHostProfileCenter";
import ProDashboardMetricsBeacon from "@/components/partners/pro/ProDashboardMetricsBeacon";
import type { ChannelSetupWizardSummary } from "@/components/partners/pro/ChannelSetupWizard";
import {
  saveFamilyProfileWorkspace,
  type FamilyComplianceDraft,
  type FamilyListingDraft,
  type FamilyProfileDraft,
  type FamilyScheduleDraft,
} from "@/lib/family-profile-editor";
import {
  OTA_CONNECT_CONFIGS,
  getOtaConnectConfig,
  mapProviderKeyToOtaConnectId,
  type OtaConnectId,
} from "@/lib/channels/ota-connect-config";
import {
  CHANNEL_PROVIDER_REGISTRY,
  getChannelProviderDefinition,
  type ChannelProviderKey,
} from "@/lib/channel-providers/provider-registry";
import { getChannelProviderCapabilities, resolveProviderFromOtaName } from "@/lib/channel-providers/provider-capabilities";
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
  propertyModelLabel,
  propertyTypeLabel,
  type HostProSettings,
} from "@/lib/host-pro-settings";
import { type HostProChannelFoundation } from "@/lib/host-pro-channel-foundation";
import type { PublicPropertyReel } from "@/lib/property-public-media";
import {
  formatChannexEnvironmentLabel,
  type ChannexConfigSummary as ChannexSummary,
} from "@/lib/channel-providers/channex/client";
import { HOST_REEL_ACCEPT_ATTRIBUTE, MAX_HOST_REEL_UPLOAD_BYTES } from "@/lib/host-reel-shared";
import { isHostBookingVisibleToPartner } from "@/lib/host-booking-state";
import {
  buildHostPayoutHistoryUrl,
  deriveRevenuePaymentStatusLabel,
  isCompletedRevenueBooking,
  isFinanceBackedPaidStatus,
  matchesRevenueWindowDate,
  shouldIncludeFamloPayoutInTotals,
} from "@/lib/finance/pro-revenue";
import {
  applyRoomCalendarAvailabilityOverride,
  buildHostRoomIssueCards,
  canRunHostChannelSync,
  classifyOtaReadiness,
  getRoomCalendarAvailabilityOverrideKey,
  getChannelManagerConfirmationLabel,
  rollbackRoomCalendarAvailabilityOverride,
  resolveHostChannelCardState,
} from "@/lib/pro-room-editor-ui";
import {
  MAX_GALLERY_IMAGE_UPLOAD_BYTES,
  formatGalleryImageUploadLimitLabel,
} from "@/lib/upload-limits";
import { buildHostCalendarSyncDisplay } from "@/lib/host-pro-calendar-sync";
import {
  createDefaultChannelFinanceSettings,
  estimateChannelCommission,
  type ChannelFinanceSettings,
  type ChannelCommissionRule,
} from "@/lib/channel-finance-settings";
import type { BookingFeedLiveHealth } from "@/lib/host-pro-live-data";
import type { ProDashboardLoadMetrics } from "@/lib/pro-dashboard-performance";
import styles from "./pro-dashboard.module.css";

const HostRoomsManager = dynamic(() => import("@/components/partners/rooms/HostRoomsManager"));
const PropertyContentManager = dynamic(() => import("@/components/partners/property/PropertyContentManager"));
const ChannelSetupWizard = dynamic(() => import("@/components/partners/pro/ChannelSetupWizard"));
const DocumentsTab = dynamic(() => import("@/components/partners/tabs/DocumentsTab"));
const MessagesTab = dynamic(() => import("@/components/partners/tabs/MessagesTab"));
const SupportTab = dynamic(() => import("@/components/partners/tabs/SupportTab"));
const FamloProCalendarGrid = dynamic(() => import("@/components/partners/pro/FamloProCalendarGrid"), {
  ssr: false,
  loading: () => <CalendarWorkspaceSkeleton />,
});

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
  status: "available" | "famlo" | "ota" | "manual_block" | "pending" | "past" | "unavailable";
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

type CalendarRateOverrideState = {
  amount: number | null;
  displayValue: string;
  isOverridden: boolean;
};

type CalendarProjectedCellState = {
  availableUnits: number | null;
  effectiveRate: number | null;
  stopSell: boolean;
  updatedAt: string | null;
};

type CalendarProjectedCellPayload = CalendarProjectedCellState & {
  roomId: string;
  date: string;
};

type CalendarRestrictionType =
  | "rate"
  | "all_restrictions"
  | "only_availability"
  | "rate_and_availability"
  | "availability_offset"
  | "availability_per_rate"
  | "cta"
  | "ctd"
  | "max_availability"
  | "max_stay"
  | "min_stay_arrival"
  | "min_stay_through"
  | "stop_sell"
  | "block_selected"
  | "unblock_selected";

type CalendarBulkWeekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

type CalendarBulkRestrictionKey =
  | "rate"
  | "stop_sell"
  | "cta"
  | "ctd"
  | "min_stay_arrival"
  | "min_stay_through"
  | "max_stay";

type CalendarGridRowKind =
  | "availability"
  | "availability_offset"
  | "availability_per_rate"
  | "cta"
  | "ctd"
  | "max_availability"
  | "max_stay"
  | "min_stay_arrival"
  | "min_stay_through"
  | "rate"
  | "stop_sell";

type CalendarRateEditorState = {
  roomId: string;
  roomName: string;
  roomType: string;
  ratePlanName: string;
  date: string;
  dateFrom: string;
  dateTo: string;
  displayValue: string;
  amount: number | null;
  baseAmount: number;
  isOverridden: boolean;
  restrictionType: CalendarRestrictionType;
};

type CalendarSyncMetadata = {
  localStatus: "loaded";
  lastLocalLoadAt: string;
  lastAttemptedAt: string | null;
  lastSyncedAt: string | null;
  syncSource: "channex" | "cache" | "none";
  syncStatus: "pending" | "syncing" | "synced" | "partial" | "failed" | "stale" | "not_mapped" | "not_connected";
  syncError: string | null;
  stale: boolean;
  connected: boolean;
  applied: boolean;
  partial: boolean;
  statusTitle: string;
  statusDetail: string;
  roomStatuses: Array<{
    roomId: string;
    provider: "channex";
    status: "synced" | "syncing" | "pending" | "failed" | "stale" | "not_mapped";
    lastSyncedAt: string | null;
    pendingJobCount: number;
    failedJobCount: number;
    safeMessage: string;
  }>;
};

type CalendarCellSyncState = "syncing" | "synced" | "failed";

const CALENDAR_VIEW_OPTIONS: Array<{ value: CalendarRestrictionType; label: string }> = [
  { value: "all_restrictions", label: "All Restrictions" },
  { value: "only_availability", label: "Only Availability" },
  { value: "rate_and_availability", label: "Rate And Availability" },
  { value: "availability_offset", label: "Availability Offset" },
  { value: "availability_per_rate", label: "Availability Per Rate" },
  { value: "cta", label: "Closed To Arrival" },
  { value: "ctd", label: "Closed To Departure" },
  { value: "max_availability", label: "Max Availability" },
  { value: "max_stay", label: "Max Stay" },
  { value: "min_stay_arrival", label: "Min Stay Arrival" },
  { value: "min_stay_through", label: "Min Stay Through" },
  { value: "rate", label: "Rate" },
  { value: "stop_sell", label: "Stop Sell" },
];

const CALENDAR_RESTRICTION_OPTIONS: Array<{ value: CalendarRestrictionType; label: string }> = [
  { value: "cta", label: "Closed To Arrival" },
  { value: "ctd", label: "Closed To Departure" },
  { value: "max_availability", label: "Max Availability" },
  { value: "max_stay", label: "Max Stay" },
  { value: "min_stay_arrival", label: "Min Stay Arrival" },
  { value: "min_stay_through", label: "Min Stay Through" },
  { value: "rate", label: "Rate" },
  { value: "stop_sell", label: "Stop Sell" },
  { value: "block_selected", label: "Block / stop selling selected dates" },
  { value: "unblock_selected", label: "Unblock selected dates" },
];

const CALENDAR_ROW_KIND_LABELS: Record<CalendarGridRowKind, { code: string; title: string }> = {
  availability: { code: "AVL", title: "availability" },
  availability_offset: { code: "AVO", title: "availability offset" },
  availability_per_rate: { code: "APR", title: "availability per rate" },
  cta: { code: "CTA", title: "closed to arrival" },
  ctd: { code: "CTD", title: "closed to departure" },
  max_availability: { code: "MAL", title: "max availability" },
  max_stay: { code: "MXS", title: "max stay" },
  min_stay_arrival: { code: "MSA", title: "min stay arrival" },
  min_stay_through: { code: "MST", title: "min stay through" },
  rate: { code: "RATE", title: "daily rate" },
  stop_sell: { code: "SS", title: "stop sell" },
};

const CALENDAR_BULK_WEEKDAY_OPTIONS: Array<{ value: CalendarBulkWeekday; label: string }> = [
  { value: "sun", label: "Sun" },
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
];

const CALENDAR_BULK_RESTRICTION_OPTIONS: Array<{ value: CalendarBulkRestrictionKey; label: string }> = [
  { value: "rate", label: "Rate" },
  { value: "stop_sell", label: "Stop Sell" },
  { value: "cta", label: "Closed To Arrival" },
  { value: "ctd", label: "Closed To Departure" },
  { value: "min_stay_arrival", label: "Min Stay Arrival" },
  { value: "min_stay_through", label: "Min Stay Through" },
  { value: "max_stay", label: "Max Stay" },
];

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
  paymentCollectMode: "FAMLO_COLLECT" | "OTA_COLLECT" | "PROPERTY_COLLECT" | "UNKNOWN";
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

type BookingDocumentModalState = {
  kind: "guest_receipt" | "host_statement";
  booking: ProBookingSummary;
  title: string;
  url: string;
};

type GeneratedReportRow = {
  name: string;
  type: string;
  period: string;
  generatedOn: string;
  format: string;
  status: "Ready";
  rowCount: number;
};

type HostRevenueCompliance = {
  panVerified: boolean;
  payoutAccountActive: boolean;
};

type OtaEditDraft = {
  startDate: string;
  endDate: string;
  stayUnitId: string;
  totalAmount: string;
};

type BookingWorkspaceFilter =
  | "All"
  | "Famlo Direct"
  | "OTA"
  | "Pending approval"
  | "Confirmed"
  | "Cancelled"
  | "Modified / Review needed";

type BookingWorkspaceView = "Current" | "History";

type BookingDateFilter = "Checked in" | "Checked out" | "All Bookings" | "Staying Today";

type RevenueWindowFilter = "Today" | "This week" | "This month" | "All time";
type ReportWindowFilter = "Today" | "This week" | "This month" | "All time";

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

type DashboardConversationSummary = {
  id: string;
  guestName: string;
  guestAvatarUrl: string | null;
  guestUnread: number;
  lastMessage: string;
  lastMessageAt: string | null;
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

type HeaderChannexStatus = "checking" | "connected" | "disconnected";

type PropertyContentDraft = FamilyListingDraft;

interface FamloProDashboardShellProps {
  embeddedAppView?: boolean;
  familyId: string;
  isAdminView: boolean;
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
  feedItems: FeedItem[];
  basicRoomUrl: string;
  initialProfile: FamilyProfileDraft;
  initialPropertyContent: PropertyContentDraft;
  initialSchedule: FamilyScheduleDraft;
  initialCompliance: FamilyComplianceDraft;
  propertyPhotos: PhotoItem[];
  initialSettings: HostProSettings;
  channelFoundation: HostProChannelFoundation;
  channexConfig: ChannexSummary;
  globalCommission: number;
  proBookings: ProBookingSummary[];
  hostRevenueCompliance: HostRevenueCompliance;
  calendarColumns: CalendarColumn[];
  calendarRows: CalendarRow[];
  calendarWindow: {
    startDate: string;
    endDate: string;
    isCustomRange: boolean;
    verificationUrl: string | null;
    verificationTargetLabel: string | null;
  };
  calendarSync: CalendarSyncMetadata;
  calendarWorkspaceStatus: CalendarWorkspaceStatus;
  calendarVerification: {
    targetDate: string;
    checkoutDate: string;
    roomName: string;
    sourceLabel: string;
    targetDateBlocked: boolean;
    checkoutDateBlocked: boolean;
  } | null;
  dashboardLoadMetrics?: ProDashboardLoadMetrics | null;
}

type NavItem = {
  id: ProTopLevelId;
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
};

type SupportBillingWorkspace = {
  selectedProperty?: {
    access?: {
      currentPeriodEnd?: string | null;
      graceUntil?: string | null;
    } | null;
    currentSubscription?: {
      currentPeriodEnd?: string | null;
    } | null;
  } | null;
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

type HostChannelSetupDraft = {
  bookingHotelId: string;
  bookingPropertyCode: string;
  providerListingId: string;
  providerPropertyCode: string;
  providerListingUrl: string;
  providerAccessToken: string;
  channexConfirmed: boolean;
  airbnbAuthorized: boolean;
};

type HostChannelPreviewSuggestion = {
  roomId: string;
  famloRoomName: string;
  suggestedRoomTypeTitle: string | null;
  suggestedRatePlanTitle: string | null;
  autoApplicable: boolean;
};

type HostChannelPreviewState = {
  previewId: string | null;
  mode: "preview";
  message: string;
  refreshedAt: string | null;
  autoApplicableCount: number;
  propertyName: string | null;
  propertyReference: string | null;
  roomList: Array<{ title: string }>;
  ratePlans: Array<{ title: string }>;
  selectedRoomSuggestion: HostChannelPreviewSuggestion | null;
  warnings: string[];
};

type ChannexSetupViewState = {
  propertyStatus: string;
  externalPropertyId: string | null;
  statusMessage?: string | null;
  activeRoomsCount: number;
  roomMappingsReadyCount: number;
  ratePlansReadyCount: number;
  roomMappings: Array<{
    stayUnitId: string;
    name: string;
    status: string;
    externalRoomTypeId: string | null;
  }>;
  ratePlans: Array<{
    stayUnitId: string;
    name: string;
    title: string;
    status: string;
    externalRatePlanId: string | null;
  }>;
};

function buildChannexSetupViewState(
  channelFoundation: HostProChannelFoundation,
  rooms: RoomSummary[]
): ChannexSetupViewState {
  const primaryProperty =
    channelFoundation.properties.find(
      (property) => property.providerCode === "channex" && Boolean(property.externalPropertyId)
    ) ??
    channelFoundation.properties.find((property) => property.providerCode === "channex") ??
    null;
  const roomMappingsByRoomId = new Map(
    channelFoundation.roomMappings.map((mapping) => [mapping.stayUnitId, mapping] as const)
  );
  const ratePlansByRoomId = new Map(
    channelFoundation.ratePlans
      .filter((plan) => Boolean(plan.stayUnitId))
      .map((plan) => [plan.stayUnitId as string, plan] as const)
  );
  const activeRooms = rooms.filter((room) => room.isActive);
  const roomMappings = activeRooms.map((room) => {
    const mapping = roomMappingsByRoomId.get(room.id) ?? null;
    return {
      stayUnitId: room.id,
      name: room.name,
      status: mapping?.externalRoomTypeId ? "mapped" : mapping?.syncStatus ?? "not_mapped",
      externalRoomTypeId: mapping?.externalRoomTypeId ?? null,
    };
  });
  const ratePlans = activeRooms.map((room) => {
    const plan = ratePlansByRoomId.get(room.id) ?? null;
    return {
      stayUnitId: room.id,
      name: room.name,
      title: plan?.title ?? `Standard Rate - ${room.name}`,
      status: plan?.externalRatePlanId ? "mapped" : plan?.syncStatus ?? "not_mapped",
      externalRatePlanId: plan?.externalRatePlanId ?? null,
    };
  });

  return {
    propertyStatus: primaryProperty?.syncStatus ?? "not_created",
    externalPropertyId: primaryProperty?.externalPropertyId ?? null,
    statusMessage: null,
    activeRoomsCount: activeRooms.length,
    roomMappingsReadyCount: roomMappings.filter((mapping) => Boolean(mapping.externalRoomTypeId)).length,
    ratePlansReadyCount: ratePlans.filter((plan) => Boolean(plan.externalRatePlanId)).length,
    roomMappings,
    ratePlans,
  };
}

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

function buildHostChannelSetupDraft(providerKey: ChannelProviderKey, state: ChannelSetupState | null | undefined): HostChannelSetupDraft {
  const metadata = state?.metadata;
  return {
    bookingHotelId: metadata?.booking_hotel_id ?? "",
    bookingPropertyCode: metadata?.booking_property_code ?? "",
    providerListingId: metadata?.provider_listing_id ?? "",
    providerPropertyCode: metadata?.provider_property_code ?? "",
    providerListingUrl: metadata?.provider_listing_url ?? "",
    providerAccessToken: "",
    channexConfirmed:
      providerKey === "booking"
        ? metadata?.booking_extranet_request_acknowledged === true || metadata?.connectivity_provider_requested === true
        : metadata?.provider_extranet_request_acknowledged === true,
    airbnbAuthorized:
      providerKey === "airbnb" &&
      (metadata?.provider_structure_verified === true || metadata?.provider_channel_attached === true),
  };
}

function readHostChannelConnected(providerKey: ChannelProviderKey, state: ChannelSetupState, bookingConnected: boolean): boolean {
  return providerKey === "booking" ? bookingConnected : state.metadata.provider_channel_attached === true;
}

function resolveHostChannelFieldLabels(providerKey: ChannelProviderKey): {
  primaryLabel: string;
  secondaryLabel: string;
  tertiaryLabel: string | null;
  accessTokenLabel: string | null;
  assistedNote: string | null;
} {
  if (providerKey === "booking") {
    return {
      primaryLabel: "Booking.com listing / hotel ID",
      secondaryLabel: "Booking.com property code",
      tertiaryLabel: null,
      accessTokenLabel: null,
      assistedNote: null,
    };
  }
  if (providerKey === "mmt") {
    return {
      primaryLabel: "MMT / Goibibo hotel ID",
      secondaryLabel: "Hotel code",
      tertiaryLabel: "Listing or extranet URL",
      accessTokenLabel: "Access token (only if MMT provided one)",
      assistedNote: null,
    };
  }
  if (providerKey === "airbnb") {
    return {
      primaryLabel: "Airbnb listing ID",
      secondaryLabel: "Owner host account reference",
      tertiaryLabel: "Airbnb listing URL",
      accessTokenLabel: null,
      assistedNote: null,
    };
  }
  if (providerKey === "agoda") {
    return {
      primaryLabel: "Agoda / YCS property ID",
      secondaryLabel: "Agoda hotel reference",
      tertiaryLabel: "Agoda or YCS URL",
      accessTokenLabel: null,
      assistedNote: null,
    };
  }
  if (providerKey === "expedia") {
    return {
      primaryLabel: "Expedia property ID",
      secondaryLabel: "Min stay type setting",
      tertiaryLabel: "Partner Central reference URL",
      accessTokenLabel: null,
      assistedNote: null,
    };
  }
  return {
    primaryLabel: "OTA property reference",
    secondaryLabel: "OTA room or listing reference",
    tertiaryLabel: "OTA listing URL",
    accessTokenLabel: null,
    assistedNote: null,
  };
}

const TOP_LEVEL_NAV_ITEMS: NavItem[] = [
  { id: "dashboard", title: "Dashboard", hint: "Action center", icon: Activity },
  { id: "properties", title: "Properties", hint: "Rooms, channels, and content", icon: Building2 },
  { id: "bookings", title: "Bookings", hint: "Reservations and OTA flow", icon: BookCheck },
  { id: "calendar", title: "Calendar", hint: "Availability and stays", icon: CalendarDays },
  { id: "messages", title: "Messages", hint: "Guest conversations", icon: MessageSquareMore },
  { id: "revenue", title: "Revenue & Report", hint: "Performance and summaries", icon: WalletCards },
  { id: "support", title: "Support & Billing", hint: "Billing, FAQ, help", icon: BellRing },
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
  ["documents", "host-profile"],
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
  ["reports", "revenue"],
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
    { id: "details", title: "Edit Details", description: "" },
    { id: "pricing", title: "Pricing", description: "" },
    { id: "calendar", title: "Calendar", description: "" },
    { id: "channels", title: "Channels", description: "" },
    { id: "mapping", title: "Room & Price Matching", description: "" },
    { id: "sync-health", title: "Issues & Sync Status", description: "" },
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
];
const BOOKING_DATE_FILTERS: BookingDateFilter[] = ["Checked in", "Checked out", "All Bookings", "Staying Today"];
const PRO_SECTION_IDS = new Set<ProSectionId>([
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
]);

function readSectionFromUrl(value: string | null | undefined): ProSectionId | null {
  if (!value) return null;
  return PRO_SECTION_IDS.has(value as ProSectionId) ? (value as ProSectionId) : null;
}

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

function addDaysToDateString(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatRelativeAge(value: string | null, referenceNow: number): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  const diffMs = referenceNow - date.getTime();
  if (diffMs < 0) return "Just now";
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return `${Math.max(1, diffSeconds)}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatDashboardMessageTimestamp(value: string | null): string {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const sameYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (sameYesterday) return "Yesterday";
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays <= 6) return `${Math.max(1, diffDays)} days ago`;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(date);
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
  if (booking.isReviewOnly) return true;
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
  if (booking.isReviewOnly) return true;
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
    (ackStatus !== "acknowledged" && importStatus !== "not_applicable")
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
    const ackStatus = normalizeToken(booking.ackStatus);
    if (importStatus.includes("failed")) return "Import issue";
    if (importStatus === "preview") return "Awaiting import";
    if (ackStatus !== "acknowledged") return "Awaiting acknowledgement";
    return "Synced";
  }
  if (isConfirmedBooking(booking)) return "Confirmed";
  return labelizeToken(booking.status, "unknown");
}

function hostRevenueStatusLabel(booking: ProBookingSummary): string {
  if (isCancelledBooking(booking)) return "Cancelled";
  if (hasPaymentAttention(booking)) return "Awaiting guest payment";
  if (isPendingApprovalBooking(booking)) return "Awaiting confirmation";
  return deriveRevenuePaymentStatusLabel(booking);
}

function hostRevenueStatusTone(booking: ProBookingSummary): string {
  if (isCancelledBooking(booking)) return styles.readinessPillMissing;
  if (isFinanceBackedPaidStatus(booking.payoutExecutionStatus) || isFinanceBackedPaidStatus(booking.payoutStatus)) return styles.readinessPillOk;
  if (!booking.famloPayoutEligible) return styles.readinessPill;
  if (booking.complianceBlocked || booking.payoutHoldStatus === "on_hold" || booking.payoutHoldStatus === "paused") return styles.readinessPillReview;
  if (hasPaymentAttention(booking) || isPendingApprovalBooking(booking)) return styles.readinessPillReview;
  return styles.readinessPillOk;
}

function revenueSourceLabel(booking: ProBookingSummary): string {
  if (booking.sourceCategory === "ota") return "OTA";
  if (booking.sourceCategory === "direct") return "Direct";
  return "Famlo";
}

function revenueSourceHint(booking: ProBookingSummary): string {
  if (booking.sourceCategory === "ota") {
    return booking.famloPayoutEligible ? "Payment handled by Famlo" : "May be paid by OTA/outside Famlo";
  }
  if (booking.sourceCategory === "direct") {
    return booking.famloPayoutEligible ? "Payment handled by Famlo" : "Paid outside Famlo";
  }
  return "Payment handled by Famlo";
}

function bookingFamloPayoutDisplay(booking: ProBookingSummary): string {
  if (booking.paymentCollectMode !== "FAMLO_COLLECT") return "Outside Famlo";
  if (!booking.famloPayoutEligible) return "Pending settlement";
  return booking.payoutAmountValue != null ? formatCurrency(booking.payoutAmountValue) : "—";
}

function bookingFamloPayoutHint(booking: ProBookingSummary): string {
  if (booking.paymentCollectMode !== "FAMLO_COLLECT") return "Outside-Famlo payouts stay separate";
  if (!booking.famloPayoutEligible) return "Waiting for a finance-backed settlement line";
  if (booking.complianceBlocked) return "Payout is blocked until compliance is cleared";
  if (booking.payoutHoldStatus === "on_hold" || booking.payoutHoldStatus === "paused") {
    return booking.payoutHoldIsHostActionable ? "Host action is needed before payout can resume" : "Famlo has temporarily held this payout";
  }
  return "Famlo-managed payout amount";
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

const bookingEditInputStyle: CSSProperties = {
  width: "100%",
  borderRadius: "12px",
  border: "1px solid #dbe2ea",
  background: "#ffffff",
  color: "#0f172a",
  padding: "10px 12px",
  fontSize: "13px",
};

const OTA_HOST_EDIT_VISIBLE = false;

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
  if (status === "unavailable") return styles.calendarCellManual;
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

function CalendarToolbarDropdown({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  disabled?: boolean;
  onChange: (value: string) => void;
}): React.JSX.Element {
  const selectedOption = options.find((option) => option.value === value) ?? options[0] ?? null;

  return (
    <details className={`${styles.calendarToolbarDropdown} ${disabled ? styles.calendarToolbarDropdownDisabled : ""}`}>
      <summary className={styles.calendarToolbarDropdownSummary}>
        <span className={styles.calendarToolbarDropdownLabel}>{selectedOption?.label ?? label}</span>
        <ChevronDown size={16} />
      </summary>
      <div className={styles.calendarToolbarDropdownMenu}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`${styles.calendarToolbarDropdownItem} ${option.value === value ? styles.calendarToolbarDropdownItemSelected : ""}`}
            onClick={(event) => {
              event.preventDefault();
              if (disabled || option.disabled) return;
              onChange(option.value);
              event.currentTarget.closest("details")?.removeAttribute("open");
            }}
            disabled={disabled || option.disabled}
          >
            <span>{option.label}</span>
            {option.value === value ? <Check size={15} /> : null}
          </button>
        ))}
      </div>
    </details>
  );
}

function formatLongDate(dateValue: string): string {
  const value = new Date(`${dateValue}T12:00:00+05:30`);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

function formatCalendarDateRange(startDate: string, endDate: string): string {
  return `${formatLongDate(startDate)} → ${formatLongDate(endDate)}`;
}

function calendarRestrictionLabel(value: CalendarRestrictionType): string {
  return [...CALENDAR_VIEW_OPTIONS, ...CALENDAR_RESTRICTION_OPTIONS].find((option) => option.value === value)?.label ?? "Rate";
}

function calendarRowKindsForView(value: CalendarRestrictionType): CalendarGridRowKind[] {
  if (value === "all_restrictions") {
    return [
      "availability",
      "availability_offset",
      "availability_per_rate",
      "cta",
      "ctd",
      "max_availability",
      "max_stay",
      "min_stay_arrival",
      "min_stay_through",
      "rate",
      "stop_sell",
    ];
  }
  if (value === "only_availability") return ["availability"];
  if (value === "rate_and_availability") return ["availability", "rate"];
  if (value === "availability_offset") return ["availability_offset"];
  if (value === "availability_per_rate") return ["availability_per_rate"];
  if (value === "cta") return ["cta"];
  if (value === "ctd") return ["ctd"];
  if (value === "max_availability") return ["max_availability"];
  if (value === "max_stay") return ["max_stay"];
  if (value === "min_stay_arrival") return ["min_stay_arrival"];
  if (value === "min_stay_through") return ["min_stay_through"];
  if (value === "stop_sell") return ["stop_sell"];
  return ["rate"];
}

function calendarRestrictionTypeForRowKind(kind: CalendarGridRowKind): CalendarRestrictionType {
  if (kind === "availability") return "block_selected";
  if (kind === "availability_offset") return "availability_offset";
  if (kind === "availability_per_rate") return "availability_per_rate";
  if (kind === "cta") return "cta";
  if (kind === "ctd") return "ctd";
  if (kind === "max_availability") return "max_availability";
  if (kind === "max_stay") return "max_stay";
  if (kind === "min_stay_arrival") return "min_stay_arrival";
  if (kind === "min_stay_through") return "min_stay_through";
  if (kind === "stop_sell") return "stop_sell";
  return "rate";
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

function enumerateInclusiveCalendarDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00+05:30`);
  const finalDate = new Date(`${endDate}T12:00:00+05:30`);

  while (cursor.getTime() <= finalDate.getTime()) {
    dates.push(isoDateFromLocalDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function weekdayTokenForIsoDate(dateValue: string): CalendarBulkWeekday {
  const weekday = new Date(`${dateValue}T12:00:00+05:30`).getDay();
  return CALENDAR_BULK_WEEKDAY_OPTIONS[weekday]?.value ?? "sun";
}

function compactCalendarDateRanges(dates: string[]): Array<{ dateFrom: string; dateTo: string }> {
  if (dates.length === 0) return [];
  const sortedDates = [...new Set(dates)].sort();
  const ranges: Array<{ dateFrom: string; dateTo: string }> = [];
  let rangeStart = sortedDates[0]!;
  let previousDate = sortedDates[0]!;

  for (let index = 1; index < sortedDates.length; index += 1) {
    const currentDate = sortedDates[index]!;
    const previous = new Date(`${previousDate}T12:00:00+05:30`);
    previous.setDate(previous.getDate() + 1);
    const expectedNext = isoDateFromLocalDate(previous);

    if (currentDate !== expectedNext) {
      ranges.push({ dateFrom: rangeStart, dateTo: previousDate });
      rangeStart = currentDate;
    }

    previousDate = currentDate;
  }

  ranges.push({ dateFrom: rangeStart, dateTo: previousDate });
  return ranges;
}

function shiftCalendarStartByMonths(dateValue: string, deltaMonths: number): string {
  const baseDate = new Date(`${dateValue}T12:00:00+05:30`);
  baseDate.setMonth(baseDate.getMonth() + deltaMonths);
  return isoDateFromLocalDate(baseDate);
}

function formatMonthShort(dateValue: string): string {
  const value = new Date(`${dateValue}T12:00:00+05:30`);
  return new Intl.DateTimeFormat("en-IN", { month: "short" }).format(value);
}

function formatWeekdayShort(dateValue: string): string {
  const value = new Date(`${dateValue}T12:00:00+05:30`);
  return new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(value);
}

function countOverlappingNights(startDate: string, checkoutDate: string, rangeStart: string, rangeCheckout: string): number {
  const effectiveStart = startDate > rangeStart ? startDate : rangeStart;
  const effectiveCheckout = checkoutDate < rangeCheckout ? checkoutDate : rangeCheckout;
  if (effectiveCheckout <= effectiveStart) return 0;
  const start = new Date(`${effectiveStart}T12:00:00+05:30`);
  const end = new Date(`${effectiveCheckout}T12:00:00+05:30`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

function formatCompactDateTime(dateValue: string | null, fallbackTime: string): { primary: string; secondary: string } {
  if (!dateValue) {
    return { primary: "Date unavailable", secondary: fallbackTime };
  }
  return {
    primary: formatLongDate(dateValue),
    secondary: fallbackTime,
  };
}

function normalizeBookingChannel(booking: ProBookingSummary): string {
  const label = (booking.sourceLabel || "").toLowerCase();
  if (label.includes("airbnb")) return "Airbnb";
  if (label.includes("booking")) return "Booking.com";
  if (label.includes("make") || label.includes("mmt")) return "MakeMyTrip";
  if (label.includes("agoda")) return "Agoda";
  if (label.includes("goibibo") || label.includes("gib")) return "Goibibo";
  if (booking.isOta) return "OTA";
  if (booking.sourceCategory === "direct") return "Direct";
  return "Famlo Direct";
}

function matchesReportWindowDate(
  dateValue: string,
  window: ReportWindowFilter,
  anchors: {
    todayIsoDate: string;
    weekStartIsoDate: string;
    weekEndIsoDate: string;
    currentMonthPrefix: string;
  }
): boolean {
  if (window === "Today") return dateValue === anchors.todayIsoDate;
  if (window === "This week") return dateValue >= anchors.weekStartIsoDate && dateValue <= anchors.weekEndIsoDate;
  if (window === "This month") return dateValue.startsWith(anchors.currentMonthPrefix);
  return true;
}

function buildCsvDownload(
  filename: string,
  rows: Array<Record<string, string | number | null | undefined>>
): void {
  const header = Object.keys(rows[0] ?? { notice: "No rows available" });
  const csv = [
    header.join(","),
    ...rows.map((row) =>
      header
        .map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(href);
}

function buildInitials(value: string): string {
  const initials = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "H";
}

function formatPercentage(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function bookingChannelMarker(channel: string): string {
  if (channel === "Airbnb") return "A";
  if (channel === "Booking.com") return "B";
  if (channel === "MakeMyTrip") return "MM";
  if (channel === "Agoda") return "AG";
  if (channel === "Goibibo") return "GI";
  if (channel === "OTA") return "O";
  return "D";
}

function dashboardBookingStatusLabel(booking: ProBookingSummary): string {
  if (isCancelledBooking(booking)) return "Cancelled";
  if (isPendingApprovalBooking(booking)) return "Pending";
  if (isModifiedReviewBooking(booking)) return "Review";
  return "Confirmed";
}

function dashboardBookingStatusTone(booking: ProBookingSummary): string {
  if (isCancelledBooking(booking)) return styles.dashboardStatusDanger;
  if (isPendingApprovalBooking(booking)) return styles.dashboardStatusWarning;
  if (isModifiedReviewBooking(booking)) return styles.dashboardStatusInfo;
  return styles.dashboardStatusSuccess;
}

function uploadDashboardFileWithProgress(params: {
  uploadUrl: string;
  file: File;
  onProgress?: (progress: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", params.uploadUrl);
    xhr.timeout = 60_000;
    xhr.setRequestHeader("Content-Type", params.file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !params.onProgress) return;
      params.onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        params.onProgress?.(100);
        resolve();
        return;
      }
      reject(new Error(`Upload failed with status ${xhr.status || 0}.`));
    };
    xhr.onerror = () => reject(new Error("Upload failed before reaching storage."));
    xhr.onabort = () => reject(new Error("Upload was aborted before completion."));
    xhr.ontimeout = () => reject(new Error("Upload to storage timed out."));
    xhr.send(params.file);
  });
}

async function uploadDashboardFileViaFallback(params: {
  url: string;
  familyId: string;
  file: File;
}): Promise<{
  publicUrl: string;
  storageKey?: string;
}> {
  const formData = new FormData();
  formData.append("familyId", params.familyId);
  formData.append("file", params.file);

  const response = await fetch(params.url, {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    publicUrl?: string;
    storageKey?: string;
  };

  if (!response.ok || !payload.publicUrl) {
    throw new Error(payload.error || "Unable to upload media through the backup path.");
  }

  return {
    publicUrl: payload.publicUrl,
    storageKey: payload.storageKey,
  };
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
      copy: "Source-aware booking workspace connected to existing Famlo and channel booking APIs.",
      status: "Live workspace",
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
      title: "Revenue & Report",
      copy: "Booking value, payment status, payout, fee, tax, and channel summaries from existing records only.",
      status: "Real data",
    };
  }

  if (section === "reports") {
    return {
      eyebrow: "Insights",
      title: "Revenue & Report",
      copy: "Generate CSV reports from the current booking, revenue, payout, and channel filters.",
      status: "Export-ready",
    };
  }

  if (section === "host-profile") {
    return {
      eyebrow: "Property Profile",
      title: "Host Profile",
      copy: "Manage the host identity, story, gallery, documents, and listing details shown for this property.",
      status: "Host workspace",
    };
  }

  if (section === "documents") {
    return {
      eyebrow: "Property Profile",
      title: "Documents",
      copy: "Manage the same property-scoped onboarding, KYC, GST, and compliance documents used in the basic dashboard.",
      status: "Existing document flow",
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
      eyebrow: "",
      title: "Settings",
      copy: "",
      status: "",
    };
  }

  if (section === "support") {
    return {
      eyebrow: "Support & Resolution",
      title: "Support & Resolution",
      copy: "Need help with a booking, payout, OTA connection, or Famlo Pro setup? Message Team Famlo directly.",
      status: "Help and billing",
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
  embeddedAppView = false,
  familyId,
  isAdminView,
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
  feedItems,
  basicRoomUrl,
  initialProfile,
  initialPropertyContent,
  initialSchedule,
  initialCompliance,
  propertyPhotos,
  initialSettings,
  channelFoundation,
  channexConfig,
  globalCommission,
  proBookings: initialProBookings,
  hostRevenueCompliance,
  calendarColumns,
  calendarRows: initialCalendarRows,
  calendarWindow,
  calendarSync: initialCalendarSync,
  calendarWorkspaceStatus,
  calendarVerification,
  dashboardLoadMetrics = null,
}: Readonly<FamloProDashboardShellProps>): React.JSX.Element {
  const getCalendarRateOverrideKey = (roomId: string, date: string): string => `${roomId}:${date}`;
  const getCalendarCellSyncKey = (roomId: string, date: string): string => `${roomId}:${date}`;
  const { signOut } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<ProSectionId>(initialSection);
  const [appearanceMode, setAppearanceMode] = useState<"dark" | "light">("dark");
  const [proBookings, setProBookings] = useState<ProBookingSummary[]>(initialProBookings);
  const [calendarRows, setCalendarRows] = useState<CalendarRow[]>(initialCalendarRows);
  const [bookingLiveHealth, setBookingLiveHealth] = useState<BookingFeedLiveHealth>({
    lastUpdatedAt: new Date().toISOString(),
    lastChannexBookingCheckAt: null,
    lastChannexBookingReceivedAt: null,
    lastSuccessfulBookingImportAt: null,
    lastBookingImportError: null,
    importedBookingCountToday: 0,
    pendingReviewCount: 0,
    failedImportCount: 0,
    syncing: false,
    safeMessage: "Saved bookings are loaded.",
  });
  const [channexSetupState, setChannexSetupState] = useState<ChannexSetupViewState>(() =>
    buildChannexSetupViewState(channelFoundation, rooms)
  );
  const [supportBillingUrgent, setSupportBillingUrgent] = useState(false);
  const [settingsProfileDraft, setSettingsProfileDraft] = useState<FamilyProfileDraft>(initialProfile);
  const [settingsPropertyDraft, setSettingsPropertyDraft] = useState<PropertyContentDraft>(initialPropertyContent);
  const [isEditingAccountSettings, setIsEditingAccountSettings] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [channelFinanceSettings, setChannelFinanceSettings] = useState<ChannelFinanceSettings>(() =>
    createDefaultChannelFinanceSettings(familyId)
  );
  const [channelFinanceLoadedFamilyId, setChannelFinanceLoadedFamilyId] = useState<string | null>(null);
  const isChannelFinanceLoading = false;
  const channelFinanceLoadInFlightRef = useRef(false);
  const [isChannelFinanceSaving, startChannelFinanceSaving] = useTransition();
  const [channelFinanceFeedback, setChannelFinanceFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(roomRouteState?.roomId ?? rooms[0]?.id ?? null);
  const [roomEditorTab, setRoomEditorTab] = useState<RoomEditorTabId>("details");
  const [hostProfileCompliance, setHostProfileCompliance] = useState<FamilyComplianceDraft>(initialCompliance);
  const [hostProfileDocumentsFeedback, setHostProfileDocumentsFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isHostProfileDocumentsSaving, startHostProfileDocumentsSaving] = useTransition();
  const [propertyContent, setPropertyContent] = useState<PropertyContentDraft>(initialPropertyContent);
  const [propertyGallery, setPropertyGallery] = useState<PhotoItem[]>(propertyPhotos);
  const [propertyContentSaving, startPropertyContentSaving] = useTransition();
  const [isPropertySwitchPending, setIsPropertySwitchPending] = useState(false);
  const [isSidebarLogoBroken, setIsSidebarLogoBroken] = useState(false);
  const [pendingPropertyLabel, setPendingPropertyLabel] = useState<string | null>(null);
  const [propertyContentFeedback, setPropertyContentFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSavingSettingsWorkspace, startSavingSettingsWorkspace] = useTransition();
  const [isLoggingOut, startLoggingOut] = useTransition();
  const [headerChannexStatus, setHeaderChannexStatus] = useState<HeaderChannexStatus>(
    channexConfig.configured && channexConfig.apiKeyConfigured ? "connected" : "disconnected"
  );
  const [selectedCalendarBooking, setSelectedCalendarBooking] = useState<CalendarBookingDetail | null>(null);
  const [calendarActionFeedback, setCalendarActionFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [bulkCalendarFeedback, setBulkCalendarFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [calendarActionDate, setCalendarActionDate] = useState<string | null>(null);
  const [calendarAvailabilityOverrides, setCalendarAvailabilityOverrides] = useState<Record<string, CalendarCell["status"]>>({});
  const [calendarCellSyncStates, setCalendarCellSyncStates] = useState<Record<string, CalendarCellSyncState>>({});
  const [calendarSyncState, setCalendarSyncState] = useState<CalendarSyncMetadata>(initialCalendarSync);
  const [calendarSyncFeedback, setCalendarSyncFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [calendarSyncRequestState, setCalendarSyncRequestState] = useState<{
    phase: "idle" | "syncing" | "timed_out";
    source: "background_open" | "poll" | "sync_now" | null;
    runId: number;
  }>({
    phase: "idle",
    source: null,
    runId: 0,
  });
  const calendarSyncRunIdRef = useRef(0);
  const calendarSyncTimeoutRef = useRef<number | null>(null);
  const [calendarRestrictionView, setCalendarRestrictionView] = useState<CalendarRestrictionType>("rate_and_availability");
  const [calendarRoomFilter, setCalendarRoomFilter] = useState("all");
  const [calendarRateFilter, setCalendarRateFilter] = useState("all");
  const [isCalendarActionPending, startCalendarAction] = useTransition();
  const [isCalendarSyncPending, startCalendarSyncTransition] = useTransition();
  const [selectedCalendarRateCell, setSelectedCalendarRateCell] = useState<CalendarRateEditorState | null>(null);
  const [calendarRateDraft, setCalendarRateDraft] = useState("");
  const [calendarRateFeedback, setCalendarRateFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [calendarRateActionDate, setCalendarRateActionDate] = useState<string | null>(null);
  const [calendarRateOverrides, setCalendarRateOverrides] = useState<Record<string, CalendarRateOverrideState>>({});
  const [calendarProjectedCellOverrides, setCalendarProjectedCellOverrides] = useState<Record<string, CalendarProjectedCellState>>({});
  const [isCalendarRatePending, startCalendarRateTransition] = useTransition();
  const [isCalendarReloadPending, startCalendarReloadTransition] = useTransition();
  const [calendarDatePickerValue, setCalendarDatePickerValue] = useState(calendarWindow.startDate);
  const [isBulkCalendarEditorOpen, setIsBulkCalendarEditorOpen] = useState(false);
  const [calendarBulkSearch, setCalendarBulkSearch] = useState("");
  const [calendarBulkSelectedRoomIds, setCalendarBulkSelectedRoomIds] = useState<string[]>([]);
  const [calendarBulkSelectedRatePlanIds, setCalendarBulkSelectedRatePlanIds] = useState<string[]>([]);
  const [calendarBulkWeekdays, setCalendarBulkWeekdays] = useState<Record<CalendarBulkWeekday, boolean>>({
    sun: true,
    mon: true,
    tue: true,
    wed: true,
    thu: true,
    fri: true,
    sat: true,
  });
  const [calendarBulkRestrictions, setCalendarBulkRestrictions] = useState<Record<CalendarBulkRestrictionKey, boolean>>({
    rate: false,
    stop_sell: false,
    cta: false,
    ctd: false,
    min_stay_arrival: false,
    min_stay_through: false,
    max_stay: false,
  });
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
  const [bookingView, setBookingView] = useState<BookingWorkspaceView>("Current");
  const [bookingDateFilter, setBookingDateFilter] = useState<BookingDateFilter>("All Bookings");
  const [bookingSearchQuery, setBookingSearchQuery] = useState("");
  const [bookingChannelFilter, setBookingChannelFilter] = useState("all");
  const [bookingPage, setBookingPage] = useState(1);
  const [bookingPageSize, setBookingPageSize] = useState(8);
  const [selectedBookingIds, setSelectedBookingIds] = useState<string[]>([]);
  const [isBookingsFilterMenuOpen, setIsBookingsFilterMenuOpen] = useState(false);
  const [isBookingsViewMenuOpen, setIsBookingsViewMenuOpen] = useState(false);
  const [activeBookingActionsId, setActiveBookingActionsId] = useState<string | null>(null);
  const [revenueWindow, setRevenueWindow] = useState<RevenueWindowFilter>("This month");
  const [reportWindow, setReportWindow] = useState<ReportWindowFilter>("This month");
  const [reportSourceFilter, setReportSourceFilter] = useState("all");
  const [reportRoomFilter, setReportRoomFilter] = useState("all");
  const [reportPaymentFilter, setReportPaymentFilter] = useState("all");
  const [revenueReportFeedback, setRevenueReportFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [generatedReportRows, setGeneratedReportRows] = useState<GeneratedReportRow[]>([]);
  const [isSidebarHostMenuOpen, setIsSidebarHostMenuOpen] = useState(false);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [bookingDocumentModal, setBookingDocumentModal] = useState<BookingDocumentModalState | null>(null);
  const [editingOtaBookingId, setEditingOtaBookingId] = useState<string | null>(null);
  const [otaEditDraft, setOtaEditDraft] = useState<OtaEditDraft | null>(null);
  const sidebarHostMenuRef = useRef<HTMLDivElement | null>(null);
  const activeRoomOptions = rooms.filter((room) => room.isActive);
  const [dashboardManualBookingDraft, setDashboardManualBookingDraft] = useState<{
    stayUnitId: string;
    checkInDate: string;
    checkOutDate: string;
    amount: string;
  }>({
    stayUnitId: activeRoomOptions[0]?.id ?? rooms[0]?.id ?? "",
    checkInDate: "",
    checkOutDate: "",
    amount: "",
  });
  const [dashboardManualBookingFeedback, setDashboardManualBookingFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dashboardReels, setDashboardReels] = useState<PublicPropertyReel[]>([]);
  const [dashboardPlayingReelId, setDashboardPlayingReelId] = useState<string | null>(null);
  const [selectedDashboardGalleryId, setSelectedDashboardGalleryId] = useState<string | null>(null);
  const [selectedDashboardReelId, setSelectedDashboardReelId] = useState<string | null>(null);
  const [dashboardMediaFeedback, setDashboardMediaFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isDashboardGalleryUploading, setIsDashboardGalleryUploading] = useState(false);
  const [isDashboardReelUploading, setIsDashboardReelUploading] = useState(false);
  const [pendingDashboardGalleryReplaceId, setPendingDashboardGalleryReplaceId] = useState<string | null>(null);
  const dashboardGalleryUploadInputRef = useRef<HTMLInputElement | null>(null);
  const dashboardGalleryReplaceInputRef = useRef<HTMLInputElement | null>(null);
  const dashboardReelUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [isDashboardManualBookingPending, startDashboardManualBookingTransition] = useTransition();
  const [bookingActionFeedback, setBookingActionFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSubmittingOtaEdit, startOtaEditTransition] = useTransition();
  const [isBookingsSyncPending, startBookingsSyncTransition] = useTransition();
  const [activeMessageConversationId, setActiveMessageConversationId] = useState<string | null>(null);
  const [dashboardConversationRows, setDashboardConversationRows] = useState<DashboardConversationSummary[]>([]);
  const [isDashboardConversationsLoading, setIsDashboardConversationsLoading] = useState(false);
  const [isDashboardBookingModalOpen, setIsDashboardBookingModalOpen] = useState(false);
  const [activeChannelSetup, setActiveChannelSetup] = useState<ChannelProviderKey | null>(null);
  const [selectedChannelToAdd, setSelectedChannelToAdd] = useState<ChannelProviderKey>("booking");
  const [channelSetupOverrides, setChannelSetupOverrides] = useState<Partial<Record<ChannelProviderKey, ChannelSetupState>>>({});
  const [roomChannelSetupDrafts, setRoomChannelSetupDrafts] = useState<Partial<Record<ChannelProviderKey, HostChannelSetupDraft>>>({});
  const hostDisplayName = initialProfile.hostDisplayName.trim() || propertyName;
  const hostProfileEmail = initialProfile.email?.trim() || settingsProfileDraft.email?.trim() || "";
  const hostProfileInitials = buildInitials(hostDisplayName || propertyName || "Host");

  useEffect(() => {
    setCalendarSyncState(initialCalendarSync);
    setCalendarSyncRequestState((current) => ({
      ...current,
      phase: "idle",
    }));
  }, [initialCalendarSync]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedMode = window.localStorage.getItem("famlo-pro-theme") ?? window.localStorage.getItem("famlo-pro-dashboard-appearance");
    if (storedMode === "light" || storedMode === "dark") {
      setAppearanceMode(storedMode);
      return;
    }
    setAppearanceMode("dark");
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.famloProAppearance = appearanceMode;
    document.cookie = `famlo-pro-theme=${appearanceMode}; path=/; max-age=31536000; samesite=lax`;
    return () => {
      delete document.documentElement.dataset.famloProAppearance;
    };
  }, [appearanceMode]);

  useEffect(() => {
    setSettingsProfileDraft(initialProfile);
  }, [initialProfile]);

  useEffect(() => {
    setSettingsPropertyDraft(initialPropertyContent);
  }, [initialPropertyContent]);

  useEffect(() => {
    if (embeddedAppView) return;
    if (!familyId) return;
    const shouldLoad =
      activeSection === "settings" ||
      activeSection === "bookings" ||
      bookingDocumentModal?.kind === "host_statement";
    if (!shouldLoad || channelFinanceLoadedFamilyId === familyId || channelFinanceLoadInFlightRef.current) return;

    let cancelled = false;
    channelFinanceLoadInFlightRef.current = true;
    fetch(`/api/host/pro/channel-finance?familyId=${encodeURIComponent(familyId)}`)
      .then((response) => response.json() as Promise<{ success?: boolean; settings?: ChannelFinanceSettings; error?: string }>)
      .then((payload) => {
        if (cancelled) return;
        if (payload.settings) {
          setChannelFinanceSettings(payload.settings);
          setChannelFinanceLoadedFamilyId(familyId);
          return;
        }
        setChannelFinanceLoadedFamilyId(familyId);
        setChannelFinanceFeedback({ type: "error", text: payload.error ?? "Unable to load Channel Finance settings." });
      })
      .catch((error) => {
        if (cancelled) return;
        setChannelFinanceLoadedFamilyId(familyId);
        setChannelFinanceFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Unable to load Channel Finance settings.",
        });
      })
      .finally(() => {
        channelFinanceLoadInFlightRef.current = false;
      });

    return () => {
      cancelled = true;
      channelFinanceLoadInFlightRef.current = false;
    };
  }, [activeSection, bookingDocumentModal?.kind, channelFinanceLoadedFamilyId, familyId]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handlePointerDown = (event: MouseEvent): void => {
      if (!sidebarHostMenuRef.current?.contains(event.target as Node)) {
        setIsSidebarHostMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    setIsSidebarHostMenuOpen(false);
  }, [activeSection]);

  useEffect(() => {
    setDashboardManualBookingDraft((current) =>
      current.stayUnitId
        ? current
        : {
            ...current,
            stayUnitId: activeRoomOptions[0]?.id ?? rooms[0]?.id ?? "",
          }
    );
  }, [activeRoomOptions, rooms]);

  useEffect(() => {
    if (embeddedAppView) return;
    let cancelled = false;
    fetch(`/api/host/property-reels?familyId=${encodeURIComponent(familyId)}`)
      .then((response) => response.json() as Promise<{ reels?: PublicPropertyReel[] }>)
      .then((payload) => {
        if (cancelled) return;
        setDashboardReels(Array.isArray(payload.reels) ? payload.reels : []);
      })
      .catch(() => {
        if (cancelled) return;
        setDashboardReels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [embeddedAppView, familyId]);

  useEffect(() => {
    setSelectedDashboardGalleryId((current) =>
      current && propertyGallery.some((photo) => photo.id === current) ? current : null
    );
  }, [propertyGallery]);

  useEffect(() => {
    setSelectedDashboardReelId((current) =>
      current && dashboardReels.some((reel) => reel.id === current) ? current : null
    );
  }, [dashboardReels]);

  useEffect(() => {
    if (activeSection !== "dashboard" || !hostUserId) {
      setDashboardConversationRows([]);
      setIsDashboardConversationsLoading(false);
      return;
    }

    let cancelled = false;
    setIsDashboardConversationsLoading(true);

    fetch(
      `/api/host/conversations?familyId=${encodeURIComponent(familyId)}&hostUserId=${encodeURIComponent(hostUserId)}`,
      { cache: "no-store" }
    )
      .then((response) => response.json() as Promise<Array<Record<string, unknown>> | { error?: string }>)
      .then((payload) => {
        if (cancelled) return;
        if (!Array.isArray(payload)) {
          setDashboardConversationRows([]);
          return;
        }

        setDashboardConversationRows(
          payload.slice(0, 3).map((item) => {
            const guest = (item.guest ?? null) as Record<string, unknown> | null;
            return {
              id: asStringOrNull(item.id) ?? "",
              guestName: asStringOrNull(guest?.name) || "Guest",
              guestAvatarUrl: asStringOrNull(guest?.avatar_url) || null,
              guestUnread: asNumberOrNull(item.host_unread) ?? 0,
              lastMessage: asStringOrNull(item.last_message) || "No message yet.",
              lastMessageAt: asStringOrNull(item.last_message_at) || null,
            };
          })
        );
      })
      .catch(() => {
        if (cancelled) return;
        setDashboardConversationRows([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsDashboardConversationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, familyId, hostUserId]);

  useEffect(() => {
    if (embeddedAppView) return;
    const sectionsToPrefetch: ProSectionId[] = [
      "properties-home",
      "bookings",
      "inventory-calendar",
      "revenue",
      "support",
      "settings",
    ];

    sectionsToPrefetch.forEach((section) => {
      router.prefetch(
        `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(familyId)}&section=${encodeURIComponent(section)}`
      );
    });
  }, [embeddedAppView, familyId, router]);

  useEffect(() => {
    if (embeddedAppView) {
      setSupportBillingUrgent(false);
      return;
    }
    let cancelled = false;

    async function loadSupportBillingUrgency(): Promise<void> {
      try {
        const response = await fetch(`/api/host/pro/billing?familyId=${encodeURIComponent(familyId)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as SupportBillingWorkspace;
        const endDateValue =
          payload.selectedProperty?.currentSubscription?.currentPeriodEnd ??
          payload.selectedProperty?.access?.currentPeriodEnd ??
          payload.selectedProperty?.access?.graceUntil ??
          null;
        const endDate = endDateValue ? new Date(endDateValue) : null;
        const diffDays =
          endDate && !Number.isNaN(endDate.getTime())
            ? Math.ceil((endDate.getTime() - Date.now()) / 86_400_000)
            : Number.NaN;

        if (!cancelled) {
          setSupportBillingUrgent(Number.isFinite(diffDays) && diffDays >= 0 && diffDays <= 5);
        }
      } catch {
        if (!cancelled) setSupportBillingUrgent(false);
      }
    }

    void loadSupportBillingUrgency();
    return () => {
      cancelled = true;
    };
  }, [embeddedAppView, familyId]);
  const [roomChannelPreviewByKey, setRoomChannelPreviewByKey] = useState<Partial<Record<ChannelProviderKey, HostChannelPreviewState>>>({});
  const [roomChannelPanelViewByKey, setRoomChannelPanelViewByKey] = useState<Partial<Record<ChannelProviderKey, "setup" | "preview" | "summary">>>({});
  const [roomChannelPendingByKey, setRoomChannelPendingByKey] = useState<Partial<Record<ChannelProviderKey, "authorize" | "preview" | "connect" | "sync" | null>>>({});
  const [roomChannelFeedbackByKey, setRoomChannelFeedbackByKey] = useState<Partial<Record<ChannelProviderKey, { type: "success" | "error"; text: string }>>>({});
  const [providerReviewPendingKey, setProviderReviewPendingKey] = useState<ChannelProviderKey | null>(null);
  const [providerReviewFeedback, setProviderReviewFeedback] = useState<{
    providerKey: ChannelProviderKey;
    ok: boolean;
    message: string;
  } | null>(null);
  const [roomChannelPreviewAcceptedByKey, setRoomChannelPreviewAcceptedByKey] = useState<Partial<Record<ChannelProviderKey, boolean>>>({});
  const [timeAnchor] = useState(() => Date.now());
  const bookingFeedLastAttemptAtRef = useRef(0);
  const bookingFeedRefreshInFlightRef = useRef(false);
  const clearCalendarAvailabilityOverride = (roomId: string, date: string): void => {
    const overrideKey = getRoomCalendarAvailabilityOverrideKey(roomId, date);
    setCalendarAvailabilityOverrides((current) => {
      if (!(overrideKey in current)) return current;
      const next = { ...current };
      delete next[overrideKey];
      return next;
    });
  };

  const setActiveSectionWithUrl = (nextSection: ProSectionId): void => {
    setActiveSection(nextSection);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("family", familyId);
    params.set("section", nextSection);
    const nextUrl = `${pathname}?${params.toString()}`;
    window.history.replaceState(window.history.state, "", nextUrl);
    window.setTimeout(() => {
      router.replace(nextUrl);
    }, 0);
  };

  const refreshCurrentSectionRoute = (): void => {
    if (typeof window === "undefined") {
      router.refresh();
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set("family", familyId);
    params.set("section", activeSection);
    const nextUrl = `${pathname}?${params.toString()}`;
    router.replace(nextUrl);
    router.refresh();
  };

  const refreshBookingsSnapshot = async (): Promise<void> => {
    const response = await fetch(`/api/host/pro/bookings/snapshot?familyId=${encodeURIComponent(familyId)}`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      error?: string;
      bookings?: ProBookingSummary[];
      health?: BookingFeedLiveHealth;
    };
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to refresh saved bookings.");
    }
    setProBookings(Array.isArray(payload.bookings) ? payload.bookings : []);
    if (payload.health) {
      setBookingLiveHealth(payload.health);
    }
  };

  const refreshCalendarSnapshot = async (roomIds?: string[]): Promise<void> => {
    const response = await fetch("/api/host/pro/calendar/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        familyId,
        dateFrom: calendarWindow.startDate,
        dateTo: calendarWindow.endDate,
        roomIds: roomIds && roomIds.length > 0 ? roomIds : filteredCalendarRows.map((row) => row.roomId),
      }),
    });
    const payload = (await response.json()) as {
      error?: string;
      rows?: CalendarRow[];
      sync?: CalendarSyncMetadata;
    };
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to refresh saved calendar.");
    }
    if (Array.isArray(payload.rows)) {
      setCalendarRows(payload.rows);
    }
    if (payload.sync) {
      setCalendarSyncState(payload.sync);
    }
  };

  useEffect(() => {
    setChannexSetupState(buildChannexSetupViewState(channelFoundation, rooms));
  }, [channelFoundation, rooms]);
  useEffect(() => {
    if (embeddedAppView) {
      setHeaderChannexStatus("connected");
      return;
    }
    let cancelled = false;

    const checkChannexStatus = async (): Promise<void> => {
      setHeaderChannexStatus((current) => (current === "checking" ? current : "checking"));

      try {
        const response = await fetch("/api/host/pro/channel/channex/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ familyId }),
        });
        const payload = (await response.json()) as { ok?: boolean };
        const nextStatus: HeaderChannexStatus = response.ok && payload.ok ? "connected" : "disconnected";

        if (cancelled) return;
        setHeaderChannexStatus((current) => (current === nextStatus ? current : nextStatus));
      } catch {
        if (cancelled) return;
        setHeaderChannexStatus((current) => (current === "disconnected" ? current : "disconnected"));
      }
    };

    void checkChannexStatus();
    const intervalId = window.setInterval(() => {
      void checkChannexStatus();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [embeddedAppView, familyId]);

  const [reportGraph, setReportGraph] = useState<"bookings" | "revenue">("bookings");
  useEffect(() => {
    setChannelSetupOverrides({});
    setCalendarActionFeedback(null);
    setBulkCalendarFeedback(null);
    setCalendarActionDate(null);
    setCalendarAvailabilityOverrides({});
    setCalendarRateFeedback(null);
    setCalendarRateActionDate(null);
    setCalendarRateOverrides({});
    setSelectedCalendarRateCell(null);
    setIsBulkCalendarEditorOpen(false);
    setCalendarBulkSearch("");
    setCalendarBulkSelectedRoomIds([]);
    setCalendarBulkSelectedRatePlanIds([]);
    setCalendarBulkWeekdays({
      sun: true,
      mon: true,
      tue: true,
      wed: true,
      thu: true,
      fri: true,
      sat: true,
    });
    setCalendarBulkRestrictions({
      rate: false,
      stop_sell: false,
      cta: false,
      ctd: false,
      min_stay_arrival: false,
      min_stay_through: false,
      max_stay: false,
    });
    setBookingSearchQuery("");
    setBookingChannelFilter("all");
    setBookingPage(1);
    setBookingPageSize(8);
    setSelectedBookingIds([]);
    setIsBookingsFilterMenuOpen(false);
    setIsBookingsViewMenuOpen(false);
    setActiveBookingActionsId(null);
    setRoomChannelSetupDrafts({});
    setRoomChannelPreviewByKey({});
    setRoomChannelPanelViewByKey({});
    setRoomChannelPendingByKey({});
    setRoomChannelFeedbackByKey({});
    setRoomChannelPreviewAcceptedByKey({});
  }, [familyId]);
  useEffect(() => {
    setCalendarDatePickerValue(calendarWindow.startDate);
    setBulkCalendarDraft((current) => ({
      ...current,
      roomId: current.roomId || rooms[0]?.id || "",
      applyToAllRooms: current.roomId === "__all__" ? current.applyToAllRooms : false,
      dateFrom: calendarWindow.startDate,
      dateTo: calendarWindow.startDate,
    }));
    setBulkCalendarFeedback(null);
  }, [calendarWindow.startDate, rooms]);
  useEffect(() => {
    if (isCalendarActionPending) return;
    setCalendarAvailabilityOverrides((current) => (Object.keys(current).length > 0 ? {} : current));
  }, [calendarRows, isCalendarActionPending]);
  const activeTopLevel = resolveTopLevelSection(activeSection);
  const activePropertyTab = resolvePropertyTab(activeSection);
  const activePropertyTabLinks = PROPERTY_TAB_SECTION_LINKS[activePropertyTab];
  const isPropertiesHomeView = activeSection === "properties-home" && !roomRouteState;
  const isRevenueReportWorkspace = activeTopLevel === "revenue";
  const currentPropertyOption = propertyOptions.find((option) => option.familyId === familyId) ?? null;
  const isChannexConfigured = channexConfig.configured && channexConfig.apiKeyConfigured;
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0] ?? null;
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const calendarRatePlanOptions = channelFoundation.ratePlans
    .filter((plan) => Boolean(plan.stayUnitId))
    .map((plan) => ({
      value: plan.externalRatePlanId || `stay-unit:${plan.stayUnitId as string}`,
      stayUnitId: plan.stayUnitId as string,
      label: plan.title || `Standard Rate - ${roomById.get(plan.stayUnitId as string)?.name ?? "Room"}`,
    }));
  const calendarTodayIsoDate = isoDateFromLocalDate(new Date());
  const hasChannexPropertyConnection = channelFoundation.properties.some(
    (property) => property.providerCode === "channex" && Boolean(property.externalPropertyId)
  );
  const shouldAutoRefreshBookingFeed =
    hasChannexPropertyConnection &&
    (activeSection === "bookings" || activeSection === "inventory-calendar");
  const bookingSyncBadgeLabel = bookingLiveHealth.syncing
    ? "SYNCING..."
    : bookingLiveHealth.failedImportCount > 0
      ? "ISSUES"
      : bookingLiveHealth.pendingReviewCount > 0
        ? "NEEDS REVIEW"
        : "SAVED DATA";
  const bookingSyncToneClass = bookingLiveHealth.failedImportCount > 0
    ? styles.badgeMuted
    : bookingLiveHealth.pendingReviewCount > 0
      ? styles.badgeMuted
      : "";
  const bookingSyncUpdatedLabel = bookingLiveHealth.lastChannexBookingCheckAt
    ? `Last updated ${formatRelativeAge(bookingLiveHealth.lastChannexBookingCheckAt, Date.now())}`
    : "Last updated just now";
  const showChannelOperatorDiagnostics = isAdminView;
  const simplePropertiesHref = `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(familyId)}&section=properties-home`;
  const switchPropertyContext = (nextFamilyId: string, options?: { section?: ProSectionId }): void => {
    const normalizedFamilyId = nextFamilyId.trim();
    if (!normalizedFamilyId || normalizedFamilyId === familyId) return;
    const nextOption = propertyOptions.find((option) => option.familyId === normalizedFamilyId) ?? null;
    setPendingPropertyLabel(nextOption?.name ?? "Selected property");
    setIsPropertySwitchPending(true);
    router.push(
      `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(normalizedFamilyId)}&section=${encodeURIComponent(
        options?.section ?? activeSection
      )}`
    );
  };

  const updateAppearanceMode = (nextMode: "dark" | "light"): void => {
    setAppearanceMode(nextMode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("famlo-pro-theme", nextMode);
      window.localStorage.setItem("famlo-pro-dashboard-appearance", nextMode);
    }
    if (typeof document !== "undefined") {
      document.cookie = `famlo-pro-theme=${nextMode}; path=/; max-age=31536000; samesite=lax`;
    }
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
    const syncKey = getCalendarCellSyncKey(roomId, cell.date);
    setCalendarActionFeedback(null);
    setCalendarActionDate(cell.date);
    setCalendarCellSyncStates((current) => ({ ...current, [syncKey]: "syncing" }));
    setCalendarAvailabilityOverrides((current) =>
      applyRoomCalendarAvailabilityOverride(current, {
        roomId,
        date: cell.date,
        action,
      })
    );

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
        const payload = (await response.json()) as {
          error?: string;
          projectedDays?: Array<{
            date?: string;
            availableUnits?: number | null;
            effectiveRate?: number | null;
            stopSell?: boolean;
            lastProjectedAt?: string | null;
            updatedAt?: string | null;
          }>;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to update the property calendar block.");
        }

        setCalendarActionFeedback({
          type: "success",
          text:
            action === "block"
              ? `Saved locally. Blocked ${cell.date} for ${roomName}. Channex sync is queued.`
              : `Saved locally. Unblocked ${cell.date} for ${roomName}. Channex sync is queued.`,
        });
        applyProjectedCalendarCells(
          Array.isArray(payload.projectedDays)
            ? payload.projectedDays
                .map((day) => {
                  const date = typeof day.date === "string" ? day.date : null;
                  if (!date) return null;
                  return {
                    roomId,
                    date,
                    availableUnits: typeof day.availableUnits === "number" ? day.availableUnits : null,
                    effectiveRate: typeof day.effectiveRate === "number" ? day.effectiveRate : null,
                    stopSell: day.stopSell === true,
                    updatedAt:
                      (typeof day.lastProjectedAt === "string" && day.lastProjectedAt) ||
                      (typeof day.updatedAt === "string" && day.updatedAt) ||
                      null,
                  };
                })
                .filter((entry): entry is CalendarProjectedCellPayload => Boolean(entry))
            : undefined
        );
        setCalendarCellSyncStates((current) => ({ ...current, [syncKey]: "synced" }));
        clearCalendarAvailabilityOverride(roomId, cell.date);
        window.setTimeout(() => {
          void refreshCalendarSnapshot([roomId]);
        }, 1200);
      } catch (error) {
        setCalendarAvailabilityOverrides((current) =>
          rollbackRoomCalendarAvailabilityOverride(current, {
            roomId,
            date: cell.date,
            previousStatus: cell.status === "available" || cell.status === "manual_block" ? cell.status : null,
          })
        );
        setCalendarActionFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to update the property calendar block.",
        });
        setCalendarCellSyncStates((current) => ({ ...current, [syncKey]: "failed" }));
      } finally {
        setCalendarActionDate(null);
      }
    });
  };

  const handleCalendarRateCellAction = (
    cell: CalendarRateCell,
    row: CalendarRow,
    restrictionType: CalendarRestrictionType = "rate"
  ): void => {
    if (cell.isPast) return;
    setCalendarActionFeedback(null);
    setCalendarRateFeedback(null);
    setBulkCalendarFeedback(null);
    setSelectedCalendarRateCell({
      roomId: row.roomId,
      roomName: row.roomName,
      roomType: row.unitType,
      ratePlanName: `Standard Rate - ${row.roomName}`,
      date: cell.date,
      dateFrom: cell.date,
      dateTo: cell.date,
      displayValue: cell.displayValue,
      amount: cell.amount,
      baseAmount: cell.baseAmount,
      isOverridden: cell.isOverridden,
      restrictionType,
    });
    if (restrictionType === "rate") {
      setCalendarRateDraft(cell.amount != null && cell.amount > 0 ? String(cell.amount) : cell.baseAmount > 0 ? String(cell.baseAmount) : "");
    } else if (restrictionType === "cta" || restrictionType === "ctd" || restrictionType === "stop_sell") {
      setCalendarRateDraft("true");
    } else {
      setCalendarRateDraft("");
    }
  };

  const goToCalendarStart = (nextCalendarStart: string): void => {
    startCalendarJumpTransition(() => {
      router.replace(
        `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(familyId)}&section=inventory-calendar&calendarStart=${encodeURIComponent(nextCalendarStart)}`
      );
      refreshCurrentSectionRoute();
    });
  };

  const handleCalendarToday = (): void => {
    const today = new Date();
    const todayIsoDate = isoDateFromLocalDate(today);
    goToCalendarStart(todayIsoDate);
  };

  const handleCalendarDatePickerJump = (): void => {
    if (!calendarDatePickerValue) return;
    goToCalendarStart(calendarDatePickerValue);
  };

  const handleCalendarMonthShift = (deltaMonths: number): void => {
    goToCalendarStart(shiftCalendarStartByMonths(calendarWindow.startDate, deltaMonths));
  };

  const handleCalendarRestrictionChange = (nextRestriction: CalendarRestrictionType): void => {
    setSelectedCalendarRateCell((current) => {
      if (!current) return current;
      return {
        ...current,
        restrictionType: nextRestriction,
      };
    });

    if (nextRestriction === "rate") {
      setCalendarRateDraft(
        selectedCalendarRateCell?.amount != null && selectedCalendarRateCell.amount > 0
          ? String(selectedCalendarRateCell.amount)
          : selectedCalendarRateCell?.baseAmount && selectedCalendarRateCell.baseAmount > 0
            ? String(selectedCalendarRateCell.baseAmount)
            : ""
      );
      return;
    }

    if (nextRestriction === "cta" || nextRestriction === "ctd" || nextRestriction === "stop_sell") {
      setCalendarRateDraft("true");
      return;
    }

    if (nextRestriction === "block_selected" || nextRestriction === "unblock_selected") {
      setCalendarRateDraft("");
      return;
    }

    setCalendarRateDraft("");
  };

  const retryCalendarWorkspace = (): void => {
    startCalendarReloadTransition(() => {
      router.refresh();
    });
  };

  const requestProviderReview = async (providerKey: ChannelProviderKey): Promise<void> => {
    setProviderReviewPendingKey(providerKey);
    setProviderReviewFeedback(null);

    try {
      const response = await fetch("/api/host/pro/channel/providers/operation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          familyId,
          providerKey,
          operationType: "request_review",
          dryRun: true,
          payload: {
            source: "room_editor_sync_health",
          },
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };

      setProviderReviewFeedback({
        providerKey,
        ok: Boolean(response.ok && payload.ok !== false),
        message:
          payload.message ??
          payload.error ??
          (response.ok ? "Provider review requested." : "Unable to request provider review."),
      });
      router.refresh();
    } catch (error) {
      setProviderReviewFeedback({
        providerKey,
        ok: false,
        message: error instanceof Error ? error.message : "Unable to request provider review.",
      });
    } finally {
      setProviderReviewPendingKey(null);
    }
  };

  const openBulkCalendarEditor = (): void => {
    setCalendarActionFeedback(null);
    setCalendarRateFeedback(null);
    setBulkCalendarFeedback(null);
    setCalendarBulkSearch("");
    setCalendarBulkSelectedRoomIds(calendarRoomFilter !== "all" ? [calendarRoomFilter] : []);
    setCalendarBulkSelectedRatePlanIds(calendarRateFilter !== "all" ? [calendarRateFilter] : []);
    setBulkCalendarDraft((current) => ({
      ...current,
      roomId: calendarRoomFilter !== "all" ? calendarRoomFilter : displayedCalendarRows[0]?.roomId ?? current.roomId,
      applyToAllRooms: false,
      dateFrom: current.dateFrom < calendarTodayIsoDate ? calendarTodayIsoDate : current.dateFrom,
      dateTo: current.dateTo < calendarTodayIsoDate ? calendarTodayIsoDate : current.dateTo,
      availabilityAction: "none",
    }));
    setIsBulkCalendarEditorOpen(true);
  };

  const toggleBulkCalendarWeekday = (weekday: CalendarBulkWeekday): void => {
    setCalendarBulkWeekdays((current) => ({
      ...current,
      [weekday]: !current[weekday],
    }));
  };

  const toggleBulkCalendarRestriction = (restriction: CalendarBulkRestrictionKey): void => {
    setCalendarBulkRestrictions((current) => {
      const nextValue = !current[restriction];
      setBulkCalendarDraft((draft) => ({
        ...draft,
        stopSell: restriction === "stop_sell" && nextValue && draft.stopSell === "unchanged" ? "true" : draft.stopSell,
        cta: restriction === "cta" && nextValue && draft.cta === "unchanged" ? "true" : draft.cta,
        ctd: restriction === "ctd" && nextValue && draft.ctd === "unchanged" ? "true" : draft.ctd,
      }));
      return {
        ...current,
        [restriction]: nextValue,
      };
    });
  };

  const toggleBulkCalendarRoom = (roomId: string): void => {
    setCalendarBulkSelectedRoomIds((current) =>
      current.includes(roomId) ? current.filter((value) => value !== roomId) : [...current, roomId]
    );
  };

  const toggleBulkCalendarRatePlan = (ratePlanId: string): void => {
    setCalendarBulkSelectedRatePlanIds((current) =>
      current.includes(ratePlanId) ? current.filter((value) => value !== ratePlanId) : [...current, ratePlanId]
    );
  };

  const applyProjectedCalendarCells = (projectedCells: CalendarProjectedCellPayload[] | undefined): void => {
    if (!Array.isArray(projectedCells) || projectedCells.length === 0) return;

    setCalendarProjectedCellOverrides((current) => {
      const next = { ...current };
      projectedCells.forEach((cell) => {
        if (!cell.roomId || !cell.date) return;
        next[getCalendarCellSyncKey(cell.roomId, cell.date)] = {
          availableUnits: typeof cell.availableUnits === "number" ? cell.availableUnits : null,
          effectiveRate: typeof cell.effectiveRate === "number" ? cell.effectiveRate : null,
          stopSell: cell.stopSell === true,
          updatedAt: cell.updatedAt ?? null,
        };
      });
      return next;
    });

    setCalendarRateOverrides((current) => {
      const next = { ...current };
      projectedCells.forEach((cell) => {
        if (!cell.roomId || !cell.date || typeof cell.effectiveRate !== "number" || cell.effectiveRate <= 0) return;
        next[getCalendarRateOverrideKey(cell.roomId, cell.date)] = {
          amount: cell.effectiveRate,
          displayValue: formatCalendarCurrency(cell.effectiveRate),
          isOverridden: true,
        };
      });
      return next;
    });
  };

  const runVisibleCalendarSync = (source: "background_open" | "poll" | "sync_now"): void => {
    const visibleRoomIds = filteredCalendarRows.map((row) => row.roomId).filter(Boolean);
    if (visibleRoomIds.length === 0) return;
    if (source === "sync_now") {
      setCalendarSyncFeedback(null);
    }
    const runId = calendarSyncRunIdRef.current + 1;
    calendarSyncRunIdRef.current = runId;
    if (calendarSyncTimeoutRef.current != null && typeof window !== "undefined") {
      window.clearTimeout(calendarSyncTimeoutRef.current);
    }
    setCalendarSyncRequestState({
      phase: "syncing",
      source,
      runId,
    });
    if (typeof window !== "undefined") {
      calendarSyncTimeoutRef.current = window.setTimeout(() => {
        setCalendarSyncRequestState((current) =>
          current.runId === runId && current.phase === "syncing"
            ? {
                ...current,
                phase: "timed_out",
              }
            : current
        );
      }, 4000);
    }

    startCalendarSyncTransition(async () => {
      try {
        const response = await fetch("/api/host/pro/calendar/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId,
            dateFrom: calendarWindow.startDate,
            dateTo: calendarWindow.endDate,
            roomIds: visibleRoomIds,
            source,
          }),
        });
        const payload = (await response.json()) as {
          error?: string;
          metadata?: CalendarSyncMetadata;
          availabilityRows?: number;
          restrictionRows?: number;
          appliedRows?: number;
          projectedCells?: CalendarProjectedCellPayload[];
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to sync the visible Channex calendar range.");
        }
        if (calendarSyncTimeoutRef.current != null && typeof window !== "undefined") {
          window.clearTimeout(calendarSyncTimeoutRef.current);
          calendarSyncTimeoutRef.current = null;
        }
        setCalendarSyncRequestState((current) =>
          current.runId === runId
            ? {
                phase: "idle",
                source,
                runId,
              }
            : current
        );
        if (payload.metadata) {
          setCalendarSyncState(payload.metadata);
        }
        applyProjectedCalendarCells(payload.projectedCells);
        if (source === "sync_now") {
          setCalendarSyncFeedback({
            type:
              payload.metadata?.syncStatus === "failed" || payload.metadata?.syncStatus === "partial" || payload.metadata?.syncStatus === "not_mapped"
                ? "error"
                : "success",
            text:
              payload.metadata?.syncStatus === "failed"
                ? payload.metadata.statusDetail
                : payload.metadata?.syncStatus === "partial"
                  ? payload.metadata.statusDetail
                  : payload.metadata?.syncStatus === "not_mapped"
                    ? payload.metadata.statusDetail
                    : payload.metadata?.syncStatus === "synced"
                      ? "Saved calendar refreshed from Channex."
                      : payload.metadata?.statusDetail ?? "Showing saved calendar.",
          });
        }
        if (payload.appliedRows || source === "sync_now" || source === "background_open") {
          await refreshCalendarSnapshot(visibleRoomIds);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to sync the visible Channex calendar range.";
        if (calendarSyncTimeoutRef.current != null && typeof window !== "undefined") {
          window.clearTimeout(calendarSyncTimeoutRef.current);
          calendarSyncTimeoutRef.current = null;
        }
        setCalendarSyncRequestState((current) =>
          current.runId === runId
            ? {
                phase: "idle",
                source,
                runId,
              }
            : current
        );
        setCalendarSyncState((current) => ({
          ...current,
          syncStatus: "failed",
          syncSource: "cache",
          syncError: message,
          stale: true,
          partial: false,
          statusTitle: "Sync failed",
          statusDetail: "Showing saved calendar. Last Channex refresh failed.",
        }));
        if (source === "sync_now") {
          setCalendarSyncFeedback({ type: "error", text: "Showing saved calendar. Last Channex refresh failed." });
        }
      }
    });
  };

  const submitCalendarRate = (action: "save" | "reset"): void => {
    if (!selectedCalendarRateCell) return;
    const parsedAmount = Number(calendarRateDraft);
    const restrictionType = selectedCalendarRateCell.restrictionType;
    if (restrictionType === "availability_offset" || restrictionType === "availability_per_rate" || restrictionType === "max_availability") {
      setCalendarRateFeedback({
        type: "error",
        text: `${calendarRestrictionLabel(restrictionType)} is view-only in this calendar right now.`,
      });
      return;
    }
    if (!selectedCalendarRateCell.dateFrom || !selectedCalendarRateCell.dateTo || selectedCalendarRateCell.dateTo < selectedCalendarRateCell.dateFrom) {
      setCalendarRateFeedback({ type: "error", text: "Choose a valid date range for the rate update." });
      return;
    }
    if (
      action === "save" &&
      (restrictionType === "rate" || restrictionType === "max_stay" || restrictionType === "min_stay_arrival" || restrictionType === "min_stay_through") &&
      (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
    ) {
      setCalendarRateFeedback({
        type: "error",
        text: restrictionType === "rate" ? "Enter a valid positive daily rate." : "Enter a valid positive value.",
      });
      return;
    }
    if (action === "reset" && (restrictionType !== "rate" || selectedCalendarRateCell.dateFrom !== selectedCalendarRateCell.dateTo)) {
      setCalendarRateFeedback({ type: "error", text: "Reset to base is available only for a single selected date." });
      return;
    }

    setCalendarRateFeedback(null);
    setCalendarRateActionDate(selectedCalendarRateCell.date);
    const targetDates = enumerateInclusiveCalendarDates(selectedCalendarRateCell.dateFrom, selectedCalendarRateCell.dateTo);
    const syncKeys = targetDates.map((date) => getCalendarCellSyncKey(selectedCalendarRateCell.roomId, date));
    setCalendarCellSyncStates((current) => {
      const next = { ...current };
      syncKeys.forEach((syncKey) => {
        next[syncKey] = "syncing";
      });
      return next;
    });

    startCalendarRateTransition(async () => {
      try {
        const response =
          action === "save" && restrictionType === "rate" && selectedCalendarRateCell.dateFrom === selectedCalendarRateCell.dateTo
            ? await fetch("/api/host/pro/calendar/manual-rate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  familyId,
                  roomId: selectedCalendarRateCell.roomId,
                  date: selectedCalendarRateCell.date,
                  action,
                  amount: parsedAmount,
                }),
              })
            : action === "reset"
              ? await fetch("/api/host/pro/calendar/manual-rate", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    familyId,
                    roomId: selectedCalendarRateCell.roomId,
                    date: selectedCalendarRateCell.date,
                    action,
                    amount: null,
                  }),
                })
              : await fetch("/api/host/pro/calendar/bulk-update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  familyId,
                  roomIds: [selectedCalendarRateCell.roomId],
                  roomScope: "single",
                  selectedRoomId: selectedCalendarRateCell.roomId,
                  applyToAllRooms: false,
                  dateFrom: selectedCalendarRateCell.dateFrom,
                  dateTo: selectedCalendarRateCell.dateTo,
                  rateAction: restrictionType === "rate" ? "save" : null,
                  rateAmount: restrictionType === "rate" ? parsedAmount : null,
                  availabilityAction:
                    restrictionType === "block_selected"
                      ? "block"
                      : restrictionType === "unblock_selected"
                        ? "unblock"
                        : null,
                  restrictions: {
                    minStay: restrictionType === "min_stay_through" ? parsedAmount : undefined,
                    minStayArrival: restrictionType === "min_stay_arrival" ? parsedAmount : undefined,
                    maxStay: restrictionType === "max_stay" ? parsedAmount : undefined,
                    cta: restrictionType === "cta" ? calendarRateDraft === "true" : undefined,
                    ctd: restrictionType === "ctd" ? calendarRateDraft === "true" : undefined,
                    stopSell: restrictionType === "stop_sell" ? calendarRateDraft === "true" : undefined,
                  },
                }),
              });
        const payload = (await response.json()) as {
          error?: string;
          projectedDays?: Array<{
            date?: string;
            availableUnits?: number | null;
            effectiveRate?: number | null;
            stopSell?: boolean;
            lastProjectedAt?: string | null;
            updatedAt?: string | null;
          }>;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to update calendar override.");
        }

        const successLabel =
          action === "reset"
            ? `Saved locally. Reset ${selectedCalendarRateCell.roomName} on ${formatShortDate(selectedCalendarRateCell.date)} back to base price. Channex sync is queued.`
            : restrictionType === "rate"
              ? `Saved locally. ${formatCalendarCurrency(parsedAmount)} for ${selectedCalendarRateCell.roomName} on ${formatCalendarDateRange(selectedCalendarRateCell.dateFrom, selectedCalendarRateCell.dateTo)}. Channex sync is queued.`
              : restrictionType === "block_selected"
                ? `Saved locally. Blocked selected dates for ${selectedCalendarRateCell.roomName}. Channex sync is queued.`
                : restrictionType === "unblock_selected"
                  ? `Saved locally. Unblocked selected dates for ${selectedCalendarRateCell.roomName}. Channex sync is queued.`
                  : `Saved locally. Updated ${calendarRestrictionLabel(restrictionType)} for ${selectedCalendarRateCell.roomName} on ${formatCalendarDateRange(selectedCalendarRateCell.dateFrom, selectedCalendarRateCell.dateTo)}. Channex sync is queued.`;
        setCalendarRateFeedback({
          type: "success",
          text: successLabel,
        });
        setCalendarCellSyncStates((current) => {
          const next = { ...current };
          syncKeys.forEach((syncKey) => {
            next[syncKey] = "synced";
          });
          return next;
        });
        applyProjectedCalendarCells(
          Array.isArray(payload.projectedDays)
            ? payload.projectedDays
                .map((day) => {
                  const date = typeof day.date === "string" ? day.date : null;
                  if (!date) return null;
                  return {
                    roomId: selectedCalendarRateCell.roomId,
                    date,
                    availableUnits: typeof day.availableUnits === "number" ? day.availableUnits : null,
                    effectiveRate: typeof day.effectiveRate === "number" ? day.effectiveRate : null,
                    stopSell: day.stopSell === true,
                    updatedAt:
                      (typeof day.lastProjectedAt === "string" && day.lastProjectedAt) ||
                      (typeof day.updatedAt === "string" && day.updatedAt) ||
                      null,
                  };
                })
                .filter((entry): entry is CalendarProjectedCellPayload => Boolean(entry))
            : undefined
        );
        if (action === "save" && restrictionType === "rate") {
          setCalendarRateOverrides((current) => {
            const next = { ...current };
            targetDates.forEach((date) => {
              next[getCalendarRateOverrideKey(selectedCalendarRateCell.roomId, date)] = {
                amount: parsedAmount,
                displayValue: formatCalendarCurrency(parsedAmount),
                isOverridden: true,
              };
            });
            return next;
          });
          setCalendarRateDraft(String(parsedAmount));
        } else if (action === "reset") {
          setCalendarRateOverrides((current) => ({
            ...current,
            [getCalendarRateOverrideKey(selectedCalendarRateCell.roomId, selectedCalendarRateCell.date)]: {
              amount: selectedCalendarRateCell.baseAmount > 0 ? selectedCalendarRateCell.baseAmount : null,
              displayValue: selectedCalendarRateCell.baseAmount > 0 ? formatCalendarCurrency(selectedCalendarRateCell.baseAmount) : "Missing",
              isOverridden: false,
            },
          }));
          setCalendarRateDraft(
            selectedCalendarRateCell.baseAmount > 0 ? String(selectedCalendarRateCell.baseAmount) : ""
          );
        }
        setSelectedCalendarRateCell(null);
        await refreshCalendarSnapshot([selectedCalendarRateCell.roomId]);
      } catch (error) {
        setCalendarRateFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to update calendar override.",
        });
        setCalendarCellSyncStates((current) => {
          const next = { ...current };
          syncKeys.forEach((syncKey) => {
            next[syncKey] = "failed";
          });
          return next;
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
        ? displayedCalendarRows.map((row) => row.roomId)
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
        await refreshCalendarSnapshot(targetRoomIds);
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
    if (cancellingBookingId === booking.bookingId) return;

    try {
      setCancellingBookingId(booking.bookingId);
      setBookingActionFeedback(null);

      const response = await fetch(booking.isOta ? "/api/host/pro/channel/channex/bookings/request-cancellation" : "/api/bookings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-famlo-actor-role": "host" },
        body: JSON.stringify({ bookingId: booking.bookingId, action: "cancel" }),
      });

      const payload = (await response.json()) as { error?: string; message?: string; status?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to cancel booking.");
      }

      setBookingActionFeedback({
        type: "success",
        text:
          payload.message ??
          (booking.isOta
            ? `OTA booking ${booking.bookingId.slice(0, 8)} cancellation was sent to Channex.`
            : `Booking ${booking.bookingId.slice(0, 8)} was cancelled.`),
      });
      await refreshBookingsSnapshot();
      if (activeSection === "inventory-calendar" || activeSection === "dashboard") {
        await refreshCalendarSnapshot();
      }
    } catch (error) {
      setBookingActionFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to cancel booking.",
      });
    } finally {
      setCancellingBookingId(null);
    }
  };

  const openOtaEditDraft = (booking: ProBookingSummary): void => {
    const startingAmount = parseBookingAmount(booking.amount);
    setBookingActionFeedback(null);
    setExpandedBookingId(booking.bookingId);
    setEditingOtaBookingId(booking.bookingId);
    setOtaEditDraft({
      startDate: booking.startDate,
      endDate: booking.endDate,
      stayUnitId: booking.roomId ?? "",
      totalAmount: startingAmount != null && startingAmount > 0 ? String(startingAmount) : "",
    });
  };

  const handleOtaBookingEditSubmit = (booking: ProBookingSummary): void => {
    if (!otaEditDraft || editingOtaBookingId !== booking.bookingId) return;
    const totalAmount = Number(otaEditDraft.totalAmount);
    if (!otaEditDraft.startDate || !otaEditDraft.endDate || !otaEditDraft.stayUnitId) {
      setBookingActionFeedback({
        type: "error",
        text: "Choose valid OTA check-in, check-out, and room details before sending the edit.",
      });
      return;
    }
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      setBookingActionFeedback({
        type: "error",
        text: "Enter a valid OTA total amount before sending the edit.",
      });
      return;
    }

    setBookingActionFeedback(null);
    startOtaEditTransition(async () => {
      try {
        const response = await fetch("/api/host/pro/channel/channex/bookings/request-modification", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-famlo-actor-role": "host" },
          body: JSON.stringify({
            bookingId: booking.bookingId,
            startDate: otaEditDraft.startDate,
            endDate: otaEditDraft.endDate,
            stayUnitId: otaEditDraft.stayUnitId,
            totalAmount,
          }),
        });
        const payload = (await response.json()) as { error?: string; message?: string; status?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to modify OTA booking.");
        }

        setBookingActionFeedback({
          type: "success",
          text:
            payload.message ??
            `OTA booking ${booking.bookingId.slice(0, 8)} modification was sent to Channex and is syncing back into Famlo.`,
        });
        setEditingOtaBookingId(null);
        setOtaEditDraft(null);
        await refreshBookingsSnapshot();
        if (activeSection === "inventory-calendar" || activeSection === "dashboard") {
          await refreshCalendarSnapshot();
        }
      } catch (error) {
        setBookingActionFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Unable to modify OTA booking.",
        });
      }
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("family") !== familyId) params.set("family", familyId);
    if (params.get("section") === activeSection) return;
    params.set("section", activeSection);
    const nextUrl = `${pathname}?${params.toString()}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [activeSection, familyId, pathname, searchParams]);

  useEffect(() => {
    const sectionFromBrowser =
      typeof window !== "undefined"
        ? readSectionFromUrl(new URLSearchParams(window.location.search).get("section"))
        : null;
    setActiveSection(sectionFromBrowser ?? initialSection);
    setHostProfileCompliance(initialCompliance);
    setHostProfileDocumentsFeedback(null);
    setPropertyContent(initialPropertyContent);
    setPropertyGallery(propertyPhotos);
    setPropertyContentFeedback(null);
    setDashboardMediaFeedback(null);
    setSelectedDashboardGalleryId(null);
    setSelectedDashboardReelId(null);
    setPendingDashboardGalleryReplaceId(null);
    setDashboardPlayingReelId(null);
    setProBookings(initialProBookings);
    setCalendarRows(initialCalendarRows);
    setBookingFilter("All");
    setExpandedBookingId(null);
    setEditingOtaBookingId(null);
    setOtaEditDraft(null);
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
  }, [familyId, initialCalendarRows, initialCompliance, initialProBookings, initialSection, initialPropertyContent, propertyPhotos, roomRouteState, rooms]);

  useEffect(() => {
    if (embeddedAppView || !shouldAutoRefreshBookingFeed) return;
    let cancelled = false;

    const triggerBookingFeedRefresh = (): void => {
      const now = Date.now();
      if (bookingFeedRefreshInFlightRef.current) return;
      if (now - bookingFeedLastAttemptAtRef.current < 15_000) return;

      bookingFeedLastAttemptAtRef.current = now;
      bookingFeedRefreshInFlightRef.current = true;
      setBookingLiveHealth((current) => ({
        ...current,
        syncing: true,
        safeMessage: "Saved bookings are loaded. OTA refresh is running in the background.",
      }));

      void (async () => {
        try {
          const response = await fetch("/api/host/pro/channel/channex/bookings/feed", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-famlo-actor-role": "host" },
            body: JSON.stringify({ familyId }),
          });
          const payload = (await response.json()) as {
            ok?: boolean;
            status?: string;
            storedCount?: number;
            autoApplySummary?: { autoAppliedCount?: number; autoImportedCount?: number; autoCancelledCount?: number } | null;
          };

          if (!response.ok || cancelled) return;

          const changedCount =
            (payload.storedCount ?? 0) +
            (payload.autoApplySummary?.autoAppliedCount ?? 0) +
            (payload.autoApplySummary?.autoImportedCount ?? 0) +
            (payload.autoApplySummary?.autoCancelledCount ?? 0);

          await refreshBookingsSnapshot();
          if (activeSection === "inventory-calendar") {
            await refreshCalendarSnapshot();
          }

          if (changedCount > 0) {
            setBookingActionFeedback({
              type: "success",
              text:
                changedCount === 1
                  ? "New booking update received from Channex."
                  : `${changedCount} booking updates received from Channex.`,
            });
          }
        } catch (error) {
          if (!cancelled) {
            setBookingLiveHealth((current) => ({
              ...current,
              syncing: false,
              safeMessage: "Saved bookings are still visible. Background OTA refresh failed.",
              lastBookingImportError: error instanceof Error ? error.message : "Background OTA refresh failed.",
            }));
          }
        } finally {
          bookingFeedRefreshInFlightRef.current = false;
          if (!cancelled) {
            setBookingLiveHealth((current) => ({
              ...current,
              syncing: false,
              lastUpdatedAt: new Date().toISOString(),
            }));
          }
        }
      })();
    };

    triggerBookingFeedRefresh();
    const intervalId = window.setInterval(triggerBookingFeedRefresh, 45_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeSection, embeddedAppView, familyId, pathname, router, shouldAutoRefreshBookingFeed]);

  useEffect(() => {
    if (embeddedAppView || activeSection !== "bookings") return;
    let cancelled = false;
    const run = (): void => {
      void refreshBookingsSnapshot().catch(() => {
        // Keep last saved data visible if this background refresh misses.
      });
    };

    run();
    const intervalId = window.setInterval(() => {
      if (!cancelled) run();
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeSection, embeddedAppView, familyId]);

  useEffect(() => {
    if (embeddedAppView || activeSection !== "inventory-calendar") return;
    let cancelled = false;
    const run = (): void => {
      void refreshCalendarSnapshot().catch(() => {
        // Keep last saved projection visible if this background refresh misses.
      });
    };

    run();
    const intervalId = window.setInterval(() => {
      if (!cancelled) run();
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeSection, calendarWindow.endDate, calendarWindow.startDate, embeddedAppView, familyId]);

  const handleBookingsSyncNow = (): void => {
    setBookingActionFeedback(null);
    setBookingLiveHealth((current) => ({
      ...current,
      syncing: true,
      safeMessage: "Saved bookings are loaded. OTA refresh is running in the background.",
    }));
    startBookingsSyncTransition(async () => {
      try {
        const response = await fetch("/api/host/pro/channel/channex/bookings/feed", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-famlo-actor-role": "host" },
          body: JSON.stringify({ familyId }),
        });
        const payload = (await response.json()) as {
          error?: string;
          status?: string;
          storedCount?: number;
          autoApplySummary?: { autoAppliedCount?: number; autoImportedCount?: number; autoCancelledCount?: number } | null;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to sync bookings right now.");
        }

        const changedCount =
          (payload.storedCount ?? 0) +
          (payload.autoApplySummary?.autoAppliedCount ?? 0) +
          (payload.autoApplySummary?.autoImportedCount ?? 0) +
          (payload.autoApplySummary?.autoCancelledCount ?? 0);

        setBookingActionFeedback({
          type: "success",
          text:
            changedCount > 0
              ? `Synced bookings and applied ${changedCount} update(s) from the existing channel feed path.`
              : "Bookings sync completed using the existing channel feed path.",
        });
        await refreshBookingsSnapshot();
        if (activeSection === "inventory-calendar") {
          await refreshCalendarSnapshot();
        }
      } catch (error) {
        setBookingActionFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Unable to sync bookings right now.",
        });
        setBookingLiveHealth((current) => ({
          ...current,
          lastBookingImportError: error instanceof Error ? error.message : "Unable to sync bookings right now.",
          safeMessage: "Saved bookings are still visible. OTA refresh failed.",
        }));
      } finally {
        setBookingLiveHealth((current) => ({
          ...current,
          syncing: false,
          lastUpdatedAt: new Date().toISOString(),
        }));
      }
    });
  };

  const handleBookingsExport = (): void => {
    const rows = bookingsUiRows.map((booking) => ({
      bookingId: booking.bookingId,
      guest: booking.guestDisplayName,
      guestEmail: booking.guestEmail ?? "",
      property: propertyName,
      room: booking.roomName,
      checkIn: booking.startDate,
      checkOut: booking.checkoutDate,
      guests: booking.guestCount ?? "",
      channel: normalizeBookingChannel(booking),
      status: bookingHealthLabel(booking),
      paymentStatus: labelizeToken(booking.paymentStatus, "unknown"),
      amount: booking.amount ?? "",
    }));
    buildCsvDownload(`famlo-pro-bookings-${familyId}.csv`, rows);
  };

  const recordGeneratedReport = (input: {
    name: string;
    type: string;
    period: string;
    format: string;
    rowCount: number;
  }): void => {
    setGeneratedReportRows((current) => [
      {
        ...input,
        generatedOn: formatDateTime(new Date().toISOString()),
        status: "Ready" as const,
      },
      ...current,
    ].slice(0, 10));
  };

  const handleDownloadGuestReceipt = (booking: ProBookingSummary): void => {
    setBookingDocumentModal({
      kind: "guest_receipt",
      booking,
      title: "Guest receipt",
      url: `/api/bookings/receipt?bookingId=${encodeURIComponent(booking.bookingId)}`,
    });
    setActiveBookingActionsId(null);
    setBookingActionFeedback({
      type: "success",
      text: "Guest receipt opened with current booking data.",
    });
  };

  const handleDownloadHostStatement = (booking: ProBookingSummary): void => {
    setBookingDocumentModal({
      kind: "host_statement",
      booking,
      title: "Host statement",
      url: `/api/host/pro/bookings/host-statement?bookingId=${encodeURIComponent(booking.bookingId)}`,
    });
    setActiveBookingActionsId(null);
    setBookingActionFeedback({
      type: "success",
      text: "Host statement opened from current booking and finance records.",
    });
  };

  const handlePrintBookingDocument = (): void => {
    if (typeof document === "undefined" || !bookingDocumentModal) return;
    const frame = document.getElementById("booking-document-preview-frame") as HTMLIFrameElement | null;
    const frameWindow = frame?.contentWindow;
    if (frameWindow) {
      frameWindow.focus();
      frameWindow.print();
      return;
    }
    window.open(bookingDocumentModal.url, "_blank", "noopener,noreferrer");
  };

  const handleRevenueExportReport = (): void => {
    setRevenueReportFeedback(null);
    buildCsvDownload(
      `famlo-pro-revenue-report-${familyId}.csv`,
      revenueRecentTransactions.map((booking) => ({
        date: booking.revenueDate ?? booking.checkoutDate,
        bookingId: booking.bookingId,
        guest: booking.guestDisplayName,
        room: booking.roomName,
        source: normalizeBookingChannel(booking),
        grossAmount: booking.amount ?? "",
        fee: booking.platformFeeAmount ?? "",
        hostPayout: bookingFamloPayoutDisplay(booking),
        status: hostRevenueStatusLabel(booking),
      }))
    );
    recordGeneratedReport({
      name: "Revenue Report",
      type: "Revenue",
      period: selectedRevenueDateRangeLabel,
      format: "CSV",
      rowCount: revenueRecentTransactions.length,
    });
    setRevenueReportFeedback({
      type: "success",
      text: "Revenue report exported using the current revenue window and existing booking data.",
    });
  };

  const handleRevenueDownloadGst = (): void => {
    setRevenueReportFeedback(null);
    buildCsvDownload(
      `famlo-pro-gst-report-${familyId}.csv`,
      selectedRevenueBookings.map((booking) => ({
        bookingId: booking.bookingId,
        guest: booking.guestDisplayName,
        room: booking.roomName,
        source: normalizeBookingChannel(booking),
        revenueDate: booking.revenueDate ?? booking.checkoutDate,
        grossAmount: booking.amount ?? "",
        taxAmount: booking.taxAmount ?? "",
        refundAdjustment: booking.refundAdjustmentAmount ?? "",
      }))
    );
    recordGeneratedReport({
      name: "GST Report",
      type: "Tax & Compliance",
      period: selectedRevenueDateRangeLabel,
      format: "CSV",
      rowCount: selectedRevenueBookings.length,
    });
    setRevenueReportFeedback({
      type: "success",
      text: "GST export downloaded from the current revenue view.",
    });
  };

  const handleRevenueRefresh = (): void => {
    setRevenueReportFeedback({
      type: "success",
      text: "Refreshing the latest revenue and report view from the existing workspace data sources.",
    });
    router.refresh();
  };

  const handleReportExportAll = (): void => {
    setRevenueReportFeedback(null);
    buildCsvDownload(
      `famlo-pro-reports-manifest-${familyId}.csv`,
      reportCards.map((card) => ({
        title: card.title,
        type: card.reportType,
        latest: card.latest,
        formats: card.formats.join(" / "),
        description: card.description,
      }))
    );
    setRevenueReportFeedback({
      type: "success",
      text: "Exported the current report catalog manifest.",
    });
  };

  const handleGenerateReport = (
    reportName = "Custom Report",
    reportType = "Custom",
    format = "CSV"
  ): void => {
    setRevenueReportFeedback(null);
    buildCsvDownload(
      `famlo-pro-${reportName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${familyId}.csv`,
      reportScopedBookings.map((booking) => ({
        bookingId: booking.bookingId,
        guest: booking.guestDisplayName,
        guestEmail: booking.guestEmail ?? "",
        room: booking.roomName,
        source: normalizeBookingChannel(booking),
        status: bookingHealthLabel(booking),
        paymentStatus: hostRevenueStatusLabel(booking),
        amount: booking.amount ?? "",
        date: booking.revenueDate ?? booking.checkoutDate ?? booking.startDate,
      }))
    );
    recordGeneratedReport({
      name: reportName,
      type: reportType,
      period: reportDateRangeLabel,
      format,
      rowCount: reportScopedBookings.length,
    });
    setRevenueReportFeedback({
      type: "success",
      text: "Generated a custom report using the current report filters and existing booking data.",
    });
  };

  const handleScrollToSchedules = (): void => {
    if (typeof document === "undefined") return;
    document.getElementById("famlo-pro-scheduled-reports")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDashboardRefresh = (): void => {
    void refreshBookingsSnapshot().catch(() => {
      refreshCurrentSectionRoute();
    });
  };

  const openDashboardConversation = (conversationId: string): void => {
    setActiveMessageConversationId(conversationId);
    setActiveSectionWithUrl("messages-reviews");
  };

  const toggleBookingSelection = (bookingId: string): void => {
    setSelectedBookingIds((current) =>
      current.includes(bookingId) ? current.filter((value) => value !== bookingId) : [...current, bookingId]
    );
  };

  const toggleAllVisibleBookings = (): void => {
    const visibleIds = pagedBookings.map((booking) => booking.bookingId);
    const areAllSelected = visibleIds.every((bookingId) => selectedBookingIds.includes(bookingId));
    setSelectedBookingIds((current) =>
      areAllSelected ? current.filter((bookingId) => !visibleIds.includes(bookingId)) : Array.from(new Set([...current, ...visibleIds]))
    );
  };

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

  const handleCreateDashboardManualBooking = (): void => {
    setDashboardManualBookingFeedback(null);
    startDashboardManualBookingTransition(async () => {
      try {
        if (!dashboardManualBookingDraft.stayUnitId || !dashboardManualBookingDraft.checkInDate || !dashboardManualBookingDraft.checkOutDate) {
          throw new Error("Select room, arrival date, and departure date first.");
        }

        const response = await fetch("/api/host/pro/bookings/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId,
            stayUnitId: dashboardManualBookingDraft.stayUnitId,
            guestName: "Manual PMS Guest",
            checkInDate: dashboardManualBookingDraft.checkInDate,
            checkOutDate: dashboardManualBookingDraft.checkOutDate,
            notes: dashboardManualBookingDraft.amount.trim()
              ? `Manual booking amount: ${dashboardManualBookingDraft.amount.trim()}`
              : null,
          }),
        });

        const payload = (await response.json()) as { error?: string; message?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to create manual booking.");
        }

        setDashboardManualBookingFeedback({
          type: "success",
          text: payload.message ?? "Manual booking created successfully.",
        });
        setDashboardManualBookingDraft((current) => ({
          ...current,
          checkInDate: "",
          checkOutDate: "",
          amount: "",
        }));
        setIsDashboardBookingModalOpen(false);
        await refreshBookingsSnapshot();
        await refreshCalendarSnapshot([dashboardManualBookingDraft.stayUnitId]);
      } catch (error) {
        setDashboardManualBookingFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Unable to create manual booking.",
        });
      }
    });
  };

  const requestDashboardUploadTarget = async (url: string, file: File): Promise<{
    uploadUrl: string;
    publicUrl: string;
    storageKey?: string;
  }> => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        familyId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      uploadUrl?: string;
      publicUrl?: string;
      storageKey?: string;
    };

    if (!response.ok || !payload.uploadUrl || !payload.publicUrl) {
      throw new Error(payload.error || "Unable to prepare upload target.");
    }

    return {
      uploadUrl: payload.uploadUrl,
      publicUrl: payload.publicUrl,
      storageKey: payload.storageKey,
    };
  };

  const handleDashboardGalleryUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    if (!event.target.files?.length) return;

    setDashboardMediaFeedback(null);
    setIsDashboardGalleryUploading(true);
    try {
      const files = Array.from(event.target.files);
      const nextPhotos = [...propertyGallery];

      for (const file of files) {
        if (file.size > MAX_GALLERY_IMAGE_UPLOAD_BYTES) {
          throw new Error(`Image must be ${formatGalleryImageUploadLimitLabel()} or smaller.`);
        }

        let uploadedAsset: { publicUrl: string; storageKey?: string };
        try {
          const uploadTarget = await requestDashboardUploadTarget("/api/host/property-media/upload-url", file);
          await uploadDashboardFileWithProgress({ uploadUrl: uploadTarget.uploadUrl, file });
          uploadedAsset = {
            publicUrl: uploadTarget.publicUrl,
            storageKey: uploadTarget.storageKey,
          };
        } catch {
          uploadedAsset = await uploadDashboardFileViaFallback({
            url: "/api/host/property-media/upload-fallback",
            familyId,
            file,
          });
        }

        const saveResponse = await fetch("/api/host/property-media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId,
            publicUrl: uploadedAsset.publicUrl,
            storageKey: uploadedAsset.storageKey,
          }),
        });
        const savePayload = (await saveResponse.json().catch(() => ({}))) as {
          error?: string;
          photo?: Record<string, unknown>;
        };
        if (!saveResponse.ok || !savePayload.photo) {
          throw new Error(savePayload.error || "Unable to save gallery image.");
        }

        nextPhotos.push({
          id: String(savePayload.photo.id ?? `photo-${Date.now()}`),
          url: String(savePayload.photo.url ?? uploadedAsset.publicUrl),
          isPrimary: savePayload.photo.isPrimary === true,
          family_id: familyId,
        });
      }

      setPropertyGallery(nextPhotos);
      setDashboardMediaFeedback({
        type: "success",
        text: files.length === 1 ? "Image uploaded to My Gallery." : `${files.length} images uploaded to My Gallery.`,
      });
    } catch (error) {
      setDashboardMediaFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to upload images.",
      });
    } finally {
      setIsDashboardGalleryUploading(false);
      event.target.value = "";
    }
  };

  const handleDashboardGalleryReplace = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const targetId = pendingDashboardGalleryReplaceId;
    const file = event.target.files?.[0];
    if (!targetId || !file) return;

    setDashboardMediaFeedback(null);
    setIsDashboardGalleryUploading(true);
    try {
      if (file.size > MAX_GALLERY_IMAGE_UPLOAD_BYTES) {
        throw new Error(`Image must be ${formatGalleryImageUploadLimitLabel()} or smaller.`);
      }

      let uploadedAsset: { publicUrl: string; storageKey?: string };
      try {
        const uploadTarget = await requestDashboardUploadTarget("/api/host/property-media/upload-url", file);
        await uploadDashboardFileWithProgress({ uploadUrl: uploadTarget.uploadUrl, file });
        uploadedAsset = {
          publicUrl: uploadTarget.publicUrl,
          storageKey: uploadTarget.storageKey,
        };
      } catch {
        uploadedAsset = await uploadDashboardFileViaFallback({
          url: "/api/host/property-media/upload-fallback",
          familyId,
          file,
        });
      }

      const replaceResponse = await fetch("/api/host/property-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          photoId: targetId,
          action: "replace",
          publicUrl: uploadedAsset.publicUrl,
          storageKey: uploadedAsset.storageKey,
        }),
      });
      const replacePayload = (await replaceResponse.json().catch(() => ({}))) as { error?: string };
      if (!replaceResponse.ok) {
        throw new Error(replacePayload.error || "Unable to replace image.");
      }

      setPropertyGallery((current) =>
        current.map((photo) => (photo.id === targetId ? { ...photo, url: uploadedAsset.publicUrl } : photo))
      );
      setDashboardMediaFeedback({
        type: "success",
        text: "Selected gallery image updated.",
      });
    } catch (error) {
      setDashboardMediaFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to replace image.",
      });
    } finally {
      setIsDashboardGalleryUploading(false);
      setPendingDashboardGalleryReplaceId(null);
      event.target.value = "";
    }
  };

  const handleDashboardGalleryRemove = async (): Promise<void> => {
    if (!selectedDashboardGalleryId) {
      setDashboardMediaFeedback({
        type: "error",
        text: "Select an image first, then remove it from My Gallery.",
      });
      return;
    }

    setDashboardMediaFeedback(null);
    setIsDashboardGalleryUploading(true);
    try {
      const response = await fetch("/api/host/property-media", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          photoId: selectedDashboardGalleryId,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to remove image.");
      }

      setPropertyGallery((current) => {
        const next = current.filter((photo) => photo.id !== selectedDashboardGalleryId);
        if (next.length > 0 && !next.some((photo) => photo.isPrimary)) {
          next[0] = { ...next[0], isPrimary: true };
        }
        return next;
      });
      setSelectedDashboardGalleryId(null);
      setDashboardMediaFeedback({
        type: "success",
        text: "Selected image removed from My Gallery.",
      });
    } catch (error) {
      setDashboardMediaFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to remove image.",
      });
    } finally {
      setIsDashboardGalleryUploading(false);
    }
  };

  const handleDashboardReelUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;

    setDashboardMediaFeedback(null);
    setIsDashboardReelUploading(true);
    try {
      if (file.size > MAX_HOST_REEL_UPLOAD_BYTES) {
        throw new Error("Host reel is too large. Upload a video under 75MB.");
      }

      let uploadedAsset: { publicUrl: string; storageKey?: string };
      try {
        const uploadTarget = await requestDashboardUploadTarget("/api/host/property-reels/upload-url", file);
        await uploadDashboardFileWithProgress({ uploadUrl: uploadTarget.uploadUrl, file });
        uploadedAsset = {
          publicUrl: uploadTarget.publicUrl,
          storageKey: uploadTarget.storageKey,
        };
      } catch {
        uploadedAsset = await uploadDashboardFileViaFallback({
          url: "/api/host/property-reels/upload-fallback",
          familyId,
          file,
        });
      }

      const response = await fetch("/api/host/property-reels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          publicUrl: uploadedAsset.publicUrl,
          storageKey: uploadedAsset.storageKey,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        reel?: Record<string, unknown>;
      };
      if (!response.ok || !payload.reel) {
        throw new Error(payload.error || "Unable to save reel.");
      }

      const nextReel = {
        id: String(payload.reel.id ?? `reel-${Date.now()}`),
        publicUrl: String(payload.reel.publicUrl ?? uploadedAsset.publicUrl),
        storageKey: String(payload.reel.storageKey ?? uploadedAsset.storageKey ?? ""),
        mimeType: String(payload.reel.mimeType ?? file.type),
        sizeBytes: typeof payload.reel.sizeBytes === "number" ? payload.reel.sizeBytes : file.size,
        durationSeconds: typeof payload.reel.durationSeconds === "number" ? payload.reel.durationSeconds : null,
        width: typeof payload.reel.width === "number" ? payload.reel.width : null,
        height: typeof payload.reel.height === "number" ? payload.reel.height : null,
        isFeatured: payload.reel.isFeatured === true,
        createdAt: String(payload.reel.createdAt ?? new Date().toISOString()),
        updatedAt: String(payload.reel.updatedAt ?? new Date().toISOString()),
        source: payload.reel.source === "family_legacy_reel" ? "family_legacy_reel" : "host_property_reels",
      } satisfies PublicPropertyReel;

      setDashboardReels((current) => [
        nextReel,
        ...current.filter((reel) => reel.id !== nextReel.id && reel.publicUrl !== nextReel.publicUrl),
      ]);
      setPropertyContent((current) => ({
        ...current,
        hostReelPublicUrl: nextReel.publicUrl,
        hostReelStorageKey: nextReel.storageKey,
        hostReelMimeType: nextReel.mimeType,
        hostReelSizeBytes: nextReel.sizeBytes ?? null,
        hostReelUploadedAt: nextReel.updatedAt,
      }));
      setSelectedDashboardReelId(nextReel.id);
      setDashboardMediaFeedback({
        type: "success",
        text: "Reel uploaded to My Reels.",
      });
    } catch (error) {
      setDashboardMediaFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to upload reel.",
      });
    } finally {
      setIsDashboardReelUploading(false);
      event.target.value = "";
    }
  };

  const handleDashboardReelRemove = async (): Promise<void> => {
    if (!selectedDashboardReelId) {
      setDashboardMediaFeedback({
        type: "error",
        text: "Select a reel first, then remove it from My Reels.",
      });
      return;
    }

    setDashboardMediaFeedback(null);
    setIsDashboardReelUploading(true);
    try {
      const response = await fetch("/api/host/property-reels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          reelId: selectedDashboardReelId,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to remove reel.");
      }

      const remainingReels = dashboardReels.filter((reel) => reel.id !== selectedDashboardReelId);
      const fallbackReel = remainingReels.find((reel) => reel.isFeatured) ?? remainingReels[0] ?? null;
      setDashboardReels(remainingReels);
      setPropertyContent((current) => ({
        ...current,
        hostReelPublicUrl: fallbackReel?.publicUrl ?? "",
        hostReelStorageKey: fallbackReel?.storageKey ?? "",
        hostReelMimeType: fallbackReel?.mimeType ?? "",
        hostReelSizeBytes: fallbackReel?.sizeBytes ?? null,
        hostReelUploadedAt: fallbackReel?.updatedAt ?? "",
      }));
      setDashboardPlayingReelId((current) => (current === selectedDashboardReelId ? null : current));
      setSelectedDashboardReelId(null);
      setDashboardMediaFeedback({
        type: "success",
        text: "Selected reel removed from My Reels.",
      });
    } catch (error) {
      setDashboardMediaFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to remove reel.",
      });
    } finally {
      setIsDashboardReelUploading(false);
    }
  };

  const handleSaveSettingsAccount = (): void => {
    setSettingsFeedback(null);
    startSavingSettingsWorkspace(async () => {
      const phoneChanged = settingsProfileDraft.mobileNumber.trim() !== initialProfile.mobileNumber.trim();
      if (phoneChanged) {
        setSettingsFeedback({
          type: "error",
          text: "Phone number change is blocked here until an OTP-verified update flow is connected.",
        });
        return;
      }

      try {
        const result = await saveFamilyProfileWorkspace({
          familyId,
          profile: settingsProfileDraft,
          listing: settingsPropertyDraft,
          schedule: initialSchedule,
          photos: propertyPhotos,
          compliance: hostProfileCompliance,
        });

        if (!result.ok) {
          setSettingsFeedback({ type: "error", text: result.error });
          return;
        }

        setIsEditingAccountSettings(false);
        setSettingsFeedback({
          type: "success",
          text: "Account and profile details saved on this settings page.",
        });
        router.refresh();
      } catch (error) {
        setSettingsFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Unable to save account settings right now.",
        });
      }
    });
  };

  const handleSaveChannelFinanceSettings = (): void => {
    setChannelFinanceFeedback(null);
    startChannelFinanceSaving(async () => {
      try {
        const response = await fetch("/api/host/pro/channel-finance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId,
            settings: channelFinanceSettings,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          settings?: ChannelFinanceSettings;
          error?: string;
        };
        if (!response.ok || !payload.settings) {
          throw new Error(payload.error ?? "Unable to save Channel Finance settings.");
        }

        setChannelFinanceSettings(payload.settings);
        setChannelFinanceLoadedFamilyId(familyId);
        setChannelFinanceFeedback({
          type: "success",
          text: "Channel Finance settings saved for receipts, statements, and OTA commission estimates.",
        });
      } catch (error) {
        setChannelFinanceFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Unable to save Channel Finance settings.",
        });
      }
    });
  };

  const handleSaveHostProfileDocuments = async (options?: { updatedCompliance?: FamilyComplianceDraft }): Promise<void> => {
    const nextCompliance = options?.updatedCompliance ?? hostProfileCompliance;
    setHostProfileDocumentsFeedback(null);

    return new Promise((resolve) => {
      startHostProfileDocumentsSaving(async () => {
        try {
          const result = await saveFamilyProfileWorkspace({
            familyId,
            profile: initialProfile,
            listing: initialPropertyContent,
            schedule: initialSchedule,
            photos: propertyPhotos,
            compliance: nextCompliance,
          });

          if (!result.ok) {
            setHostProfileDocumentsFeedback({ type: "error", text: result.error });
            resolve();
            return;
          }

          setHostProfileCompliance(nextCompliance);
          setHostProfileDocumentsFeedback({
            type: "success",
            text: result.warnings?.length
              ? `Documents updated with ${result.warnings.length} sync warning${result.warnings.length === 1 ? "" : "s"}.`
              : "Documents updated successfully.",
          });
          router.refresh();
        } catch (error) {
          setHostProfileDocumentsFeedback({
            type: "error",
            text: error instanceof Error ? error.message : "Unable to save documents right now.",
          });
        } finally {
          resolve();
        }
      });
    });
  };

  const submitBulkCalendarEditor = (): void => {
    if (!bulkCalendarDraft.dateFrom || !bulkCalendarDraft.dateTo || bulkCalendarDraft.dateTo < bulkCalendarDraft.dateFrom) {
      setBulkCalendarFeedback({ type: "error", text: "Choose a valid affected date range." });
      return;
    }
    if (bulkCalendarDraft.dateFrom < calendarTodayIsoDate) {
      setBulkCalendarFeedback({ type: "error", text: "Past dates cannot be edited from Bulk Update." });
      return;
    }

    const selectedWeekdays = CALENDAR_BULK_WEEKDAY_OPTIONS.filter((option) => calendarBulkWeekdays[option.value]).map(
      (option) => option.value
    );
    if (selectedWeekdays.length === 0) {
      setBulkCalendarFeedback({ type: "error", text: "Select at least one weekday for Bulk Update." });
      return;
    }

    const selectedRestrictions = CALENDAR_BULK_RESTRICTION_OPTIONS.filter(
      (option) => calendarBulkRestrictions[option.value]
    ).map((option) => option.value);
    if (selectedRestrictions.length === 0) {
      setBulkCalendarFeedback({ type: "error", text: "Select at least one affected restriction." });
      return;
    }

    if (calendarBulkRestrictions.rate) {
      const parsedRate = Number(bulkCalendarDraft.rateAmount);
      if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
        setBulkCalendarFeedback({ type: "error", text: "Enter a valid positive value for Rate." });
        return;
      }
    }

    if (calendarBulkRestrictions.min_stay_arrival) {
      const parsedValue = Number(bulkCalendarDraft.minStayArrival);
      if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        setBulkCalendarFeedback({ type: "error", text: "Enter a valid positive value for Min Stay Arrival." });
        return;
      }
    }

    if (calendarBulkRestrictions.min_stay_through) {
      const parsedValue = Number(bulkCalendarDraft.minStay);
      if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        setBulkCalendarFeedback({ type: "error", text: "Enter a valid positive value for Min Stay Through." });
        return;
      }
    }

    if (calendarBulkRestrictions.max_stay) {
      const parsedValue = Number(bulkCalendarDraft.maxStay);
      if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        setBulkCalendarFeedback({ type: "error", text: "Enter a valid positive value for Max Stay." });
        return;
      }
    }

    if (effectiveBulkCalendarRoomIds.length === 0) {
      setBulkCalendarFeedback({ type: "error", text: "Select at least one affected room or rate plan." });
      return;
    }

    const targetDates = enumerateInclusiveCalendarDates(bulkCalendarDraft.dateFrom, bulkCalendarDraft.dateTo).filter(
      (date) => date >= calendarTodayIsoDate && selectedWeekdays.includes(weekdayTokenForIsoDate(date))
    );
    if (targetDates.length === 0) {
      setBulkCalendarFeedback({
        type: "error",
        text: "No editable future dates matched the selected weekday filters.",
      });
      return;
    }

    const targetRanges = compactCalendarDateRanges(targetDates);
    const parsedRateAmount = calendarBulkRestrictions.rate ? Number(bulkCalendarDraft.rateAmount) : null;
    const parsedMinStayArrival = calendarBulkRestrictions.min_stay_arrival ? Number(bulkCalendarDraft.minStayArrival) : null;
    const parsedMinStayThrough = calendarBulkRestrictions.min_stay_through ? Number(bulkCalendarDraft.minStay) : null;
    const parsedMaxStay = calendarBulkRestrictions.max_stay ? Number(bulkCalendarDraft.maxStay) : null;

    setCalendarActionFeedback(null);
    setBulkCalendarFeedback(null);
    startBulkCalendarTransition(async () => {
      try {
        for (const roomId of effectiveBulkCalendarRoomIds) {
          for (const range of targetRanges) {
            const response = await fetch("/api/host/pro/calendar/bulk-update", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                familyId,
                roomIds: [roomId],
                roomScope: "single",
                selectedRoomId: roomId,
                applyToAllRooms: false,
                dateFrom: range.dateFrom,
                dateTo: range.dateTo,
                rateAction: calendarBulkRestrictions.rate ? "save" : null,
                rateAmount: parsedRateAmount,
                availabilityAction: null,
                restrictions: {
                  minStay: parsedMinStayThrough,
                  minStayArrival: parsedMinStayArrival,
                  maxStay: parsedMaxStay,
                  cta: calendarBulkRestrictions.cta ? bulkCalendarDraft.cta === "true" : undefined,
                  ctd: calendarBulkRestrictions.ctd ? bulkCalendarDraft.ctd === "true" : undefined,
                  stopSell: calendarBulkRestrictions.stop_sell ? bulkCalendarDraft.stopSell === "true" : undefined,
                },
              }),
            });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) {
              throw new Error(payload.error ?? "Failed to apply Bulk Update.");
            }
          }
        }

        setBulkCalendarFeedback({
          type: "success",
          text: `Applied Bulk Update for ${effectiveBulkCalendarRoomIds.length} room(s) across ${targetDates.length} selected date(s). Channex sync remains on the existing safe path.`,
        });
        setIsBulkCalendarEditorOpen(false);
        refreshCurrentSectionRoute();
      } catch (error) {
        setBulkCalendarFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to apply Bulk Update.",
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
  const bookingsTodayIsoDate = isoDateFromLocalDate(new Date());
  const totalBookingsCount = proBookings.length;
  const historyBookingIds = new Set(
    proBookings
      .filter((booking) => isCancelledBooking(booking) || booking.endDate < bookingsTodayIsoDate)
      .map((booking) => booking.bookingId)
  );
  const historyBookings = proBookings.filter((booking) => historyBookingIds.has(booking.bookingId));
  const currentBookings = proBookings.filter((booking) => !historyBookingIds.has(booking.bookingId));
  const visibleBookingPool = bookingView === "History" ? historyBookings : currentBookings;
  const currentBookingsCount = currentBookings.length;
  const historyBookingsCount = historyBookings.length;
  const famloDirectBookingsCount = visibleBookingPool.filter((booking) => !booking.isOta).length;
  const otaBookingsCount = visibleBookingPool.filter((booking) => booking.isOta).length;
  const pendingApprovalBookingsCount = visibleBookingPool.filter(isPendingApprovalBooking).length;
  const cancelledBookingsCount = visibleBookingPool.filter(isCancelledBooking).length;
  const modifiedReviewBookingsCount = visibleBookingPool.filter(isModifiedReviewBooking).length;
  const actionNeededBookingsCount = visibleBookingPool.filter(isActionNeededBooking).length;
  const confirmedBookingsCount = visibleBookingPool.filter(isConfirmedBooking).length;
  const filteredProBookings = visibleBookingPool
    .filter((booking) => matchesBookingFilter(booking, bookingFilter))
    .filter((booking) => {
      if (bookingDateFilter === "Checked in") {
        return booking.startDate < bookingsTodayIsoDate && booking.checkoutDate > bookingsTodayIsoDate && !isCancelledBooking(booking);
      }
      if (bookingDateFilter === "Checked out") {
        return booking.checkoutDate === bookingsTodayIsoDate;
      }
      if (bookingDateFilter === "Staying Today") {
        return booking.startDate <= bookingsTodayIsoDate && booking.checkoutDate > bookingsTodayIsoDate && !isCancelledBooking(booking);
      }
      return true;
    })
    .sort((left, right) => {
      if (bookingDateFilter === "Checked out") {
        return left.checkoutDate.localeCompare(right.checkoutDate);
      }
      if (bookingDateFilter === "All Bookings") {
        const todayTime = new Date(`${bookingsTodayIsoDate}T00:00:00+05:30`).getTime();
        const leftTime = new Date(`${left.startDate}T00:00:00+05:30`).getTime();
        const rightTime = new Date(`${right.startDate}T00:00:00+05:30`).getTime();
        const leftDistance = Math.abs(leftTime - todayTime);
        const rightDistance = Math.abs(rightTime - todayTime);
        if (leftDistance !== rightDistance) return leftDistance - rightDistance;
        return leftTime - rightTime;
      }
      return left.startDate.localeCompare(right.startDate);
    });
  const bookingChannelOptions = useMemo(
    () =>
      Array.from(new Set(proBookings.map((booking) => normalizeBookingChannel(booking))))
        .sort((left, right) => left.localeCompare(right)),
    [proBookings]
  );
  const bookingSearchToken = bookingSearchQuery.trim().toLowerCase();
  const bookingsUiRows = useMemo(
    () =>
      filteredProBookings.filter((booking) => {
        if (bookingChannelFilter !== "all" && normalizeBookingChannel(booking) !== bookingChannelFilter) {
          return false;
        }
        if (!bookingSearchToken) return true;
        const haystack = [
          booking.bookingId,
          booking.externalBookingId,
          booking.linkedBookingId,
          booking.guestDisplayName,
          booking.roomName,
          booking.sourceLabel,
          propertyName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(bookingSearchToken);
      }),
    [bookingChannelFilter, bookingSearchToken, filteredProBookings, propertyName]
  );
  const bookingsDateRangeLabel = useMemo(() => {
    if (bookingsUiRows.length === 0) return "No bookings in range";
    const orderedByStart = [...bookingsUiRows].sort((left, right) => left.startDate.localeCompare(right.startDate));
    const start = orderedByStart[0]?.startDate ?? bookingsTodayIsoDate;
    const end = orderedByStart.reduce((latest, booking) => (booking.checkoutDate > latest ? booking.checkoutDate : latest), start);
    return `${formatLongDate(start)} - ${formatLongDate(end)}`;
  }, [bookingsTodayIsoDate, bookingsUiRows]);
  const bookingsTotalPages = Math.max(1, Math.ceil(bookingsUiRows.length / bookingPageSize));
  const safeBookingPage = Math.min(bookingPage, bookingsTotalPages);
  const pagedBookings = bookingsUiRows.slice((safeBookingPage - 1) * bookingPageSize, safeBookingPage * bookingPageSize);
  const showingBookingsFrom = bookingsUiRows.length === 0 ? 0 : (safeBookingPage - 1) * bookingPageSize + 1;
  const showingBookingsTo = bookingsUiRows.length === 0 ? 0 : Math.min(bookingsUiRows.length, safeBookingPage * bookingPageSize);
  const bookingsPaginationItems = (() => {
    if (bookingsTotalPages <= 5) {
      return Array.from({ length: bookingsTotalPages }, (_, index) => index + 1);
    }
    if (safeBookingPage <= 3) {
      return [1, 2, 3, "ellipsis", bookingsTotalPages] as const;
    }
    if (safeBookingPage >= bookingsTotalPages - 2) {
      return [1, "ellipsis", bookingsTotalPages - 2, bookingsTotalPages - 1, bookingsTotalPages] as const;
    }
    return [1, "ellipsis", safeBookingPage, "ellipsis-2", bookingsTotalPages] as const;
  })();
  const bookingsWithValue = proBookings
    .map((booking) => ({ booking, parsedAmount: parseBookingAmount(booking.amount) }))
    .filter((entry): entry is { booking: ProBookingSummary; parsedAmount: number } => entry.parsedAmount != null);
  const bookingsWithNetPayout = proBookings.filter(
    (booking): booking is ProBookingSummary & { netPayoutAmount: number } => booking.netPayoutAmount != null
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
  const currentMonthStartIsoDate = `${currentMonthPrefix}-01`;
  const currentMonthEndExclusiveIsoDate = isoDateFromLocalDate(new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 1));
  const currentMonthEndIsoDate = isoDateFromLocalDate(
    shiftLocalDays(new Date(`${currentMonthEndExclusiveIsoDate}T12:00:00+05:30`), -1)
  );
  const currentMonthDaysCount = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).getDate();
  const activeBookingsWorkspaceRoomCount = rooms.filter((room) => room.isActive).length;
  const totalBookingValue = bookingsWithValue.reduce((sum, entry) => sum + entry.parsedAmount, 0);
  const completedRevenueBookings = bookingsWithNetPayout.filter(
    (booking) => !booking.isReviewOnly && isCompletedRevenueBooking(booking)
  );
  const upcomingConfirmedBookings = proBookings.filter((booking) => {
    if (booking.isReviewOnly) return false;
    if (isCancelledBooking(booking)) return false;
    if (!isConfirmedBooking(booking)) return false;
    if (booking.startDate < todayIsoDate) return false;
    return !isCompletedRevenueBooking(booking);
  });
  const upcomingConfirmedBookingValue = upcomingConfirmedBookings.reduce(
    (sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0),
    0
  );
  const revenueWindowAnchors = {
    todayIsoDate,
    weekStartIsoDate,
    weekEndIsoDate,
    currentMonthPrefix,
  };
  const revenueBookingsByWindow: Record<RevenueWindowFilter, typeof completedRevenueBookings> = {
    Today: completedRevenueBookings.filter((booking) => matchesRevenueWindowDate(booking.revenueDate, "Today", revenueWindowAnchors)),
    "This week": completedRevenueBookings.filter((booking) => matchesRevenueWindowDate(booking.revenueDate, "This week", revenueWindowAnchors)),
    "This month": completedRevenueBookings.filter((booking) => matchesRevenueWindowDate(booking.revenueDate, "This month", revenueWindowAnchors)),
    "All time": completedRevenueBookings.filter((booking) => matchesRevenueWindowDate(booking.revenueDate, "All time", revenueWindowAnchors)),
  };
  const selectedRevenueBookings = revenueBookingsByWindow[revenueWindow];
  const famloPayoutBookings = selectedRevenueBookings.filter((booking) => shouldIncludeFamloPayoutInTotals(booking));
  const selectedRevenueNetPayout = famloPayoutBookings.reduce((sum, booking) => sum + (booking.payoutAmountValue ?? 0), 0);
  const selectedRevenueGrossValue = selectedRevenueBookings.reduce(
    (sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0),
    0
  );
  const selectedRevenuePaidToYou = famloPayoutBookings
    .filter((booking) => isFinanceBackedPaidStatus(booking.payoutExecutionStatus) || isFinanceBackedPaidStatus(booking.payoutStatus))
    .reduce((sum, booking) => sum + (booking.paidPayoutAmount ?? booking.payoutAmountValue ?? 0), 0);
  const selectedRevenuePendingPayout = famloPayoutBookings
    .filter((booking) => !isFinanceBackedPaidStatus(booking.payoutExecutionStatus) && !isFinanceBackedPaidStatus(booking.payoutStatus))
    .reduce((sum, booking) => sum + (booking.payoutAmountValue ?? 0), 0);
  const famloGeneratedBookings = selectedRevenueBookings.filter((booking) => booking.sourceCategory === "famlo");
  const famloGeneratedRevenue = famloGeneratedBookings.reduce(
    (sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0),
    0
  );
  const revenueBySource = {
    famlo: {
      label: "Famlo Direct",
      amount: famloGeneratedRevenue,
      count: famloGeneratedBookings.length,
      helperText: "Bookings and payments handled through Famlo.",
    },
    direct: {
      label: "Direct / Manual",
      amount: selectedRevenueBookings
        .filter((booking) => booking.sourceCategory === "direct")
        .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0),
      count: selectedRevenueBookings.filter((booking) => booking.sourceCategory === "direct").length,
      helperText: "Bookings added directly by you or your team.",
    },
    ota: {
      label: "OTA",
      amount: selectedRevenueBookings
        .filter((booking) => booking.sourceCategory === "ota")
        .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0),
      count: selectedRevenueBookings.filter((booking) => booking.sourceCategory === "ota").length,
      helperText: "Bookings received from connected OTA channels.",
    },
  };
  const selectedRevenueWindowHint =
    revenueWindow === "Today"
      ? `Completed earnings recognized on ${formatShortDate(todayIsoDate)}.`
      : revenueWindow === "This week"
        ? `Completed earnings from ${formatShortDate(weekStartIsoDate)} to ${formatShortDate(weekEndIsoDate)}.`
        : revenueWindow === "This month"
          ? "Completed earnings for the current month."
          : "Completed earnings across all eligible visible bookings.";
  const effectiveRevenueGrossValue = selectedRevenueGrossValue;
  const effectiveRevenueNetPayout = selectedRevenueNetPayout;
  const effectiveRevenuePaidToYou = selectedRevenuePaidToYou;
  const effectiveRevenuePendingPayout = selectedRevenuePendingPayout;
  const effectiveRevenueBySource = revenueBySource;
  const orderedRevenueSources = [
    effectiveRevenueBySource.famlo,
    effectiveRevenueBySource.ota,
    effectiveRevenueBySource.direct,
  ];
  const hasPayoutSetupIssue = !hostRevenueCompliance.panVerified || !hostRevenueCompliance.payoutAccountActive;
  const averageBookingValue = bookingsWithValue.length > 0 ? totalBookingValue / bookingsWithValue.length : null;
  const sourceCountEntries = Object.entries(
    proBookings.reduce<Record<string, number>>((acc, booking) => {
      const key = booking.sourceLabel || (booking.isOta ? "OTA" : "Famlo Direct");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((left, right) => right[1] - left[1]);
  const confirmedBookingsTodayCount = proBookings.filter(
    (booking) => isConfirmedBooking(booking) && booking.startDate === bookingsTodayIsoDate
  ).length;
  const pendingBookingsTodayCount = proBookings.filter(
    (booking) =>
      isPendingApprovalBooking(booking) &&
      ((booking.createdAt && booking.createdAt.slice(0, 10) === bookingsTodayIsoDate) || booking.startDate === bookingsTodayIsoDate)
  ).length;
  const cancelledBookingsTodayCount = proBookings.filter(
    (booking) =>
      isCancelledBooking(booking) &&
      ((booking.createdAt && booking.createdAt.slice(0, 10) === bookingsTodayIsoDate) ||
        booking.startDate === bookingsTodayIsoDate ||
        booking.checkoutDate === bookingsTodayIsoDate)
  ).length;
  const thisMonthRevenueValue = completedRevenueBookings
    .filter((booking) => (booking.revenueDate ?? booking.checkoutDate).startsWith(currentMonthPrefix))
    .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0);
  const thisMonthBookedNights = proBookings
    .filter((booking) => !isCancelledBooking(booking) && isConfirmedBooking(booking))
    .reduce(
      (sum, booking) =>
        sum +
        countOverlappingNights(
          booking.startDate,
          booking.checkoutDate,
          currentMonthStartIsoDate,
          currentMonthEndExclusiveIsoDate
        ),
      0
    );
  const occupancyThisMonthPercent =
    activeBookingsWorkspaceRoomCount > 0 && currentMonthDaysCount > 0
      ? Math.min(100, Math.round((thisMonthBookedNights / (activeBookingsWorkspaceRoomCount * currentMonthDaysCount)) * 100))
      : 0;
  const topSourceByBookingCount = sourceCountEntries[0] ?? null;
  const reportWindowAnchors = (() => {
    const today = new Date();
    if (reportWindow === "Today") {
      return [
        {
          key: todayIsoDate,
          label: "Today",
        },
      ];
    }

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
      const date = new Date(today.getFullYear(), today.getMonth() - (11 - index), 1);
      const iso = isoDateFromLocalDate(date);
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        label: formatMonthShort(iso),
      };
    });
  })();
  const reportTrendRows = reportWindowAnchors.map((anchor) => {
    const famloCount = proBookings.filter((booking) => {
      if (booking.sourceCategory !== "famlo") return false;
      return reportWindow === "All time" ? booking.startDate.startsWith(anchor.key) : booking.startDate === anchor.key;
    }).length;
    const directCount = proBookings.filter((booking) => {
      if (booking.sourceCategory !== "direct") return false;
      return reportWindow === "All time" ? booking.startDate.startsWith(anchor.key) : booking.startDate === anchor.key;
    }).length;
    const otaCount = proBookings.filter((booking) => {
      if (booking.sourceCategory !== "ota") return false;
      return reportWindow === "All time" ? booking.startDate.startsWith(anchor.key) : booking.startDate === anchor.key;
    }).length;
    const famloRevenue = completedRevenueBookings
      .filter((booking) => booking.sourceCategory === "famlo")
      .filter((booking) => {
        const revenueDate = booking.revenueDate ?? booking.checkoutDate;
        return reportWindow === "All time" ? revenueDate.startsWith(anchor.key) : revenueDate === anchor.key;
      })
      .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0);
    const directRevenue = completedRevenueBookings
      .filter((booking) => booking.sourceCategory === "direct")
      .filter((booking) => {
        const revenueDate = booking.revenueDate ?? booking.checkoutDate;
        return reportWindow === "All time" ? revenueDate.startsWith(anchor.key) : revenueDate === anchor.key;
      })
      .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0);
    const otaRevenue = completedRevenueBookings
      .filter((booking) => booking.sourceCategory === "ota")
      .filter((booking) => {
        const revenueDate = booking.revenueDate ?? booking.checkoutDate;
        return reportWindow === "All time" ? revenueDate.startsWith(anchor.key) : revenueDate === anchor.key;
      })
      .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0);
    return {
      ...anchor,
      famloCount,
      directCount,
      otaCount,
      totalCount: famloCount + directCount + otaCount,
      famloRevenue,
      directRevenue,
      otaRevenue,
      totalRevenue: famloRevenue + directRevenue + otaRevenue,
    };
  });
  const reportMaxCount = reportTrendRows.reduce((max, row) => Math.max(max, row.famloCount, row.directCount, row.otaCount, row.totalCount), 0);
  const reportMaxRevenue = reportTrendRows.reduce((max, row) => Math.max(max, row.famloRevenue, row.directRevenue, row.otaRevenue, row.totalRevenue), 0);
  const chartWidth = 640;
  const chartHeight = 220;
  const famloTrendPath = buildSvgLinePath(reportTrendRows.map((row) => row.famloCount), chartWidth, chartHeight, reportMaxCount);
  const directTrendPath = buildSvgLinePath(reportTrendRows.map((row) => row.directCount), chartWidth, chartHeight, reportMaxCount);
  const otaTrendPath = buildSvgLinePath(reportTrendRows.map((row) => row.otaCount), chartWidth, chartHeight, reportMaxCount);
  const famloRevenueTrendPath = buildSvgLinePath(reportTrendRows.map((row) => row.famloRevenue), chartWidth, chartHeight, reportMaxRevenue);
  const directRevenueTrendPath = buildSvgLinePath(reportTrendRows.map((row) => row.directRevenue), chartWidth, chartHeight, reportMaxRevenue);
  const otaRevenueTrendPath = buildSvgLinePath(reportTrendRows.map((row) => row.otaRevenue), chartWidth, chartHeight, reportMaxRevenue);
  const reportLegendItems = [
    {
      id: "famlo",
      label: "Famlo Direct",
      color: "#3b82f6",
    },
    {
      id: "ota",
      label: "OTA",
      color: "#10b981",
    },
    {
      id: "direct",
      label: "Direct / Manual",
      color: "#f59e0b",
    },
  ] as const;
  const activeReportSeries =
    reportGraph === "bookings"
      ? reportLegendItems.map((item) => ({
          ...item,
          values:
            item.id === "famlo"
              ? reportTrendRows.map((row) => row.famloCount)
              : item.id === "ota"
                ? reportTrendRows.map((row) => row.otaCount)
                : reportTrendRows.map((row) => row.directCount),
          path: item.id === "famlo" ? famloTrendPath : item.id === "ota" ? otaTrendPath : directTrendPath,
          maxValue: reportMaxCount,
        }))
      : reportLegendItems.map((item) => ({
          ...item,
          values:
            item.id === "famlo"
              ? reportTrendRows.map((row) => row.famloRevenue)
              : item.id === "ota"
                ? reportTrendRows.map((row) => row.otaRevenue)
                : reportTrendRows.map((row) => row.directRevenue),
          path: item.id === "famlo" ? famloRevenueTrendPath : item.id === "ota" ? otaRevenueTrendPath : directRevenueTrendPath,
          maxValue: reportMaxRevenue,
        }));
  const selectedRevenueDateRangeLabel =
    revenueWindow === "Today"
      ? formatLongDate(todayIsoDate)
      : revenueWindow === "This week"
        ? `${formatLongDate(weekStartIsoDate)} – ${formatLongDate(weekEndIsoDate)}`
        : revenueWindow === "This month"
          ? `${formatLongDate(currentMonthStartIsoDate)} – ${formatLongDate(currentMonthEndIsoDate)}`
          : selectedRevenueBookings.length > 0
            ? `${formatLongDate(selectedRevenueBookings.reduce((earliest, booking) => {
              const value = booking.revenueDate ?? booking.checkoutDate;
              return value < earliest ? value : earliest;
            }, selectedRevenueBookings[0]?.revenueDate ?? selectedRevenueBookings[0]?.checkoutDate ?? todayIsoDate))} – ${formatLongDate(selectedRevenueBookings.reduce((latest, booking) => {
              const value = booking.revenueDate ?? booking.checkoutDate;
              return value > latest ? value : latest;
            }, selectedRevenueBookings[0]?.revenueDate ?? selectedRevenueBookings[0]?.checkoutDate ?? todayIsoDate))}`
            : "All time";
  const directRevenueValue = selectedRevenueBookings
    .filter((booking) => booking.sourceCategory !== "ota")
    .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0);
  const otaRevenueValue = selectedRevenueBookings
    .filter((booking) => booking.sourceCategory === "ota")
    .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0);
  const famloFeeValue = selectedRevenueBookings.reduce((sum, booking) => sum + (booking.platformFeeAmount ?? 0), 0);
  const effectiveRevenueShareBase = Math.max(effectiveRevenueGrossValue, 1);
  const selectedRevenueStatusScope = proBookings.filter((booking) =>
    matchesRevenueWindowDate(booking.revenueDate ?? booking.checkoutDate, revenueWindow, revenueWindowAnchors)
  );
  const refundedRevenueValue = selectedRevenueStatusScope
    .filter((booking) => booking.refundAdjustmentAmount != null || normalizeToken(booking.paymentStatus).includes("refund"))
    .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0);
  const paymentPendingRevenueValue = selectedRevenueStatusScope
    .filter((booking) => hasPaymentAttention(booking))
    .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0);
  const cancelledRevenueValue = selectedRevenueStatusScope
    .filter((booking) => isCancelledBooking(booking))
    .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0);
  const confirmedRevenueValue = selectedRevenueStatusScope
    .filter((booking) => isConfirmedBooking(booking) && !isCancelledBooking(booking))
    .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0);
  const manualRevenueValue = selectedRevenueStatusScope
    .filter((booking) => booking.sourceCategory === "direct")
    .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0);
  const revenueBreakdownBase = Math.max(
    confirmedRevenueValue + cancelledRevenueValue + refundedRevenueValue + paymentPendingRevenueValue + manualRevenueValue,
    1
  );
  const reportFilterAnchors = {
    todayIsoDate,
    weekStartIsoDate,
    weekEndIsoDate,
    currentMonthPrefix,
  };
  const reportScopedBookings = proBookings.filter((booking) => {
    const scopedDate = booking.revenueDate ?? booking.checkoutDate ?? booking.startDate;
    if (!matchesReportWindowDate(scopedDate, reportWindow, reportFilterAnchors)) return false;
    if (reportSourceFilter !== "all" && normalizeBookingChannel(booking) !== reportSourceFilter) return false;
    if (reportRoomFilter !== "all" && booking.roomId !== reportRoomFilter) return false;
    if (reportPaymentFilter === "paid") {
      return deriveRevenuePaymentStatusLabel(booking).toLowerCase().includes("paid");
    }
    if (reportPaymentFilter === "pending") {
      return hasPaymentAttention(booking) || deriveRevenuePaymentStatusLabel(booking).toLowerCase().includes("pending");
    }
    if (reportPaymentFilter === "refunded") {
      return normalizeToken(booking.paymentStatus).includes("refund") || booking.refundAdjustmentAmount != null;
    }
    return true;
  });
  const reportDateRangeLabel =
    reportWindow === "Today"
      ? formatLongDate(todayIsoDate)
      : reportWindow === "This week"
        ? `${formatLongDate(weekStartIsoDate)} – ${formatLongDate(weekEndIsoDate)}`
        : reportWindow === "This month"
          ? `${formatLongDate(currentMonthStartIsoDate)} – ${formatLongDate(currentMonthEndIsoDate)}`
          : "All time";
  const revenueOverviewAnchors = (() => {
    if (revenueWindow === "Today") {
      return [{ key: todayIsoDate, label: "Today" }];
    }
    if (revenueWindow === "This week") {
      return Array.from({ length: 7 }, (_, index) => {
        const date = shiftLocalDays(weekStartDate, index);
        const iso = isoDateFromLocalDate(date);
        return { key: iso, label: formatWeekdayShort(iso) };
      });
    }
    if (revenueWindow === "This month") {
      return Array.from({ length: currentMonthDaysCount }, (_, index) => {
        const date = shiftLocalDays(new Date(`${currentMonthStartIsoDate}T12:00:00+05:30`), index);
        const iso = isoDateFromLocalDate(date);
        return { key: iso, label: String(index + 1) };
      });
    }
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(todayDate.getFullYear(), todayDate.getMonth() - (11 - index), 1);
      const iso = isoDateFromLocalDate(date);
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        label: formatMonthShort(iso),
      };
    });
  })();
  const revenueOverviewRows = revenueOverviewAnchors.map((anchor) => {
    const total = selectedRevenueBookings
      .filter((booking) => {
        const revenueDate = booking.revenueDate ?? booking.checkoutDate;
        return revenueWindow === "All time" ? revenueDate.startsWith(anchor.key) : revenueDate === anchor.key;
      })
      .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0);
    return {
      ...anchor,
      total,
    };
  });
  const revenueOverviewMaxValue = revenueOverviewRows.reduce((max, row) => Math.max(max, row.total), 0);
  const revenueOverviewPath = buildSvgLinePath(
    revenueOverviewRows.map((row) => row.total),
    chartWidth,
    220,
    revenueOverviewMaxValue
  );
  const revenueOverviewCurrentValue = revenueOverviewRows[revenueOverviewRows.length - 1]?.total ?? 0;
  const revenueOverviewPreviousValue = revenueOverviewRows[Math.max(revenueOverviewRows.length - 2, 0)]?.total ?? 0;
  const revenueOverviewTrendPercent =
    revenueOverviewRows.length > 1 && revenueOverviewPreviousValue > 0
      ? ((revenueOverviewCurrentValue - revenueOverviewPreviousValue) / revenueOverviewPreviousValue) * 100
      : 0;
  const channelRevenueBreakdown = [
    {
      label: "Direct",
      amount: directRevenueValue,
      color: "#2563eb",
    },
    {
      label: "Airbnb",
      amount: selectedRevenueBookings
        .filter((booking) => normalizeBookingChannel(booking) === "Airbnb")
        .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0),
      color: "#8b5cf6",
    },
    {
      label: "Booking.com",
      amount: selectedRevenueBookings
        .filter((booking) => normalizeBookingChannel(booking) === "Booking.com")
        .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0),
      color: "#ec4899",
    },
    {
      label: "Agoda",
      amount: selectedRevenueBookings
        .filter((booking) => normalizeBookingChannel(booking) === "Agoda")
        .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0),
      color: "#34d399",
    },
    {
      label: "MakeMyTrip / Goibibo",
      amount: selectedRevenueBookings
        .filter((booking) => {
          const channel = normalizeBookingChannel(booking);
          return channel === "MakeMyTrip" || channel === "Goibibo";
        })
        .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0),
      color: "#818cf8",
    },
  ];
  const donutBase = Math.max(channelRevenueBreakdown.reduce((sum, item) => sum + item.amount, 0), 1);
  const revenueByChannelGradient = (() => {
    let currentOffset = 0;
    const segments = channelRevenueBreakdown.map((item) => {
      const size = (item.amount / donutBase) * 100;
      const segment = `${item.color} ${currentOffset}% ${currentOffset + size}%`;
      currentOffset += size;
      return segment;
    });
    return `conic-gradient(${segments.join(", ")})`;
  })();
  const revenueRecentTransactions = [...selectedRevenueBookings]
    .sort((left, right) => (right.revenueDate ?? right.checkoutDate).localeCompare(left.revenueDate ?? left.checkoutDate))
    .slice(0, 5);
  const reportCards = [
    {
      key: "monthly-revenue",
      title: "Monthly Revenue Report",
      reportType: "Revenue",
      description: "Detailed income summary including room revenue, taxes, fees, and discounts.",
      accent: "green",
      icon: WalletCards,
      formats: ["CSV"],
      latest: formatMonthLong(currentMonthStartIsoDate),
    },
    {
      key: "gst-report",
      title: "GST Report",
      reportType: "Tax & Compliance",
      description: "Comprehensive GST summary for filings and compliance.",
      accent: "purple",
      icon: FileBarChart2,
      formats: ["CSV"],
      latest: formatMonthLong(currentMonthStartIsoDate),
    },
    {
      key: "payout-report",
      title: "Payout Report",
      reportType: "Payout",
      description: "Settlement details, payouts to hosts, and payment transactions.",
      accent: "orange",
      icon: ArrowRightLeft,
      formats: ["CSV"],
      latest: formatMonthLong(currentMonthStartIsoDate),
    },
    {
      key: "booking-summary",
      title: "Booking Summary Report",
      reportType: "Booking",
      description: "Booking volume, revenue, length of stay, and guest insights.",
      accent: "blue",
      icon: BookCheck,
      formats: ["CSV"],
      latest: formatMonthLong(currentMonthStartIsoDate),
    },
    {
      key: "ota-performance",
      title: "OTA Performance Report",
      reportType: "Performance",
      description: "Channel-wise performance, commissions, and revenue share.",
      accent: "sky",
      icon: Activity,
      formats: ["CSV"],
      latest: formatMonthLong(currentMonthStartIsoDate),
    },
    {
      key: "refund-report",
      title: "Cancellation & Refund Report",
      reportType: "Refunds",
      description: "Cancellations, refunds issued, and cancellation reasons.",
      accent: "red",
      icon: RefreshCcw,
      formats: ["CSV"],
      latest: formatMonthLong(currentMonthStartIsoDate),
    },
  ] as const;
  const recentGeneratedReports = generatedReportRows;
  const scheduledReports: Array<{
    name: string;
    frequency: string;
    nextRun: string;
    status: "Active" | "Paused";
    meta: string;
  }> = [];
  const reportInsightsItems = [
    {
      title: "Accounting & Bookkeeping",
      copy: "Track income, expenses and taxes",
      icon: WalletCards,
      accent: "green",
    },
    {
      title: "Tax Filing & Compliance",
      copy: "GST exports for easy filing",
      icon: FileBarChart2,
      accent: "purple",
    },
    {
      title: "OTA Reconciliation",
      copy: "Compare OTA performance and payouts",
      icon: Activity,
      accent: "blue",
    },
    {
      title: "Host Payout Review",
      copy: "Review settlements and payouts",
      icon: ArrowRightLeft,
      accent: "orange",
    },
    {
      title: "Booking Performance",
      copy: "Analyze bookings and guest trends",
      icon: TrendingUp,
      accent: "sky",
    },
  ] as const;
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
  const REPORT_WINDOWS: ReportWindowFilter[] = ["Today", "This week", "This month", "All time"];
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
  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const otaAuthProvider = searchParams.get("otaAuthProvider");
    const otaAuthStatus = searchParams.get("otaAuthStatus");

    if (otaAuthProvider !== "airbnb" || !otaAuthStatus) return;

    setActiveChannelSetup("airbnb");
    setRoomChannelPanelViewByKey((current) => ({
      ...current,
      airbnb: "setup",
    }));
    setRoomChannelSetupDrafts((current) => ({
      ...current,
      airbnb: {
        ...(current.airbnb ?? buildHostChannelSetupDraft("airbnb", channelSetupStatesByKey.airbnb)),
        airbnbAuthorized: otaAuthStatus === "authorized",
      },
    }));
    setRoomChannelFeedbackByKey((current) => ({
      ...current,
      airbnb: {
        type: otaAuthStatus === "authorized" ? "success" : "error",
        text:
          otaAuthStatus === "authorized"
            ? "Airbnb account connected. Preview the property and rooms to continue."
            : "Airbnb authorization did not complete. Try connecting the Airbnb account again.",
      },
    }));
  }, [channelSetupStatesByKey.airbnb]);
  const activeChannelSetupState = activeChannelSetup ? channelSetupStatesByKey[activeChannelSetup] : null;
  useEffect(() => {
    if (!activeChannelSetup) return;
    const initialDraftValue = buildHostChannelSetupDraft(activeChannelSetup, activeChannelSetupState);
    setRoomChannelSetupDrafts((current) => {
      if (current[activeChannelSetup]) return current;
      return {
        ...current,
        [activeChannelSetup]: initialDraftValue,
      };
    });
  }, [activeChannelSetup, activeChannelSetupState]);
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
    const capabilities = getChannelProviderCapabilities(provider.key);
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
    const providerSetupModeLabel =
      capabilities.mode === "self_serve"
        ? "Self-serve"
        : capabilities.mode === "assisted_beta"
          ? "Assisted"
          : capabilities.mode === "feed_only"
            ? "Feed-driven"
            : "Disabled";
    const providerStatusLabel =
      provider.key === "booking" && testSyncModel.status === "ready"
        ? "Sync ready"
        : mappingConfirmed
          ? "Mapping confirmed"
          : providerStructureFound
            ? `${providerSetupModeLabel} ready`
            : hasSavedCredentials
              ? provider.key === "airbnb"
                ? "Authorization required"
                : providerSetupModeLabel === "Self-serve"
                  ? "Self-serve setup started"
                  : providerSetupModeLabel === "Feed-driven"
                    ? "Feed readiness needed"
                    : "Assisted setup needed"
              : readinessModel.setupRowExists && !readinessModel.actuallyConnected
                ? setupState.status === "not_started"
                  ? `${providerSetupModeLabel} setup`
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
            : providerSetupModeLabel,
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
    return {
      room,
      editorHref: `/partnerslogin/home/pro/properties/${encodeURIComponent(familyId)}/rooms/${encodeURIComponent(room.id)}`,
      selected: room.id === selectedRoom?.id,
      famloStatus: room.isActive ? "Active in Famlo" : "Inactive in Famlo",
      summary:
        room.photosCount <= 0
          ? "Add photos to finish your room setup."
          : room.priceFullday <= 0
            ? "Add a room price before you connect channels."
            : room.isActive
              ? "Open the room workspace to edit details and channel mapping."
              : "Reactivate this room before connecting channels.",
    };
  });
  const displayedCalendarRows = useMemo(
    () =>
      calendarRows.map((row) => ({
        ...row,
        availabilityCells: row.availabilityCells.map((cell) => {
          const projectedCell = calendarProjectedCellOverrides[getCalendarCellSyncKey(row.roomId, cell.date)];
          const cellWithProjection =
            projectedCell &&
            !cell.bookingDetail &&
            cell.status !== "past" &&
            cell.status !== "famlo" &&
            cell.status !== "ota" &&
            cell.status !== "pending" &&
            cell.status !== "manual_block" &&
            typeof projectedCell.availableUnits === "number"
              ? {
                  ...cell,
                  status: projectedCell.availableUnits <= 0 ? ("unavailable" as const) : ("available" as const),
                  label:
                    projectedCell.availableUnits <= 0
                      ? projectedCell.stopSell
                        ? "Stop sell"
                        : "Unavailable"
                      : "Available",
                  availableUnits: projectedCell.availableUnits <= 0 ? 0 : projectedCell.availableUnits,
                }
              : cell;
          const override = calendarAvailabilityOverrides[getRoomCalendarAvailabilityOverrideKey(row.roomId, cell.date)];
          return override
            ? {
                ...cellWithProjection,
                status: override,
                label:
                  override === "manual_block"
                    ? "Manual block"
                    : override === "available"
                      ? "Available"
                      : cellWithProjection.label,
                availableUnits:
                  override === "manual_block"
                    ? 0
                    : override === "available"
                      ? Math.max(1, cellWithProjection.availableUnits ?? 1)
                      : cellWithProjection.availableUnits,
              }
            : cellWithProjection;
        }),
        rateCells: row.rateCells.map((cell) => {
          const projectedCell = calendarProjectedCellOverrides[getCalendarCellSyncKey(row.roomId, cell.date)];
          if (!projectedCell || cell.isPast || typeof projectedCell.effectiveRate !== "number" || projectedCell.effectiveRate <= 0) {
            return cell;
          }
          return {
            ...cell,
            amount: projectedCell.effectiveRate,
            displayValue: formatCalendarCurrency(projectedCell.effectiveRate),
            isOverridden: projectedCell.effectiveRate !== cell.baseAmount,
          };
        }),
      })),
    [calendarAvailabilityOverrides, calendarProjectedCellOverrides, calendarRows]
  );
  const filteredCalendarRows = useMemo(() => {
    let nextRows = displayedCalendarRows;
    if (calendarRoomFilter !== "all") {
      nextRows = nextRows.filter((row) => row.roomId === calendarRoomFilter);
    }
    if (calendarRateFilter !== "all") {
      const matchingPlan = calendarRatePlanOptions.find((option) => option.value === calendarRateFilter);
      if (matchingPlan) {
        nextRows = nextRows.filter((row) => row.roomId === matchingPlan.stayUnitId);
      }
    }
    return nextRows;
  }, [calendarRateFilter, calendarRatePlanOptions, calendarRoomFilter, displayedCalendarRows]);
  const bulkCalendarRoomOptions = useMemo(
    () =>
      displayedCalendarRows.map((row) => ({
        value: row.roomId,
        label: row.roomName,
        copy: row.unitType,
      })),
    [displayedCalendarRows]
  );
  const bulkCalendarSearchToken = calendarBulkSearch.trim().toLowerCase();
  const visibleBulkCalendarRoomOptions = useMemo(
    () =>
      bulkCalendarRoomOptions.filter((option) => {
        if (!bulkCalendarSearchToken) return true;
        return `${option.label} ${option.copy}`.toLowerCase().includes(bulkCalendarSearchToken);
      }),
    [bulkCalendarSearchToken, bulkCalendarRoomOptions]
  );
  const visibleBulkCalendarRateOptions = useMemo(
    () =>
      calendarRatePlanOptions.filter((option) => {
        if (!bulkCalendarSearchToken) return true;
        return option.label.toLowerCase().includes(bulkCalendarSearchToken);
      }),
    [bulkCalendarSearchToken, calendarRatePlanOptions]
  );
  const effectiveBulkCalendarRoomIds = useMemo(() => {
    const availableRoomIds = new Set(bulkCalendarRoomOptions.map((option) => option.value));
    const selectedRoomIds =
      calendarBulkSelectedRoomIds.length > 0
        ? calendarBulkSelectedRoomIds.filter((roomId) => availableRoomIds.has(roomId))
        : bulkCalendarRoomOptions.map((option) => option.value);
    const selectedRateRoomIds = new Set(
      calendarRatePlanOptions
        .filter((option) => calendarBulkSelectedRatePlanIds.includes(option.value))
        .map((option) => option.stayUnitId)
        .filter((roomId) => availableRoomIds.has(roomId))
    );

    if (selectedRateRoomIds.size === 0) {
      return selectedRoomIds;
    }

    const intersected = selectedRoomIds.filter((roomId) => selectedRateRoomIds.has(roomId));
    return intersected.length > 0 ? intersected : Array.from(selectedRateRoomIds);
  }, [bulkCalendarRoomOptions, calendarBulkSelectedRatePlanIds, calendarBulkSelectedRoomIds, calendarRatePlanOptions]);
  const visibleCalendarRowKinds = useMemo(
    () => calendarRowKindsForView(calendarRestrictionView),
    [calendarRestrictionView]
  );
  const selectedCalendarRatePlanLabel =
    calendarRateFilter === "all"
      ? "All rate plans"
      : calendarRatePlanOptions.find((option) => option.value === calendarRateFilter)?.label ?? "Selected rate plan";
  useEffect(() => {
    return () => {
      if (calendarSyncTimeoutRef.current != null && typeof window !== "undefined") {
        window.clearTimeout(calendarSyncTimeoutRef.current);
      }
    };
  }, []);
  useEffect(() => {
    if (embeddedAppView || activeSection !== "inventory-calendar") return;
    runVisibleCalendarSync("background_open");
  }, [activeSection, calendarWindow.endDate, calendarWindow.startDate, embeddedAppView, filteredCalendarRows, familyId]);
  useEffect(() => {
    if (embeddedAppView || activeSection !== "inventory-calendar") return;
    const interval = window.setInterval(() => {
      runVisibleCalendarSync("poll");
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [activeSection, calendarWindow.endDate, calendarWindow.startDate, embeddedAppView, filteredCalendarRows, familyId]);
  const calendarNavigationLabel = formatLongDate(calendarWindow.startDate);
  const highlightedCalendarDates = useMemo<Record<string, true>>(() => {
    const highlighted: Record<string, true> = {};
    if (selectedCalendarRateCell) {
      enumerateInclusiveCalendarDates(selectedCalendarRateCell.dateFrom, selectedCalendarRateCell.dateTo).forEach((date) => {
        highlighted[date] = true;
      });
    }
    if (calendarActionDate) highlighted[calendarActionDate] = true;
    if (calendarRateActionDate) highlighted[calendarRateActionDate] = true;
    return highlighted;
  }, [selectedCalendarRateCell, calendarActionDate, calendarRateActionDate]);
  const calendarSyncDisplay = buildHostCalendarSyncDisplay({
    metadata: calendarSyncState,
    isBackgroundSyncRunning: calendarSyncRequestState.phase === "syncing",
    isBackgroundSyncTimedOut: calendarSyncRequestState.phase === "timed_out",
    timeAnchor,
  });
  const isCalendarWorkspacePending = isPropertySwitchPending || isCalendarJumpPending || isCalendarReloadPending;
  const isCalendarWorkspaceReady =
    calendarWorkspaceStatus.selectedFamilyLoaded &&
    calendarWorkspaceStatus.selectedPropertyLoaded &&
    calendarWorkspaceStatus.roomsLoaded &&
    calendarWorkspaceStatus.bookingsLoaded &&
    calendarWorkspaceStatus.blockedDatesLoaded &&
    calendarWorkspaceStatus.channelMappingsLoaded &&
    !calendarWorkspaceStatus.errorMessage;

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!calendarWorkspaceStatus.errorMessage || calendarWorkspaceStatus.errorSources.length === 0) return;
    console.warn("[famlo-pro-calendar] workspace load failed", {
      familyId,
      startDate: calendarWindow.startDate,
      endDate: calendarWindow.endDate,
      sources: calendarWorkspaceStatus.errorSources,
      message: calendarWorkspaceStatus.errorMessage,
    });
  }, [
    calendarWorkspaceStatus.errorMessage,
    calendarWorkspaceStatus.errorSources,
    calendarWindow.endDate,
    calendarWindow.startDate,
    familyId,
  ]);
  const selectedRoomCalendarRow = displayedCalendarRows.find((row) => row.roomId === selectedRoom?.id) ?? null;
  const selectedRoomConflictCount = selectedRoom
    ? conflictItems.filter((item) => item.relatedLabel === selectedRoom.name).length
    : 0;
  const selectedRoomCalendarHealthy = Boolean(selectedRoom && selectedRoomCalendarRow);
  const roomEditorMode = roomRouteState?.mode ?? null;
  const roomEditorRoom = roomEditorMode === "edit" ? selectedRoom : null;
  const roomEditorDisplayName =
    roomEditorMode === "create" ? "Create room" : roomEditorRoom?.name ?? "Select a room";
  const roomEditorBasePriceLabel =
    roomEditorMode === "create"
      ? "Set after saving"
      : roomEditorRoom && roomEditorRoom.priceFullday > 0
        ? formatCurrency(roomEditorRoom.priceFullday)
        : "Price missing";
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
  const selectedRoomMappingRow = roomEditorRoom
    ? roomMappingRows.find((row) => row.room.id === roomEditorRoom.id) ?? null
    : null;
  const selectedRoomRateMappingRow = roomEditorRoom
    ? rateMappingRows.find((row) => row.room.id === roomEditorRoom.id) ?? null
    : null;
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
  const selectedRoomSyncLogs = roomEditorRoom
    ? channelFoundation.syncLogs.filter((log) => {
        const payload = asObject(log.payload) ?? {};
        const scopedRoomId =
          typeof payload.stay_unit_id === "string"
            ? payload.stay_unit_id
            : typeof payload.room_id === "string"
              ? payload.room_id
              : null;
        return scopedRoomId === roomEditorRoom.id;
      }).slice(0, 3)
    : [];
  const firstConnectedRoomProvider =
    CHANNEL_PROVIDER_REGISTRY.find((provider) =>
      readHostChannelConnected(provider.key, channelSetupStatesByKey[provider.key], currentChannelAttached)
    )?.key ?? null;
  const roomEditorActiveProviderKey = activeChannelSetup ?? firstConnectedRoomProvider ?? "booking";
  const roomEditorActiveProvider = getChannelProviderDefinition(roomEditorActiveProviderKey);
  const roomEditorActiveProviderState = channelSetupStatesByKey[roomEditorActiveProviderKey];
  const roomEditorActiveProviderCapabilities = getChannelProviderCapabilities(roomEditorActiveProviderKey);
  const roomEditorActiveProviderCard = channelProviderCards.find((card) => card.key === roomEditorActiveProviderKey) ?? null;
  const roomEditorActiveProviderDraft =
    roomChannelSetupDrafts[roomEditorActiveProviderKey] ?? buildHostChannelSetupDraft(roomEditorActiveProviderKey, roomEditorActiveProviderState);
  const roomEditorActivePreview = roomChannelPreviewByKey[roomEditorActiveProviderKey] ?? null;
  const selectedChannelConfirmationChecked = roomEditorActiveProviderDraft.channexConfirmed;
  const selectedChannelConfirmationLabel = getChannelManagerConfirmationLabel(roomEditorActiveProviderKey);
  const selectedRoomChannelConnected = readHostChannelConnected(
    roomEditorActiveProviderKey,
    roomEditorActiveProviderState,
    currentChannelAttached
  );
  const roomEditorCalendarReady =
    selectedRoomChannelConnected &&
    selectedRoomHasRoomMapping &&
    selectedRoomHasRateMapping &&
    selectedRoomConflictCount === 0;
  const roomEditorCanRunSync = canRunHostChannelSync({
    connected: selectedRoomChannelConnected,
    roomMatched: selectedRoomHasRoomMapping,
    rateMatched: selectedRoomHasRateMapping,
    calendarReady: roomEditorCalendarReady,
    supportsSelectedPropertySyncTest: roomEditorActiveProviderCapabilities.supportsSelectedPropertySyncTest,
  });
  const roomEditorHostChannelCards = OTA_CONNECT_CONFIGS.map((otaConfig) => {
    const provider = getChannelProviderDefinition(otaConfig.providerKey);
    const state = channelSetupStatesByKey[otaConfig.providerKey];
    const capabilities = getChannelProviderCapabilities(otaConfig.providerKey);
    const setupStarted = state.status !== "not_started";
    const connected = readHostChannelConnected(otaConfig.providerKey, state, currentChannelAttached);
    const hostCardState = resolveHostChannelCardState({
      providerKey: otaConfig.providerKey,
      setupStarted,
      connected,
      roomMatched: selectedRoomHasRoomMapping,
      rateMatched: selectedRoomHasRateMapping,
      syncReady: roomEditorCalendarReady,
      providerMode: capabilities.mode,
    });
    return {
      otaConfig,
      provider,
      state,
      capabilities,
      hostCardState,
    };
  });
  const otaReadinessAudit = CHANNEL_PROVIDER_REGISTRY.map((provider) => ({
    providerKey: provider.key,
    providerName: provider.displayName,
    readiness: classifyOtaReadiness({
      providerMode: getChannelProviderCapabilities(provider.key).mode,
      supportsRoomMatching: provider.supportsRoomMatching,
      supportsPriceMatching: provider.supportsPriceMatching,
      supportsAriSync: getChannelProviderCapabilities(provider.key).supportsAriSync,
      supportsSelectedPropertySyncTest: getChannelProviderCapabilities(provider.key).supportsSelectedPropertySyncTest,
      supportsGoLiveReadiness: getChannelProviderCapabilities(provider.key).supportsGoLiveReadiness,
      supportsAutoActivation: getChannelProviderCapabilities(provider.key).supportsAutoActivation,
    }),
  }));
  const roomEditorActivePanelView =
    roomChannelPanelViewByKey[roomEditorActiveProviderKey] ??
    (selectedRoomChannelConnected ? "summary" : roomEditorActivePreview ? "preview" : "setup");
  const roomEditorPendingState = roomChannelPendingByKey[roomEditorActiveProviderKey] ?? null;
  const roomEditorChannelFeedback = roomChannelFeedbackByKey[roomEditorActiveProviderKey] ?? null;
  const roomEditorPreviewAccepted = roomChannelPreviewAcceptedByKey[roomEditorActiveProviderKey] === true;
  const roomEditorLastSyncLog = selectedRoomSyncLogs[0] ?? null;
  const roomEditorActiveFieldLabels = resolveHostChannelFieldLabels(roomEditorActiveProviderKey);
  const roomEditorActiveOtaId = mapProviderKeyToOtaConnectId(roomEditorActiveProviderKey);
  const roomEditorActiveOtaConfig = roomEditorActiveOtaId ? getOtaConnectConfig(roomEditorActiveOtaId) : null;
  const roomEditorIssueCards = buildHostRoomIssueCards({
    roomInactive: Boolean(roomEditorRoom && !roomEditorRoom.isActive),
    photosMissing: Boolean(roomEditorRoom && roomEditorRoom.photosCount <= 0),
    basePriceMissing: Boolean(roomEditorRoom && roomEditorRoom.priceFullday <= 0),
    channelConnected: selectedRoomChannelConnected,
    channelConfirmationMissing: selectedChannelConfirmationLabel != null && !selectedChannelConfirmationChecked,
    roomMatched: selectedRoomHasRoomMapping,
    rateMatched: selectedRoomHasRateMapping,
    calendarReady: roomEditorCalendarReady,
    lastSyncFailed: selectedRoomSyncLogs.some((log) => log.status === "failed"),
    channelSetupIncomplete: roomEditorActiveProviderState.status !== "not_started" && !selectedRoomChannelConnected,
  });
  const roomEditorSyncHealthRows = roomEditorHostChannelCards.map(({ provider, state, capabilities, hostCardState }) => {
    const providerSyncJobs = channelFoundation.syncJobs.filter((job) => job.providerCode === provider.key);
    const pendingJobs = providerSyncJobs.filter((job) => ["queued", "running", "retrying"].includes(job.status)).length;
    const failedJobs = providerSyncJobs.filter((job) => ["failed", "dead_lettered"].includes(job.status)).length;
    const latestSuccessfulLog = channelFoundation.syncLogs.find(
      (log) => log.providerCode === provider.key && log.status === "success"
    ) ?? null;
    const latestRelevantLog = channelFoundation.syncLogs.find((log) => log.providerCode === provider.key) ?? null;
    const latestJob = providerSyncJobs[0] ?? null;
    const setupLabel =
      capabilities.mode === "self_serve"
        ? "Self-serve"
        : capabilities.mode === "assisted_beta"
          ? "Assisted"
          : "Feed-driven";
    const connected = readHostChannelConnected(provider.key, state, currentChannelAttached);
    const lastSyncLabel = latestSuccessfulLog?.createdAt
      ? formatDateTime(latestSuccessfulLog.createdAt)
      : latestRelevantLog?.createdAt
        ? formatDateTime(latestRelevantLog.createdAt)
        : latestJob?.updatedAt
          ? formatDateTime(latestJob.updatedAt)
          : "Not run";
    const pendingJobsLabel = pendingJobs > 0 ? `${pendingJobs} pending` : "None pending";
    const failedJobsLabel = failedJobs > 0 ? `${failedJobs} failed` : "None failed";
    const retryableLabel =
      failedJobs > 0
        ? "Request review available"
        : pendingJobs > 0
          ? "Sync queued"
          : connected
            ? "Healthy"
            : setupLabel;
    const friendlyIssueMessage = !connected
      ? setupLabel === "Self-serve"
        ? "Open Channels to finish the self-serve setup."
        : setupLabel === "Assisted"
          ? "Assisted setup is required. Open Channels to continue."
          : "Feed-driven setup is not ready yet."
      : failedJobs > 0
        ? !selectedRoomHasRateMapping
          ? "Rate plan mapping is missing. Open Room & Price Matching."
          : !selectedRoomHasRoomMapping
            ? "Room mapping is missing. Open Room & Price Matching."
            : "The latest sync needs review. Request a provider review from sync health."
        : pendingJobs > 0
          ? "A sync job is already queued. Famlo will finish the worker pass first."
          : latestSuccessfulLog
            ? "Latest sync completed successfully."
            : "Ready for the next sync.";
    const action =
      failedJobs > 0 && connected
        ? {
            label: providerReviewPendingKey === provider.key ? "Requesting..." : "Request review",
            kind: "review" as const,
          }
        : !connected
          ? { label: "Open Channels", kind: "channels" as const }
          : !selectedRoomHasRoomMapping || !selectedRoomHasRateMapping
            ? { label: "Open Room & Price Matching", kind: "mapping" as const }
            : null;

    return {
      provider,
      capabilityLabel: capabilities.displayStatus,
      setupLabel,
      connected,
      lastSyncLabel,
      pendingJobsLabel,
      failedJobsLabel,
      retryableLabel,
      friendlyIssueMessage,
      action,
      hostCardState,
    };
  });
  const updateRoomChannelDraft = (
    providerKey: ChannelProviderKey,
    patch: Partial<HostChannelSetupDraft>
  ): void => {
    setRoomChannelSetupDrafts((current) => ({
      ...current,
      [providerKey]: {
        ...(current[providerKey] ?? buildHostChannelSetupDraft(providerKey, channelSetupStatesByKey[providerKey])),
        ...patch,
      },
    }));
  };
  const setRoomChannelFeedback = (
    providerKey: ChannelProviderKey,
    feedback: { type: "success" | "error"; text: string } | null
  ): void => {
    setRoomChannelFeedbackByKey((current) => {
      if (!feedback) {
        const next = { ...current };
        delete next[providerKey];
        return next;
      }
      return { ...current, [providerKey]: feedback };
    });
  };
  const persistRoomChannelConfirmation = async (
    providerKey: ChannelProviderKey,
    confirmed: boolean
  ): Promise<void> => {
    const metadataPatch =
      providerKey === "booking"
        ? {
          booking_extranet_request_acknowledged: confirmed,
          connectivity_provider_requested: confirmed,
          connectivity_provider_requested_at: confirmed ? new Date().toISOString() : null,
        }
        : {
          provider_extranet_request_acknowledged: confirmed,
        };

    const response = await fetch("/api/host/pro/channel/setup", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        familyId,
        providerKey,
        metadataPatch,
      }),
    });

    const payload = (await response.json()) as { state?: ChannelSetupState | null; error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to save the channel confirmation.");
    }

    if (payload.state) {
      setChannelSetupOverrides((current) => ({
        ...current,
        [providerKey]: payload.state ?? undefined,
      }));
    }
  };
  const handlePreviewRoomChannelConnection = (providerKey: ChannelProviderKey): void => {
    if (!roomEditorRoom) return;

    void (async () => {
      const otaId = mapProviderKeyToOtaConnectId(providerKey);
      if (!otaId) return;
      const draft = roomChannelSetupDrafts[providerKey] ?? buildHostChannelSetupDraft(providerKey, channelSetupStatesByKey[providerKey]);
      setRoomChannelPendingByKey((current) => ({ ...current, [providerKey]: "preview" }));
      setRoomChannelPanelViewByKey((current) => ({ ...current, [providerKey]: "setup" }));
      setRoomChannelFeedback(providerKey, null);

      try {
        await persistRoomChannelConfirmation(providerKey, draft.channexConfirmed);

        const response = await fetch("/api/partners/pro/channels/ota/preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            propertyId: familyId,
            roomId: roomEditorRoom.id,
            otaId,
            fields: {
              bookingHotelId: draft.bookingHotelId,
              bookingPropertyCode: draft.bookingPropertyCode,
              providerListingId: draft.providerListingId,
              providerPropertyCode: draft.providerPropertyCode,
              providerListingUrl: draft.providerListingUrl,
              providerAccessToken: draft.providerAccessToken,
              channelManagerConfirmed: draft.channexConfirmed ? "yes" : "",
            },
          }),
        });

        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          previewId?: string | null;
          preview?: {
            propertyName?: string | null;
            propertyReference?: string | null;
            roomList?: Array<{ title?: string }>;
            ratePlans?: Array<{ title?: string }>;
            suggestedFamloRoomMapping?: string | null;
            suggestedOtaRoomMapping?: string | null;
            suggestedOtaRatePlanMapping?: string | null;
            warnings?: string[];
          } | null;
        };

        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error ?? "Unable to preview the OTA connection.");
        }
        setRoomChannelPreviewByKey((current) => ({
          ...current,
          [providerKey]: {
            previewId: payload.previewId ?? null,
            mode: "preview",
            message: "Preview ready. Review the OTA property, room, and rate plan before sync starts.",
            refreshedAt: null,
            autoApplicableCount: payload.preview?.roomList?.length ?? 0,
            propertyName: payload.preview?.propertyName ?? null,
            propertyReference: payload.preview?.propertyReference ?? null,
            roomList: (payload.preview?.roomList ?? []).map((room) => ({ title: room.title ?? "Unnamed OTA room" })),
            ratePlans: (payload.preview?.ratePlans ?? []).map((ratePlan) => ({ title: ratePlan.title ?? "Unnamed OTA rate plan" })),
            selectedRoomSuggestion: {
              roomId: roomEditorRoom.id,
              famloRoomName: payload.preview?.suggestedFamloRoomMapping ?? roomEditorRoom.name,
              suggestedRoomTypeTitle: payload.preview?.suggestedOtaRoomMapping ?? null,
              suggestedRatePlanTitle: payload.preview?.suggestedOtaRatePlanMapping ?? null,
              autoApplicable: Boolean(payload.preview?.suggestedOtaRoomMapping || payload.preview?.suggestedOtaRatePlanMapping),
            },
            warnings: payload.preview?.warnings ?? [],
          },
        }));
        setRoomChannelPreviewAcceptedByKey((current) => ({ ...current, [providerKey]: false }));
        setRoomChannelPanelViewByKey((current) => ({ ...current, [providerKey]: "preview" }));
        setRoomChannelFeedback(providerKey, {
          type: "success",
          text: "Preview connection is ready.",
        });
      } catch (error) {
        setRoomChannelFeedback(providerKey, {
          type: "error",
          text: error instanceof Error ? error.message : "Unable to preview the OTA connection.",
        });
      } finally {
        setRoomChannelPendingByKey((current) => ({ ...current, [providerKey]: null }));
      }
    })();
  };
  const handleStartAirbnbAuthorization = (): void => {
    if (!roomEditorRoom) return;

    void (async () => {
      const providerKey: ChannelProviderKey = "airbnb";
      setRoomChannelPendingByKey((current) => ({ ...current, [providerKey]: "authorize" }));
      setRoomChannelFeedback(providerKey, null);

      try {
        const response = await fetch(
          `/api/partners/pro/channels/ota/airbnb/authorize?propertyId=${encodeURIComponent(familyId)}&roomId=${encodeURIComponent(roomEditorRoom.id)}`
        );
        const payload = (await response.json()) as { ok?: boolean; authorizationUrl?: string; error?: string };
        if (!response.ok || payload.ok === false || !payload.authorizationUrl) {
          throw new Error(payload.error ?? "Unable to start Airbnb authorization.");
        }

        updateRoomChannelDraft(providerKey, { airbnbAuthorized: true });
        window.location.assign(payload.authorizationUrl);
      } catch (error) {
        setRoomChannelFeedback(providerKey, {
          type: "error",
          text: error instanceof Error ? error.message : "Unable to start Airbnb authorization.",
        });
      } finally {
        setRoomChannelPendingByKey((current) => ({ ...current, [providerKey]: null }));
      }
    })();
  };
  const handleConnectRoomChannelAndSync = (providerKey: ChannelProviderKey): void => {
    if (!roomEditorRoom) return;

    void (async () => {
      const otaId = mapProviderKeyToOtaConnectId(providerKey);
      if (!otaId) return;
      setRoomChannelPendingByKey((current) => ({ ...current, [providerKey]: "connect" }));
      setRoomChannelFeedback(providerKey, null);

      try {
        const preview = roomChannelPreviewByKey[providerKey] ?? null;
        if (!preview?.previewId) throw new Error("Preview this OTA connection first.");

        setRoomChannelPendingByKey((current) => ({ ...current, [providerKey]: "sync" }));

        const syncResponse = await fetch("/api/partners/pro/channels/ota/confirm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            propertyId: familyId,
            roomId: roomEditorRoom.id,
            otaId,
            previewId: preview.previewId,
            mappings: {
              externalRoomTypeId: preview.selectedRoomSuggestion?.suggestedRoomTypeTitle ? undefined : undefined,
              externalRatePlanId: preview.selectedRoomSuggestion?.suggestedRatePlanTitle ? undefined : undefined,
            },
            confirmationAccepted: true,
          }),
        });
        const syncPayload = (await syncResponse.json()) as { ok?: boolean; error?: string; message?: string; state?: ChannelSetupState | null };
        if (!syncResponse.ok || syncPayload.ok === false) {
          throw new Error(syncPayload.error ?? "Unable to queue the sync.");
        }

        if (syncPayload.state) {
          setChannelSetupOverrides((current) => ({
            ...current,
            [providerKey]: syncPayload.state as never,
          }));
        }

        setRoomChannelPanelViewByKey((current) => ({ ...current, [providerKey]: "summary" }));
        setRoomChannelFeedback(providerKey, {
          type: "success",
          text: syncPayload.message ?? "This OTA is connected. Famlo is now syncing availability, rates, inventory, and bookings for this room.",
        });
        window.setTimeout(() => {
          router.refresh();
        }, 1200);
      } catch (error) {
        setRoomChannelFeedback(providerKey, {
          type: "error",
          text: error instanceof Error ? error.message : "Unable to connect and start sync.",
        });
      } finally {
        setRoomChannelPendingByKey((current) => ({ ...current, [providerKey]: null }));
      }
    })();
  };
  const handleRunRoomChannelSync = (providerKey: ChannelProviderKey): void => {
    if (!roomEditorCanRunSync) return;
    handleConnectRoomChannelAndSync(providerKey);
  };
  const selectedPropertyDisplayLabel = currentPropertyOption
    ? `${currentPropertyOption.name || propertyName}${selectedPropertyLocation ? ` · ${selectedPropertyLocation}` : ""}`
    : `${propertyName}${selectedPropertyLocation ? ` · ${selectedPropertyLocation}` : ""}`;
  const dashboardHostPhoto =
    settingsProfileDraft.hostSelfieUrl.trim() ||
    propertyGallery.find((photo) => photo.isPrimary)?.url ||
    propertyGallery[0]?.url ||
    "";
  const dashboardConnectedChannelNames = CHANNEL_PROVIDER_REGISTRY
    .filter((provider) => provider.key !== "google-hotel")
    .filter((provider) => providerHasRealConnection(provider.key))
    .map((provider) => provider.displayName);
  const nextArrivingBooking =
    [...upcomingConfirmedBookings].sort((left, right) => left.startDate.localeCompare(right.startDate))[0] ?? null;
  const dashboardRoomShowcaseRows = roomMappingRows
    .filter((row) => row.room.id !== "placeholder")
    .slice(0, 4)
    .map((row) => ({
      ...row,
      displayRoomType: labelizeToken(row.room.unitType, "Stay unit"),
      connectedChannels: row.mapping?.externalRoomTypeId
        ? dashboardConnectedChannelNames.length > 0
          ? dashboardConnectedChannelNames
          : ["Channex"]
        : [],
    }));
  const dashboardGalleryItems = propertyGallery
    .filter((photo) => photo.url !== dashboardHostPhoto)
    .slice(0, 5);
  const fallbackDashboardReelUrl = propertyContent.hostReelPublicUrl || initialPropertyContent.hostReelPublicUrl || "";
  const dashboardReelItems =
    dashboardReels.length > 0
      ? dashboardReels
      : fallbackDashboardReelUrl
        ? [{
            id: "legacy-dashboard-reel",
            publicUrl: fallbackDashboardReelUrl,
            storageKey: "",
            mimeType: propertyContent.hostReelMimeType || "video/mp4",
            sizeBytes: propertyContent.hostReelSizeBytes ?? null,
            durationSeconds: null,
            width: null,
            height: null,
            isFeatured: true,
            createdAt: propertyContent.hostReelUploadedAt || new Date().toISOString(),
            updatedAt: propertyContent.hostReelUploadedAt || new Date().toISOString(),
            source: "family_legacy_reel" as const,
          }]
        : [];
  const tomorrowIsoDate = addDaysToDateString(todayIsoDate, 1);
  const previousMonthDate = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1);
  const previousMonthPrefix = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const dashboardCheckInCount = proBookings.filter(
    (booking) => isConfirmedBooking(booking) && !isCancelledBooking(booking) && (booking.startDate === todayIsoDate || booking.startDate === tomorrowIsoDate)
  ).length;
  const dashboardCheckOutCount = proBookings.filter(
    (booking) => isConfirmedBooking(booking) && !isCancelledBooking(booking) && (booking.checkoutDate === todayIsoDate || booking.checkoutDate === tomorrowIsoDate)
  ).length;
  const previousMonthRevenueValue = completedRevenueBookings
    .filter((booking) => (booking.revenueDate ?? booking.checkoutDate).startsWith(previousMonthPrefix))
    .reduce((sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0), 0);
  const dashboardRevenueTrendPercent =
    previousMonthRevenueValue > 0
      ? ((thisMonthRevenueValue - previousMonthRevenueValue) / previousMonthRevenueValue) * 100
      : thisMonthRevenueValue > 0
        ? 100
        : 0;
  const pendingPaymentBookings = proBookings.filter((booking) => !isCancelledBooking(booking) && hasPaymentAttention(booking));
  const pendingPaymentAmount = pendingPaymentBookings.reduce(
    (sum, booking) => sum + (booking.amountValue ?? parseBookingAmount(booking.amount) ?? 0),
    0
  );
  const dashboardRecentBookings = [...proBookings]
    .filter((booking) => !booking.isReviewOnly)
    .sort((left, right) => (right.createdAt ?? right.startDate).localeCompare(left.createdAt ?? left.startDate))
    .slice(0, 6);
  const dashboardRoomStatusRows = rooms
    .filter((room) => room.id !== "placeholder")
    .slice(0, 4)
    .map((room) => {
      const bookedNights = proBookings
        .filter((booking) => booking.roomId === room.id && !isCancelledBooking(booking) && isConfirmedBooking(booking))
        .reduce(
          (sum, booking) =>
            sum +
            countOverlappingNights(
              booking.startDate,
              booking.checkoutDate,
              currentMonthStartIsoDate,
              currentMonthEndExclusiveIsoDate
            ),
          0
        );
      const occupiedToday = proBookings.some(
        (booking) =>
          booking.roomId === room.id &&
          !isCancelledBooking(booking) &&
          isConfirmedBooking(booking) &&
          booking.startDate <= todayIsoDate &&
          booking.checkoutDate > todayIsoDate
      );
      return {
        room,
        bookedNights,
        occupiedToday,
      };
    });
  const dashboardUpcomingStayCards = Array.from({ length: 7 }, (_, index) => {
    const date = addDaysToDateString(todayIsoDate, index);
    return {
      date,
      dayLabel: formatWeekdayShort(date),
      dateLabel: formatShortDate(date).split(" ").join(" "),
      count: upcomingConfirmedBookings.filter((booking) => booking.startDate === date).length,
    };
  });
  const dashboardUpcomingStaysTotal = dashboardUpcomingStayCards.reduce((sum, item) => sum + item.count, 0);
  const dashboardUpcomingRangeLabel = `${formatShortDate(todayIsoDate)} - ${formatShortDate(addDaysToDateString(todayIsoDate, 6))}`;
  const dashboardMessageRows = dashboardConversationRows.slice(0, 3);
  const dashboardRecentBookingsViewHref = `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(familyId)}&section=bookings`;
  const dashboardMessagesViewHref = `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(familyId)}&section=messages-reviews`;
  const dashboardReportViewHref = `/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(familyId)}&section=reports`;
  const dashboardQuickActionAddRoomHref = `/partnerslogin/home/pro/properties/${encodeURIComponent(familyId)}/rooms/new`;
  const dashboardQuickActions = [
    {
      label: "Add Booking",
      icon: Plus,
      onClick: () => setIsDashboardBookingModalOpen(true),
      disabled: rooms.length === 0,
    },
    {
      label: "Block Dates",
      icon: CalendarDays,
      onClick: () => setActiveSectionWithUrl("inventory-calendar"),
      disabled: false,
    },
    {
      label: "Add Room",
      icon: Building2,
      onClick: () => router.push(dashboardQuickActionAddRoomHref),
      disabled: false,
    },
    {
      label: "Open Calendar",
      icon: CalendarDays,
      onClick: () => setActiveSectionWithUrl("inventory-calendar"),
      disabled: false,
    },
    {
      label: "Message Guests",
      icon: MessageSquareMore,
      onClick: () => setActiveSectionWithUrl("messages-reviews"),
      disabled: false,
    },
    {
      label: "View Reports",
      icon: FileBarChart2,
      onClick: () => setActiveSectionWithUrl("reports"),
      disabled: false,
    },
  ] as const;
  const dashboardRevenueYAxisMax = Math.max(75_000, Math.ceil(Math.max(revenueOverviewMaxValue, 1) / 25_000) * 25_000);
  const dashboardRevenueYAxisTicks = [0, dashboardRevenueYAxisMax / 3, (dashboardRevenueYAxisMax / 3) * 2, dashboardRevenueYAxisMax].map((value) =>
    Math.round(value / 1000) * 1000
  );
  const dashboardChannelHealthRows = [
    {
      label: "Booking.com",
      marker: "B",
      connected: providerHasRealConnection("booking"),
      status: providerHasRealConnection("booking")
        ? ariHealth.status === "healthy"
          ? "Healthy"
          : "Review"
        : "Not connected",
      lastSynced: ariHealth.lastAriSyncAt,
    },
    {
      label: "Airbnb",
      marker: "A",
      connected: providerHasRealConnection("airbnb"),
      status: providerHasRealConnection("airbnb") ? "Healthy" : "Not connected",
      lastSynced: providerHasRealConnection("airbnb") ? calendarSyncState.lastSyncedAt : null,
    },
    {
      label: "Agoda",
      marker: "AG",
      connected: providerHasRealConnection("agoda"),
      status: providerHasRealConnection("agoda") ? "Healthy" : "Not connected",
      lastSynced: providerHasRealConnection("agoda") ? calendarSyncState.lastSyncedAt : null,
    },
    {
      label: "Goibibo / Channex",
      marker: "GI",
      connected: providerHasRealConnection("mmt") || headerChannexStatus === "connected",
      status: providerHasRealConnection("mmt") || headerChannexStatus === "connected" ? "Healthy" : "Not connected",
      lastSynced: providerHasRealConnection("mmt") || headerChannexStatus === "connected" ? (calendarSyncState.lastSyncedAt ?? ariHealth.lastAriSyncAt) : null,
    },
  ];
  const dashboardHealthyChannelCount = dashboardChannelHealthRows.filter((row) => row.status === "Healthy").length;
  const isDashboardWorkspace = activeSection === "dashboard" && !roomRouteState;
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
      body: "Review booking mix, room activity, and real exportable report data.",
      badge: `${activeRoomsCount} active rooms`,
      targetSection: "reports" as const,
    },
  ];
  const effectiveAppearanceIsLight = appearanceMode === "light";
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
      statusLabel: "Available",
      statusClass: styles.readinessPillOk,
      detail: "Revenue and report exports use current booking, payout, invoice, and channel records where they exist.",
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
    <div className={`${styles.shell} ${effectiveAppearanceIsLight ? styles.shellLight : ""} ${isDashboardWorkspace ? styles.dashboardWorkspaceShell : ""} ${embeddedAppView ? styles.embeddedAppShell : ""}`}>
      {!embeddedAppView ? <ProDashboardMetricsBeacon metrics={dashboardLoadMetrics} /> : null}
      {!embeddedAppView ? (
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
        </div>
        <div className={styles.navGroup}>
          <div className={styles.navGroupLabel}>Workspace</div>
          {TOP_LEVEL_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTopLevel === item.id;
            const urgentSupportItem = item.id === "support" && supportBillingUrgent;
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.navButton} ${active ? styles.navButtonActive : ""} ${urgentSupportItem ? styles.navButtonUrgent : ""} ${urgentSupportItem && active ? styles.navButtonUrgentActive : ""}`}
                onClick={() => {
                  if (item.id === "properties") {
                    setActiveSectionWithUrl("properties-home");
                    if (typeof window !== "undefined") {
                      window.setTimeout(() => {
                        router.replace(simplePropertiesHref);
                      }, 0);
                    }
                    return;
                  }
                  setActiveSectionWithUrl(resolveTopLevelDefaultSection(item.id, activeSection));
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
        <div className={styles.sidebarFooter} ref={sidebarHostMenuRef}>
          <button
            type="button"
            className={styles.sidebarHostButton}
            onClick={() => setIsSidebarHostMenuOpen((current) => !current)}
            aria-expanded={isSidebarHostMenuOpen}
            aria-haspopup="menu"
          >
            <span className={styles.sidebarHostAvatar}>{hostProfileInitials}</span>
            <span className={styles.sidebarHostMeta}>
              <span className={styles.sidebarHostName}>{hostDisplayName || "Host"}</span>
              <span className={styles.sidebarHostSubcopy}>{hostProfileEmail || "Famlo Pro host workspace"}</span>
            </span>
            <ChevronDown
              size={16}
              className={`${styles.sidebarHostChevron} ${isSidebarHostMenuOpen ? styles.sidebarHostChevronOpen : ""}`}
            />
          </button>
          {isSidebarHostMenuOpen ? (
            <div className={styles.sidebarHostMenu} role="menu" aria-label="Host profile actions">
              <button
                type="button"
                className={styles.sidebarHostMenuItem}
                onClick={() => {
                  setIsSidebarHostMenuOpen(false);
                  setActiveSectionWithUrl("host-profile");
                }}
              >
                Edit Host Profile
              </button>
              <button
                type="button"
                className={styles.sidebarHostMenuItem}
                onClick={() => {
                  setIsSidebarHostMenuOpen(false);
                  setActiveSectionWithUrl("documents");
                }}
              >
                Edit Documents
              </button>
              <button
                type="button"
                className={styles.sidebarHostMenuItem}
                onClick={() => {
                  setIsSidebarHostMenuOpen(false);
                  setActiveSectionWithUrl("host-profile");
                }}
              >
                Edit Host Gallery &amp; Images
              </button>
            </div>
          ) : null}
        </div>
      </aside>
      ) : null}

      <main className={`${styles.main} ${isRevenueReportWorkspace ? styles.revenueReportMain : ""} ${isDashboardWorkspace ? styles.dashboardWorkspaceMain : ""} ${embeddedAppView ? styles.embeddedAppMain : ""}`}>
        {!embeddedAppView ? (
        <header className={`${styles.header} ${isRevenueReportWorkspace ? styles.revenueReportHeader : ""} ${isDashboardWorkspace ? styles.dashboardWorkspaceHeader : ""}`}>
          <div className={isDashboardWorkspace ? styles.dashboardWorkspaceHeaderInfo : undefined}>
            <div className={isDashboardWorkspace ? styles.dashboardWorkspaceHeaderTitleRow : undefined}>
              <h1 className={styles.headerTitle}>{hostDisplayName || propertyName}</h1>
              {isDashboardWorkspace ? (
                <button
                  type="button"
                  className={styles.dashboardWorkspaceHeaderSwitch}
                  onClick={() => setActiveSectionWithUrl("properties-home")}
                  title="Open property workspace"
                >
                  <ChevronDown size={16} />
                </button>
              ) : null}
            </div>
            <p className={styles.headerCopy}>
              {locationLabel} · Famlo Pro property workspace
            </p>
          </div>

          <div className={styles.headerActions}>
            <span
              className={`${styles.chip} ${
                headerChannexStatus === "checking"
                  ? styles.chipChecking
                  : headerChannexStatus === "connected"
                    ? styles.chipSuccess
                    : styles.chipDanger
              }`}
              title="Auto-checks Channex every 30 seconds"
            >
              {headerChannexStatus === "checking" ? (
                <RefreshCcw size={14} className={styles.chipSpinner} />
              ) : (
                <Link2 size={14} />
              )}
              {headerChannexStatus === "checking"
                ? "Checking..."
                : headerChannexStatus === "connected"
                  ? "Connected"
                  : "Not connected"}
            </span>
            <span className={`${styles.chip} ${styles.chipPrimary}`}>
              <Sparkles size={14} />
              {entitlementLabel}
            </span>
            <div className={styles.headerThemeToggle} role="group" aria-label="Appearance mode">
              <button
                type="button"
                className={`${styles.headerThemeButton} ${appearanceMode === "light" ? styles.headerThemeButtonActive : ""}`}
                onClick={() => updateAppearanceMode("light")}
                aria-pressed={appearanceMode === "light"}
                title="Day mode"
                aria-label="Light mode"
              >
                <span aria-hidden="true">☀</span>
              </button>
              <button
                type="button"
                className={`${styles.headerThemeButton} ${appearanceMode === "dark" ? styles.headerThemeButtonActive : ""}`}
                onClick={() => updateAppearanceMode("dark")}
                aria-pressed={appearanceMode === "dark"}
                title="Night mode"
                aria-label="Dark mode"
              >
                <span aria-hidden="true">☾</span>
              </button>
            </div>
          </div>
        </header>
        ) : null}

        <div className={`${styles.content} ${isPropertiesHomeView ? styles.propertiesHomeContent : ""} ${activeSection === "bookings" ? styles.bookingsWorkspaceContent : ""} ${isRevenueReportWorkspace ? styles.revenueReportContent : ""} ${isDashboardWorkspace ? styles.dashboardWorkspaceContent : ""} ${embeddedAppView ? styles.embeddedAppContent : ""}`}>
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
                        switchPropertyContext(event.target.value, { section: activeSection });
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
                  <article
                    key={item.room.id}
                    className={`${styles.propertyRoomShowcaseCard} ${styles.propertyRoomShowcaseCardStatic} ${item.selected && roomEditorMode === "edit" ? styles.propertyRoomShowcaseCardActive : ""}`}
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
                        <div className={styles.propertyRoomShowcaseTitle}>{item.room.name || "Room"}</div>
                        <div className={styles.propertyRoomShowcasePrice}>
                          {item.room.priceFullday > 0 ? formatCurrency(item.room.priceFullday) : "Price pending"}
                        </div>
                      </div>
                    </div>

                    <div className={styles.propertyRoomShowcaseBody}>
                      <div className={styles.propertyRoomShowcaseMeta}>
                        <div className={styles.propertyRoomShowcaseMetaLabel}>Room status</div>
                        <div className={styles.propertyRoomShowcaseMetaValue}>{item.famloStatus}</div>
                      </div>

                      <div className={styles.propertyRoomShowcaseFooter}>
                        <span className={styles.propertyRoomStatusText}>{item.famloStatus}</span>
                        <Link href={item.editorHref} className={styles.propertyRoomShowcaseAction}>
                          Edit and connect
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}

                <Link
                  href={`/partnerslogin/home/pro/properties/${encodeURIComponent(familyId)}/rooms/new`}
                  className={`${styles.propertyRoomShowcaseCard} ${styles.addRoomShowcaseCard}`}
                >
                  <div className={styles.addRoomShowcaseBody}>
                    <span className={styles.addRoomShowcaseIcon}>
                      <Plus size={36} />
                    </span>
                    <span className={styles.addRoomShowcaseTitle}>Add Room</span>
                    <span className={styles.addRoomShowcaseCopy}>Create a new room inside this property.</span>
                  </div>
                </Link>
              </div>

              <article className={styles.propertyCenterHintCard}>
                <div className={styles.listTitle}>Choose a room to manage</div>
                <div className={styles.cardCopy}>
                  Use the Edit and connect button to open a separate Pro room page. The room page contains Details, Pricing, Calendar,
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
                      onClick={() => setActiveSectionWithUrl(item.id)}
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
                </div>

                <Link
                  href={simplePropertiesHref}
                  className={styles.roomControlBackLink}
                >
                  Back to Properties
                </Link>
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
                {roomEditorTab === "details" || roomEditorTab === "pricing" ? (
                  <HostRoomsManager
                    familyId={familyId}
                    homeLat={propertyHomeLat ?? undefined}
                    homeLng={propertyHomeLng ?? undefined}
                    title={
                      roomEditorTab === "pricing"
                        ? "Edit Room Pricing"
                        : roomEditorMode === "create"
                          ? "Create Room"
                          : "Edit Room"
                    }
                    description={
                      roomEditorTab === "pricing"
                        ? roomEditorMode === "create"
                          ? "Finish the room draft and set Famlo room pricing here. Currently this edits Famlo room price. OTA/channel-wise pricing will work only after that channel is connected and pricing sync is enabled."
                          : "Edit Famlo room pricing on this page using the existing room save flow. Currently this edits Famlo room price. OTA/channel-wise pricing will work only after that channel is connected and pricing sync is enabled."
                        : roomEditorMode === "create"
                          ? "Create a room for this selected property. Details, photos, amenities, and room identity can all be managed here."
                          : "Edit this room's details and photos on the same page using the existing Famlo room save flow."
                    }
                    propertyLabel={propertyLocalityLabel ?? locationLabel}
                    showChannelManager={false}
                    viewRoomPage
                    emptyTitle="No rooms yet"
                    emptyCopy={
                      roomEditorTab === "pricing"
                        ? "Create the first room for this property before editing pricing."
                        : "Create the first room for this property to start building your Famlo inventory."
                    }
                    selectedRoomId={roomEditorMode === "edit" ? selectedRoomId : null}
                    createMode={roomEditorMode === "create"}
                    compactMode
                    focusSection={roomEditorTab === "pricing" ? "pricing" : "details"}
                    theme="pro-dark"
                    proCreateStatus={famloPlusStatus}
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
                                {isBusy ? "..." : cell.status === "past" ? "—" : String(cell.availableUnits ?? 0)}
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
                    </div>
                  </article>
                ) : null}

                {roomEditorTab === "channels" ? (
                  <article className={`${styles.roomControlPlaceholder} ${styles.roomMainGlassPanel}`}>
                    <div className={styles.roomMainGlassPanelHeader}>
                      <div className={styles.placeholderTitle}>Connect this room to OTA</div>
                      <div className={styles.placeholderCopy}>
                        Select the OTA where this room is already listed. Add the required details and Famlo will show a preview before syncing.
                      </div>
                    </div>

                    <div className={styles.roomOtaSelectorRow}>
                      <div className={styles.roomOtaSelectorBar} role="tablist" aria-label="OTA selector">
                        {roomEditorHostChannelCards.map(({ provider, otaConfig }) => (
                          <button
                            key={`room-channel-pill-${provider.key}`}
                            type="button"
                            role="tab"
                            aria-selected={roomEditorActiveProviderKey === provider.key}
                            className={`${styles.roomOtaPill} ${roomEditorActiveProviderKey === provider.key ? styles.roomOtaPillActive : ""}`}
                            onClick={() => setActiveChannelSetup(provider.key)}
                          >
                            {otaConfig.displayName}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className={styles.primaryActionButton}
                        onClick={() => {
                          setActiveChannelSetup(roomEditorActiveProviderKey);
                          setRoomChannelPanelViewByKey((current) => ({
                            ...current,
                            [roomEditorActiveProviderKey]: selectedRoomChannelConnected ? "summary" : "setup",
                          }));
                        }}
                      >
                        Connect
                      </button>
                    </div>

                    {roomEditorChannelFeedback ? (
                      <div className={`${styles.feedbackBox} ${styles.roomInlineFeedback} ${roomEditorChannelFeedback.type === "success" ? styles.feedbackSuccess : styles.feedbackError}`}>
                        {roomEditorChannelFeedback.text}
                      </div>
                    ) : null}

                    {roomEditorMode === "edit" && activeChannelSetup ? (
                      <div className={styles.roomChannelPanel}>
                        <div className={styles.roomChannelPanelHeader}>
                          <div>
                            <div className={styles.listTitle}>{roomEditorActiveProvider.displayName}</div>
                            <div className={styles.placeholderCopy}>
                              {roomEditorActiveProviderCard?.setupModeLabel ?? (roomEditorActiveProviderCapabilities.mode === "self_serve" ? "Self-serve" : "Assisted")} ·{" "}
                              {roomEditorActiveProviderCapabilities.displayStatus}
                            </div>
                            <div className={styles.placeholderCopy}>
                              {roomEditorActivePanelView === "summary"
                                ? `${roomEditorActiveProvider.displayName} is connected for this room.`
                                : roomEditorActivePanelView === "preview"
                                  ? "Famlo found the OTA property and rooms below. Confirm the match before sync starts."
                                  : "Add the required details for this OTA and preview the property before sync starts."}
                            </div>
                          </div>
                        </div>

                        {roomEditorActivePanelView === "setup" ? (
                          <>
                            <div className={styles.roomChannelSetupHeader}>
                              <div className={styles.roomChannelStepLabel}>{roomEditorActiveProvider.displayName}</div>
                              {roomEditorActiveOtaConfig?.instructions[0] ? (
                                <div className={styles.placeholderCopy}>{roomEditorActiveOtaConfig.instructions[0]}</div>
                              ) : null}
                            </div>
                            {roomEditorActiveProviderKey === "airbnb" ? (
                              <div className={styles.roomDarkCard}>
                                <div className={styles.feedTitle}>Authorize Airbnb account</div>
                                <div className={styles.feedCopy}>
                                  Connect the Airbnb account that already lists this room, then Famlo will load the property and rooms for preview.
                                </div>
                                <div className={styles.inlineActionRow}>
                                  <button
                                    type="button"
                                    className={styles.primaryActionButton}
                                    onClick={handleStartAirbnbAuthorization}
                                    disabled={roomEditorPendingState === "authorize"}
                                  >
                                    {roomEditorPendingState === "authorize" ? "Connecting..." : "Connect Airbnb account"}
                                  </button>
                                </div>
                              </div>
                            ) : null}
                            <div className={styles.roomChannelSetupGrid}>
                              {roomEditorActiveProviderKey !== "airbnb" ? (
                                <label className={styles.fieldBlock}>
                                  <span className={styles.fieldLabel}>{roomEditorActiveFieldLabels.primaryLabel}</span>
                                  <input
                                    className={styles.fieldInput}
                                    value={roomEditorActiveProviderKey === "booking" ? roomEditorActiveProviderDraft.bookingHotelId : roomEditorActiveProviderDraft.providerListingId}
                                    onChange={(event) =>
                                      updateRoomChannelDraft(
                                        roomEditorActiveProviderKey,
                                        roomEditorActiveProviderKey === "booking"
                                          ? { bookingHotelId: event.target.value }
                                          : { providerListingId: event.target.value }
                                      )
                                    }
                                    placeholder={roomEditorActiveFieldLabels.primaryLabel}
                                  />
                                </label>
                              ) : null}
                              {roomEditorActiveProviderKey !== "airbnb" ? (
                                <label className={styles.fieldBlock}>
                                  <span className={styles.fieldLabel}>{roomEditorActiveFieldLabels.secondaryLabel}</span>
                                  <input
                                    className={styles.fieldInput}
                                    value={roomEditorActiveProviderKey === "booking" ? roomEditorActiveProviderDraft.bookingPropertyCode : roomEditorActiveProviderDraft.providerPropertyCode}
                                    onChange={(event) =>
                                      updateRoomChannelDraft(
                                        roomEditorActiveProviderKey,
                                        roomEditorActiveProviderKey === "booking"
                                          ? { bookingPropertyCode: event.target.value }
                                          : { providerPropertyCode: event.target.value }
                                      )
                                    }
                                    placeholder={roomEditorActiveFieldLabels.secondaryLabel}
                                  />
                                </label>
                              ) : null}
                              {roomEditorActiveFieldLabels.tertiaryLabel ? (
                                <label className={styles.fieldBlock}>
                                  <span className={styles.fieldLabel}>{roomEditorActiveFieldLabels.tertiaryLabel}</span>
                                  <input
                                    className={styles.fieldInput}
                                    value={roomEditorActiveProviderDraft.providerListingUrl}
                                    onChange={(event) =>
                                      updateRoomChannelDraft(roomEditorActiveProviderKey, { providerListingUrl: event.target.value })
                                    }
                                    placeholder={roomEditorActiveFieldLabels.tertiaryLabel}
                                  />
                                </label>
                              ) : null}
                              {roomEditorActiveFieldLabels.accessTokenLabel && roomEditorActiveProviderKey !== "airbnb" ? (
                                <label className={styles.fieldBlock}>
                                  <span className={styles.fieldLabel}>{roomEditorActiveFieldLabels.accessTokenLabel}</span>
                                  <input
                                    className={styles.fieldInput}
                                    value={roomEditorActiveProviderDraft.providerAccessToken}
                                    onChange={(event) =>
                                      updateRoomChannelDraft(roomEditorActiveProviderKey, { providerAccessToken: event.target.value })
                                    }
                                    placeholder={roomEditorActiveFieldLabels.accessTokenLabel}
                                  />
                                </label>
                              ) : null}
                            </div>

                            {selectedChannelConfirmationLabel ? (
                              <label className={styles.roomChannelCheckboxRow}>
                                <input
                                  type="checkbox"
                                  checked={selectedChannelConfirmationChecked}
                                  onChange={(event) =>
                                    updateRoomChannelDraft(roomEditorActiveProviderKey, { channexConfirmed: event.target.checked })
                                  }
                                />
                                <span>{selectedChannelConfirmationLabel}</span>
                              </label>
                            ) : null}

                            <div className={styles.inlineActionRow}>
                              <button
                                type="button"
                                className={styles.primaryActionButton}
                                disabled={
                                  !selectedChannelConfirmationChecked ||
                                  roomEditorPendingState === "preview" ||
                                  (roomEditorActiveProviderKey === "airbnb" && !roomEditorActiveProviderDraft.airbnbAuthorized)
                                }
                                onClick={() => handlePreviewRoomChannelConnection(roomEditorActiveProviderKey)}
                              >
                                Preview
                              </button>
                            </div>
                          </>
                        ) : null}

                        {roomEditorActivePanelView === "preview" ? (
                          <div className={styles.roomChannelPreviewCard}>
                            <div className={styles.roomChannelStepLabel}>Preview found property and rooms</div>
                            <div className={styles.roomChannelPreviewGrid}>
                              <div className={styles.placeholderRow}>
                                <div className={styles.placeholderLabel}>Found property</div>
                                <div className={styles.placeholderValue}>{roomEditorActivePreview?.propertyName ?? "Awaiting property match"}</div>
                              </div>
                              <div className={styles.placeholderRow}>
                                <div className={styles.placeholderLabel}>OTA</div>
                                <div className={styles.placeholderValue}>{roomEditorActiveProvider.displayName}</div>
                              </div>
                              <div className={styles.placeholderRow}>
                                <div className={styles.placeholderLabel}>Rooms found</div>
                                <div className={styles.placeholderValue}>{(roomEditorActivePreview?.roomList ?? []).length || 0}</div>
                              </div>
                            </div>
                            <div className={styles.roomDarkCard}>
                              <div className={styles.feedTitle}>Suggested match</div>
                              <div className={styles.roomChannelPreviewGrid}>
                                <div className={styles.placeholderRow}>
                                  <div className={styles.placeholderLabel}>Famlo room</div>
                                  <div className={styles.placeholderValue}>{roomEditorRoom?.name ?? "Save room first"}</div>
                                </div>
                                <label className={styles.fieldBlock}>
                                  <span className={styles.fieldLabel}>OTA room</span>
                                  <select
                                    className={styles.fieldInput}
                                    value={roomEditorActivePreview?.selectedRoomSuggestion?.suggestedRoomTypeTitle ?? ""}
                                    onChange={(event) =>
                                      setRoomChannelPreviewByKey((current) => ({
                                        ...current,
                                        [roomEditorActiveProviderKey]: current[roomEditorActiveProviderKey]
                                          ? {
                                            ...current[roomEditorActiveProviderKey]!,
                                            selectedRoomSuggestion: current[roomEditorActiveProviderKey]?.selectedRoomSuggestion
                                              ? {
                                                ...current[roomEditorActiveProviderKey]!.selectedRoomSuggestion!,
                                                suggestedRoomTypeTitle: event.target.value || null,
                                              }
                                              : {
                                                roomId: roomEditorRoom?.id ?? "",
                                                famloRoomName: roomEditorRoom?.name ?? "",
                                                suggestedRoomTypeTitle: event.target.value || null,
                                                suggestedRatePlanTitle: null,
                                                autoApplicable: false,
                                              },
                                          }
                                          : current[roomEditorActiveProviderKey],
                                      }))
                                    }
                                  >
                                    <option value="">Select OTA room</option>
                                    {(roomEditorActivePreview?.roomList ?? []).map((room) => (
                                      <option key={`${roomEditorActiveProviderKey}-${room.title}`} value={room.title}>
                                        {room.title}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                            </div>
                            {(roomEditorActivePreview?.roomList ?? []).length ? (
                              <div className={styles.roomDarkCard}>
                                <div className={styles.feedTitle}>Rooms found</div>
                                <div className={styles.stack}>
                                  {(roomEditorActivePreview?.roomList ?? []).slice(0, 8).map((room) => (
                                    <div key={`${roomEditorActiveProviderKey}-${room.title}`} className={styles.feedCopy}>{room.title}</div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {roomEditorActivePreview?.warnings.length ? (
                              <div className={styles.roomDarkCard}>
                                <div className={styles.feedTitle}>Warnings</div>
                                <div className={styles.stack}>
                                  {roomEditorActivePreview.warnings.map((warning) => (
                                    <div key={warning} className={styles.feedCopy}>{warning}</div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {(roomEditorActivePreview?.ratePlans ?? []).length ? (
                              <details className={styles.operatorDetails}>
                                <summary className={styles.operatorSummary}>Advanced</summary>
                                <div className={styles.roomDarkCard}>
                                  <div className={styles.feedTitle}>Rate plans</div>
                                  <div className={styles.stack}>
                                    {(roomEditorActivePreview?.ratePlans ?? []).slice(0, 8).map((ratePlan) => (
                                      <div key={`${roomEditorActiveProviderKey}-${ratePlan.title}`} className={styles.feedCopy}>{ratePlan.title}</div>
                                    ))}
                                  </div>
                                </div>
                              </details>
                            ) : null}
                            <label className={styles.roomChannelCheckboxRow}>
                              <input
                                type="checkbox"
                                checked={roomEditorPreviewAccepted}
                                onChange={(event) =>
                                  setRoomChannelPreviewAcceptedByKey((current) => ({
                                    ...current,
                                    [roomEditorActiveProviderKey]: event.target.checked,
                                  }))
                                }
                              />
                              <span>
                                I confirm this is the correct OTA property and room. Famlo can manage availability, rates, and inventory for this OTA room.
                              </span>
                            </label>
                            <div className={styles.inlineActionRow}>
                              <button
                                type="button"
                                className={styles.secondaryActionButton}
                                onClick={() =>
                                  setRoomChannelPanelViewByKey((current) => ({ ...current, [roomEditorActiveProviderKey]: "setup" }))
                                }
                              >
                                Back
                              </button>
                              <button
                                type="button"
                                className={styles.primaryActionButton}
                                disabled={!selectedChannelConfirmationChecked || !roomEditorPreviewAccepted || roomEditorPendingState === "connect" || roomEditorPendingState === "sync"}
                                onClick={() => handleConnectRoomChannelAndSync(roomEditorActiveProviderKey)}
                              >
                                Yes, connect and start sync
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {roomEditorActivePanelView === "summary" ? (
                          <div className={styles.roomChannelSummaryGrid}>
                            <div className={styles.roomDarkCard}>
                              <div className={styles.summaryValue}>{roomEditorActiveProvider.displayName} connected</div>
                              <div className={styles.summaryCopy}>This OTA is connected. Famlo is now syncing availability, rates, inventory, and bookings for this room.</div>
                            </div>
                            <div className={styles.roomDarkCard}>
                              <div className={styles.summaryLabel}>Last sync</div>
                              <div className={styles.summaryValue}>{roomEditorLastSyncLog ? formatDateTime(roomEditorLastSyncLog.createdAt) : "Queued"}</div>
                              <div className={styles.summaryCopy}>
                                {roomEditorCanRunSync ? "You can run a fresh sync anytime from here." : "Famlo will finish the first sync after connection."}
                              </div>
                            </div>
                            <div className={styles.inlineActionRow}>
                              {roomEditorCanRunSync ? (
                                <button
                                  type="button"
                                  className={styles.primaryActionButton}
                                  onClick={() => handleRunRoomChannelSync(roomEditorActiveProviderKey)}
                                  disabled={roomEditorPendingState === "connect" || roomEditorPendingState === "sync"}
                                >
                                  Run sync now
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className={styles.secondaryActionButton}
                                onClick={() =>
                                  setRoomChannelPanelViewByKey((current) => ({ ...current, [roomEditorActiveProviderKey]: "setup" }))
                                }
                              >
                                Review setup
                              </button>
                            </div>
                          </div>
                        ) : null}

                      </div>
                    ) : roomEditorMode === "edit" ? (
                      <div className={styles.roomDarkCard}>
                        <div className={styles.feedTitle}>Select an OTA and click Connect to continue.</div>
                        <div className={styles.feedCopy}>
                          Only the selected OTA setup will open here. After you add the required details, Famlo will preview the property and rooms before sync starts.
                        </div>
                      </div>
                    ) : null}
                  </article>
                ) : null}

                {roomEditorTab === "mapping" ? (
                  <article className={styles.roomControlPlaceholder}>
                    <div className={styles.placeholderTitle}>Manage OTA room and price mapping</div>
                    <div className={styles.placeholderCopy}>
                      Famlo room is the master room. Match the OTA room and rate plan here, then keep editing price in Famlo Pro.
                    </div>
                    {!selectedRoomChannelConnected ? (
                      <div className={`${styles.emptyState} ${styles.roomDarkEmptyState}`}>
                        <div className={styles.emptyTitle}>Connect an OTA first to match rooms and pricing.</div>
                        <div className={styles.emptyCopy}>Once a channel is connected, Famlo Pro can preview the OTA room and rate plan for this room.</div>
                        <div className={styles.inlineActionRow}>
                          <button type="button" className={styles.primaryActionButton} onClick={() => setRoomEditorTab("channels")}>
                            Go to Channels
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className={styles.roomMappingCardGrid}>
                          <div className={styles.roomDarkCard}>
                            <div className={styles.summaryLabel}>Famlo Room</div>
                            <div className={styles.summaryValue}>{roomEditorRoom?.name ?? "Save room first"}</div>
                            <div className={styles.summaryCopy}>
                              {roomEditorRoom?.maxGuests ?? 0} guests · {roomEditorRoom?.bedInfo ?? "Bed details pending"} · {roomEditorRoom?.bathroomType ?? "Bathroom pending"}
                            </div>
                          </div>
                          <div className={styles.roomDarkCard}>
                            <div className={styles.summaryLabel}>Connected OTA Room</div>
                            <div className={styles.summaryValue}>{selectedRoomMappingRow?.mapping?.externalRoomTypeId ? "Matched" : "Needs review"}</div>
                            <div className={styles.summaryCopy}>
                              {selectedRoomMappingRow?.mapping?.externalRoomTypeId ? selectedRoomMappingRow.providerRoomType : "No OTA room is matched yet for this room."}
                            </div>
                            <div className={styles.inlineActionRow}>
                              <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection("room-mapping")}>
                                Edit room match
                              </button>
                            </div>
                          </div>
                          <div className={styles.roomDarkCard}>
                            <div className={styles.summaryLabel}>Price / Rate Plan</div>
                            <div className={styles.summaryValue}>{selectedRoomRateMappingRow?.ratePlan?.externalRatePlanId ? "Matched" : "Needs review"}</div>
                            <div className={styles.summaryCopy}>
                              Base price: {roomEditorBasePriceLabel} · {selectedRoomRateMappingRow?.ratePlan?.externalRatePlanId ? selectedRoomRateMappingRow.providerRatePlan : "No OTA rate plan is matched yet."}
                            </div>
                            <div className={styles.inlineActionRow}>
                              <button type="button" className={styles.secondaryActionButton} onClick={() => setActiveSection("rate-mapping")}>
                                Edit price match
                              </button>
                            </div>
                          </div>
                          <div className={styles.roomDarkCard}>
                            <div className={styles.summaryLabel}>Sync Result</div>
                            <div className={styles.summaryValue}>{roomEditorCanRunSync ? "Ready" : "Needs review"}</div>
                            <div className={styles.summaryCopy}>
                              {roomEditorLastSyncLog ? `Last sync: ${formatDateTime(roomEditorLastSyncLog.createdAt)}` : "No room-level sync summary yet."}
                            </div>
                            <div className={styles.inlineActionRow}>
                              {roomEditorCanRunSync ? (
                                <button type="button" className={styles.primaryActionButton} onClick={() => handleRunRoomChannelSync(roomEditorActiveProviderKey)}>
                                  Run sync now
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className={`${styles.feedbackBox} ${styles.roomInlineFeedback}`}>
                          Famlo Pro is the master source. Edit this room&apos;s price in Famlo Pro, then sync to matched OTA rate plans.
                        </div>
                        <div className={styles.inlineActionRow}>
                          <button type="button" className={styles.primaryActionButton} onClick={() => setRoomEditorTab("pricing")}>
                            Edit Famlo price
                          </button>
                          <button type="button" className={styles.secondaryActionButton} onClick={() => setRoomEditorTab("channels")}>
                            Go to Channels
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                ) : null}

                {roomEditorTab === "sync-health" ? (
                  <article className={styles.roomControlPlaceholder}>
                    <div className={styles.placeholderTitle}>Issues & Sync Status</div>
                    <div className={styles.placeholderCopy}>
                      Shows provider setup state, pending jobs, failed jobs, and friendly recovery actions. Raw Channex payloads stay hidden.
                    </div>
                    {providerReviewFeedback ? (
                      <div
                        className={`${styles.feedbackBox} ${providerReviewFeedback.ok ? styles.feedbackSuccess : styles.feedbackError}`}
                        style={{ marginTop: 12 }}
                      >
                        {providerReviewFeedback.message}
                      </div>
                    ) : null}
                    <div className={styles.roomIssueCardGrid} style={{ marginTop: 14 }}>
                      {roomEditorSyncHealthRows.map((row) => (
                        <div key={row.provider.key} className={styles.roomIssueCard}>
                          <div className={styles.roomIssueCardHeader}>
                            <div>
                              <div className={styles.roomOtaCardTitle}>{row.provider.displayName}</div>
                              <div className={styles.roomOtaCardMeta}>
                                {row.setupLabel} · {row.capabilityLabel}
                              </div>
                            </div>
                            <span
                              className={`${styles.readinessPill} ${
                                row.connected ? styles.readinessPillOk : styles.readinessPillReview
                              }`}
                            >
                              {row.connected ? "Connected" : "Not connected"}
                            </span>
                          </div>
                          <div className={styles.roomOtaCardCopy}>{row.friendlyIssueMessage}</div>
                          <div className={styles.stack} style={{ marginTop: 10 }}>
                            <div className={styles.feedCopy}>Last sync: {row.lastSyncLabel}</div>
                            <div className={styles.feedCopy}>Pending jobs: {row.pendingJobsLabel}</div>
                            <div className={styles.feedCopy}>Failed jobs: {row.failedJobsLabel}</div>
                            <div className={styles.feedCopy}>Retryable state: {row.retryableLabel}</div>
                          </div>
                          {row.action ? (
                            <div className={styles.inlineActionRow} style={{ marginTop: 12 }}>
                              <button
                                type="button"
                                className={styles.secondaryActionButton}
                                disabled={providerReviewPendingKey === row.provider.key}
                                onClick={() => {
                                  if (row.action?.kind === "review") {
                                    void requestProviderReview(row.provider.key);
                                    return;
                                  }
                                  if (row.action?.kind === "channels") {
                                    setActiveChannelSetup(row.provider.key);
                                    setRoomEditorTab("channels");
                                    return;
                                  }
                                  if (row.action?.kind === "mapping") {
                                    setActiveChannelSetup(row.provider.key);
                                    setRoomEditorTab("mapping");
                                  }
                                }}
                              >
                                {row.action.label}
                              </button>
                            </div>
                          ) : (
                            <div className={styles.roomOtaCardCta} style={{ marginTop: 12 }}>
                              Healthy
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {roomEditorIssueCards.length === 0 ? (
                      <div className={`${styles.emptyState} ${styles.roomDarkEmptyState}`}>
                        <div className={styles.emptyTitle}>No issues found</div>
                        <div className={styles.emptyCopy}>This room is ready for connected channels.</div>
                        <div className={styles.emptyCopy}>
                          {roomEditorLastSyncLog
                            ? `Last sync summary: ${roomEditorLastSyncLog.message ?? "Recent sync activity recorded."}`
                            : "No room-level sync problem is currently recorded."}
                        </div>
                      </div>
                    ) : (
                      <div className={styles.roomIssueCardGrid}>
                        {roomEditorIssueCards.map((issue) => (
                          <div key={issue.key} className={styles.roomIssueCard}>
                            <div className={styles.roomIssueCardHeader}>
                              <div className={styles.roomOtaCardTitle}>{issue.title}</div>
                              <span
                                className={`${styles.readinessPill} ${issue.severity === "Blocking"
                                  ? styles.readinessPillMissing
                                  : issue.severity === "Warning"
                                    ? styles.readinessPillReview
                                    : styles.readinessPillOk
                                  }`}
                              >
                                {issue.severity}
                              </span>
                            </div>
                            <div className={styles.roomOtaCardCopy}>{issue.detail}</div>
                            <div className={styles.inlineActionRow}>
                              <button
                                type="button"
                                className={styles.secondaryActionButton}
                                onClick={() => {
                                  if (issue.actionTarget === "channels") setRoomEditorTab("channels");
                                  if (issue.actionTarget === "mapping") setRoomEditorTab("mapping");
                                  if (issue.actionTarget === "details") setRoomEditorTab("details");
                                  if (issue.actionTarget === "pricing") setRoomEditorTab("pricing");
                                  if (issue.actionTarget === "sync-health") setRoomEditorTab("sync-health");
                                }}
                              >
                                {issue.actionLabel}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <details className={styles.operatorDetails}>
                      <summary className={styles.operatorSummary}>Advanced sync logs</summary>
                      {selectedRoomSyncLogs.length > 0 ? (
                        <div className={styles.logList} style={{ marginTop: 16 }}>
                          {selectedRoomSyncLogs.map((log) => {
                            const payloadSummary = summarizeSafePayload(log.payload);
                            return (
                              <article key={log.id} className={styles.logRow}>
                                <div>
                                  <div className={styles.logTitle}>{labelizeToken(log.action, "Sync action")}</div>
                                  <div className={styles.logCopy}>{log.message ?? "No detail message stored."}</div>
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
                                  <span className={`${styles.readinessPill} ${log.status === "success" ? styles.readinessPillOk : styles.readinessPillReview}`}>
                                    {labelizeToken(log.status, "Unknown")}
                                  </span>
                                  <span className={styles.logTimestamp}>{formatDateTime(log.createdAt)}</span>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <div className={styles.emptyCopy}>No room-scoped sync summaries are available yet.</div>
                      )}
                    </details>
                  </article>
                ) : null}

              </div>
            </section>
          )}

          {activeSection === "dashboard" && !roomRouteState && (
            <section className={styles.dashboardWorkspacePage}>
              <section className={styles.dashboardWorkspacePageHeader}>
                <div>
                  <h2 className={styles.dashboardWorkspacePageTitle}>Dashboard</h2>
                  <p className={styles.dashboardWorkspacePageSubtitle}>Overview of your homestay performance and operations</p>
                  <div className={styles.inlineStatusMetaRow}>
                    <span className={`${styles.badge} ${bookingSyncToneClass}`.trim()}>{bookingSyncBadgeLabel}</span>
                    <span>{bookingSyncUpdatedLabel}</span>
                    <span>{bookingLiveHealth.safeMessage}</span>
                  </div>
                </div>
                <div className={styles.dashboardWorkspaceActionRow}>
                  <button
                    type="button"
                    className={styles.dashboardWorkspaceSecondaryButton}
                    onClick={handleDashboardRefresh}
                  >
                    <RefreshCcw size={16} />
                    Sync
                  </button>
                  <button
                    type="button"
                    className={styles.dashboardWorkspacePrimaryButton}
                    onClick={() => setIsDashboardBookingModalOpen(true)}
                    disabled={rooms.length === 0}
                  >
                    <Plus size={16} />
                    New Booking
                  </button>
                </div>
              </section>

              <section className={styles.dashboardKpiGrid}>
                <article className={styles.dashboardKpiCard}>
                  <span className={`${styles.dashboardKpiIcon} ${styles.dashboardKpiIconBlue}`}><CalendarDays size={18} /></span>
                  <div className={styles.dashboardKpiLabel}>Total Bookings</div>
                  <div className={styles.dashboardKpiValue}>{totalBookingsCount}</div>
                  <div className={styles.dashboardKpiMeta}>All time</div>
                </article>
                <article className={styles.dashboardKpiCard}>
                  <span className={`${styles.dashboardKpiIcon} ${styles.dashboardKpiIconGreen}`}><CheckCircle2 size={18} /></span>
                  <div className={styles.dashboardKpiLabel}>Today&apos;s Check-ins</div>
                  <div className={styles.dashboardKpiValue}>{dashboardCheckInCount}</div>
                  <div className={styles.dashboardKpiMeta}>Next 24 hours</div>
                </article>
                <article className={styles.dashboardKpiCard}>
                  <span className={`${styles.dashboardKpiIcon} ${styles.dashboardKpiIconOrange}`}><ArrowRightLeft size={18} /></span>
                  <div className={styles.dashboardKpiLabel}>Today&apos;s Check-outs</div>
                  <div className={styles.dashboardKpiValue}>{dashboardCheckOutCount}</div>
                  <div className={styles.dashboardKpiMeta}>Next 24 hours</div>
                </article>
                <article className={styles.dashboardKpiCard}>
                  <span className={`${styles.dashboardKpiIcon} ${styles.dashboardKpiIconPurple}`}><Hotel size={18} /></span>
                  <div className={styles.dashboardKpiLabel}>Occupancy</div>
                  <div className={styles.dashboardKpiValue}>{occupancyThisMonthPercent}%</div>
                  <div className={styles.dashboardKpiMeta}>This Month</div>
                </article>
                <article className={styles.dashboardKpiCard}>
                  <span className={`${styles.dashboardKpiIcon} ${styles.dashboardKpiIconPurpleSoft}`}><BadgeIndianRupee size={18} /></span>
                  <div className={styles.dashboardKpiLabel}>This Month Revenue</div>
                  <div className={styles.dashboardKpiValue}>{formatCurrency(thisMonthRevenueValue)}</div>
                  <div className={styles.dashboardKpiMeta}>
                    {dashboardRevenueTrendPercent >= 0 ? "+" : ""}
                    {formatPercentage(dashboardRevenueTrendPercent)} vs last month
                  </div>
                </article>
                <article className={styles.dashboardKpiCard}>
                  <span className={`${styles.dashboardKpiIcon} ${styles.dashboardKpiIconRed}`}><WalletCards size={18} /></span>
                  <div className={styles.dashboardKpiLabel}>Pending Payments</div>
                  <div className={styles.dashboardKpiValue}>{formatCurrency(pendingPaymentAmount)}</div>
                  <div className={styles.dashboardKpiMeta}>{pendingPaymentBookings.length} transaction{pendingPaymentBookings.length === 1 ? "" : "s"}</div>
                </article>
              </section>

              <section className={styles.dashboardWorkspaceTopGrid}>
                <article className={styles.dashboardPanel}>
                  <div className={styles.dashboardPanelHeader}>
                    <div>
                      <h3 className={styles.dashboardPanelTitle}>Recent Bookings</h3>
                    </div>
                    <Link href={dashboardRecentBookingsViewHref} className={styles.dashboardInlineLink}>
                      View all bookings
                    </Link>
                  </div>
                  {dashboardRecentBookings.length > 0 ? (
                    <div className={styles.dashboardBookingsTable}>
                      <div className={styles.dashboardBookingsTableHead}>
                        <span>Guest</span>
                        <span>Room</span>
                        <span>Check-in</span>
                        <span>Check-out</span>
                        <span>Channel</span>
                        <span>Status</span>
                      </div>
                      {dashboardRecentBookings.map((booking) => {
                        const bookingChannel = normalizeBookingChannel(booking);
                        return (
                          <div key={booking.bookingId} className={styles.dashboardBookingsTableRow}>
                            <div className={styles.dashboardGuestCell}>
                              <span className={styles.dashboardAvatarBadge}>{buildInitials(booking.guestDisplayName)}</span>
                              <div>
                                <div className={styles.dashboardCellTitle}>{booking.guestDisplayName}</div>
                                <div className={styles.dashboardCellMeta}>#{booking.bookingId}</div>
                              </div>
                            </div>
                            <div>
                              <div className={styles.dashboardCellTitle}>{booking.roomName}</div>
                              <div className={styles.dashboardCellMeta}>{propertyName || "Property workspace"}</div>
                            </div>
                            <div>
                              <div className={styles.dashboardCellTitle}>{formatShortDate(booking.startDate)}</div>
                              <div className={styles.dashboardCellMeta}>{formatWeekdayShort(booking.startDate)}</div>
                            </div>
                            <div>
                              <div className={styles.dashboardCellTitle}>{formatShortDate(booking.checkoutDate)}</div>
                              <div className={styles.dashboardCellMeta}>{formatWeekdayShort(booking.checkoutDate)}</div>
                            </div>
                            <div className={styles.dashboardChannelCell}>
                              <span className={styles.dashboardChannelMarker}>{bookingChannelMarker(bookingChannel)}</span>
                              <span>{bookingChannel}</span>
                            </div>
                            <span className={`${styles.dashboardStatusChip} ${dashboardBookingStatusTone(booking)}`}>
                              {dashboardBookingStatusLabel(booking)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className={styles.dashboardEmptyState}>No recent bookings are available for this property yet.</div>
                  )}
                </article>

                <article className={styles.dashboardPanel}>
                  <div className={styles.dashboardPanelHeader}>
                    <div>
                      <h3 className={styles.dashboardPanelTitle}>Quick Actions</h3>
                    </div>
                  </div>
                  <div className={styles.dashboardQuickActionsGrid}>
                    {dashboardQuickActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <button
                          key={action.label}
                          type="button"
                          className={styles.dashboardQuickActionButton}
                          onClick={action.onClick}
                          disabled={action.disabled}
                        >
                          <span className={styles.dashboardQuickActionIcon}><Icon size={18} /></span>
                          <span>{action.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </article>
              </section>

              <section className={styles.dashboardWorkspaceMiddleGrid}>
                <article className={styles.dashboardPanel}>
                  <div className={styles.dashboardPanelHeader}>
                    <div>
                      <h3 className={styles.dashboardPanelTitle}>Revenue Overview</h3>
                      <div className={styles.dashboardPanelSubtle}>Total Revenue</div>
                    </div>
                    <button type="button" className={styles.dashboardMiniSelectButton} onClick={() => setActiveSectionWithUrl("revenue")}>
                      {revenueWindow}
                      <ChevronDown size={14} />
                    </button>
                  </div>
                  <div className={styles.dashboardRevenueValue}>{formatCurrency(thisMonthRevenueValue)}</div>
                  <div className={styles.dashboardRevenueTrend}>
                    <TrendingUp size={16} />
                    <span>
                      {dashboardRevenueTrendPercent >= 0 ? "+" : ""}
                      {formatPercentage(dashboardRevenueTrendPercent)} vs last month
                    </span>
                  </div>
                  <div className={styles.dashboardRevenueMeta}>{selectedRevenueDateRangeLabel}</div>
                  <div className={styles.dashboardRevenueChartWrap}>
                    <div className={styles.dashboardRevenueYAxis}>
                      {dashboardRevenueYAxisTicks.slice().reverse().map((value) => (
                        <span key={value}>{value === 0 ? "₹0" : `₹${Math.round(value / 1000)}k`}</span>
                      ))}
                    </div>
                    <div className={styles.dashboardRevenueChart}>
                      <svg viewBox={`0 0 ${chartWidth} 220`} className={styles.dashboardRevenueSvg} role="img" aria-label="Revenue overview chart">
                        {dashboardRevenueYAxisTicks.map((value) => {
                          const maxValue = Math.max(dashboardRevenueYAxisMax, 1);
                          const y = 220 - (value / maxValue) * 220;
                          return (
                            <line
                              key={value}
                              x1="0"
                              y1={y}
                              x2={chartWidth}
                              y2={y}
                              className={styles.dashboardRevenueGridLine}
                            />
                          );
                        })}
                        <path d={revenueOverviewPath} className={styles.dashboardRevenueLine} />
                      </svg>
                      <div className={styles.dashboardRevenueXAxis}>
                        {revenueOverviewRows.map((row, index) => (
                          <span key={`${row.key}-${row.label}`} className={index % Math.max(1, Math.ceil(revenueOverviewRows.length / 6)) === 0 || index === revenueOverviewRows.length - 1 ? "" : styles.dashboardRevenueXAxisGhost}>
                            {revenueWindow === "This month" ? `${row.label} ${formatMonthShort(row.key)}` : row.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>

                <article className={styles.dashboardPanel}>
                  <div className={styles.dashboardPanelHeader}>
                    <div>
                      <h3 className={styles.dashboardPanelTitle}>Property / Room Status</h3>
                    </div>
                  </div>
                  <div className={styles.dashboardRoomStatusList}>
                    {dashboardRoomStatusRows.map(({ room, bookedNights, occupiedToday }) => (
                      <div key={room.id} className={styles.dashboardRoomStatusRow}>
                        <div className={styles.dashboardRoomStatusIdentity}>
                          {room.photoUrl ? (
                            <img src={room.photoUrl} alt={room.name} className={styles.dashboardRoomThumb} />
                          ) : (
                            <div className={styles.dashboardRoomThumbFallback}>{buildInitials(room.name)}</div>
                          )}
                          <div>
                            <div className={styles.dashboardCellTitle}>{room.name}</div>
                            <div className={styles.dashboardCellMeta}>
                              {room.unitType || "Room"} · {room.maxGuests > 0 ? `${room.maxGuests} guests` : "Guests pending"}
                            </div>
                          </div>
                        </div>
                        <div className={styles.dashboardRoomStatusMeta}>
                          <span className={`${styles.dashboardStatusChip} ${occupiedToday ? styles.dashboardStatusWarning : styles.dashboardStatusSuccess}`}>
                            {occupiedToday ? "Occupied" : "Available"}
                          </span>
                          <div className={styles.dashboardRoomNights}>{bookedNights} / {currentMonthDaysCount} nights</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className={styles.dashboardPanel}>
                  <div className={styles.dashboardPanelHeader}>
                    <div>
                      <h3 className={styles.dashboardPanelTitle}>Channel / Sync Health</h3>
                    </div>
                    <span className={styles.dashboardPanelHeaderMeta}>
                      {dashboardHealthyChannelCount === dashboardChannelHealthRows.length ? "All channels synced" : `${dashboardHealthyChannelCount}/${dashboardChannelHealthRows.length} healthy`}
                    </span>
                  </div>
                  <div className={styles.dashboardChannelHealthList}>
                    {dashboardChannelHealthRows.map((row) => (
                      <div key={row.label} className={styles.dashboardChannelHealthRow}>
                        <div className={styles.dashboardChannelCell}>
                          <span className={styles.dashboardChannelMarker}>{row.marker}</span>
                          <div>
                            <div className={styles.dashboardCellTitle}>{row.label}</div>
                            <div className={styles.dashboardCellMeta}>
                              {row.lastSynced ? `Last synced ${formatRelativeAge(row.lastSynced, timeAnchor)}` : "Waiting for first sync"}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`${styles.dashboardStatusChip} ${row.status === "Healthy"
                            ? styles.dashboardStatusSuccess
                            : row.status === "Review"
                              ? styles.dashboardStatusWarning
                              : styles.dashboardStatusMuted
                            }`}
                        >
                          {row.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              </section>

              <section className={styles.dashboardWorkspaceBottomGrid}>
                <article className={styles.dashboardPanel}>
                  <div className={styles.dashboardPanelHeader}>
                    <div>
                      <h3 className={styles.dashboardPanelTitle}>Upcoming Stays</h3>
                      <div className={styles.dashboardPanelSubtle}>{dashboardUpcomingRangeLabel}</div>
                    </div>
                  </div>
                  <div className={styles.dashboardUpcomingRail}>
                    {dashboardUpcomingStayCards.map((item) => (
                      <div key={item.date} className={styles.dashboardUpcomingCard}>
                        <div className={styles.dashboardUpcomingDay}>{item.dayLabel}</div>
                        <div className={styles.dashboardUpcomingDate}>{item.dateLabel}</div>
                        <div className={styles.dashboardUpcomingCount}>{item.count} Stays</div>
                      </div>
                    ))}
                  </div>
                  <div className={styles.dashboardUpcomingFooter}>
                    <div>
                      <div className={styles.dashboardPanelSubtle}>Total Upcoming Stays</div>
                      <div className={styles.dashboardUpcomingTotal}>{dashboardUpcomingStaysTotal} Reservations</div>
                    </div>
                    {nextArrivingBooking ? (
                      <div className={styles.dashboardUpcomingNextGuest}>
                        Next arrival: {nextArrivingBooking.guestDisplayName} · {formatShortDate(nextArrivingBooking.startDate)}
                      </div>
                    ) : null}
                  </div>
                </article>

                <article className={styles.dashboardPanel}>
                  <div className={styles.dashboardPanelHeader}>
                    <div>
                      <h3 className={styles.dashboardPanelTitle}>Guest Messages</h3>
                    </div>
                    <Link href={dashboardMessagesViewHref} className={styles.dashboardInlineLink}>
                      View all messages
                    </Link>
                  </div>
                  {isDashboardConversationsLoading ? (
                    <div className={styles.dashboardEmptyState}>Loading recent guest conversations...</div>
                  ) : dashboardMessageRows.length > 0 ? (
                    <div className={styles.dashboardMessageList}>
                      {dashboardMessageRows.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          className={styles.dashboardMessageRow}
                          onClick={() => openDashboardConversation(row.id)}
                        >
                          {row.guestAvatarUrl ? (
                            <img src={row.guestAvatarUrl} alt={row.guestName} className={styles.dashboardMessageAvatar} />
                          ) : (
                            <span className={styles.dashboardAvatarBadge}>{buildInitials(row.guestName)}</span>
                          )}
                          <div className={styles.dashboardMessageBody}>
                            <div className={styles.dashboardMessageTop}>
                              <span className={styles.dashboardCellTitle}>{row.guestName}</span>
                              <span className={styles.dashboardCellMeta}>{formatDashboardMessageTimestamp(row.lastMessageAt)}</span>
                            </div>
                            <div className={styles.dashboardMessageText}>{row.lastMessage}</div>
                          </div>
                          <span className={`${styles.dashboardStatusChip} ${row.guestUnread > 0 ? styles.dashboardStatusInfo : styles.dashboardStatusMuted}`}>
                            {row.guestUnread > 0 ? "New" : "Replied"}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.dashboardEmptyState}>No guest messages are visible for this workspace yet.</div>
                  )}
                  <Link href={dashboardMessagesViewHref} className={styles.dashboardFooterLink}>
                    Go to all messages
                  </Link>
                </article>
              </section>

              {isDashboardBookingModalOpen ? (
                <div
                  className={styles.dashboardModalBackdrop}
                  onClick={() => setIsDashboardBookingModalOpen(false)}
                  role="presentation"
                >
                  <div
                    className={styles.dashboardModal}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Create manual booking"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className={styles.dashboardModalHeader}>
                      <div>
                        <h3 className={styles.dashboardModalTitle}>New Booking</h3>
                        <p className={styles.dashboardModalCopy}>Create a manual booking using the existing Famlo booking flow.</p>
                      </div>
                      <button
                        type="button"
                        className={styles.dashboardModalClose}
                        onClick={() => setIsDashboardBookingModalOpen(false)}
                        aria-label="Close booking modal"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <div className={styles.dashboardModalGrid}>
                      <label className={styles.dashboardModalField}>
                        <span>Room</span>
                        <select
                          value={dashboardManualBookingDraft.stayUnitId}
                          onChange={(event) =>
                            setDashboardManualBookingDraft((current) => ({ ...current, stayUnitId: event.target.value }))
                          }
                        >
                          {(activeRoomOptions.length > 0 ? activeRoomOptions : rooms).map((room) => (
                            <option key={room.id} value={room.id}>
                              {room.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.dashboardModalField}>
                        <span>Arrival</span>
                        <input
                          type="date"
                          value={dashboardManualBookingDraft.checkInDate}
                          onChange={(event) =>
                            setDashboardManualBookingDraft((current) => ({ ...current, checkInDate: event.target.value }))
                          }
                        />
                      </label>
                      <label className={styles.dashboardModalField}>
                        <span>Departure</span>
                        <input
                          type="date"
                          value={dashboardManualBookingDraft.checkOutDate}
                          onChange={(event) =>
                            setDashboardManualBookingDraft((current) => ({ ...current, checkOutDate: event.target.value }))
                          }
                        />
                      </label>
                      <label className={styles.dashboardModalField}>
                        <span>Amount</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="1000"
                          value={dashboardManualBookingDraft.amount}
                          onChange={(event) =>
                            setDashboardManualBookingDraft((current) => ({ ...current, amount: event.target.value }))
                          }
                        />
                      </label>
                    </div>
                    {dashboardManualBookingFeedback ? (
                      <div
                        className={`${styles.dashboardModalFeedback} ${dashboardManualBookingFeedback.type === "error"
                          ? styles.dashboardModalFeedbackError
                          : styles.dashboardModalFeedbackSuccess
                          }`}
                      >
                        {dashboardManualBookingFeedback.text}
                      </div>
                    ) : null}
                    <div className={styles.dashboardModalActions}>
                      <button
                        type="button"
                        className={styles.dashboardWorkspaceSecondaryButton}
                        onClick={() => setIsDashboardBookingModalOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.dashboardWorkspacePrimaryButton}
                        onClick={handleCreateDashboardManualBooking}
                        disabled={isDashboardManualBookingPending || rooms.length === 0}
                      >
                        {isDashboardManualBookingPending ? "Booking..." : "Create Booking"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          )}

          {activeSection !== "dashboard" && activeSection !== "host-profile" && activeSection !== "documents" && activeSection !== "properties-home" && activeSection !== "bookings" && activeSection !== "inventory-calendar" && activeSection !== "messages-reviews" && activeSection !== "revenue" && activeSection !== "reports" && activeSection !== "support" && !(roomRouteState && activeSection === "rooms-units") && (
            <section className={styles.sectionIntro}>
              <div>
                {sectionDescriptor.eyebrow ? <div className={styles.sectionEyebrow}>{sectionDescriptor.eyebrow}</div> : null}
                <h2 className={styles.sectionTitle}>{sectionDescriptor.title}</h2>
                {sectionDescriptor.copy ? <p className={styles.sectionCopy}>{sectionDescriptor.copy}</p> : null}
              </div>
              {sectionDescriptor.status ? <span className={styles.sectionStatus}>{sectionDescriptor.status}</span> : null}
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
                  theme="pro-dark"
                  proCreateStatus={famloPlusStatus}
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
            <section className={`${styles.propertyCenterShell} ${styles.propertyCenterShellLuxury} ${styles.calendarLuxuryShell} ${styles.proLuxurySection}`}>
              <div className={styles.cardHeaderCompact}>
                <div>
                  <h3 className={styles.propertyCenterTitle}>Calendar</h3>
                  <div className={styles.cardCopy}>
                    <span
                      className={`${styles.badge} ${calendarSyncDisplay.tone === "error" || calendarSyncDisplay.tone === "warning" ? styles.badgeMuted : ""}`.trim()}
                    >
                      {calendarSyncDisplay.badge}
                    </span>{" "}
                    {calendarSyncDisplay.detail}
                  </div>
                </div>
              </div>
              <div className={styles.cardBody}>
                {calendarSyncDisplay.warning ? (
                  <div className={`${styles.feedbackBox} ${styles.feedbackError}`} style={{ marginBottom: "16px" }}>
                    {calendarSyncDisplay.warning}
                  </div>
                ) : null}
                {calendarSyncFeedback ? (
                  <div
                    className={`${styles.feedbackBox} ${calendarSyncFeedback.type === "error" ? styles.feedbackError : styles.feedbackSuccess}`}
                    style={{ marginBottom: "16px" }}
                  >
                    {calendarSyncFeedback.text}
                  </div>
                ) : null}
                <div className={`${styles.filterRow} ${styles.calendarLuxuryLegend}`} style={{ marginBottom: "24px" }}>
                  {CALENDAR_LEGEND.map((item) => (
                    <span key={item.title} className={styles.filterChip}>
                      {item.title} = {item.copy}
                    </span>
                  ))}
                </div>
                <div className={styles.calendarManagerToolbar}>
                  <div className={styles.calendarManagerToolbarFilters}>
                    <CalendarToolbarDropdown
                      label="Restriction view"
                      value={calendarRestrictionView}
                      options={CALENDAR_VIEW_OPTIONS}
                      onChange={(value) => setCalendarRestrictionView(value as CalendarRestrictionType)}
                    />
                    <CalendarToolbarDropdown
                      label="Room filter"
                      value={calendarRoomFilter}
                      options={[
                        { value: "all", label: "All rooms" },
                        ...displayedCalendarRows.map((row) => ({ value: row.roomId, label: row.roomName })),
                      ]}
                      onChange={setCalendarRoomFilter}
                    />
                    <CalendarToolbarDropdown
                      label="Rate filter"
                      value={calendarRateFilter}
                      options={[
                        { value: "all", label: "All rate plans" },
                        ...calendarRatePlanOptions.map((option) => ({ value: option.value, label: option.label })),
                      ]}
                      disabled={calendarRatePlanOptions.length === 0}
                      onChange={setCalendarRateFilter}
                    />
                  </div>
                  <div className={styles.calendarManagerToolbarActions}>
                    <button
                      type="button"
                      className={styles.calendarToolbarIconButton}
                      onClick={() => runVisibleCalendarSync("sync_now")}
                      disabled={isCalendarSyncPending || !isCalendarWorkspaceReady}
                      aria-label="Sync visible calendar"
                      title={isCalendarSyncPending ? "Syncing..." : "Sync now"}
                    >
                      <RefreshCcw size={16} className={isCalendarSyncPending ? styles.calendarToolbarSpin : ""} />
                    </button>
                    <CalendarToolbarDropdown
                      label="Actions"
                      value="actions"
                      options={[
                        { value: "actions", label: "Actions", disabled: true },
                        { value: "bulk_update", label: "Bulk Update" },
                        { value: "today", label: "Go to today" },
                      ]}
                      onChange={(value) => {
                        if (value === "bulk_update") openBulkCalendarEditor();
                        if (value === "today") handleCalendarToday();
                      }}
                    />
                  </div>
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
                {bulkCalendarFeedback ? (
                  <div
                    className={`${styles.feedbackBox} ${bulkCalendarFeedback.type === "error" ? styles.feedbackError : styles.feedbackSuccess}`}
                    style={{ marginBottom: "24px" }}
                  >
                    {bulkCalendarFeedback.text}
                  </div>
                ) : null}
                {calendarWorkspaceStatus.errorMessage ? (
                  <div className={styles.calendarWorkspaceStateCard} role="alert">
                    <div className={styles.calendarWorkspaceStateBadge}>Calendar load issue</div>
                    <div className={styles.calendarWorkspaceStateTitle}>Calendar data could not be prepared yet</div>
                    <div className={styles.calendarWorkspaceStateCopy}>
                      {calendarWorkspaceStatus.errorMessage}
                    </div>
                    <div className={styles.calendarWorkspaceStateMeta}>
                      Failed sources: {calendarWorkspaceStatus.errorSources.join(", ")}
                    </div>
                    <div className={styles.calendarWorkspaceStateActions}>
                      <button
                        type="button"
                        className={styles.primaryActionButton}
                        onClick={retryCalendarWorkspace}
                        disabled={isCalendarWorkspacePending}
                      >
                        {isCalendarWorkspacePending ? "Retrying..." : "Retry calendar"}
                      </button>
                    </div>
                  </div>
                ) : isCalendarWorkspacePending || !isCalendarWorkspaceReady ? (
                  <CalendarWorkspaceSkeleton />
                ) : (
                  <FamloProCalendarGrid
                    calendarColumns={calendarColumns}
                    displayedCalendarRows={filteredCalendarRows}
                    roomSyncSummaries={calendarSyncState.roomStatuses}
                    calendarRateOverrides={calendarRateOverrides}
                    getCalendarRateOverrideKey={getCalendarRateOverrideKey}
                    calendarCellSyncStates={calendarCellSyncStates}
                    getCalendarCellSyncKey={getCalendarCellSyncKey}
                    visibleCalendarRowKinds={visibleCalendarRowKinds}
                    calendarRowKindLabels={CALENDAR_ROW_KIND_LABELS}
                    selectedCalendarRatePlanLabel={selectedCalendarRatePlanLabel}
                    calendarNavigationLabel={calendarNavigationLabel}
                    calendarDatePickerValue={calendarDatePickerValue}
                    onCalendarDatePickerChange={setCalendarDatePickerValue}
                    onCalendarDatePickerSubmit={handleCalendarDatePickerJump}
                    onCalendarPreviousMonth={() => handleCalendarMonthShift(-1)}
                    onCalendarNextMonth={() => handleCalendarMonthShift(1)}
                    onCalendarToday={handleCalendarToday}
                    isCalendarJumpPending={isCalendarJumpPending}
                    highlightedCalendarDates={highlightedCalendarDates}
                    isCalendarActionPending={isCalendarActionPending}
                    calendarActionDate={calendarActionDate}
                    onCalendarCellAction={handleCalendarCellAction}
                    onCalendarRateCellAction={handleCalendarRateCellAction}
                    selectedCalendarBooking={selectedCalendarBooking}
                    onCloseCalendarBooking={() => setSelectedCalendarBooking(null)}
                  />
                )}
                {selectedCalendarRateCell ? (
                  <div className={styles.calendarRateModalOverlay} onClick={() => setSelectedCalendarRateCell(null)}>
                    <div
                      className={styles.calendarRateModal}
                      onClick={(event) => event.stopPropagation()}
                      role="dialog"
                      aria-modal="true"
                      aria-label="Rate override editor"
                    >
                      <div className={styles.calendarRateModalHeader}>
                        <div>
                          <div className={styles.listTitle}>Value Override</div>
                          <div className={styles.feedCopy}>
                            Adjust room pricing for the selected date range using the existing Famlo calendar sync flow.
                          </div>
                        </div>
                        <button
                          type="button"
                          className={styles.drawerCloseButton}
                          onClick={() => setSelectedCalendarRateCell(null)}
                          aria-label="Close rate editor"
                        >
                          <X size={18} />
                        </button>
                      </div>

                      <div className={styles.calendarRateModalDetails}>
                        <div className={styles.calendarRateModalDetailRow}>
                          <span className={styles.calendarRateModalLabel}>Room Type</span>
                          <span className={styles.calendarRateModalValue}>{selectedCalendarRateCell.roomType}</span>
                        </div>
                        <div className={styles.calendarRateModalDetailRow}>
                          <span className={styles.calendarRateModalLabel}>Room Name</span>
                          <span className={styles.calendarRateModalValue}>{selectedCalendarRateCell.roomName}</span>
                        </div>
                        <div className={styles.calendarRateModalDetailRow}>
                          <span className={styles.calendarRateModalLabel}>Rate Plan</span>
                          <span className={styles.calendarRateModalValue}>{selectedCalendarRateCell.ratePlanName}</span>
                        </div>
                      </div>

                      <div className={styles.calendarRateModalGrid}>
                        <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                          <span className={styles.fieldLabel}>From date</span>
                          <input
                            className={styles.fieldInput}
                            type="date"
                            value={selectedCalendarRateCell.dateFrom}
                            onChange={(event) =>
                              setSelectedCalendarRateCell((current) => (current ? { ...current, dateFrom: event.target.value } : current))
                            }
                          />
                        </label>
                        <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                          <span className={styles.fieldLabel}>To date</span>
                          <input
                            className={styles.fieldInput}
                            type="date"
                            value={selectedCalendarRateCell.dateTo}
                            onChange={(event) =>
                              setSelectedCalendarRateCell((current) => (current ? { ...current, dateTo: event.target.value } : current))
                            }
                          />
                        </label>
                        <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                          <span className={styles.fieldLabel}>Restriction</span>
                          <select
                            className={styles.fieldInput}
                            value={selectedCalendarRateCell.restrictionType}
                            onChange={(event) => handleCalendarRestrictionChange(event.target.value as CalendarRestrictionType)}
                          >
                            {CALENDAR_RESTRICTION_OPTIONS.map((option) => (
                              <option
                                key={option.value}
                                value={option.value}
                                disabled={
                                  option.value === "availability_offset" ||
                                  option.value === "availability_per_rate" ||
                                  option.value === "max_availability"
                                }
                              >
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {selectedCalendarRateCell.restrictionType === "cta" ||
                        selectedCalendarRateCell.restrictionType === "ctd" ||
                        selectedCalendarRateCell.restrictionType === "stop_sell" ? (
                          <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                            <span className={styles.fieldLabel}>Value</span>
                            <select
                              className={styles.fieldInput}
                              value={calendarRateDraft}
                              onChange={(event) => setCalendarRateDraft(event.target.value)}
                            >
                              <option value="true">Yes / Closed</option>
                              <option value="false">No / Open</option>
                            </select>
                          </label>
                        ) : selectedCalendarRateCell.restrictionType === "block_selected" ||
                          selectedCalendarRateCell.restrictionType === "unblock_selected" ? (
                          <div className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                            <span className={styles.fieldLabel}>Action</span>
                            <div className={styles.feedCopy} style={{ marginBottom: 0 }}>
                              {selectedCalendarRateCell.restrictionType === "block_selected"
                                ? "This will stop selling the selected dates and keep the existing Channex sync queue."
                                : "This will open the selected dates again and keep the existing Channex sync queue."}
                            </div>
                          </div>
                        ) : (
                          <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                            <span className={styles.fieldLabel}>Value</span>
                            <input
                              className={styles.fieldInput}
                              inputMode="numeric"
                              value={calendarRateDraft}
                              onChange={(event) => setCalendarRateDraft(event.target.value)}
                              placeholder={selectedCalendarRateCell.baseAmount > 0 ? String(selectedCalendarRateCell.baseAmount) : "1500"}
                            />
                          </label>
                        )}
                      </div>

                      <div className={styles.calendarRateModalCurrentPrice}>
                        <span className={styles.calendarRateModalLabel}>
                          {selectedCalendarRateCell.restrictionType === "rate" ? "Current Price" : "Current Setting"}
                        </span>
                        <div className={styles.calendarRateModalCurrentValue}>
                          {selectedCalendarRateCell.restrictionType === "rate"
                            ? selectedCalendarRateCell.displayValue
                            : calendarRestrictionLabel(selectedCalendarRateCell.restrictionType)}
                          <span className={styles.calendarRateModalCurrentHint}>
                            {selectedCalendarRateCell.restrictionType === "rate"
                              ? selectedCalendarRateCell.isOverridden
                                ? "Override active"
                                : "Base rate"
                              : "Uses the existing Famlo to Channex sync path"}
                          </span>
                        </div>
                        <div className={styles.calendarRateModalRangeHint}>
                          {formatCalendarDateRange(selectedCalendarRateCell.dateFrom, selectedCalendarRateCell.dateTo)}
                        </div>
                      </div>

                      {calendarRateFeedback ? (
                        <div className={`${styles.feedbackBox} ${calendarRateFeedback.type === "error" ? styles.feedbackError : styles.feedbackSuccess}`}>
                          {calendarRateFeedback.text}
                        </div>
                      ) : null}

                      <div className={styles.calendarRateModalActions}>
                        {selectedCalendarRateCell.restrictionType === "rate" && selectedCalendarRateCell.dateFrom === selectedCalendarRateCell.dateTo ? (
                          <button
                            type="button"
                            className={styles.secondaryActionButton}
                            onClick={() => submitCalendarRate("reset")}
                            disabled={isCalendarRatePending && calendarRateActionDate === selectedCalendarRateCell.date}
                          >
                            Reset to base
                          </button>
                        ) : (
                          <span />
                        )}
                        <div className={styles.calendarRateModalPrimaryActions}>
                          <button
                            type="button"
                            className={styles.secondaryActionButton}
                            onClick={() => setSelectedCalendarRateCell(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className={styles.primaryActionButton}
                            onClick={() => submitCalendarRate("save")}
                            disabled={isCalendarRatePending && calendarRateActionDate === selectedCalendarRateCell.date}
                          >
                            {isCalendarRatePending && calendarRateActionDate === selectedCalendarRateCell.date ? "Saving..." : "OK"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                {isBulkCalendarEditorOpen ? (
                  <div className={styles.calendarDrawerOverlay} onClick={() => setIsBulkCalendarEditorOpen(false)}>
                    <aside
                      className={styles.calendarDrawer}
                      onClick={(event) => event.stopPropagation()}
                      aria-label="Bulk Update"
                    >
                      <div className={styles.calendarDrawerHeader}>
                        <div>
                          <div className={styles.listTitle}>Bulk Update</div>
                          <div className={styles.cardCopy}>
                            Apply rate and restriction changes through the existing Famlo calendar update flow and queued Channex sync path.
                          </div>
                        </div>
                        <button
                          type="button"
                          className={styles.drawerCloseButton}
                          onClick={() => setIsBulkCalendarEditorOpen(false)}
                          aria-label="Close bulk update"
                        >
                          <X className={styles.drawerCloseIcon} />
                        </button>
                      </div>

                      <div className={styles.calendarBulkDrawerSection}>
                        <div className={styles.placeholderTitle}>Affected date range</div>
                        <div className={styles.calendarBulkDateGrid}>
                          <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                            <span className={styles.fieldLabel}>From</span>
                            <input
                              className={styles.fieldInput}
                              type="date"
                              min={calendarTodayIsoDate}
                              value={bulkCalendarDraft.dateFrom}
                              onChange={(event) =>
                                setBulkCalendarDraft((current) => ({ ...current, dateFrom: event.target.value }))
                              }
                            />
                          </label>
                          <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                            <span className={styles.fieldLabel}>To</span>
                            <input
                              className={styles.fieldInput}
                              type="date"
                              min={bulkCalendarDraft.dateFrom || calendarTodayIsoDate}
                              value={bulkCalendarDraft.dateTo}
                              onChange={(event) =>
                                setBulkCalendarDraft((current) => ({ ...current, dateTo: event.target.value }))
                              }
                            />
                          </label>
                        </div>
                      </div>

                      <div className={styles.calendarBulkDrawerSection}>
                        <div className={styles.placeholderTitle}>Weekdays</div>
                        <div className={styles.calendarBulkWeekdayRow}>
                          {CALENDAR_BULK_WEEKDAY_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={`${styles.calendarBulkWeekdayButton} ${calendarBulkWeekdays[option.value] ? styles.calendarBulkWeekdayButtonSelected : ""}`}
                              onClick={() => toggleBulkCalendarWeekday(option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className={styles.calendarBulkDrawerSection}>
                        <div className={styles.placeholderTitle}>Affected restrictions</div>
                        <div className={styles.calendarBulkRestrictionGrid}>
                          <label className={`${styles.checkItem} ${calendarBulkRestrictions.rate ? styles.checkItemSelected : ""}`}>
                            <div>
                              <div className={styles.checkTitle}>Rate</div>
                              <div className={styles.feedCopy}>Update daily room price on the selected dates.</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={calendarBulkRestrictions.rate}
                              onChange={() => toggleBulkCalendarRestriction("rate")}
                            />
                          </label>
                          {calendarBulkRestrictions.rate ? (
                            <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                              <span className={styles.fieldLabel}>Rate value</span>
                              <input
                                className={styles.fieldInput}
                                inputMode="numeric"
                                value={bulkCalendarDraft.rateAmount}
                                onChange={(event) =>
                                  setBulkCalendarDraft((current) => ({ ...current, rateAmount: event.target.value }))
                                }
                                placeholder="1500"
                              />
                            </label>
                          ) : null}

                          <label className={`${styles.checkItem} ${calendarBulkRestrictions.stop_sell ? styles.checkItemSelected : ""}`}>
                            <div>
                              <div className={styles.checkTitle}>Stop Sell</div>
                              <div className={styles.feedCopy}>Close or reopen selling on the selected dates.</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={calendarBulkRestrictions.stop_sell}
                              onChange={() => toggleBulkCalendarRestriction("stop_sell")}
                            />
                          </label>
                          {calendarBulkRestrictions.stop_sell ? (
                            <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                              <span className={styles.fieldLabel}>Stop Sell value</span>
                              <select
                                className={styles.fieldInput}
                                value={bulkCalendarDraft.stopSell === "unchanged" ? "true" : bulkCalendarDraft.stopSell}
                                onChange={(event) =>
                                  setBulkCalendarDraft((current) => ({ ...current, stopSell: event.target.value as "true" | "false" }))
                                }
                              >
                                <option value="true">Closed / Stop selling</option>
                                <option value="false">Open / Resume selling</option>
                              </select>
                            </label>
                          ) : null}

                          <label className={`${styles.checkItem} ${calendarBulkRestrictions.cta ? styles.checkItemSelected : ""}`}>
                            <div>
                              <div className={styles.checkTitle}>Closed To Arrival</div>
                              <div className={styles.feedCopy}>Control arrival restriction through the existing save path.</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={calendarBulkRestrictions.cta}
                              onChange={() => toggleBulkCalendarRestriction("cta")}
                            />
                          </label>
                          {calendarBulkRestrictions.cta ? (
                            <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                              <span className={styles.fieldLabel}>Closed To Arrival value</span>
                              <select
                                className={styles.fieldInput}
                                value={bulkCalendarDraft.cta === "unchanged" ? "true" : bulkCalendarDraft.cta}
                                onChange={(event) =>
                                  setBulkCalendarDraft((current) => ({ ...current, cta: event.target.value as "true" | "false" }))
                                }
                              >
                                <option value="true">Closed</option>
                                <option value="false">Open</option>
                              </select>
                            </label>
                          ) : null}

                          <label className={`${styles.checkItem} ${calendarBulkRestrictions.ctd ? styles.checkItemSelected : ""}`}>
                            <div>
                              <div className={styles.checkTitle}>Closed To Departure</div>
                              <div className={styles.feedCopy}>Control departure restriction through the existing save path.</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={calendarBulkRestrictions.ctd}
                              onChange={() => toggleBulkCalendarRestriction("ctd")}
                            />
                          </label>
                          {calendarBulkRestrictions.ctd ? (
                            <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                              <span className={styles.fieldLabel}>Closed To Departure value</span>
                              <select
                                className={styles.fieldInput}
                                value={bulkCalendarDraft.ctd === "unchanged" ? "true" : bulkCalendarDraft.ctd}
                                onChange={(event) =>
                                  setBulkCalendarDraft((current) => ({ ...current, ctd: event.target.value as "true" | "false" }))
                                }
                              >
                                <option value="true">Closed</option>
                                <option value="false">Open</option>
                              </select>
                            </label>
                          ) : null}

                          <label className={`${styles.checkItem} ${calendarBulkRestrictions.min_stay_arrival ? styles.checkItemSelected : ""}`}>
                            <div>
                              <div className={styles.checkTitle}>Min Stay Arrival</div>
                              <div className={styles.feedCopy}>Set minimum stay for check-in dates.</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={calendarBulkRestrictions.min_stay_arrival}
                              onChange={() => toggleBulkCalendarRestriction("min_stay_arrival")}
                            />
                          </label>
                          {calendarBulkRestrictions.min_stay_arrival ? (
                            <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                              <span className={styles.fieldLabel}>Min Stay Arrival value</span>
                              <input
                                className={styles.fieldInput}
                                inputMode="numeric"
                                value={bulkCalendarDraft.minStayArrival}
                                onChange={(event) =>
                                  setBulkCalendarDraft((current) => ({ ...current, minStayArrival: event.target.value }))
                                }
                                placeholder="2"
                              />
                            </label>
                          ) : null}

                          <label className={`${styles.checkItem} ${calendarBulkRestrictions.min_stay_through ? styles.checkItemSelected : ""}`}>
                            <div>
                              <div className={styles.checkTitle}>Min Stay Through</div>
                              <div className={styles.feedCopy}>Set minimum stay through the selected range.</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={calendarBulkRestrictions.min_stay_through}
                              onChange={() => toggleBulkCalendarRestriction("min_stay_through")}
                            />
                          </label>
                          {calendarBulkRestrictions.min_stay_through ? (
                            <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                              <span className={styles.fieldLabel}>Min Stay Through value</span>
                              <input
                                className={styles.fieldInput}
                                inputMode="numeric"
                                value={bulkCalendarDraft.minStay}
                                onChange={(event) =>
                                  setBulkCalendarDraft((current) => ({ ...current, minStay: event.target.value }))
                                }
                                placeholder="2"
                              />
                            </label>
                          ) : null}

                          <label className={`${styles.checkItem} ${calendarBulkRestrictions.max_stay ? styles.checkItemSelected : ""}`}>
                            <div>
                              <div className={styles.checkTitle}>Max Stay</div>
                              <div className={styles.feedCopy}>Cap the maximum stay length on selected dates.</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={calendarBulkRestrictions.max_stay}
                              onChange={() => toggleBulkCalendarRestriction("max_stay")}
                            />
                          </label>
                          {calendarBulkRestrictions.max_stay ? (
                            <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                              <span className={styles.fieldLabel}>Max Stay value</span>
                              <input
                                className={styles.fieldInput}
                                inputMode="numeric"
                                value={bulkCalendarDraft.maxStay}
                                onChange={(event) =>
                                  setBulkCalendarDraft((current) => ({ ...current, maxStay: event.target.value }))
                                }
                                placeholder="7"
                              />
                            </label>
                          ) : null}
                        </div>
                      </div>

                      <div className={styles.calendarBulkDrawerSection}>
                        <div className={styles.placeholderTitle}>Affected rooms / rates</div>
                        <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                          <span className={styles.fieldLabel}>Search</span>
                          <input
                            className={styles.fieldInput}
                            value={calendarBulkSearch}
                            onChange={(event) => setCalendarBulkSearch(event.target.value)}
                            placeholder="Search rooms or rate plans"
                          />
                        </label>
                        <div className={styles.calendarBulkSelectorGrid}>
                          <div className={styles.calendarBulkSelectorPanel}>
                            <div className={styles.calendarBulkSelectorHeader}>
                              <span className={styles.checkTitle}>Rooms</span>
                              <button
                                type="button"
                                className={styles.secondaryActionButton}
                                onClick={() => setCalendarBulkSelectedRoomIds([])}
                              >
                                All rooms
                              </button>
                            </div>
                            <div className={styles.calendarBulkSelectorList}>
                              {visibleBulkCalendarRoomOptions.map((option) => (
                                <label key={option.value} className={styles.calendarBulkSelectorItem}>
                                  <input
                                    type="checkbox"
                                    checked={calendarBulkSelectedRoomIds.includes(option.value)}
                                    onChange={() => toggleBulkCalendarRoom(option.value)}
                                  />
                                  <span>
                                    <strong>{option.label}</strong>
                                    <small>{option.copy}</small>
                                  </span>
                                </label>
                              ))}
                              {visibleBulkCalendarRoomOptions.length === 0 ? (
                                <div className={styles.feedCopy}>No rooms matched your search.</div>
                              ) : null}
                            </div>
                          </div>

                          <div className={styles.calendarBulkSelectorPanel}>
                            <div className={styles.calendarBulkSelectorHeader}>
                              <span className={styles.checkTitle}>Rate plans</span>
                              <button
                                type="button"
                                className={styles.secondaryActionButton}
                                onClick={() => setCalendarBulkSelectedRatePlanIds([])}
                                disabled={calendarRatePlanOptions.length === 0}
                              >
                                All rate plans
                              </button>
                            </div>
                            <div className={styles.calendarBulkSelectorList}>
                              {visibleBulkCalendarRateOptions.map((option) => (
                                <label key={option.value} className={styles.calendarBulkSelectorItem}>
                                  <input
                                    type="checkbox"
                                    checked={calendarBulkSelectedRatePlanIds.includes(option.value)}
                                    onChange={() => toggleBulkCalendarRatePlan(option.value)}
                                  />
                                  <span>
                                    <strong>{option.label}</strong>
                                    <small>{roomById.get(option.stayUnitId)?.name ?? "Mapped room"}</small>
                                  </span>
                                </label>
                              ))}
                              {calendarRatePlanOptions.length === 0 ? (
                                <div className={styles.feedCopy}>Rate plan selection will appear here once mapped plans are available.</div>
                              ) : null}
                              {calendarRatePlanOptions.length > 0 && visibleBulkCalendarRateOptions.length === 0 ? (
                                <div className={styles.feedCopy}>No rate plans matched your search.</div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className={styles.feedCopy}>
                          Bulk Update will target {effectiveBulkCalendarRoomIds.length} room(s) using the existing Famlo save API.
                        </div>
                      </div>

                      {bulkCalendarFeedback ? (
                        <div className={`${styles.feedbackBox} ${bulkCalendarFeedback.type === "error" ? styles.feedbackError : styles.feedbackSuccess}`}>
                          {bulkCalendarFeedback.text}
                        </div>
                      ) : null}

                      <div className={styles.calendarRateModalActions}>
                        <span className={styles.feedCopy}>Past dates remain locked and are skipped automatically.</span>
                        <div className={styles.calendarRateModalPrimaryActions}>
                          <button
                            type="button"
                            className={styles.secondaryActionButton}
                            onClick={() => setIsBulkCalendarEditorOpen(false)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className={styles.primaryActionButton}
                            onClick={submitBulkCalendarEditor}
                            disabled={isBulkCalendarPending}
                          >
                            {isBulkCalendarPending ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    </aside>
                  </div>
                ) : null}
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
                              <div className={styles.mappingSubcopy}>
                                {channel.setupModeLabel} · {channel.progressPercent}% complete
                              </div>
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
            <section className={`${styles.propertyCenterShell} ${styles.propertyCenterShellLuxury} ${styles.bookingsWorkspacePanel}`}>
              <div className={styles.bookingsWorkspaceStatsGrid}>
                <article className={styles.bookingsWorkspaceStatCard}>
                  <span className={`${styles.bookingsWorkspaceStatIcon} ${styles.bookingsWorkspaceStatIconBlue}`}>
                    <CalendarDays size={18} />
                  </span>
                  <div>
                    <div className={styles.bookingsWorkspaceStatValue}>{totalBookingsCount}</div>
                    <div className={styles.bookingsWorkspaceStatLabel}>Total Bookings</div>
                    <div className={styles.bookingsWorkspaceStatMeta}>All time</div>
                  </div>
                </article>
                <article className={styles.bookingsWorkspaceStatCard}>
                  <span className={`${styles.bookingsWorkspaceStatIcon} ${styles.bookingsWorkspaceStatIconGreen}`}>
                    <CheckCircle2 size={18} />
                  </span>
                  <div>
                    <div className={styles.bookingsWorkspaceStatValue}>{confirmedBookingsTodayCount}</div>
                    <div className={styles.bookingsWorkspaceStatLabel}>Confirmed</div>
                    <div className={styles.bookingsWorkspaceStatMeta}>Today</div>
                  </div>
                </article>
                <article className={styles.bookingsWorkspaceStatCard}>
                  <span className={`${styles.bookingsWorkspaceStatIcon} ${styles.bookingsWorkspaceStatIconOrange}`}>
                    <Clock3 size={18} />
                  </span>
                  <div>
                    <div className={styles.bookingsWorkspaceStatValue}>{pendingBookingsTodayCount}</div>
                    <div className={styles.bookingsWorkspaceStatLabel}>Pending</div>
                    <div className={styles.bookingsWorkspaceStatMeta}>Today</div>
                  </div>
                </article>
                <article className={styles.bookingsWorkspaceStatCard}>
                  <span className={`${styles.bookingsWorkspaceStatIcon} ${styles.bookingsWorkspaceStatIconRed}`}>
                    <X size={18} />
                  </span>
                  <div>
                    <div className={styles.bookingsWorkspaceStatValue}>{cancelledBookingsTodayCount}</div>
                    <div className={styles.bookingsWorkspaceStatLabel}>Cancelled</div>
                    <div className={styles.bookingsWorkspaceStatMeta}>Today</div>
                  </div>
                </article>
                <article className={styles.bookingsWorkspaceStatCard}>
                  <span className={`${styles.bookingsWorkspaceStatIcon} ${styles.bookingsWorkspaceStatIconPurple}`}>
                    <BadgeIndianRupee size={18} />
                  </span>
                  <div>
                    <div className={styles.bookingsWorkspaceStatValue}>{formatCurrency(thisMonthRevenueValue)}</div>
                    <div className={styles.bookingsWorkspaceStatLabel}>Total Revenue</div>
                    <div className={styles.bookingsWorkspaceStatMeta}>This Month</div>
                  </div>
                </article>
                <article className={styles.bookingsWorkspaceStatCard}>
                  <span className={`${styles.bookingsWorkspaceStatIcon} ${styles.bookingsWorkspaceStatIconBlue}`}>
                    <TrendingUp size={18} />
                  </span>
                  <div>
                    <div className={styles.bookingsWorkspaceStatValue}>{occupancyThisMonthPercent}%</div>
                    <div className={styles.bookingsWorkspaceStatLabel}>Occupancy</div>
                    <div className={styles.bookingsWorkspaceStatMeta}>This Month</div>
                  </div>
                </article>
              </div>

              <div className={styles.inlineStatusMetaRow} style={{ marginBottom: 14 }}>
                <span className={`${styles.badge} ${bookingSyncToneClass}`.trim()}>{bookingSyncBadgeLabel}</span>
                <span>{bookingSyncUpdatedLabel}</span>
                <span>{bookingLiveHealth.safeMessage}</span>
              </div>

              <div className={styles.bookingsWorkspaceToolbar}>
                <label className={styles.bookingsWorkspaceSearch}>
                  <Search size={16} />
                  <input
                    type="text"
                    value={bookingSearchQuery}
                    onChange={(event) => {
                      setBookingSearchQuery(event.target.value);
                      setBookingPage(1);
                    }}
                    placeholder="Search by guest name, booking ID or email..."
                  />
                </label>

                <select
                  className={styles.bookingsWorkspaceSelect}
                  value={familyId}
                  onChange={(event) => {
                    setBookingPage(1);
                    switchPropertyContext(event.target.value, { section: "bookings" });
                  }}
                >
                  {propertyOptions.map((option) => (
                    <option key={option.familyId} value={option.familyId}>
                      {option.name || "Selected property"}
                    </option>
                  ))}
                </select>

                <select
                  className={styles.bookingsWorkspaceSelect}
                  value={bookingChannelFilter}
                  onChange={(event) => {
                    setBookingChannelFilter(event.target.value);
                    setBookingPage(1);
                  }}
                >
                  <option value="all">All Channels</option>
                  {bookingChannelOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>

                <select
                  className={styles.bookingsWorkspaceSelect}
                  value={bookingFilter}
                  onChange={(event) => {
                    setBookingFilter(event.target.value as BookingWorkspaceFilter);
                    setBookingPage(1);
                    setExpandedBookingId(null);
                  }}
                >
                  <option value="All">All Status</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Pending approval">Pending</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="Modified / Review needed">Modified / Review</option>
                  <option value="Famlo Direct">Famlo Direct</option>
                  <option value="OTA">OTA</option>
                </select>

                <button type="button" className={styles.bookingsWorkspaceToolbarButton}>
                  <CalendarDays size={16} />
                  {bookingsDateRangeLabel}
                </button>

                <div className={styles.bookingsWorkspaceToolbarMenuWrap}>
                  <button
                    type="button"
                    className={styles.bookingsWorkspaceToolbarButton}
                    onClick={() => {
                      setIsBookingsFilterMenuOpen((current) => !current);
                      setIsBookingsViewMenuOpen(false);
                    }}
                  >
                    <Filter size={16} />
                    Filters
                  </button>
                  {isBookingsFilterMenuOpen ? (
                    <div className={styles.bookingsWorkspacePopover}>
                      <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                        <span className={styles.fieldLabel}>View</span>
                        <select
                          className={styles.fieldInput}
                          value={bookingView}
                          onChange={(event) => {
                            setBookingView(event.target.value as BookingWorkspaceView);
                            setBookingPage(1);
                            setExpandedBookingId(null);
                          }}
                        >
                          {(["Current", "History"] as BookingWorkspaceView[]).map((view) => (
                            <option key={view} value={view}>
                              {view}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                        <span className={styles.fieldLabel}>Date filter</span>
                        <select
                          className={styles.fieldInput}
                          value={bookingDateFilter}
                          onChange={(event) => {
                            setBookingDateFilter(event.target.value as BookingDateFilter);
                            setBookingPage(1);
                          }}
                        >
                          {BOOKING_DATE_FILTERS.map((filter) => (
                            <option key={filter} value={filter}>
                              {filter}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}
                </div>

                <div className={styles.bookingsWorkspaceToolbarMenuWrap}>
                  <button
                    type="button"
                    className={styles.bookingsWorkspaceToolbarButton}
                    onClick={() => {
                      setIsBookingsViewMenuOpen((current) => !current);
                      setIsBookingsFilterMenuOpen(false);
                    }}
                  >
                    <Layers3 size={16} />
                    <ChevronDown size={14} />
                  </button>
                  {isBookingsViewMenuOpen ? (
                    <div className={styles.bookingsWorkspacePopover}>
                      <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                        <span className={styles.fieldLabel}>Rows per page</span>
                        <select
                          className={styles.fieldInput}
                          value={String(bookingPageSize)}
                          onChange={(event) => {
                            setBookingPageSize(Number(event.target.value));
                            setBookingPage(1);
                          }}
                        >
                          <option value="8">8 / page</option>
                          <option value="10">10 / page</option>
                          <option value="20">20 / page</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        className={styles.secondaryActionButton}
                        onClick={() => {
                          setBookingSearchQuery("");
                          setBookingChannelFilter("all");
                          setBookingFilter("All");
                          setBookingView("Current");
                          setBookingDateFilter("All Bookings");
                          setBookingPage(1);
                        }}
                      >
                        Reset view
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {bookingActionFeedback ? (
                <div className={`${styles.feedbackBox} ${bookingActionFeedback.type === "error" ? styles.feedbackError : styles.feedbackSuccess}`}>
                  {bookingActionFeedback.text}
                </div>
              ) : null}

              <div className={styles.bookingsWorkspaceTableCard}>
                <div className={styles.bookingTableScroller}>
                  <table className={`${styles.bookingTable} ${styles.bookingsWorkspaceTable}`}>
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            checked={pagedBookings.length > 0 && pagedBookings.every((booking) => selectedBookingIds.includes(booking.bookingId))}
                            onChange={toggleAllVisibleBookings}
                          />
                        </th>
                        <th>Booking ID</th>
                        <th>Guest</th>
                        <th>Room</th>
                        <th>Check-in</th>
                        <th>Check-out</th>
                        <th>Nights</th>
                        <th>Guests</th>
                        <th>Channel</th>
                        <th>Status</th>
                        <th>Amount</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedBookings.map((booking) => {
                        const isActionNeeded = isActionNeededBooking(booking);
                        const isCancelled = isCancelledBooking(booking);
                        const healthLabel = bookingHealthLabel(booking);
                        const paymentStatus = labelizeToken(booking.paymentStatus, "Payment Pending");
                        const paymentTone =
                          paymentStatus.toLowerCase().includes("paid")
                            ? styles.bookingsWorkspacePaymentPaid
                            : paymentStatus.toLowerCase().includes("refund")
                              ? styles.bookingsWorkspacePaymentRefunded
                              : styles.bookingsWorkspacePaymentPending;
                        const bookingStatusLabel = isCancelled
                          ? "Cancelled"
                          : isPendingApprovalBooking(booking)
                            ? "Pending"
                            : isModifiedReviewBooking(booking)
                              ? "Modified / Review"
                              : isConfirmedBooking(booking)
                                ? "Confirmed"
                                : healthLabel;
                        const bookingStatusClass = isCancelled
                          ? styles.bookingsWorkspaceStatusCancelled
                          : isPendingApprovalBooking(booking)
                            ? styles.bookingsWorkspaceStatusPending
                            : isModifiedReviewBooking(booking)
                              ? styles.bookingsWorkspaceStatusReview
                              : styles.bookingsWorkspaceStatusConfirmed;
                        const isExpanded = expandedBookingId === booking.bookingId;
                        const isEditingOta = editingOtaBookingId === booking.bookingId;
                        const canHostCancel = !isCancelled && !booking.isReviewOnly;
                        const canHostEditOta = OTA_HOST_EDIT_VISIBLE && booking.isOta && !isCancelled && !booking.isReviewOnly;
                        const channelName = normalizeBookingChannel(booking);
                        const stayNights = countOverlappingNights(booking.startDate, booking.checkoutDate, booking.startDate, booking.checkoutDate);
                        const checkInDate = formatCompactDateTime(booking.startDate, "Time unavailable");
                        const checkOutDate = formatCompactDateTime(booking.checkoutDate, "Time unavailable");

                        return (
                          <Fragment key={booking.bookingId}>
                            <tr className={isExpanded ? styles.bookingTableRowExpanded : undefined}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={selectedBookingIds.includes(booking.bookingId)}
                                  onChange={() => toggleBookingSelection(booking.bookingId)}
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className={styles.bookingsWorkspaceBookingLink}
                                  onClick={() =>
                                    setExpandedBookingId((current) => (current === booking.bookingId ? null : booking.bookingId))
                                  }
                                >
                                  #{booking.bookingId.slice(0, 8).toUpperCase()}
                                </button>
                              </td>
                              <td>
                                <div className={styles.bookingsWorkspaceCellPrimary}>{booking.guestDisplayName}</div>
                                <div className={styles.bookingsWorkspaceCellSecondary}>
                                  {booking.guestEmail ?? booking.externalBookingId ?? booking.linkedBookingId ?? "Guest details unavailable"}
                                </div>
                              </td>
                              <td>
                                <div className={styles.bookingsWorkspaceCellPrimary}>{booking.roomName ?? "Room unavailable"}</div>
                                <div className={styles.bookingsWorkspaceCellSecondary}>Room</div>
                              </td>
                              <td>
                                <div className={styles.bookingsWorkspaceCellPrimary}>{checkInDate.primary}</div>
                                <div className={styles.bookingsWorkspaceCellSecondary}>{checkInDate.secondary}</div>
                              </td>
                              <td>
                                <div className={styles.bookingsWorkspaceCellPrimary}>{checkOutDate.primary}</div>
                                <div className={styles.bookingsWorkspaceCellSecondary}>{checkOutDate.secondary}</div>
                              </td>
                              <td>
                                <div className={styles.bookingsWorkspaceCellPrimary}>{stayNights}</div>
                              </td>
                              <td>
                                <div className={styles.bookingsWorkspaceCellPrimary}>
                                  {booking.guestCount != null ? `${booking.guestCount} guest${booking.guestCount === 1 ? "" : "s"}` : "Guest count unavailable"}
                                </div>
                                <div className={styles.bookingsWorkspaceCellSecondary}>
                                  {booking.adultCount != null || booking.childCount != null
                                    ? `${booking.adultCount ?? 0} adult${(booking.adultCount ?? 0) === 1 ? "" : "s"} · ${booking.childCount ?? 0} child${(booking.childCount ?? 0) === 1 ? "" : "ren"}`
                                    : "Adult / child split not provided"}
                                </div>
                              </td>
                              <td>
                                <span className={styles.bookingsWorkspaceChannelBadge}>
                                  <span className={styles.bookingsWorkspaceChannelMarker}>{bookingChannelMarker(channelName)}</span>
                                  {channelName}
                                </span>
                              </td>
                              <td>
                                <span className={`${styles.bookingsWorkspaceStatusPill} ${bookingStatusClass}`}>{bookingStatusLabel}</span>
                              </td>
                              <td>
                                <div className={styles.bookingsWorkspaceCellPrimary}>{booking.amount ?? "Amount pending"}</div>
                                <div className={`${styles.bookingsWorkspaceCellSecondary} ${paymentTone}`}>{paymentStatus}</div>
                              </td>
                              <td>
                                <div className={styles.bookingsWorkspaceActions}>
                                  <button
                                    type="button"
                                    className={styles.bookingsWorkspaceActionsButton}
                                    onClick={() =>
                                      setActiveBookingActionsId((current) => (current === booking.bookingId ? null : booking.bookingId))
                                    }
                                  >
                                    <span aria-hidden="true">...</span>
                                  </button>
                                  {activeBookingActionsId === booking.bookingId ? (
                                    <div className={styles.bookingsWorkspaceActionsMenu}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setExpandedBookingId((current) => (current === booking.bookingId ? null : booking.bookingId));
                                          setActiveBookingActionsId(null);
                                        }}
                                      >
                                        {isExpanded ? "Hide details" : "View details"}
                                      </button>
                                      {!booking.isReviewOnly ? (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => handleDownloadGuestReceipt(booking)}
                                          >
                                            Guest receipt
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleDownloadHostStatement(booking)}
                                          >
                                            Host statement
                                          </button>
                                        </>
                                      ) : null}
                                      {canHostCancel ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setActiveBookingActionsId(null);
                                            void handleHostBookingCancel(booking);
                                          }}
                                        >
                                          {cancellingBookingId === booking.bookingId ? "Cancelling..." : "Cancel booking"}
                                        </button>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                            {isExpanded ? (
                              <tr className={styles.bookingTableExpandedRow}>
                                <td colSpan={12}>
                                  <div className={`${styles.bookingExpandedPanel} ${styles.bookingsWorkspaceExpandedPanel}`}>
                                    <div className={styles.bookingsWorkspaceExpandedGrid}>
                                      <div className={styles.bookingsWorkspaceExpandedCard}>
                                        <div className={styles.bookingExpandedLabel}>Reservation summary</div>
                                        <div className={styles.bookingExpandedText}>
                                          {booking.guestDisplayName} staying at {propertyName} in {booking.roomName}.
                                        </div>
                                        <div className={styles.bookingExpandedBadgeRow}>
                                          <span className={`${styles.bookingsWorkspaceStatusPill} ${bookingStatusClass}`}>{bookingStatusLabel}</span>
                                          <span className={styles.bookingsWorkspaceInfoPill}>{channelName}</span>
                                          <span className={styles.bookingsWorkspaceInfoPill}>{paymentStatus}</span>
                                          {canHostEditOta ? (
                                            <button
                                              type="button"
                                              className={styles.secondaryActionButton}
                                              onClick={() => {
                                                openOtaEditDraft(booking);
                                                setExpandedBookingId(booking.bookingId);
                                                setActiveBookingActionsId(null);
                                              }}
                                            >
                                              Edit OTA booking
                                            </button>
                                          ) : null}
                                        </div>
                                      </div>
                                      <div className={styles.bookingsWorkspaceExpandedCard}>
                                        <div className={styles.bookingExpandedLabel}>Operational notes</div>
                                        <div className={styles.bookingExpandedText}>
                                          Booking created {booking.createdAt ? formatShortDate(booking.createdAt.slice(0, 10)) : "date unavailable"}.
                                          {booking.externalRevisionId ? ` Revision ${booking.externalRevisionId}.` : ""}
                                          {booking.ackStatus ? ` Ack ${labelizeToken(booking.ackStatus, "unknown")}.` : ""}
                                        </div>
                                      </div>
                                    </div>

                                    {isEditingOta && booking.isOta && otaEditDraft ? (
                                      <div className={styles.bookingExpandedEditor}>
                                        <div className={styles.bookingExpandedLabel}>
                                          Send OTA edit to Channex first, then wait for Famlo to confirm the returned revision.
                                        </div>
                                        <div className={styles.bookingExpandedFormGrid}>
                                          <label style={{ display: "grid", gap: "6px", fontSize: "12px", color: "#475569" }}>
                                            <span>Check-in</span>
                                            <input
                                              type="date"
                                              value={otaEditDraft.startDate}
                                              onChange={(event) =>
                                                setOtaEditDraft((current) => (current ? { ...current, startDate: event.target.value } : current))
                                              }
                                              style={bookingEditInputStyle}
                                            />
                                          </label>
                                          <label style={{ display: "grid", gap: "6px", fontSize: "12px", color: "#475569" }}>
                                            <span>Check-out</span>
                                            <input
                                              type="date"
                                              value={otaEditDraft.endDate}
                                              onChange={(event) =>
                                                setOtaEditDraft((current) => (current ? { ...current, endDate: event.target.value } : current))
                                              }
                                              style={bookingEditInputStyle}
                                            />
                                          </label>
                                          <label style={{ display: "grid", gap: "6px", fontSize: "12px", color: "#475569" }}>
                                            <span>Room</span>
                                            <select
                                              value={otaEditDraft.stayUnitId}
                                              onChange={(event) =>
                                                setOtaEditDraft((current) => (current ? { ...current, stayUnitId: event.target.value } : current))
                                              }
                                              style={bookingEditInputStyle}
                                            >
                                              <option value="">Select room</option>
                                              {rooms.map((room) => (
                                                <option key={room.id} value={room.id}>
                                                  {room.name}
                                                </option>
                                              ))}
                                            </select>
                                          </label>
                                          <label style={{ display: "grid", gap: "6px", fontSize: "12px", color: "#475569" }}>
                                            <span>Total amount</span>
                                            <input
                                              type="number"
                                              min="0"
                                              step="0.01"
                                              inputMode="decimal"
                                              value={otaEditDraft.totalAmount}
                                              onChange={(event) =>
                                                setOtaEditDraft((current) => (current ? { ...current, totalAmount: event.target.value } : current))
                                              }
                                              style={bookingEditInputStyle}
                                            />
                                          </label>
                                        </div>
                                        <div className={styles.bookingTableActions}>
                                          <button
                                            type="button"
                                            className={styles.secondaryActionButton}
                                            onClick={() => handleOtaBookingEditSubmit(booking)}
                                            disabled={isSubmittingOtaEdit}
                                          >
                                            {isSubmittingOtaEdit ? "Sending OTA edit..." : "Save OTA edit"}
                                          </button>
                                          <button
                                            type="button"
                                            className={styles.secondaryActionButton}
                                            onClick={() => {
                                              setEditingOtaBookingId(null);
                                              setOtaEditDraft(null);
                                            }}
                                            disabled={isSubmittingOtaEdit}
                                          >
                                            Close edit
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {bookingsUiRows.length === 0 ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyTitle}>No bookings match this filter</div>
                    <div className={styles.emptyCopy}>
                      Adjust search, channel, status, view, or date filters to see more reservations.
                    </div>
                  </div>
                ) : null}

                <div className={styles.bookingsWorkspacePagination}>
                  <div className={styles.bookingsWorkspacePaginationSummary}>
                    Showing {showingBookingsFrom} to {showingBookingsTo} of {bookingsUiRows.length} bookings
                  </div>
                  <div className={styles.bookingsWorkspacePaginationControls}>
                    <button
                      type="button"
                      className={styles.bookingsWorkspacePaginationButton}
                      onClick={() => setBookingPage((current) => Math.max(1, current - 1))}
                      disabled={safeBookingPage <= 1}
                    >
                      Previous
                    </button>
                    {bookingsPaginationItems.map((item) =>
                      typeof item === "string" ? (
                        <span key={item} className={styles.bookingsWorkspacePaginationEllipsis}>
                          ...
                        </span>
                      ) : (
                        <button
                          key={item}
                          type="button"
                          className={`${styles.bookingsWorkspacePaginationButton} ${safeBookingPage === item ? styles.bookingsWorkspacePaginationButtonActive : ""}`}
                          onClick={() => setBookingPage(item)}
                        >
                          {item}
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      className={styles.bookingsWorkspacePaginationButton}
                      onClick={() => setBookingPage((current) => Math.min(bookingsTotalPages, current + 1))}
                      disabled={safeBookingPage >= bookingsTotalPages}
                    >
                      Next
                    </button>
                    <select
                      className={styles.bookingsWorkspacePageSizeSelect}
                      value={String(bookingPageSize)}
                      onChange={(event) => {
                        setBookingPageSize(Number(event.target.value));
                        setBookingPage(1);
                      }}
                    >
                      <option value="8">8 / page</option>
                      <option value="10">10 / page</option>
                      <option value="20">20 / page</option>
                    </select>
                  </div>
                </div>
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

          {(activeSection === "host-profile" || activeSection === "documents") && (
            <section className={`${styles.propertyCenterShell} ${styles.propertyCenterShellLuxury} ${styles.proLuxurySection}`}>
              <div className={styles.propertySubSectionBar}>
                <div>
                  <div className={styles.propertySubSectionTitle}>Edit your profile</div>
                  <div className={styles.propertySubSectionCopy}>
                    Manage the same profile and document details connected to the Famlo host dashboard.
                  </div>
                </div>
                <span className={styles.sectionStatus}>
                  {activeSection === "documents" ? "Documents workspace" : "Profile workspace"}
                </span>
              </div>

              <div className={`${styles.propertyTabLinks} ${styles.profileWorkspaceTabs}`}>
                <button
                  type="button"
                  className={`${styles.propertyTabLinkButton} ${activeSection === "host-profile" ? styles.propertyTabLinkButtonActive : ""}`}
                  onClick={() => setActiveSectionWithUrl("host-profile")}
                >
                  <UserRound className={styles.propertyTabLinkIcon} />
                  <span className={styles.propertyTabLinkText}>
                    <span className={styles.propertyTabLinkTitle}>Profile</span>
                    <span className={styles.propertyTabLinkHint}>Host details, gallery, and reels</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`${styles.propertyTabLinkButton} ${activeSection === "documents" ? styles.propertyTabLinkButtonActive : ""}`}
                  onClick={() => setActiveSectionWithUrl("documents")}
                >
                  <Lock className={styles.propertyTabLinkIcon} />
                  <span className={styles.propertyTabLinkText}>
                    <span className={styles.propertyTabLinkTitle}>Documents</span>
                    <span className={styles.propertyTabLinkHint}>KYC, GST, and compliance records</span>
                  </span>
                </button>
              </div>

              {activeSection === "host-profile" ? (
                <ProHostProfileCenter
                  familyId={familyId}
                  propertyName={propertyName}
                  propertyLocation={locationLabel}
                  city={currentPropertyOption?.city ?? null}
                  state={currentPropertyOption?.state ?? null}
                  documentsHref={`/partnerslogin/home/pro/dashboard?family=${encodeURIComponent(familyId)}&section=documents`}
                  initialProfile={initialProfile}
                  initialListing={initialPropertyContent}
                  initialSchedule={initialSchedule}
                  initialCompliance={initialCompliance}
                  initialPhotos={propertyPhotos}
                />
              ) : (
                <>
                  <DocumentsTab
                    compliance={hostProfileCompliance}
                    setCompliance={setHostProfileCompliance}
                    onSave={handleSaveHostProfileDocuments}
                    saving={isHostProfileDocumentsSaving}
                    appearanceMode={appearanceMode}
                  />
                  {hostProfileDocumentsFeedback ? (
                    <div className={`${styles.feedbackBox} ${hostProfileDocumentsFeedback.type === "error" ? styles.feedbackError : styles.feedbackSuccess}`}>
                      {hostProfileDocumentsFeedback.text}
                    </div>
                  ) : null}
                </>
              )}
            </section>
          )}

          {activeSection === "revenue" && (
            <section className={styles.revenueReportPage}>
              <div className={styles.revenueReportPageHeader}>
                <div>
                  <div className={styles.revenueReportEyebrow}>Revenue &amp; Report</div>
                  <h3 className={styles.revenueReportTitle}>Revenue &amp; Report</h3>
                  <p className={styles.revenueReportSubtitle}>
                    Track earnings, payouts, channel performance, and downloadable reports for your property.
                  </p>
                </div>
                <div className={styles.revenueReportActionRow}>
                  <button type="button" className={styles.revenueReportSecondaryButton} onClick={handleRevenueExportReport}>
                    <Download size={16} />
                    Export Report
                  </button>
                  <button type="button" className={styles.revenueReportSecondaryButton} onClick={handleRevenueDownloadGst}>
                    <FileBarChart2 size={16} />
                    Download GST
                  </button>
                  <button type="button" className={styles.revenueReportPrimaryButton} onClick={handleRevenueRefresh}>
                    <RefreshCcw size={16} />
                    Sync
                  </button>
                </div>
              </div>

              <div className={styles.revenueReportTabs}>
                <button
                  type="button"
                  className={`${styles.revenueReportTabButton} ${styles.revenueReportTabButtonActive}`}
                  onClick={() => setActiveSectionWithUrl("revenue")}
                >
                  <WalletCards size={16} />
                  Revenue
                </button>
                <button
                  type="button"
                  className={styles.revenueReportTabButton}
                  onClick={() => setActiveSectionWithUrl("reports")}
                >
                  <FileBarChart2 size={16} />
                  Report
                </button>
              </div>

              {revenueReportFeedback ? (
                <div className={`${styles.feedbackBox} ${revenueReportFeedback.type === "error" ? styles.feedbackError : styles.feedbackSuccess}`}>
                  {revenueReportFeedback.text}
                </div>
              ) : null}

              <div className={styles.revenueReportFilterRow}>
                <div className={styles.revenueReportWindowChips}>
                  {REVENUE_WINDOWS.map((window) => (
                    <button
                      key={window}
                      type="button"
                      className={`${styles.revenueReportFilterChip} ${revenueWindow === window ? styles.revenueReportFilterChipActive : ""}`}
                      onClick={() => setRevenueWindow(window)}
                    >
                      {window}
                    </button>
                  ))}
                </div>
                <button type="button" className={styles.revenueReportDateButton}>
                  <CalendarDays size={16} />
                  {selectedRevenueDateRangeLabel}
                </button>
              </div>

              <div className={styles.revenueReportMetricsGrid}>
                <article className={styles.revenueMetricCard}>
                  <span className={`${styles.revenueMetricIcon} ${styles.revenueMetricIconGreen}`}>
                    <WalletCards size={18} />
                  </span>
                  <div className={styles.revenueMetricBody}>
                    <div className={styles.revenueMetricLabel}>Total Revenue</div>
                    <div className={styles.revenueMetricValue}>{formatCurrency(effectiveRevenueGrossValue)}</div>
                    <div className={styles.revenueMetricMeta}>
                      {selectedRevenueBookings.length} completed booking{selectedRevenueBookings.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </article>
                <article className={styles.revenueMetricCard}>
                  <span className={`${styles.revenueMetricIcon} ${styles.revenueMetricIconBlue}`}>
                    <Building2 size={18} />
                  </span>
                  <div className={styles.revenueMetricBody}>
                    <div className={styles.revenueMetricLabel}>Direct Revenue</div>
                    <div className={styles.revenueMetricValue}>{formatCurrency(directRevenueValue)}</div>
                    <div className={styles.revenueMetricMeta}>{formatPercentage((directRevenueValue / effectiveRevenueShareBase) * 100)} of total revenue</div>
                  </div>
                </article>
                <article className={styles.revenueMetricCard}>
                  <span className={`${styles.revenueMetricIcon} ${styles.revenueMetricIconSky}`}>
                    <Link2 size={18} />
                  </span>
                  <div className={styles.revenueMetricBody}>
                    <div className={styles.revenueMetricLabel}>OTA Revenue</div>
                    <div className={styles.revenueMetricValue}>{formatCurrency(otaRevenueValue)}</div>
                    <div className={styles.revenueMetricMeta}>{formatPercentage((otaRevenueValue / effectiveRevenueShareBase) * 100)} of total revenue</div>
                  </div>
                </article>
                <article className={styles.revenueMetricCard}>
                  <span className={`${styles.revenueMetricIcon} ${styles.revenueMetricIconOrange}`}>
                    <ArrowRightLeft size={18} />
                  </span>
                  <div className={styles.revenueMetricBody}>
                    <div className={styles.revenueMetricLabel}>Pending Payout</div>
                    <div className={styles.revenueMetricValue}>{formatCurrency(effectiveRevenuePendingPayout)}</div>
                    <div className={styles.revenueMetricMeta}>
                      {hasPayoutSetupIssue ? "Payout compliance needs review" : "Payout in progress"}
                    </div>
                  </div>
                </article>
                <article className={styles.revenueMetricCard}>
                  <span className={`${styles.revenueMetricIcon} ${styles.revenueMetricIconPurple}`}>
                    <BadgeIndianRupee size={18} />
                  </span>
                  <div className={styles.revenueMetricBody}>
                    <div className={styles.revenueMetricLabel}>Famlo Fee</div>
                    <div className={styles.revenueMetricValue}>{formatCurrency(famloFeeValue)}</div>
                    <div className={styles.revenueMetricMeta}>
                      {formatPercentage((famloFeeValue / effectiveRevenueShareBase) * 100)} platform fees collected
                    </div>
                  </div>
                </article>
                <article className={styles.revenueMetricCard}>
                  <span className={`${styles.revenueMetricIcon} ${styles.revenueMetricIconBlue}`}>
                    <TrendingUp size={18} />
                  </span>
                  <div className={styles.revenueMetricBody}>
                    <div className={styles.revenueMetricLabel}>Avg. Booking Value</div>
                    <div className={styles.revenueMetricValue}>{averageBookingValue != null ? formatCurrency(averageBookingValue) : "N/A"}</div>
                    <div className={styles.revenueMetricMeta}>Per completed booking</div>
                  </div>
                </article>
              </div>

              <div className={styles.revenueReportAnalyticsGrid}>
                <article className={`${styles.revenueReportCard} ${styles.revenueOverviewCard}`}>
                  <div className={styles.revenueCardHeader}>
                    <div>
                      <div className={styles.revenueCardTitle}>Revenue Overview</div>
                      <div className={styles.revenueCardValue}>{formatCurrency(effectiveRevenueGrossValue)}</div>
                      <div className={styles.revenueCardMeta}>
                        <span className={revenueOverviewTrendPercent >= 0 ? styles.revenueTrendPositive : styles.revenueTrendNegative}>
                          {revenueOverviewTrendPercent >= 0 ? "▲" : "▼"} {formatPercentage(Math.abs(revenueOverviewTrendPercent))}
                        </span>
                        <span>vs previous point</span>
                        <span>{selectedRevenueDateRangeLabel}</span>
                      </div>
                    </div>
                    <div className={styles.revenueOverviewSelectors}>
                      <button type="button" className={styles.revenueReportSecondaryMiniButton}>Daily</button>
                      <button type="button" className={styles.revenueReportSecondaryMiniButton}>Revenue</button>
                    </div>
                  </div>
                  <svg
                    viewBox={`0 0 ${chartWidth} ${chartHeight + 34}`}
                    className={styles.revenueOverviewSvg}
                    role="img"
                    aria-label="Revenue overview chart"
                  >
                    {[0, 1, 2, 3].map((step) => {
                      const y = (chartHeight / 3) * step;
                      return (
                        <line
                          key={`revenue-grid-${step}`}
                          x1="0"
                          y1={y}
                          x2={chartWidth}
                          y2={y}
                          stroke="#e2e8f0"
                          strokeWidth="1"
                        />
                      );
                    })}
                    {revenueOverviewRows.map((row, index) => {
                      const x = revenueOverviewRows.length === 1 ? chartWidth / 2 : (index / (revenueOverviewRows.length - 1)) * chartWidth;
                      return (
                        <text
                          key={`revenue-label-${row.key}`}
                          x={x}
                          y={chartHeight + 22}
                          textAnchor="middle"
                          fill="#64748b"
                          fontSize="11"
                          fontWeight="700"
                        >
                          {row.label}
                        </text>
                      );
                    })}
                    {revenueOverviewPath ? (
                      <path
                        d={revenueOverviewPath}
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : null}
                    {revenueOverviewRows.map((row, index) => {
                      const x = revenueOverviewRows.length === 1 ? chartWidth / 2 : (index / (revenueOverviewRows.length - 1)) * chartWidth;
                      const y =
                        revenueOverviewMaxValue > 0
                          ? chartHeight - (row.total / revenueOverviewMaxValue) * chartHeight
                          : chartHeight;
                      return <circle key={`revenue-dot-${row.key}`} cx={x} cy={y} r="5" fill="#2563eb" />;
                    })}
                  </svg>
                </article>

                <article className={styles.revenueReportCard}>
                  <div className={styles.revenueCardHeader}>
                    <div>
                      <div className={styles.revenueCardTitle}>Revenue by source</div>
                      <div className={styles.revenueCardMeta}>Completed earnings split by source</div>
                    </div>
                    <button type="button" className={styles.revenueInlineLinkButton}>
                      View details
                    </button>
                  </div>
                  <div className={styles.revenueChannelLayout}>
                    <div className={styles.revenueDonutWrap}>
                      <div className={styles.revenueDonutChart} style={{ background: revenueByChannelGradient }}>
                        <div className={styles.revenueDonutInner}>
                          <div className={styles.revenueDonutValue}>{formatCurrency(effectiveRevenueGrossValue)}</div>
                          <div className={styles.revenueDonutLabel}>Total</div>
                        </div>
                      </div>
                    </div>
                    <div className={styles.revenueChannelList}>
                      {channelRevenueBreakdown.map((item) => (
                        <div key={item.label} className={styles.revenueChannelRow}>
                          <span className={styles.revenueChannelLabel}>
                            <span className={styles.revenueChannelDot} style={{ background: item.color }} />
                            {item.label}
                          </span>
                          <div className={styles.revenueChannelValues}>
                            <strong>{formatCurrency(item.amount)}</strong>
                            <span>{formatPercentage((item.amount / donutBase) * 100)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>

                <article className={styles.revenueReportCard}>
                  <div className={styles.revenueCardHeader}>
                    <div>
                      <div className={styles.revenueCardTitle}>Payout &amp; Settlement Status</div>
                      <div className={styles.revenueCardMeta}>Current host payout posture</div>
                    </div>
                  </div>
                  <div className={styles.revenueStatusStack}>
                    <div className={styles.revenueStatusRow}>
                      <span className={styles.revenueStatusItemLabel}>Available for payout</span>
                      <strong>{formatCurrency(effectiveRevenuePendingPayout)}</strong>
                    </div>
                    <div className={styles.revenueStatusRow}>
                      <span className={styles.revenueStatusItemLabel}>Paid this month</span>
                      <strong>{formatCurrency(effectiveRevenuePaidToYou)}</strong>
                    </div>
                    <div className={styles.revenueStatusRow}>
                      <span className={styles.revenueStatusItemLabel}>Pending compliance</span>
                      <strong>{hasPayoutSetupIssue ? "Action needed" : "Clear"}</strong>
                    </div>
                    <div className={styles.revenueStatusFooter}>
                      <Link href={buildHostPayoutHistoryUrl(familyId)} className={styles.revenueInlineLinkButton}>
                        Resolve now
                      </Link>
                      <span className={styles.revenueMutedMeta}>
                        Next payout date {calendarSyncState.lastSyncedAt ? formatShortDate(calendarSyncState.lastSyncedAt.slice(0, 10)) : "Pending"}
                      </span>
                    </div>
                  </div>
                </article>
              </div>

              <div className={styles.revenueReportLowerGrid}>
                <article className={styles.revenueReportCard}>
                  <div className={styles.revenueCardHeader}>
                    <div>
                      <div className={styles.revenueCardTitle}>Booking Revenue Breakdown</div>
                      <div className={styles.revenueCardMeta}>Compact view of booking states in this period</div>
                    </div>
                  </div>
                  <div className={styles.revenueBreakdownGrid}>
                    {[
                      { label: "Confirmed", icon: CheckCircle2, amount: confirmedRevenueValue, accent: "green" },
                      { label: "Cancelled", icon: X, amount: cancelledRevenueValue, accent: "red" },
                      { label: "Refunded", icon: ArrowRightLeft, amount: refundedRevenueValue, accent: "slate" },
                      { label: "Payment Pending", icon: Clock3, amount: paymentPendingRevenueValue, accent: "orange" },
                      { label: "Manual Booking", icon: UserRound, amount: manualRevenueValue, accent: "purple" },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <div key={item.label} className={styles.revenueBreakdownItem}>
                          <span className={`${styles.revenueBreakdownIcon} ${styles[`revenueBreakdownIcon${item.accent.charAt(0).toUpperCase()}${item.accent.slice(1)}`]}`}>
                            <Icon size={16} />
                          </span>
                          <div className={styles.revenueBreakdownItemBody}>
                            <div className={styles.revenueBreakdownLabel}>{item.label}</div>
                            <div className={styles.revenueBreakdownValue}>{formatCurrency(item.amount)}</div>
                            <div className={styles.revenueBreakdownMeta}>{formatPercentage((item.amount / revenueBreakdownBase) * 100)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>

                <article className={styles.revenueReportCard}>
                  <div className={styles.revenueCardHeader}>
                    <div>
                      <div className={styles.revenueCardTitle}>Recent Transactions</div>
                      <div className={styles.revenueCardMeta}>Latest completed booking revenue lines</div>
                    </div>
                  </div>
                  <div className={styles.revenueTableWrap}>
                    <table className={styles.revenueDataTable}>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Booking ID</th>
                          <th>Guest</th>
                          <th>Room</th>
                          <th>Source</th>
                          <th>Gross Amount</th>
                          <th>Fee</th>
                          <th>Host Payout</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {revenueRecentTransactions.length > 0 ? revenueRecentTransactions.map((booking) => {
                          const transactionStatusClass =
                            isCancelledBooking(booking)
                              ? styles.reportStatusDanger
                              : hasPaymentAttention(booking) || isPendingApprovalBooking(booking)
                                ? styles.reportStatusWarning
                                : styles.reportStatusSuccess;
                          return (
                            <tr key={`txn-${booking.bookingId}`}>
                              <td>{formatShortDate(booking.revenueDate ?? booking.checkoutDate)}</td>
                              <td className={styles.revenueTableLinkCell}>{booking.bookingId.slice(0, 16)}</td>
                              <td>{booking.guestDisplayName}</td>
                              <td>{booking.roomName}</td>
                              <td>{normalizeBookingChannel(booking)}</td>
                              <td>{booking.amount ?? "—"}</td>
                              <td>{booking.platformFeeAmount != null ? formatCurrency(booking.platformFeeAmount) : "—"}</td>
                              <td>{bookingFamloPayoutDisplay(booking)}</td>
                              <td>
                                <span className={`${styles.reportStatusPill} ${transactionStatusClass}`}>
                                  {hostRevenueStatusLabel(booking)}
                                </span>
                              </td>
                            </tr>
                          );
                        }) : (
                          <tr>
                            <td colSpan={9} className={styles.revenueTableEmptyCell}>
                              No completed earnings in this period yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>
              </div>

              <article className={styles.revenueReportCard}>
                <div className={styles.revenueCardHeader}>
                  <div>
                    <div className={styles.revenueCardTitle}>Report Downloads</div>
                    <div className={styles.revenueCardMeta}>Download detailed reports for accounting, tax filing, and performance tracking.</div>
                  </div>
                </div>
                <div className={styles.reportDownloadGrid}>
                  {[
                    reportCards[0],
                    reportCards[1],
                    reportCards[2],
                    {
                      key: "ota-revenue",
                      title: "OTA Revenue Report",
                      reportType: "Performance",
                      description: "Channel revenue performance across OTA sources.",
                      accent: "blue",
                      icon: Activity,
                      formats: ["CSV"],
                      latest: formatMonthLong(currentMonthStartIsoDate),
                    },
                  ].map((card) => {
                    const Icon = card.icon;
                    return (
                      <article key={card.key} className={styles.reportDownloadItem}>
                        <span className={`${styles.reportCardIconBox} ${styles[`reportCardIcon${card.accent.charAt(0).toUpperCase()}${card.accent.slice(1)}`]}`}>
                          <Icon size={18} />
                        </span>
                        <div className={styles.reportDownloadMeta}>
                          <div className={styles.reportDownloadTitle}>{card.title}</div>
                          <div className={styles.reportDownloadMonth}>{card.latest}</div>
                        </div>
                        <div className={styles.reportDownloadActions}>
                          <span className={styles.reportFormatChip}>{card.formats[card.formats.length - 1]}</span>
                          <button
                            type="button"
                            className={styles.revenueReportSecondaryMiniButton}
                            onClick={
                              card.key === "gst-report"
                                ? handleRevenueDownloadGst
                                : card.key === "monthly-revenue"
                                  ? handleRevenueExportReport
                                  : () => handleGenerateReport(card.title, card.reportType, card.formats[0] ?? "CSV")
                            }
                          >
                            <Download size={14} />
                            Download
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </article>
            </section>
          )}

          {activeSection === "reports" && (
            <section className={styles.revenueReportPage}>
              <div className={styles.revenueReportPageHeader}>
                <div>
                  <div className={styles.revenueReportEyebrow}>Revenue &amp; Report</div>
                  <h3 className={styles.revenueReportTitle}>Revenue &amp; Report</h3>
                  <p className={styles.revenueReportSubtitle}>
                    Generate, download, and manage business reports for your property.
                  </p>
                </div>
                <div className={styles.revenueReportActionRow}>
                  <button type="button" className={styles.revenueReportPrimaryButton} onClick={() => handleGenerateReport()}>
                    <Plus size={16} />
                    Generate Report
                  </button>
                  <button type="button" className={styles.revenueReportSecondaryButton} onClick={handleReportExportAll}>
                    <Download size={16} />
                    Export All
                  </button>
                  <button type="button" className={styles.revenueReportSecondaryButton} onClick={handleScrollToSchedules}>
                    <CalendarDays size={16} />
                    Schedule Reports
                  </button>
                </div>
              </div>

              <div className={styles.revenueReportTabs}>
                <button
                  type="button"
                  className={styles.revenueReportTabButton}
                  onClick={() => setActiveSectionWithUrl("revenue")}
                >
                  <WalletCards size={16} />
                  Revenue
                </button>
                <button
                  type="button"
                  className={`${styles.revenueReportTabButton} ${styles.revenueReportTabButtonActive}`}
                  onClick={() => setActiveSectionWithUrl("reports")}
                >
                  <FileBarChart2 size={16} />
                  Report
                </button>
              </div>

              {revenueReportFeedback ? (
                <div className={`${styles.feedbackBox} ${revenueReportFeedback.type === "error" ? styles.feedbackError : styles.feedbackSuccess}`}>
                  {revenueReportFeedback.text}
                </div>
              ) : null}

              <div className={styles.revenueReportFilterRow}>
                <div className={styles.revenueReportWindowChips}>
                  {REPORT_WINDOWS.map((window) => (
                    <button
                      key={window}
                      type="button"
                      className={`${styles.revenueReportFilterChip} ${reportWindow === window ? styles.revenueReportFilterChipActive : ""}`}
                      onClick={() => setReportWindow(window)}
                    >
                      {window}
                    </button>
                  ))}
                </div>
                <button type="button" className={styles.revenueReportDateButton}>
                  <CalendarDays size={16} />
                  {reportDateRangeLabel}
                </button>
                <select
                  className={styles.revenueReportSelect}
                  value={familyId}
                  onChange={(event) => switchPropertyContext(event.target.value, { section: "reports" })}
                >
                  <option value={familyId}>All Properties</option>
                  {propertyOptions
                    .filter((option) => option.familyId !== familyId)
                    .map((option) => (
                      <option key={option.familyId} value={option.familyId}>
                        {option.name || "Selected property"}
                      </option>
                    ))}
                </select>
                <select
                  className={styles.revenueReportSelect}
                  value={reportSourceFilter}
                  onChange={(event) => setReportSourceFilter(event.target.value)}
                >
                  <option value="all">All Sources</option>
                  {bookingChannelOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select
                  className={styles.revenueReportSelect}
                  value={reportRoomFilter}
                  onChange={(event) => setReportRoomFilter(event.target.value)}
                >
                  <option value="all">All Rooms</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
                <details className={styles.revenueReportDetailsMenu}>
                  <summary className={styles.revenueReportSecondaryButton}>
                    <Filter size={16} />
                    More Filters
                  </summary>
                  <div className={styles.revenueReportDetailsPanel}>
                    <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                      <span className={styles.fieldLabel}>Payment Status</span>
                      <select
                        className={styles.fieldInput}
                        value={reportPaymentFilter}
                        onChange={(event) => setReportPaymentFilter(event.target.value)}
                      >
                        <option value="all">All Payment Status</option>
                        <option value="paid">Paid</option>
                        <option value="pending">Pending</option>
                        <option value="refunded">Refunded</option>
                      </select>
                    </label>
                  </div>
                </details>
              </div>

              <div className={styles.reportPageLayout}>
                <div className={styles.reportPageMainColumn}>
                  <article className={styles.revenueReportCard}>
                    <div className={styles.revenueCardHeader}>
                      <div>
                        <div className={styles.revenueCardTitle}>{reportGraph === "bookings" ? "Booking trend" : "Revenue generated"}</div>
                      </div>
                      <button
                        type="button"
                        className={styles.revenueReportSecondaryMiniButton}
                        onClick={() => setReportGraph(reportGraph === "bookings" ? "revenue" : "bookings")}
                      >
                        {reportGraph === "bookings" ? "Show revenue graph" : "Show booking graph"}
                      </button>
                    </div>
                  </article>
                  <div className={styles.reportCardGrid}>
                    {reportCards.map((card) => {
                      const Icon = card.icon;
                      return (
                        <article key={card.key} className={styles.reportCatalogCard}>
                          <div className={styles.reportCatalogCardHeader}>
                            <span className={`${styles.reportCardIconBox} ${styles[`reportCardIcon${card.accent.charAt(0).toUpperCase()}${card.accent.slice(1)}`]}`}>
                              <Icon size={18} />
                            </span>
                            <ChevronRight size={18} className={styles.reportCatalogChevron} />
                          </div>
                          <div className={styles.reportCatalogTitle}>{card.title}</div>
                          <div className={styles.reportCatalogCopy}>{card.description}</div>
                          <div className={styles.reportCatalogLatest}>Latest: {card.latest}</div>
                          <div className={styles.reportCatalogFooter}>
                            <div className={styles.reportChipRow}>
                              {card.formats.map((format) => (
                                <span key={format} className={styles.reportFormatChip}>
                                  {format}
                                </span>
                              ))}
                            </div>
                            <button
                              type="button"
                              className={styles.revenueReportPrimaryMiniButton}
                              onClick={() => handleGenerateReport(card.title, card.reportType, card.formats[0] ?? "CSV")}
                            >
                              <Download size={14} />
                              Download
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className={styles.reportDataGrid}>
                    <article className={styles.revenueReportCard}>
                      <div className={styles.revenueCardHeader}>
                        <div>
                          <div className={styles.revenueCardTitle}>Recent Generated Reports</div>
                        </div>
                      </div>
                      <div className={styles.revenueTableWrap}>
                        <table className={styles.revenueDataTable}>
                          <thead>
                            <tr>
                              <th>Report Name</th>
                              <th>Type</th>
                              <th>Period</th>
                              <th>Generated On</th>
                              <th>Format</th>
                              <th>Status</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recentGeneratedReports.length > 0 ? recentGeneratedReports.map((report) => {
                              const statusClass = styles.reportStatusSuccess;
                              return (
                                <tr key={report.name}>
                                  <td>{report.name}</td>
                                  <td>{report.type}</td>
                                  <td>{report.period}</td>
                                  <td>{report.generatedOn}</td>
                                  <td>{report.format}</td>
                                  <td>
                                    <span className={`${styles.reportStatusPill} ${statusClass}`}>{report.status}</span>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className={styles.tableIconButton}
                                      onClick={() => handleGenerateReport(report.name, report.type, report.format)}
                                      title={`${report.rowCount} row${report.rowCount === 1 ? "" : "s"} in the last generated export`}
                                    >
                                      <Download size={14} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            }) : (
                              <tr>
                                <td colSpan={7} className={styles.revenueTableEmptyCell}>
                                  No generated reports yet. Download or generate a report to create a real export from current booking data.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className={styles.reportFooterActionRow}>
                        <button type="button" className={styles.revenueReportSecondaryMiniButton}>
                          <Layers3 size={14} />
                          View All Reports
                        </button>
                      </div>
                    </article>

                    <article id="famlo-pro-scheduled-reports" className={styles.revenueReportCard}>
                      <div className={styles.revenueCardHeader}>
                        <div>
                          <div className={styles.revenueCardTitle}>Scheduled Reports</div>
                        </div>
                        <button type="button" className={styles.revenueInlineLinkButton}>
                          View All
                        </button>
                      </div>
                      <div className={styles.revenueTableWrap}>
                        <table className={styles.revenueDataTable}>
                          <thead>
                            <tr>
                              <th>Report</th>
                              <th>Frequency</th>
                              <th>Next Run</th>
                              <th>Status</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {scheduledReports.length > 0 ? scheduledReports.map((report) => {
                              const statusClass = report.status === "Paused" ? styles.reportStatusWarning : styles.reportStatusSuccess;
                              return (
                                <tr key={report.name}>
                                  <td>
                                    <div className={styles.revenueTableCellPrimary}>{report.name}</div>
                                    <div className={styles.revenueTableCellSecondary}>{report.meta}</div>
                                  </td>
                                  <td>{report.frequency}</td>
                                  <td>{report.nextRun}</td>
                                  <td>
                                    <span className={`${styles.reportStatusPill} ${statusClass}`}>{report.status}</span>
                                  </td>
                                  <td>
                                    <button type="button" className={styles.tableIconButton}>
                                      <ChevronDown size={14} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            }) : (
                              <tr>
                                <td colSpan={5} className={styles.revenueTableEmptyCell}>
                                  No scheduled report delivery is configured for this workspace yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className={styles.reportFooterActionRow}>
                        <button type="button" className={styles.revenueReportSecondaryMiniButton} disabled>
                          <Settings2 size={14} />
                          Manage Schedules
                        </button>
                      </div>
                    </article>
                  </div>
                </div>

                <aside className={styles.reportSideColumn}>
                  <article className={styles.revenueReportCard}>
                    <div className={styles.revenueCardHeader}>
                      <div>
                        <div className={styles.revenueCardTitle}>Report Insights</div>
                      </div>
                    </div>
                    <div className={styles.reportInsightsList}>
                      {reportInsightsItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <div key={item.title} className={styles.reportInsightRow}>
                            <span className={`${styles.reportCardIconBox} ${styles[`reportCardIcon${item.accent.charAt(0).toUpperCase()}${item.accent.slice(1)}`]}`}>
                              <Icon size={16} />
                            </span>
                            <div>
                              <div className={styles.reportInsightTitle}>{item.title}</div>
                              <div className={styles.reportInsightCopy}>{item.copy}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button type="button" className={styles.revenueInlineLinkButton}>
                      Learn more about reports
                    </button>
                  </article>

                  <article className={styles.revenueReportCard}>
                    <div className={styles.revenueCardHeader}>
                      <div>
                        <div className={styles.revenueCardTitle}>Custom Report Builder</div>
                      </div>
                    </div>
                    <div className={styles.reportBuilderForm}>
                      <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                        <span className={styles.fieldLabel}>Select Booking Source</span>
                        <select className={styles.fieldInput} value={reportSourceFilter} onChange={(event) => setReportSourceFilter(event.target.value)}>
                          <option value="all">All Sources</option>
                          {bookingChannelOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                        <span className={styles.fieldLabel}>Select Room / Property</span>
                        <select className={styles.fieldInput} value={reportRoomFilter} onChange={(event) => setReportRoomFilter(event.target.value)}>
                          <option value="all">All Properties</option>
                          {rooms.map((room) => (
                            <option key={room.id} value={room.id}>
                              {room.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                        <span className={styles.fieldLabel}>Payment Status</span>
                        <select className={styles.fieldInput} value={reportPaymentFilter} onChange={(event) => setReportPaymentFilter(event.target.value)}>
                          <option value="all">All Payment Status</option>
                          <option value="paid">Paid</option>
                          <option value="pending">Pending</option>
                          <option value="refunded">Refunded</option>
                        </select>
                      </label>
                      <label className={styles.fieldGroup} style={{ marginBottom: 0 }}>
                        <span className={styles.fieldLabel}>Date Range</span>
                        <div className={styles.reportBuilderDateField}>
                          <CalendarDays size={16} />
                          {reportDateRangeLabel}
                        </div>
                      </label>
                      <button type="button" className={styles.revenueReportPrimaryButton} onClick={() => handleGenerateReport()}>
                        <Download size={16} />
                        Generate Custom Report
                      </button>
                    </div>
                  </article>
                </aside>
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
              <div className={styles.cardBody}>
                {settingsFeedback ? (
                  <div className={styles.feedbackBox} data-tone={settingsFeedback.type}>
                    {settingsFeedback.text}
                  </div>
                ) : null}

                <section className={styles.cardInset}>
                  <div className={styles.listTitle}>Account &amp; Profile</div>
                  <div className={styles.feedCopy} style={{ marginBottom: "16px" }}>
                    Core account details and stay timings are shown here from the current Famlo Pro workspace.
                  </div>
                  <div className={styles.placeholderGrid} style={{ marginBottom: "18px" }}>
                    <div className={styles.placeholderRow}>
                      <div className={styles.placeholderTitle}>Host name</div>
                      {isEditingAccountSettings ? (
                        <input
                          className={styles.fieldInput}
                          value={settingsProfileDraft.hostDisplayName}
                          onChange={(event) => setSettingsProfileDraft((current) => ({ ...current, hostDisplayName: event.target.value }))}
                        />
                      ) : (
                        <div className={styles.placeholderValue}>{settingsProfileDraft.hostDisplayName || "Host profile pending"}</div>
                      )}
                    </div>
                    <div className={styles.placeholderRow}>
                      <div className={styles.placeholderTitle}>Phone number</div>
                      {isEditingAccountSettings ? (
                        <div style={{ display: "grid", gap: "8px" }}>
                          <input className={styles.fieldInput} value={settingsProfileDraft.mobileNumber} disabled aria-disabled="true" />
                          <div className={styles.placeholderCopy}>OTP verification required before phone number changes can be enabled here.</div>
                        </div>
                      ) : (
                        <div className={styles.placeholderValue}>{settingsProfileDraft.mobileNumber || "Not added"}</div>
                      )}
                    </div>
                    <div className={styles.placeholderRow}>
                      <div className={styles.placeholderTitle}>Email</div>
                      {isEditingAccountSettings ? (
                        <input
                          className={styles.fieldInput}
                          value={settingsProfileDraft.email}
                          readOnly
                          aria-readonly="true"
                        />
                      ) : (
                        <div className={styles.placeholderValue}>{settingsProfileDraft.email || "Email unavailable in current profile source"}</div>
                      )}
                    </div>
                    <div className={styles.placeholderRow}>
                      <div className={styles.placeholderTitle}>Check-in time</div>
                      {isEditingAccountSettings ? (
                        <input
                          className={styles.fieldInput}
                          type="time"
                          value={settingsPropertyDraft.checkInTime}
                          onChange={(event) => setSettingsPropertyDraft((current) => ({ ...current, checkInTime: event.target.value }))}
                        />
                      ) : (
                        <div className={styles.placeholderValue}>{settingsPropertyDraft.checkInTime || initialSettings.checkInTime || "Not set"}</div>
                      )}
                    </div>
                    <div className={styles.placeholderRow}>
                      <div className={styles.placeholderTitle}>Check-out time</div>
                      {isEditingAccountSettings ? (
                        <input
                          className={styles.fieldInput}
                          type="time"
                          value={settingsPropertyDraft.checkOutTime}
                          onChange={(event) => setSettingsPropertyDraft((current) => ({ ...current, checkOutTime: event.target.value }))}
                        />
                      ) : (
                        <div className={styles.placeholderValue}>{settingsPropertyDraft.checkOutTime || initialSettings.checkOutTime || "Not set"}</div>
                      )}
                    </div>
                    <div className={styles.placeholderRow}>
                      <div className={styles.placeholderTitle}>Password / login security</div>
                      <div style={{ display: "grid", gap: "10px" }}>
                        <div className={styles.placeholderCopy}>Forgot password and session security stay on the existing auth flow.</div>
                        <Link href="/partners/forgot-password" className={styles.secondaryActionButton} style={{ width: "fit-content", textDecoration: "none" }}>
                          Forgot password
                        </Link>
                      </div>
                    </div>
                  </div>
                  <div className={styles.inlineActionRow} style={{ marginBottom: "6px" }}>
                    {isEditingAccountSettings ? (
                      <>
                        <button type="button" className={styles.secondaryActionButton} onClick={() => setIsEditingAccountSettings(false)}>
                          Cancel
                        </button>
                        <button type="button" className={styles.primaryActionButton} onClick={handleSaveSettingsAccount} disabled={isSavingSettingsWorkspace}>
                          {isSavingSettingsWorkspace ? "Saving..." : "Save Account"}
                        </button>
                      </>
                    ) : (
                      <button type="button" className={styles.secondaryActionButton} onClick={() => setIsEditingAccountSettings(true)}>
                        Edit Account
                      </button>
                    )}
                  </div>
                </section>

                <section className={styles.cardInset}>
                  <div className={styles.settingsActionStack}>
                    <ChannexStructureVerifyCard
                      familyId={familyId}
                      propertyCreated={Boolean(channexSetupState.externalPropertyId)}
                      externalPropertyId={channexSetupState.externalPropertyId}
                      roomMappingsReadyCount={channexSetupState.roomMappingsReadyCount}
                      ratePlansReadyCount={channexSetupState.ratePlansReadyCount}
                    />
                    <ChannexPropertyCard
                      familyId={familyId}
                      propertyStatus={channexSetupState.propertyStatus}
                      externalPropertyId={channexSetupState.externalPropertyId}
                      statusMessage={channexSetupState.statusMessage ?? null}
                      roomMappings={channexSetupState.roomMappings}
                      ratePlans={channexSetupState.ratePlans}
                      onSetupStateChange={setChannexSetupState}
                    />
                  </div>
                </section>

                <ChannelFinanceSettingsPanel
                  familyId={familyId}
                  propertyName={propertyName}
                  settings={channelFinanceSettings}
                  isLoading={isChannelFinanceLoading}
                  isSaving={isChannelFinanceSaving}
                  feedback={channelFinanceFeedback}
                  onChange={setChannelFinanceSettings}
                  onSave={handleSaveChannelFinanceSettings}
                />

                <section className={`${styles.cardInset} ${styles.settingsFooterSection}`}>
                  <div className={styles.settingsFooterBar}>
                    <button
                      type="button"
                      className={styles.logoutButton}
                      disabled={isLoggingOut}
                      onClick={() => {
                        startLoggingOut(async () => {
                          try {
                            await signOut();
                          } finally {
                            window.location.assign("/");
                          }
                        });
                      }}
                    >
                      {isLoggingOut ? "Logging out..." : "Log out"}
                    </button>
                    <div className={styles.settingsFooterMeta}>
                      <div className={styles.settingsFooterValue}>@ 2026 Famlo Pro</div>
                      <div className={styles.settingsFooterCopy}>Crafted and operated by Famlo TravelTech Private Limited.</div>
                    </div>
                  </div>
                </section>
              </div>
            </section>
          )}

          {activeSection === "support" && (
            <section className={`${styles.propertyCenterShell} ${styles.propertyCenterShellLuxury} ${styles.proLuxurySection}`}>
              <div>
                <div className={styles.sectionEyebrow}>Support &amp; Resolution</div>
                <h3 className={styles.propertyCenterTitle}>Support &amp; Resolution</h3>
                <p className={styles.propertyCenterCopy}>
                  Need help with a booking, payout, OTA connection, or Famlo Pro setup? Message Team Famlo directly.
                </p>
              </div>
              <div className={styles.cardBody}>
                <SupportTab
                  familyId={familyId}
                  hostCode={hostCode ?? ""}
                  hostName={hostDisplayName}
                  propertyName={propertyName}
                  appearanceMode={appearanceMode}
                />
              </div>
            </section>
          )}

          {bookingDocumentModal ? (
            <BookingDocumentPreviewModal
              state={bookingDocumentModal}
              channelFinanceSettings={channelFinanceSettings}
              onClose={() => setBookingDocumentModal(null)}
              onPrint={handlePrintBookingDocument}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

function ChannelFinanceSettingsPanel({
  familyId,
  propertyName,
  settings,
  isLoading,
  isSaving,
  feedback,
  onChange,
  onSave,
}: Readonly<{
  familyId: string;
  propertyName: string;
  settings: ChannelFinanceSettings;
  isLoading: boolean;
  isSaving: boolean;
  feedback: { type: "success" | "error"; text: string } | null;
  onChange: (settings: ChannelFinanceSettings) => void;
  onSave: () => void;
}>): React.JSX.Element {
  const defaultSettings = createDefaultChannelFinanceSettings(familyId);
  const updateGst = (patch: Partial<ChannelFinanceSettings["gstSettings"]>): void => {
    onChange({ ...settings, gstSettings: { ...settings.gstSettings, ...patch } });
  };
  const updateReceipt = (patch: Partial<ChannelFinanceSettings["receiptTemplate"]>): void => {
    onChange({ ...settings, receiptTemplate: { ...settings.receiptTemplate, ...patch } });
  };
  const updateBusiness = (patch: Partial<ChannelFinanceSettings["hostBusinessDetails"]>): void => {
    onChange({ ...settings, hostBusinessDetails: { ...settings.hostBusinessDetails, ...patch } });
  };
  const updateRule = (index: number, patch: Partial<ChannelCommissionRule>): void => {
    onChange({
      ...settings,
      commissionRules: settings.commissionRules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule
      ),
    });
  };
  const stringValue = (value: string | null | undefined): string => value ?? "";
  const numberValue = (value: number | null | undefined): string => String(value ?? 0);

  return (
    <section className={`${styles.cardInset} ${styles.channelFinancePanel}`}>
      <div className={styles.channelFinanceHeader}>
        <div>
          <div className={styles.listTitle}>Channel Finance</div>
          <div className={styles.feedCopy}>
            Configure OTA commissions, GST defaults, receipt text, and host business details used by booking receipts and host statements.
          </div>
        </div>
        <button type="button" className={styles.primaryActionButton} onClick={onSave} disabled={isSaving || isLoading}>
          {isSaving ? "Saving..." : "Save Channel Finance"}
        </button>
      </div>

      {feedback ? (
        <div className={styles.feedbackBox} data-tone={feedback.type}>
          {feedback.text}
        </div>
      ) : null}

      <div className={styles.channelFinanceSection}>
        <div>
          <div className={styles.channelFinanceSectionTitle}>OTA commission rules</div>
          <div className={styles.feedCopy}>
            Used when actual OTA commission is not available from booking data. Actual booking commission still takes priority.
          </div>
        </div>
        <div className={styles.channelFinanceRules}>
          {settings.commissionRules.map((rule, index) => (
            <article key={`${rule.channelKey}:${index}`} className={styles.channelFinanceRuleCard}>
              <div className={styles.channelFinanceRuleHeader}>
                <input
                  className={styles.fieldInput}
                  value={rule.channelName}
                  onChange={(event) => updateRule(index, { channelName: event.target.value })}
                  aria-label={`${rule.channelName} channel name`}
                />
                <label className={styles.channelFinanceToggle}>
                  <input
                    type="checkbox"
                    checked={rule.isActive}
                    onChange={(event) => updateRule(index, { isActive: event.target.checked })}
                  />
                  Active
                </label>
              </div>
              <div className={styles.channelFinanceRuleGrid}>
                <label className={styles.fieldGroup}>
                  <span>Commission type</span>
                  <select
                    className={styles.fieldInput}
                    value={rule.commissionType}
                    onChange={(event) =>
                      updateRule(index, { commissionType: event.target.value === "flat" ? "flat" : "percentage" })
                    }
                  >
                    <option value="percentage">Percentage</option>
                    <option value="flat">Flat</option>
                  </select>
                </label>
                <label className={styles.fieldGroup}>
                  <span>Commission value</span>
                  <input
                    className={styles.fieldInput}
                    type="number"
                    min="0"
                    max={rule.commissionType === "percentage" ? 100 : undefined}
                    step="0.01"
                    value={numberValue(rule.commissionValue)}
                    onChange={(event) => updateRule(index, { commissionValue: Number(event.target.value) })}
                  />
                </label>
                <label className={styles.fieldGroup}>
                  <span>GST % on commission</span>
                  <input
                    className={styles.fieldInput}
                    type="number"
                    min="0"
                    step="0.01"
                    value={numberValue(rule.gstPercent)}
                    onChange={(event) => updateRule(index, { gstPercent: Number(event.target.value) })}
                  />
                </label>
                <label className={styles.fieldGroup}>
                  <span>Tax mode</span>
                  <select
                    className={styles.fieldInput}
                    value={rule.taxMode}
                    onChange={(event) =>
                      updateRule(index, { taxMode: event.target.value === "inclusive" ? "inclusive" : "exclusive" })
                    }
                  >
                    <option value="exclusive">Exclusive</option>
                    <option value="inclusive">Inclusive</option>
                  </select>
                </label>
                <label className={styles.fieldGroup}>
                  <span>Effective from</span>
                  <input
                    className={styles.fieldInput}
                    type="date"
                    value={stringValue(rule.effectiveFrom)}
                    onChange={(event) => updateRule(index, { effectiveFrom: event.target.value || null })}
                  />
                </label>
                <label className={styles.channelFinanceToggle}>
                  <input
                    type="checkbox"
                    checked={rule.taxOnCommission}
                    onChange={(event) => updateRule(index, { taxOnCommission: event.target.checked })}
                  />
                  Tax on commission
                </label>
              </div>
              <label className={styles.fieldGroup}>
                <span>Notes</span>
                <textarea
                  className={styles.fieldTextarea}
                  value={stringValue(rule.notes)}
                  onChange={(event) => updateRule(index, { notes: event.target.value })}
                  rows={2}
                />
              </label>
            </article>
          ))}
        </div>
      </div>

      <div className={styles.channelFinanceTwoColumn}>
        <div className={styles.channelFinanceSection}>
          <div className={styles.channelFinanceSectionTitle}>GST settings</div>
          <div className={styles.settingsGrid}>
            <label className={styles.channelFinanceToggle}>
              <input
                type="checkbox"
                checked={settings.gstSettings.gstEnabled}
                onChange={(event) => updateGst({ gstEnabled: event.target.checked })}
              />
              GST enabled
            </label>
            <label className={styles.fieldGroup}>
              <span>GSTIN</span>
              <input className={styles.fieldInput} value={stringValue(settings.gstSettings.gstin)} onChange={(event) => updateGst({ gstin: event.target.value })} />
            </label>
            <label className={styles.fieldGroup}>
              <span>Legal business name</span>
              <input className={styles.fieldInput} value={stringValue(settings.gstSettings.legalBusinessName)} onChange={(event) => updateGst({ legalBusinessName: event.target.value })} />
            </label>
            <label className={styles.fieldGroup}>
              <span>Trade name</span>
              <input className={styles.fieldInput} value={stringValue(settings.gstSettings.tradeName)} onChange={(event) => updateGst({ tradeName: event.target.value })} />
            </label>
            <label className={styles.fieldGroup}>
              <span>State</span>
              <input className={styles.fieldInput} value={stringValue(settings.gstSettings.state)} onChange={(event) => updateGst({ state: event.target.value })} />
            </label>
            <label className={styles.fieldGroup}>
              <span>State code</span>
              <input className={styles.fieldInput} value={stringValue(settings.gstSettings.stateCode)} onChange={(event) => updateGst({ stateCode: event.target.value })} />
            </label>
            <label className={styles.channelFinanceToggle}>
              <input
                type="checkbox"
                checked={settings.gstSettings.accommodationGstApplicable}
                onChange={(event) => updateGst({ accommodationGstApplicable: event.target.checked })}
              />
              Accommodation GST applicable
            </label>
            <label className={styles.fieldGroup}>
              <span>Accommodation GST %</span>
              <input className={styles.fieldInput} type="number" min="0" step="0.01" value={numberValue(settings.gstSettings.defaultAccommodationGstPercent)} onChange={(event) => updateGst({ defaultAccommodationGstPercent: Number(event.target.value) })} />
            </label>
            <label className={styles.fieldGroup}>
              <span>Platform fee GST %</span>
              <input className={styles.fieldInput} type="number" min="0" step="0.01" value={numberValue(settings.gstSettings.platformFeeGstPercent)} onChange={(event) => updateGst({ platformFeeGstPercent: Number(event.target.value) })} />
            </label>
            <label className={styles.fieldGroup}>
              <span>Services/extras GST %</span>
              <input className={styles.fieldInput} type="number" min="0" step="0.01" value={numberValue(settings.gstSettings.servicesExtrasGstPercent)} onChange={(event) => updateGst({ servicesExtrasGstPercent: Number(event.target.value) })} />
            </label>
            <label className={styles.fieldGroup}>
              <span>Pricing mode</span>
              <select className={styles.fieldInput} value={settings.gstSettings.taxPricingMode} onChange={(event) => updateGst({ taxPricingMode: event.target.value === "inclusive" ? "inclusive" : "exclusive" })}>
                <option value="exclusive">Tax exclusive</option>
                <option value="inclusive">Tax inclusive</option>
              </select>
            </label>
            <label className={styles.fieldGroup}>
              <span>Invoice prefix</span>
              <input className={styles.fieldInput} value={settings.gstSettings.invoicePrefix} onChange={(event) => updateGst({ invoicePrefix: event.target.value })} />
            </label>
            <label className={styles.fieldGroup}>
              <span>Receipt prefix</span>
              <input className={styles.fieldInput} value={settings.gstSettings.receiptPrefix} onChange={(event) => updateGst({ receiptPrefix: event.target.value })} />
            </label>
          </div>
        </div>

        <div className={styles.channelFinanceSection}>
          <div className={styles.channelFinanceSectionHeader}>
            <div>
              <div className={styles.channelFinanceSectionTitle}>Receipt template</div>
              <div className={styles.feedCopy}>Preview reflects the saved guest receipt defaults.</div>
            </div>
            <button
              type="button"
              className={styles.secondaryActionButton}
              onClick={() => updateReceipt(defaultSettings.receiptTemplate)}
            >
              Restore default
            </button>
          </div>
          <div className={styles.settingsGrid}>
            <label className={styles.fieldGroup}>
              <span>Logo URL</span>
              <input className={styles.fieldInput} value={stringValue(settings.receiptTemplate.logoUrl)} onChange={(event) => updateReceipt({ logoUrl: event.target.value })} />
            </label>
            <label className={styles.fieldGroup}>
              <span>Receipt header title</span>
              <input className={styles.fieldInput} value={settings.receiptTemplate.receiptHeaderTitle} onChange={(event) => updateReceipt({ receiptHeaderTitle: event.target.value })} />
            </label>
            <label className={styles.fieldGroup}>
              <span>Support phone</span>
              <input className={styles.fieldInput} value={stringValue(settings.receiptTemplate.supportPhone)} onChange={(event) => updateReceipt({ supportPhone: event.target.value })} />
            </label>
            <label className={styles.fieldGroup}>
              <span>Support email</span>
              <input className={styles.fieldInput} value={stringValue(settings.receiptTemplate.supportEmail)} onChange={(event) => updateReceipt({ supportEmail: event.target.value })} />
            </label>
          </div>
          <label className={styles.fieldGroup}>
            <span>Address</span>
            <textarea className={styles.fieldTextarea} value={stringValue(settings.receiptTemplate.address)} onChange={(event) => updateReceipt({ address: event.target.value })} rows={2} />
          </label>
          <label className={styles.fieldGroup}>
            <span>Footer note</span>
            <textarea className={styles.fieldTextarea} value={stringValue(settings.receiptTemplate.footerNote)} onChange={(event) => updateReceipt({ footerNote: event.target.value })} rows={2} />
          </label>
          <div className={styles.channelFinanceTogglesGrid}>
            {[
              ["showGstin", "Show GSTIN"],
              ["showGuestContact", "Show guest contact"],
              ["showOtaSource", "Show OTA source"],
              ["showPaymentMode", "Show payment mode"],
              ["showHostSignatureBlock", "Show host signature block"],
              ["showGeneratedByFamlo", "Show Generated by Famlo Pro"],
            ].map(([key, label]) => (
              <label key={key} className={styles.channelFinanceToggle}>
                <input
                  type="checkbox"
                  checked={Boolean(settings.receiptTemplate[key as keyof ChannelFinanceSettings["receiptTemplate"]])}
                  onChange={(event) => updateReceipt({ [key]: event.target.checked } as Partial<ChannelFinanceSettings["receiptTemplate"]>)}
                />
                {label}
              </label>
            ))}
          </div>
          <label className={styles.fieldGroup}>
            <span>Terms &amp; conditions</span>
            <textarea className={styles.fieldTextarea} value={stringValue(settings.receiptTemplate.termsConditions)} onChange={(event) => updateReceipt({ termsConditions: event.target.value })} rows={3} />
          </label>
          <div className={styles.channelFinancePreview}>
            <div className={styles.channelFinancePreviewLogo}>{settings.receiptTemplate.logoUrl ? "Logo connected" : "Famlo Pro"}</div>
            <div>
              <div className={styles.channelFinancePreviewTitle}>{settings.receiptTemplate.receiptHeaderTitle}</div>
              <div className={styles.feedCopy}>{propertyName} · {settings.receiptTemplate.footerNote ?? "This is a booking receipt generated by Famlo Pro."}</div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.channelFinanceSection}>
        <div className={styles.channelFinanceSectionTitle}>Host business details</div>
        <div className={styles.settingsGrid}>
          {[
            ["businessName", "Host/business name"],
            ["ownerFullName", "Owner full name"],
            ["phone", "Phone"],
            ["email", "Email"],
            ["alternatePhone", "Alternate phone"],
            ["addressLine1", "Address line 1"],
            ["addressLine2", "Address line 2"],
            ["city", "City"],
            ["state", "State"],
            ["pinCode", "PIN code"],
            ["country", "Country"],
            ["gstin", "GSTIN"],
            ["pan", "PAN optional"],
            ["bankAccountHolderName", "Bank account holder name"],
            ["bankName", "Bank name"],
            ["accountNumberMasked", "Account number masked"],
            ["ifsc", "IFSC"],
            ["upiId", "UPI ID optional"],
            ["signatureUrl", "Signature URL"],
            ["stampUrl", "Stamp URL"],
            ["businessLogoUrl", "Business logo URL"],
          ].map(([key, label]) => (
            <label key={key} className={styles.fieldGroup}>
              <span>{label}</span>
              <input
                className={styles.fieldInput}
                value={stringValue(settings.hostBusinessDetails[key as keyof ChannelFinanceSettings["hostBusinessDetails"]] as string | null)}
                onChange={(event) => updateBusiness({ [key]: event.target.value } as Partial<ChannelFinanceSettings["hostBusinessDetails"]>)}
              />
            </label>
          ))}
        </div>
        <div className={styles.feedCopy}>
          Bank account numbers are stored and shown only in masked form here. Enter a masked value such as ******1234.
        </div>
      </div>
    </section>
  );
}

function BookingDocumentPreviewModal({
  state,
  channelFinanceSettings,
  onClose,
  onPrint,
}: Readonly<{
  state: BookingDocumentModalState;
  channelFinanceSettings: ChannelFinanceSettings;
  onClose: () => void;
  onPrint: () => void;
}>): React.JSX.Element {
  const booking = state.booking;
  const channelName = normalizeBookingChannel(booking);
  const commission = estimateChannelCommission({
    grossAmount: booking.amountValue,
    actualCommissionAmount: booking.otaCommissionAmount,
    rules: channelFinanceSettings.commissionRules,
    sourceChannel: channelName,
  });
  const netReceivable =
    booking.netPayoutAmount ??
    booking.payoutAmountValue ??
    (booking.amountValue != null
      ? Math.max(
          0,
          booking.amountValue -
            (commission.totalCommissionAmount ?? 0) -
            (booking.platformFeeAmount ?? 0) -
            (booking.taxAmount ?? 0) -
            (booking.refundAdjustmentAmount ?? 0)
        )
      : null);
  const downloadUrl = `${state.url}${state.url.includes("?") ? "&" : "?"}download=1`;
  const paymentCollectMode =
    booking.paymentCollectMode === "OTA_COLLECT"
      ? "OTA collected"
      : booking.paymentCollectMode === "PROPERTY_COLLECT"
        ? "Pay at property"
        : booking.paymentCollectMode === "FAMLO_COLLECT"
          ? "Direct online"
          : "Unknown";

  return (
    <div className={styles.dashboardModalBackdrop} role="dialog" aria-modal="true" aria-label={state.title}>
      <div className={`${styles.dashboardModal} ${styles.bookingDocumentModal}`}>
        <div className={styles.dashboardModalHeader}>
          <div>
            <h3>{state.title}</h3>
            <p>
              {booking.guestDisplayName} · #{booking.bookingId.slice(0, 8).toUpperCase()} · {channelName}
            </p>
          </div>
          <button type="button" className={styles.dashboardModalClose} onClick={onClose} aria-label="Close document preview">
            <X size={18} />
          </button>
        </div>
        <div className={styles.bookingDocumentSummary}>
          <span>Room: {booking.roomName || "Room unavailable"}</span>
          <span>Check-in: {formatShortDate(booking.startDate)}</span>
          <span>Check-out: {formatShortDate(booking.checkoutDate)}</span>
          <span>Amount: {booking.amount ?? (booking.amountValue != null ? formatCurrency(booking.amountValue) : "Not available")}</span>
          <span>Payment: {paymentCollectMode}</span>
          {state.kind === "host_statement" ? (
            <>
              <span>
                OTA commission: {commission.amount != null ? formatCurrency(commission.amount) : "Not available"}
                {" "}({commission.source === "actual" ? "Actual" : commission.source === "estimated" ? "Estimated" : "Pending reconciliation"})
              </span>
              <span>Net receivable: {netReceivable != null ? formatCurrency(netReceivable) : "Pending reconciliation"}</span>
            </>
          ) : null}
        </div>
        <div className={styles.bookingDocumentFrameWrap}>
          <iframe
            id="booking-document-preview-frame"
            title={state.title}
            src={state.url}
            className={styles.bookingDocumentFrame}
          />
        </div>
        <div className={styles.dashboardModalActions}>
          <button type="button" className={styles.secondaryActionButton} onClick={onPrint}>
            Print
          </button>
          <a className={styles.primaryActionButton} href={downloadUrl} target="_blank" rel="noreferrer">
            Download HTML
          </a>
        </div>
      </div>
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

function ChannexPropertyCard({
  familyId,
  propertyStatus,
  externalPropertyId,
  statusMessage,
  roomMappings,
  ratePlans,
  onSetupStateChange,
}: Readonly<{
  familyId: string;
  propertyStatus: string;
  externalPropertyId: string | null;
  statusMessage: string | null;
  roomMappings: ChannexSetupViewState["roomMappings"];
  ratePlans: ChannexSetupViewState["ratePlans"];
  onSetupStateChange: (state: ChannexSetupViewState) => void;
}>): React.JSX.Element {
  const [isCreating, startCreating] = useTransition();
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
    statusLabel: string;
    missingFields?: string[];
    invalidFields?: string[];
    validationDetails?: string[];
    bootstrap?: {
      roomMappings: Array<{
        stayUnitId: string;
        name: string;
        status: string;
        externalRoomTypeId?: string | null;
        missingFields?: string[];
        message: string;
      }>;
      ratePlans: Array<{
        stayUnitId: string;
        name: string;
        title?: string;
        status: string;
        externalRatePlanId?: string | null;
        missingFields?: string[];
        message: string;
      }>;
    };
  } | null>(null);

  const alreadyCreated = Boolean(externalPropertyId);
  const derivedStatusLabel = alreadyCreated
    ? "Created"
    : propertyStatus === "needs_repair"
      ? "Needs repair"
    : propertyStatus === "failed"
      ? "Failed"
      : "Not created";

  return (
    <div className={styles.settingsActionCard}>
      <button
        type="button"
        className={styles.settingsActionButton}
        disabled={isCreating}
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
                bootstrap?: {
                  roomMappings?: Array<{
                    stayUnitId: string;
                    name: string;
                    status: string;
                    externalRoomTypeId?: string | null;
                    missingFields?: string[];
                    message: string;
                  }>;
                  ratePlans?: Array<{
                    stayUnitId: string;
                    name: string;
                    title?: string;
                    status: string;
                    externalRatePlanId?: string | null;
                    missingFields?: string[];
                    message: string;
                  }>;
                  ariSync?: {
                    status?: string;
                    queuedJobIds?: string[];
                    message?: string;
                  };
                };
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
                    ? `${payload.message}${
                      typeof payload.bootstrap?.ariSync?.message === "string" && payload.bootstrap.ariSync.message.trim().length > 0
                        ? ` ${payload.bootstrap.ariSync.message}`
                        : ""
                    }`
                    : "Unable to sync rooms and rates.",
                missingFields: Array.isArray(payload.missingFields) ? payload.missingFields : undefined,
                invalidFields: Array.isArray(payload.invalidFields) ? payload.invalidFields : undefined,
                validationDetails: Array.isArray(payload.validationDetails) ? payload.validationDetails : undefined,
                bootstrap:
                  payload.bootstrap &&
                  (Array.isArray(payload.bootstrap.roomMappings) || Array.isArray(payload.bootstrap.ratePlans))
                    ? {
                        roomMappings: Array.isArray(payload.bootstrap.roomMappings) ? payload.bootstrap.roomMappings : [],
                        ratePlans: Array.isArray(payload.bootstrap.ratePlans) ? payload.bootstrap.ratePlans : [],
                      }
                    : undefined,
              });

              const stateResponse = await fetch("/api/host/pro/channel/channex/setup-state", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ familyId }),
              });
              const statePayload = (await stateResponse.json()) as Partial<ChannexSetupViewState> & { ok?: boolean };
              if (stateResponse.ok && statePayload.ok) {
                onSetupStateChange({
                  propertyStatus: typeof statePayload.propertyStatus === "string" ? statePayload.propertyStatus : propertyStatus,
                  externalPropertyId:
                    "externalPropertyId" in statePayload
                      ? (typeof statePayload.externalPropertyId === "string" ? statePayload.externalPropertyId : null)
                      : externalPropertyId,
                  statusMessage: typeof statePayload.statusMessage === "string" ? statePayload.statusMessage : null,
                  activeRoomsCount:
                    typeof statePayload.activeRoomsCount === "number" ? statePayload.activeRoomsCount : roomMappings.length,
                  roomMappingsReadyCount:
                    typeof statePayload.roomMappingsReadyCount === "number" ? statePayload.roomMappingsReadyCount : 0,
                  ratePlansReadyCount:
                    typeof statePayload.ratePlansReadyCount === "number" ? statePayload.ratePlansReadyCount : 0,
                  roomMappings: Array.isArray(statePayload.roomMappings)
                    ? statePayload.roomMappings as ChannexSetupViewState["roomMappings"]
                    : roomMappings,
                  ratePlans: Array.isArray(statePayload.ratePlans)
                    ? statePayload.ratePlans as ChannexSetupViewState["ratePlans"]
                    : ratePlans,
                });
              } else if (response.ok && payload.ok) {
                onSetupStateChange({
                  propertyStatus:
                    payload.status === "already_created" || payload.status === "created" ? "connected" : propertyStatus,
                  externalPropertyId:
                    typeof payload.externalPropertyId === "string" ? payload.externalPropertyId : externalPropertyId,
                  statusMessage: null,
                  activeRoomsCount: roomMappings.length,
                  roomMappingsReadyCount:
                    Array.isArray(payload.bootstrap?.roomMappings)
                      ? payload.bootstrap.roomMappings.filter((room) => Boolean(room.externalRoomTypeId)).length
                      : roomMappings.filter((room) => Boolean(room.externalRoomTypeId)).length,
                  ratePlansReadyCount:
                    Array.isArray(payload.bootstrap?.ratePlans)
                      ? payload.bootstrap.ratePlans.filter((plan) => Boolean(plan.externalRatePlanId)).length
                      : ratePlans.filter((plan) => Boolean(plan.externalRatePlanId)).length,
                  roomMappings: Array.isArray(payload.bootstrap?.roomMappings)
                    ? payload.bootstrap.roomMappings.map((room) => ({
                        stayUnitId: room.stayUnitId,
                        name: room.name,
                        status: room.status,
                        externalRoomTypeId: room.externalRoomTypeId ?? null,
                      }))
                    : roomMappings,
                  ratePlans: Array.isArray(payload.bootstrap?.ratePlans)
                    ? payload.bootstrap.ratePlans.map((plan) => ({
                        stayUnitId: plan.stayUnitId,
                        name: plan.name,
                        title: plan.title ?? `Standard Rate - ${plan.name}`,
                        status: plan.status,
                        externalRatePlanId: plan.externalRatePlanId ?? null,
                      }))
                    : ratePlans,
                });
              }
            } catch (error) {
              setFeedback({
                ok: false,
                statusLabel: "Failed",
                message: error instanceof Error ? error.message : "Unable to prepare or refresh Channex room and rate readiness.",
              });
            }
          });
        }}
      >
        {isCreating ? "Preparing..." : "Prepare / refresh readiness"}
      </button>
      <div className={styles.feedCopy} style={{ marginTop: 8 }}>
        Prepares or refreshes Channex room and rate readiness for this property. This does not activate OTA channels or mark any provider live.
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
          {(feedback.bootstrap?.roomMappings?.length ?? 0) > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div className={styles.feedCopy}>Room mapping status</div>
              {(feedback.bootstrap?.roomMappings ?? []).map((room) => (
                <div key={room.stayUnitId} className={styles.feedCopy}>
                  - {room.name} {"->"} {room.status}
                  {room.externalRoomTypeId ? ` (${room.externalRoomTypeId})` : ""}
                  {room.missingFields && room.missingFields.length > 0 ? ` · Missing: ${room.missingFields.join(", ")}` : ""}
                </div>
              ))}
            </div>
          ) : null}
          {(feedback.bootstrap?.ratePlans?.length ?? 0) > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div className={styles.feedCopy}>Rate plan status</div>
              {(feedback.bootstrap?.ratePlans ?? []).map((plan) => (
                <div key={`${plan.stayUnitId}:${plan.title ?? plan.name}`} className={styles.feedCopy}>
                  - {plan.title ?? "Standard Rate"} {"->"} {plan.status}
                  {plan.externalRatePlanId ? ` (${plan.externalRatePlanId})` : ""}
                  {plan.missingFields && plan.missingFields.length > 0 ? ` · Missing: ${plan.missingFields.join(", ")}` : ""}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {!feedback && statusMessage ? (
        <div className={`${styles.feedbackBox} ${styles.feedbackError}`}>{statusMessage}</div>
      ) : null}
      {!feedback && (roomMappings.length > 0 || ratePlans.length > 0) ? (
        <div className={`${styles.feedbackBox} ${styles.feedbackSuccess}`}>
          {externalPropertyId ? `Status: ${derivedStatusLabel}. External property ID: ${externalPropertyId}.` : "Waiting for provider property creation."}
          {roomMappings.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div className={styles.feedCopy}>Room mapping status</div>
              {roomMappings.map((room) => (
                <div key={room.stayUnitId} className={styles.feedCopy}>
                  - {room.name} {"->"} {room.status}
                  {room.externalRoomTypeId ? ` (${room.externalRoomTypeId})` : ""}
                </div>
              ))}
            </div>
          ) : null}
          {ratePlans.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div className={styles.feedCopy}>Rate plan status</div>
              {ratePlans.map((plan) => (
                <div key={`${plan.stayUnitId}:${plan.title}`} className={styles.feedCopy}>
                  - {plan.title} {"->"} {plan.status}
                  {plan.externalRatePlanId ? ` (${plan.externalRatePlanId})` : ""}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
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
  roomMappingsReadyCount,
  ratePlansReadyCount,
}: Readonly<{
  familyId: string;
  propertyCreated: boolean;
  externalPropertyId: string | null;
  roomMappingsReadyCount: number;
  ratePlansReadyCount: number;
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
      : roomMappingsReadyCount <= 0
        ? "Map at least one Channex room type first."
        : ratePlansReadyCount <= 0
          ? "Map at least one Channex rate plan first."
          : null;

  return (
    <div className={styles.settingsActionCard}>
      <button
        type="button"
        className={styles.settingsActionButton}
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
    </div>
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
      mode?: "push_30" | "push_365" | "verify" | "queued";
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
      queuedJobIds?: string[];
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
              {feedback.summary.mode === "queued" ? (
                <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>
                  Queued jobs: {feedback.summary.queuedJobIds?.length ?? 0}
                </span>
              ) : (
                <>
                  <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>Availability changes: {feedback.summary.availabilityChanges}</span>
                  <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>Restriction changes: {feedback.summary.restrictionChanges}</span>
                </>
              )}
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
          {feedback.summary?.mode === "queued" && feedback.summary.queuedJobIds && feedback.summary.queuedJobIds.length > 0 ? (
            <div className={styles.feedCopy} style={{ marginTop: 10 }}>
              Queued job ids: {feedback.summary.queuedJobIds.join(", ")}
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
                  queuedJobIds?: string[];
                };

                const queuedJobIds = Array.isArray(payload.queuedJobIds) ? payload.queuedJobIds : [];
                setFeedback({
                  ok: Boolean(response.ok && (payload.ok ?? payload.status === "queued")),
                  message:
                    typeof payload.message === "string" && payload.message.trim().length > 0
                      ? payload.message
                      : "Unable to push Channex staging ARI.",
                  summary:
                    payload.status === "queued"
                      ? {
                        mode: "queued",
                        windowDays: 30,
                        eligibleRooms,
                        availabilityChanges: 0,
                        restrictionChanges: 0,
                        queuedJobIds,
                      }
                      : typeof payload.eligibleRooms === "number" &&
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
                  queuedJobIds?: string[];
                };

                const queuedJobIds = Array.isArray(payload.queuedJobIds) ? payload.queuedJobIds : [];
                setFeedback({
                  ok: Boolean(response.ok && (payload.ok ?? payload.status === "queued")),
                  message:
                    typeof payload.message === "string" && payload.message.trim().length > 0
                      ? payload.message
                      : "Unable to push Channex 365-day staging ARI.",
                  summary:
                    payload.status === "queued"
                      ? {
                        mode: "queued",
                        windowDays: 365,
                        eligibleRooms,
                        availabilityChanges: 0,
                        restrictionChanges: 0,
                        queuedJobIds,
                      }
                      : typeof payload.eligibleRooms === "number" &&
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
                  queuedJobIds?: string[];
                };

                const queuedJobIds = Array.isArray(payload.queuedJobIds) ? payload.queuedJobIds : [];
                setFeedback({
                  ok: Boolean(response.ok && (payload.ok ?? payload.status === "queued")),
                  message:
                    typeof payload.message === "string" && payload.message.trim().length > 0
                      ? payload.message
                      : "Unable to sync Channex 365-day ARI now.",
                  summary:
                    payload.status === "queued"
                      ? {
                        mode: "queued",
                        windowDays: 365,
                        eligibleRooms,
                        availabilityChanges: 0,
                        restrictionChanges: 0,
                        queuedJobIds,
                      }
                      : typeof payload.eligibleRooms === "number" &&
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
