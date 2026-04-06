import Link from "next/link";
import { cookies } from "next/headers";

import { HomeHostDashboard } from "@/app/_components/HomeHostDashboard";
import { createAdminSupabaseClient } from "@/lib/supabase";
import type { FamilyProfile, HostOnboardingDraft } from "@/lib/types";

interface HostDashboardPageProps {
  searchParams?: Promise<{
    draft?: string;
    family?: string;
    section?: string;
    welcome?: string;
  }>;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadFamilyDashboardData(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  familyId: string,
  limit = 50
): Promise<{
  familyPhotos: string[];
  hostBookings: Array<{
    id: string;
    status: string | null;
    date_from: string | null;
    date_to: string | null;
    quarter_type: string | null;
    guests_count: number | null;
    total_price: number | null;
    family_payout: number | null;
    user_id?: string | null;
    user_name?: string | null;
    user_city?: string | null;
  }>;
}> {
  const { data: photoRows } = await supabase
    .from("family_photos")
    .select("url,is_primary")
    .eq("family_id", familyId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  const familyPhotos = ((photoRows ?? []) as Array<{ url: string | null }>)
    .map((row) => row.url ?? "")
    .filter(Boolean);

  const { data: bookingRows } = await supabase
    .from("bookings")
    .select("id,status,date_from,date_to,quarter_type,guests_count,total_price,family_payout,user_id")
    .eq("family_id", familyId)
    .order("date_from", { ascending: false })
    .limit(limit);

  const rawBookings = ((bookingRows ?? []) as Array<{
    id: string;
    status: string | null;
    date_from: string | null;
    date_to: string | null;
    quarter_type: string | null;
    guests_count: number | null;
    total_price: number | null;
    family_payout: number | null;
    user_id?: string | null;
  }>) ?? [];

  const userIds = [...new Set(rawBookings.map((row) => row.user_id).filter(Boolean))] as string[];
  const { data: userRows } =
    userIds.length > 0
      ? await supabase.from("users").select("id,name,city").in("id", userIds)
      : { data: [] };

  const userMap = new Map(
    ((userRows ?? []) as Array<{ id: string; name: string | null; city: string | null }>).map((user) => [
      user.id,
      user
    ])
  );

  const hostBookings = rawBookings.map((row) => {
    const user = row.user_id ? userMap.get(row.user_id) : null;
    return {
      id: row.id,
      status: row.status,
      date_from: row.date_from,
      date_to: row.date_to,
      quarter_type: row.quarter_type,
      guests_count: row.guests_count,
      total_price: row.total_price,
      family_payout: row.family_payout,
      user_id: row.user_id ?? null,
      user_name: user?.name ?? null,
      user_city: user?.city ?? null
    };
  });

  return { familyPhotos, hostBookings };
}

export default async function HostDashboardPage({
  searchParams
}: Readonly<HostDashboardPageProps>): Promise<JSX.Element> {
  const resolvedSearchParams = (await searchParams) ?? {};
  let draftId = resolvedSearchParams.draft;
  const cookieStore = await cookies();
  const cookieFamilyId = cookieStore.get("famlo_host_family_id")?.value;
  const familyIdFromQuery = resolvedSearchParams.family ?? cookieFamilyId;
  const allowedSections = new Set([
    "overview",
    "bookings",
    "schedule",
    "financial",
    "listing",
    "profile",
    "compliance"
  ]);
  const initialSection = allowedSections.has(String(resolvedSearchParams.section ?? ""))
    ? (String(resolvedSearchParams.section) as
        | "overview"
        | "bookings"
        | "schedule"
        | "financial"
        | "listing"
        | "profile"
        | "compliance")
    : "overview";
  const welcomeMode = resolvedSearchParams.welcome === "1";
  const supabase = createAdminSupabaseClient();
  let draft: HostOnboardingDraft | null = null;
  let family: FamilyProfile | null = null;
  let familyPhotos: string[] = [];
  let hostBookings: Array<{
    id: string;
    status: string | null;
    date_from: string | null;
    date_to: string | null;
    quarter_type: string | null;
    guests_count: number | null;
    total_price: number | null;
    family_payout: number | null;
    user_name?: string | null;
    user_city?: string | null;
  }> = [];

  if (!draftId) {
    const { data: latestDraft } = await supabase
      .from("host_onboarding_drafts")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    draft = (latestDraft as HostOnboardingDraft | null) ?? null;
    draftId = draft?.id;
  }

  if (familyIdFromQuery) {
    const { data: familyData } = await supabase
      .from("families")
      .select("*")
      .eq("id", familyIdFromQuery)
      .maybeSingle();

    family = (familyData as FamilyProfile | null) ?? null;

    const { data: matchingDraft } = await supabase
      .from("host_onboarding_drafts")
      .select("*")
      .eq("family_id", familyIdFromQuery)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    draft = (matchingDraft as HostOnboardingDraft | null) ?? draft;

    if (family?.id) {
      const loaded = await loadFamilyDashboardData(supabase, family.id, 50);
      familyPhotos = loaded.familyPhotos;
      hostBookings = loaded.hostBookings;
    }
  }

  if (draftId && !familyIdFromQuery) {
    if (!draft) {
      const { data } = await supabase
        .from("host_onboarding_drafts")
        .select("*")
        .eq("id", draftId)
        .maybeSingle();

      draft = (data as HostOnboardingDraft | null) ?? null;
    }

    if (draft?.family_id) {
      const { data: familyData } = await supabase
        .from("families")
        .select("*")
        .eq("id", draft.family_id)
        .maybeSingle();

      family = (familyData as FamilyProfile | null) ?? null;

      const loaded = await loadFamilyDashboardData(supabase, draft.family_id, 20);
      familyPhotos = loaded.familyPhotos;
      hostBookings = loaded.hostBookings;
    }
  }

  if (!family) {
    const { data: latestFamily } = await supabase
      .from("families")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    family = (latestFamily as FamilyProfile | null) ?? null;

    if (family?.id) {
      const loaded = await loadFamilyDashboardData(supabase, family.id, 20);
      familyPhotos = loaded.familyPhotos;
      hostBookings = loaded.hostBookings;
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5efe5_0%,#f9fbfd_100%)] px-6 py-10">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#8a6a3d]">
              /app/partnerslogin/home/dashboard
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.05em] text-[#1f2937]">
              Famlo host dashboard
            </h1>
            <p className="max-w-3xl text-base leading-7 text-[#52606d]">
              This workspace stays connected with the host app for listing details, calendar,
              quarter pricing, max guests, compliance, bookings, and earnings.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/partners/home"
              className="rounded-full border border-[#1f2937] px-5 py-3 font-semibold text-[#1f2937]"
            >
              Back to onboarding
            </Link>
            <Link
              href="/admin"
              className="rounded-full bg-[#1f2937] px-5 py-3 font-semibold text-white"
            >
              Open admin
            </Link>
          </div>
        </div>

        <HomeHostDashboard
          draft={draft}
          family={family}
          familyPhotos={familyPhotos}
          hostBookings={hostBookings}
          initialSection={initialSection}
          welcomeMode={welcomeMode}
        />
      </div>
    </main>
  );
}
