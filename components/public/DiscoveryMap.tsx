// components/public/DiscoveryMap.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { buildHomestayPath } from "@/lib/slug";

interface HomeMarker {
  id: string;
  name: string;
  areaLabel: string;
  lat: number;
  lng: number;
  price: number;
  imageUrl: string;
  city: string | null;
  radiusMeters: number;
}

interface DiscoveryMapProps {
  homes: HomeMarker[];
  center?: [number, number];
  zoom?: number;
}

const DiscoveryMap: React.FC<DiscoveryMapProps> = ({ homes, center = [20.5937, 78.9629], zoom = 5 }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !mapRef.current) return;

    const initMap = async () => {
      const L = leafletRef.current ?? (await import("leaflet")).default;
      leafletRef.current = L;
      if (!mapRef.current) return;

      if (!mapInstance.current) {
        mapInstance.current = L.map(mapRef.current).setView(center, zoom);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(mapInstance.current);
        layerGroupRef.current = L.layerGroup().addTo(mapInstance.current);
        setTimeout(() => mapInstance.current?.invalidateSize(), 200);
        setTimeout(() => mapInstance.current?.invalidateSize(), 600);
      }

      mapInstance.current.setView(center, zoom);
      mapInstance.current.invalidateSize();

      // Update approximate public circles and labels
      layerGroupRef.current.clearLayers();
      const mapLayers = homes.flatMap((home) => {
        const circle = L.circle([home.lat, home.lng], {
          radius: home.radiusMeters || 500,
          color: "#2357E8",
          weight: 2,
          fillColor: "#5B9BF8",
          fillOpacity: 0.18,
        }).bindPopup(`
          <div style="min-width: 180px; font-family: sans-serif;">
            <div style="font-weight:700;font-size:14px;color:#07132B;margin-bottom:4px;">${home.areaLabel}</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:8px;">Approximate area shown within ~500m for privacy.</div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
              <span style="font-weight:800;color:#165dcc;">₹${home.price.toLocaleString("en-IN")}</span>
              <a href="${buildHomestayPath(home.name, home.areaLabel, home.city, home.id)}" style="font-size:11px;background:#165dcc;color:#fff;padding:6px 10px;border-radius:999px;text-decoration:none;font-weight:700;">View home</a>
            </div>
          </div>
        `);

        const label = L.marker([home.lat, home.lng], {
          interactive: false,
          icon: L.divIcon({
            className: "discovery-map-area-label",
            html: `<div>${home.areaLabel}</div>`,
            iconSize: [160, 34],
            iconAnchor: [80, 17],
          }),
        });

        return [circle, label];
      });

      mapLayers.forEach((layer) => layer.addTo(layerGroupRef.current));

      if (mapLayers.length > 0) {
        const group = L.featureGroup(mapLayers);
        mapInstance.current.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 12 });
      } else {
        mapInstance.current.setView(center, zoom);
      }
    };

    initMap();
  }, [isMounted, homes, center, zoom]);

  useEffect(() => {
    if (!isMounted || !mapRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      mapInstance.current?.invalidateSize();
    });
    resizeObserver.observe(mapRef.current);
    window.setTimeout(() => mapInstance.current?.invalidateSize(), 300);

    return () => resizeObserver.disconnect();
  }, [isMounted]);

  if (!isMounted) return <div className="h-full w-full bg-slate-100 rounded-xl" />;

  return (
    <div className="h-full w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm relative" style={{ minHeight: "100%" }}>
      <div ref={mapRef} style={{ height: "100%", minHeight: "360px", width: "100%", zIndex: 0 }} />
      <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-200 text-[10px] uppercase tracking-wider font-bold text-slate-600 shadow-sm">
        Approximate Locations for Privacy
      </div>
    </div>
  );
};

export default DiscoveryMap;
