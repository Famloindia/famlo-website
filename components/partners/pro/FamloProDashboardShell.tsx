"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  | "team-groups"
  | "settings"
  | "support";

type RoomSummary = {
  id: string;
  name: string;
  unitType: string;
  maxGuests: number;
  priceFullday: number;
  isActive: boolean;
  amenitiesCount: number;
};

type SetupItem = {
  key: string;
  title: string;
  complete: boolean;
  hint: string;
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
  { id: "team-groups", title: "Team & Groups", hint: "Role placeholders", icon: Users, group: "Admin" },
  { id: "settings", title: "Settings", hint: "Provider env", icon: Settings2, group: "Admin" },
  { id: "support", title: "Support", hint: "Pilot help", icon: BellRing, group: "Admin" },
];

const GROUP_ORDER = ["Core", "Inventory", "Channel Manager", "Operations", "Insights", "Admin"];

const CHANNEL_CARDS = [
  "Channex",
  "Airbnb",
  "Booking.com",
  "Agoda",
  "Expedia",
  "MakeMyTrip / Goibibo",
  "VRBO",
  "Google Hotel",
];

const BOOKING_FILTERS = ["All", "Famlo Direct", "Airbnb", "Booking.com", "Agoda", "Expedia", "Cancelled", "Modified", "Unmapped"];

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

function toneBadgeClass(tone: FeedItem["tone"]): string {
  return tone === "success" ? styles.badge : tone === "warning" ? `${styles.badge} ${styles.badgeMuted}` : styles.badge;
}

export default function FamloProDashboardShell({
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
            {completedSetupCount}/{setupItems.length}
          </div>
          <p className={styles.brandCopy}>
            Setup items are placeholders for future PMS readiness. Channel sync remains intentionally disconnected.
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
                    <strong>{completedSetupCount >= 6 ? "Preparing" : "Blocked by setup"}</strong>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {activeSection === "dashboard" && (
            <>
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
                    <span className={styles.badge}>{completedSetupCount}/{setupItems.length} complete</span>
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

          {activeSection === "setup-guide" && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Setup Guide</h3>
                  <p className={styles.cardCopy}>
                    Future PMS onboarding checklist for property identity, rates, rules, and channel readiness.
                  </p>
                </div>
                <span className={styles.badge}>{completedSetupCount}/{setupItems.length} complete</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.checkGrid}>
                  {setupItems.map((item) => (
                    <div key={item.key} className={styles.checkItem}>
                      <div className={`${styles.checkIcon} ${item.complete ? styles.checkIconDone : styles.checkIconTodo}`}>
                        {item.complete ? <CheckCircle2 size={18} /> : <Lock size={18} />}
                      </div>
                      <div>
                        <div className={styles.checkTitle}>{item.title}</div>
                        <div className={styles.checkMeta}>{item.hint}</div>
                      </div>
                    </div>
                  ))}
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
                  <div className={styles.roomGrid}>
                    {rooms.map((room) => (
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
                      </article>
                    ))}
                  </div>
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
                <div className={styles.placeholderGrid}>
                  {[
                    ["Standard Rate", "Primary rate plan for future distribution mapping."],
                    ["Base Price", "Read-only placeholder for future nightly or base rate controls."],
                    ["Min Stay", "Placeholder for minimum stay restrictions."],
                    ["Max Stay", "Placeholder for maximum stay restrictions."],
                    ["Stop Sell", "Prevent new sales when inventory must close."],
                    ["Closed to Arrival", "Block check-in on selected dates."],
                    ["Closed to Departure", "Block check-out on selected dates."],
                    ["Meal Plan", "Placeholder for future meal-plan mapping."],
                  ].map(([title, copy]) => (
                    <div key={title} className={styles.placeholderRow}>
                      <div className={styles.placeholderTitle}>{title}</div>
                      <div className={styles.placeholderCopy}>{copy}</div>
                    </div>
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
            <PlaceholderSection
              title="Check-in / Check-out Time"
              copy="Operational shell for arrival windows that future channels can mirror."
              items={[
                "Default check-in time",
                "Default check-out time",
                "Early check-in policy placeholder",
                "Late check-out policy placeholder",
              ]}
            />
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
            <PlaceholderSection
              title="Room Mapping"
              copy="Placeholder for mapping Famlo room units to future external room types or unit records."
              items={[
                "Famlo room ↔ provider room type",
                "Primary sellable unit selection",
                "Unmapped room warnings",
                "Draft mapping review",
              ]}
            />
          )}

          {activeSection === "rate-mapping" && (
            <PlaceholderSection
              title="Rate Mapping"
              copy="Placeholder for linking Famlo rates to future external rate plans."
              items={[
                "Standard rate plan mapping",
                "Derived rate plan placeholder",
                "Meal plan placeholder",
                "Unmapped rate warnings",
              ]}
            />
          )}

          {activeSection === "sync-logs" && (
            <PlaceholderSection
              title="Sync Logs"
              copy="Placeholder for future ARI sync jobs, import runs, webhook processing, and acknowledgement logs."
              items={[
                "Availability push jobs",
                "Rate push jobs",
                "Restriction push jobs",
                "Webhook event processing",
              ]}
            />
          )}

          {activeSection === "conflicts" && (
            <PlaceholderSection
              title="Conflicts"
              copy="Placeholder for mismatches between Famlo source-of-truth inventory and future external provider states."
              items={[
                "Room mapping mismatch",
                "Rate mapping mismatch",
                "Booking import mismatch",
                "Availability conflict review",
              ]}
            />
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
                    <div className={styles.placeholderCopy}>Placeholder: vacation rental / hotel selection will live here.</div>
                  </div>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Channel Readiness</div>
                    <div className={styles.placeholderCopy}>Property mapping, room mapping, and rate mapping readiness will be tracked here.</div>
                  </div>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Property Content</div>
                    <div className={styles.placeholderCopy}>Photos and media remain untouched and continue using existing Famlo sources only.</div>
                  </div>
                </div>
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
                    Provider environment placeholders for future distribution setup.
                  </p>
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.placeholderGrid}>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Provider</div>
                    <div className={styles.placeholderCopy}>Channex</div>
                  </div>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Environment</div>
                    <div className={styles.placeholderCopy}>Staging</div>
                  </div>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>API Status</div>
                    <div className={styles.placeholderCopy}>Not connected</div>
                  </div>
                  <div className={styles.placeholderRow}>
                    <div className={styles.placeholderTitle}>Full Sync</div>
                    <div className={styles.placeholderCopy}>Not started</div>
                  </div>
                </div>
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
