"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { CityGuideProfile, Home, Hommie } from "@/lib/types";
import type { FamilyWithPhotos } from "@/lib/discovery";
import type { StoryPreview } from "@/lib/stories";

const LOCATION_KEY = "famlo:selected-city";
const RECENT_VIEWS_KEY = "famlo:recent-views";

type RecentView = {
  id: string;
  href: string;
  title: string;
  city: string;
  kind: "home" | "hommie" | "story";
};

type DiscoveryHomepageProps = {
  families: FamilyWithPhotos[];
  friends: CityGuideProfile[];
  homes: Home[];
  hommies: Hommie[];
  stories: StoryPreview[];
};

type LocatableCityItem = {
  city: string | null;
  latitude: number;
  longitude: number;
};

type HomeCardItem = {
  id: string;
  slug?: string | null;
  href: string;
  title: string;
  city: string;
  locality: string;
  description: string;
  image: string | null;
  price: string;
  latitude?: number | null;
  longitude?: number | null;
};

type HommieCardItem = {
  id: string;
  slug?: string | null;
  href: string;
  title: string;
  city: string;
  locality: string;
  description: string;
  image: string | null;
  price: string;
  latitude?: number | null;
  longitude?: number | null;
};

function normalizeCity(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function titleCity(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return "your area";
  }

  return trimmed
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function readRecentViews(): RecentView[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(RECENT_VIEWS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as RecentView[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecentView(view: RecentView): void {
  if (typeof window === "undefined") {
    return;
  }

  const current = readRecentViews().filter((item) => item.id !== view.id);
  const next = [view, ...current].slice(0, 6);
  window.localStorage.setItem(RECENT_VIEWS_KEY, JSON.stringify(next));
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(latitudeB - latitudeA);
  const dLon = toRadians(longitudeB - longitudeA);
  const lat1 = toRadians(latitudeA);
  const lat2 = toRadians(latitudeB);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function findNearestCity(
  latitude: number,
  longitude: number,
  items: LocatableCityItem[]
): string {
  const nearest = items.reduce<{ city: string; distance: number } | null>((best, item) => {
    if (!item.city) {
      return best;
    }

    const distance = calculateDistanceKm(
      latitude,
      longitude,
      item.latitude,
      item.longitude
    );

    if (!best || distance < best.distance) {
      return { city: item.city, distance };
    }

    return best;
  }, null);

  return nearest?.city ?? "";
}

export function DiscoveryHomepage({
  families,
  friends,
  homes,
  hommies,
  stories
}: DiscoveryHomepageProps) {
  const [selectedCity, setSelectedCity] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [recentViews, setRecentViews] = useState<RecentView[]>([]);
  const [isDetectingLocation, setIsDetectingLocation] = useState(true);
  const [locationError, setLocationError] = useState("");

  const actualHomeCards = useMemo<HomeCardItem[]>(
    () =>
      homes.map((home) => ({
        id: `home-${home.id}`,
        slug: home.slug,
        href: home.slug ? `/homes/${home.slug}` : "/homes",
        title: home.property_name,
        city: home.city,
        locality: [home.locality, home.city, home.state].filter(Boolean).join(", "),
        description: home.description ?? "Local stay hosted with warmth and privacy.",
        image: home.images?.[0] ?? null,
        price: home.nightly_price ? `From Rs. ${home.nightly_price}` : "Custom pricing",
        latitude: home.latitude,
        longitude: home.longitude
      })),
    [homes]
  );

  const familyFallbackCards = useMemo<HomeCardItem[]>(
    () =>
      families.map((family) => ({
        id: `family-${family.id}`,
        href: `/families/${family.id}`,
        title: family.name,
        city: family.city ?? "",
        locality: [family.village, family.city, family.state].filter(Boolean).join(", "),
        description:
          family.about || family.description || "A culturally rooted stay hosted by a local family.",
        image: family.family_photos?.find((photo) => photo.is_primary)?.url ?? family.family_photos?.[0]?.url ?? null,
        price: family.price_fullday ? `From Rs. ${family.price_fullday}` : "Custom pricing",
        latitude: family.lat,
        longitude: family.lng
      })),
    [families]
  );

  const actualHommieCards = useMemo<HommieCardItem[]>(
    () =>
      hommies.map((hommie) => ({
        id: `hommie-${hommie.id}`,
        slug: hommie.slug,
        href: hommie.slug ? `/hommies/${hommie.slug}` : "/hommies",
        title: hommie.property_name,
        city: hommie.city,
        locality: [hommie.locality, hommie.city, hommie.state].filter(Boolean).join(", "),
        description: hommie.description ?? "Trusted local support in your destination.",
        image: hommie.images?.[0] ?? null,
        price: hommie.nightly_price ? `From Rs. ${hommie.nightly_price}` : "Custom pricing",
        latitude: hommie.latitude,
        longitude: hommie.longitude
      })),
    [hommies]
  );

  const friendFallbackCards = useMemo<HommieCardItem[]>(
    () =>
      friends.map((friend) => ({
        id: `friend-${friend.id}`,
        href: `/friends/${friend.id}`,
        title: friend.name || "Famlo Hommie",
        city: friend.city ?? "",
        locality: [friend.city, friend.state].filter(Boolean).join(", "),
        description:
          friend.bio || "A local companion who can help travelers explore with confidence.",
        image: null,
        price: friend.price_hour ? `From Rs. ${friend.price_hour}/hour` : "Custom pricing"
      })),
    [friends]
  );

  const homeCards = useMemo(() => {
    if (familyFallbackCards.length > 0) {
      return uniqueById([...familyFallbackCards, ...actualHomeCards]);
    }

    return uniqueById(actualHomeCards);
  }, [actualHomeCards, familyFallbackCards]);

  const hommieCards = useMemo(
    () => uniqueById([...friendFallbackCards, ...actualHommieCards]),
    [actualHommieCards, friendFallbackCards]
  );

  const geolocatableCities = useMemo<LocatableCityItem[]>(
    () => [
      ...homeCards
        .filter((home) => Number.isFinite(home.latitude) && Number.isFinite(home.longitude))
        .map((home) => ({
          city: home.city,
          latitude: home.latitude as number,
          longitude: home.longitude as number
        })),
      ...hommieCards
        .filter((hommie) => Number.isFinite(hommie.latitude) && Number.isFinite(hommie.longitude))
        .map((hommie) => ({
          city: hommie.city,
          latitude: hommie.latitude as number,
          longitude: hommie.longitude as number
        }))
    ],
    [homeCards, hommieCards]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedCity = window.localStorage.getItem(LOCATION_KEY) ?? "";
    const fallbackCity = homeCards.find((home) => home.city)?.city ?? hommieCards.find((hommie) => hommie.city)?.city ?? "";
    const nextCity = storedCity || fallbackCity;

    setSelectedCity(nextCity);
    setSearchValue(nextCity);
    setRecentViews(readRecentViews());

    if (!storedCity && navigator.geolocation) {
      setIsDetectingLocation(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const nearestCity = findNearestCity(
            position.coords.latitude,
            position.coords.longitude,
            geolocatableCities
          );

          if (nearestCity) {
            setSelectedCity(nearestCity);
            setSearchValue(nearestCity);
            window.localStorage.setItem(LOCATION_KEY, nearestCity);
            setLocationError("");
          }

          setIsDetectingLocation(false);
        },
        () => {
          setLocationError("GPS could not detect your city. You can still search below.");
          setIsDetectingLocation(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 3500,
          maximumAge: 300000
        }
      );
      return;
    }

    setIsDetectingLocation(false);
    if (!storedCity && !navigator.geolocation) {
      setLocationError("GPS is not available on this browser. You can still search below.");
    }
  }, [geolocatableCities, homeCards, hommieCards]);

  const cityOptions = useMemo(() => {
    return [...new Set([...homeCards.map((home) => home.city), ...hommieCards.map((hommie) => hommie.city)].filter(Boolean))].sort();
  }, [homeCards, hommieCards]);

  const filteredHomes = useMemo(() => {
    const city = normalizeCity(selectedCity);
    if (!city) {
      return homeCards;
    }

    const exactMatches = homeCards.filter((home) => normalizeCity(home.city) === city);
    return exactMatches.length > 0 ? exactMatches : homeCards.slice(0, 6);
  }, [homeCards, selectedCity]);

  const filteredStories = useMemo(() => {
    const city = normalizeCity(selectedCity);
    if (!city) {
      return stories;
    }

    const exactMatches = stories.filter((story) => normalizeCity(story.from_city) === city);
    return exactMatches.length > 0 ? exactMatches : stories.slice(0, 6);
  }, [stories, selectedCity]);

  const filteredHommies = useMemo(() => {
    const city = normalizeCity(selectedCity);
    if (!city) {
      return hommieCards;
    }

    const exactMatches = hommieCards.filter((hommie) => normalizeCity(hommie.city) === city);
    return exactMatches.length > 0 ? exactMatches : hommieCards.slice(0, 5);
  }, [hommieCards, selectedCity]);

  const visibleRecentViews = useMemo(() => {
    const city = normalizeCity(selectedCity);
    if (!city) {
      return recentViews;
    }

    return recentViews.filter((item) => normalizeCity(item.city) === city);
  }, [recentViews, selectedCity]);

  const cityLabel = titleCity(selectedCity);

  function applyCity(nextCity: string): void {
    const trimmed = nextCity.trim();
    setSelectedCity(trimmed);
    setSearchValue(trimmed);
    if (trimmed) {
      setLocationError("");
    }

    if (typeof window !== "undefined") {
      if (trimmed) {
        window.localStorage.setItem(LOCATION_KEY, trimmed);
      } else {
        window.localStorage.removeItem(LOCATION_KEY);
      }
    }
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    applyCity(searchValue);
  }

  function trackView(view: RecentView): void {
    saveRecentView(view);
    setRecentViews(readRecentViews());
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#EDF5FF_0%,#F8FBFF_42%,#FFFFFF_100%)] px-4 py-6 sm:px-6 sm:py-8">
      {isDetectingLocation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,22,43,0.55)] px-4">
          <div className="w-full max-w-lg rounded-[28px] border-[4px] border-[#B8D2F1] bg-white p-6 shadow-[0_30px_0_rgba(26,110,187,0.14)]">
            <p className="text-sm font-black uppercase tracking-[0.34em] text-[#1A6EBB]">
              Famlo
            </p>
            <h1 className="mt-4 text-3xl font-black tracking-[-0.05em] text-[#0B2441]">
              Detecting your location
            </h1>
            <p className="mt-3 text-sm leading-7 text-[#516A87]">
              We are using GPS to find the nearest Famlo city for you.
            </p>
            <div className="mt-6 h-14 rounded-[18px] border-[3px] border-[#CFE0F5] bg-[#F8FBFF] px-4">
              <div className="flex h-full items-center justify-between gap-4">
                <span className="text-sm font-semibold text-[#0B2441]">Finding stays near you...</span>
                <span className="h-5 w-5 rounded-full border-[3px] border-[#B8D2F1] border-t-[#1A6EBB] animate-spin" />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <datalist id="famlo-city-options">
        {cityOptions.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <div className="space-y-3">
          <p className="text-sm font-black uppercase tracking-[0.42em] text-[#1A6EBB]">
            Famlo
          </p>
          <h1 className="text-4xl font-black tracking-[-0.06em] text-[#0B2441] sm:text-6xl">
            Live like local
          </h1>
        </div>

        <form
          onSubmit={handleSearchSubmit}
          className="rounded-[28px] border-[4px] border-[#BCD5F2] bg-white p-4 shadow-[0_18px_0_rgba(26,110,187,0.10)]"
        >
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              list="famlo-city-options"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search your location"
              className="h-14 rounded-[18px] border-[3px] border-[#D5E7F8] bg-[#F8FBFF] px-4 text-base font-semibold text-[#0B2441] outline-none placeholder:text-[#7A92AE]"
            />
            <button
              type="submit"
              className="inline-flex h-14 items-center justify-center rounded-[18px] border-[3px] border-[#1A6EBB] bg-[#1A6EBB] px-6 text-sm font-black uppercase tracking-[0.16em] text-white"
            >
              Search
            </button>
          </div>
          {locationError ? (
            <p className="mt-3 text-sm font-semibold text-[#1A6EBB]">{locationError}</p>
          ) : null}
        </form>

        {visibleRecentViews.length > 0 ? (
          <section className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-[#1A6EBB]">
                Recent view
              </p>
              <h2 className="text-3xl font-black tracking-[-0.05em] text-[#0B2441]">
                Pick up where you left off
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleRecentViews.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="rounded-[24px] border-[3px] border-[#C7DCF6] bg-white p-5 shadow-[0_14px_0_rgba(26,110,187,0.10)]"
                >
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#1A6EBB]">{item.kind}</p>
                  <p className="mt-3 text-xl font-black text-[#0B2441]">{item.title}</p>
                  <p className="mt-2 text-sm text-[#5A7190]">{item.city}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#1A6EBB]">
              Popular homestay
            </p>
            <h2 className="text-3xl font-black tracking-[-0.05em] text-[#0B2441]">Popular homestays in {cityLabel}</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredHomes.slice(0, 6).map((home) => (
              <Link
                key={home.id}
                href={home.href}
                onClick={() =>
                  trackView({
                    id: home.id,
                    href: home.href,
                    title: home.title,
                    city: home.city,
                    kind: "home"
                  })
                }
                className="overflow-hidden rounded-[28px] border-[4px] border-[#BCD5F2] bg-white shadow-[0_18px_0_rgba(26,110,187,0.10)]"
              >
                <div
                  className="h-48 bg-[linear-gradient(135deg,#DCEBFA_0%,#F7FBFF_100%)] bg-cover bg-center"
                    style={home.image ? { backgroundImage: `linear-gradient(180deg, rgba(10,32,60,0.10), rgba(10,32,60,0.42)), url(${home.image})` } : undefined}
                  />
                <div className="p-5">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#1A6EBB]">{home.price}</p>
                  <p className="mt-3 text-2xl font-black text-[#0B2441]">{home.title}</p>
                  <p className="mt-2 text-sm text-[#5A7190]">{home.locality}</p>
                  <p className="mt-4 line-clamp-3 text-sm leading-7 text-[#4C6480]">{home.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#1A6EBB]">
              Homestays near you
            </p>
            <h2 className="text-3xl font-black tracking-[-0.05em] text-[#0B2441]">
              Homes near {cityLabel}
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredHomes.map((home) => (
              <Link
                key={`near-${home.id}`}
                href={home.href}
                onClick={() =>
                  trackView({
                    id: home.id,
                    href: home.href,
                    title: home.title,
                    city: home.city,
                    kind: "home"
                  })
                }
                className="rounded-[28px] border-[4px] border-[#D7E6F8] bg-[#F9FCFF] p-5 shadow-[0_14px_0_rgba(26,110,187,0.08)]"
              >
                <p className="text-lg font-black text-[#0B2441]">{home.title}</p>
                <p className="mt-2 text-sm text-[#5A7190]">{home.locality}</p>
                <p className="mt-4 line-clamp-4 text-sm leading-7 text-[#4C6480]">{home.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[3fr_1fr]">
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-[#1A6EBB]">
                Stories
              </p>
              <h2 className="text-3xl font-black tracking-[-0.05em] text-[#0B2441]">
                Stories from {cityLabel}
              </h2>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {filteredStories.slice(0, 6).map((story) => (
                <article
                  key={story.id}
                  className="rounded-[28px] border-[4px] border-[#BCD5F2] bg-white p-6 shadow-[0_16px_0_rgba(26,110,187,0.10)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-black text-[#0B2441]">{story.author_name || "Famlo guest"}</p>
                      <p className="mt-1 text-sm text-[#5A7190]">{story.from_city || cityLabel}</p>
                    </div>
                    <span className="rounded-[14px] border-[2px] border-[#D5E7F8] bg-[#EEF6FF] px-3 py-1 text-xs font-black text-[#1A6EBB]">
                      {story.rating ? `${story.rating.toFixed(1)} / 5` : "Story"}
                    </span>
                  </div>
                  <p className="mt-4 line-clamp-5 text-sm leading-7 text-[#4C6480]">
                    {story.story_text || "A guest story shared on Famlo."}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-[#1A6EBB]">
                Hommies
              </p>
              <h2 className="text-3xl font-black tracking-[-0.05em] text-[#0B2441]">
                Hommies near you
              </h2>
            </div>
            <div className="grid gap-4">
              {filteredHommies.slice(0, 5).map((hommie) => (
                <Link
                  key={hommie.id}
                  href={hommie.href}
                  onClick={() =>
                    trackView({
                      id: hommie.id,
                      href: hommie.href,
                      title: hommie.title,
                      city: hommie.city,
                      kind: "hommie"
                    })
                  }
                  className="rounded-[24px] border-[4px] border-[#BCD5F2] bg-white p-5 shadow-[0_14px_0_rgba(26,110,187,0.10)]"
                >
                  {hommie.image ? (
                    <div
                      className="mb-4 h-32 rounded-[18px] bg-cover bg-center"
                      style={{ backgroundImage: `linear-gradient(180deg, rgba(10,32,60,0.10), rgba(10,32,60,0.38)), url(${hommie.image})` }}
                    />
                  ) : null}
                  <p className="text-lg font-black text-[#0B2441]">{hommie.title}</p>
                  <p className="mt-2 text-sm text-[#5A7190]">{hommie.locality}</p>
                  <p className="mt-3 line-clamp-3 text-sm leading-7 text-[#4C6480]">{hommie.description}</p>
                </Link>
              ))}
            </div>
          </aside>
        </section>

        <section className="flex flex-wrap gap-4 pb-6">
          <Link
            href="/partners"
            className="inline-flex items-center justify-center rounded-[18px] border-[3px] border-[#1A6EBB] bg-[#1A6EBB] px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-white"
          >
            Join Famlo
          </Link>
          <Link
            href="/partners/login"
            className="inline-flex items-center justify-center rounded-[18px] border-[3px] border-[#BCD5F2] bg-white px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-[#1A6EBB]"
          >
            Partner login
          </Link>
        </section>
      </div>
    </main>
  );
}
