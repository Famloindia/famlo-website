import Link from "next/link";

import { HomeHostOnboardingFlow } from "@/app/_components/HomeHostOnboardingFlow";

export default function PartnerHomePage(): JSX.Element {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f6efe5_0%,#fbf9f4_40%,#f4f7fb_100%)]">
      <section className="border-b border-[#eadfce] px-6 py-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#8a6a3d]">
              Famlo Homes
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.05em] text-[#1f2937] sm:text-5xl">
              Build your host profile first. Compliance comes after the momentum.
            </h1>
            <p className="text-base leading-7 text-[#52606d]">
              This home-host flow is designed to feel like building your future
              listing, not filling a government form. You will create your draft,
              shape your story, show your home, set your rates, and then send it to
              Famlo for review.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/70 bg-white/80 p-5 text-sm text-[#52606d] shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
            <p className="font-semibold text-[#1f2937]">Flow snapshot</p>
            <p className="mt-2">Hook {"->"} Family Story {"->"} The Space {"->"} Pricing &amp; Bank</p>
            <p className="mt-2">
              After review, approved hosts will receive their user ID and password.
            </p>
          </div>
        </div>
      </section>

      <HomeHostOnboardingFlow />

      <section className="px-6 pb-12">
        <div className="mx-auto flex w-full max-w-7xl justify-between gap-4 text-sm text-[#52606d]">
          <Link
            href="/partners"
            className="inline-flex font-medium underline underline-offset-4"
          >
            Back to partner options
          </Link>
          <Link
            href="/app/partnerslogin/home/dashboard"
            className="inline-flex font-medium underline underline-offset-4"
          >
            Preview host dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
