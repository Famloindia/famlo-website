import Link from "next/link";

export function HeroSection(): JSX.Element {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-famloBlueLight via-white to-white">
      <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top_left,_rgba(26,110,187,0.14),_transparent_55%)]" />
      <div className="mx-auto grid min-h-[540px] w-full max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div className="relative space-y-8">
          <div className="inline-flex rounded-full border border-[#C9DEF6] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-famloBlue shadow-sm">
            Cultural stays and local connections
          </div>

          <div className="space-y-5">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-famloText sm:text-5xl lg:text-6xl">
              A professional living experience platform for cultural stays,
              local friendships, and homes that feel human.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              Famlo helps travelers discover trusted Famlo Visits, CityBuddy
              connections, and Famlo Stays with a review-led approach built for
              real hospitality across India.
            </p>
          </div>

          <div className="grid gap-4 rounded-[28px] border border-[#D5E7F8] bg-white/80 p-6 shadow-sm sm:grid-cols-3">
            <div>
              <p className="text-sm font-semibold text-famloText">Curated trust</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Every visit, CityBuddy profile, homestay, and Famlo Home is reviewed before going live.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-famloText">Explore with confidence</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Search by city, compare stays, and discover rooted local experiences.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-famloText">Built for India</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Designed for places where hospitality is personal and hotels are not always nearby.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-famloBlue">
              Join Famlo
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
              <Link
                href="/home/partoffamlo"
                className="inline-flex items-center justify-center rounded-full bg-famloBlue px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#155d9f]"
              >
                Join as a Family
              </Link>
              <Link
                href="/hommie/partoffamlo"
                className="inline-flex items-center justify-center rounded-full border border-famloBlue bg-white px-6 py-3.5 text-sm font-semibold text-famloBlue transition-colors hover:bg-famloBlueLight"
              >
                Join as CityBuddy
              </Link>
              <Link
                href="/hommies/host"
                className="inline-flex items-center justify-center rounded-full border border-[#C8DDF3] bg-[#F6FAFF] px-6 py-3.5 text-sm font-semibold text-famloText transition-colors hover:border-famloBlue hover:text-famloBlue"
              >
                Join as a Hommie
              </Link>
              <Link
                href="/homes/partoffamlo"
                className="inline-flex items-center justify-center rounded-full border border-[#C8DDF3] bg-[#F6FAFF] px-6 py-3.5 text-sm font-semibold text-famloText transition-colors hover:border-famloBlue hover:text-famloBlue"
              >
                Join as a Home
              </Link>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -left-6 top-10 h-28 w-28 rounded-full bg-famloBlueLight blur-2xl" />
          <div className="absolute -right-6 bottom-8 h-36 w-36 rounded-full bg-[#D9ECFF] blur-3xl" />
          <div className="relative rounded-[32px] border border-[#D5E7F8] bg-white p-6 shadow-[0_24px_80px_rgba(26,110,187,0.12)]">
            <div className="grid gap-4">
              <div className="rounded-[24px] bg-[#F5FAFF] p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-famloBlue">
                  What makes Famlo different
                </p>
                <div className="mt-5 grid gap-4">
                  <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-famloText">
                      Manually reviewed families
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Every family application is checked before joining the
                      network.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-famloText">
                      Verified CityBuddy hosts
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      City Buddies are approved to help travelers feel at home
                      faster.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-famloText">
                      Human-first matching
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      We focus on trust, fit, and real local connection over
                      volume.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
