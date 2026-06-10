//app/page.tsx

import { unstable_cache } from "next/cache";
import DiscoveryHomepage from "@/components/public/DiscoveryHomepage";
import { getHomepageData, type HomepageData } from "@/lib/discovery";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { getMostInteractedHostScores } from "@/lib/host-interactions";

export const revalidate = 300;
const MOST_INTERACTED_ENABLED = process.env.NEXT_PUBLIC_ENABLE_MOST_INTERACTED_HOSTS === "true";
const HOMEPAGE_DATA_TIMEOUT_MS = 3500;
const EMPTY_HOMEPAGE_DATA: HomepageData = {
  homes: [],
  companions: [],
  stories: [],
  ads: [],
  heroBanners: [],
};

function createTimeoutFallback<T>(value: T, label: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.warn(`[homepage] ${label} timed out after ${timeoutMs}ms. Rendering fallback data.`);
      resolve(value);
    }, timeoutMs);
  });
}

const getCachedMostInteractedHostScores = unstable_cache(
  async (hostIds: string[]) =>
    Array.from(
      (
        await getMostInteractedHostScores(
          createAdminSupabaseClient(),
          [...new Set(hostIds)].filter((hostId): hostId is string => typeof hostId === "string" && hostId.length > 0)
        )
      ).entries()
    ),
  ["homepage-most-interacted-host-scores"],
  { revalidate: 300, tags: ["homepage-most-interacted-host-scores"] }
);

export default async function HomePage(): Promise<React.JSX.Element> {
  const data = await Promise.race([
    getHomepageData(),
    createTimeoutFallback(EMPTY_HOMEPAGE_DATA, "Discovery data", HOMEPAGE_DATA_TIMEOUT_MS),
  ]);
  const interactionScores = MOST_INTERACTED_ENABLED
    ? new Map(
        await getCachedMostInteractedHostScores(
          data.homes.map((home) => home.hostId).filter((hostId): hostId is string => Boolean(hostId))
        )
      )
    : new Map();
  const mostInteractedHomes = MOST_INTERACTED_ENABLED
    ? [...data.homes]
        .sort((left, right) => {
          const leftScore = interactionScores.get(left.hostId ?? "")?.finalScore ?? 0;
          const rightScore = interactionScores.get(right.hostId ?? "")?.finalScore ?? 0;
          if (leftScore !== rightScore) return rightScore - leftScore;
          return (right.totalReviews ?? 0) - (left.totalReviews ?? 0);
        })
        .slice(0, 8)
    : [];

  return (
    <DiscoveryHomepage
      companions={data.companions}
      homes={data.homes} 
      mostInteractedHomes={mostInteractedHomes}
      stories={data.stories}
      ads={data.ads}
      heroBanners={data.heroBanners}
    />
  );
}
