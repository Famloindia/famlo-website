interface Coordinates {
  latitude: number;
  longitude: number;
}

function toNumberPair(latitude: string, longitude: string): Coordinates | null {
  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);

  if (Number.isNaN(parsedLatitude) || Number.isNaN(parsedLongitude)) {
    return null;
  }

  return {
    latitude: parsedLatitude,
    longitude: parsedLongitude
  };
}

export function extractCoordinatesFromGoogleMapsLink(
  value: string
): Coordinates | null {
  const input = value.trim();

  if (!input) {
    return null;
  }

  const directPairMatch = input.match(
    /(-?\d{1,3}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)/
  );

  if (directPairMatch) {
    return toNumberPair(directPairMatch[1], directPairMatch[2]);
  }

  try {
    const url = new URL(input);
    const atMatch = url.href.match(/@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);

    if (atMatch) {
      return toNumberPair(atMatch[1], atMatch[2]);
    }

    const queryValue =
      url.searchParams.get("q") ??
      url.searchParams.get("query") ??
      url.searchParams.get("ll") ??
      url.searchParams.get("center");

    if (queryValue) {
      const queryMatch = queryValue.match(
        /(-?\d{1,3}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)/
      );

      if (queryMatch) {
        return toNumberPair(queryMatch[1], queryMatch[2]);
      }
    }
  } catch {
    return null;
  }

  return null;
}
