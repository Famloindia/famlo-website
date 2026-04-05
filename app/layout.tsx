import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Famlo Rebuild",
  description: "A clean starting point for rebuilding the Famlo website page by page."
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({
  children
}: Readonly<RootLayoutProps>): JSX.Element {
  return (
    <html lang="en">
      <body
        className="min-h-screen bg-[#f4ede2] font-sans text-[#1f2937] antialiased"
      >
        <div className="relative min-h-screen overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.85),_transparent_55%)]" />
          <div className="absolute left-[-8rem] top-20 h-64 w-64 rounded-full bg-[#d9c2a0]/30 blur-3xl" />
          <div className="absolute bottom-10 right-[-6rem] h-72 w-72 rounded-full bg-[#b8d4e3]/45 blur-3xl" />
          <main className="relative z-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
