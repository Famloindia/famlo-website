import { NextResponse } from "next/server";

import { DESTINATION_SEARCH_MIN_LENGTH } from "@/lib/destination-autocomplete";
import { searchPublicDestinations } from "@/lib/destination-search-service";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length < DESTINATION_SEARCH_MIN_LENGTH) {
    return NextResponse.json(
      { suggestions: [] },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  try {
    const suggestions = await searchPublicDestinations(createAdminSupabaseClient(), query);
    return NextResponse.json(
      { suggestions },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Destination search request failed.", error);
    return NextResponse.json(
      { suggestions: [] },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
