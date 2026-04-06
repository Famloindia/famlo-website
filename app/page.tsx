import Link from "next/link";

import { getFeaturedFamilies, getFeaturedFriends, getFeaturedHomes, getFeaturedHommies } from "@/lib/discovery";
import { getFeaturedStories } from "@/lib/stories";

export default async function HomePage(): Promise<JSX.Element> {
  const [families, friends, hommies, homes, stories] = await Promise.all([
    getFeaturedFamilies(3),
    getFeaturedFriends(3),
    getFeaturedHommies(3),
    getFeaturedHomes(3),
    getFeaturedStories()
  ]);

  const currentCity =
    families.find((family) => family.city)?.city ??
    friends.find((friend) => friend.city)?.city ??
    hommies.find((hommie) => hommie.city)?.city ??
    homes.find((home) => home.city)?.city ??
    "your city";

  const homeHighlights = homes.slice(0, 3).map((home) => ({
    id: home.id,
    href: `/homes/${home.slug}`,
    title: home.property_name,
    city: [home.locality, home.city, home.state].filter(Boolean).join(", "),
    description: home.description,
    image: home.images?.[0] ?? null,
    price: home.nightly_price ? `From Rs. ${home.nightly_price}` : "Custom pricing"
  }));

  const hommieHighlights = hommies.slice(0, 2).map((hommie) => ({
    id: hommie.id,
    href: `/hommies/${hommie.slug}`,
    title: hommie.property_name,
    city: [hommie.locality, hommie.city, hommie.state].filter(Boolean).join(", "),
    description: hommie.description,
    image: hommie.images?.[0] ?? null,
    price: hommie.nightly_price ? `From Rs. ${hommie.nightly_price}` : "Custom pricing"
  }));

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#EAF3FF_0%,#F4F9FF_35%,#FFFFFF_100%)] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <section className="overflow-hidden rounded-[36px] border-[4px] border-[#B8D2F1] bg-[linear-gradient(180deg,#FFFFFF_0%,#F4F9FF_100%)] px-5 py-6 shadow-[0_24px_0_rgba(26,110,187,0.12)] sm:px-8 sm:py-8">
          <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="space-y-5">
              <p className="text-sm font-black uppercase tracking-[0.38em] text-[#1A6EBB]">
                Famlo
              </p>
              <div className="space-y-3">
                <h1 className="max-w-4xl text-4xl font-black tracking-[-0.06em] text-[#0B2441] sm:text-6xl">
                  Live like local
                </h1>
                <p className="max-w-3xl text-base leading-7 text-[#49617F] sm:text-lg sm:leading-8">
                  See the real culture of India by living with people, eating with them, and travelling openly.
                </p>
                <p className="inline-flex max-w-full rounded-[18px] border-[3px] border-[#C7DCF6] bg-[#EEF6FF] px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#1A6EBB] sm:text-xs">
                  Safety, authenticity and affordability are our 3 principles
                </p>
              </div>
              <form action="/homes" className="grid gap-3 rounded-[28px] border-[3px] border-[#D5E7F8] bg-white p-4 shadow-[0_14px_0_rgba(26,110,187,0.08)] sm:grid-cols-[1fr_auto]">
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-[#1A6EBB]">
                    Search nearby stays
                  </span>
                  <input
                    type="text"
                    name="city"
                    defaultValue={currentCity === "your city" ? "" : currentCity}
                    placeholder="Search homes near you"
                    className="h-14 rounded-[18px] border-[3px] border-[#D5E7F8] bg-[#F8FBFF] px-4 text-base font-semibold text-[#0B2441] outline-none placeholder:text-[#7A92AE]"
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex h-14 items-center justify-center rounded-[18px] border-[3px] border-[#1A6EBB] bg-[#1A6EBB] px-6 text-sm font-black uppercase tracking-[0.16em] text-white"
                >
                  Explore
                </button>
              </form>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/partners"
                  className="inline-flex items-center justify-center rounded-[18px] border-[3px] border-[#1A6EBB] bg-[#1A6EBB] px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-white"
                >
                  Join Famlo
                </Link>
                <Link
                  href="/partners/login"
                  className="inline-flex items-center justify-center rounded-[18px] border-[3px] border-[#B8D2F1] bg-white px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-[#1A6EBB]"
                >
                  Partner login
                </Link>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-4 rounded-[28px] border-[3px] border-[#C7DCF6] bg-[#F6FAFF] p-5 shadow-[0_14px_0_rgba(26,110,187,0.10)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.2em] text-[#1A6EBB]">Near {currentCity}</p>
                    <p className="mt-2 text-2xl font-black text-[#0B2441]">Famlo Homes</p>
                  </div>
                  <div className="rounded-[18px] border-[3px] border-[#D5E7F8] bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-[#1A6EBB]">
                    Private before booking
                  </div>
                </div>
                <p className="text-sm leading-7 text-[#49617F]">
                  Local homes hosted by real people, with human-first hospitality, city-level discovery, and exact location hidden until booking.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[20px] border-[3px] border-[#DDEBFA] bg-white p-4">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#1A6EBB]">Homes live</p>
                    <p className="mt-2 text-3xl font-black text-[#0B2441]">{families.length + homes.length}</p>
                  </div>
                  <div className="rounded-[20px] border-[3px] border-[#DDEBFA] bg-white p-4">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#1A6EBB]">Stories shared</p>
                    <p className="mt-2 text-3xl font-black text-[#0B2441]">{stories.length}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-[24px] border-[3px] border-[#C7DCF6] bg-white p-5 shadow-[0_14px_0_rgba(26,110,187,0.10)]">
                <p className="text-lg font-black text-[#0B2441]">Hommies</p>
                <p className="mt-2 text-sm leading-7 text-[#49617F]">
                  Local companions and activity hosts who help travelers move through a city with ease, context, and trust.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#1A6EBB]">Popular Famlo Homes</p>
            <h2 className="text-3xl font-black tracking-[-0.05em] text-[#0B2441]">Homes hosted by real families</h2>
          </div>
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="grid gap-5 md:grid-cols-2">
              {families.map((family) => (
                <article key={family.id} className="rounded-[30px] border-[3px] border-[#C7DCF6] bg-white p-6 shadow-[0_16px_0_rgba(26,110,187,0.10)]">
                  <div className="rounded-[22px] border-[3px] border-[#DDEBFA] bg-[linear-gradient(135deg,#DCEBFA_0%,#F7FBFF_100%)] p-5">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#1A6EBB]">
                      {family.city || "India"}
                    </p>
                    <p className="mt-3 text-2xl font-black text-[#0B2441]">{family.name}</p>
                    <p className="mt-2 text-sm text-[#5A7190]">{[family.village, family.city, family.state].filter(Boolean).join(", ")}</p>
                  </div>
                  <p className="mt-5 line-clamp-4 text-sm leading-7 text-[#49617F]">
                    {family.about || family.description || "A culturally rooted stay hosted by a local family."}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {["Family stay", family.max_guests ? `${family.max_guests} guests` : "Flexible stay", family.is_accepting ? "Open now" : "Request based"].map((tag) => (
                      <span key={tag} className="rounded-[14px] border-[2px] border-[#DDEBFA] bg-[#F7FBFF] px-3 py-2 text-xs font-black text-[#1A6EBB]">
                        {tag}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="grid gap-5">
              {homeHighlights.map((home) => (
                <Link
                  key={home.id}
                  href={home.href}
                  className="overflow-hidden rounded-[30px] border-[3px] border-[#C7DCF6] bg-white shadow-[0_16px_0_rgba(26,110,187,0.10)]"
                >
                  <div
                    className="h-48 bg-cover bg-center"
                    style={{
                      backgroundImage: home.image
                        ? `linear-gradient(180deg, rgba(9,31,55,0.12), rgba(9,31,55,0.42)), url(${home.image})`
                        : "linear-gradient(135deg, #DCEBFA 0%, #F7FBFF 100%)"
                    }}
                  />
                  <div className="p-5">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#1A6EBB]">{home.price}</p>
                    <p className="mt-2 text-2xl font-black text-[#0B2441]">{home.title}</p>
                    <p className="mt-2 text-sm text-[#5A7190]">{home.city}</p>
                    <p className="mt-4 line-clamp-3 text-sm leading-7 text-[#49617F]">{home.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-[#1A6EBB]">City connections</p>
              <h2 className="text-3xl font-black tracking-[-0.05em] text-[#0B2441]">Local buddies and Hommies</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {friends.map((friend) => (
                <article key={friend.id} className="rounded-[28px] border-[3px] border-[#C7DCF6] bg-white p-6 shadow-[0_16px_0_rgba(26,110,187,0.10)]">
                  <p className="text-xl font-black text-[#0B2441]">{friend.name ?? "City Buddy"}</p>
                  <p className="mt-2 text-sm text-[#5A7190]">{[friend.city, friend.state].filter(Boolean).join(", ")}</p>
                  <p className="mt-4 line-clamp-4 text-sm leading-7 text-[#49617F]">
                    {friend.bio || "A local friend who can help travelers explore the city with confidence."}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-[#1A6EBB]">Hommies near {currentCity}</p>
              <h2 className="text-3xl font-black tracking-[-0.05em] text-[#0B2441]">Boxy local support</h2>
            </div>
            <div className="grid gap-5">
              {hommieHighlights.map((hommie) => (
                <Link
                  key={hommie.id}
                  href={hommie.href}
                  className="overflow-hidden rounded-[28px] border-[3px] border-[#C7DCF6] bg-white shadow-[0_16px_0_rgba(26,110,187,0.10)]"
                >
                  <div
                    className="h-40 bg-cover bg-center"
                    style={{
                      backgroundImage: hommie.image
                        ? `linear-gradient(180deg, rgba(9,31,55,0.12), rgba(9,31,55,0.42)), url(${hommie.image})`
                        : "linear-gradient(135deg, #DCEBFA 0%, #F7FBFF 100%)"
                    }}
                  />
                  <div className="p-5">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#1A6EBB]">{hommie.price}</p>
                    <p className="mt-2 text-xl font-black text-[#0B2441]">{hommie.title}</p>
                    <p className="mt-2 text-sm text-[#5A7190]">{hommie.city}</p>
                    <p className="mt-4 line-clamp-3 text-sm leading-7 text-[#49617F]">{hommie.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[3fr_2fr]">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-[#1A6EBB]">Stories</p>
              <h2 className="text-3xl font-black tracking-[-0.05em] text-[#0B2441]">Real guest experiences</h2>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              {stories.map((story) => (
                <article key={story.id} className="rounded-[28px] border-[3px] border-[#C7DCF6] bg-white p-6 shadow-[0_16px_0_rgba(26,110,187,0.10)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-black text-[#0B2441]">{story.author_name || "Famlo guest"}</p>
                      <p className="mt-1 text-sm text-[#5A7190]">{story.from_city || "India"}</p>
                    </div>
                    <div className="rounded-[14px] border-[2px] border-[#C7DCF6] bg-[#EEF6FF] px-3 py-1 text-xs font-black text-[#1A6EBB]">
                      {story.rating ? `${story.rating.toFixed(1)} / 5` : "Story"}
                    </div>
                  </div>
                  <p className="mt-4 line-clamp-5 text-sm leading-7 text-[#49617F]">
                    {story.story_text || "A thoughtful guest story shared on Famlo."}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="grid gap-5 rounded-[32px] border-[4px] border-[#B8D2F1] bg-[#F7FBFF] p-6 shadow-[0_20px_0_rgba(26,110,187,0.10)]">
            <div className="space-y-2">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-[#1A6EBB]">Join the network</p>
              <h2 className="text-3xl font-black tracking-[-0.05em] text-[#0B2441]">Famlo Homes and Hommies</h2>
            </div>
            <p className="text-sm leading-7 text-[#49617F]">
              Open your home, host a meaningful local activity, or become the trusted local person travelers rely on in your city.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[24px] border-[3px] border-[#DDEBFA] bg-white p-5">
                <p className="text-lg font-black text-[#0B2441]">Famlo Homes</p>
                <p className="mt-2 text-sm leading-7 text-[#49617F]">For hosts who want to share home, culture, meals, and real local care.</p>
              </div>
              <div className="rounded-[24px] border-[3px] border-[#DDEBFA] bg-white p-5">
                <p className="text-lg font-black text-[#0B2441]">Hommies</p>
                <p className="mt-2 text-sm leading-7 text-[#49617F]">For local guides and companions who make travel easier, warmer, and safer.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/partners"
                className="inline-flex items-center justify-center rounded-[18px] border-[3px] border-[#1A6EBB] bg-[#1A6EBB] px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-white"
              >
                Join Famlo
              </Link>
              <Link
                href="/partners/login"
                className="inline-flex items-center justify-center rounded-[18px] border-[3px] border-[#B8D2F1] bg-white px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-[#1A6EBB]"
              >
                Partner login
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
