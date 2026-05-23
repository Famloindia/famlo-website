"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../dashboard.module.css";
import type { PhotoItem } from "../HostDashboardEditor";
import type { FamilyListingDraft } from "@/lib/family-profile-editor";
import { ImagePlus, MapPin } from "lucide-react";
import {
  MAX_GALLERY_IMAGE_UPLOAD_BYTES,
  formatGalleryImageUploadLimitLabel,
} from "@/lib/upload-limits";
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

export default function PropertyContentManager({
  familyId,
  listing,
  setListing,
  photos,
  setPhotos,
  onSave,
  saving,
}: Readonly<{
  familyId: string;
  listing: PropertyListingState;
  setListing: (value: React.SetStateAction<PropertyListingState>) => void;
  photos: PhotoItem[];
  setPhotos: (value: React.SetStateAction<PhotoItem[]>) => void;
  onSave: (options: { updatedListing: PropertyListingState; updatedPhotos: PhotoItem[] }) => Promise<void> | void;
  saving: boolean;
}>): React.JSX.Element {
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [customAmenity, setCustomAmenity] = useState("");
  const [customIncludedItem, setCustomIncludedItem] = useState("");
  const [customFoodType, setCustomFoodType] = useState("");
  const [customHouseRule, setCustomHouseRule] = useState("");
  const [locations, setLocations] = useState<{ states: string[]; cities: string[]; villages: string[] }>({
    states: [],
    cities: [],
    villages: [],
  });
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/locations/search")
      .then((res) => res.json())
      .then((data) => setLocations(data))
      .catch(console.error);
  }, []);

  const readUploadResponse = async (response: Response) => {
    const raw = await response.text();
    try {
      const json = JSON.parse(raw) as { error?: string; url?: string };
      return {
        url: typeof json.url === "string" ? json.url : null,
        error: typeof json.error === "string" ? json.error : null,
      };
    } catch {
      const trimmed = raw.trim();
      if (/request entity too large/i.test(trimmed)) {
        return { url: null, error: `Image must be ${formatGalleryImageUploadLimitLabel()} or smaller.` };
      }
      return { url: null, error: trimmed || "Upload failed." };
    }
  };

  const uploadFileToR2 = async (file: File, folder: string) => {
    const lowerName = file.name.toLowerCase();
    const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/.test(lowerName);
    if (!isImage) {
      throw new Error("Please upload an image file.");
    }
    if (file.size > MAX_GALLERY_IMAGE_UPLOAD_BYTES) {
      throw new Error(`Image must be ${formatGalleryImageUploadLimitLabel()} or smaller.`);
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    const res = await fetch("/api/onboarding/home/upload", {
      method: "POST",
      body: formData,
    });

    const payload = await readUploadResponse(res);
    if (!res.ok || !payload.url) {
      throw new Error(payload.error || "Upload failed");
    }
    return payload.url;
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setUploadingGallery(true);
    setUploadError(null);
    try {
      const newPhotos = [...photos];
      for (const file of Array.from(e.target.files)) {
        const url = await uploadFileToR2(file, "galleries");
        if (url) {
          newPhotos.push({ id: `photo-${Date.now()}-${Math.random()}`, url, isPrimary: newPhotos.length === 0 });
        }
      }
      setPhotos(newPhotos);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload gallery photos.";
      setUploadError(message);
      alert(message);
    } finally {
      setUploadingGallery(false);
    }
  };

  const handleReplacePhoto = async (e: React.ChangeEvent<HTMLInputElement>, photoIndex: number) => {
    if (!e.target.files?.[0]) return;
    try {
      setUploadingGallery(true);
      setUploadError(null);
      const url = await uploadFileToR2(e.target.files[0], "galleries");
      if (!url) return;

      setPhotos((current) =>
        current.map((photo, index) =>
          index === photoIndex
            ? { ...photo, url }
            : photo
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to replace listing image.";
      setUploadError(message);
      alert(message);
    } finally {
      setUploadingGallery(false);
      e.target.value = "";
    }
  };

  const handleSetPrimaryPhoto = (photoIndex: number) => {
    setPhotos((current) =>
      current.map((photo, index) => ({
        ...photo,
        isPrimary: index === photoIndex,
      }))
    );
  };

  const handleRemovePhoto = (photoIndex: number) => {
    setPhotos((current) => {
      const next = current.filter((_, index) => index !== photoIndex);
      if (next.length > 0 && !next.some((photo) => photo.isPrimary)) {
        next[0] = { ...next[0], isPrimary: true };
      }
      return next;
    });
  };

  const detectLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = `${position.coords.latitude}, ${position.coords.longitude}`;
          setListing((current) => ({ ...current, googleMapsLink: `https://maps.google.com/?q=${coords}` }));
        },
        () => alert("Location access denied or failed. Please check browser settings.")
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

  const savePropertyContent = () => onSave({ updatedListing: listing, updatedPhotos: photos });

  return (
    <div className={`${styles.flexCol} ${styles.animateIn}`} style={{ gap: "32px" }}>
      <div className={styles.glassCard}>
        <h3 style={{ fontSize: "14px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "24px" }}>Host Gallery</h3>
        <p style={{ fontSize: "13px", color: "rgba(14,43,87,0.6)", marginBottom: "16px" }}>
          Manage the exact listing images guests see. Upload new photos, replace old ones, choose the cover image, and remove anything you no longer want live.
        </p>
        {uploadError ? (
          <div style={{ marginBottom: "12px", padding: "12px 14px", borderRadius: "12px", background: "#fef2f2", color: "#b91c1c", fontSize: "12px", fontWeight: 700 }}>
            {uploadError}
          </div>
        ) : null}
        {photos.length === 0 ? (
          <div style={{ marginBottom: "16px", padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px dashed rgba(14,43,87,0.18)", color: "#475569", fontSize: "12px", fontWeight: 700 }}>
            No gallery photos yet for property <code>{familyId}</code>. Add photos to shape how this property appears on Famlo.
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
                  onClick={() => handleSetPrimaryPhoto(i)}
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
                  onClick={() => handleRemovePhoto(i)}
                  style={{ border: "none", background: "#fee2e2", color: "#b91c1c", borderRadius: "10px", padding: "9px 12px", fontSize: "11px", fontWeight: 800, cursor: "pointer" }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          <label style={{ flexShrink: 0, width: "168px", minHeight: "220px", borderRadius: "18px", border: "2px dashed rgba(22,93,204,0.3)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "rgba(244,248,255,0.5)", color: "#165dcc", transition: "all 0.2s ease", padding: "16px", textAlign: "center" }}>
            <ImagePlus size={24} style={{ marginBottom: "4px" }} />
            <span style={{ fontSize: "12px", fontWeight: 800 }}>{uploadingGallery ? "Uploading..." : "Add photos"}</span>
            <span style={{ marginTop: "4px", fontSize: "10px", fontWeight: 800, color: "rgba(22,93,204,0.7)" }}>Up to {formatGalleryImageUploadLimitLabel()}</span>
            <input type="file" multiple style={{ display: "none" }} accept="image/*,.heic,.heif" onChange={handleGalleryUpload} />
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
              <button className={styles.primaryBtn} onClick={detectLocation} style={{ width: "auto", background: "#ecfdf5", color: "#059669", border: "1px solid #10b981" }}>
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
