import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://famlo.in";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/host/", "/homes/", "/homestay/", "/hommies/", "/partners/", "/contact", "/legal", "/about"],
        disallow: ["/admin", "/dashboard", "/teams", "/api", "/payments", "/partnerslogin", "/app"],
      },
    ],
    sitemap: `${siteUrl.replace(/\/+$/, "")}/sitemap.xml`,
  };
}
