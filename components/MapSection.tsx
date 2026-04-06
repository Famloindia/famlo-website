"use client";

// FILE: components/MapSection.tsx
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

import type { ListingItem } from "./HomeCard";

interface MapSectionProps {
  listings: ListingItem[];
  selectedListingId: string | null;
  onSelect: (listing: ListingItem) => void;
  onOpen: (listing: ListingItem) => void;
}

function createPriceIcon(price: number, isSelected: boolean): any {
  return L.divIcon({
    className: "famlo-price-marker",
    html: `<div class="${isSelected ? "selected" : ""}">from ₹${price}</div>`,
    iconSize: [96, 36],
    iconAnchor: [48, 18]
  });
}

function MapFocus({ listing }: { listing: ListingItem | null }): null {
  const map = useMap();

  useEffect(() => {
    if (!listing) {
      return;
    }

    map.setView([listing.latitude, listing.longitude], 12, {
      animate: true
    });
  }, [listing, map]);

  return null;
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

      <div className="h-[540px]">
        <MapContainer
          center={mapCenter}
          zoom={11}
          className="h-full w-full"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapFocus listing={selectedListing} />

          {listings.map((listing) => (
            <Marker
              key={listing.id}
              position={[listing.latitude, listing.longitude]}
              icon={createPriceIcon(listing.priceFrom, listing.id === selectedListingId)}
              eventHandlers={{
                click: () => onSelect(listing)
              }}
            >
              <Popup className="famlo-map-popup" closeButton={false}>
                <div className="w-[220px] space-y-3">
                  <div>
                    <p className="text-[14px] font-medium text-[#1A1A2E]">
                      {listing.name}
                    </p>
                    <p className="mt-1 text-[12px] text-[#6B7A99]">
                      {listing.area}, {listing.city}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {listing.quarterTags
                      .filter((quarter) => quarter.available)
                      .map((quarter) => (
                        <span
                          key={`${listing.id}-${quarter.key}-popup`}
                          className="rounded-[8px] bg-[#F8FAFD] px-2 py-1 text-[11px] text-[#6B7A99]"
                        >
                          {quarter.label}
                        </span>
                      ))}
                  </div>
                  <p className="text-[13px] font-medium text-[#1A1A2E]">
                    from ₹{listing.priceFrom.toLocaleString("en-IN")}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        window.open(
                          `https://www.google.com/maps/dir/?api=1&destination=${listing.latitude},${listing.longitude}`,
                          "_blank"
                        )
                      }
                      className="inline-flex flex-1 items-center justify-center rounded-[8px] border-[0.5px] border-[#E8EEF5] px-3 py-2 text-[12px] font-medium text-[#1A1A2E]"
                    >
                      Directions
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpen(listing)}
                      className="inline-flex flex-1 items-center justify-center rounded-[8px] bg-[#1A6EBB] px-3 py-2 text-[12px] font-medium text-white"
                    >
                      Book slot
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
