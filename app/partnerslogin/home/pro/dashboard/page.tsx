import Link from "next/link";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";

import FamloProDashboardShell from "@/components/partners/pro/FamloProDashboardShell";
import { getChannexConfigSummary } from "@/lib/channel-providers/channex/client";
import { resolveAuthorizedHostSession } from "@/lib/chat-access";
import { parseHostListingMeta } from "@/lib/host-listing-meta";
import { isFamloProDashboardEnabled, loadHostProAccess } from "@/lib/host-pro-access";
import { loadHostProChannelFoundation } from "@/lib/host-pro-channel-foundation";
import { loadHostProSettings } from "@/lib/host-pro-settings";
import { buildHostProSetupReadiness } from "@/lib/host-pro-setup-readiness";
import { loadStayUnitsForSelector } from "@/lib/stay-units";
import { createAdminSupabaseClient } from "@/lib/supabase";

interface FamloProDashboardPageProps {
  searchParams?: Promise<{
    family?: string;
  }>;
}

export const dynamic = "force-dynamic";

function buildBasicFamloPlusUrl(familyId: string): string {
  const base = "/partnerslogin/home/dashboard?tab=famlo-plus";
  return familyId ? `${base}&family=${encodeURIComponent(familyId)}` : base;
}

function buildBasicRoomUrl(familyId: string): string {
  const base = "/partnerslogin/home/dashboard?tab=room";
  return familyId ? `${base}&family=${encodeURIComponent(familyId)}` : base;
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

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatAccessReason(reason: string): string {
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

export default async function FamloProDashboardPage({
  searchParams,
}: Readonly<FamloProDashboardPageProps>): Promise<React.JSX.Element> {
  const params = await searchParams;
  const cookieStore = await cookies();
  const familyId = params?.family ?? cookieStore.get("famlo_host_family_id")?.value ?? "";
  const basicDashboardUrl = buildBasicFamloPlusUrl(familyId);
  const basicRoomUrl = buildBasicRoomUrl(familyId);

  if (!familyId) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>
          <h1 style={titleStyle}>Famlo Pro is locked</h1>
          <p style={copyStyle}>Open the Basic Dashboard first to review Famlo+ and request activation.</p>
          <div style={buttonRowStyle}>
            <Link href="/partners/login" style={primaryLinkStyle}>Back to Partner Login</Link>
          </div>
        </section>
      </main>
    );
  }

  const famloProEnabled = isFamloProDashboardEnabled();
  const authorized = await canCurrentHostAccessFamily(familyId);

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

  const supabase = createAdminSupabaseClient();
  const access = await loadHostProAccess(supabase, familyId);

  if (!famloProEnabled || !access.allowed) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>
          <div style={eyebrowStyle}>Famlo Pro</div>
          <h1 style={titleStyle}>Famlo Pro is locked</h1>
          <p style={copyStyle}>
            Upgrade or renew Famlo+ to access PMS and Channel Manager features.
          </p>
          <div style={statusBoxStyle}>
            <strong style={{ color: "#0e2b57" }}>Status:</strong> <span style={{ textTransform: "capitalize" }}>{access.status}</span>
            <span style={{ color: "rgba(14,43,87,0.68)" }}>Reason: {famloProEnabled ? access.reason : "pro_dashboard_disabled"}</span>
          </div>
          <div style={buttonRowStyle}>
            <Link href={basicDashboardUrl} style={primaryLinkStyle}>Back to Famlo+</Link>
          </div>
        </section>
      </main>
    );
  }

  const [{ data: family }, { data: host }] = await Promise.all([
    supabase
      .from("families")
      .select("id,name,property_name,host_id,city,state,admin_notes,is_active,is_accepting")
      .eq("id", familyId)
      .maybeSingle(),
    supabase
      .from("hosts")
      .select("id,legacy_family_id,display_name,status")
      .eq("legacy_family_id", familyId)
      .maybeSingle(),
  ]);

  const propertyName =
    asString(family?.property_name) ??
    asString(family?.name) ??
    asString(host?.display_name) ??
    "Famlo Property";
  const locationLabel =
    [asString(family?.city), asString(family?.state)].filter(Boolean).join(", ") || "Location pending";
  const hostCode = asString(family?.host_id);
  const meta = parseHostListingMeta(asString(family?.admin_notes));
  const storedProSettings = await loadHostProSettings(supabase, familyId);
  const channelFoundation = await loadHostProChannelFoundation(supabase, familyId);
  const channexConfig = getChannexConfigSummary();
  const proSettings = {
    ...storedProSettings,
    otaTitle: storedProSettings.otaTitle ?? propertyName,
    state: storedProSettings.state ?? asString(family?.state),
    city: storedProSettings.city ?? asString(family?.city),
    addressLine: storedProSettings.addressLine ?? asString(meta.propertyAddress),
  };
  const rooms = (
    await loadStayUnitsForSelector(supabase, {
      hostId: asString(host?.id),
      legacyFamilyId: familyId,
    })
  ).map((room) => ({
    id: room.id,
    name: room.name,
    unitType: room.unitType,
    description: room.description,
    maxGuests: room.maxGuests,
    bedInfo: room.bedInfo,
    bathroomType: room.bathroomType,
    priceFullday: room.priceFullday,
    isActive: room.isActive,
    amenitiesCount: room.amenities.length,
    photosCount: room.photos.length + room.localityPhotos.length,
  }));
  const activeRoomIds = rooms.filter((room) => room.isActive).map((room) => room.id);
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

  const { data: bookingRows } =
    host?.id
      ? await supabase
          .from("bookings_v2")
          .select("id,status,payment_status,total_price,start_date,created_at")
          .eq("host_id", host.id)
          .order("created_at", { ascending: false })
          .limit(120)
      : { data: [] };

  const now = new Date();
  const openRooms = rooms.filter((room) => room.isActive).length;
  const closedRooms = rooms.length - openRooms;
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
      hint: rooms.length > 0 ? "Read-only room status from current Famlo inventory." : "No room inventory available yet.",
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

  const actionItems = [
    {
      title: "Confirm room structure",
      body: rooms.length > 0
        ? "Review the stay units surfaced from existing Famlo inventory before channel mapping begins."
        : "No stay units were found through the safe inventory helper, so inventory review is still blocked.",
      badge: rooms.length > 0 ? "Ready" : "Blocked",
    },
    {
      title: "Set up operating rules",
      body: "Min stay, max stay, stop-sell, and arrival restrictions are visible as shells but not configured yet.",
      badge: "Next",
    },
    {
      title: "Prepare standard rate plan",
      body: setupReadiness.completedItems.some((item) => item.key === "room-base-price")
        ? "Base pricing exists across the surfaced rooms, but provider-neutral rate plans will be introduced in a later phase."
        : "One or more rooms still need base pricing before future rate mapping becomes viable.",
      badge: setupReadiness.completedItems.some((item) => item.key === "room-base-price") ? "Draft" : "Needed",
    },
    {
      title: "Wait for provider pilot",
      body: "Channel connections, mappings, sync jobs, and OTA booking import remain intentionally disabled.",
      badge: "Coming soon",
    },
    {
      title: "Prepare provider foundation",
      body: providerRowsExist
        ? "Provider seed rows exist. The next future step is mapping Famlo property, rooms, and rates without making the provider the source of truth."
        : "Provider foundation rows are missing, so future mapping cannot begin until the provider-neutral base is present.",
      badge: providerRowsExist ? "Foundation ready" : "Needed",
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
      body: rooms.length > 0
        ? `${rooms.length} stay units were loaded from the existing Famlo inventory path without writing any room changes.`
        : "No safe room inventory surfaced, so this dashboard falls back to an inventory placeholder state.",
      tone: rooms.length > 0 ? ("success" as const) : ("warning" as const),
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

  return (
    <FamloProDashboardShell
      propertyName={propertyName}
      hostCode={hostCode}
      locationLabel={locationLabel}
      famloPlusStatus={access.status}
      entitlementLabel={
        access.status === "grace"
          ? `Grace until ${formatTimestampLabel(access.grace_until)}`
          : `Active until ${formatTimestampLabel(access.current_period_end)}`
      }
      accessReason={formatAccessReason(access.reason)}
      initialSection="dashboard"
      rooms={rooms}
      metrics={metrics}
      setupItems={setupItems}
      actionItems={actionItems}
      feedItems={feedItems}
      basicDashboardUrl={basicDashboardUrl}
      basicRoomUrl={basicRoomUrl}
      familyId={familyId}
      initialSettings={proSettings}
      channelFoundation={channelFoundation}
      channexConfig={channexConfig}
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
