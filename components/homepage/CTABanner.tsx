import Link from "next/link";

export function CTABanner(): JSX.Element {
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="overflow-hidden rounded-[32px] bg-famloBlue px-8 py-10 text-white shadow-[0_24px_80px_rgba(26,110,187,0.22)] sm:px-10 sm:py-12">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/80">
                Join Famlo
              </p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Are you a family, CityBuddy host, or stay provider? Join Famlo.
              </h2>
              <p className="text-base leading-7 text-white/80">
                Apply to become part of a carefully reviewed network built
                around hospitality, trust, and local connection.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
              <Link
                href="/home/partoffamlo"
                className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-famloBlue transition-colors hover:bg-[#EAF5FF]"
              >
                Join as a Family
              </Link>
              <Link
                href="/hommie/partoffamlo"
                className="inline-flex items-center justify-center rounded-full border border-white/40 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Join as CityBuddy
              </Link>
              <Link
                href="/hommies/host"
                className="inline-flex items-center justify-center rounded-full border border-white/40 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Join as a Hommie
              </Link>
              <Link
                href="/homes/partoffamlo"
                className="inline-flex items-center justify-center rounded-full border border-white/40 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Join as a Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
