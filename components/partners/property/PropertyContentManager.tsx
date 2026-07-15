"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../dashboard.module.css";
import type { PhotoItem } from "../HostDashboardEditor";
import type { PropertyReelItem } from "../HostDashboardEditor";
import type { FamilyListingDraft } from "@/lib/family-profile-editor";
import { ImagePlus, MapPin, Loader2, Video, RefreshCw } from "lucide-react";
import {
  MAX_GALLERY_IMAGE_UPLOAD_BYTES,
  formatGalleryImageUploadLimitLabel,
} from "@/lib/upload-limits";
import { HOST_REEL_ACCEPT_ATTRIBUTE, MAX_HOST_REEL_UPLOAD_BYTES } from "@/lib/host-reel-shared";
import {
  AMENITY_OPTIONS,
  BATHROOM_TYPE_OPTIONS,
  FOOD_OFFERING_OPTIONS,
  parseMultiValueList,
  serializeMultiValueList,
  toggleListValue,
} from "@/lib/home-listing-options";

const HOUSE_TYPE_OPTIONS = ["Joint family", "Nuclear family", "Couple", "Solo host", "Shared household"];
const INTERACTION_TYPE_OPTIONS = ["Friendly and available", "Extrovert", "Introvert", "Quiet and helpful", "Highly social", "Flexible"];
const HOUSE_RULE_OPTIONS = ["No smoking", "No pets", "No alcohol", "Quiet after 10 PM"];

type PropertyListingState = FamilyListingDraft;

function formatBytesLabel(value: number | null | undefined): string {
  if (!value || value <= 0) return "Uploaded";
  return `${(value / (1024 * 1024)).toFixed(1)}MB`;
}

function uploadFileWithProgress(params: {
  uploadUrl: string;
  file: File;
  onProgress?: (progress: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", params.uploadUrl);
    xhr.timeout = 60_000;
    xhr.setRequestHeader("Content-Type", params.file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !params.onProgress) return;
      params.onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onloadstart = () => {
      params.onProgress?.(1);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        params.onProgress?.(100);
        resolve();
        return;
      }
      if (xhr.status === 0) {
        reject(new Error("Upload was blocked before reaching storage. Check R2 CORS for PUT requests and allowed headers."));
        return;
      }
      reject(new Error(`Upload failed with status ${xhr.status}.`));
    };
    xhr.onerror = () => reject(new Error("Upload to storage failed before any bytes completed. This is usually an R2 CORS or signed URL mismatch."));
    xhr.onabort = () => reject(new Error("Upload was aborted before completion."));
    xhr.ontimeout = () => reject(new Error("Upload to storage timed out before completion."));
    xhr.send(params.file);
  });
}

async function uploadFileViaFallback(params: {
  url: string;
  familyId: string;
  file: File;
}): Promise<{
  publicUrl: string;
  storageKey?: string;
}> {
  const formData = new FormData();
  formData.append("familyId", params.familyId);
  formData.append("file", params.file);

  const response = await fetch(params.url, {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    publicUrl?: string;
    storageKey?: string;
  };

  if (!response.ok || !payload.publicUrl) {
    throw new Error(payload.error || "Unable to upload media through the backup path.");
  }

  return {
    publicUrl: payload.publicUrl,
    storageKey: payload.storageKey,
  };
}

export default function PropertyContentManager({
  familyId,
  listing,
  setListing,
  photos,
  setPhotos,
  propertyReels = [],
  setPropertyReels = () => undefined,
  onSave,
  saving,
}: Readonly<{
  familyId: string;
  listing: PropertyListingState;
  setListing: (value: React.SetStateAction<PropertyListingState>) => void;
  photos: PhotoItem[];
  setPhotos: (value: React.SetStateAction<PhotoItem[]>) => void;
  propertyReels?: PropertyReelItem[];
  setPropertyReels?: (value: React.SetStateAction<PropertyReelItem[]>) => void;
  onSave: (options: { updatedListing: PropertyListingState; updatedPhotos: PhotoItem[] }) => Promise<void> | void;
  saving: boolean;
}>): React.JSX.Element {
  const [loadingGallery, setLoadingGallery] = useState(photos.length === 0);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [galleryUploadProgress, setGalleryUploadProgress] = useState(0);
  const [galleryStatus, setGalleryStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [customAmenity, setCustomAmenity] = useState("");
  const [customIncludedItem, setCustomIncludedItem] = useState("");
  const [customFoodType, setCustomFoodType] = useState("");
  const [customHouseRule, setCustomHouseRule] = useState("");
  const [locations, setLocations] = useState<{ states: string[]; cities: string[]; villages: string[] }>({
    states: [],
    cities: [],
    villages: [],
  });
  const [loadingReels, setLoadingReels] = useState(propertyReels.length === 0);
  const [uploadingReel, setUploadingReel] = useState(false);
  const [reelUploadProgress, setReelUploadProgress] = useState(0);
  const [reelStatus, setReelStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [reels, setReels] = useState<PropertyReelItem[]>(propertyReels);

  useEffect(() => {
    setReels(propertyReels);
  }, [propertyReels]);

  useEffect(() => {
    fetch("/api/locations/search")
      .then((res) => res.json())
      .then((data) => setLocations(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCanonicalPropertyMedia() {
      setLoadingGallery(photos.length === 0);
      setLoadingReels(propertyReels.length === 0);
      try {
        const [galleryResponse, reelResponse] = await Promise.all([
          fetch(`/api/host/property-media?familyId=${encodeURIComponent(familyId)}`, { cache: "no-store" }),
          fetch(`/api/host/property-reels?familyId=${encodeURIComponent(familyId)}`, { cache: "no-store" }),
        ]);
        const galleryPayload = (await galleryResponse.json()) as { error?: string; photos?: Array<Record<string, unknown>> };
        const reelPayload = (await reelResponse.json()) as { error?: string; reels?: Array<Record<string, unknown>> };

        if (!cancelled && galleryResponse.ok && Array.isArray(galleryPayload.photos)) {
          const nextPhotos = galleryPayload.photos.map((photo) => ({
              id: String(photo.id ?? `photo-${Math.random()}`),
              url: String(photo.url ?? ""),
              isPrimary: photo.isPrimary === true,
              family_id: familyId,
            }));
          setPhotos(nextPhotos);
        }

        if (!cancelled && reelResponse.ok && Array.isArray(reelPayload.reels)) {
          const nextReels = reelPayload.reels
              .filter((item) => typeof item.publicUrl === "string" && item.publicUrl.trim().length > 0)
              .map((item) => ({
                id: String(item.id ?? `reel-${Math.random()}`),
                publicUrl: String(item.publicUrl ?? ""),
                storageKey: typeof item.storageKey === "string" ? item.storageKey : "",
                title: typeof item.title === "string" ? item.title : "",
                caption: typeof item.caption === "string" ? item.caption : "",
                mimeType: typeof item.mimeType === "string" ? item.mimeType : "",
                sizeBytes: typeof item.sizeBytes === "number" ? item.sizeBytes : null,
                durationSeconds: typeof item.durationSeconds === "number" ? item.durationSeconds : null,
                isFeatured: item.isFeatured === true,
                status: typeof item.status === "string" ? item.status : "active",
                source: typeof item.source === "string" ? item.source : "",
              }));
          setReels(nextReels);
          setPropertyReels(nextReels);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Unable to refresh saved property media.";
          setGalleryStatus({ type: "error", text: message });
        }
      } finally {
        if (!cancelled) {
          setLoadingGallery(false);
          setLoadingReels(false);
        }
      }
    }

    void loadCanonicalPropertyMedia();
    return () => {
      cancelled = true;
    };
  }, [familyId, photos.length, propertyReels.length, setPhotos, setPropertyReels]);

  const requestUploadTarget = async (url: string, file: File) => {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        }),
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Unable to reach the upload URL API.");
    }

    let payload: {
      error?: string;
      uploadUrl?: string;
      publicUrl?: string;
      storageKey?: string;
    };
    try {
      payload = (await response.json()) as {
        error?: string;
        uploadUrl?: string;
        publicUrl?: string;
        storageKey?: string;
      };
    } catch {
      throw new Error("Upload URL API returned an unreadable response.");
    }

    if (response.status === 401) {
      throw new Error("Upload unauthorized. Please refresh or log in again.");
    }

    if (!response.ok || !payload.uploadUrl || !payload.publicUrl) {
      throw new Error(payload.error || "Unable to prepare upload target.");
    }
    return payload as { uploadUrl: string; publicUrl: string; storageKey?: string };
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    setUploadingGallery(true);
    setGalleryStatus(null);
    setGalleryUploadProgress(0);

    try {
      const files = Array.from(e.target.files);
      const nextPhotos = [...photos];

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]!;
        if (file.size > MAX_GALLERY_IMAGE_UPLOAD_BYTES) {
          throw new Error(`Image must be ${formatGalleryImageUploadLimitLabel()} or smaller.`);
        }

        let uploadedAsset: { publicUrl: string; storageKey?: string };
        try {
          const uploadTarget = await requestUploadTarget("/api/host/property-media/upload-url", file);
          await uploadFileWithProgress({
            uploadUrl: uploadTarget.uploadUrl,
            file,
            onProgress: (progress) => {
              const aggregate = Math.round(((index + progress / 100) / files.length) * 100);
              setGalleryUploadProgress(aggregate);
            },
          });
          uploadedAsset = {
            publicUrl: uploadTarget.publicUrl,
            storageKey: uploadTarget.storageKey,
          };
        } catch (error) {
          console.warn("[property-gallery-upload] Falling back to server relay upload.", error);
          setGalleryUploadProgress(Math.round((index / files.length) * 100));
          uploadedAsset = await uploadFileViaFallback({
            url: "/api/host/property-media/upload-fallback",
            familyId,
            file,
          });
          setGalleryUploadProgress(Math.round(((index + 1) / files.length) * 100));
        }

        const saveResponse = await fetch("/api/host/property-media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId,
            publicUrl: uploadedAsset.publicUrl,
            storageKey: uploadedAsset.storageKey,
          }),
        });
        const savePayload = (await saveResponse.json()) as { error?: string; photo?: Record<string, unknown> };
        if (!saveResponse.ok || !savePayload.photo) {
          throw new Error(savePayload.error || "Unable to save gallery image metadata.");
        }

        nextPhotos.push({
          id: String(savePayload.photo.id ?? `photo-${Date.now()}-${index}`),
          url: String(savePayload.photo.url ?? uploadedAsset.publicUrl),
          isPrimary: savePayload.photo.isPrimary === true,
          family_id: familyId,
        });
      }

      setPhotos(
        nextPhotos
          .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary))
          .map((photo, index) => ({ ...photo, isPrimary: index === 0 ? photo.isPrimary || !nextPhotos.some((item) => item.isPrimary) : photo.isPrimary }))
      );
      setGalleryStatus({ type: "success", text: "Gallery saved and refresh-safe." });
    } catch (err) {
      setGalleryStatus({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to upload gallery photos.",
      });
    } finally {
      setUploadingGallery(false);
      setGalleryUploadProgress(0);
      e.target.value = "";
    }
  };

  const handleReplacePhoto = async (e: React.ChangeEvent<HTMLInputElement>, photoIndex: number) => {
    if (!e.target.files?.[0]) return;

    setUploadingGallery(true);
    setGalleryStatus(null);
    setGalleryUploadProgress(0);
    try {
      const file = e.target.files[0];
      let uploadedAsset: { publicUrl: string; storageKey?: string };
      try {
        const target = await requestUploadTarget("/api/host/property-media/upload-url", file);
        await uploadFileWithProgress({
          uploadUrl: target.uploadUrl,
          file,
          onProgress: setGalleryUploadProgress,
        });
        uploadedAsset = {
          publicUrl: target.publicUrl,
          storageKey: target.storageKey,
        };
      } catch (error) {
        console.warn("[property-gallery-replace] Falling back to server relay upload.", error);
        uploadedAsset = await uploadFileViaFallback({
          url: "/api/host/property-media/upload-fallback",
          familyId,
          file,
        });
        setGalleryUploadProgress(100);
      }

      const targetPhoto = photos[photoIndex];
      const response = await fetch("/api/host/property-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          photoId: targetPhoto?.id,
          action: "replace",
          publicUrl: uploadedAsset.publicUrl,
          storageKey: uploadedAsset.storageKey,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to replace gallery image.");
      }

      setPhotos((current) =>
        current.map((photo, index) => (index === photoIndex ? { ...photo, url: uploadedAsset.publicUrl } : photo))
      );
      setGalleryStatus({ type: "success", text: "Gallery image replaced." });
    } catch (err) {
      setGalleryStatus({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to replace gallery photo.",
      });
    } finally {
      setUploadingGallery(false);
      setGalleryUploadProgress(0);
      e.target.value = "";
    }
  };

  const handleSetPrimaryPhoto = async (photoIndex: number) => {
    const target = photos[photoIndex];
    if (!target) return;
    setGalleryStatus(null);
    try {
      const response = await fetch("/api/host/property-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          photoId: target.id,
          action: "set_primary",
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to set cover image.");
      }

      setPhotos((current) =>
        current.map((photo, index) => ({
          ...photo,
          isPrimary: index === photoIndex,
        }))
      );
      setGalleryStatus({ type: "success", text: "Cover photo updated." });
    } catch (error) {
      setGalleryStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to set cover image.",
      });
    }
  };

  const handleRemovePhoto = async (photoIndex: number) => {
    const target = photos[photoIndex];
    if (!target) return;
    setGalleryStatus(null);
    try {
      const response = await fetch("/api/host/property-media", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          photoId: target.id,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to remove gallery image.");
      }

      setPhotos((current) => {
        const next = current.filter((_, index) => index !== photoIndex);
        if (next.length > 0 && !next.some((photo) => photo.isPrimary)) {
          next[0] = { ...next[0], isPrimary: true };
        }
        return next;
      });
      setGalleryStatus({ type: "success", text: "Gallery image removed." });
    } catch (error) {
      setGalleryStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to remove gallery image.",
      });
    }
  };

  const handleReelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingReel(true);
    setReelStatus(null);
    setReelUploadProgress(0);

    try {
      let uploadedAsset: { publicUrl: string; storageKey?: string };
      try {
        const target = await requestUploadTarget("/api/host/property-reels/upload-url", file);
        await uploadFileWithProgress({
          uploadUrl: target.uploadUrl,
          file,
          onProgress: setReelUploadProgress,
        });
        uploadedAsset = {
          publicUrl: target.publicUrl,
          storageKey: target.storageKey,
        };
      } catch (error) {
        console.warn("[property-reel-upload] Falling back to server relay upload.", error);
        uploadedAsset = await uploadFileViaFallback({
          url: "/api/host/property-reels/upload-fallback",
          familyId,
          file,
        });
        setReelUploadProgress(100);
      }

      const response = await fetch("/api/host/property-reels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          publicUrl: uploadedAsset.publicUrl,
          storageKey: uploadedAsset.storageKey,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      const payload = (await response.json()) as { error?: string; reel?: Record<string, unknown> };
      if (!response.ok || !payload.reel) {
        throw new Error(payload.error || "Unable to save host reel metadata.");
      }

      const nextReel = {
        id: String(payload.reel.id ?? `reel-${Date.now()}`),
        publicUrl: String(payload.reel.publicUrl ?? uploadedAsset.publicUrl),
        storageKey: String(payload.reel.storageKey ?? uploadedAsset.storageKey ?? ""),
        mimeType: String(payload.reel.mimeType ?? file.type),
        sizeBytes: typeof payload.reel.sizeBytes === "number" ? payload.reel.sizeBytes : file.size,
        isFeatured: payload.reel.isFeatured === true,
        title: String(payload.reel.title ?? ""),
        caption: String(payload.reel.caption ?? ""),
      } satisfies PropertyReelItem;

      const nextReels = [
        nextReel,
        ...reels.filter(
          (item) =>
            item.id !== nextReel.id &&
            item.publicUrl !== nextReel.publicUrl &&
            (!nextReel.storageKey || item.storageKey !== nextReel.storageKey)
        ),
      ];
      setReels(nextReels);
      setPropertyReels(nextReels);
      setListing((current) => ({
        ...current,
        hostReelPublicUrl: nextReel.publicUrl,
        hostReelStorageKey: nextReel.storageKey,
        hostReelMimeType: nextReel.mimeType,
        hostReelSizeBytes: nextReel.sizeBytes ?? null,
        hostReelUploadedAt: new Date().toISOString(),
      }));
      setReelStatus({ type: "success", text: "Host reel uploaded and saved." });
    } catch (error) {
      setReelStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to upload host reel.",
      });
    } finally {
      setUploadingReel(false);
      setReelUploadProgress(0);
      e.target.value = "";
    }
  };

  const handleSetFeaturedReel = async (reelId: string) => {
    setReelStatus(null);
    try {
      const response = await fetch("/api/host/property-reels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          reelId,
          action: "set_featured",
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to feature this reel.");
      }

      const nextReels = reels.map((reel) => ({
          ...reel,
          isFeatured: reel.id === reelId,
        }));
      setReels(nextReels);
      setPropertyReels(nextReels);
      const featured = reels.find((item) => item.id === reelId);
      if (featured) {
        setListing((current) => ({
          ...current,
          hostReelPublicUrl: featured.publicUrl,
          hostReelStorageKey: featured.storageKey,
          hostReelMimeType: featured.mimeType,
          hostReelSizeBytes: featured.sizeBytes ?? null,
        }));
      }
      setReelStatus({ type: "success", text: "Featured reel updated." });
    } catch (error) {
      setReelStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to feature this reel.",
      });
    }
  };

  const handleRemoveReel = async (reelId: string) => {
    setReelStatus(null);
    try {
      const response = await fetch("/api/host/property-reels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          reelId,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to remove this reel.");
      }

      const remainingReels = reels.filter((item) => item.id !== reelId);
      setReels(remainingReels);
      setPropertyReels(remainingReels);
      const featured = remainingReels.find((item) => item.isFeatured) ?? remainingReels[0] ?? null;
      setListing((current) => ({
        ...current,
        hostReelPublicUrl: featured?.publicUrl ?? "",
        hostReelStorageKey: featured?.storageKey ?? "",
        hostReelMimeType: featured?.mimeType ?? "",
        hostReelSizeBytes: featured?.sizeBytes ?? null,
        hostReelUploadedAt: featured ? current.hostReelUploadedAt : "",
      }));
      setReelStatus({ type: "success", text: "Host reel removed." });
    } catch (error) {
      setReelStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to remove this reel.",
      });
    }
  };

  const detectLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = `${position.coords.latitude}, ${position.coords.longitude}`;
          setListing((current) => ({ ...current, googleMapsLink: `https://maps.google.com/?q=${coords}` }));
        },
        () => setGalleryStatus({ type: "error", text: "Location access denied or failed. Please check browser settings." })
      );
    }
  };

  const selectedAmenities = useMemo(() => parseMultiValueList(listing.amenities || ""), [listing.amenities]);
  const selectedIncludedItems = useMemo(() => parseMultiValueList(listing.includedItems || ""), [listing.includedItems]);
  const selectedFood = useMemo(() => parseMultiValueList(listing.foodType || ""), [listing.foodType]);
  const selectedHouseRules = useMemo(() => parseMultiValueList(listing.houseRules || ""), [listing.houseRules]);

  const updateAmenities = (nextAmenities: string[]) => {
    setListing((current) => ({ ...current, amenities: serializeMultiValueList(nextAmenities) }));
  };

  const updateIncludedItems = (nextItems: string[]) => {
    setListing((current) => ({ ...current, includedItems: serializeMultiValueList(nextItems) }));
  };

  const updateFoodType = (nextItems: string[]) => {
    setListing((current) => ({ ...current, foodType: serializeMultiValueList(nextItems) }));
  };

  const updateHouseRules = (nextRules: string[]) => {
    setListing((current) => ({ ...current, houseRules: serializeMultiValueList(nextRules) }));
  };

  const savePropertyContent = () => {
    const featuredReel = reels.find((item) => item.isFeatured) ?? reels[0] ?? null;
    return onSave({
      updatedListing: {
        ...listing,
        hostReelPublicUrl: featuredReel?.publicUrl ?? listing.hostReelPublicUrl ?? "",
        hostReelStorageKey: featuredReel?.storageKey ?? listing.hostReelStorageKey ?? "",
        hostReelMimeType: featuredReel?.mimeType ?? listing.hostReelMimeType ?? "",
        hostReelSizeBytes: featuredReel?.sizeBytes ?? listing.hostReelSizeBytes ?? null,
        hostReelUploadedAt: featuredReel ? listing.hostReelUploadedAt || new Date().toISOString() : "",
      },
      updatedPhotos: photos,
    });
  };

  return (
    <div className={`${styles.flexCol} ${styles.animateIn}`} style={{ gap: "32px" }}>
      <div className={styles.glassCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
          <div>
            <h3 style={{ fontSize: "14px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>Host Gallery</h3>
            <p style={{ fontSize: "13px", color: "rgba(14,43,87,0.6)", margin: 0 }}>
              Manage the exact listing images guests see. Upload new photos, replace old ones, choose the cover image, and remove anything you no longer want live.
            </p>
          </div>
          <button
            type="button"
            className={styles.secondaryBtn}
            style={{ width: "auto", minWidth: "auto" }}
            onClick={() => {
              setLoadingGallery(true);
              fetch(`/api/host/property-media?familyId=${encodeURIComponent(familyId)}`, { cache: "no-store" })
                .then((res) => res.json())
                .then((payload: { photos?: Array<Record<string, unknown>>; error?: string }) => {
                  if (Array.isArray(payload.photos)) {
                    setPhotos(
                      payload.photos.map((photo) => ({
                        id: String(photo.id ?? ""),
                        url: String(photo.url ?? ""),
                        isPrimary: photo.isPrimary === true,
                        family_id: familyId,
                      }))
                    );
                    setGalleryStatus({ type: "success", text: "Gallery refreshed from saved data." });
                    return;
                  }
                  throw new Error(payload.error || "Unable to refresh gallery.");
                })
                .catch((error) => setGalleryStatus({ type: "error", text: error instanceof Error ? error.message : "Unable to refresh gallery." }))
                .finally(() => setLoadingGallery(false));
            }}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {galleryStatus ? (
          <div
            style={{
              marginBottom: "12px",
              padding: "12px 14px",
              borderRadius: "12px",
              background: galleryStatus.type === "success" ? "#f0fdf4" : "#fef2f2",
              color: galleryStatus.type === "success" ? "#166534" : "#b91c1c",
              fontSize: "12px",
              fontWeight: 700,
            }}
          >
            {galleryStatus.text}
          </div>
        ) : null}

        {uploadingGallery ? (
          <div style={{ marginBottom: "12px", padding: "12px 14px", borderRadius: "12px", background: "#eff6ff", color: "#165dcc", fontSize: "12px", fontWeight: 700 }}>
            Uploading gallery photos: {galleryUploadProgress}%
          </div>
        ) : null}

        {loadingGallery ? (
          <div style={{ marginBottom: "16px", padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px dashed rgba(14,43,87,0.18)", color: "#475569", fontSize: "12px", fontWeight: 700 }}>
            Loading saved gallery...
          </div>
        ) : null}

        {!loadingGallery && photos.length === 0 ? (
          <div style={{ marginBottom: "16px", padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px dashed rgba(14,43,87,0.18)", color: "#475569", fontSize: "12px", fontWeight: 700 }}>
            No gallery photos yet for property <code>{familyId}</code>. If this property had older media saved under a legacy host gallery, it will appear here once refreshed.
          </div>
        ) : null}

        <div style={{ display: "flex", gap: "16px", overflowX: "auto", paddingBottom: "16px" }}>
          {photos.map((p, i) => (
            <div key={p.id} style={{ flexShrink: 0, width: "168px", borderRadius: "18px", border: p.isPrimary ? "2px solid #165dcc" : "1px solid rgba(14,43,87,0.1)", overflow: "hidden", position: "relative", background: "#f4f8ff", boxShadow: p.isPrimary ? "0 16px 30px rgba(22,93,204,0.16)" : "0 10px 24px rgba(15,23,42,0.06)" }}>
              <div style={{ position: "relative", width: "100%", height: "132px" }}>
                <img src={p.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="Gallery" />
                {p.isPrimary ? (
                  <div style={{ position: "absolute", top: "10px", left: "10px", background: "rgba(22,93,204,0.96)", color: "white", borderRadius: "999px", padding: "6px 10px", fontSize: "10px", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Listing Cover
                  </div>
                ) : null}
              </div>
              <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ fontSize: "12px", fontWeight: 800, color: "#0e2b57" }}># {i + 1} Image</div>
                <button
                  type="button"
                  onClick={() => void handleSetPrimaryPhoto(i)}
                  style={{ border: "1px solid rgba(22,93,204,0.18)", background: p.isPrimary ? "#dbeafe" : "#eff6ff", color: "#165dcc", borderRadius: "10px", padding: "9px 12px", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}
                >
                  {p.isPrimary ? "Main cover" : "Set as cover"}
                </button>
                <label style={{ border: "1px solid rgba(14,43,87,0.1)", background: "white", color: "#0e2b57", borderRadius: "10px", padding: "9px 12px", fontSize: "11px", fontWeight: 800, cursor: "pointer", textAlign: "center" }}>
                  Re-upload
                  <input type="file" style={{ display: "none" }} accept="image/*,.heic,.heif" onChange={(e) => void handleReplacePhoto(e, i)} />
                </label>
                <button
                  type="button"
                  onClick={() => void handleRemovePhoto(i)}
                  style={{ border: "none", background: "#fee2e2", color: "#b91c1c", borderRadius: "10px", padding: "9px 12px", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          <label style={{ flexShrink: 0, width: "168px", minHeight: "220px", borderRadius: "18px", border: "2px dashed rgba(22,93,204,0.3)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "rgba(244,248,255,0.5)", color: "#165dcc", transition: "all 0.2s ease", padding: "16px", textAlign: "center" }}>
            {uploadingGallery ? <Loader2 size={24} className="animate-spin" style={{ marginBottom: "4px" }} /> : <ImagePlus size={24} style={{ marginBottom: "4px" }} />}
            <span style={{ fontSize: "12px", fontWeight: 800 }}>{uploadingGallery ? `Uploading ${galleryUploadProgress}%` : "Add photos"}</span>
            <span style={{ marginTop: "4px", fontSize: "10px", fontWeight: 800, color: "rgba(22,93,204,0.7)" }}>Signed upload up to {formatGalleryImageUploadLimitLabel()}</span>
            <input type="file" multiple style={{ display: "none" }} accept="image/*,.heic,.heif" onChange={handleGalleryUpload} />
          </label>
        </div>
      </div>

      <div className={styles.glassCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
          <div>
            <h3 style={{ fontSize: "14px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>Host Reel</h3>
            <p style={{ fontSize: "13px", color: "rgba(14,43,87,0.6)", margin: 0 }}>
              Upload a short vertical reel for this property. Reels use direct browser-to-storage uploads and keep a DB metadata row so they survive refreshes and public listing syncs.
            </p>
          </div>
        </div>

        {reelStatus ? (
          <div
            style={{
              marginBottom: "12px",
              padding: "12px 14px",
              borderRadius: "12px",
              background: reelStatus.type === "success" ? "#f0fdf4" : "#fef2f2",
              color: reelStatus.type === "success" ? "#166534" : "#b91c1c",
              fontSize: "12px",
              fontWeight: 700,
            }}
          >
            {reelStatus.text}
          </div>
        ) : null}

        {uploadingReel ? (
          <div style={{ marginBottom: "12px", padding: "12px 14px", borderRadius: "12px", background: "#eff6ff", color: "#165dcc", fontSize: "12px", fontWeight: 700 }}>
            Uploading host reel: {reelUploadProgress}%
          </div>
        ) : null}

        {loadingReels ? (
          <div style={{ marginBottom: "16px", padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px dashed rgba(14,43,87,0.18)", color: "#475569", fontSize: "12px", fontWeight: 700 }}>
            Loading saved reels...
          </div>
        ) : null}

        {!loadingReels && reels.length === 0 ? (
          <div style={{ marginBottom: "16px", padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px dashed rgba(14,43,87,0.18)", color: "#475569", fontSize: "12px", fontWeight: 700 }}>
            No host reel saved yet. Upload a vertical video up to {Math.round(MAX_HOST_REEL_UPLOAD_BYTES / (1024 * 1024))}MB.
          </div>
        ) : null}

        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "stretch" }}>
          {reels.map((reel) => (
            <div
              key={reel.id}
              style={{
                flexShrink: 0,
                width: "min(100%, 240px)",
                borderRadius: "20px",
                border: reel.isFeatured ? "2px solid #165dcc" : "1px solid rgba(14,43,87,0.12)",
                background: "#fff",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div>
                <div style={{ fontSize: "12px", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: reel.isFeatured ? "#165dcc" : "#64748b" }}>
                  {reel.isFeatured ? "Featured Reel" : "Saved Reel"}
                </div>
                <div style={{ fontSize: "14px", fontWeight: 800, color: "#0e2b57", marginTop: "4px" }}>{reel.title || "Host reel"}</div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                  {reel.mimeType ? reel.mimeType.replace("video/", "").toUpperCase() : "Video"} · {formatBytesLabel(reel.sizeBytes)}
                </div>
              </div>
              <div style={{ width: "100%", aspectRatio: "9 / 16", borderRadius: "18px", overflow: "hidden", background: "#0f172a" }}>
                <video src={reel.publicUrl} controls playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </div>
              <div style={{ display: "grid", gap: "8px" }}>
                <button type="button" onClick={() => void handleSetFeaturedReel(reel.id)} style={{ borderRadius: "10px", border: "1px solid rgba(22,93,204,0.18)", background: reel.isFeatured ? "#dbeafe" : "#eff6ff", color: "#165dcc", padding: "9px 12px", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}>
                  {reel.isFeatured ? "Featured" : "Set featured"}
                </button>
                <button type="button" onClick={() => void handleRemoveReel(reel.id)} style={{ borderRadius: "10px", border: "none", background: "#fee2e2", color: "#b91c1c", padding: "9px 12px", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}>
                  Remove
                </button>
              </div>
            </div>
          ))}

          <label
            style={{
              flexShrink: 0,
              width: "min(100%, 220px)",
              minHeight: "220px",
              borderRadius: "18px",
              border: "2px dashed rgba(22,93,204,0.3)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              background: "rgba(244,248,255,0.5)",
              color: "#165dcc",
              padding: "18px",
              textAlign: "center",
            }}
          >
            {uploadingReel ? <Loader2 size={22} className="animate-spin" style={{ marginBottom: "8px" }} /> : <Video size={22} style={{ marginBottom: "8px" }} />}
            <span style={{ fontSize: "12px", fontWeight: 800 }}>{uploadingReel ? `Uploading ${reelUploadProgress}%` : reels.length > 0 ? "Upload another reel" : "Upload reel"}</span>
            <span style={{ marginTop: "4px", fontSize: "10px", fontWeight: 800, color: "rgba(22,93,204,0.7)" }}>
              Signed upload · vertical MP4/WEBM/MOV · up to {Math.round(MAX_HOST_REEL_UPLOAD_BYTES / (1024 * 1024))}MB
            </span>
            <input type="file" style={{ display: "none" }} accept={HOST_REEL_ACCEPT_ATTRIBUTE} onChange={handleReelUpload} />
          </label>
        </div>
      </div>

      <div className={styles.glassCard}>
        <h3 style={{ fontSize: "14px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "24px" }}>Story and Listing Details</h3>

        <div className={styles.gridCols2} style={{ gap: "24px" }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: "12px", fontWeight: 800, color: "rgba(14,43,87,0.6)", textTransform: "uppercase", marginBottom: "8px", display: "block" }}>My Journey</label>
            <textarea className={styles.inputField} style={{ minHeight: "100px", resize: "vertical", lineHeight: 1.55 }} placeholder="Type here" value={listing.journeyStory || ""} onChange={(e) => setListing((current) => ({ ...current, journeyStory: e.target.value }))} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: "12px", fontWeight: 800, color: "rgba(14,43,87,0.6)", textTransform: "uppercase", marginBottom: "8px", display: "block" }}>My Special Place</label>
            <textarea className={styles.inputField} style={{ minHeight: "100px", resize: "vertical", lineHeight: 1.55 }} placeholder="What makes your place special" value={listing.specialExperience || ""} onChange={(e) => setListing((current) => ({ ...current, specialExperience: e.target.value }))} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: "12px", fontWeight: 800, color: "rgba(14,43,87,0.6)", textTransform: "uppercase", marginBottom: "8px", display: "block" }}>My Local Experience</label>
            <textarea className={styles.inputField} style={{ minHeight: "100px", resize: "vertical", lineHeight: 1.55 }} placeholder="Type here" value={listing.localExperience || ""} onChange={(e) => setListing((current) => ({ ...current, localExperience: e.target.value }))} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: "12px", fontWeight: 800, color: "rgba(14,43,87,0.6)", textTransform: "uppercase", marginBottom: "8px", display: "block" }}>Public Listing Title</label>
            <input className={styles.inputField} placeholder="E.g., Courtyard Lunch with a Jodhpur Family" value={listing.listingTitle} onChange={(e) => setListing((current) => ({ ...current, listingTitle: e.target.value }))} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: "12px", fontWeight: 800, color: "rgba(14,43,87,0.6)", textTransform: "uppercase", marginBottom: "8px", display: "block" }}>Full Property Name</label>
            <input className={styles.inputField} value={listing.propertyName} onChange={(e) => setListing((current) => ({ ...current, propertyName: e.target.value }))} />
          </div>
          <datalist id="city-list">
            {locations.cities.map((c) => <option key={c} value={c} />)}
          </datalist>
          <datalist id="state-list">
            {locations.states.map((s) => <option key={s} value={s} />)}
          </datalist>
          <datalist id="village-list">
            {locations.villages.map((v) => <option key={v} value={v} />)}
          </datalist>

          <div>
            <label style={{ fontSize: "12px", fontWeight: 800, color: "rgba(14,43,87,0.6)", textTransform: "uppercase", marginBottom: "8px", display: "block" }}>Home Type</label>
            <select className={styles.inputField} value={listing.houseType || ""} onChange={(e) => setListing((current) => ({ ...current, houseType: e.target.value }))}>
              <option value="">Select home type</option>
              {HOUSE_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 800, color: "rgba(14,43,87,0.6)", textTransform: "uppercase", marginBottom: "8px", display: "block" }}>Interaction Type</label>
            <select className={styles.inputField} value={listing.interactionType || ""} onChange={(e) => setListing((current) => ({ ...current, interactionType: e.target.value }))}>
              <option value="">Select interaction type</option>
              {INTERACTION_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: "12px", fontWeight: 800, color: "rgba(14,43,87,0.6)", textTransform: "uppercase", marginBottom: "8px", display: "block" }}>House Rules</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
              {HOUSE_RULE_OPTIONS.map((option) => {
                const active = selectedHouseRules.some((item) => item.toLowerCase() === option.toLowerCase());
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => updateHouseRules(toggleListValue(selectedHouseRules, option))}
                    style={{
                      borderRadius: "999px",
                      border: active ? "1px solid #165dcc" : "1px solid rgba(14,43,87,0.12)",
                      background: active ? "#eff6ff" : "white",
                      color: active ? "#0b4db1" : "#0e2b57",
                      padding: "9px 14px",
                      fontSize: "12px",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <textarea
              className={styles.inputField}
              placeholder={"No smoking\nNo pets\nQuiet after 10 PM"}
              value={listing.houseRules}
              onChange={(e) => setListing((current) => ({ ...current, houseRules: e.target.value }))}
              style={{ minHeight: "110px", resize: "vertical", lineHeight: 1.55 }}
            />
            <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "10px" }}>
              <input className={styles.inputField} style={{ flex: 1 }} placeholder="Add a custom house rule" value={customHouseRule} onChange={(e) => setCustomHouseRule(e.target.value)} />
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => {
                  const next = customHouseRule.trim();
                  if (!next) return;
                  updateHouseRules(toggleListValue(selectedHouseRules, next));
                  setCustomHouseRule("");
                }}
                style={{ width: "auto", minWidth: "auto" }}
              >
                Add
              </button>
            </div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: "12px", fontWeight: 800, color: "rgba(14,43,87,0.6)", textTransform: "uppercase", marginBottom: "8px", display: "block" }}>Amenities</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
              {AMENITY_OPTIONS.map((option) => {
                const active = selectedAmenities.some((item) => item.toLowerCase() === option.toLowerCase());
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => updateAmenities(toggleListValue(selectedAmenities, option))}
                    style={{
                      borderRadius: "999px",
                      border: active ? "1px solid #165dcc" : "1px solid rgba(14,43,87,0.12)",
                      background: active ? "#dbeafe" : "white",
                      color: active ? "#0b4db1" : "#0e2b57",
                      padding: "9px 14px",
                      fontSize: "12px",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input className={styles.inputField} style={{ flex: 1 }} placeholder="Add a custom amenity" value={customAmenity} onChange={(e) => setCustomAmenity(e.target.value)} />
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => {
                  const next = customAmenity.trim();
                  if (!next) return;
                  updateAmenities(toggleListValue(selectedAmenities, next));
                  setCustomAmenity("");
                }}
                style={{ width: "auto", minWidth: "auto" }}
              >
                Add
              </button>
            </div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: "12px", fontWeight: 800, color: "rgba(14,43,87,0.6)", textTransform: "uppercase", marginBottom: "8px", display: "block" }}>Food Type</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
              {FOOD_OFFERING_OPTIONS.map((option) => {
                const active = selectedFood.some((item) => item.toLowerCase() === option.toLowerCase());
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => updateFoodType(toggleListValue(selectedFood, option))}
                    style={{
                      borderRadius: "999px",
                      border: active ? "1px solid #165dcc" : "1px solid rgba(14,43,87,0.12)",
                      background: active ? "#eff6ff" : "white",
                      color: active ? "#0b4db1" : "#0e2b57",
                      padding: "9px 14px",
                      fontSize: "12px",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "12px" }}>
              <input className={styles.inputField} style={{ flex: 1 }} placeholder="Add a custom food type" value={customFoodType} onChange={(e) => setCustomFoodType(e.target.value)} />
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => {
                  const next = customFoodType.trim();
                  if (!next) return;
                  updateFoodType(toggleListValue(selectedFood, next));
                  setCustomFoodType("");
                }}
                style={{ width: "auto", minWidth: "auto" }}
              >
                Add
              </button>
            </div>
            <textarea className={styles.inputField} style={{ minHeight: "110px", resize: "vertical", lineHeight: 1.55 }} placeholder="Add meals, snacks, tea, breakfast, or any custom inclusions on new lines." value={listing.includedItems} onChange={(e) => setListing((current) => ({ ...current, includedItems: e.target.value }))} />
            <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "10px" }}>
              <input className={styles.inputField} style={{ flex: 1 }} placeholder="Add a custom included item" value={customIncludedItem} onChange={(e) => setCustomIncludedItem(e.target.value)} />
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => {
                  const next = customIncludedItem.trim();
                  if (!next) return;
                  updateIncludedItems(toggleListValue(selectedIncludedItems, next));
                  setCustomIncludedItem("");
                }}
                style={{ width: "auto", minWidth: "auto" }}
              >
                Add
              </button>
            </div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: "12px", fontWeight: 800, color: "rgba(14,43,87,0.6)", textTransform: "uppercase", marginBottom: "8px", display: "block" }}>Bathroom Type</label>
            <select className={styles.inputField} value={listing.bathroomType} onChange={(e) => setListing((current) => ({ ...current, bathroomType: e.target.value }))}>
              <option value="">Select bathroom type</option>
              {BATHROOM_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: "12px", fontWeight: 800, color: "rgba(14,43,87,0.6)", textTransform: "uppercase", marginBottom: "8px", display: "block" }}>Complete Property Address</label>
            <input className={styles.inputField} value={listing.propertyAddress} onChange={(e) => setListing((current) => ({ ...current, propertyAddress: e.target.value }))} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: "12px", fontWeight: 800, color: "rgba(14,43,87,0.6)", textTransform: "uppercase", marginBottom: "8px", display: "block" }}>Geolocation Data</label>
            <div style={{ display: "flex", gap: "16px" }}>
              <input className={styles.inputField} style={{ flex: 1 }} placeholder="Calculated maps link or coordinates..." value={listing.googleMapsLink} onChange={(e) => setListing((current) => ({ ...current, googleMapsLink: e.target.value }))} />
              <button className={styles.primaryBtn} type="button" onClick={detectLocation} style={{ width: "auto", background: "#ecfdf5", color: "#059669", border: "1px solid #10b981" }}>
                <MapPin size={20} /> Detect Map Link
              </button>
            </div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: "12px", fontWeight: 800, color: "rgba(14,43,87,0.6)", textTransform: "uppercase", marginBottom: "8px", display: "block" }}>Check In</label>
            <input className={styles.inputField} placeholder="12:00 PM" value={listing.checkInTime || ""} onChange={(e) => setListing((current) => ({ ...current, checkInTime: e.target.value }))} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: "12px", fontWeight: 800, color: "rgba(14,43,87,0.6)", textTransform: "uppercase", marginBottom: "8px", display: "block" }}>Check Out</label>
            <input className={styles.inputField} placeholder="10:00 AM" value={listing.checkOutTime || ""} onChange={(e) => setListing((current) => ({ ...current, checkOutTime: e.target.value }))} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: "12px", fontWeight: 800, color: "rgba(14,43,87,0.6)", textTransform: "uppercase", marginBottom: "8px", display: "block" }}>Common Area Access (Comma separated)</label>
            <input className={styles.inputField} placeholder="Living room, Courtyard, Terrace" value={listing.commonAreas} onChange={(e) => setListing((current) => ({ ...current, commonAreas: e.target.value }))} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
          <button className={styles.primaryBtn} type="button" onClick={savePropertyContent} disabled={saving} style={{ width: "auto", minWidth: "220px" }}>
            {saving ? "Saving property..." : "Save Property Content"}
          </button>
        </div>
      </div>
    </div>
  );
}
