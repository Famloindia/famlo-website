// components/public/LocationPrivacyMap.tsx
"use client";

import React from "react";

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
  const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}&z=14&output=embed`;

  return (
    <div className="relative group">
      <div className="h-[300px] w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm relative z-0">
        <iframe
          title="Approximate location map"
          src={mapUrl}
          className="h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen={false}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/30 via-transparent to-transparent flex flex-col justify-end p-6 pointer-events-none z-[1000]">
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
