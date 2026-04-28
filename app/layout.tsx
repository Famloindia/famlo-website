import type { Metadata } from "next";
import type { Viewport } from "next";
import { Fraunces, Nunito, Playfair_Display, DM_Sans } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { UserProvider } from "@/components/auth/UserContext";
import Shell from "@/components/layout/Shell";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-ui",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "famlo.in",
    template: "%s | famlo.in",
  },
  description: "Book real homes, travel cities with locals, and manage homestays on famlo.in.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://famlo.in"),
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "famlo.in",
  },
  openGraph: {
    title: "famlo.in",
    description: "Book real homes, travel cities with locals, and manage homestays on famlo.in.",
    url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://famlo.in",
    siteName: "Famlo",
    type: "website",
  },
  icons: {
    icon: [
      { url: "/icon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/icon-144x144.png", sizes: "144x144", type: "image/png" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icon-192x192.png",
    apple: "/icon-192x192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1890FF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${nunito.variable} ${fraunces.variable} ${playfair.variable} ${dmSans.variable}`}>
        <UserProvider>
          <Shell>
            {children}
          </Shell>
        </UserProvider>
      </body>
    </html>
  );
}
