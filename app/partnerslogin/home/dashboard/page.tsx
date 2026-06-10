//app/app/partnerslogin/home/dashboard/page.tsx
// app/app/partnerslogin/home/dashboard/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { HostDashboardEditor } from "@/components/partners/HostDashboardEditor";
import {
  isFamloPlusPageEnabled,
  isFamloProDashboardEnabled,
  loadHostProAccessMap,
  resolveHostDashboardHref,
} from "@/lib/host-pro-access";
import { resolvePublicPropertyMedia } from "@/lib/property-public-media";
import { createAdminSupabaseClient } from "@/lib/supabase";

interface HostDashboardPageProps {
  searchParams?: Promise<{
    family?: string;
    hostCode?: string;
    tab?: string;
  }>;
}

type PropertyReelSeed = {
  id: string;
  publicUrl: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  isFeatured: boolean;
  status: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export const dynamic = "force-dynamic";

function normalizeFamilyId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isSchemaCompatibilityError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("column") || lower.includes("schema cache") || lower.includes("does not exist") || lower.includes("relation");
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

  async function loadFamiliesForWorkspace(params: {
    userId: string | null;
    hostCode: string | null;
  }): Promise<Array<Record<string, unknown>>> {
    const normalizedUserId = typeof params.userId === "string" && params.userId.trim().length > 0
      ? params.userId.trim()
      : null;
    const normalizedHostCode = typeof params.hostCode === "string" && params.hostCode.trim().length > 0
      ? params.hostCode.trim()
      : null;

    if (normalizedUserId) {
      const { data: byUserId, error: byUserIdError } = await supabase
        .from("families")
        .select("*")
        .eq("user_id", normalizedUserId)
        .order("updated_at", { ascending: false });

      if (!byUserIdError && Array.isArray(byUserId) && byUserId.length > 0) {
        return byUserId as Array<Record<string, unknown>>;
      }
    }

    if (normalizedHostCode) {
      const { data: byHostCode } = await supabase
        .from("families")
        .select("*")
        .ilike("host_id", normalizedHostCode);

      return (byHostCode ?? []) as Array<Record<string, unknown>>;
    }

    return [];
  }

  // First, find the primary family to identify the Host (Partner Code)
  // FALLBACK: If cookie/family param is missing, we try the ?hostCode= parameter
  const { data: primaryFamily } = familyId
    ? await supabase.from("families").select("id,host_id,user_id").eq("id", familyId).maybeSingle()
    : hostCodeParam 
      ? await supabase.from("families").select("id,host_id,user_id").ilike("host_id", hostCodeParam).maybeSingle()
      : { data: null };

  const hostCode = primaryFamily?.host_id;
  const primaryFamilyUserId =
    typeof primaryFamily?.user_id === "string" && primaryFamily.user_id.trim().length > 0
      ? primaryFamily.user_id
      : null;

  // IMPORTANT FIX: Get the real User UUID for this host to fix the messaging identity mismatch
  const { data: hostUser } = primaryFamilyUserId
    ? await supabase.from("users").select("id").eq("id", primaryFamilyUserId).maybeSingle()
    : { data: null };
  const hostUserId = hostUser?.id;

  // Fetch GLOBAL platform settings for commission fallbacks
  const { data: platformSettings } = await supabase
    .from("admin_platform_settings")
    .select("global_family_commission_pct")
    .maybeSingle();
  const globalCommission = platformSettings?.global_family_commission_pct ?? 16;

  // MASTER SYNC: Fetch ALL families for the same host workspace.
  // Prefer the shared owner user_id so one host can manage multiple properties.
  // Fall back to legacy partner-code grouping only when user linkage is missing.
  const familyRowsBase = await loadFamiliesForWorkspace({
    userId: hostUserId ?? primaryFamilyUserId,
    hostCode: typeof hostCode === "string" ? hostCode : null,
  });
  const familyIds = familyRowsBase
    .map((family) => normalizeFamilyId(family.id))
    .filter((value): value is string => Boolean(value));
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
  const v2Hosts =
    familyIds.length > 0
      ? await (async () => {
          const result = await supabase
            .from("hosts")
            .select("id,legacy_family_id,booking_requires_host_approval,is_accepting,status")
            .in("legacy_family_id", familyIds);

          if (!result.error || !isSchemaCompatibilityError(result.error.message)) {
            return result.data ?? [];
          }

          const fallback = await supabase
            .from("hosts")
            .select("id,legacy_family_id,is_accepting,status")
            .in("legacy_family_id", familyIds);

          return fallback.data ?? [];
        })()
      : [];
  const hostRowByFamilyId = new Map(
    (v2Hosts as Array<Record<string, unknown>>)
      .map((row) => {
        const legacyFamilyId = typeof row.legacy_family_id === "string" ? row.legacy_family_id : null;
        return legacyFamilyId ? [legacyFamilyId, row] : null;
      })
      .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry))
  );
  const hostIdByFamilyId = new Map(
    (v2Hosts as Array<Record<string, unknown>>)
      .map((row) => {
        const hostId = typeof row.id === "string" ? row.id : null;
        const legacyFamilyId = typeof row.legacy_family_id === "string" ? row.legacy_family_id : null;
        return hostId && legacyFamilyId ? [legacyFamilyId, hostId] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry))
  );
  const familyRows = familyRowsBase
    .map((family): (Record<string, unknown> & { v2_host_id: string | null }) | null => {
      const normalizedId = normalizeFamilyId(family.id);
      if (!normalizedId) return null;

      return {
        ...family,
        id: normalizedId,
        booking_requires_host_approval:
          typeof hostRowByFamilyId.get(normalizedId)?.booking_requires_host_approval === "boolean"
            ? hostRowByFamilyId.get(normalizedId)?.booking_requires_host_approval
            : typeof family.booking_requires_host_approval === "boolean"
              ? family.booking_requires_host_approval
              : undefined,
        is_accepting:
          typeof hostRowByFamilyId.get(normalizedId)?.is_accepting === "boolean"
            ? hostRowByFamilyId.get(normalizedId)?.is_accepting
            : typeof family.is_accepting === "boolean"
              ? family.is_accepting
              : true,
        latest_onboarding_payload: latestDraftByFamilyId.get(normalizedId) ?? null,
        v2_host_id: hostIdByFamilyId.get(normalizedId) ?? null,
      };
    })
    .filter((family): family is Record<string, unknown> & { v2_host_id: string | null } => family !== null);
  const propertyMediaByFamilyId = new Map<
    string,
    {
      photos: Array<Record<string, unknown>>;
      reels: PropertyReelSeed[];
    }
  >();
  if (familyRows.length > 0) {
    const propertyMediaEntries = await Promise.all(
      familyRows.map(async (family) => {
        const nextFamilyId = normalizeFamilyId(family.id);
        if (!nextFamilyId) {
          return null;
        }
        const hostId = hostIdByFamilyId.get(nextFamilyId) ?? null;
        const media = await resolvePublicPropertyMedia(supabase, {
          familyId: nextFamilyId,
          hostId,
          familyRow: family,
          hostRow: hostRowByFamilyId.get(nextFamilyId) ?? null,
          debugContext: "host-dashboard-profile-seed",
        });
        return [
          nextFamilyId,
          {
            photos: media.gallery.map((photo) => ({
              id: photo.id,
              family_id: nextFamilyId,
              url: photo.url,
              is_primary: photo.isPrimary,
              created_at: photo.createdAt,
              source: photo.source,
            })),
            reels: media.reels.map((reel) => ({
              id: reel.id,
              publicUrl: reel.publicUrl,
              storageKey: reel.storageKey,
              mimeType: reel.mimeType,
              sizeBytes: reel.sizeBytes,
              durationSeconds: reel.durationSeconds,
              width: reel.width,
              height: reel.height,
              isFeatured: reel.isFeatured,
              status: "active",
              source: reel.source,
              createdAt: reel.createdAt,
              updatedAt: reel.updatedAt,
            })),
          },
        ] as const;
      })
    );
    for (const entry of propertyMediaEntries) {
      if (!entry) continue;
      propertyMediaByFamilyId.set(entry[0], entry[1]);
    }
  }
  const photoRows = Array.from(propertyMediaByFamilyId.values()).flatMap((entry) => entry.photos);
  const propertyReelsByFamilyId = Object.fromEntries(
    Array.from(propertyMediaByFamilyId.entries()).map(([nextFamilyId, value]) => [nextFamilyId, value.reels])
  );
  const proAccessByFamilyId = await loadHostProAccessMap(supabase, familyIds);
  const enrichedBookingRows: Array<Record<string, unknown>> = [];

  const requestedFamilyId = normalizeFamilyId(familyId);
  const currentFamily: (Record<string, unknown> & { v2_host_id: string | null }) | undefined =
    familyRows.find((f) => normalizeFamilyId(f.id) === requestedFamilyId) || familyRows[0];
  const currentFamilyId = currentFamily ? normalizeFamilyId(currentFamily.id) ?? "" : "";
  const proDashboardEnabled = isFamloProDashboardEnabled();
  const currentFamilyProAccess =
    currentFamilyId.length > 0 ? proAccessByFamilyId[currentFamilyId] ?? null : null;

  if (currentFamilyId && proDashboardEnabled && currentFamilyProAccess?.allowed) {
    redirect(
      resolveHostDashboardHref({
        familyId: currentFamilyId,
        proDashboardEnabled,
        proAccess: currentFamilyProAccess,
        proSection: "properties-home",
      })
    );
  }

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
            propertyReelsByFamilyId={propertyReelsByFamilyId}
            initialTab={initialTab}
            hostUserId={hostUserId ?? undefined}
            globalCommission={globalCommission}
            famloPlusEnabled={isFamloPlusPageEnabled()}
            proDashboardEnabled={proDashboardEnabled}
            proAccessByFamilyId={proAccessByFamilyId}
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
