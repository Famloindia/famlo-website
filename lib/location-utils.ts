// lib/location-utils.ts

/**
 * Deterministically masks coordinates for host privacy.
 * Generates a consistent offset between roughly 250m and 450m based on a seed (e.g., property id).
 * 
 * @param lat Original latitude
 * @param lng Original longitude
 * @param seed A unique string (like host id) to ensure the offset is consistent for the listing
 * @returns { lat: number, lng: number } Masked coordinates
 */
export function maskCoordinates(lat: number, lng: number, seed: string): { lat: number, lng: number } {
  // Simple deterministic pseudo-random offset based on seed
  // Using characters of seat to generate offset angles and distances
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }

  // Use hash to pick a distance between roughly 0.00225 and 0.00405 degrees
  // (Approx 250m to 450m in latitude).
  const distRange = 0.00405 - 0.00225;
  const latOffset = 0.00225 + (Math.abs(hash % 1000) / 1000) * distRange;
  
  // Angle for the offset
  const angle = ((hash % 360) * Math.PI) / 180;
  
  // Apply offset
  // Adjust lng offset by latitude to account for earth's curvature
  const lngAdjust = Math.cos(lat * (Math.PI / 180));
  const lngOffset = latOffset / (lngAdjust || 1);

  return {
    lat: lat + latOffset * Math.sin(angle),
    lng: lng + lngOffset * Math.cos(angle)
  };
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getPublicCoordinates(params: {
  lat?: number | string | null;
  lng?: number | string | null;
  latExact?: number | string | null;
  lngExact?: number | string | null;
  seed: string;
}): { lat: number; lng: number } | null {
  const exactLat = toFiniteNumber(params.latExact);
  const exactLng = toFiniteNumber(params.lngExact);

  if (exactLat != null && exactLng != null) {
    return maskCoordinates(exactLat, exactLng, params.seed);
  }

  const fallbackLat = toFiniteNumber(params.lat);
  const fallbackLng = toFiniteNumber(params.lng);

  if (fallbackLat != null && fallbackLng != null) {
    return maskCoordinates(fallbackLat, fallbackLng, params.seed);
  }

  return null;
}

export function parseGoogleMapsCoordinates(link?: string | null): { lat: number; lng: number } | null {
  if (!link || typeof link !== "string") return null;

  const patterns = [
    /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /[?&]query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = link.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  return null;
}

/**
 * Calculates distance between two points in kilometers using Haversine formula.
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Formats a distance value for trust copy
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} meters`;
  }
  return `${km.toFixed(1)} km`;
}
