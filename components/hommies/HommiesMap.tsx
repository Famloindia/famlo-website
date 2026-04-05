"use client";

import { useMemo } from "react";

import type { Hommie } from "../../lib/types";

interface HommiesMapProps {
  hommies: Hommie[];
  highlightedSlug?: string | null;
}

function buildMapBounds(latitude: number, longitude: number): string {
  const latOffset = 1.6;
  const lngOffset = 1.6;

  const left = longitude - lngOffset;
  const right = longitude + lngOffset;
  const top = latitude + latOffset;
  const bottom = latitude - latOffset;

  return `${left},${bottom},${right},${top}`;
}

export function HommiesMap({
  hommies,
  highlightedSlug
}: HommiesMapProps): JSX.Element {
  const highlighted = useMemo(
    () => hommies.find((item) => item.slug === highlightedSlug) ?? hommies[0] ?? null,
    [highlightedSlug, hommies]
  );

  const embedUrl = useMemo(() => {
    if (!highlighted) {
      return null;
    }

    const bbox = buildMapBounds(highlighted.latitude, highlighted.longitude);
    const marker = `${highlighted.latitude},${highlighted.longitude}`;

    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`;
  }, [highlighted]);

  return (
    <div className="overflow-hidden rounded-[32px] border border-[#D5E7F8] bg-white shadow-[0_20px_60px_rgba(26,110,187,0.08)]">
      <div className="flex items-center justify-between border-b border-[#E0ECF8] px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-famloText">Map view</p>
          <p className="text-xs text-slate-500">
            {highlighted
              ? `Centered on ${highlighted.property_name}`
              : "Approved Hommies across India"}
          </p>
        </div>
        {highlighted ? (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${highlighted.latitude},${highlighted.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-famloText transition hover:border-famloBlue hover:text-famloBlue"
          >
            Open full map
          </a>
        ) : null}
      </div>

      <div className="h-[420px] bg-[#F4F8FC]">
        {embedUrl ? (
          <iframe
            title="Hommies map"
            src={embedUrl}
            className="h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
            Approved Hommies will appear here on the map once listings are available.
          </div>
        )}
      </div>

      {hommies.length > 0 ? (
        <div className="space-y-3 border-t border-[#E0ECF8] px-5 py-4">
          {hommies.slice(0, 4).map((hommie) => (
            <a
              key={hommie.id}
              href={`/hommies/${hommie.slug}`}
              className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm transition hover:border-famloBlue hover:bg-[#F8FBFF]"
            >
              <div>
                <p className="font-semibold text-famloText">{hommie.property_name}</p>
                <p className="text-xs text-slate-500">
                  {[hommie.locality, hommie.city].filter(Boolean).join(", ")}
                </p>
              </div>
              <span className="font-semibold text-famloBlue">
                Rs. {hommie.nightly_price}
              </span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
