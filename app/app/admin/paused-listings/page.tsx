import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  getAdminCookieName,
  verifyAdminSessionToken
} from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
import type { HostOnboardingDraft } from "@/lib/types";

function hasDoc(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export default async function PausedListingsPage(): Promise<JSX.Element> {
  const cookieStore = await cookies();
  const isAuthenticated = verifyAdminSessionToken(
    cookieStore.get(getAdminCookieName())?.value
  );

  if (!isAuthenticated) {
    redirect("/admin");
  }

  const supabase = createAdminSupabaseClient();
  const { data } = await supabase
    .from("host_onboarding_drafts")
    .select("*")
    .in("listing_status", ["paused", "conditional_pending"])
    .order("updated_at", { ascending: false });

  const drafts = ((data ?? []) as HostOnboardingDraft[]).map((draft) => {
    const compliance = draft.compliance ?? {};
    return {
      ...draft,
      pccUploaded: hasDoc(compliance.pccFileName),
      propertyUploaded: hasDoc(compliance.propertyProofFileName),
      formCAcknowledged: Boolean(compliance.formCAcknowledged)
    };
  });

  const totalPaused = drafts.filter((draft) => draft.listing_status === "paused").length;
  const docsSubmitted = drafts.filter(
    (draft) => draft.pccUploaded && draft.propertyUploaded
  ).length;
  const docsMissing = drafts.filter(
    (draft) => !draft.pccUploaded || !draft.propertyUploaded
  ).length;
  const awaitingReview = drafts.filter(
    (draft) => draft.listing_status === "conditional_pending"
  ).length;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f6efe5_0%,#f9fbfd_100%)] px-6 py-10">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#8a6a3d]">
              Admin / Paused Listings
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.05em] text-[#1f2937]">
              Review paused and conditional host accounts
            </h1>
            <p className="max-w-3xl text-base leading-7 text-[#52606d]">
              This panel helps the team track document gaps, seven-day follow-ups,
              and hosts who are close to activation.
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex rounded-full border border-[#1f2937] px-5 py-3 text-sm font-semibold text-[#1f2937]"
          >
            Back to admin dashboard
          </Link>
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            ["Total Paused", totalPaused],
            ["Docs Submitted", docsSubmitted],
            ["Docs Missing", docsMissing],
            ["Awaiting Review", awaitingReview]
          ].map(([label, value]) => (
            <article
              key={label}
              className="rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.05)]"
            >
              <p className="text-sm text-[#52606d]">{label}</p>
              <p className="mt-3 text-3xl font-semibold text-[#1f2937]">{value}</p>
            </article>
          ))}
        </section>

        <section className="space-y-4">
          {drafts.length === 0 ? (
            <div className="rounded-[32px] border border-white/70 bg-white/85 p-8 text-sm text-[#52606d] shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
              No paused or conditional host listings right now.
            </div>
          ) : (
            drafts.map((draft) => (
              <article
                key={draft.id}
                className="rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <h2 className="text-2xl font-semibold text-[#1f2937]">
                      {draft.primary_host_name || "Unnamed host"}
                    </h2>
                    <p className="text-sm text-[#52606d]">
                      {draft.city_neighbourhood || "City pending"} · paused since{" "}
                      {new Date(draft.updated_at).toLocaleDateString("en-IN")}
                    </p>
                    <p className="text-sm text-[#52606d]">
                      Status: {draft.listing_status}
                    </p>
                  </div>
                  <div className="grid gap-2 text-sm text-[#52606d]">
                    <p>PCC: {draft.pccUploaded ? "Uploaded" : "Not uploaded"}</p>
                    <p>
                      Property proof: {draft.propertyUploaded ? "Uploaded" : "Not uploaded"}
                    </p>
                    <p>Form C: {draft.formCAcknowledged ? "Acknowledged" : "Pending"}</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] p-5 text-sm text-[#52606d]">
                    Actions available next:
                    {draft.pccUploaded && draft.propertyUploaded
                      ? " Unpause and activate."
                      : " Send reminder, offer concierge visit, or request re-upload."}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="rounded-full border border-[#1f2937] px-4 py-2 text-sm font-semibold text-[#1f2937]"
                    >
                      Send Reminder SMS
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-[#1f2937] px-4 py-2 text-sm font-semibold text-[#1f2937]"
                    >
                      Offer Concierge Visit
                    </button>
                    <button
                      type="button"
                      disabled={!draft.pccUploaded || !draft.propertyUploaded}
                      className="rounded-full bg-[#1f2937] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Unpause and Activate
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
