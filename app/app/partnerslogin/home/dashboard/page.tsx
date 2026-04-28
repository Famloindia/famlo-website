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

function mapV2BookingRow(row: Record<string, unknown>): Record<string, unknown> {
  const pricing = (row.pricing_snapshot as Record<string, unknown> | null) ?? {};
  return {
    id: row.id,
    status: row.status,
    payment_status: row.payment_status,
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
    conversation_id: row.conversation_id,
    users: row.users,
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

  const { data: primaryFamily } = familyId
    ? await supabase.from("families").select("id,host_id,user_id").eq("id", familyId).maybeSingle()
    : hostCodeParam 
      ? await supabase.from("families").select("id,host_id,user_id").ilike("host_id", hostCodeParam).maybeSingle()
      : { data: null };

  const hostCode = primaryFamily?.host_id;

  const { data: hostUser } = primaryFamily?.user_id
    ? await supabase.from("users").select("id").eq("id", primaryFamily.user_id).maybeSingle()
    : { data: null };
  const hostUserId = hostUser?.id;

  const { data: platformSettings } = await supabase
    .from("admin_platform_settings")
    .select("global_family_commission_pct")
    .maybeSingle();
  const globalCommission = platformSettings?.global_family_commission_pct ?? 18;

  const { data: allFamilies } = hostCode
    ? await supabase.from("families").select("*").ilike("host_id", hostCode)
    : { data: [] };

  const familyRows = (allFamilies ?? []) as Array<Record<string, unknown>>;
  const familyIds = familyRows.map(f => String(f.id));
  const { data: v2Hosts } =
    familyIds.length > 0
      ? await supabase
          .from("hosts")
          .select("id,legacy_family_id")
          .in("legacy_family_id", familyIds)
      : { data: [] };
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

  const { data: bookingRowsV2 } =
    hostIds.length > 0
      ? await supabase
          .from("bookings_v2")
          .select([
            "id", "status", "start_date", "end_date", "guests_count",
            "total_price", "partner_payout_amount", "pricing_snapshot",
            "created_at", "user_id", "quarter_type", "quarter_time", "notes", "host_id", "payment_status",
            "conversation_id", "users!user_id(id,name,city,state,gender,about,kyc_status)",
          ].join(","))
          .in("host_id", hostIds)
          .order("start_date", { ascending: false })
          .limit(200)
      : { data: [] };
  const bookingRows = ((bookingRowsV2 ?? []) as unknown as Array<Record<string, unknown>>)
    .filter((row) => isHostBookingVisibleToPartner(row.status, row.payment_status))
    .map((row) => {
      const mapped = mapV2BookingRow(row);
      const v2HostId = typeof row.host_id === "string" ? row.host_id : null;
      return {
        ...mapped,
        family_id: v2HostId ? (familyIdByHostId.get(v2HostId) ?? v2HostId) : mapped.family_id,
      };
    });

  const currentFamily: Record<string, unknown> | undefined =
    familyRows.find((f) => String(f.id) === familyId) || familyRows[0];

  return (
    <main className="shell">
      <section className="panel dashboard-shell">
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
            bookingRows={(bookingRows as any) ?? []}
            family={currentFamily as any}
            allFamilies={familyRows as any}
            familyPhotos={(photoRows as any) ?? []}
            initialTab={initialTab}
            hostUserId={hostUserId ?? undefined}
            globalCommission={globalCommission}
          />
        )}
      </section>
    </main>
  );
}
