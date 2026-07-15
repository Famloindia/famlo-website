"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type RouteWarmupProps = {
  href: string | null | undefined;
  enabled?: boolean;
  delayMs?: number;
};

export function RouteWarmup({
  href,
  enabled = true,
  delayMs = 240,
}: Readonly<RouteWarmupProps>): null {
  const router = useRouter();
  const warmedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !href || warmedRef.current) return;

    const run = () => {
      if (warmedRef.current) return;
      warmedRef.current = true;
      router.prefetch(href);
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(run, { timeout: 1400 });
      return () => window.cancelIdleCallback(handle);
    }

    const timeoutHandle = globalThis.setTimeout(run, delayMs);
    return () => globalThis.clearTimeout(timeoutHandle);
  }, [delayMs, enabled, href, router]);

  return null;
}
