//app/app/partnerslogin/home/dashboard/page.tsx
// app/app/partnerslogin/home/dashboard/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";

import { HostDashboardEditor } from "@/components/partners/HostDashboardEditor";
import { isHostBookingVisibleToPartner } from "@/lib/host-booking-state";
import { createAdminSupabaseClient } from "@/lib/supabase";

interface HostDashboardPageProps {
  searchParams?: Promise<{
    family?: string;
    hostCode?: string;
    tab?: string;
  }>;
}

export const dynamic = "force-dynamic";

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return (
    (code === "42703" && message.includes(columnName)) ||
    (message.includes(columnName) && (message.includes("schema cache") || message.includes("does not exist"))) ||
    (columnName === "stay_unit_id" && message === "")
  );
}

function resolveStayUnitId(row: Record<string, unknown>): string | null {
  if (typeof row.stay_unit_id === "string" && row.stay_unit_id.trim().length > 0) {
    return row.stay_unit_id;
  }

  const snapshot =
    row.pricing_snapshot && typeof row.pricing_snapshot === "object" && !Array.isArray(row.pricing_snapshot)
      ? (row.pricing_snapshot as Record<string, unknown>)
      : null;

  return typeof snapshot?.stay_unit_id === "string" && snapshot.stay_unit_id.trim().length > 0
    ? snapshot.stay_unit_id
    : null;
}

function mapV2BookingRow(row: Record<string, unknown>): Record<string, unknown> {
  const pricing = (row.pricing_snapshot as Record<string, unknown> | null) ?? {};
  return {
    id: row.id,
    status: row.status,
    payment_status: row.payment_status,
    legacy_booking_id: row.legacy_booking_id,
    date_from: row.start_date,
    date_to: row.end_date,
    guests_count: row.guests_count,
    total_price: row.total_price,
    family_payout: row.partner_payout_amount,
    base_price: pricing.base_price ?? pricing.unit_price ?? null,
    platform_fee: pricing.platform_fee ?? null,
    created_at: row.created_at,
    user_id: row.user_id,
    quarter_type: row.quarter_type,
    quarter_time: row.quarter_time,
    vibe: row.notes,
    family_id: row.host_id,
    stay_unit_id: resolveStayUnitId(row),
    conversation_id: row.conversation_id,
    users: row.users,
    property_name: row.property_name ?? null,
    room_name: row.room_name ?? null,
    payout_id: row.payout_id ?? null,
    payout_status: row.payout_status ?? null,
    guest_arrival_requested_at: row.guest_arrival_requested_at ?? null,
    checked_in_at: row.checked_in_at ?? null,
    checked_in_by_host_user_id: row.checked_in_by_host_user_id ?? null,
    checked_out_at: row.checked_out_at ?? null,
    checked_out_by_host_user_id: row.checked_out_by_host_user_id ?? null,
  };
}

export default async function HostDashboardPage({
  searchParams
}: Readonly<HostDashboardPageProps>): Promise<React.JSX.Element> {
  const params = await searchParams;
  const cookieStore = await cookies();
  const familyId = params?.family ?? cookieStore.get("famlo_host_family_id")?.value ?? "";
  const hostCodeParam = params?.hostCode ?? "";
  const initialTab = params?.tab ?? "dashboard";
  const supabase = createAdminSupabaseClient();

  // First, find the primary family to identify the Host (Partner Code)
  // FALLBACK: If cookie/family param is missing, we try the ?hostCode= parameter
  const { data: primaryFamily } = familyId
    ? await supabase.from("families").select("id,host_id,user_id").eq("id", familyId).maybeSingle()
    : hostCodeParam 
      ? await supabase.from("families").select("id,host_id,user_id").ilike("host_id", hostCodeParam).maybeSingle()
      : { data: null };

  const hostCode = primaryFamily?.host_id;

  // IMPORTANT FIX: Get the real User UUID for this host to fix the messaging identity mismatch
  const { data: hostUser } = primaryFamily?.user_id
    ? await supabase.from("users").select("id").eq("id", primaryFamily.user_id).maybeSingle()
    : { data: null };
  const hostUserId = hostUser?.id;

  // Fetch GLOBAL platform settings for commission fallbacks
  const { data: platformSettings } = await supabase
    .from("admin_platform_settings")
    .select("global_family_commission_pct")
    .maybeSingle();
  const globalCommission = platformSettings?.global_family_commission_pct ?? 18;

  // MASTER SYNC: Fetch ALL families by Partner Code (Case-Insensitive)
  const { data: allFamilies } = hostCode
    ? await supabase.from("families").select("*").ilike("host_id", hostCode)
    : { data: [] };

  const familyRowsBase = (allFamilies ?? []) as Array<Record<string, unknown>>;
  const familyIds = familyRowsBase.map(f => String(f.id));
  const { data: v2Hosts } =
    familyIds.length > 0
      ? await supabase
          .from("hosts")
          .select("id,legacy_family_id")
          .in("legacy_family_id", familyIds)
      : { data: [] };
  const hostIdByFamilyId = new Map(
    ((v2Hosts ?? []) as Array<Record<string, unknown>>)
      .map((row) => {
        const hostId = typeof row.id === "string" ? row.id : null;
        const legacyFamilyId = typeof row.legacy_family_id === "string" ? row.legacy_family_id : null;
        return hostId && legacyFamilyId ? [legacyFamilyId, hostId] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry))
  );
  const familyRows: Array<Record<string, unknown> & { v2_host_id: string | null }> = familyRowsBase.map((family) => ({
    ...family,
    v2_host_id: hostIdByFamilyId.get(String(family.id)) ?? null,
  }));
  const familyMetaById = new Map(
    familyRows.map((family) => [
      String(family.id),
      {
        propertyName:
          typeof family.property_name === "string" && family.property_name.length > 0
            ? family.property_name
            : typeof family.name === "string"
              ? family.name
              : "Famlo Stay",
        city: typeof family.city === "string" ? family.city : null,
        state: typeof family.state === "string" ? family.state : null,
      },
    ])
  );
  const hostIds = ((v2Hosts ?? []) as Array<Record<string, unknown>>)
    .map((row) => (typeof row.id === "string" ? row.id : null))
    .filter((value): value is string => Boolean(value));
  const familyIdByHostId = new Map(
    ((v2Hosts ?? []) as unknown as Array<Record<string, unknown>>)
      .map((row) => {
        const hostId = typeof row.id === "string" ? row.id : null;
        const legacyFamilyId = typeof row.legacy_family_id === "string" ? row.legacy_family_id : null;
        return hostId && legacyFamilyId ? [hostId, legacyFamilyId] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry))
  );

  const { data: photoRows } =
    familyIds.length > 0
      ? await supabase
          .from("family_photos")
          .select("id,url,is_primary,created_at,family_id")
          .in("family_id", familyIds)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true })
      : { data: [] };

  // REFINED BOOKING SEARCH: Direct ID match for speed + 200 limit for performance
  let bookingRowsV2: unknown[] | null = [];
  let bookingV2Error: unknown = null;
  if (hostIds.length > 0) {
    const selectWithRoom = [
      "id", "status", "start_date", "end_date", "guests_count",
      "total_price", "partner_payout_amount", "pricing_snapshot",
      "created_at", "user_id", "quarter_type", "quarter_time", "notes", "host_id", "payment_status",
      "legacy_booking_id", "stay_unit_id",
      "conversation_id", "guest_arrival_requested_at", "checked_in_at", "checked_in_by_host_user_id", "checked_out_at", "checked_out_by_host_user_id",
      "users!user_id(id,name,city,state,gender,about,kyc_status)",
    ].join(",");
    const selectWithoutRoom = [
      "id", "status", "start_date", "end_date", "guests_count",
      "total_price", "partner_payout_amount", "pricing_snapshot",
      "created_at", "user_id", "quarter_type", "quarter_time", "notes", "host_id", "payment_status",
      "legacy_booking_id",
      "conversation_id", "guest_arrival_requested_at", "checked_in_at", "checked_in_by_host_user_id", "checked_out_at", "checked_out_by_host_user_id",
      "users!user_id(id,name,city,state,gender,about,kyc_status)",
    ].join(",");

    const primaryResult = await supabase
      .from("bookings_v2")
      .select(selectWithRoom)
      .in("host_id", hostIds)
      .order("start_date", { ascending: false })
      .limit(200);

    if (primaryResult.error && isMissingColumnError(primaryResult.error, "stay_unit_id")) {
      const fallbackResult = await supabase
        .from("bookings_v2")
        .select(selectWithoutRoom)
        .in("host_id", hostIds)
        .order("start_date", { ascending: false })
        .limit(200);
      bookingRowsV2 = fallbackResult.data;
      bookingV2Error = fallbackResult.error;
    } else {
      bookingRowsV2 = primaryResult.data;
      bookingV2Error = primaryResult.error;
    }
  }

  if (bookingV2Error) {
    console.error("[Dashboard] Booking Fetch Error:", bookingV2Error);
  }

  const bookingConversationKeys = [
    ...new Set(
      ((bookingRowsV2 ?? []) as unknown as Array<Record<string, unknown>>)
        .flatMap((row) => {
          const keys = [row.id, row.legacy_booking_id, row.conversation_id];
          return keys.filter((value): value is string => typeof value === "string" && value.length > 0);
        })
    ),
  ];
  const { data: conversationLinks } =
    bookingConversationKeys.length > 0
      ? await supabase
          .from("conversations")
          .select("id,booking_id")
          .in("booking_id", bookingConversationKeys)
      : { data: [] };
  const conversationIdByBookingId = new Map(
    ((conversationLinks ?? []) as Array<Record<string, unknown>>)
      .map((row) => {
        const bookingId = typeof row.booking_id === "string" ? row.booking_id : null;
        const conversationId = typeof row.id === "string" ? row.id : null;
        return bookingId && conversationId ? [bookingId, conversationId] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry))
  );
  const stayUnitIds = [
    ...new Set(
      ((bookingRowsV2 ?? []) as Array<Record<string, unknown>>)
        .map((row) => resolveStayUnitId(row))
        .filter((value): value is string => Boolean(value))
    ),
  ];
  const { data: stayUnitRows } =
    stayUnitIds.length > 0
      ? await supabase
          .from("stay_units_v2")
          .select("id,name")
          .in("id", stayUnitIds)
      : { data: [] };
  const stayUnitNameById = new Map(
    ((stayUnitRows ?? []) as Array<Record<string, unknown>>)
      .map((row) => {
        const stayUnitId = typeof row.id === "string" ? row.id : null;
        const roomName = typeof row.name === "string" && row.name.trim().length > 0 ? row.name.trim() : null;
        return stayUnitId && roomName ? [stayUnitId, roomName] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry))
  );

  const bookingRows: Array<Record<string, unknown>> = ((bookingRowsV2 ?? []) as unknown as Array<Record<string, unknown>>)
    .filter((row) => isHostBookingVisibleToPartner(row.status, row.payment_status))
    .map((row) => {
      const mapped = mapV2BookingRow(row);
      const v2HostId = typeof row.host_id === "string" ? row.host_id : null;
      const legacyBookingId = typeof row.legacy_booking_id === "string" ? row.legacy_booking_id : null;
      const resolvedFamilyId = v2HostId ? (familyIdByHostId.get(v2HostId) ?? v2HostId) : mapped.family_id;
      const resolvedConversationId =
        typeof row.conversation_id === "string" && row.conversation_id.length > 0
          ? row.conversation_id
          : legacyBookingId
            ? conversationIdByBookingId.get(legacyBookingId) ?? null
            : conversationIdByBookingId.get(String(row.id)) ?? null;
      return {
        ...mapped,
        family_id: resolvedFamilyId,
        room_name:
          typeof mapped.stay_unit_id === "string"
            ? stayUnitNameById.get(mapped.stay_unit_id) ?? mapped.room_name ?? null
            : mapped.room_name ?? null,
        property_name: familyMetaById.get(String(resolvedFamilyId ?? ""))?.propertyName ?? null,
        property_location: [
          familyMetaById.get(String(resolvedFamilyId ?? ""))?.city,
          familyMetaById.get(String(resolvedFamilyId ?? ""))?.state,
        ].filter(Boolean).join(", "),
        conversation_id: resolvedConversationId,
      };
    });

  const bookingIds = bookingRows.map((row) => String(row.id));
  const { data: payoutRows } =
    bookingIds.length > 0
      ? await supabase
          .from("payouts_v2")
          .select("id,booking_id,status")
          .in("booking_id", bookingIds)
          .order("created_at", { ascending: false })
      : { data: [] };
  const payoutByBookingId = new Map(
    ((payoutRows ?? []) as Array<Record<string, unknown>>)
      .map((row) => {
        const bookingId = typeof row.booking_id === "string" ? row.booking_id : null;
        return bookingId
          ? [bookingId, { id: typeof row.id === "string" ? row.id : null, status: typeof row.status === "string" ? row.status : null }]
          : null;
      })
      .filter((entry): entry is [string, { id: string | null; status: string | null }] => Boolean(entry))
  );

  const enrichedBookingRows: Array<Record<string, unknown>> = bookingRows.map((row) => ({
    ...row,
    payout_id: payoutByBookingId.get(String(row.id))?.id ?? null,
    payout_status: payoutByBookingId.get(String(row.id))?.status ?? null,
  }));

  // DIAGNOSTIC LOGS: Visible in server console to catch silent query failures
  console.log(`[Dashboard] Loading master view for Host: ${hostCode} (User: ${hostUserId})`);
  console.log(`[Dashboard] Global Commission: ${globalCommission}%`);
  console.log(`[Dashboard] Found ${familyIds.length} listings in portfolio.`);
  console.log(`[Dashboard] Fetched ${bookingRows?.length ?? 0} bookings.`);

  const currentFamily: (Record<string, unknown> & { v2_host_id: string | null }) | undefined =
    familyRows.find((f) => String(f.id) === familyId) || familyRows[0];

  return (
    <main style={{ width: "100%", minHeight: "100vh" }}>
      <section style={{ width: "100%", minHeight: "100vh" }}>
        {!currentFamily ? (
          <div className="panel detail-box">
            <h2>No Home listing found</h2>
            <p>Log in with a valid Famlo host ID to load the connected Home dashboard.</p>
            <div className="dashboard-links">
              <Link href="/partners/login">Back to partner login</Link>
              <Link href="/">Public homepage</Link>
            </div>
          </div>
        ) : (
          <HostDashboardEditor
            bookingRows={(enrichedBookingRows as any) ?? []}
            family={currentFamily as any}
            allFamilies={familyRows as any}
            familyPhotos={(photoRows as any) ?? []}
            initialTab={initialTab}
            hostUserId={hostUserId ?? undefined}
            globalCommission={globalCommission}
            diagnostics={{
              familyIds,
              hostCode,
              rawBookingCount: (enrichedBookingRows as any[])?.length ?? 0,
              familyCount: familyRows.length,
              photoCount: (photoRows as any[])?.length ?? 0,
            }}
          />
        )}
      </section>
    </main>
  );
}
