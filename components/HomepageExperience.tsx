"use client";

// FILE: components/HomepageExperience.tsx
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { Home, Hommie } from "../lib/types";
import { FilterChips } from "./FilterChips";
import { HomeCard, type ListingItem, type ListingQuarter } from "./HomeCard";
import { MapSection } from "./MapSection";
import { QuarterModal } from "./QuarterModal";
import { SearchBar } from "./SearchBar";

interface HomepageExperienceProps {
  homes: Home[];
  hommies: Hommie[];
}

const recentStorageKey = "famlo_recently_viewed_stays";
const detectedCityKey = "famlo_detected_city";

function hashText(value: string): number {
  return value.split("").reduce((total, character) => total + character.charCodeAt(0), 0);
}

function buildQuarterSet(basePrice: number, blockedDates: string[]): ListingQuarter[] {
  return [
    {
      key: "morning",
      label: "Morning",
      timeRange: "6:00 AM – 11:00 AM",
      price: Math.max(250, Math.round(basePrice * 0.38)),
      available: true
    },
    {
      key: "afternoon",
      label: "Afternoon",
      timeRange: "11:00 AM – 4:00 PM",
      price: Math.max(300, Math.round(basePrice * 0.42)),
      available: true
    },
    {
      key: "evening",
      label: "Evening",
      timeRange: "4:00 PM – 9:00 PM",
      price: Math.max(300, Math.round(basePrice * 0.46)),
      available: true
    },
    {
      key: "fullday",
      label: "Full day",
      timeRange: "9:00 AM – 9:00 PM",
      price: Math.max(450, basePrice),
      available: blockedDates.length < 5
    }
  ];
}

function mapHomeToListing(home: Home): ListingItem {
  const seed = hashText(home.property_name);
  const blockedDates = home.blocked_dates ?? [];
  const quarterTags = buildQuarterSet(home.nightly_price, blockedDates);

  return {
    id: `home-${home.id}`,
    kind: "home",
    slug: home.slug,
    name: home.property_name,
    city: home.city,
    state: home.state,
    area: home.locality ?? home.city,
    description: home.description,
    oneLiner: home.description.split(".")[0] ?? "Hosted stay",
    image: home.images?.[0] ?? null,
    latitude: home.latitude,
    longitude: home.longitude,
    googleMapsLink: home.google_maps_link,
    rating: 4.5 + (seed % 5) * 0.1,
    reviewCount: 18 + (seed % 53),
    verified: home.is_approved,
    mealsIncluded: Boolean(home.food_details),
    priceFrom: Math.min(...quarterTags.map((quarter) => quarter.price)),
    quarterTags,
    blockedDates
  };
}

function mapHommieToListing(hommie: Hommie): ListingItem {
  const seed = hashText(hommie.property_name);
  const blockedDates = hommie.blocked_dates ?? [];
  const quarterTags = buildQuarterSet(hommie.nightly_price, blockedDates);

  return {
    id: `hommie-${hommie.id}`,
    kind: "hommie",
    slug: hommie.slug,
    name: hommie.property_name,
    city: hommie.city,
    state: hommie.state,
    area: hommie.locality ?? hommie.city,
    description: hommie.description,
    oneLiner: hommie.description.split(".")[0] ?? "Curated homestay",
    image: hommie.images?.[0] ?? null,
    latitude: hommie.latitude,
    longitude: hommie.longitude,
    googleMapsLink: hommie.google_maps_link,
    rating: 4.4 + (seed % 6) * 0.1,
    reviewCount: 12 + (seed % 41),
    verified: hommie.is_approved,
    mealsIncluded: Boolean(
      hommie.amenities?.some((amenity) =>
        amenity.toLowerCase().includes("meal")
      )
    ),
    priceFrom: Math.min(...quarterTags.map((quarter) => quarter.price)),
    quarterTags,
    blockedDates
  };
}

async function detectCity(): Promise<string> {
  if (typeof window === "undefined") {
    return "Jodhpur";
  }

  const cachedCity = window.localStorage.getItem(detectedCityKey);
  if (cachedCity) {
    return cachedCity;
  }

  if (!navigator.geolocation) {
    return "Jodhpur";
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${position.coords.latitude}&lon=${position.coords.longitude}`
          );
          const payload = (await response.json()) as {
            address?: { city?: string; town?: string; village?: string };
          };
          const nextCity =
            payload.address?.city ??
            payload.address?.town ??
            payload.address?.village ??
            "Jodhpur";
          window.localStorage.setItem(detectedCityKey, nextCity);
          resolve(nextCity);
        } catch {
          resolve("Jodhpur");
        }
      },
      () => resolve("Jodhpur"),
      { enableHighAccuracy: false, timeout: 4000 }
    );
  });
}

export function HomepageExperience({
  homes,
  hommies
}: HomepageExperienceProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [activeChip, setActiveChip] = useState("All");
  const [selectedListing, setSelectedListing] = useState<ListingItem | null>(null);
  const [detectedCity, setDetectedCity] = useState("Jodhpur");
  const [recentListingIds, setRecentListingIds] = useState<string[]>([]);
  const [selectedMapListingId, setSelectedMapListingId] = useState<string | null>(null);

  const listings = useMemo<ListingItem[]>(
    () => [...homes.map(mapHomeToListing), ...hommies.map(mapHommieToListing)],
    [homes, hommies]
  );

  useEffect(() => {
    void detectCity().then(setDetectedCity);
    if (typeof window === "undefined") {
      return;
    }

    const storedRecent = window.localStorage.getItem(recentStorageKey);
    if (storedRecent) {
      try {
        const parsed = JSON.parse(storedRecent) as string[];
        setRecentListingIds(parsed);
      } catch {
        setRecentListingIds([]);
      }
    }
  }, []);

  useEffect(() => {
    if (!selectedMapListingId && listings[0]) {
      setSelectedMapListingId(listings[0].id);
    }
  }, [listings, selectedMapListingId]);

  function storeRecentListing(listing: ListingItem): void {
    const nextRecent = [listing.id, ...recentListingIds.filter((item) => item !== listing.id)].slice(0, 4);
    setRecentListingIds(nextRecent);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(recentStorageKey, JSON.stringify(nextRecent));
    }
  }

  function openListingModal(listing: ListingItem): void {
    storeRecentListing(listing);
    setSelectedListing(listing);
    setSelectedMapListingId(listing.id);
  }

  const visibleListings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return listings.filter((listing) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [listing.name, listing.area, listing.city, listing.state, listing.description]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      if (!matchesQuery) {
        return false;
      }

      switch (activeChip) {
        case "Morning slot":
          return listing.quarterTags.some((quarter) => quarter.key === "morning" && quarter.available);
        case "Afternoon slot":
          return listing.quarterTags.some((quarter) => quarter.key === "afternoon" && quarter.available);
        case "Evening slot":
          return listing.quarterTags.some((quarter) => quarter.key === "evening" && quarter.available);
        case "Full day":
          return listing.quarterTags.some((quarter) => quarter.key === "fullday" && quarter.available);
        case "Meals included":
          return listing.mealsIncluded;
        case "Verified only":
          return listing.verified;
        case "Under ₹500":
          return listing.priceFrom <= 500;
        default:
          return true;
      }
    });
  }, [activeChip, listings, query]);

  const recentListings = useMemo(() => {
    if (recentListingIds.length === 0) {
      return listings.slice(0, 4);
    }

    const recentMap = new Map(listings.map((listing) => [listing.id, listing]));
    return recentListingIds
      .map((listingId) => recentMap.get(listingId))
      .filter((listing): listing is ListingItem => Boolean(listing));
  }, [listings, recentListingIds]);

  const popularNearbyListings = useMemo(() => {
    const matchingCityListings = visibleListings.filter(
      (listing) => listing.city.toLowerCase() === detectedCity.toLowerCase()
    );
    const source = matchingCityListings.length > 0 ? matchingCityListings : visibleListings;

    return [...source]
      .sort((first, second) => {
        const scoreA = first.rating * 10 + first.reviewCount;
        const scoreB = second.rating * 10 + second.reviewCount;
        return scoreB - scoreA;
      })
      .slice(0, 4);
  }, [detectedCity, visibleListings]);

  return (
    <>
      <SearchBar
        query={query}
        onQueryChange={setQuery}
        onSubmit={() => undefined}
      />

      <FilterChips activeChip={activeChip} onChipChange={setActiveChip} />

      <div className="bg-[#F8FAFD]">
        <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-10 px-6 py-8">
          <section className="space-y-4">
            <h2 className="font-[family:var(--font-playfair)] text-[17px] font-medium text-[#1A1A2E]">
              Recently viewed
            </h2>
            <div className="overflow-x-auto">
              <div className="flex min-w-max gap-4">
                {recentListings.map((listing) => (
                  <div key={listing.id} className="w-[220px] shrink-0">
                    <HomeCard listing={listing} onOpen={openListingModal} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="popular-homes" className="space-y-4">
            <h2 className="font-[family:var(--font-playfair)] text-[17px] font-medium text-[#1A1A2E]">
              Popular near you
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {popularNearbyListings.map((listing) => (
                <HomeCard key={listing.id} listing={listing} onOpen={openListingModal} />
              ))}
            </div>
          </section>

          <section id="map-search" className="space-y-4">
            <h2 className="font-[family:var(--font-playfair)] text-[17px] font-medium text-[#1A1A2E]">
              Search on map
            </h2>
            <MapSection
              listings={visibleListings}
              selectedListingId={selectedMapListingId}
              onSelect={(listing) => setSelectedMapListingId(listing.id)}
              onOpen={openListingModal}
            />
          </section>

          <section className="flex justify-end">
            <Link
              href="/home/partoffamlo"
              className="text-sm font-medium text-[#1A6EBB]"
            >
              join us.
            </Link>
          </section>
        </div>
      </div>

      <QuarterModal
        listing={selectedListing}
        isOpen={selectedListing !== null}
        onClose={() => setSelectedListing(null)}
      />
    </>
  );
}
