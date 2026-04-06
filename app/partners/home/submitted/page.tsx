import Link from "next/link";

import { createAdminSupabaseClient } from "@/lib/supabase";
import type { HostOnboardingDraft } from "@/lib/types";

interface SubmittedPageProps {
  searchParams?: {
    draft?: string;
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export default async function SubmittedPage({
  searchParams
}: Readonly<SubmittedPageProps>): Promise<JSX.Element> {
  const draftId = searchParams?.draft;
  let draft: HostOnboardingDraft | null = null;

  if (draftId) {
    const supabase = createAdminSupabaseClient();
    const { data } = await supabase
      .from("host_onboarding_drafts")
      .select("*")
      .eq("id", draftId)
      .maybeSingle();

    draft = (data as HostOnboardingDraft | null) ?? null;
  }

  const payload = draft?.payload ?? {};
  const photos = Array.isArray(payload.photos) ? (payload.photos as string[]) : [];
  const rates = [
    {
      label: "Nightly",
      enabled: true,
      value: asString(payload.baseNightlyRate)
    },
    {
      label: "Morning",
      enabled: Boolean(payload.morningEnabled),
      value: asString(payload.morningRate)
    },
    {
      label: "Afternoon",
      enabled: Boolean(payload.afternoonEnabled),
      value: asString(payload.afternoonRate)
    },
    {
      label: "Evening",
      enabled: Boolean(payload.eveningEnabled),
      value: asString(payload.eveningRate)
    }
  ];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f6efe5_0%,#fbf9f4_46%,#eef3f8_100%)] px-6 py-14">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1fr_0.92fr]">
        <section className="rounded-[36px] border border-white/70 bg-white/85 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#8a6a3d]">
            Submitted For Review
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-[#1f2937]">
            Amazing! Your home looks wonderful.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#52606d]">
            Our team is reviewing your profile now. If approved, we will send your
            login credentials within 24 hours by SMS, email, and WhatsApp.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[28px] border border-[#ece5d8] bg-[#fffaf2] p-5">
              <p className="text-sm font-semibold text-[#1f2937]">Family story</p>
              <p className="mt-3 text-sm text-[#52606d]">
                {asString(payload.fullName) || draft?.primary_host_name || "Primary host"}
              </p>
              <p className="mt-1 text-sm text-[#52606d]">
                {asString(payload.familyComposition) || "Family composition not set yet"}
              </p>
              <p className="mt-3 text-sm leading-6 text-[#52606d]">
                {asString(payload.hostBio) || "Your host bio will appear here after save."}
              </p>
            </div>

            <div className="rounded-[28px] border border-[#ece5d8] bg-[#fffaf2] p-5">
              <p className="text-sm font-semibold text-[#1f2937]">Pricing summary</p>
              <div className="mt-3 space-y-2 text-sm text-[#52606d]">
                {rates.map((rate) => (
                  <p key={rate.label}>
                    {rate.label}: {rate.enabled ? `Rs. ${rate.value || "0"}` : "Off"}
                  </p>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[28px] border border-[#e5e7eb] bg-[#f8fbfd] p-5">
            <p className="text-sm font-semibold text-[#1f2937]">Submission checklist</p>
            <div className="mt-4 grid gap-3 text-sm text-[#52606d] sm:grid-cols-2">
              <p>OTP verified: {draft?.otp_verified_at ? "Done" : "Pending"}</p>
              <p>Story written: {asString(payload.hostBio) ? "Done" : "Pending"}</p>
              <p>Photos uploaded: {photos.filter(Boolean).length}/5</p>
              <p>Map pin added: {asString(payload.googleMapsLink) ? "Done" : "Pending"}</p>
              <p>Bank details added: {asString(payload.accountNumber) ? "Done" : "Pending"}</p>
              <p>Status: {draft?.listing_status ?? "submitted"}</p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={draftId ? `/app/partnerslogin/home/dashboard?draft=${draftId}` : "/app/partnerslogin/home/dashboard"}
              className="inline-flex rounded-full bg-[#1f2937] px-5 py-3 text-sm font-semibold text-white"
            >
              Open host dashboard preview
            </Link>
            <Link
              href="/partners/home"
              className="inline-flex rounded-full border border-[#1f2937] px-5 py-3 text-sm font-semibold text-[#1f2937]"
            >
              Edit another submission
            </Link>
          </div>
        </section>

        <aside className="rounded-[36px] border border-white/70 bg-white/85 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-semibold text-[#1f2937]">Photo thumbnail strip</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {photos.filter(Boolean).length > 0 ? (
              photos
                .filter(Boolean)
                .slice(0, 5)
                .map((photo, index) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${photo.slice(0, 20)}-${index}`}
                    src={photo}
                    alt={`Submission photo ${index + 1}`}
                    className="h-36 w-full rounded-[24px] object-cover"
                  />
                ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-[#d7ccbb] p-6 text-sm text-[#52606d] sm:col-span-2">
                Photos will appear here after the home is submitted.
              </div>
            )}
          </div>

          <div className="mt-8 rounded-[28px] border border-[#ece5d8] bg-[#fffaf2] p-5">
            <p className="text-sm font-semibold text-[#1f2937]">What happens next</p>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-[#52606d]">
              <li>1. Famlo reviews the photos, story, and setup quality.</li>
              <li>2. Approved hosts receive their login credentials.</li>
              <li>3. The dashboard opens with compliance at 80% complete.</li>
              <li>4. Document verification and video audit unlock the live listing.</li>
            </ol>
          </div>
        </aside>
      </div>
    </main>
  );
}
