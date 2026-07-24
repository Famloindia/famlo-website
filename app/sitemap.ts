import type { MetadataRoute } from "next";

import { getHomesDiscoveryData } from "@/lib/discovery";
import { createAdminSupabaseClient } from "@/lib/supabase";

type SitemapEntry = MetadataRoute.Sitemap[number];

const STATIC_PUBLIC_ROUTES: Array<{
  path: string;
  changeFrequency: SitemapEntry["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/careers", changeFrequency: "monthly", priority: 0.5 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.6 },
  { path: "/help", changeFrequency: "weekly", priority: 0.7 },
  { path: "/trust", changeFrequency: "monthly", priority: 0.7 },
  { path: "/legal", changeFrequency: "yearly", priority: 0.4 },
  { path: "/legal/privacy", changeFrequency: "yearly", priority: 0.4 },
  { path: "/homestays", changeFrequency: "daily", priority: 0.9 },
  { path: "/homestay-reel", changeFrequency: "daily", priority: 0.8 },
  { path: "/popular-destinations", changeFrequency: "weekly", priority: 0.8 },
  { path: "/hommies", changeFrequency: "weekly", priority: 0.7 },
  { path: "/partners", changeFrequency: "monthly", priority: 0.7 },
  { path: "/joinfamlo", changeFrequency: "monthly", priority: 0.6 },
  { path: "/joinfamlo/homes", changeFrequency: "monthly", priority: 0.6 },
];

const DESTINATION_ROUTES = [
  "/goa-homestays",
  "/jaipur-homestays",
  "/jodhpur-homestays",
  "/kerala-homestays",
  "/manali-homestays",
  "/rishikesh-homestays",
  "/shimla-homestays",
  "/udaipur-homestays",
] as const;

function normalizeSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://famlo.in").replace(/\/+$/, "");
}

function buildEntry(
  siteUrl: string,
  path: string,
  options: {
    changeFrequency: SitemapEntry["changeFrequency"];
    priority: number;
    lastModified?: Date;
  }
): SitemapEntry {
  return {
    url: `${siteUrl}${path}`,
    lastModified: options.lastModified ?? new Date(),
    changeFrequency: options.changeFrequency,
    priority: options.priority,
  };
}

async function getPublishedHommiePaths(): Promise<string[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("hommie_profiles_v2")
    .select("id,slug")
    .eq("status", "published");

  if (error) {
    console.error("[sitemap] Failed to load published hommies", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const routeId =
      typeof row.slug === "string" && row.slug.trim().length > 0
        ? row.slug.trim()
        : String(row.id);
    return `/hommies/${encodeURIComponent(routeId)}`;
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = normalizeSiteUrl();
  const now = new Date();

  const [homes, hommiePaths] = await Promise.all([
    getHomesDiscoveryData(),
    getPublishedHommiePaths(),
  ]);

  const entries: SitemapEntry[] = [
    ...STATIC_PUBLIC_ROUTES.map((route) => buildEntry(siteUrl, route.path, { ...route, lastModified: now })),
    ...DESTINATION_ROUTES.map((path) =>
      buildEntry(siteUrl, path, { changeFrequency: "weekly", priority: 0.8, lastModified: now })
    ),
    ...homes.map((home) =>
      buildEntry(siteUrl, home.href, { changeFrequency: "daily", priority: 0.85, lastModified: now })
    ),
    ...hommiePaths.map((path) =>
      buildEntry(siteUrl, path, { changeFrequency: "weekly", priority: 0.75, lastModified: now })
    ),
  ];

  return Array.from(new Map(entries.map((entry) => [entry.url, entry])).values());
}
