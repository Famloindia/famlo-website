"use client";

import { useEffect, useRef } from "react";

import type { ProDashboardLoadMetrics } from "@/lib/pro-dashboard-performance";

type ProDashboardMetricsBeaconProps = {
  metrics: ProDashboardLoadMetrics | null;
};

export default function ProDashboardMetricsBeacon({ metrics }: ProDashboardMetricsBeaconProps): null {
  const sentMetricKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!metrics?.familyId || typeof window === "undefined") return;

    const metricKey = `${metrics.familyId}:${metrics.initialSection}:${metrics.generatedAt}`;
    if (sentMetricKeys.current.has(metricKey)) return;
    sentMetricKeys.current.add(metricKey);

    const navigationEntry = window.performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const payload: ProDashboardLoadMetrics = {
      ...metrics,
      clientHydratedMs: Math.round(window.performance.now()),
      navigationType: navigationEntry?.type ?? null,
    };
    const body = JSON.stringify(payload);

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const sent = navigator.sendBeacon(
        "/api/host/pro/metrics/dashboard-load",
        new Blob([body], { type: "application/json" })
      );
      if (sent) return;
    }

    void fetch("/api/host/pro/metrics/dashboard-load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Metrics must never interrupt the dashboard experience.
    });
  }, [metrics]);

  return null;
}
