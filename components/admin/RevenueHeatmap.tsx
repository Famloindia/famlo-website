"use client";

import { useEffect, useRef } from "react";
import { MapPin, RefreshCw } from "lucide-react";

interface HeatmapPoint {
  lat: number;
  lng: number;
  intensity: number; // 0–1
  type: "booking" | "hommie" | "demand";
}

interface RevenueHeatmapProps {
  points: HeatmapPoint[];
}

// Jodhpur center coordinates
const JODHPUR_CENTER = { lat: 26.2389, lng: 73.0243 };

export default function RevenueHeatmap({ points }: RevenueHeatmapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Dynamically load Leaflet to avoid SSR issues
    const loadLeaflet = async () => {
      const L = (await import("leaflet")).default;

      // Inject Leaflet CSS if not already present
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      const map = L.map(mapRef.current!, {
        center: [JODHPUR_CENTER.lat, JODHPUR_CENTER.lng],
        zoom: 12,
        zoomControl: true
      });

      mapInstanceRef.current = map;

      // Dark tile layer from CartoDB
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap © CartoDB",
        subdomains: "abcd",
        maxZoom: 19
      }).addTo(map);

      // Render heatmap points as circles
      const colorMap: Record<string, string> = {
        booking: "#3b82f6",
        hommie: "#a855f7",
        demand: "#f59e0b"
      };

      points.forEach((p) => {
        L.circle([p.lat, p.lng], {
          radius: 150 + p.intensity * 400,
          color: "transparent",
          fillColor: colorMap[p.type] ?? "#ffffff",
          fillOpacity: 0.15 + p.intensity * 0.45,
          weight: 0
        }).addTo(map);
      });

      // Add a marker for the city center
      const cityIcon = L.divIcon({
        html: `<div style="background:#165dcc;color:white;padding:4px 10px;border-radius:6px;font-weight:900;font-size:11px;font-family:sans-serif;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.4);">📍 Jodhpur</div>`,
        className: "",
        iconAnchor: [40, 16]
      });
      L.marker([JODHPUR_CENTER.lat, JODHPUR_CENTER.lng], { icon: cityIcon }).addTo(map);
    };

    loadLeaflet();

    // Auto-refresh every 5 minutes (300s)
    const interval = setInterval(() => {
      window.location.reload();
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [points]);

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 900, color: "white", margin: 0 }}>Revenue Heatmap</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "6px" }}>
          Jodhpur — Live activity and booking density. Refreshes every 5 minutes.
        </p>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
        {[
          { color: "#3b82f6", label: "Booking Hotspot" },
          { color: "#a855f7", label: "Hommie Activity" },
          { color: "#f59e0b", label: "High Demand / Low Supply" }
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: item.color }} />
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>{item.label}</span>
          </div>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "rgba(255,255,255,0.2)", fontWeight: 700 }}>
          <RefreshCw size={12} /> Auto-refreshes every 5 min
        </div>
      </div>

      {/* Map */}
      <div style={{ position: "relative", borderRadius: "16px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div ref={mapRef} style={{ width: "100%", height: "480px" }} />

        {/* Stats overlay */}
        <div style={{ position: "absolute", bottom: "16px", right: "16px", background: "rgba(13,20,37,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "14px 18px", zIndex: 1000 }}>
          <div style={{ fontSize: "10px", fontWeight: 900, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Live Stats</div>
          {[
            { label: "Bookings", count: points.filter(p => p.type === "booking").length, color: "#3b82f6" },
            { label: "Active Hommies", count: points.filter(p => p.type === "hommie").length, color: "#a855f7" },
            { label: "Demand Zones", count: points.filter(p => p.type === "demand").length, color: "#f59e0b" }
          ].map((stat) => (
            <div key={stat.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "24px", marginBottom: "4px" }}>
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>{stat.label}</span>
              <span style={{ fontSize: "14px", fontWeight: 900, color: stat.color }}>{stat.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
