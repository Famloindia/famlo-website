"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Camera, Eye, ImagePlus, Loader2, MapPin, Video } from "lucide-react";

import type {
  FamilyComplianceDraft,
  FamilyListingDraft,
  FamilyPhotoItem,
  FamilyProfileDraft,
  FamilyScheduleDraft,
} from "@/lib/family-profile-editor";
import { loadFamilyProfileWorkspace, saveFamilyProfileWorkspace } from "@/lib/family-profile-editor";
import {
  AMENITY_OPTIONS,
  BATHROOM_TYPE_OPTIONS,
  FOOD_OFFERING_OPTIONS,
  FAMILY_TYPE_OPTIONS,
  HOME_TYPE_OPTIONS,
  parseMultiValueList,
  serializeMultiValueList,
  toggleListValue,
} from "@/lib/home-listing-options";
import { buildHomestayPath } from "@/lib/slug";
import {
  MAX_GALLERY_IMAGE_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_BYTES,
  formatGalleryImageUploadLimitLabel,
  formatImageUploadLimitLabel,
} from "@/lib/upload-limits";
import { HOST_REEL_ACCEPT_ATTRIBUTE, MAX_HOST_REEL_UPLOAD_BYTES } from "@/lib/host-reel-shared";
import styles from "./pro-dashboard.module.css";

const HOBBY_OPTIONS = ["Cooking", "Music", "Gardening", "Reading", "Yoga", "Art", "Travel", "Dance", "Photography"];
const INTERACTION_TYPE_OPTIONS = ["Friendly and available", "Extrovert", "Introvert", "Quiet and helpful", "Highly social", "Flexible"];
const HOUSE_RULE_OPTIONS = ["No smoking", "No pets", "No alcohol", "Quiet after 10 PM"];

type Props = {
  familyId: string;
  propertyName: string;
  propertyLocation: string;
  city: string | null;
  state: string | null;
  documentsHref: string;
  initialProfile: FamilyProfileDraft;
  initialListing: FamilyListingDraft;
  initialSchedule: FamilyScheduleDraft;
  initialCompliance: FamilyComplianceDraft;
  initialPhotos: FamilyPhotoItem[];
};

type LocationResponse = {
  states?: string[];
  cities?: string[];
  villages?: string[];
};

async function readUploadResponse(response: Response): Promise<{ url: string | null; error: string | null }> {
  const raw = await response.text();
  try {
    const json = JSON.parse(raw) as { error?: string; url?: string };
    return {
      url: typeof json.url === "string" ? json.url : null,
      error: typeof json.error === "string" ? json.error : null,
    };
  } catch {
    const trimmed = raw.trim();
    return { url: null, error: trimmed || "Upload failed." };
  }
}

async function uploadFileToR2(file: File, folder: string): Promise<string> {
  const lowerName = file.name.toLowerCase();
  const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/.test(lowerName);
  if (!isImage) {
    throw new Error("Please upload an image file.");
  }

  const isGalleryUpload = folder === "galleries";
  const maxBytes = isGalleryUpload ? MAX_GALLERY_IMAGE_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
  const limitLabel = isGalleryUpload ? formatGalleryImageUploadLimitLabel() : formatImageUploadLimitLabel();
  if (file.size > maxBytes) {
    throw new Error(`Image must be ${limitLabel} or smaller.`);
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

  const response = await fetch("/api/onboarding/home/upload", {
    method: "POST",
    body: formData,
  });

  const payload = await readUploadResponse(response);
  if (!response.ok || !payload.url) {
    throw new Error(payload.error || "Upload failed.");
  }

  return payload.url;
}

async function uploadBinaryWithProgress(uploadUrl: string, file: File, onProgress?: (progress: number) => void): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl);
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`Host reel upload failed with status ${request.status || 0}.`));
    };
    request.onerror = () => reject(new Error("Host reel upload failed."));
    request.send(file);
  });
}

export default function ProHostProfileCenter({
  familyId,
  propertyName,
  propertyLocation,
  city,
  state,
  documentsHref,
  initialProfile,
  initialListing,
  initialSchedule,
  initialCompliance,
  initialPhotos,
}: Readonly<Props>): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingSelfie, setIsUploadingSelfie] = useState(false);
  const [isUploadingGallery, setIsUploadingGallery] = useState(false);
  const [isUploadingReel, setIsUploadingReel] = useState(false);
  const [reelUploadProgress, setReelUploadProgress] = useState(0);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [customHobby, setCustomHobby] = useState("");
  const [customAmenity, setCustomAmenity] = useState("");
  const [customIncludedItem, setCustomIncludedItem] = useState("");
  const [customFoodType, setCustomFoodType] = useState("");
  const [customHouseRule, setCustomHouseRule] = useState("");
  const [locations, setLocations] = useState<{ states: string[]; cities: string[]; villages: string[] }>({
    states: [],
    cities: [],
    villages: [],
  });
  const [profile, setProfile] = useState(initialProfile);
  const [listing, setListing] = useState(initialListing);
  const [schedule, setSchedule] = useState(initialSchedule);
  const [compliance, setCompliance] = useState(initialCompliance);
  const [photos, setPhotos] = useState(initialPhotos);

  useEffect(() => {
    setProfile(initialProfile);
    setListing(initialListing);
    setSchedule(initialSchedule);
    setCompliance(initialCompliance);
    setPhotos(initialPhotos);
    setFeedback(null);
    setIsEditing(false);
  }, [familyId, initialCompliance, initialListing, initialPhotos, initialProfile, initialSchedule]);

  useEffect(() => {
    let cancelled = false;
    loadFamilyProfileWorkspace(familyId)
      .then((workspace) => {
        if (cancelled) return;
        setProfile((current) => ({
          ...workspace.profile,
          email: current.email,
          mobileNumber: current.mobileNumber,
          hostCatchphrase: current.hostCatchphrase,
        }));
        setListing((current) => ({
          ...workspace.listing,
          priceMorning: current.priceMorning,
          priceAfternoon: current.priceAfternoon,
          priceEvening: current.priceEvening,
          priceFullday: current.priceFullday,
        }));
        setPhotos(workspace.photos);
      })
      .catch((error) => {
        if (cancelled) return;
        setFeedback({
          type: "error",
          text: error instanceof Error ? error.message : "Unable to load the saved listing profile.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  useEffect(() => {
    fetch("/api/locations/search")
      .then((response) => response.json() as Promise<LocationResponse>)
      .then((payload) => {
        setLocations({
          states: Array.isArray(payload.states) ? payload.states : [],
          cities: Array.isArray(payload.cities) ? payload.cities : [],
          villages: Array.isArray(payload.villages) ? payload.villages : [],
        });
      })
      .catch(() => undefined);
  }, []);

  const selectedHobbies = useMemo(() => parseMultiValueList(profile.hostHobbies || ""), [profile.hostHobbies]);
  const selectedAmenities = useMemo(() => parseMultiValueList(listing.amenities || ""), [listing.amenities]);
  const selectedIncludedItems = useMemo(() => parseMultiValueList(listing.includedItems || ""), [listing.includedItems]);
  const selectedFoodTypes = useMemo(() => parseMultiValueList(listing.foodType || ""), [listing.foodType]);
  const selectedHouseRules = useMemo(() => parseMultiValueList(listing.houseRules || ""), [listing.houseRules]);
  const coverPhoto = profile.hostSelfieUrl || photos.find((photo) => photo.isPrimary)?.url || photos[0]?.url || "";
  const locationBits = [profile.cityNeighbourhood, profile.city, profile.state].filter(Boolean);
  const listingPreviewUrl = buildHomestayPath(
    listing.listingTitle || listing.propertyName || profile.hostDisplayName || propertyName || "Homestay",
    profile.cityNeighbourhood || null,
    profile.city || null,
    familyId
  );
  const hostReelUrl = listing.hostReelPublicUrl || "";

  const updateHobbies = (nextHobbies: string[]) => {
    setProfile((current) => ({ ...current, hostHobbies: serializeMultiValueList(nextHobbies) }));
  };

  const updateAmenities = (nextAmenities: string[]) => {
    setListing((current) => ({ ...current, amenities: serializeMultiValueList(nextAmenities) }));
  };

  const updateIncludedItems = (nextItems: string[]) => {
    setListing((current) => ({ ...current, includedItems: serializeMultiValueList(nextItems) }));
  };

  const updateFoodTypes = (nextItems: string[]) => {
    setListing((current) => ({ ...current, foodType: serializeMultiValueList(nextItems) }));
  };

  const updateHouseRules = (nextRules: string[]) => {
    setListing((current) => ({ ...current, houseRules: serializeMultiValueList(nextRules) }));
  };

  const handleSelfieUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    if (!event.target.files?.[0]) return;
    try {
      setIsUploadingSelfie(true);
      const url = await uploadFileToR2(event.target.files[0], "selfies");
      setProfile((current) => ({ ...current, hostSelfieUrl: url }));
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Failed to upload profile image." });
    } finally {
      setIsUploadingSelfie(false);
      event.target.value = "";
    }
  };

  const handleGalleryUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    if (!event.target.files?.length) return;
    try {
      setIsUploadingGallery(true);
      const nextPhotos = [...photos];
      for (const file of Array.from(event.target.files)) {
        const url = await uploadFileToR2(file, "galleries");
        nextPhotos.push({
          id: `photo-${Date.now()}-${Math.random()}`,
          url,
          isPrimary: nextPhotos.length === 0,
          family_id: familyId,
        });
      }
      setPhotos(nextPhotos);
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Failed to upload gallery photos." });
    } finally {
      setIsUploadingGallery(false);
      event.target.value = "";
    }
  };

  const handleReelUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_HOST_REEL_UPLOAD_BYTES) {
      setFeedback({ type: "error", text: "Host reel is too large. Upload a video under 75MB." });
      event.target.value = "";
      return;
    }

    try {
      setIsUploadingReel(true);
      setReelUploadProgress(0);
      setFeedback(null);

      let uploadedAsset: { publicUrl: string; storageKey?: string };
      try {
        const targetResponse = await fetch("/api/host/property-reels/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
          }),
        });
        const targetPayload = (await targetResponse.json()) as { error?: string; uploadUrl?: string; publicUrl?: string; storageKey?: string };
        if (!targetResponse.ok || !targetPayload.uploadUrl || !targetPayload.publicUrl) {
          throw new Error(targetPayload.error || "Unable to prepare the host reel upload.");
        }
        await uploadBinaryWithProgress(targetPayload.uploadUrl, file, setReelUploadProgress);
        uploadedAsset = {
          publicUrl: targetPayload.publicUrl,
          storageKey: targetPayload.storageKey,
        };
      } catch {
        const formData = new FormData();
        formData.append("familyId", familyId);
        formData.append("file", file);
        const fallbackResponse = await fetch("/api/host/property-reels/upload-fallback", {
          method: "POST",
          body: formData,
        });
        const fallbackPayload = (await fallbackResponse.json()) as { error?: string; publicUrl?: string; storageKey?: string };
        if (!fallbackResponse.ok || !fallbackPayload.publicUrl) {
          throw new Error(fallbackPayload.error || "Unable to upload the host reel.");
        }
        uploadedAsset = {
          publicUrl: fallbackPayload.publicUrl,
          storageKey: fallbackPayload.storageKey,
        };
        setReelUploadProgress(100);
      }

      await fetch("/api/host/property-reels", {
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

      setListing((current) => ({
        ...current,
        hostReelPublicUrl: uploadedAsset.publicUrl,
        hostReelStorageKey: uploadedAsset.storageKey,
        hostReelMimeType: file.type,
        hostReelSizeBytes: file.size,
        hostReelUploadedAt: new Date().toISOString(),
      }));
      setFeedback({ type: "success", text: "Host reel uploaded and connected to the existing public profile media." });
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Unable to upload host reel." });
    } finally {
      setIsUploadingReel(false);
      setReelUploadProgress(0);
      event.target.value = "";
    }
  };

  const handleReplacePhoto = async (event: React.ChangeEvent<HTMLInputElement>, index: number): Promise<void> => {
    if (!event.target.files?.[0]) return;
    try {
      setIsUploadingGallery(true);
      const url = await uploadFileToR2(event.target.files[0], "galleries");
      setPhotos((current) => current.map((photo, photoIndex) => (photoIndex === index ? { ...photo, url } : photo)));
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Failed to replace gallery image." });
    } finally {
      setIsUploadingGallery(false);
      event.target.value = "";
    }
  };

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const result = await saveFamilyProfileWorkspace({
        familyId,
        profile,
        listing,
        schedule,
        photos,
        compliance,
      });

      if (!result.ok) {
        setFeedback({ type: "error", text: result.error });
        return;
      }

      setFeedback({
        type: "success",
        text: result.warnings?.length ? `Updated live with ${result.warnings.length} sync warning${result.warnings.length === 1 ? "" : "s"}.` : "Updated live on web and app.",
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const detectLocation = (): void => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = `${position.coords.latitude}, ${position.coords.longitude}`;
        setListing((current) => ({ ...current, googleMapsLink: `https://maps.google.com/?q=${coords}` }));
      },
      () => setFeedback({ type: "error", text: "Location access failed. Add the map link manually instead." })
    );
  };

  return (
    <section className={`${styles.propertyCenterShell} ${styles.propertyCenterShellLuxury} ${styles.proLuxurySection}`}>
      <div className={styles.proProfileIntro}>
        <div>
          <div className={styles.sectionEyebrow}>PROPERTY PROFILE</div>
          <h3 className={styles.propertyCenterTitle}>Host Profile</h3>
          <p className={styles.heroText}>
            Manage the host identity, story, gallery, documents, and listing details shown for this property.
          </p>
        </div>
      </div>

      <article className={styles.proProfileHeroCard}>
        <div className={styles.proProfileHeroMedia}>
          {coverPhoto ? <img src={coverPhoto} alt={profile.hostDisplayName || propertyName} className={styles.proProfileHeroImage} /> : <Camera className={styles.proProfileHeroIcon} />}
        </div>
        <div className={styles.proProfileHeroBody}>
          <h4 className={styles.proProfileHeroTitle}>{profile.hostDisplayName || propertyName}</h4>
          <div className={styles.proProfileHeroProperty}>{listing.propertyName || propertyName}</div>
          <div className={styles.proProfileHeroLocation}>{propertyLocation}</div>
          <div className={styles.proProfileHeroSubcopy}>
            {[profile.city || city, profile.state || state].filter(Boolean).join(", ") || "City and state pending"}
          </div>
        </div>
        <div className={styles.proProfileHeroActions}>
          <button type="button" className={styles.primaryActionButton} onClick={() => setIsEditing(true)}>
            Edit host profile
          </button>
          <Link href={documentsHref} className={styles.proProfileSecondaryActionLink}>
            Documents
          </Link>
        </div>
      </article>

      {feedback ? (
        <div className={`${styles.feedbackBox} ${feedback.type === "error" ? styles.feedbackError : styles.feedbackSuccess}`}>
          {feedback.text}
        </div>
      ) : null}

      {isEditing ? (
        <div className={styles.proProfileEditorShell}>
          <div className={styles.proProfileEditorHeader}>
            <button type="button" className={styles.proProfileBackButton} onClick={() => setIsEditing(false)}>
              <ArrowLeft size={16} />
              Back to profile
            </button>
            <div className={styles.proProfileEditorActions}>
              <Link href={listingPreviewUrl} target="_blank" rel="noopener noreferrer" className={styles.secondaryActionLink}>
                <Eye size={16} />
                View listing
              </Link>
              <button type="button" className={styles.primaryActionButton} onClick={() => void handleSave()} disabled={isSaving}>
                {isSaving ? "Updating..." : "Update Web & App"}
              </button>
            </div>
          </div>

          <article className={styles.proProfilePreviewCard}>
            <div className={styles.proProfilePreviewMedia}>
              {coverPhoto ? <img src={coverPhoto} alt={profile.hostDisplayName || propertyName} className={styles.proProfilePreviewImage} /> : <Camera className={styles.proProfileHeroIcon} />}
              <label className={styles.proProfileUploadButton}>
                {isUploadingSelfie ? "Uploading..." : profile.hostSelfieUrl ? "Change host image" : "Upload host image"}
                <input type="file" accept="image/*,.heic,.heif" hidden onChange={(event) => void handleSelfieUpload(event)} />
              </label>
            </div>
            <div className={styles.proProfilePreviewDetails}>
              <div className={styles.proProfilePreviewName}>{profile.hostDisplayName || propertyName}</div>
              <div className={styles.proProfilePreviewProperty}>{listing.propertyName || propertyName}</div>
              <div className={styles.proProfilePreviewLocation}>{locationBits.join(", ") || propertyLocation}</div>
            </div>
          </article>

          <div className={styles.proProfileSectionGrid}>
            <section className={styles.proProfileSectionCard}>
              <div className={styles.proProfileSectionLabel}>Host identity</div>
              <div className={styles.proProfileFieldGrid}>
                <div className={styles.proProfileField}>
                  <label className={styles.proProfileFieldLabel}>Display name</label>
                  <input className={styles.proProfileInput} value={profile.hostDisplayName} onChange={(event) => setProfile((current) => ({ ...current, hostDisplayName: event.target.value }))} />
                </div>
                <div className={styles.proProfileField}>
                  <label className={styles.proProfileFieldLabel}>Full property name</label>
                  <input className={styles.proProfileInput} value={listing.propertyName} onChange={(event) => setListing((current) => ({ ...current, propertyName: event.target.value }))} />
                </div>
                <div className={styles.proProfileField}>
                  <label className={styles.proProfileFieldLabel}>Family type</label>
                  <select className={styles.proProfileInput} value={profile.familyComposition} onChange={(event) => setProfile((current) => ({ ...current, familyComposition: event.target.value }))}>
                    <option value="">Select family type</option>
                    {FAMILY_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div className={styles.proProfileFieldWide}>
                  <label className={styles.proProfileFieldLabel}>Host bio</label>
                  <textarea className={styles.proProfileTextarea} value={listing.hostBio} onChange={(event) => setListing((current) => ({ ...current, hostBio: event.target.value }))} />
                </div>
              </div>
            </section>

            <section className={styles.proProfileSectionCard}>
              <div className={styles.proProfileSectionLabel}>Location shown to guests</div>
              <div className={styles.proProfileFieldGrid}>
                <div className={styles.proProfileField}>
                  <label className={styles.proProfileFieldLabel}>City</label>
                  <input list="famlo-pro-city-list" className={styles.proProfileInput} value={profile.city} onChange={(event) => setProfile((current) => ({ ...current, city: event.target.value }))} />
                </div>
                <div className={styles.proProfileField}>
                  <label className={styles.proProfileFieldLabel}>State</label>
                  <input list="famlo-pro-state-list" className={styles.proProfileInput} value={profile.state} onChange={(event) => setProfile((current) => ({ ...current, state: event.target.value }))} />
                </div>
                <div className={styles.proProfileFieldWide}>
                  <label className={styles.proProfileFieldLabel}>Area / neighbourhood / locality</label>
                  <input list="famlo-pro-village-list" className={styles.proProfileInput} value={profile.cityNeighbourhood} onChange={(event) => setProfile((current) => ({ ...current, cityNeighbourhood: event.target.value }))} />
                </div>
                <div className={styles.proProfileFieldWide}>
                  <label className={styles.proProfileFieldLabel}>Complete property address</label>
                  <input className={styles.proProfileInput} value={listing.propertyAddress} onChange={(event) => setListing((current) => ({ ...current, propertyAddress: event.target.value }))} />
                </div>
                <div className={styles.proProfileFieldWide}>
                  <label className={styles.proProfileFieldLabel}>Maps link</label>
                  <div className={styles.proProfileInlineControl}>
                    <input className={styles.proProfileInput} value={listing.googleMapsLink} onChange={(event) => setListing((current) => ({ ...current, googleMapsLink: event.target.value }))} />
                    <button type="button" className={styles.proProfileGhostButton} onClick={detectLocation}>
                      <MapPin size={16} />
                      Detect
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.proProfileSectionCard}>
              <div className={styles.proProfileSectionLabel}>Hobbies & interests</div>
              <div className={styles.proProfileChipGroup}>
                {HOBBY_OPTIONS.map((option) => {
                  const active = selectedHobbies.some((item) => item.toLowerCase() === option.toLowerCase());
                  return (
                    <button
                      key={option}
                      type="button"
                      className={`${styles.proProfileChip} ${active ? styles.proProfileChipActive : ""}`}
                      onClick={() => updateHobbies(toggleListValue(selectedHobbies, option))}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              <div className={styles.proProfileInlineControl}>
                <input className={styles.proProfileInput} placeholder="Add a custom hobby" value={customHobby} onChange={(event) => setCustomHobby(event.target.value)} />
                <button
                  type="button"
                  className={styles.proProfileGhostButton}
                  onClick={() => {
                    const next = customHobby.trim();
                    if (!next) return;
                    updateHobbies(toggleListValue(selectedHobbies, next));
                    setCustomHobby("");
                  }}
                >
                  Add
                </button>
              </div>
            </section>

            <section className={styles.proProfileSectionCard}>
              <div className={styles.proProfileSectionLabel}>Host gallery</div>
              <div className={styles.proProfileGalleryRow}>
                {photos.map((photo, index) => (
                  <article key={photo.id} className={`${styles.proProfileGalleryCard} ${photo.isPrimary ? styles.proProfileGalleryCardPrimary : ""}`}>
                    <img src={photo.url} alt={`Host gallery ${index + 1}`} className={styles.proProfileGalleryImage} />
                    <div className={styles.proProfileGalleryActions}>
                      <button type="button" className={styles.proProfileGhostButton} onClick={() => setPhotos((current) => current.map((item, itemIndex) => ({ ...item, isPrimary: itemIndex === index })))}>
                        {photo.isPrimary ? "Cover image" : "Set cover"}
                      </button>
                      <label className={styles.proProfileGhostButton}>
                        Replace
                        <input type="file" hidden accept="image/*,.heic,.heif" onChange={(event) => void handleReplacePhoto(event, index)} />
                      </label>
                      <button
                        type="button"
                        className={styles.proProfileDangerButton}
                        onClick={() => setPhotos((current) => {
                          const next = current.filter((_, itemIndex) => itemIndex !== index);
                          if (next.length > 0 && !next.some((item) => item.isPrimary)) {
                            next[0] = { ...next[0], isPrimary: true };
                          }
                          return next;
                        })}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
                <label className={styles.proProfileGalleryAddCard}>
                  <ImagePlus size={22} />
                  <span>{isUploadingGallery ? "Uploading..." : "Add photos"}</span>
                  <small>Up to {formatGalleryImageUploadLimitLabel()}</small>
                  <input type="file" hidden multiple accept="image/*,.heic,.heif" onChange={(event) => void handleGalleryUpload(event)} />
                </label>
              </div>
            </section>

            <section className={styles.proProfileSectionCard}>
              <div className={styles.proProfileSectionLabel}>Host reel</div>
              <div className={styles.proProfileFieldGrid}>
                <div className={styles.proProfileFieldWide}>
                  <label className={styles.proProfileFieldLabel}>Public host reel</label>
                  <div className={styles.proProfileInlineControl} style={{ alignItems: "stretch" }}>
                    <div style={{ flex: 1, minWidth: 0, borderRadius: 20, border: "1px solid rgba(148, 163, 184, 0.18)", background: "rgba(15, 23, 42, 0.58)", padding: 16 }}>
                      {hostReelUrl ? (
                        <video src={hostReelUrl} controls playsInline preload="metadata" style={{ width: "100%", borderRadius: 16, maxHeight: 280, background: "#020617" }} />
                      ) : (
                        <div style={{ display: "grid", placeItems: "center", minHeight: 180, color: "rgba(226, 232, 240, 0.72)", textAlign: "center", gap: 10 }}>
                          <Video size={28} />
                          <span>No reel uploaded yet. Add one to connect the Pro profile to the existing public host reel.</span>
                        </div>
                      )}
                      <div style={{ marginTop: 12, fontSize: 12, color: "rgba(226, 232, 240, 0.68)" }}>
                        {isUploadingReel
                          ? `Uploading reel ${reelUploadProgress}%`
                          : listing.hostReelUploadedAt
                            ? `Saved ${new Date(listing.hostReelUploadedAt).toLocaleDateString("en-IN")}`
                            : "Uses the existing property reel upload path and public profile media source."}
                      </div>
                    </div>
                    <label className={styles.proProfileGhostButton} style={{ alignSelf: "flex-start" }}>
                      {isUploadingReel ? <><Loader2 size={16} className="animate-spin" /> Uploading...</> : hostReelUrl ? "Replace reel" : "Upload reel"}
                      <input type="file" hidden accept={HOST_REEL_ACCEPT_ATTRIBUTE} onChange={(event) => void handleReelUpload(event)} />
                    </label>
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.proProfileSectionCard}>
              <div className={styles.proProfileSectionLabel}>Story and listing details</div>
              <div className={styles.proProfileFieldGrid}>
                <div className={styles.proProfileFieldWide}>
                  <label className={styles.proProfileFieldLabel}>Public listing title</label>
                  <input className={styles.proProfileInput} value={listing.listingTitle} onChange={(event) => setListing((current) => ({ ...current, listingTitle: event.target.value }))} />
                </div>
                <div className={styles.proProfileFieldWide}>
                  <label className={styles.proProfileFieldLabel}>My journey</label>
                  <textarea className={styles.proProfileTextarea} value={listing.journeyStory} onChange={(event) => setListing((current) => ({ ...current, journeyStory: event.target.value }))} />
                </div>
                <div className={styles.proProfileFieldWide}>
                  <label className={styles.proProfileFieldLabel}>My special place</label>
                  <textarea className={styles.proProfileTextarea} value={listing.specialExperience} onChange={(event) => setListing((current) => ({ ...current, specialExperience: event.target.value }))} />
                </div>
                <div className={styles.proProfileFieldWide}>
                  <label className={styles.proProfileFieldLabel}>My local experience</label>
                  <textarea className={styles.proProfileTextarea} value={listing.localExperience} onChange={(event) => setListing((current) => ({ ...current, localExperience: event.target.value }))} />
                </div>
                <div className={styles.proProfileFieldWide}>
                  <label className={styles.proProfileFieldLabel}>Cultural offering</label>
                  <textarea className={styles.proProfileTextarea} value={listing.culturalOffering} onChange={(event) => setListing((current) => ({ ...current, culturalOffering: event.target.value }))} />
                </div>
                <div className={styles.proProfileField}>
                  <label className={styles.proProfileFieldLabel}>Home type</label>
                  <select className={styles.proProfileInput} value={listing.houseType} onChange={(event) => setListing((current) => ({ ...current, houseType: event.target.value }))}>
                    <option value="">Select home type</option>
                    {HOME_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div className={styles.proProfileField}>
                  <label className={styles.proProfileFieldLabel}>Interaction type</label>
                  <select className={styles.proProfileInput} value={listing.interactionType} onChange={(event) => setListing((current) => ({ ...current, interactionType: event.target.value }))}>
                    <option value="">Select interaction type</option>
                    {INTERACTION_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div className={styles.proProfileField}>
                  <label className={styles.proProfileFieldLabel}>Bathroom type</label>
                  <select className={styles.proProfileInput} value={listing.bathroomType} onChange={(event) => setListing((current) => ({ ...current, bathroomType: event.target.value }))}>
                    <option value="">Select bathroom type</option>
                    {BATHROOM_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div className={styles.proProfileField}>
                  <label className={styles.proProfileFieldLabel}>Check-in time</label>
                  <input className={styles.proProfileInput} value={listing.checkInTime} onChange={(event) => setListing((current) => ({ ...current, checkInTime: event.target.value }))} />
                </div>
                <div className={styles.proProfileField}>
                  <label className={styles.proProfileFieldLabel}>Check-out time</label>
                  <input className={styles.proProfileInput} value={listing.checkOutTime} onChange={(event) => setListing((current) => ({ ...current, checkOutTime: event.target.value }))} />
                </div>
                <div className={styles.proProfileFieldWide}>
                  <label className={styles.proProfileFieldLabel}>House rules</label>
                  <div className={styles.proProfileChipGroup}>
                    {HOUSE_RULE_OPTIONS.map((option) => {
                      const active = selectedHouseRules.some((item) => item.toLowerCase() === option.toLowerCase());
                      return (
                        <button key={option} type="button" className={`${styles.proProfileChip} ${active ? styles.proProfileChipActive : ""}`} onClick={() => updateHouseRules(toggleListValue(selectedHouseRules, option))}>
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  <textarea className={styles.proProfileTextarea} value={listing.houseRules} onChange={(event) => setListing((current) => ({ ...current, houseRules: event.target.value }))} />
                  <div className={styles.proProfileInlineControl}>
                    <input className={styles.proProfileInput} placeholder="Add a custom house rule" value={customHouseRule} onChange={(event) => setCustomHouseRule(event.target.value)} />
                    <button
                      type="button"
                      className={styles.proProfileGhostButton}
                      onClick={() => {
                        const next = customHouseRule.trim();
                        if (!next) return;
                        updateHouseRules(toggleListValue(selectedHouseRules, next));
                        setCustomHouseRule("");
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
                <div className={styles.proProfileFieldWide}>
                  <label className={styles.proProfileFieldLabel}>Amenities</label>
                  <div className={styles.proProfileChipGroup}>
                    {AMENITY_OPTIONS.map((option) => {
                      const active = selectedAmenities.some((item) => item.toLowerCase() === option.toLowerCase());
                      return (
                        <button key={option} type="button" className={`${styles.proProfileChip} ${active ? styles.proProfileChipActive : ""}`} onClick={() => updateAmenities(toggleListValue(selectedAmenities, option))}>
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  <div className={styles.proProfileInlineControl}>
                    <input className={styles.proProfileInput} placeholder="Add a custom amenity" value={customAmenity} onChange={(event) => setCustomAmenity(event.target.value)} />
                    <button
                      type="button"
                      className={styles.proProfileGhostButton}
                      onClick={() => {
                        const next = customAmenity.trim();
                        if (!next) return;
                        updateAmenities(toggleListValue(selectedAmenities, next));
                        setCustomAmenity("");
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
                <div className={styles.proProfileFieldWide}>
                  <label className={styles.proProfileFieldLabel}>Food type</label>
                  <div className={styles.proProfileChipGroup}>
                    {FOOD_OFFERING_OPTIONS.map((option) => {
                      const active = selectedFoodTypes.some((item) => item.toLowerCase() === option.toLowerCase());
                      return (
                        <button key={option} type="button" className={`${styles.proProfileChip} ${active ? styles.proProfileChipActive : ""}`} onClick={() => updateFoodTypes(toggleListValue(selectedFoodTypes, option))}>
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  <div className={styles.proProfileInlineControl}>
                    <input className={styles.proProfileInput} placeholder="Add a custom food type" value={customFoodType} onChange={(event) => setCustomFoodType(event.target.value)} />
                    <button
                      type="button"
                      className={styles.proProfileGhostButton}
                      onClick={() => {
                        const next = customFoodType.trim();
                        if (!next) return;
                        updateFoodTypes(toggleListValue(selectedFoodTypes, next));
                        setCustomFoodType("");
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
                <div className={styles.proProfileFieldWide}>
                  <label className={styles.proProfileFieldLabel}>Included items</label>
                  <textarea className={styles.proProfileTextarea} value={listing.includedItems} onChange={(event) => setListing((current) => ({ ...current, includedItems: event.target.value }))} />
                  <div className={styles.proProfileInlineControl}>
                    <input className={styles.proProfileInput} placeholder="Add a custom included item" value={customIncludedItem} onChange={(event) => setCustomIncludedItem(event.target.value)} />
                    <button
                      type="button"
                      className={styles.proProfileGhostButton}
                      onClick={() => {
                        const next = customIncludedItem.trim();
                        if (!next) return;
                        updateIncludedItems(toggleListValue(selectedIncludedItems, next));
                        setCustomIncludedItem("");
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <datalist id="famlo-pro-city-list">
            {locations.cities.map((item) => <option key={item} value={item} />)}
          </datalist>
          <datalist id="famlo-pro-state-list">
            {locations.states.map((item) => <option key={item} value={item} />)}
          </datalist>
          <datalist id="famlo-pro-village-list">
            {locations.villages.map((item) => <option key={item} value={item} />)}
          </datalist>
        </div>
      ) : null}
    </section>
  );
}
