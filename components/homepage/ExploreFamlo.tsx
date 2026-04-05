import Link from "next/link";
import type { ReactNode } from "react";

import type { CityGuideProfile, FamilyProfile, Home, Hommie } from "../../lib/types";

interface ExploreFamloProps {
  families: FamilyProfile[];
  friends: CityGuideProfile[];
  hommies: Hommie[];
  homes: Home[];
}

function SectionCard({
  title,
  eyebrow,
  href,
  children
}: {
  title: string;
  eyebrow: string;
  href: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-famloBlue">
            {eyebrow}
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-famloText sm:text-3xl">
            {title}
          </h2>
        </div>
        <Link href={href} className="text-sm font-semibold text-famloBlue">
          See all
        </Link>
      </div>
      {children}
    </section>
  );
}

export function ExploreFamlo({
  families,
  friends,
  hommies,
  homes
}: ExploreFamloProps): JSX.Element {
  const allStays = [
    ...hommies.map((hommie) => ({
      id: hommie.id,
      name: hommie.property_name,
      href: `/hommies/${hommie.slug}`,
      location: [hommie.locality, hommie.city, hommie.state].filter(Boolean).join(", "),
      description: hommie.description,
      metaLeft: `Up to ${hommie.max_guests} guests`,
      metaRight: `Rs. ${hommie.nightly_price}/night`,
      badge: "Homestay"
    })),
    ...homes.map((home) => ({
      id: home.id,
      name: home.property_name,
      href: `/homes/${home.slug}`,
      location: [home.locality, home.city, home.state].filter(Boolean).join(", "),
      description: home.description,
      metaLeft: home.room_type,
      metaRight: `Rs. ${home.nightly_price}/night`,
      badge: "Famlo Home"
    }))
  ];

  return (
    <section className="bg-[#F8FBFF] py-20 sm:py-24">
      <div className="mx-auto w-full max-w-7xl space-y-16 px-6">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-famloBlue">
            Explore Famlo
          </p>
          <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-famloText sm:text-4xl">
            Discover Famlo Visits, CityBuddy connections, and Famlo Stays ready to welcome travelers.
          </h2>
          <p className="max-w-3xl text-base leading-7 text-slate-600">
            Start local, search across cities, and grow a travel experience around trust, culture,
            and real hospitality.
          </p>
        </div>

        <SectionCard eyebrow="Famlo Visits" title="Explore cultural family visits" href="/families">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {families.map((family) => (
              <div
                key={family.id}
                className="rounded-[28px] border border-[#D5E7F8] bg-white p-6 shadow-[0_18px_50px_rgba(26,110,187,0.06)]"
              >
                <p className="text-lg font-semibold text-famloText">{family.name}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {[family.village, family.city, family.state].filter(Boolean).join(", ")}
                </p>
                <p className="mt-3 line-clamp-3 text-sm leading-7 text-slate-600">
                  {family.about || family.description || "A cultural family stay waiting to be discovered."}
                </p>
                <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                  <span>Up to {family.max_guests ?? 3} guests</span>
                  <span>{family.family_type || "Host family"}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard eyebrow="CityBuddy" title="Explore local companions" href="/friends">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {friends.map((friend) => (
              <div
                key={friend.id}
                className="rounded-[28px] border border-[#D5E7F8] bg-white p-6 shadow-[0_18px_50px_rgba(26,110,187,0.06)]"
              >
                <p className="text-lg font-semibold text-famloText">{friend.name ?? "City Buddy"}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {[friend.city, friend.state].filter(Boolean).join(", ")}
                </p>
                <p className="mt-3 line-clamp-3 text-sm leading-7 text-slate-600">
                  {friend.bio || "A local guide ready to help travelers feel at home in the city."}
                </p>
                <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                  <span>{friend.languages?.slice(0, 2).join(", ") || "Multilingual"}</span>
                  <span>{friend.price_hour ? `Rs. ${friend.price_hour}/hr` : "Custom pricing"}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard eyebrow="Famlo Stays" title="Explore homes and homestays" href="/stays">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {allStays.map((stay) => (
              <Link
                key={stay.id}
                href={stay.href}
                className="rounded-[28px] border border-[#D5E7F8] bg-white p-6 shadow-[0_18px_50px_rgba(26,110,187,0.06)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold text-famloText">{stay.name}</p>
                  <span className="rounded-full bg-[#F1F7FF] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-famloBlue">
                    {stay.badge}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{stay.location}</p>
                <p className="mt-3 line-clamp-3 text-sm leading-7 text-slate-600">
                  {stay.description}
                </p>
                <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                  <span>{stay.metaLeft}</span>
                  <span>{stay.metaRight}</span>
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </section>
  );
}
