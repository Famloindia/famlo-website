//app/page.tsx

import DiscoveryHomepage from "@/components/public/DiscoveryHomepage";
import { getHomepageData } from "@/lib/discovery";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { getMostInteractedHostScores } from "@/lib/host-interactions";

export const dynamic = "force-dynamic";
const MOST_INTERACTED_ENABLED = process.env.NEXT_PUBLIC_ENABLE_MOST_INTERACTED_HOSTS === "true";

export default async function HomePage(): Promise<React.JSX.Element> {
  const data = await getHomepageData();
  const interactionScores = MOST_INTERACTED_ENABLED
    ? await getMostInteractedHostScores(
        createAdminSupabaseClient(),
        data.homes.map((home) => home.hostId).filter((hostId): hostId is string => Boolean(hostId))
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
