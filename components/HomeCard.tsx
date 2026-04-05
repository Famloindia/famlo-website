"use client";

// FILE: components/HomeCard.tsx
export type QuarterKey = "morning" | "afternoon" | "evening" | "fullday";

export interface ListingQuarter {
  key: QuarterKey;
  label: string;
  timeRange: string;
  price: number;
  available: boolean;
}

export interface ListingItem {
  id: string;
  kind: "home" | "hommie";
  slug: string;
  name: string;
  city: string;
  state: string;
  area: string;
  description: string;
  oneLiner: string;
  image: string | null;
  latitude: number;
  longitude: number;
  googleMapsLink: string | null;
  rating: number;
  reviewCount: number;
  verified: boolean;
  mealsIncluded: boolean;
  priceFrom: number;
  quarterTags: ListingQuarter[];
  blockedDates: string[];
}

interface HomeCardProps {
  listing: ListingItem;
  onOpen: (listing: ListingItem) => void;
}

function HeartIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20.25c-4.35-2.71-8.25-5.93-8.25-10.04 0-2.45 1.94-4.46 4.35-4.46 1.61 0 3.12.88 3.9 2.24.78-1.36 2.29-2.24 3.9-2.24 2.41 0 4.35 2.01 4.35 4.46 0 4.11-3.9 7.33-8.25 10.04Z" />
    </svg>
  );
}

function PinIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s6-5.45 6-11a6 6 0 1 0-12 0c0 5.55 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function StarIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" stroke="currentColor" strokeWidth="1.4">
      <path d="m12 3.75 2.55 5.17 5.7.83-4.13 4.03.97 5.67L12 16.77l-5.09 2.68.97-5.67L3.75 9.75l5.7-.83L12 3.75Z" />
    </svg>
  );
}

const quarterTagStyles: Record<QuarterKey, string> = {
  morning: "bg-[#FFF4DD] text-[#9A5B00]",
  afternoon: "bg-[#EBF4FF] text-[#1A6EBB]",
  evening: "bg-[#FFEAF1] text-[#B83280]",
  fullday: "bg-[#EAFBF0] text-[#15803D]"
};

export function HomeCard({ listing, onOpen }: HomeCardProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onOpen(listing)}
      className="group overflow-hidden rounded-[14px] border-[0.5px] border-[#E8EEF5] bg-white text-left transition duration-200 hover:-translate-y-[1px] hover:border-[#1A6EBB]"
    >
      <div className="relative h-52 overflow-hidden bg-gradient-to-br from-[#D8E8FF] via-[#EAF3FF] to-[#F8FAFD]">
        {listing.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.image}
            alt={listing.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top_left,_#BFDAFF,_#EAF4FF_52%,_#F8FAFD)] text-sm font-medium text-[#6B7A99]">
            Famlo stay
          </div>
        )}

        <div className="absolute left-3 top-3 rounded-full bg-[#EBF4FF] px-3 py-1 text-xs font-medium text-[#1A6EBB]">
          Verified
        </div>

        <div className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#1A1A2E] shadow-sm backdrop-blur">
          <HeartIcon />
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(8,13,24,0)_0%,rgba(8,13,24,0.68)_100%)] px-4 pb-4 pt-10">
          <p className="text-sm font-medium text-white">{listing.oneLiner}</p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="space-y-1.5">
          <h3 className="line-clamp-1 text-[15px] font-medium text-[#1A1A2E]">
            {listing.name}
          </h3>
          <div className="flex items-center gap-1.5 text-[13px] text-[#6B7A99]">
            <PinIcon />
            <span className="line-clamp-1">
              {listing.area}, {listing.city}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {listing.quarterTags
            .filter((quarter) => quarter.available)
            .map((quarter) => (
              <span
                key={`${listing.id}-${quarter.key}`}
                className={`rounded-[10px] px-2.5 py-1 text-xs font-medium ${quarterTagStyles[quarter.key]}`}
              >
                {quarter.label}
              </span>
            ))}
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[15px] font-medium text-[#1A1A2E]">
              from ₹{listing.priceFrom.toLocaleString("en-IN")} / quarter
            </p>
          </div>
          <div className="flex items-center gap-1 text-[13px] text-[#6B7A99]">
            <span className="text-[#1A1A2E]">
              <StarIcon />
            </span>
            <span className="font-medium text-[#1A1A2E]">
              {listing.rating.toFixed(1)}
            </span>
            <span>({listing.reviewCount})</span>
          </div>
        </div>
      </div>
    </button>
  );
}
