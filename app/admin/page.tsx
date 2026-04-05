import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PartnerAdminApprovalPanel } from "@/app/_components/PartnerAdminApprovalPanel";
import {
  createAdminSessionToken,
  getAdminCookieName,
  getAdminSessionMaxAge,
  verifyAdminPassword,
  verifyAdminSessionToken
} from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
import type { FamilyApplication, FriendApplication } from "@/lib/types";

interface AdminPageProps {
  searchParams?: Promise<{
    error?: string;
  }>;
}

async function loadHomeApplications(): Promise<FamilyApplication[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("family_applications")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("Unable to load home applications", error);
    return [];
  }

  return ((data ?? []) as FamilyApplication[]).filter(
    (application) => application.status === "pending"
  );
}

async function loadHommieApplications(): Promise<FriendApplication[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("friend_applications")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("Unable to load hommie applications", error);
    return [];
  }

  return ((data ?? []) as FriendApplication[]).filter(
    (application) => application.status === "pending"
  );
}

async function loadPausedListingCount(): Promise<number> {
  const supabase = createAdminSupabaseClient();
  const { count, error } = await supabase
    .from("host_onboarding_drafts")
    .select("*", { count: "exact", head: true })
    .in("listing_status", ["paused", "conditional_pending"]);

  if (error) {
    console.error("Unable to load paused listing count", error);
    return 0;
  }

  return count ?? 0;
}

export default async function AdminPage({
  searchParams
}: Readonly<AdminPageProps>): Promise<JSX.Element> {
  const resolvedSearchParams = (await searchParams) ?? {};

  async function login(formData: FormData): Promise<void> {
    "use server";

    const password = String(formData.get("password") ?? "");
    const cookieStore = cookies();

    if (!verifyAdminPassword(password)) {
      redirect("/admin?error=invalid-password");
    }

    cookieStore.set(getAdminCookieName(), createAdminSessionToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getAdminSessionMaxAge()
    });

    revalidatePath("/admin");
    redirect("/admin");
  }

  const cookieStore = cookies();
  const isAuthenticated = verifyAdminSessionToken(
    cookieStore.get(getAdminCookieName())?.value
  );

  if (!isAuthenticated) {
    return (
      <section className="px-6 py-16">
        <div className="mx-auto w-full max-w-md rounded-[32px] border border-white/70 bg-white/80 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#8a6a3d]">
            Admin
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#1f2937]">
            Famlo approvals
          </h1>
          <p className="mt-4 text-sm leading-7 text-[#52606d]">
            Sign in to review family home-host and city-guide hommie applications.
          </p>

          <form action={login} className="mt-8 space-y-4">
            <input
              type="password"
              name="password"
              placeholder="Admin password"
              required
              className="w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
            />
            {resolvedSearchParams.error ? (
              <p className="text-sm text-[#9f1239]">Invalid admin password.</p>
            ) : null}
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-full bg-[#1f2937] px-5 py-3 text-sm font-semibold text-white"
            >
              Enter admin
            </button>
          </form>
        </div>
      </section>
    );
  }

  const [homeApplications, hommieApplications, pausedListingsCount] = await Promise.all([
    loadHomeApplications(),
    loadHommieApplications(),
    loadPausedListingCount()
  ]);

  return (
    <section className="px-6 py-12 sm:py-16">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#8a6a3d]">
            Admin Dashboard
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-[#1f2937] sm:text-5xl">
            Review partner applications
          </h1>
          <p className="max-w-3xl text-base leading-7 text-[#52606d]">
            Approving an application provisions the partner account and returns
            the user ID and password from the existing approval flow.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
            <p className="text-sm text-[#52606d]">Paused Listings</p>
            <p className="mt-3 text-3xl font-semibold text-[#1f2937]">
              {pausedListingsCount}
            </p>
            <p className="mt-2 text-sm text-[#52606d]">
              Hosts waiting on document completion or reactivation.
            </p>
          </div>
          <a
            href="/app/admin/paused-listings"
            className="inline-flex items-center justify-center rounded-full bg-[#1f2937] px-5 py-3 text-sm font-semibold text-white"
          >
            Open paused listings
          </a>
        </div>

        <PartnerAdminApprovalPanel
          familyApplications={homeApplications}
          friendApplications={hommieApplications}
        />
      </div>
    </section>
  );
}
