import Link from "next/link";

import type { Hommie } from "../../lib/types";

interface HommieCardProps {
  hommie: Hommie;
}

export function HommieCard({ hommie }: HommieCardProps): JSX.Element {
  const coverImage = hommie.images?.[0];

  return (
    <Link
      href={`/hommies/${hommie.slug}`}
      className="overflow-hidden rounded-[28px] border border-[#D5E7F8] bg-white shadow-[0_20px_60px_rgba(26,110,187,0.08)] transition hover:-translate-y-1"
    >
      <div className="relative h-64 bg-[#EAF5FF]">
        {coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImage}
            alt={hommie.property_name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-famloBlue">
            No image
          </div>
        )}
        <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-famloBlue">
          Hommie
        </div>
      </div>
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-famloText">
              {hommie.property_name}
            </h3>
            <p className="text-sm text-slate-600">
              {[hommie.locality, hommie.city, hommie.state]
                .filter(Boolean)
                .join(", ")}
            </p>
          </div>
          <p className="text-sm font-semibold text-famloBlue">
            Rs. {hommie.nightly_price}/night
          </p>
        </div>
        <p className="line-clamp-2 text-sm leading-7 text-slate-600">
          {hommie.description}
        </p>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Up to {hommie.max_guests} guests</span>
          <span>{hommie.amenities?.slice(0, 2).join(" · ") || "Curated stay"}</span>
        </div>
      </div>
    </Link>
  );
}
