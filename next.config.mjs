import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: dirname
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "wokjtntnbkwdsxbkotcr.supabase.co",
      },
    ],
  },
};

export default nextConfig;
