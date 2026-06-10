import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

function safeHostnameFromUrl(value) {
  if (typeof value !== "string" || value.trim().length === 0) return null;

  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function buildRemotePatternHostnames() {
  const hostnames = new Set([
    "wokjtntnbkwdsxbkotcr.supabase.co",
    "images.unsplash.com",
    "pub-8e2cb60fdd79431fa41db047fa09d02b.r2.dev",
    "pub-a8f558db1d7747be8a4f1745c4df2207.r2.dev",
  ]);

  const envHostnames = [
    safeHostnameFromUrl(process.env.R2_PUBLIC_URL),
    safeHostnameFromUrl(process.env.R2_PUBLIC_BASE_URL),
    safeHostnameFromUrl(process.env.NEXT_PUBLIC_R2_PUBLIC_URL),
    safeHostnameFromUrl(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL),
  ];

  for (const hostname of envHostnames) {
    if (hostname) hostnames.add(hostname);
  }

  return Array.from(hostnames).map((hostname) => ({
    protocol: "https",
    hostname,
    pathname: "/**",
  }));
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config) {
    config.resolve.alias["lucide-react$"] = path.join(dirname, "lib/lucide-react-shim.ts");
    return config;
  },
  turbopack: {
    root: dirname
  },
  async headers() {
    return [
      {
        source: "/logo-blue.png",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/icon-:size.png",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 604800,
    qualities: [68, 72, 75],
    remotePatterns: buildRemotePatternHostnames(),
  },
};

export default nextConfig;
