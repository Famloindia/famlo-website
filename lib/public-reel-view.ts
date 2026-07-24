import type { HomepageReelRecord } from "@/lib/discovery";

export async function recordPublicReelView(reel: Pick<HomepageReelRecord, "familyId" | "id">): Promise<void> {
  if (!reel.familyId || !reel.id) return;
  await fetch("/api/public/reels/view", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ familyId: reel.familyId, reelId: reel.id }),
    keepalive: true,
  }).catch(() => undefined);
}
