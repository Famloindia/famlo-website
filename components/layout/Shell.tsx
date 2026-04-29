"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Hide global site header on internal portals and onboarding steps
  const shouldHideHeader = 
    pathname.startsWith("/admin") || 
    pathname.startsWith("/teams") ||
    pathname.startsWith("/partners") ||
    pathname.startsWith("/host");

  const isJoinPage = pathname === "/joinfamlo";

  return (
    <>
      {!shouldHideHeader && <Header />}
      <main
        style={{
          paddingTop: shouldHideHeader ? "0px" : "80px",
          paddingBottom: "var(--famlo-app-bottom-space, 0px)",
        }}
      >
        {children}
      </main>
    </>
  );
}
