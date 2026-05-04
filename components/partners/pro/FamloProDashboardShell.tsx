"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useTransition } from "react";
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
  Users,
  WalletCards,
  X,
} from "lucide-react";

import {
  PRO_PROPERTY_MODEL_OPTIONS,
  PRO_PROPERTY_TYPE_OPTIONS,
  propertyModelLabel,
  propertyTypeLabel,
  type HostProSettings,
} from "@/lib/host-pro-settings";
import { type HostProChannelFoundation } from "@/lib/host-pro-channel-foundation";
import { type ChannexConfigSummary as ChannexSummary } from "@/lib/channel-providers/channex/client";
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

interface FamloProDashboardShellProps {
  familyId: string;
  propertyName: string;
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
}

type NavItem = {
  id: ProSectionId;
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  child?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", title: "Dashboard", hint: "Action center", icon: Activity, group: "Core" },
  { id: "setup-guide", title: "Setup Guide", hint: "Go-live readiness", icon: ClipboardList, group: "Core" },
  { id: "rooms-units", title: "Rooms & Units", hint: "Inventory structure", icon: Hotel, group: "Inventory", child: true },
  { id: "rates-restrictions", title: "Rates & Restrictions", hint: "Base pricing shell", icon: BadgeIndianRupee, group: "Inventory", child: true },
  { id: "inventory-calendar", title: "Calendar", hint: "Availability view", icon: CalendarDays, group: "Inventory", child: true },
  { id: "availability-rules", title: "Availability Rules", hint: "Stay controls", icon: Flag, group: "Inventory", child: true },
  { id: "check-times", title: "Check-in / Check-out Time", hint: "Arrival windows", icon: Clock3, group: "Inventory", child: true },
  { id: "connected-channels", title: "Connected Channels", hint: "Provider-neutral", icon: Link2, group: "Channel Manager", child: true },
  { id: "room-mapping", title: "Room Mapping", hint: "Room type links", icon: Layers3, group: "Channel Manager", child: true },
  { id: "rate-mapping", title: "Rate Mapping", hint: "Rate plan links", icon: ArrowRightLeft, group: "Channel Manager", child: true },
  { id: "sync-logs", title: "Sync Logs", hint: "ARI job history", icon: RefreshCcw, group: "Channel Manager", child: true },
  { id: "conflicts", title: "Conflicts", hint: "Mismatch review", icon: ShieldAlert, group: "Channel Manager", child: true },
  { id: "bookings", title: "Bookings", hint: "Source-aware queue", icon: BookCheck, group: "Operations" },
  { id: "messages-reviews", title: "Messages & Reviews", hint: "Inbox shell", icon: MessageSquareMore, group: "Operations" },
  { id: "revenue", title: "Revenue", hint: "Commercial summary", icon: WalletCards, group: "Insights" },
  { id: "reports", title: "Reports", hint: "Exports later", icon: FileBarChart2, group: "Insights" },
  { id: "property", title: "Property", hint: "Identity & structure", icon: Building2, group: "Admin" },
  { id: "ota-content", title: "OTA Content", hint: "Listing readiness", icon: ClipboardList, group: "Admin" },
  { id: "team-groups", title: "Team & Groups", hint: "Role placeholders", icon: Users, group: "Admin" },
  { id: "settings", title: "Settings", hint: "Provider env", icon: Settings2, group: "Admin" },
  { id: "support", title: "Support", hint: "Pilot help", icon: BellRing, group: "Admin" },
];

const GROUP_ORDER = ["Core", "Inventory", "Channel Manager", "Operations", "Insights", "Admin"];

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

function labelizeToken(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  return value.replaceAll("_", " ");
}

function toneBadgeClass(tone: FeedItem["tone"]): string {
  return tone === "success" ? styles.badge : tone === "warning" ? `${styles.badge} ${styles.badgeMuted}` : styles.badge;
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

function joinMissingLabels(items: Array<{ label: string; ready: boolean }>): string {
  const missing = items.filter((item) => !item.ready).map((item) => item.label);
  return missing.length > 0 ? missing.join(", ") : "Nothing missing";
}

function buildSectionDescriptor(
  section: ProSectionId,
  setupProgressPercent: number,
  missingSetupCount: number,
  roomsCount: number
): {
  eyebrow: string;
  title: string;
  copy: string;
  status: string;
} {
  if (section === "setup-guide") {
    return {
      eyebrow: "Core setup",
      title: "Setup Guide",
      copy: "Readiness view for property identity, inventory quality, and future PMS go-live requirements.",
      status: `${setupProgressPercent}% ready`,
    };
  }

  if (section === "rooms-units") {
    return {
      eyebrow: "Inventory",
      title: "Rooms & Units",
      copy: "Read-only stay-unit inventory sourced from current Famlo data without creating duplicate room records.",
      status: `${roomsCount} units`,
    };
  }

  if (section === "rates-restrictions") {
    return {
      eyebrow: "Inventory",
      title: "Rates & Restrictions",
      copy: "Professional pricing shell for future rate plans and restriction controls. No push or sync is active.",
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
      eyebrow: "Inventory",
      title: "Availability Rules",
      copy: "Placeholder for future stay controls, stop-sell logic, and seasonal restriction patterns.",
      status: "Coming soon",
    };
  }

  if (section === "check-times") {
    return {
      eyebrow: "Inventory",
      title: "Check-in / Check-out Time",
      copy: "Operating-time shell for future distribution mirroring and arrival policy management.",
      status: missingSetupCount === 0 ? "Ready to map" : "Read-only",
    };
  }

  if (section === "connected-channels") {
    return {
      eyebrow: "Channel manager",
      title: "Connected Channels",
      copy: "Provider-neutral channel overview. Channex remains the first planned provider, but nothing is connected yet.",
      status: "Not connected",
    };
  }

  if (section === "room-mapping") {
    return {
      eyebrow: "Channel manager",
      title: "Room Mapping",
      copy: "Future workspace for matching Famlo stay units with external provider room types and sellable units.",
      status: "Mapping pending",
    };
  }

  if (section === "rate-mapping") {
    return {
      eyebrow: "Channel manager",
      title: "Rate Mapping",
      copy: "Future workspace for connecting Famlo base pricing to external provider rate plans.",
      status: "Mapping pending",
    };
  }

  if (section === "sync-logs") {
    return {
      eyebrow: "Channel manager",
      title: "Sync Logs",
      copy: "Operational history for future ARI jobs, webhook runs, and booking acknowledgements.",
      status: "No sync activity",
    };
  }

  if (section === "conflicts") {
    return {
      eyebrow: "Channel manager",
      title: "Conflicts",
      copy: "Future review queue for inventory mismatches, booking import exceptions, and mapping gaps.",
      status: "No conflicts",
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
      eyebrow: "Admin",
      title: "Property",
      copy: "Read-only property identity shell backed by existing Famlo source-of-truth records.",
      status: "Read-only",
    };
  }

  if (section === "ota-content") {
    return {
      eyebrow: "Admin",
      title: "OTA Content",
      copy: "Basic Famlo listing can stay simple. OTA channels need extra structured fields before sync can begin.",
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
  propertyName,
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
}: Readonly<FamloProDashboardShellProps>): React.JSX.Element {
  const [activeSection, setActiveSection] = useState<ProSectionId>(initialSection);

  const groupedNavItems = useMemo(
    () =>
      GROUP_ORDER.map((group) => ({
        group,
        items: NAV_ITEMS.filter((item) => item.group === group),
      })),
    []
  );

  const completedSetupCount = setupItems.filter((item) => item.complete).length;
  const missingSetupItems = setupItems.filter((item) => !item.complete);
  const setupProgressPercent = Math.round((completedSetupCount / setupItems.length) * 100);
  const recommendedNextAction =
    missingSetupItems[0]?.hint ??
    "Core Pro setup signals look healthy. Provider mapping and sync steps can follow in a future phase.";
  const sectionDescriptor = buildSectionDescriptor(
    activeSection,
    setupProgressPercent,
    missingSetupItems.length,
    rooms.length
  );
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
  const lastAriSyncLog = channelFoundation.syncLogs.find((log) => log.action === "push_ari_30_day") ?? null;
  const lastBookingFeedLog = channelFoundation.syncLogs.find((log) => log.action === "store_booking_feed_preview") ?? null;

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brandBlock}>
          <div className={styles.brandEyebrow}>Famlo Pro</div>
          <div className={styles.brandTitle}>Professional Dashboard</div>
          <p className={styles.brandCopy}>
            Advanced PMS + Channel Manager shell for serious homestay operations. Provider sync remains disconnected
            until future integrations go live.
          </p>
        </div>

        {groupedNavItems.map((group) => (
          <div key={group.group} className={styles.navGroup}>
            <div className={styles.navGroupLabel}>{group.group}</div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.navButton} ${active ? styles.navButtonActive : ""} ${item.child ? styles.navChild : ""}`}
                  onClick={() => setActiveSection(item.id)}
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
        ))}

        <div className={styles.sidebarFooter}>
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
              {locationLabel} · Famlo Pro professional dashboard shell
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
          {activeSection === "dashboard" && (
            <>
              <section className={styles.heroCard}>
                <div className={styles.heroGrid}>
                  <div>
                    <div className={styles.eyebrow}>Provider-neutral foundation</div>
                    <h2 className={styles.heroTitle}>
                      PMS + Channel Manager shell for operational teams
                    </h2>
                    <p className={styles.heroText}>
                      This Pro workspace is designed around Famlo as the source of truth for property identity, rooms,
                      bookings, and availability. Future providers like Channex can plug in as distribution mirrors without
                      replacing Famlo data ownership.
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
                    <div className={styles.heroPanelTitle}>Current Pro Readiness</div>
                    <div className={styles.heroPanelList}>
                      <div className={styles.heroPanelItem}>
                        <span>Provider environment</span>
                        <strong>Not connected</strong>
                      </div>
                      <div className={styles.heroPanelItem}>
                        <span>Inventory foundation</span>
                        <strong>{rooms.length > 0 ? `${rooms.length} room units found` : "Needs review"}</strong>
                      </div>
                      <div className={styles.heroPanelItem}>
                        <span>Channel sync</span>
                        <strong>Coming soon</strong>
                      </div>
                      <div className={styles.heroPanelItem}>
                        <span>Mapping readiness</span>
                        <strong>{setupProgressPercent >= 50 ? "Preparing" : "Blocked by setup"}</strong>
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
                      <h3 className={styles.cardTitle}>Sync Health</h3>
                      <p className={styles.cardCopy}>
                        Future ARI sync monitoring appears here once providers are connected.
                      </p>
                    </div>
                    <span className={`${styles.badge} ${styles.badgeMuted}`}>Not connected</span>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.stack}>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Provider status</div>
                        <div className={styles.feedCopy}>Channex appears first in the roadmap, but no provider sync is active yet.</div>
                      </div>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Booking import status</div>
                        <div className={styles.feedCopy}>OTA booking import and acknowledgement remain intentionally disabled in this phase.</div>
                      </div>
                      <div className={styles.feedItem}>
                        <div className={styles.feedTitle}>Conflict queue</div>
                        <div className={styles.feedCopy}>No connected channels means there are no channel conflicts to reconcile.</div>
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
                  <h3 className={styles.cardTitle}>Rooms & Units</h3>
                  <p className={styles.cardCopy}>
                    Read-only inventory preview from existing `stay_units_v2` data. No room editing is enabled in this phase.
                  </p>
                </div>
                <span className={styles.badge}>{rooms.length} units</span>
              </div>
              <div className={styles.cardBody}>
                {rooms.length > 0 ? (
                  <>
                    <div className={styles.inlineActionRow}>
                      <Link href={basicRoomUrl} className={styles.secondaryActionLink}>
                        Manage room in Basic Dashboard
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
                    UI shell only. No pricing push, provider mapping, or rate sync is active.
                  </p>
                </div>
                <span className={`${styles.badge} ${styles.badgeMuted}`}>Shell only</span>
              </div>
              <div className={styles.cardBody}>
                <ChannexAriSyncCard
                  familyId={familyId}
                  eligibleRooms={ariSyncEligibleRooms}
                  missingRooms={ariMissingRooms}
                  propertyCreated={canCreateRoomTypes}
                  roomTypesCreated={canCreateRatePlans}
                  lastSyncLog={lastAriSyncLog}
                />
                <div className={styles.placeholderGrid}>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Standard Rate Plan</div>
                    <div className={styles.placeholderValue}>{standardRatePlanName}</div>
                    <div className={styles.placeholderCopy}>Saved from Famlo Pro settings and ready for future distribution mapping.</div>
                  </div>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Provider Sync</div>
                    <div className={styles.placeholderValue}>Not connected</div>
                    <div className={styles.placeholderCopy}>No pricing push or provider rate sync is active in this phase.</div>
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
                    Visual shell only. Existing Famlo calendar logic and iCal behavior remain untouched in this phase.
                  </p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.filterRow}>
                  {CALENDAR_LEGEND.map((item) => (
                    <span key={item.title} className={styles.filterChip}>
                      {item.title} = {item.copy}
                    </span>
                  ))}
                </div>
                <div className={styles.emptyState}>
                  <div className={styles.emptyTitle}>Calendar shell ready for future Pro overlays</div>
                  <div className={styles.emptyCopy}>
                    Future Pro inventory views can layer Famlo bookings, OTA bookings, manual blocks, and approval
                    states here without replacing the existing calendar system.
                  </div>
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
                  <h3 className={styles.cardTitle}>Connected Channels</h3>
                  <p className={styles.cardCopy}>
                    Provider-neutral shell. Channex appears first in the roadmap, but architecture stays open for future providers.
                  </p>
                </div>
                <span className={`${styles.badge} ${styles.badgeMuted}`}>Not connected</span>
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
                    <span className={`${styles.badge} ${styles.badgeMuted}`}>
                      {labelizeToken(primaryProperty?.syncStatus ?? "not_connected", "Not connected")}
                    </span>
                  </div>
                  <div className={styles.providerMetaRow}>
                    <span className={styles.filterChip}>Environment: Staging planned</span>
                    <span className={styles.filterChip}>Foundation: {providerFoundationReady ? "Ready" : "Missing"}</span>
                    <span className={styles.filterChip}>Last sync: {formatDateTime(primaryProperty?.lastSyncedAt ?? null)}</span>
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
                <div className={styles.channelGrid}>
                  {CHANNEL_CARDS.map((channel) => (
                    <article key={channel} className={styles.channelCard}>
                      <div className={styles.channelHeader}>
                        <div>
                          <div className={styles.channelTitle}>{channel}</div>
                          <div className={styles.channelCopy}>Provider connection placeholder</div>
                        </div>
                        <span className={`${styles.badge} ${styles.badgeMuted}`}>Not connected</span>
                      </div>
                      <div className={styles.channelMeta}>
                        <span className={styles.filterChip}>Environment: Staging</span>
                        <span className={styles.filterChip}>Full sync: Not started</span>
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
                    Future ARI and webhook activity will appear here after provider connectivity is enabled.
                  </p>
                </div>
                <span className={`${styles.badge} ${styles.badgeMuted}`}>
                  {channelFoundation.syncLogs.length > 0 ? "History available" : "No activity"}
                </span>
              </div>
              <div className={styles.cardBody}>
                {channelFoundation.syncLogs.length > 0 ? (
                  <div className={styles.logList}>
                    {channelFoundation.syncLogs.map((log) => (
                      <article key={log.id} className={styles.logRow}>
                        <div>
                          <div className={styles.logTitle}>{labelizeToken(log.action, "Sync action")}</div>
                          <div className={styles.logCopy}>{log.message ?? "No detail message stored."}</div>
                        </div>
                        <div className={styles.logMeta}>
                          <span className={`${styles.badge} ${log.status === "success" ? "" : styles.badgeMuted}`.trim()}>
                            {labelizeToken(log.status, "Unknown")}
                          </span>
                          <span className={styles.logTimestamp}>{formatDateTime(log.createdAt)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyTitle}>No sync jobs yet</div>
                    <div className={styles.emptyCopy}>
                      Channel sync is intentionally disabled. Availability, rate, restriction, and booking-import logs will populate here later.
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
                    This queue will flag future inventory mismatches, mapping gaps, and booking-import exceptions.
                  </p>
                </div>
                <span className={`${styles.badge} ${styles.badgeMuted}`}>No conflicts</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.emptyState}>
                  <div className={styles.emptyTitle}>Nothing to reconcile</div>
                  <div className={styles.emptyCopy}>
                    With {connectedPropertyCount} connected properties and no active provider API, there are no room, rate, or booking conflicts to resolve in this phase.
                  </div>
                </div>
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
                />
                <div className={styles.filterRow}>
                  {BOOKING_FILTERS.map((filter) => (
                    <span key={filter} className={styles.filterChip}>{filter}</span>
                  ))}
                </div>
                <div className={styles.emptyState}>
                  <div className={styles.emptyTitle}>No provider bookings connected yet</div>
                  <div className={styles.emptyCopy}>
                    Future OTA imports, modifications, cancellations, and unmapped reservations will surface here once
                    providers are connected. Famlo direct bookings continue to live in existing booking flows today.
                  </div>
                </div>
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
          <div className={styles.listTitle}>Channex staging configuration</div>
          <div className={styles.cardCopy}>
            Safe staging-only adapter check. No properties, rooms, rates, availability, or bookings are created here.
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
          <div className={styles.placeholderCopy}>{labelizeToken(config.environment, "Staging")}</div>
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
                      : "Unable to verify Channex staging connection.",
                });
                router.refresh();
              } catch (error) {
                setFeedback({
                  ok: false,
                  statusLabel: "Failed",
                  message: error instanceof Error ? error.message : "Unable to verify Channex staging connection.",
                });
              }
            });
          }}
        >
          {isChecking ? "Checking..." : "Check staging connection"}
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
}: Readonly<{
  familyId: string;
  eligibleRooms: number;
  missingRooms: number;
  propertyCreated: boolean;
  roomTypesCreated: boolean;
  lastSyncLog: {
    status: string;
    message: string | null;
    createdAt: string | null;
  } | null;
}>): React.JSX.Element {
  const router = useRouter();
  const [isPushing, startPushing] = useTransition();
  const [isVerifying, startVerifying] = useTransition();
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
    summary?: {
      eligibleRooms: number;
      availabilityChanges: number;
      restrictionChanges: number;
      verifiedAvailabilityCount?: number;
      verifiedRateCount?: number;
      availabilityMatchedCount?: number;
      rateMatchedCount?: number;
      dateRange?: { from: string; to: string };
    };
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
          <div className={styles.listTitle}>30-day staging sync</div>
          <div className={styles.cardCopy}>
            Push a limited 30-day staging-only ARI batch to Channex using mapped active rooms. No schedules, production sync, bookings, or iCal writes are introduced here.
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
          <div className={styles.placeholderCopy}>Today + 30 days</div>
        </div>
        <div className={styles.placeholderRow}>
          <div className={styles.placeholderTitle}>Last sync status</div>
          <div className={styles.placeholderCopy}>
            {lastSyncLog ? `${labelizeToken(lastSyncLog.status, "unknown")} · ${formatDateTime(lastSyncLog.createdAt)}` : "Not started"}
          </div>
        </div>
      </div>

      {lastSyncLog?.message ? (
        <div className={styles.feedCopy}>{lastSyncLog.message}</div>
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
          disabled={isPushing || Boolean(blockedMessage)}
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
                  dateRange?: { from: string; to: string };
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
                          eligibleRooms: payload.eligibleRooms,
                          availabilityChanges: payload.availabilityChanges,
                          restrictionChanges: payload.restrictionChanges,
                          verifiedAvailabilityCount:
                            typeof payload.verifiedAvailabilityCount === "number" ? payload.verifiedAvailabilityCount : undefined,
                          verifiedRateCount:
                            typeof payload.verifiedRateCount === "number" ? payload.verifiedRateCount : undefined,
                          dateRange: payload.dateRange,
                        }
                      : undefined,
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
    importStatus: string;
    ackStatus: string;
    updatedAt: string | null;
  }>;
}>): React.JSX.Element {
  const router = useRouter();
  const [isFetching, startFetching] = useTransition();
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
    summary?: {
      revisionsFound: number;
      unmatchedRoomCount: number;
      lastCheckedAt: string | null;
    };
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
          <div className={styles.listTitle}>Channex booking feed</div>
          <div className={styles.cardCopy}>
            Read-only preview of unacknowledged Channex staging booking revisions. Nothing is imported into Famlo bookings yet, and no acknowledgement is sent in this phase.
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
          <div className={styles.placeholderCopy}>Deferred intentionally</div>
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

      {lastSyncLog?.message ? <div className={styles.feedCopy}>{lastSyncLog.message}</div> : null}
      {blockedMessage ? <div className={`${styles.feedbackBox} ${styles.feedbackError}`}>{blockedMessage}</div> : null}

      {feedback ? (
        <div className={`${styles.feedbackBox} ${feedback.ok ? styles.feedbackSuccess : styles.feedbackError}`}>
          {feedback.message}
          {feedback.summary ? (
            <div className={styles.inlineBadgeRow}>
              <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>Revisions found: {feedback.summary.revisionsFound}</span>
              <span className={`${styles.readinessPill} ${feedback.summary.unmatchedRoomCount > 0 ? styles.readinessPillReview : styles.readinessPillOk}`}>
                Unmatched rooms: {feedback.summary.unmatchedRoomCount}
              </span>
              <span className={`${styles.readinessPill} ${styles.readinessPillOk}`}>Last checked: {formatDateTime(feedback.summary.lastCheckedAt)}</span>
            </div>
          ) : null}

          {(feedback.revisions && feedback.revisions.length > 0) || storedRevisions.length > 0 ? (
            <div className={styles.mappingTable} style={{ marginTop: 14 }}>
              <div className={styles.mappingHeader}>Booking</div>
              <div className={styles.mappingHeader}>Status</div>
              <div className={styles.mappingHeader}>Channel</div>
              <div className={styles.mappingHeader}>Dates</div>
              <div className={styles.mappingHeader}>Guest</div>
              <div className={styles.mappingHeader}>Room / Rate</div>
              <div className={styles.mappingHeader}>Amount</div>
              {(feedback.revisions && feedback.revisions.length > 0
                ? feedback.revisions
                : storedRevisions.map((revision) => ({
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
                    importStatus: revision.importStatus,
                    ackStatus: revision.ackStatus,
                  }))).map((revision, index) => (
                <Fragment key={revision.revisionId ?? revision.externalBookingId ?? revision.insertedAt ?? `revision-${index}`}>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{revision.externalBookingId ?? "Unknown booking"}</div>
                    <div className={styles.mappingSubcopy}>Revision {revision.revisionId ?? "Unknown"}</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{labelizeToken(revision.status, "unknown")}</div>
                    <div className={styles.mappingSubcopy}>{revision.importStatus ?? "preview"} · {revision.ackStatus ?? "not_acknowledged"}</div>
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
                    <div className={styles.mappingSubcopy}>Preview only, not imported yet</div>
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
                  revisionsFound?: number;
                  unmatchedRoomCount?: number;
                  lastCheckedAt?: string | null;
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
                    typeof payload.revisionsFound === "number" && typeof payload.unmatchedRoomCount === "number"
                      ? {
                          revisionsFound: payload.revisionsFound,
                          unmatchedRoomCount: payload.unmatchedRoomCount,
                          lastCheckedAt: typeof payload.lastCheckedAt === "string" ? payload.lastCheckedAt : null,
                        }
                      : undefined,
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
