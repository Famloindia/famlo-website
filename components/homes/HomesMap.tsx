"use client";

import { useMemo } from "react";

import type { Home } from "../../lib/types";

interface HomesMapProps {
  homes: Home[];
  highlightedSlug?: string | null;
}

function buildMapBounds(latitude: number, longitude: number): string {
  return `${longitude - 1.6},${latitude - 1.6},${longitude + 1.6},${latitude + 1.6}`;
}

export function HomesMap({ homes, highlightedSlug }: HomesMapProps): JSX.Element {
  const highlighted = useMemo(
    () => homes.find((item) => item.slug === highlightedSlug) ?? homes[0] ?? null,
    [highlightedSlug, homes]
  );

  const embedUrl = useMemo(() => {
    if (!highlighted) {
      return null;
    }

    return `https://www.openstreetmap.org/export/embed.html?bbox=${buildMapBounds(
      highlighted.latitude,
      highlighted.longitude
    )}&layer=mapnik&marker=${highlighted.latitude},${highlighted.longitude}`;
  }, [highlighted]);

  return (
    <div className="overflow-hidden rounded-[32px] border border-[#D5E7F8] bg-white shadow-[0_20px_60px_rgba(26,110,187,0.08)]">
      <div className="flex items-center justify-between border-b border-[#E0ECF8] px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-famloText">Homes map</p>
          <p className="text-xs text-slate-500">
            {highlighted ? `Centered on ${highlighted.property_name}` : "Affordable stays across regions"}
          </p>
        </div>
      </div>
      <div className="h-[420px] bg-[#F4F8FC]">
        {embedUrl ? (
          <iframe title="Homes map" src={embedUrl} className="h-full w-full border-0" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
            Approved homes will appear here once listings are available.
          </div>
        )}
      </div>
    </div>
  );
}
