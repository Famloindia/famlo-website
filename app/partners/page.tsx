import Link from "next/link";

export default function PartnersPage(): JSX.Element {
  return (
    <section className="px-6 py-12 sm:py-16">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <div className="space-y-5">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#8a6a3d]">
            Partner With Famlo
          </p>
          <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.05em] text-[#1f2937] sm:text-6xl">
            Join Famlo as a home host or as a hommie.
          </h1>
          <p className="max-w-3xl text-lg leading-8 text-[#52606d]">
            Famlo is building a travel experience around real local people,
            local homes, and trusted support inside the city.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <article className="rounded-[32px] border border-white/70 bg-white/80 p-7 shadow-[0_24px_80px_rgba(15,23,42,0.06)]">
            <h2 className="text-2xl font-semibold text-[#1f2937]">What is Famlo?</h2>
            <p className="mt-4 text-sm leading-7 text-[#52606d]">
              Famlo is a travel platform built around local trust. Instead of
              only booking a room, the traveler can stay with people and explore
              a city with local support.
            </p>
          </article>

          <article className="rounded-[32px] border border-white/70 bg-white/80 p-7 shadow-[0_24px_80px_rgba(15,23,42,0.06)]">
            <h2 className="text-2xl font-semibold text-[#1f2937]">What are Famlo Homes?</h2>
            <p className="mt-4 text-sm leading-7 text-[#52606d]">
              Famlo Homes are homestay-style local stays. They are real homes or
              home-like spaces hosted by local people who want to welcome guests
              with warmth, comfort, and local knowledge.
            </p>
          </article>

          <article className="rounded-[32px] border border-white/70 bg-white/80 p-7 shadow-[0_24px_80px_rgba(15,23,42,0.06)]">
            <h2 className="text-2xl font-semibold text-[#1f2937]">What is a Hommie?</h2>
            <p className="mt-4 text-sm leading-7 text-[#52606d]">
              A Hommie is a city buddy, not a formal guide. They are local
              people who know the city, can roam with you on their vehicle or
              alongside you, carry essentials like a powerbank, take good
              pictures, and publish activities that travelers can join. They are
              basically your tour buddy.
            </p>
          </article>
        </div>

        <div className="rounded-[36px] border border-[#e8dcc8] bg-[#fffaf2] p-8 sm:p-10">
          <p className="max-w-3xl text-base leading-8 text-[#52606d]">
            After you submit your application, the admin team reviews it in
            `/admin`. Once approved, the partner receives a user ID and password
            for the next phase of the platform.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/partners/home"
              className="inline-flex items-center justify-center rounded-full bg-[#1f2937] px-6 py-3 text-sm font-semibold text-white"
            >
              Join as home host
            </Link>
            <Link
              href="/partners/hommies"
              className="inline-flex items-center justify-center rounded-full border border-[#1f2937] px-6 py-3 text-sm font-semibold text-[#1f2937]"
            >
              Join as hommie
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
