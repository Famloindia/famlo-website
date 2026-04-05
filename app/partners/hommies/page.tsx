import Link from "next/link";

import { PartnerFormShell } from "@/app/_components/PartnerFormShell";
import { SubmitButton } from "@/app/_components/SubmitButton";
import { submitHommiePartnerApplication } from "@/app/partners/actions";

interface PartnerHommiesPageProps {
  searchParams?: {
    submitted?: string;
    error?: string;
  };
}

export default function PartnerHommiesPage({
  searchParams
}: Readonly<PartnerHommiesPageProps>): JSX.Element {
  const submitted = searchParams?.submitted === "1";
  const error = searchParams?.error;

  return (
    <PartnerFormShell
      eyebrow="Hommies"
      title="Apply to join as a hommie."
      description="Tell us about your city knowledge, how you help travelers, and the activities you can offer. Admin will review this before approval."
    >
      <div className="space-y-6">
        {submitted ? (
          <div className="rounded-[24px] border border-[#d6eadf] bg-[#f3fbf6] p-4 text-sm text-[#305744]">
            Your hommie application was submitted successfully.
          </div>
        ) : null}
        {error ? (
          <div className="rounded-[24px] border border-[#ef4444]/20 bg-[#fff1f2] p-4 text-sm text-[#9f1239]">
            {decodeURIComponent(error)}
          </div>
        ) : null}

        <form action={submitHommiePartnerApplication} className="grid gap-4">
          <input name="fullName" placeholder="Your full name" className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none" required />
          <input name="email" type="email" placeholder="Email address" className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none" required />
          <input name="phone" placeholder="Phone / WhatsApp" className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none" />
          <div className="grid gap-4 sm:grid-cols-2">
            <input name="city" placeholder="City" className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none" required />
            <input name="state" placeholder="State" className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none" />
          </div>
          <textarea name="bio" placeholder="Describe how you help travelers in the city" className="min-h-[120px] rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none" required />
          <input name="languages" placeholder="Languages, separated by commas" className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none" />
          <input name="interests" placeholder="Interests, separated by commas" className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none" />
          <input name="skills" placeholder="Skills, separated by commas" className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none" />
          <textarea name="activityTypes" placeholder="Activities you can offer, separated by commas" className="min-h-[90px] rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none" />
          <input name="availability" placeholder="Availability" className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none" />
          <input name="photoUrl" placeholder="Profile/photo URL" className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none" />
          <SubmitButton label="Submit hommie application" />
        </form>

        <Link href="/partners" className="inline-flex text-sm font-medium text-[#52606d] underline underline-offset-4">
          Back to partner options
        </Link>
      </div>
    </PartnerFormShell>
  );
}
