"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import dynamic from "next/dynamic";

import { HomeCard } from "./HomeCard";
import type { Home } from "../../lib/types";

const DynamicHomesMap = dynamic(
  () => import("./HomesMap").then((module) => module.HomesMap),
  { ssr: false }
);

interface HomesExplorerProps {
  homes: Home[];
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(endLat - startLat);
  const dLng = toRadians(endLng - startLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(startLat)) *
      Math.cos(toRadians(endLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function HomesExplorer({ homes }: HomesExplorerProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationMessage, setLocationMessage] = useState("");

  const filteredHomes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    let items = homes.filter((home) => {
      if (!normalizedQuery) {
        return true;
      }

      const searchableFields = [
        home.property_name,
        home.city,
        home.state,
        home.locality,
        home.address
      ].filter((value): value is string => Boolean(value));

      return searchableFields.some((value) => value.toLowerCase().includes(normalizedQuery));
    });

    if (nearbyOnly && userLocation) {
      items = items
        .map((item) => ({
          ...item,
          distanceKm: calculateDistanceKm(
            userLocation.latitude,
            userLocation.longitude,
            item.latitude,
            item.longitude
          )
        }))
        .sort((left, right) => left.distanceKm - right.distanceKm)
        .filter((item) => item.distanceKm <= 50);
    }

    return items;
  }, [homes, nearbyOnly, query, userLocation]);

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>): void {
    setQuery(event.target.value);
  }

  function handleFindNearMe(): void {
    if (!navigator.geolocation) {
      setLocationMessage("Geolocation is not supported in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setNearbyOnly(true);
        setLocationMessage("Showing Homes within 50 km of you.");
      },
      () => {
        setLocationMessage("We could not access your location.");
      }
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-[32px] border border-[#D5E7F8] bg-white p-6 shadow-[0_20px_60px_rgba(26,110,187,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1">
            <input
              type="text"
              value={query}
              onChange={handleSearchChange}
              placeholder="Search city, area, state, or home name"
              className="w-full rounded-full border border-slate-200 px-5 py-3 text-sm text-famloText outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleFindNearMe} className="rounded-full bg-famloBlue px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#155d9f]">
              Find near me
            </button>
            <button type="button" onClick={() => setNearbyOnly(false)} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-famloText transition hover:border-famloBlue hover:text-famloBlue">
              Show all
            </button>
          </div>
        </div>
        {locationMessage ? <p className="mt-4 text-sm text-slate-600">{locationMessage}</p> : null}
      </div>

      <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-6 md:grid-cols-2">
          {filteredHomes.length > 0 ? (
            filteredHomes.map((home) => <HomeCard key={home.id} home={home} />)
          ) : (
            <div className="rounded-[28px] border border-dashed border-[#C8DDF3] bg-white p-8 text-sm text-slate-600">
              No Homes match this search yet.
            </div>
          )}
        </div>
        <div className="xl:sticky xl:top-24 xl:h-fit">
          <DynamicHomesMap homes={filteredHomes} />
        </div>
      </div>
    </div>
  );
}
