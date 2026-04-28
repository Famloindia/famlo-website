"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

import styles from "@/components/public/RoomDetailPage.module.css";

type RoomLocationMapProps = {
  roomName: string;
  areaLabel: string;
  lat: number | null;
  lng: number | null;
};

export function RoomLocationMap({ roomName, areaLabel, lat, lng }: Readonly<RoomLocationMapProps>): React.JSX.Element {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!mounted || !mapRef.current || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const init = async (): Promise<void> => {
      const L = (await import("leaflet")).default;
      if (!mapRef.current) return;

      if (!mapInstance.current) {
        mapInstance.current = L.map(mapRef.current, {
          zoomControl: true,
          attributionControl: false,
          dragging: true,
          scrollWheelZoom: true,
          doubleClickZoom: true,
          touchZoom: true,
          boxZoom: true,
          keyboard: true,
        }).setView([lat as number, lng as number], 16);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(mapInstance.current);
        layerRef.current = L.layerGroup().addTo(mapInstance.current);
      } else {
        mapInstance.current.setView([lat as number, lng as number], 16);
        layerRef.current?.clearLayers?.();
      }

      const circle = L.circle([lat as number, lng as number], {
        radius: 500,
        color: "#1890ff",
        weight: 3,
        fillColor: "#1890ff",
        fillOpacity: 0.16,
        dashArray: "8 12",
      });

      const marker = L.marker([lat as number, lng as number], {
        interactive: false,
        icon: L.divIcon({
          className: "famlo-room-pin",
          html: `<div style="
            width: 18px;
            height: 18px;
            border-radius: 999px;
            background: #1890ff;
            border: 3px solid white;
            box-shadow: 0 0 0 8px rgba(24,144,255,0.16), 0 0 0 16px rgba(24,144,255,0.08);
          "></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      });

      circle.addTo(layerRef.current);
      marker.addTo(layerRef.current);
      mapInstance.current.fitBounds(circle.getBounds(), { padding: [34, 34], maxZoom: 17 });

      window.setTimeout(() => mapInstance.current?.invalidateSize(), 120);
      window.setTimeout(() => mapInstance.current?.invalidateSize(), 360);
    };

    void init();
  }, [mounted, lat, lng]);

  useEffect(() => {
    if (!mounted || !mapRef.current) return;
    const observer = new ResizeObserver(() => {
      mapInstance.current?.invalidateSize();
    });
    observer.observe(mapRef.current);
    return () => observer.disconnect();
  }, [mounted]);

  return (
    <section className={styles.roomLocationCard}>
      <div className={styles.roomLocationHeader}>
        <div>
          <div className={styles.roomOverviewKicker}>Location</div>
          <h3 className={styles.roomLocationTitle}>Approximate area on map</h3>
          <p className={styles.roomLocationCopy}>
            We show the home neighborhood with a 500m radius around the masked point. The exact pin is never exposed.
          </p>
        </div>
        <div className={styles.roomLocationBadge}>Within 500m</div>
      </div>

      <div className={styles.roomLocationFrame}>
        {mounted && Number.isFinite(lat) && Number.isFinite(lng) ? (
          <>
            <div ref={mapRef} className={styles.roomLocationMap} />
          </>
        ) : (
          <div className={styles.roomLocationEmptyState}>
            Map area will appear here once location data is available.
          </div>
        )}
      </div>

      <div className={styles.roomLocationFooter}>
        <div>
          <div className={styles.roomLocationFooterLabel}>Home area</div>
          <div className={styles.roomLocationFooterValue}>{areaLabel}</div>
        </div>
        <div className={styles.roomLocationFooterNote}>No exact pin is shared anywhere on this page.</div>
      </div>
    </section>
  );
}
