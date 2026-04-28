"use client";

import type { CompanionRecord } from "@/lib/discovery";
import { HommieBookingFlow } from "@/components/public/HommieBookingFlow";

interface HommieContactPreviewProps {
  companionId: string;
  companionTitle: string;
  publicLocation: string;
  activities: string[];
  hourlyPrice: number | null;
  nightlyPrice: number | null;
  guideId?: string | null;
  guideUserId?: string | null;
}

export function HommieContactPreview({
  companionId,
  companionTitle,
  publicLocation,
  activities,
  hourlyPrice,
  nightlyPrice,
  guideId,
  guideUserId
}: Readonly<HommieContactPreviewProps>): React.JSX.Element {
  const companion: CompanionRecord = {
    id: companionId,
    href: `/hommies/${companionId}`,
    source: "hommies",
    title: companionTitle,
    hostName: companionTitle,
    city: publicLocation || null,
    state: null,
    locality: null,
    description: null,
    activities,
    languages: [],
    hourlyPrice,
    nightlyPrice,
    maxGuests: 1,
    lat: null,
    lng: null,
    imageUrl: null,
    guideId: guideId ?? null,
    guideUserId: guideUserId ?? null,
    isActive: true,
    rating: 0,
    totalReviews: 0
  };

  return <HommieBookingFlow companion={companion} />;
}
