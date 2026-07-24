import type { Metadata } from "next";

import HomestayReelsPage from "@/components/public/HomestayReelsPage";
import { getHomestayReelsData } from "@/lib/discovery";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Homestay Reels | Famlo",
  description: "Watch real homestay and host reels from Famlo homes across India.",
};

export default async function ReelsPage(): Promise<React.JSX.Element> {
  const reels = await getHomestayReelsData();
  return <HomestayReelsPage reels={reels} />;
}
