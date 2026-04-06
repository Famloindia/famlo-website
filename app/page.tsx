import Link from "next/link";

export default function HomePage(): JSX.Element {
  return (
    <section className="px-6 py-12 sm:py-16">
      <div className="mx-auto grid min-h-[calc(100vh-6rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#8a6a3d]">
            Famlo App
          </p>
          <div className="space-y-5">
            <h1 className="max-w-3xl text-5xl font-semibold tracking-[-0.05em] text-[#1f2937] sm:text-6xl">
              Local homes. Local buddies. A softer way to travel.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-[#52606d]">
              Famlo connects travelers with trusted home hosts and city buddies.
              This first version is focused on partner onboarding, so new
              partners can join now and the full product can grow around them.
            </p>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/partners"
              className="inline-flex items-center justify-center rounded-full bg-[#1f2937] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#111827]"
            >
              Join Famlo
            </Link>
            <Link
              href="/partners/login"
              className="inline-flex items-center justify-center rounded-full border border-[#1f2937] px-6 py-3 text-sm font-semibold text-[#1f2937] transition hover:bg-white"
            >
              Partner login
            </Link>
          </div>
        </div>

        <div className="rounded-[36px] border border-white/70 bg-white/80 p-8 shadow-[0_28px_90px_rgba(15,23,42,0.08)] backdrop-blur sm:p-10">
          <div className="space-y-6">
            <div className="rounded-[28px] bg-[#f8f2e8] p-6">
              <p className="text-sm font-semibold text-[#1f2937]">Famlo Homes</p>
              <p className="mt-3 text-sm leading-7 text-[#52606d]">
                Homestay-style local stays hosted by real people in real places.
              </p>
            </div>
            <div className="rounded-[28px] bg-[#edf5f7] p-6">
              <p className="text-sm font-semibold text-[#1f2937]">Hommies</p>
              <p className="mt-3 text-sm leading-7 text-[#52606d]">
                Tour buddies who know the city, move around with you, help you
                explore, and make the day easier.
              </p>
            </div>
            <div className="rounded-[28px] bg-[#f6f4fb] p-6">
              <p className="text-sm font-semibold text-[#1f2937]">Admin approval</p>
              <p className="mt-3 text-sm leading-7 text-[#52606d]">
                Every application is reviewed before login credentials are
                issued.
              </p>
            </div>
            <div className="rounded-[28px] bg-[#fff7e6] p-6">
              <p className="text-sm font-semibold text-[#1f2937]">Partner login</p>
              <p className="mt-3 text-sm leading-7 text-[#52606d]">
                Home hosts and hommie partners can enter from one shared login
                area and continue into their dashboard or onboarding flow.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
