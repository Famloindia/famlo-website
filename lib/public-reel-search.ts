import type { HomepageReelRecord } from "@/lib/discovery";

export function matchesPublicReelSearch(reel: HomepageReelRecord, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase("en-IN");
  if (!normalizedQuery) return true;

  return [
    reel.title,
    reel.hostName,
    reel.propertyName,
    reel.locality,
    reel.city,
    reel.state,
    reel.location,
  ].some((value) => value?.toLocaleLowerCase("en-IN").includes(normalizedQuery));
}
