import Link from "next/link";

import { HommiePartnerDashboard } from "@/app/_components/HommiePartnerDashboard";
import { createAdminSupabaseClient } from "@/lib/supabase";
import type { Hommie, HommieBookingRequest } from "@/lib/types";

interface HommieDashboardPageProps {
  searchParams?: Promise<{
    slug?: string;
  }>;
}

export default async function HommieDashboardPage({
  searchParams
}: Readonly<HommieDashboardPageProps>): Promise<JSX.Element> {
  const supabase = createAdminSupabaseClient();
  const resolvedSearchParams = (await searchParams) ?? {};
  const slug = resolvedSearchParams.slug;

  let hommie: Hommie | null = null;

  if (slug) {
    const { data } = await supabase
      .from("hommies")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    hommie = (data as Hommie | null) ?? null;
  }

  if (!hommie) {
    const { data } = await supabase
      .from("hommies")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    hommie = (data as Hommie | null) ?? null;
  }

  const hommieId = hommie?.id ?? null;
  const { data: bookingsData } = hommieId
    ? await supabase
        .from("hommie_booking_requests")
        .select("*")
        .eq("hommie_id", hommieId)
        .order("created_at", { ascending: false })
    : { data: [] as HommieBookingRequest[] };

  const bookings = (bookingsData ?? []) as HommieBookingRequest[];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f6efe5_0%,#fbf9f4_45%,#f4f7fb_100%)] px-6 py-10">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#8a6a3d]">
              /app/partnerslogin/hommie/dashboard
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.05em] text-[#1f2937]">
              Hommie dashboard
            </h1>
            <p className="max-w-3xl text-base leading-7 text-[#52606d]">
              Manage your hommie listing, booking requests, availability details, and earnings from one partner workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/partners/login"
              className="rounded-full border border-[#1f2937] px-5 py-3 font-semibold text-[#1f2937]"
            >
              Back to partner login
            </Link>
          </div>
        </div>

        {!hommie ? (
          <section className="rounded-[32px] border border-white/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <p className="text-lg font-semibold text-[#1f2937]">No hommie listing found yet.</p>
            <p className="mt-3 text-sm leading-7 text-[#52606d]">
              Create or approve a hommie listing first, then this dashboard can load the live partner profile.
            </p>
          </section>
        ) : (
          <HommiePartnerDashboard hommie={hommie} bookings={bookings} />
        )}
      </div>
    </main>
  );
}
