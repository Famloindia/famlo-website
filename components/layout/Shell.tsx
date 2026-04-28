"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Header from "./Header";
import FamloLoadingScreen from "./FamloLoadingScreen";

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [showBootLoader, setShowBootLoader] = useState(true);
  
  // Hide global site header on internal portals and onboarding steps
  const shouldHideHeader = 
    pathname.startsWith("/admin") || 
    pathname.startsWith("/teams") ||
    pathname.startsWith("/partners") ||
    pathname.startsWith("/host");

  const isJoinPage = pathname === "/joinfamlo";

  useEffect(() => {
    const hideLoader = () => {
      window.setTimeout(() => setShowBootLoader(false), 750);
    };

    if (document.readyState === "complete") {
      hideLoader();
      return;
    }

    window.addEventListener("load", hideLoader, { once: true });
    return () => window.removeEventListener("load", hideLoader);
  }, []);

  return (
    <>
      {showBootLoader && <FamloLoadingScreen />}
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
