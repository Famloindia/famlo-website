"use client";

import { useId, useState } from "react";

export function HomeLocationFields(): JSX.Element {
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [mapsLink, setMapsLink] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const mapTitleId = useId();

  function updatePreview(nextLatitude: string, nextLongitude: string): void {
    setLatitude(nextLatitude);
    setLongitude(nextLongitude);
  }

  async function useCurrentLocation(): Promise<void> {
    if (!navigator.geolocation) {
      setStatus("Geolocation is not supported in this browser.");
      return;
    }

    setStatus("Fetching your current location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLatitude = position.coords.latitude.toFixed(6);
        const nextLongitude = position.coords.longitude.toFixed(6);
        updatePreview(nextLatitude, nextLongitude);
        setMapsLink(
          `https://www.google.com/maps?q=${nextLatitude},${nextLongitude}`
        );
        setStatus("Location captured. You can still adjust the values manually.");
      },
      () => {
        setStatus("We could not access your location. Please paste the pin manually.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000
      }
    );
  }

  const hasCoordinates = latitude.trim() !== "" && longitude.trim() !== "";
  const embedUrl = hasCoordinates
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${Number(longitude) - 0.01}%2C${Number(latitude) - 0.01}%2C${Number(longitude) + 0.01}%2C${Number(latitude) + 0.01}&layer=mapnik&marker=${latitude}%2C${longitude}`
    : null;

  return (
    <div className="space-y-4 rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#1f2937]">Exact home location</p>
          <p className="mt-1 text-sm leading-6 text-[#52606d]">
            Add the real map pin so homes can appear correctly on the live map later.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void useCurrentLocation()}
          className="inline-flex items-center justify-center rounded-full border border-[#1f2937] px-4 py-2 text-sm font-semibold text-[#1f2937]"
        >
          Use current location
        </button>
      </div>

      <input
        name="googleMapsLink"
        value={mapsLink}
        onChange={(event) => setMapsLink(event.target.value)}
        placeholder="Google Maps pin link"
        className="w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
        required
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <input
          name="latitude"
          type="number"
          step="any"
          value={latitude}
          onChange={(event) => updatePreview(event.target.value, longitude)}
          placeholder="Latitude"
          className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
          required
        />
        <input
          name="longitude"
          type="number"
          step="any"
          value={longitude}
          onChange={(event) => updatePreview(latitude, event.target.value)}
          placeholder="Longitude"
          className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
          required
        />
      </div>

      {status ? <p className="text-sm text-[#52606d]">{status}</p> : null}

      <div className="overflow-hidden rounded-[20px] border border-white bg-white">
        {embedUrl ? (
          <iframe
            title={mapTitleId}
            src={embedUrl}
            className="h-64 w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-[#52606d]">
            Add latitude and longitude to preview the home on the map.
          </div>
        )}
      </div>
    </div>
  );
}
