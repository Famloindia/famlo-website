// components/public/LocationPrivacyMap.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

interface LocationPrivacyMapProps {
  lat: number;
  lng: number;
  radiusMeters?: number;
}

const LocationPrivacyMap: React.FC<LocationPrivacyMapProps> = ({ 
  lat, 
  lng, 
  radiusMeters = 800 
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    if (!isMounted || !mapRef.current) return;

    const initMap = async () => {
      const leafletModule = await import("leaflet");
      const L = ((leafletModule as any).default ?? leafletModule) as any;
      if (!mapRef.current) return;

      if (!mapInstance.current) {
        mapInstance.current = L.map(mapRef.current, {
          dragging: false,
          scrollWheelZoom: false,
          zoomControl: false,
          doubleClickZoom: false,
          touchZoom: false,
        }).setView([lat, lng], 14);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(mapInstance.current);
        
        // Fix gray tiles
        setTimeout(() => mapInstance.current?.invalidateSize(), 200);
      } else {
        mapInstance.current.setView([lat, lng], 14);
      }

      // Add or update Privacy Circle
      if (circleRef.current) {
        circleRef.current.remove();
      }
      circleRef.current = L.circle([lat, lng], {
        radius: radiusMeters,
        color: '#1A56DB',
        fillColor: '#1A56DB',
        fillOpacity: 0.15,
        weight: 2,
        dashArray: '5, 10'
      }).addTo(mapInstance.current);
    };

    initMap();
  }, [isMounted, lat, lng, radiusMeters]);

  if (!isMounted) return <div className="h-[300px] w-full bg-slate-100 rounded-xl" />;

  return (
    <div className="relative group">
      <div className="h-[300px] w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm relative z-0">
        <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
        
        {/* Informational Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent flex flex-col justify-end p-6 pointer-events-none z-[1000]">
          <div className="bg-white/90 backdrop-blur-md p-4 rounded-xl shadow-lg border border-white/50 max-w-[280px]">
            <h4 className="font-bold text-slate-900 text-sm mb-1 flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
              Privacy Protection
            </h4>
            <p className="text-[11px] leading-relaxed text-slate-600">
              The exact address is hidden for host privacy. You&apos;ll receive the specific location immediately after your booking is confirmed.
            </p>
          </div>
        </div>
      </div>
      
      <div className="mt-3 flex items-center gap-3 px-1">
        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <div className="text-[12px] font-medium text-slate-500">
          Approximate location within {radiusMeters}m radius
        </div>
      </div>
    </div>
  );
};

export default LocationPrivacyMap;
