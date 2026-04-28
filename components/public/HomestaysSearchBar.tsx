"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/components/auth/UserContext";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type Params = Readonly<{
  defaultQuery: string;
  defaultGuests: string;
  defaultFrom: string;
  defaultTo: string;
  defaultNearOnly: boolean;
  defaultOpenOnly: boolean;
  defaultLat: number | null;
  defaultLng: number | null;
}>;

function toGuestValue(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? String(Math.floor(parsed)) : "";
}

export default function HomestaysSearchBar({
  defaultQuery,
  defaultGuests,
  defaultFrom,
  defaultTo,
  defaultNearOnly,
  defaultOpenOnly,
  defaultLat,
  defaultLng,
}: Params): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [query, setQuery] = useState(defaultQuery);
  const [guests, setGuests] = useState(toGuestValue(defaultGuests));
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [lat, setLat] = useState<number | null>(defaultLat);
  const [lng, setLng] = useState<number | null>(defaultLng);
  const [locationEnabled, setLocationEnabled] = useState(defaultLat != null && defaultLng != null);
  const [nearOnly, setNearOnly] = useState(defaultNearOnly);
  const [openOnly, setOpenOnly] = useState(defaultOpenOnly);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasLocation = lat != null && lng != null;
  const activeFilters = useMemo(() => {
    const filters: string[] = [];
    if (locationEnabled && hasLocation) filters.push("Location on");
    if (nearOnly) filters.push("Near me");
    if (openOnly) filters.push("Open only");
    if (guests) filters.push(`${guests} guests`);
    if (fromDate || toDate) filters.push("Dates set");
    return filters;
  }, [fromDate, guests, hasLocation, nearOnly, locationEnabled, openOnly, toDate]);

  const pushParams = (nextParams: URLSearchParams) => {
    const next = nextParams.toString();
    router.push(next ? `/homestays?${next}` : "/homestays");
  };

  const saveUserLocation = async (nextLat: number, nextLng: number) => {
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
        body: JSON.stringify({
          userId: user.id,
          lat: nextLat,
          lng: nextLng,
          label: "Current location",
        }),
      });
    } catch {
      // Best-effort only.
    }
  };

  const applySearch = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (query.trim()) params.set("q", query.trim());
    else params.delete("q");

    if (guests.trim()) params.set("guests", String(Math.max(1, Math.floor(Number(guests)))));
    else params.delete("guests");

    if (fromDate.trim()) params.set("from", fromDate.trim());
    else params.delete("from");

    if (toDate.trim()) params.set("to", toDate.trim());
    else params.delete("to");

    if (locationEnabled && hasLocation) {
      params.set("lat", String(lat));
      params.set("lng", String(lng));
    } else {
      params.delete("lat");
      params.delete("lng");
    }

    if (nearOnly) params.set("near", "1");
    else params.delete("near");

    if (openOnly) params.set("open", "1");
    else params.delete("open");

    pushParams(params);
  };

  const locate = async (forceNearOnly = false): Promise<void> => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setError("Location is not supported on this device.");
      return;
    }

    setLocating(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextLat = Number(position.coords.latitude.toFixed(6));
        const nextLng = Number(position.coords.longitude.toFixed(6));
        setLat(nextLat);
        setLng(nextLng);
        setLocationEnabled(true);
        if (forceNearOnly) {
          setNearOnly(true);
        }
        await saveUserLocation(nextLat, nextLng);
        setLocating(false);
        const params = new URLSearchParams(searchParams.toString());
        params.set("lat", String(nextLat));
        params.set("lng", String(nextLng));
        params.set("q", query.trim() || "near me");
        if (guests.trim()) params.set("guests", String(Math.max(1, Math.floor(Number(guests)))));
        if (fromDate.trim()) params.set("from", fromDate.trim());
        if (toDate.trim()) params.set("to", toDate.trim());
        params.set("near", "1");
        if (openOnly) params.set("open", "1");
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

  const handleLocationToggle = () => {
    if (locationEnabled && hasLocation) {
      setLocationEnabled(false);
      setLat(null);
      setLng(null);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("lat");
      params.delete("lng");
      pushParams(params);
      return;
    }

    void locate();
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    applySearch();
  };

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: "10px",
          alignItems: "stretch",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={handleLocationToggle}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            padding: "14px 16px",
            borderRadius: "18px",
            border: locationEnabled && hasLocation ? "1px solid #1890ff" : "1px solid #dbeafe",
            background: locationEnabled && hasLocation ? "#eff6ff" : "#fff",
            color: "#0f172a",
            fontSize: "14px",
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "999px",
              background: locationEnabled && hasLocation ? "#16a34a" : "#cbd5e1",
              boxShadow: locationEnabled && hasLocation ? "0 0 0 4px rgba(22, 163, 74, 0.12)" : "none",
            }}
          />
          {locating ? "Locating..." : locationEnabled && hasLocation ? "Location On" : "Location Off"}
        </button>

        <input
          aria-label="Search homestays"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search city, village, or host"
          type="search"
          style={{
            flex: "1 1 280px",
            minWidth: "220px",
            height: "52px",
            borderRadius: "18px",
            border: "1px solid #dbeafe",
            padding: "0 16px",
            fontSize: "15px",
            fontWeight: 600,
            boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
            outline: "none",
          }}
        />

        <input
          aria-label="Number of guests"
          inputMode="numeric"
          min={1}
          max={20}
          value={guests}
          onChange={(event) => setGuests(event.target.value)}
          placeholder="Guests"
          type="number"
          style={{
            width: "104px",
            height: "52px",
            borderRadius: "18px",
            border: "1px solid #dbeafe",
            padding: "0 14px",
            fontSize: "15px",
            fontWeight: 700,
            boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
            outline: "none",
          }}
        />

        <input
          aria-label="From date"
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
          type="date"
          style={{
            width: "154px",
            height: "52px",
            borderRadius: "18px",
            border: "1px solid #dbeafe",
            padding: "0 14px",
            fontSize: "14px",
            fontWeight: 700,
            boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
            outline: "none",
          }}
        />

        <input
          aria-label="To date"
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
          type="date"
          style={{
            width: "154px",
            height: "52px",
            borderRadius: "18px",
            border: "1px solid #dbeafe",
            padding: "0 14px",
            fontSize: "14px",
            fontWeight: 700,
            boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
            outline: "none",
          }}
        />

        <button
          type="button"
          onClick={() => setFiltersOpen((current) => !current)}
          style={{
            padding: "14px 16px",
            height: "52px",
            borderRadius: "18px",
            border: "1px solid #dbeafe",
            background: filtersOpen ? "#eff6ff" : "#fff",
            color: "#0f172a",
            fontSize: "14px",
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
            whiteSpace: "nowrap",
          }}
        >
          Filter
        </button>

        <button
          type="submit"
          style={{
            padding: "14px 18px",
            height: "52px",
            borderRadius: "18px",
            border: "none",
            background: "linear-gradient(135deg, #1A56DB, #3B82F6)",
            color: "#fff",
            fontSize: "14px",
            fontWeight: 900,
            cursor: "pointer",
            boxShadow: "0 14px 30px rgba(26, 86, 219, 0.24)",
            whiteSpace: "nowrap",
          }}
        >
          Search
        </button>
      </form>

      {filtersOpen ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            alignItems: "center",
            padding: "14px",
            borderRadius: "18px",
            background: "#f8fbff",
            border: "1px solid #dbeafe",
          }}
        >
          <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
            <input
              type="checkbox"
              checked={nearOnly}
              onChange={(event) => {
                const next = event.target.checked;
                setNearOnly(next);
                if (next && !hasLocation) {
                  void locate(true);
                }
              }}
            />
            Near me only
          </label>

          <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(event) => setOpenOnly(event.target.checked)}
            />
            Open stays only
          </label>

          <button
            type="button"
            onClick={applySearch}
            style={{
              marginLeft: "auto",
              padding: "10px 14px",
              borderRadius: "14px",
              border: "none",
              background: "#0f172a",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Apply filters
          </button>
        </div>
      ) : null}

      {activeFilters.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {activeFilters.map((item) => (
            <span
              key={item}
              style={{
                padding: "6px 10px",
                borderRadius: "999px",
                background: "#eff6ff",
                color: "#1d4ed8",
                fontSize: "12px",
                fontWeight: 800,
                border: "1px solid #bfdbfe",
              }}
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}

      {error ? (
        <p style={{ margin: 0, color: "#b91c1c", fontSize: "13px", fontWeight: 700 }}>{error}</p>
      ) : null}
    </div>
  );
}
