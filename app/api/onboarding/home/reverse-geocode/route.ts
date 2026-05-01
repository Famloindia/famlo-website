import { NextRequest, NextResponse } from "next/server";

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat")?.trim() ?? "";
  const lng = searchParams.get("lng")?.trim() ?? "";

  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "Valid lat and lng are required." }, { status: 400 });
  }

  try {
    const upstreamUrl = new URL(NOMINATIM_ENDPOINT);
    upstreamUrl.searchParams.set("lat", String(latitude));
    upstreamUrl.searchParams.set("lon", String(longitude));
    upstreamUrl.searchParams.set("format", "json");
    upstreamUrl.searchParams.set("zoom", "18");
    upstreamUrl.searchParams.set("addressdetails", "1");

    const response = await fetch(upstreamUrl.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent": "FamloWeb/1.0 (host onboarding reverse geocode)",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Location lookup failed." }, { status: 502 });
    }

    const payload = await response.json();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[reverse-geocode] request failed", error);
    return NextResponse.json({ error: "Location lookup failed." }, { status: 502 });
  }
}
