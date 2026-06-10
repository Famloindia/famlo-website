import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://famlo.in").replace(/\/+$/, "");
  const routes = [
    "/",
    "/about",
    "/contact",
    "/legal",
    "/legal/privacy",
    "/terms",
    "/homestays",
    "/partner",
    "/search",
    "/login",
    "/register",
    "/bookings",
    "/messages",
  ];

  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "/" ? "daily" : "weekly",
    priority: route === "/" ? 1 : 0.7,
  }));
}
