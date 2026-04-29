//app/app/partnerslogin/home/dashboard/page.tsx
// app/app/partnerslogin/home/dashboard/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";

import { HostDashboardEditor } from "@/components/partners/HostDashboardEditor";
import { createAdminSupabaseClient } from "@/lib/supabase";

interface HostDashboardPageProps {
  searchParams?: Promise<{
    family?: string;
    hostCode?: string;
    tab?: string;
  }>;
}

export const dynamic = "force-dynamic";

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
  const { data: latestDraftRows } =
    familyIds.length > 0
      ? await supabase
          .from("host_onboarding_drafts")
          .select("family_id,payload,updated_at")
          .in("family_id", familyIds)
          .order("updated_at", { ascending: false })
      : { data: [] };
  const latestDraftByFamilyId = new Map<string, Record<string, unknown>>();
  for (const row of (latestDraftRows ?? []) as Array<Record<string, unknown>>) {
    const nextFamilyId = typeof row.family_id === "string" ? row.family_id : null;
    const payload =
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : null;
    if (!nextFamilyId || !payload || latestDraftByFamilyId.has(nextFamilyId)) {
      continue;
    }
    latestDraftByFamilyId.set(nextFamilyId, payload);
  }
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
    latest_onboarding_payload: latestDraftByFamilyId.get(String(family.id)) ?? null,
    v2_host_id: hostIdByFamilyId.get(String(family.id)) ?? null,
  }));
  const { data: photoRows } =
    familyIds.length > 0
      ? await supabase
          .from("family_photos")
          .select("id,url,is_primary,created_at,family_id")
          .in("family_id", familyIds)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true })
      : { data: [] };
  const enrichedBookingRows: Array<Record<string, unknown>> = [];

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
