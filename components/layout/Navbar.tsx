"use client";

// FILE: components/layout/Navbar.tsx
import { useEffect, useState } from "react";
import Link from "next/link";

const detectedCityKey = "famlo_detected_city";

async function detectCity(): Promise<string> {
  if (typeof window === "undefined") {
    return "Jodhpur";
  }

  const cachedCity = window.localStorage.getItem(detectedCityKey);
  if (cachedCity) {
    return cachedCity;
  }

  if (!navigator.geolocation) {
    return "Jodhpur";
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${position.coords.latitude}&lon=${position.coords.longitude}`
          );
          const payload = (await response.json()) as {
            address?: { city?: string; town?: string; village?: string };
          };
          const nextCity =
            payload.address?.city ??
            payload.address?.town ??
            payload.address?.village ??
            "Jodhpur";
          window.localStorage.setItem(detectedCityKey, nextCity);
          resolve(nextCity);
        } catch {
          resolve("Jodhpur");
        }
      },
      () => resolve("Jodhpur"),
      { enableHighAccuracy: false, timeout: 4000 }
    );
  });
}

export function Navbar() {
  const [city, setCity] = useState("Locating...");

  useEffect(() => {
    void detectCity().then(setCity);
  }, []);

  return (
    <header className="sticky top-0 z-[70] h-[62px] border-b-[0.5px] border-[#E8EEF5] bg-white">
      <div className="mx-auto flex h-full w-full max-w-[1320px] items-center justify-between gap-6 px-6">
        <div className="flex min-w-0 items-center gap-10">
          <Link
            href="/"
            className="font-[family:var(--font-playfair)] text-[21px] font-medium tracking-[0.01em] text-[#1A6EBB]"
          >
            famlo
          </Link>

          <nav aria-label="Primary navigation" className="hidden md:block">
            <ul className="flex items-center gap-6 text-[14px] text-[#1A1A2E]">
              <li>
                <Link href="/homes" className="transition hover:text-[#1A6EBB]">
                  Find a home
                </Link>
              </li>
              <li>
                <Link href="/hommies" className="transition hover:text-[#1A6EBB]">
                  Find a hommie
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border-[0.5px] border-[#E8EEF5] bg-white px-3 py-2 text-[13px] text-[#1A1A2E] md:flex">
            <span className="inline-flex h-2 w-2 rounded-full bg-[#F5A623]" />
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#6B7A99]" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 21s6-5.45 6-11a6 6 0 1 0-12 0c0 5.55 6 11 6 11Z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            <span>{city}</span>
          </div>

          <Link
            href="/?auth=login"
            className="inline-flex h-[46px] items-center rounded-full border-0 bg-[var(--accent-primary)] px-7 text-[14px] font-semibold text-white shadow-[0_6px_18px_rgba(24,144,255,0.18)] transition hover:-translate-y-px hover:bg-[var(--accent-hover)] hover:shadow-[0_8px_22px_rgba(24,144,255,0.24)] active:translate-y-0 active:scale-[0.98] focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[var(--accent-light)]"
          >
            Log in
          </Link>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border-[0.5px] border-[#E8EEF5] text-[#1A1A2E] md:hidden"
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 7h14M5 12h14M5 17h14" />
            </svg>
          </button>

          <button
            type="button"
            className="hidden h-10 w-10 items-center justify-center rounded-full border-[0.5px] border-[#E8EEF5] text-[#1A1A2E] lg:inline-flex"
            aria-label="Language"
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3c2.7 2.4 4.5 5.7 4.5 9s-1.8 6.6-4.5 9c-2.7-2.4-4.5-5.7-4.5-9S9.3 5.4 12 3Z" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
