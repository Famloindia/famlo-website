import { NextResponse } from "next/server";

import { INDIA_LOCATIONS, INDIAN_STATES } from "@/lib/india-locations";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const type = String(searchParams.get("type") ?? "state");
  const q = String(searchParams.get("q") ?? "").trim().toLowerCase();
  const state = String(searchParams.get("state") ?? "").trim();
  const city = String(searchParams.get("city") ?? "").trim();

  if (type === "state") {
    return NextResponse.json({
      suggestions: INDIAN_STATES.filter((entry) =>
        entry.toLowerCase().includes(q)
      ).slice(0, 12)
    });
  }

  if (type === "city") {
    return NextResponse.json({
      suggestions: INDIA_LOCATIONS.filter(
        (entry) => (!state || entry.state === state) && entry.city.toLowerCase().includes(q)
      )
        .map((entry) => entry.city)
        .slice(0, 12)
    });
  }

  if (type === "village") {
    return NextResponse.json({
      suggestions: INDIA_LOCATIONS.filter(
        (entry) => (!state || entry.state === state) && (!city || entry.city === city)
      )
        .flatMap((entry) => entry.villages)
        .filter((entry) => entry.toLowerCase().includes(q))
        .slice(0, 12)
    });
  }

  return NextResponse.json({ suggestions: [] });
}
