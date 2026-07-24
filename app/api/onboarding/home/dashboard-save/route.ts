import { NextRequest, NextResponse } from "next/server";

import { PATCH as updateListingProfile } from "@/app/api/host/listing-profile/route";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Compatibility adapter for legacy dashboard clients.
 * Canonical content is owned by /api/host/listing-profile; submitted onboarding
 * drafts and room rows are intentionally never mutated here.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: {
    familyId?: string;
    profile?: JsonRecord;
    listing?: JsonRecord;
    schedule?: JsonRecord;
    compliancePatch?: JsonRecord;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const familyId = asString(body.familyId);
  if (!familyId) {
    return NextResponse.json({ error: "Missing family ID." }, { status: 400 });
  }

  const profile = asRecord(body.profile);
  const listing = asRecord(body.listing);
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  const canonicalRequest = new NextRequest(new URL("/api/host/listing-profile", request.url), {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      familyId,
      identity: {
        displayName: profile.hostDisplayName,
        profilePhotoUrl: profile.hostSelfieUrl,
        hobbies: profile.hostHobbies,
        languages: profile.languages,
      },
      property: {
        propertyName: listing.propertyName,
        listingTitle: listing.listingTitle,
        hostBio: listing.hostBio,
        city: profile.city,
        state: profile.state,
        locality: profile.cityNeighbourhood,
        journeyStory: listing.journeyStory,
        specialExperience: listing.specialExperience,
        localExperience: listing.localExperience,
        culturalOffering: listing.culturalOffering,
        homeType: listing.houseType,
        interactionType: listing.interactionType,
        houseRules: listing.houseRules,
        amenities: listing.amenities,
        foodTypes: listing.foodType,
        includedItems: listing.includedItems,
        bathroomType: listing.bathroomType,
        checkInTime: listing.checkInTime,
        checkOutTime: listing.checkOutTime,
        commonAreas: listing.commonAreas,
        streetAddress: listing.propertyAddress,
        googleMapsLink: listing.googleMapsLink,
        familyType: profile.familyComposition,
      },
      schedule: body.schedule,
      compliance: body.compliancePatch,
      pricing: {
        priceMorning: listing.priceMorning,
        priceAfternoon: listing.priceAfternoon,
        priceEvening: listing.priceEvening,
        priceFullday: listing.priceFullday,
      },
    }),
  });
  return updateListingProfile(canonicalRequest);
}
