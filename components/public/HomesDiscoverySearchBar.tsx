"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/components/auth/UserContext";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function HomesDiscoverySearchBar({
  defaultQuery,
}: Readonly<{ defaultQuery: string }>): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [query, setQuery] = useState(defaultQuery);
  const [guests, setGuests] = useState(() => {
    const parsed = Number(searchParams.get("guests") ?? "");
    return Number.isFinite(parsed) && parsed > 0 ? String(Math.floor(parsed)) : "";
  });
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pushParams = (params: URLSearchParams) => {
    const next = params.toString();
    router.push(next ? `/homestays?${next}` : "/homestays");
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (query.trim()) {
      params.set("q", query.trim());
    } else {
      params.delete("q");
    }
    if (guests.trim()) {
      params.set("guests", String(Math.max(1, Math.floor(Number(guests)))));
    } else {
      params.delete("guests");
    }
    pushParams(params);
  };

  const saveUserLocation = async (lat: number, lng: number, label: string) => {
    if (!user) return;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      await fetch("/api/user/location", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          ...(user?.id ? { "x-famlo-user-id": user.id } : {}),
        },
        body: JSON.stringify({ userId: user.id, lat, lng, label }),
      });
    } catch {
      // Non-blocking convenience save only.
    }
  };

  const handleLocate = () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setError("Location is not supported on this device.");
      return;
    }

    setLocating(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        const params = new URLSearchParams(searchParams.toString());
        params.set("lat", String(lat));
        params.set("lng", String(lng));
        if (guests.trim()) {
          params.set("guests", String(Math.max(1, Math.floor(Number(guests)))));
        }
        if (!params.get("q")) {
          params.set("q", "near me");
        }
        await saveUserLocation(lat, lng, "Current location");
        setLocating(false);
        pushParams(params);
      },
      (geoError) => {
        const message =
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location permission was denied."
            : geoError.code === geoError.POSITION_UNAVAILABLE
              ? "Current location is unavailable."
              : "Could not get your location right now.";
        setLocating(false);
        setError(message);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  return (
    <div className="homes-discovery-search-wrap">
      <form action="/homestays" className="homes-discovery-search" method="get" onSubmit={handleSubmit}>
        <input
          aria-label="Search homes by city or area"
          className="homes-discovery-search-input"
          name="q"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search city or area"
          type="search"
          value={query}
        />
        <input
          aria-label="Number of guests"
          className="homes-discovery-search-input"
          inputMode="numeric"
          min={1}
          max={16}
          name="guests"
          onChange={(event) => setGuests(event.target.value)}
          placeholder="Guests"
          style={{ maxWidth: "112px" }}
          type="number"
          value={guests}
        />
        <button className="homes-discovery-search-btn" type="submit">Search</button>
        <button className="homes-discovery-locate-btn" onClick={handleLocate} type="button">
          {locating ? "Locating..." : "Use my location"}
        </button>
      </form>
      {error ? <p className="homes-discovery-search-error">{error}</p> : null}
    </div>
  );
}
