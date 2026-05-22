import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Fragment } from "react";

import styles from "@/components/partners/pro/pro-dashboard.module.css";
import { hasValidAdminSession } from "@/lib/admin-auth";
import { resolveOtaPaymentCollectMode } from "@/lib/channel-booking-normalization";
import { resolveAuthorizedHostSession } from "@/lib/chat-access";
import {
  buildHostRevenueUrl,
  deriveRevenuePaymentStatusLabel,
  isCompletedRevenueBooking,
  isFinanceBackedPaidStatus,
  toMaskedHostRevenueDestination,
  type RevenueBookingState,
} from "@/lib/finance/pro-revenue";
import { isFamloProDashboardEnabled, loadHostProAccess } from "@/lib/host-pro-access";
import { resolveAuthenticatedUser } from "@/lib/request-user";
import { loadStayUnitsForSelector } from "@/lib/stay-units";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type PayoutPageProps = {
  searchParams?: Promise<{
    family?: string;
  }>;
};

type HostRevenueCompliance = {
  panVerified: boolean;
  payoutAccountActive: boolean;
};

type HostPayoutHistoryItem = RevenueBookingState & {
  bookingId: string;
  guestDisplayName: string;
  roomName: string;
  checkoutDate: string;
  revenueDate: string | null;
  payoutAmountValue: number | null;
  payoutPaidAt: string | null;
  destinationMasked: string | null;
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

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizeToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeFamilyId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

async function canCurrentHostAccessFamily(familyId: string): Promise<boolean> {
  const supabase = createAdminSupabaseClient();
  const hostSession = await resolveAuthorizedHostSession(supabase);

  if (!hostSession) return false;
  if (hostSession.familyId === familyId) return true;

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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatShortDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function payoutAmountDisplay(item: HostPayoutHistoryItem): string {
  if (item.paymentCollectMode !== "FAMLO_COLLECT") return "Outside Famlo";
  if (!item.famloPayoutEligible) return "Pending settlement";
  return item.payoutAmountValue != null ? formatCurrency(item.payoutAmountValue) : "—";
}

function payoutStatusTone(item: HostPayoutHistoryItem): string {
  const label = deriveRevenuePaymentStatusLabel(item);
  if (label === "Paid by Famlo") return styles.readinessPillOk;
  if (label === "Blocked — action required") return styles.readinessPillReview;
  if (label === "Processing" || label === "Pending Famlo payout") return styles.readinessPillReview;
  return styles.readinessPill;
}

function payoutDestinationDisplay(item: HostPayoutHistoryItem): string {
  if (item.destinationMasked) return item.destinationMasked;
  if (item.complianceBlocked) return "Action required";
  return "Destination pending";
}

export default async function FamloProPayoutsPage({
  searchParams,
}: Readonly<PayoutPageProps>): Promise<React.JSX.Element> {
  const params = (await searchParams) ?? {};
  const requestedFamilyId = normalizeFamilyId(params.family);
  const supabase = createAdminSupabaseClient();
  await cookies();
  const adminSession = await hasValidAdminSession();
  const hostSession = await resolveAuthorizedHostSession(supabase);
  const authUser = await resolveAuthenticatedUser(supabase);

  if (!authUser && !adminSession && !hostSession) {
    redirect("/partners/login");
  }

  const familyId = requestedFamilyId || hostSession?.familyId || "";
  if (!familyId) {
    redirect("/partnerslogin/home/pro/dashboard?section=revenue");
  }

  const basicDashboardUrl = buildHostRevenueUrl(familyId);
  const authorized = adminSession ? true : await canCurrentHostAccessFamily(familyId);
  if (!authorized) {
    return (
      <main style={{ minHeight: "100vh", background: "#030712", color: "white", padding: "32px" }}>
        <section className={styles.listCard} style={{ maxWidth: "720px", margin: "0 auto" }}>
          <div className={styles.sectionEyebrow}>Famlo Pro</div>
          <h1 className={styles.propertyCenterTitle}>Payout history is locked</h1>
          <p className={styles.heroText}>This host session is not authorized to access the requested property payout history.</p>
          <div className={styles.inlineActionRow}>
            <Link href={basicDashboardUrl} className={styles.secondaryActionLink}>
              ← Back to Revenue
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const access = await loadHostProAccess(supabase, familyId);
  if (!isFamloProDashboardEnabled() || !access.allowed) {
    return (
      <main style={{ minHeight: "100vh", background: "#030712", color: "white", padding: "32px" }}>
        <section className={styles.listCard} style={{ maxWidth: "720px", margin: "0 auto" }}>
          <div className={styles.sectionEyebrow}>Famlo Pro</div>
          <h1 className={styles.propertyCenterTitle}>Payout history is locked</h1>
          <p className={styles.heroText}>Upgrade or renew Famlo+ to access PMS and payout history features for this property.</p>
          <div className={styles.inlineActionRow}>
            <Link href={basicDashboardUrl} className={styles.secondaryActionLink}>
              ← Back to Revenue
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const [{ data: family }, { data: host }] = await Promise.all([
    supabase
      .from("families")
      .select("id,name,property_name,city,state")
      .eq("id", familyId)
      .maybeSingle(),
    supabase
      .from("hosts")
      .select("id,legacy_family_id,display_name")
      .eq("legacy_family_id", familyId)
      .maybeSingle(),
  ]);

  const propertyName =
    asString((family as Record<string, unknown> | null)?.property_name) ??
    asString(family?.name) ??
    asString(host?.display_name) ??
    "Famlo Property";

  const rooms = await loadStayUnitsForSelector(supabase, {
    hostId: asString(host?.id),
    legacyFamilyId: familyId,
  });
  const selectedRoomIds = new Set(rooms.map((room) => room.id));

  let bookingRowsForWorkspace: Array<Record<string, unknown>> = [];
  if (host?.id) {
    const workspaceSelectWithStayUnit =
      "id,status,payment_status,total_price,start_date,end_date,created_at,stay_unit_id,source_channel,pricing_snapshot,users!user_id(name)";
    const workspaceSelectFallback =
      "id,status,payment_status,total_price,start_date,end_date,created_at,source_channel,pricing_snapshot,users!user_id(name)";

    const bookingWorkspaceInitialResult = await supabase
      .from("bookings_v2")
      .select(workspaceSelectWithStayUnit)
      .eq("host_id", host.id)
      .order("start_date", { ascending: false })
      .limit(160);

    if (
      bookingWorkspaceInitialResult.error &&
      String(bookingWorkspaceInitialResult.error.message ?? "").includes("stay_unit_id")
    ) {
      const bookingWorkspaceFallbackResult = await supabase
        .from("bookings_v2")
        .select(workspaceSelectFallback)
        .eq("host_id", host.id)
        .order("start_date", { ascending: false })
        .limit(160);

      if (!bookingWorkspaceFallbackResult.error) {
        bookingRowsForWorkspace = (bookingWorkspaceFallbackResult.data ?? []) as Array<Record<string, unknown>>;
      }
    } else if (!bookingWorkspaceInitialResult.error) {
      bookingRowsForWorkspace = (bookingWorkspaceInitialResult.data ?? []) as Array<Record<string, unknown>>;
    }
  }

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

  const reservationsByBookingId = new Map<string, Record<string, unknown>>();
  const settlementLineByBookingId = new Map<string, Record<string, unknown>>();
  const settlementsById = new Map<string, Record<string, unknown>>();
  const payoutExecutionBySettlementId = new Map<string, Record<string, unknown>>();
  let hostRevenueCompliance: HostRevenueCompliance = { panVerified: false, payoutAccountActive: false };
  let destinationMasked: string | null = null;
  let hostPayoutHold: Record<string, unknown> | null = null;
  let propertyPayoutHold: Record<string, unknown> | null = null;

  if (bookingWorkspaceIds.length > 0) {
    const [reservationRowsResult, settlementLineRowsResult] = await Promise.all([
      supabase
        .from("reservations_v2")
        .select("booking_id,operational_status,check_out_date")
        .in("booking_id", bookingWorkspaceIds),
      supabase
        .from("settlement_line_items_v2")
        .select("booking_id,settlement_id,amount,metadata,is_active")
        .eq("is_active", true)
        .in("booking_id", bookingWorkspaceIds),
    ]);

    if (!reservationRowsResult.error) {
      for (const row of (reservationRowsResult.data ?? []) as Array<Record<string, unknown>>) {
        const bookingId = asString(row.booking_id);
        if (!bookingId || reservationsByBookingId.has(bookingId)) continue;
        reservationsByBookingId.set(bookingId, row);
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
  }

  if (host?.id) {
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

    destinationMasked = toMaskedHostRevenueDestination({
      accountNumberMasked: asString((payoutAccount as Record<string, unknown> | null)?.account_number_masked),
      vpa: asString((payoutAccount as Record<string, unknown> | null)?.vpa),
    });

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

  const payoutRows: HostPayoutHistoryItem[] = bookingRowsForWorkspace
    .map((row) => {
      const bookingId = asString(row.id);
      if (!bookingId) return null;
      const pricingSnapshot = asObject(row.pricing_snapshot) ?? {};
      const sourceChannel = asString(row.source_channel);
      const reservation = reservationsByBookingId.get(bookingId) ?? null;
      const reservationStatus = asString(reservation?.operational_status) ?? null;
      const checkoutDate = asString(reservation?.check_out_date) ?? asString(row.end_date) ?? "";
      const settlementLine = settlementLineByBookingId.get(bookingId) ?? null;
      const settlementId = asString(settlementLine?.settlement_id);
      const settlement = settlementId ? settlementsById.get(settlementId) ?? null : null;
      const payoutExecution = settlementId ? payoutExecutionBySettlementId.get(settlementId) ?? null : null;
      const channelProvider = asString(pricingSnapshot.channel_provider);
      const isOta = channelProvider === "channex";
      const paymentCollectMode =
        sourceChannel === "pms_manual"
          ? "PROPERTY_COLLECT"
          : !isOta
            ? "FAMLO_COLLECT"
            : resolveOtaPaymentCollectMode(
                asString(pricingSnapshot.payment_collect_mode) ??
                  asString(pricingSnapshot.payment_collect) ??
                  null
              );
      const famloPayoutEligible =
        paymentCollectMode === "FAMLO_COLLECT" && Boolean(settlementLine);
      const revenueDate =
        isCompletedRevenueStatus(reservationStatus) || isCompletedRevenueStatus(row.status) || Boolean(settlementLine)
          ? checkoutDate
          : null;
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
      const item: HostPayoutHistoryItem = {
        bookingId,
        guestDisplayName:
          asString(pricingSnapshot.channel_guest_display_name) ??
          asString(pricingSnapshot.channel_guest_name) ??
          asString(pricingSnapshot.guest_name) ??
          asString(asObject(row.users)?.name) ??
          "Famlo Guest",
        roomName: asString(pricingSnapshot.room_name) ?? "Stay",
        revenueDate,
        checkoutDate,
        status: asString(row.status),
        reservationStatus,
        paymentStatus: asString(row.payment_status),
        sourceCategory: isOta ? "ota" : sourceChannel === "pms_manual" ? "direct" : "famlo",
        paymentCollectMode,
        famloPayoutEligible,
        settlementEligible: Boolean(settlementLine) || Boolean(settlement),
        payoutHoldStatus,
        payoutHoldIsHostActionable,
        payoutStatus: asString(payoutExecution?.status) ?? asString(settlement?.status) ?? null,
        payoutExecutionStatus: asString(payoutExecution?.status) ?? null,
        complianceBlocked: !(hostRevenueCompliance.panVerified && hostRevenueCompliance.payoutAccountActive),
        payoutAmountValue: asNumber(settlementLine?.amount) || null,
        payoutPaidAt:
          asString(payoutExecution?.processed_at) ??
          asString(settlement?.paid_at) ??
          asString(payoutExecution?.created_at) ??
          null,
        destinationMasked,
      };
      return item;
    })
    .filter((item): item is HostPayoutHistoryItem => Boolean(item))
    .filter((item) => item.paymentCollectMode === "FAMLO_COLLECT")
    .filter((item) => isCompletedRevenueBooking(item))
    .sort((left, right) => {
      const leftAnchor = left.payoutPaidAt ?? left.revenueDate ?? left.checkoutDate;
      const rightAnchor = right.payoutPaidAt ?? right.revenueDate ?? right.checkoutDate;
      return rightAnchor.localeCompare(leftAnchor);
    });

  const paidCount = payoutRows.filter((row) => isFinanceBackedPaidStatus(row.payoutExecutionStatus) || isFinanceBackedPaidStatus(row.payoutStatus)).length;
  const pendingSettlementCount = payoutRows.filter((row) => deriveRevenuePaymentStatusLabel(row) === "Settlement pending").length;

  return (
    <main style={{ minHeight: "100vh", background: "#030712", color: "white", padding: "32px" }}>
      <div style={{ maxWidth: "1180px", margin: "0 auto", display: "grid", gap: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div className={styles.sectionEyebrow}>Famlo Pro Revenue</div>
            <h1 className={styles.propertyCenterTitle} style={{ marginBottom: "8px" }}>Host payout history</h1>
            <p className={styles.heroText} style={{ marginTop: 0 }}>
              Review finance-backed payout records for {propertyName}. This page only shows host-safe payout states and masked destinations.
            </p>
          </div>
          <Link href={basicDashboardUrl} className={styles.secondaryActionLink}>
            ← Back to Revenue
          </Link>
        </div>

        <div className={styles.listGrid}>
          <article className={styles.summaryCard}>
            <div className={styles.miniLabel}>Finance-backed payout rows</div>
            <div className={styles.metricValue}>{payoutRows.length}</div>
            <div className={styles.metricHint}>Completed Famlo-collected stays tracked through settlement-backed payout states.</div>
          </article>
          <article className={styles.summaryCard}>
            <div className={styles.miniLabel}>Paid by Famlo</div>
            <div className={styles.metricValue}>{paidCount}</div>
            <div className={styles.metricHint}>Rows already confirmed through payout execution or paid settlement status.</div>
          </article>
          <article className={styles.summaryCard}>
            <div className={styles.miniLabel}>Pending settlement</div>
            <div className={styles.metricValue}>{pendingSettlementCount}</div>
            <div className={styles.metricHint}>Completed Famlo stays waiting for a settlement line before they become payable.</div>
          </article>
          <article className={styles.summaryCard}>
            <div className={styles.miniLabel}>Payout destination</div>
            <div className={styles.metricValue} style={{ fontSize: "24px" }}>{destinationMasked ?? "Action required"}</div>
            <div className={styles.metricHint}>
              {hostRevenueCompliance.panVerified && hostRevenueCompliance.payoutAccountActive
                ? "Masked payout destination on file."
                : "Payout release stays blocked until PAN/KYC and an active payout account are ready."}
            </div>
          </article>
        </div>

        {!hostRevenueCompliance.panVerified || !hostRevenueCompliance.payoutAccountActive ? (
          <div className={`${styles.feedbackBox} ${styles.feedbackError}`}>
            Payout release is currently blocked until PAN/KYC and an active payout account are in place for this host.
          </div>
        ) : null}

        {payoutRows.length > 0 ? (
          <article className={styles.listCard} style={{ display: "grid", gap: "18px" }}>
            <div>
              <div className={styles.listTitle}>Payout records</div>
              <div className={styles.feedCopy}>
                Settlement-backed rows become payable automatically once compliance, settlement, and payout readiness checks are clear. Completed stays without settlement lines stay visible as settlement pending.
              </div>
            </div>
            <div
              className={styles.mappingTable}
              style={{ gridTemplateColumns: "minmax(220px, 1.2fr) minmax(150px, 0.85fr) minmax(160px, 0.9fr) minmax(170px, 1fr) minmax(170px, 1fr)" }}
            >
              <div className={styles.mappingHeader}>Booking / guest</div>
              <div className={styles.mappingHeader}>Date</div>
              <div className={styles.mappingHeader}>Payout amount</div>
              <div className={styles.mappingHeader}>Payout status</div>
              <div className={styles.mappingHeader}>Destination</div>
              {payoutRows.map((item) => (
                <Fragment key={item.bookingId}>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{item.guestDisplayName}</div>
                    <div className={styles.mappingSubcopy}>{item.roomName}</div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>
                      {formatShortDate((item.payoutPaidAt ?? item.revenueDate ?? item.checkoutDate).slice(0, 10))}
                    </div>
                    <div className={styles.mappingSubcopy}>
                      {item.payoutPaidAt ? "Payout date" : `Checkout ${formatShortDate(item.checkoutDate)}`}
                    </div>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{payoutAmountDisplay(item)}</div>
                    <div className={styles.mappingSubcopy}>
                      {item.famloPayoutEligible ? "Settlement-backed amount" : "Not included in payout totals yet"}
                    </div>
                  </div>
                  <div className={styles.mappingCell}>
                    <span className={`${styles.readinessPill} ${payoutStatusTone(item)}`}>
                      {deriveRevenuePaymentStatusLabel(item)}
                    </span>
                  </div>
                  <div className={styles.mappingCell}>
                    <div className={styles.mappingTitle}>{payoutDestinationDisplay(item)}</div>
                    <div className={styles.mappingSubcopy}>Masked host-facing destination only</div>
                  </div>
                </Fragment>
              ))}
            </div>
          </article>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>No payout records available yet</div>
            <div className={styles.emptyCopy}>
              Finance-backed payout rows will appear here after completed Famlo-collected stays move into settlement and payout processing.
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
