"use client";

// FILE: components/MapSection.tsx
import type { JSX } from "react";
import { useMemo } from "react";

import type { ListingItem } from "./HomeCard";

interface MapSectionProps {
  listings: ListingItem[];
  selectedListingId: string | null;
  onSelect: (listing: ListingItem) => void;
  onOpen: (listing: ListingItem) => void;
}

export function MapSection({
  listings,
  selectedListingId,
  onSelect,
  onOpen
}: MapSectionProps): JSX.Element {
  const selectedListing =
    listings.find((listing) => listing.id === selectedListingId) ?? listings[0] ?? null;

  const mapCenter = useMemo<[number, number]>(() => {
    if (selectedListing) {
      return [selectedListing.latitude, selectedListing.longitude];
    }

    return [26.2389, 73.0243];
  }, [selectedListing]);

  return (
    <div className="overflow-hidden rounded-[14px] border-[0.5px] border-[#E8EEF5] bg-white lg:grid lg:h-[540px] lg:grid-cols-2">
      <div className="max-h-[540px] overflow-y-auto border-b-[0.5px] border-[#E8EEF5] lg:border-b-0 lg:border-r-[0.5px]">
        <div className="space-y-3 p-4">
          {listings.map((listing) => {
            const isActive = selectedListingId === listing.id;

            return (
              <button
                key={listing.id}
                type="button"
                onClick={() => onSelect(listing)}
                className={`flex w-full items-stretch gap-3 rounded-[14px] border-[0.5px] p-3 text-left transition ${
                  isActive
                    ? "border-[#1A6EBB] bg-[#EBF4FF]"
                    : "border-[#E8EEF5] bg-white"
                }`}
              >
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[12px] bg-gradient-to-br from-[#D7E8FF] via-[#EAF4FF] to-[#F8FAFD]">
                  {listing.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={listing.image}
                      alt={listing.name}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <p className="line-clamp-1 text-[14px] font-medium text-[#1A1A2E]">
                      {listing.name}
                    </p>
                    <p className="mt-1 line-clamp-1 text-[13px] text-[#6B7A99]">
                      {listing.area}, {listing.city}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {listing.quarterTags
                      .filter((quarter) => quarter.available)
                      .map((quarter) => (
                        <span
                          key={`${listing.id}-${quarter.key}`}
                          className="rounded-[8px] bg-[#F8FAFD] px-2 py-1 text-[11px] text-[#6B7A99]"
                        >
                          {quarter.label}
                        </span>
                      ))}
                  </div>
                  <p className="text-[13px] font-medium text-[#1A1A2E]">
                    from ₹{listing.priceFrom.toLocaleString("en-IN")} / quarter
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-[540px] bg-[#F8FAFD] p-4">
        <div className="flex h-full flex-col rounded-[18px] border border-[#E8EEF5] bg-white p-5 shadow-[0_12px_30px_rgba(26,110,187,0.08)]">
          <div className="rounded-[16px] border border-[#D7E8FF] bg-[linear-gradient(135deg,#EBF4FF_0%,#F8FAFD_100%)] p-5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1A6EBB]">
              Selected stay
            </div>
            <div className="text-[22px] font-semibold text-[#1A1A2E]">
              {selectedListing?.name ?? "Choose a stay"}
            </div>
            <div className="mt-2 text-[13px] text-[#6B7A99]">
              {selectedListing ? `${selectedListing.area}, ${selectedListing.city}` : "Select a listing from the left to see location details."}
            </div>
          </div>

          <div className="mt-4 grid gap-3 rounded-[16px] border border-[#E8EEF5] bg-[#F8FAFD] p-4">
            <div className="flex items-center justify-between text-[13px] text-[#6B7A99]">
              <span>Latitude</span>
              <span className="font-medium text-[#1A1A2E]">{mapCenter[0].toFixed(5)}</span>
            </div>
            <div className="flex items-center justify-between text-[13px] text-[#6B7A99]">
              <span>Longitude</span>
              <span className="font-medium text-[#1A1A2E]">{mapCenter[1].toFixed(5)}</span>
            </div>
            <div className="flex items-center justify-between text-[13px] text-[#6B7A99]">
              <span>Starting price</span>
              <span className="font-medium text-[#1A1A2E]">
                {selectedListing ? `₹${selectedListing.priceFrom.toLocaleString("en-IN")}` : "NA"}
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(selectedListing?.quarterTags ?? [])
              .filter((quarter) => quarter.available)
              .map((quarter) => (
                <span
                  key={`${selectedListing?.id ?? "selected"}-${quarter.key}-panel`}
                  className="rounded-[8px] bg-[#F8FAFD] px-2 py-1 text-[11px] text-[#6B7A99]"
                >
                  {quarter.label}
                </span>
              ))}
          </div>

          <div className="mt-auto flex gap-2 pt-6">
            <button
              type="button"
              disabled={!selectedListing}
              onClick={() => {
                if (!selectedListing) return;
                window.open(
                  `https://www.google.com/maps/dir/?api=1&destination=${selectedListing.latitude},${selectedListing.longitude}`,
                  "_blank"
                );
              }}
              className="inline-flex flex-1 items-center justify-center rounded-[8px] border-[0.5px] border-[#E8EEF5] px-3 py-2 text-[12px] font-medium text-[#1A1A2E] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Directions
            </button>
            <button
              type="button"
              disabled={!selectedListing}
              onClick={() => {
                if (!selectedListing) return;
                onOpen(selectedListing);
              }}
              className="inline-flex flex-1 items-center justify-center rounded-[8px] bg-[#1A6EBB] px-3 py-2 text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Book slot
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
