"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ChevronDown, MapPin, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";

import { ROOM_AMENITY_GROUPS } from "@/lib/room-amenities";
import styles from "../../onboarding.module.css";
import { formatGalleryImageUploadLimitLabel } from "@/lib/upload-limits";

const LANGUAGE_OPTIONS = ["English", "Hindi", "Marwari", "Rajasthani", "Gujarati", "Punjabi", "Marathi", "Tamil", "Telugu"];
const HOUSE_TYPES = ["Joint family", "Nuclear family", "Couple", "Solo host", "Shared household"];
const INTERACTION_TYPES = ["Friendly and available", "Extrovert", "Introvert", "Quiet and helpful", "Highly social", "Flexible"];
const HOBBIES = ["Cooking", "Music", "Gardening", "Reading", "Yoga", "Art", "Travel", "Dance", "Photography"];
const INCLUDED_OPTIONS = ["Breakfast", "Tea / coffee", "Home-cooked meals", "Local guide tips", "Pickup help", "Filtered water", "WiFi"];
const COMMON_AREA_OPTIONS = ["Living room", "Dining area", "Terrace", "Garden", "Balcony", "Courtyard", "Kitchen access"];
const DEFAULT_ROOM_AMENITIES = [ROOM_AMENITY_GROUPS.mustShow[0], ROOM_AMENITY_GROUPS.mustShow[1]];

type Room = {
  id: string;
  roomName: string;
  roomType: string;
  maxGuests: string;
  bedConfiguration: string;
  roomConfiguration: string;
  balcony: string;
  roomVibe: string;
  roomAmenities: string[];
  customSecondaryAmenities: string[];
  customExperienceHighlights: string[];
  roomPhotos: string[];
  lat: string;
  lng: string;
  standardPrice: string;
  lowDemandPrice: string;
  highDemandPrice: string;
  smartPricingEnabled: boolean;
};

function createDefaultRoom(roomName = "Primary room"): Room {
  return {
    id: crypto.randomUUID(),
    roomName,
    roomType: "Private room",
    maxGuests: "2",
    bedConfiguration: "",
    roomConfiguration: "",
    balcony: "",
    roomVibe: "",
    roomAmenities: DEFAULT_ROOM_AMENITIES,
    customSecondaryAmenities: [],
    customExperienceHighlights: [],
    roomPhotos: [],
    lat: "",
    lng: "",
    standardPrice: "",
    lowDemandPrice: "",
    highDemandPrice: "",
    smartPricingEnabled: false,
  };
}

function getRooms(value: unknown): Room[] {
  if (!Array.isArray(value) || value.length === 0) return [createDefaultRoom("Primary room")];

  const usedIds = new Set<string>();
  return value.map((room, index) => {
    const raw = room as Partial<Room>;
    const rawRecord = room as Record<string, unknown>;
    const rawId = typeof raw.id === "string" ? raw.id.trim() : "";
    const nextId = rawId && !usedIds.has(rawId) ? rawId : crypto.randomUUID();
    usedIds.add(nextId);

    return {
      ...createDefaultRoom(`Room ${index + 1}`),
      ...(room as Partial<Room>),
      id: nextId,
      roomName: typeof raw.roomName === "string" ? String(raw.roomName) : `Room ${index + 1}`,
      roomAmenities: Array.isArray(raw.roomAmenities) ? (raw.roomAmenities as string[]) : DEFAULT_ROOM_AMENITIES,
      customSecondaryAmenities: Array.isArray(raw.customSecondaryAmenities) ? (raw.customSecondaryAmenities as string[]) : [],
      customExperienceHighlights: Array.isArray(raw.customExperienceHighlights) ? (raw.customExperienceHighlights as string[]) : [],
      roomPhotos: Array.isArray(raw.roomPhotos) ? (raw.roomPhotos as string[]) : [],
      lat: typeof rawRecord.lat === "string" || typeof rawRecord.lat === "number" ? String(rawRecord.lat) : "",
      lng: typeof rawRecord.lng === "string" || typeof rawRecord.lng === "number" ? String(rawRecord.lng) : "",
      balcony: typeof raw.balcony === "string" ? String(raw.balcony) : "",
    };
  });
}

function normalizeNearbyPlaces(value: unknown): Array<{ id: string; name: string; distance: string; unit: string }> {
  const raw = Array.isArray(value) ? value : [];
  return raw.map((place: any, index: number) => ({
    id: typeof place?.id === "string" ? place.id : `place-${index}-${place?.name || "item"}`,
    name: String(place?.name ?? ""),
    distance: String(place?.distance ?? ""),
    unit: place?.unit === "m" ? "m" : "km",
  }));
}

async function uploadFiles(files: File[], folder: string): Promise<string[]> {
  const results: string[] = [];
  for (const file of files) {
    const lowerName = file.name.toLowerCase();
    const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/.test(lowerName);
    if (!isImage) {
      throw new Error("Please upload image files only.");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    const res = await fetch("/api/onboarding/home/upload", { method: "POST", body: formData });
    const raw = await res.text();
    let payload: { url?: string; error?: string } = {};

    try {
      payload = JSON.parse(raw) as { url?: string; error?: string };
    } catch {
      payload = { error: raw.trim() };
    }

    if (!res.ok || !payload.url) {
      throw new Error(payload.error || "Upload failed.");
    }

    results.push(payload.url);
  }

  return results;
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function toggleExclusiveValue(values: string[], value: string, exclusiveValue = "None"): string[] {
  if (value === exclusiveValue) {
    return values.includes(exclusiveValue) ? [] : [exclusiveValue];
  }

  return toggleValue(values.filter((item) => item !== exclusiveValue), value);
}

function addUniqueValue(values: string[], value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return values;
  if (values.some((item) => item.toLowerCase() === trimmed.toLowerCase())) return values;
  return [...values, trimmed];
}

function promptForCustomValue(message: string): string | null {
  if (typeof window === "undefined") return null;
  const value = window.prompt(message);
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export default function Step2Story({ data, update }: any) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const hostGalleryInputRef = useRef<HTMLInputElement | null>(null);
  const roomPhotoInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [includedDraft, setIncludedDraft] = useState("");

  const hostGalleryPhotos: string[] = useMemo(() => (Array.isArray(data.hostGalleryPhotos) ? data.hostGalleryPhotos : []), [data.hostGalleryPhotos]);
  const rooms: Room[] = useMemo(() => getRooms(data.rooms), [data.rooms]);
  const customHobby = String(data.customHobby ?? "");
  const nearbyPlaces = useMemo(() => normalizeNearbyPlaces(data.nearbyPlaces), [data.nearbyPlaces]);
  const commonAreas: string[] = useMemo(() => (Array.isArray(data.commonAreas) ? data.commonAreas : []), [data.commonAreas]);
  const commonAreaDraft = String(data.commonAreaDraft ?? "");
  const customIncludedItems = useMemo(
    () => (Array.isArray(data.includedHighlights) ? data.includedHighlights.filter((item: string) => !INCLUDED_OPTIONS.includes(item) && item !== "None") : []),
    [data.includedHighlights]
  );
  const customCommonAreas = useMemo(
    () => commonAreas.filter((item: string) => !COMMON_AREA_OPTIONS.includes(item) && item !== "None"),
    [commonAreas]
  );
  const customLanguages: string[] = useMemo(() => {
    const savedCustomLanguages = Array.isArray(data.customLanguages) ? data.customLanguages : [];
    if (savedCustomLanguages.length > 0) {
      return savedCustomLanguages;
    }
    return Array.isArray(data.languagesSpoken)
      ? data.languagesSpoken.filter((language: string) => !LANGUAGE_OPTIONS.includes(language))
      : [];
  }, [data.customLanguages, data.languagesSpoken]);
  const customHobbies = useMemo(
    () => (Array.isArray(data.hobbies) ? data.hobbies.filter((item: string) => !HOBBIES.includes(item)) : []),
    [data.hobbies]
  );

  useEffect(() => {
    const hasRoomIds = Array.isArray(data.rooms) && data.rooms.some((room: any) => typeof room?.id !== "string");
    if (hasRoomIds) {
      update(
        "rooms",
        getRooms(data.rooms).map((room, index) => ({
          ...room,
          id: typeof room.id === "string" ? room.id : `room-${index}-${room.roomName || "item"}`,
        }))
      );
    }
  }, [data.rooms, update]);

  useEffect(() => {
    const hasPlaceIds = Array.isArray(data.nearbyPlaces) && data.nearbyPlaces.some((place: any) => typeof place?.id !== "string");
    if (hasPlaceIds) {
      update("nearbyPlaces", normalizeNearbyPlaces(data.nearbyPlaces).map((place, index) => ({
        ...place,
        id: typeof place.id === "string" ? place.id : `place-${index}-${place.name || "item"}`,
      })));
    }
  }, [data.nearbyPlaces, update]);

  const updateRoom = (index: number, field: keyof Room, value: string | string[] | boolean) => {
    updateRoomFields(index, { [field]: value } as Partial<Room>);
  };

  const updateRoomFields = (index: number, patch: Partial<Room>) => {
    const next = [...rooms];
    next[index] = { ...next[index], ...patch } as Room;
    update("rooms", next);
  };

  const addRoom = () => {
    update("rooms", [
      ...rooms,
      {
        ...createDefaultRoom(`Room ${rooms.length + 1}`),
        lat: String(data.latitude ?? ""),
        lng: String(data.longitude ?? ""),
      },
    ]);
  };

  const setRoomLocationFromHome = (index: number) => {
    updateRoomFields(index, {
      lat: String(data.latitude ?? ""),
      lng: String(data.longitude ?? ""),
    });
  };

  const detectRoomLocation = (index: number) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setUploadError("Auto location is not available in this browser.");
      return;
    }

    setUploadError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateRoomFields(index, {
          lat: String(position.coords.latitude),
          lng: String(position.coords.longitude),
        });
      },
      () => setUploadError("Could not detect room location. Please allow location access or enter it manually."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const removeRoom = (index: number) => {
    const next = rooms.filter((_, roomIndex) => roomIndex !== index);
    update("rooms", next.length > 0 ? next : [createDefaultRoom("Primary room")]);
  };

  const handleHostGalleryUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    setUploadError(null);
    setUploading("host-gallery");

    try {
      const urls = await uploadFiles(files, "host-gallery");
      update("hostGalleryPhotos", [...hostGalleryPhotos, ...urls].slice(0, 12));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Host gallery upload failed.");
    } finally {
      setUploading(null);
      event.target.value = "";
    }
  };

  const handleRemoveHostGalleryPhoto = (removeIndex: number) => {
    update("hostGalleryPhotos", hostGalleryPhotos.filter((_, index) => index !== removeIndex));
  };

  const handleRemoveRoomPhoto = (roomIndex: number, photoIndex: number) => {
    const next = [...rooms];
    next[roomIndex] = {
      ...next[roomIndex],
      roomPhotos: next[roomIndex].roomPhotos.filter((_, index) => index !== photoIndex),
    };
    update("rooms", next);
  };

  const handleRoomPhotosUpload = async (event: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    setUploadError(null);
    setUploading(`room-${index}`);

    try {
      const urls = await uploadFiles(files, "room-photos");
      const nextPhotos = [...(rooms[index].roomPhotos ?? []), ...urls].slice(0, 12);
      updateRoom(index, "roomPhotos", nextPhotos);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Room photo upload failed.");
    } finally {
      setUploading(null);
      event.target.value = "";
    }
  };

  const addCustomHobby = () => {
    const value = customHobby.trim();
    if (!value) return;
    const currentHobbies = Array.isArray(data.hobbies) ? data.hobbies : [];
    if (!currentHobbies.some((item: string) => String(item).toLowerCase() === value.toLowerCase())) {
      update("hobbies", [...currentHobbies, value]);
    }
    update("customHobby", "");
  };

  const addCustomIncludedItem = () => {
    const value = includedDraft.trim();
    if (!value) return;
    const currentIncluded = Array.isArray(data.includedHighlights) ? data.includedHighlights : [];
    if (!currentIncluded.some((item: string) => String(item).toLowerCase() === value.toLowerCase())) {
      update("includedHighlights", [...currentIncluded.filter((item: string) => item !== "None"), value]);
    }
    setIncludedDraft("");
  };

  const addCustomLanguage = () => {
    const value = promptForCustomValue("Add a custom language you speak");
    if (!value) return;
    const currentLanguages = Array.isArray(data.languagesSpoken) ? data.languagesSpoken : [];
    const nextLanguages = addUniqueValue(currentLanguages, value);
    update("languagesSpoken", nextLanguages);
    update("customLanguages", nextLanguages.filter((language) => !LANGUAGE_OPTIONS.includes(language)));
  };

  const removeCustomLanguage = (language: string) => {
    const currentLanguages = Array.isArray(data.languagesSpoken) ? data.languagesSpoken : [];
    const nextLanguages = currentLanguages.filter((item: string) => item !== language);
    update("languagesSpoken", nextLanguages);
    update("customLanguages", nextLanguages.filter((item: string) => !LANGUAGE_OPTIONS.includes(item)));
  };

  const addCustomRoomAmenity = (index: number, section: "customSecondaryAmenities" | "customExperienceHighlights") => {
    const value = promptForCustomValue(
      section === "customSecondaryAmenities"
        ? "Add a custom secondary amenity"
        : "Add a custom experience highlight"
    );
    if (!value) return;

    const room = rooms[index];
    const customValues = Array.isArray(room[section]) ? room[section] : [];
    const nextCustomValues = addUniqueValue(customValues, value);
    const nextRoomAmenities = addUniqueValue(room.roomAmenities, value);

    updateRoomFields(index, {
      [section]: nextCustomValues,
      roomAmenities: nextRoomAmenities,
    } as Partial<Room>);
  };

  const removeCustomRoomAmenity = (
    index: number,
    section: "customSecondaryAmenities" | "customExperienceHighlights",
    value: string
  ) => {
    const room = rooms[index];
    const nextCustomValues = (Array.isArray(room[section]) ? room[section] : []).filter(
      (item: string) => item !== value
    );
    updateRoomFields(index, {
      [section]: nextCustomValues,
      roomAmenities: room.roomAmenities.filter((item) => item !== value),
    } as Partial<Room>);
  };

  return (
    <div className={styles.animateIn}>
      <div className={styles.onboardingHeader}>
        <span className={styles.eyebrow} style={{ color: "#0f766e" }}>Profile and rooms</span>
        <h1>Shape the story guests will see.</h1>
        <p>Keep the host identity from step 1, then build the public page with story, style, and room details.</p>
      </div>

      <div className={styles.formGrid}>
        <section className={`${styles.formGroup} ${styles.fullWidth} ${styles.panelSection}`}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Host profile</h2>
              <p>Use your verified photo, then add the name and story that should appear on the host page.</p>
            </div>
            <div className={styles.sectionPill}>From step 1</div>
          </div>

          <div className={styles.profileSummaryRow}>
            <div className={styles.profileAvatarWrap}>
              {data.hostPhoto ? (
                <img src={data.hostPhoto} alt="Host profile" className={styles.profileAvatar} />
              ) : (
                <div className={styles.profileAvatarFallback}>
                  <Camera size={20} />
                </div>
              )}
            </div>

            <div className={styles.profileSummaryText}>
              <label>Host name</label>
              <input
                className={styles.inputField}
                value={data.hostName || data.fullName || ""}
                onChange={(event) => update("hostName", event.target.value)}
                placeholder="Displayed host name"
              />
              <div className={styles.helperText}>We automatically carry this forward from step 1, but you can fine-tune the display name here.</div>
            </div>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Your journey</label>
              <textarea
                className={`${styles.inputField} ${styles.textArea}`}
                value={data.journeyStory}
                onChange={(event) => update("journeyStory", event.target.value)}
                placeholder="Describe your journey in Jodhpur and what brings people into your home..."
              />
            </div>
            <div className={styles.formGroup}>
              <label>What makes your place special</label>
              <textarea
                className={`${styles.inputField} ${styles.textArea}`}
                value={data.specialExperience}
                onChange={(event) => update("specialExperience", event.target.value)}
                placeholder="Local experience, warmth, food, views, family traditions, or anything memorable..."
              />
            </div>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label>What local experience can you share?</label>
              <textarea
                className={`${styles.inputField} ${styles.textArea}`}
                value={data.localExperience}
                onChange={(event) => update("localExperience", event.target.value)}
                placeholder="City walks, cooking, village visits, cultural evenings, or something unique..."
              />
            </div>
          </div>
        </section>

        <section className={`${styles.formGroup} ${styles.fullWidth} ${styles.panelSection}`}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Style tags</h2>
              <p>Pick the tags that best describe your home and your hosting style.</p>
            </div>
            <div className={styles.sectionPill}>Public profile</div>
          </div>

          <div className={styles.chipSection}>
            <div className={styles.chipGroupTitle}>Languages you speak</div>
            <div className={styles.chipRow}>
              {LANGUAGE_OPTIONS.map((language) => {
                const active = (data.languagesSpoken ?? []).includes(language);
                return (
                  <button
                    key={language}
                    type="button"
                    className={`${styles.chipButton} ${active ? styles.chipButtonActive : ""}`}
                    onClick={() => update("languagesSpoken", toggleValue(data.languagesSpoken ?? [], language))}
                  >
                    {language}
                  </button>
                );
              })}
              <button type="button" className={styles.secondaryMiniBtn} onClick={addCustomLanguage}>
                <Plus size={14} />
                Add custom language
              </button>
            </div>
            {customLanguages.length > 0 ? (
              <div className={styles.chipRow} style={{ marginTop: "14px" }}>
                {customLanguages.map((language: string, index: number) => (
                  <button
                    key={`${language}-${index}`}
                    type="button"
                    className={`${styles.chipButton} ${styles.chipButtonActive}`}
                    onClick={() => removeCustomLanguage(language)}
                    title="Remove custom language"
                  >
                    {language} <X size={12} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className={styles.choiceGrid}>
            <label>
              <span>House type</span>
              <select className={styles.inputField} value={data.houseType} onChange={(event) => update("houseType", event.target.value)}>
                {HOUSE_TYPES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Interaction style</span>
              <select className={styles.inputField} value={data.interactionType} onChange={(event) => update("interactionType", event.target.value)}>
                {INTERACTION_TYPES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Check-in time</span>
              <input className={styles.inputField} type="time" value={data.checkInTime} onChange={(event) => update("checkInTime", event.target.value)} />
            </label>
            <label>
              <span>Check-out time</span>
              <input className={styles.inputField} type="time" value={data.checkOutTime} onChange={(event) => update("checkOutTime", event.target.value)} />
            </label>
            </div>

          <div className={styles.chipSection}>
            <div className={styles.chipGroupTitle}>Hobbies and interests</div>
            <div className={styles.chipRow}>
              {HOBBIES.map((hobby) => {
                const active = (data.hobbies ?? []).includes(hobby);
                return (
                  <button
                    key={hobby}
                    type="button"
                    className={`${styles.chipButton} ${active ? styles.chipButtonActive : ""}`}
                    onClick={() => update("hobbies", toggleValue(data.hobbies ?? [], hobby))}
                  >
                    {hobby}
                  </button>
                );
              })}
            </div>

            <div className={styles.inlineAddRow}>
              <input
                className={styles.inputField}
                value={customHobby}
                onChange={(event) => update("customHobby", event.target.value)}
                placeholder="Add a custom hobby"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomHobby();
                  }
                }}
              />
              <button
                type="button"
                className={styles.secondaryMiniBtn}
                onClick={addCustomHobby}
              >
                <Plus size={14} />
                Save hobby
              </button>
            </div>

            {customHobbies.length > 0 ? (
              <div className={styles.chipRow} style={{ marginTop: "14px" }}>
                {customHobbies.map((hobby: string, index: number) => (
                  <button
                    key={`${hobby}-${index}`}
                    type="button"
                    className={`${styles.chipButton} ${styles.chipButtonActive}`}
                    onClick={() => update("hobbies", (Array.isArray(data.hobbies) ? data.hobbies : []).filter((item: string) => item !== hobby))}
                    title="Remove custom hobby"
                  >
                    {hobby} <X size={12} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className={`${styles.formGroup} ${styles.fullWidth} ${styles.panelSection}`}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>What guests will get</h2>
              <p>Add the included items, nearby places, host gallery, and house rules that help guests picture the stay.</p>
            </div>
            <div className={styles.sectionPill}>Guest view</div>
          </div>

          <div className={styles.chipSection}>
            <div className={styles.chipGroupTitle}>Included items</div>
            <div className={styles.chipRow}>
              {INCLUDED_OPTIONS.map((item) => {
                const active = (data.includedHighlights ?? []).includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    className={`${styles.chipButton} ${active ? styles.chipButtonActive : ""}`}
                    onClick={() => update("includedHighlights", toggleExclusiveValue(data.includedHighlights ?? [], item))}
                  >
                    {item}
                    </button>
                  );
                })}
              <button
                type="button"
                className={`${styles.chipButton} ${(data.includedHighlights ?? []).includes("None") ? styles.chipButtonActive : ""}`}
                onClick={() => update("includedHighlights", toggleExclusiveValue(data.includedHighlights ?? [], "None"))}
              >
                None
              </button>
            </div>
            <div className={styles.inlineAddRow} style={{ marginTop: "12px" }}>
              <input
                className={styles.inputField}
                value={includedDraft}
                onChange={(event) => setIncludedDraft(event.target.value)}
                placeholder="Add a custom included item"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomIncludedItem();
                  }
                }}
              />
              <button type="button" className={styles.secondaryMiniBtn} onClick={addCustomIncludedItem}>
                <Plus size={14} />
                Save item
              </button>
            </div>
            {customIncludedItems.length > 0 ? (
              <div className={styles.chipRow} style={{ marginTop: "14px" }}>
                {customIncludedItems.map((item: string, index: number) => (
                  <button
                    key={`${item}-${index}`}
                    type="button"
                    className={`${styles.chipButton} ${styles.chipButtonActive}`}
                    onClick={() => update("includedHighlights", (Array.isArray(data.includedHighlights) ? data.includedHighlights : []).filter((value: string) => value !== item))}
                    title="Remove custom included item"
                  >
                    {item} <X size={12} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className={styles.listEditor}>
            <div className={styles.chipGroupTitle}>Common area access</div>
            <div className={styles.chipRow}>
              {COMMON_AREA_OPTIONS.map((item) => {
                const active = commonAreas.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    className={`${styles.chipButton} ${active ? styles.chipButtonActive : ""}`}
                    onClick={() => update("commonAreas", toggleExclusiveValue(commonAreas, item))}
                  >
                    {item}
                    </button>
                  );
                })}
              <button
                type="button"
                className={`${styles.chipButton} ${commonAreas.includes("None") ? styles.chipButtonActive : ""}`}
                onClick={() => update("commonAreas", toggleExclusiveValue(commonAreas, "None"))}
              >
                None
              </button>
            </div>
            <div className={styles.inlineAddRow} style={{ marginTop: "12px" }}>
              <input
                className={styles.inputField}
                value={commonAreaDraft}
                onChange={(event) => update("commonAreaDraft", event.target.value)}
                placeholder="Add a custom common area"
              />
              <button
                type="button"
                className={styles.secondaryMiniBtn}
                onClick={() => {
                  const value = commonAreaDraft.trim();
                  if (!value) return;
                  const next = commonAreas.some((item) => item.toLowerCase() === value.toLowerCase())
                    ? commonAreas
                    : [...commonAreas, value];
                  update("commonAreas", next);
                  update("commonAreaDraft", "");
                }}
              >
                <Plus size={14} />
                Save area
              </button>
            </div>
            {customCommonAreas.length > 0 ? (
              <div className={styles.chipRow} style={{ marginTop: "14px" }}>
                {customCommonAreas.map((area: string, index: number) => (
                  <button
                    key={`${area}-${index}`}
                    type="button"
                    className={`${styles.chipButton} ${styles.chipButtonActive}`}
                    onClick={() => update("commonAreas", commonAreas.filter((value: string) => value !== area))}
                    title="Remove custom common area"
                  >
                    {area} <X size={12} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className={styles.listEditor}>
            <div className={styles.chipGroupTitle}>Nearby places</div>
            {nearbyPlaces.map((place, index: number) => (
              <div className={styles.listRow} key={place.id}>
                <input
                  className={styles.inputField}
                  value={place.name}
                  onChange={(event) => {
                    const next = [...nearbyPlaces];
                    next[index] = { ...next[index], name: event.target.value };
                    update("nearbyPlaces", next);
                  }}
                  placeholder="Place name"
                />
                <input
                  className={styles.inputField}
                  value={place.distance}
                  onChange={(event) => {
                    const next = [...nearbyPlaces];
                    next[index] = { ...next[index], distance: event.target.value };
                    update("nearbyPlaces", next);
                  }}
                  placeholder="Distance"
                />
                <select
                  className={styles.inputField}
                  value={place.unit}
                  onChange={(event) => {
                    const next = [...nearbyPlaces];
                    next[index] = { ...next[index], unit: event.target.value === "m" ? "m" : "km" };
                    update("nearbyPlaces", next);
                  }}
                >
                  <option value="m">m</option>
                  <option value="km">km</option>
                </select>
                <button
                  type="button"
                  className={styles.iconOnlyBtn}
                  onClick={() => {
                    const next = nearbyPlaces.filter((_: unknown, placeIndex: number) => placeIndex !== index);
                    update("nearbyPlaces", next.length > 0 ? next : [{ id: crypto.randomUUID(), name: "", distance: "", unit: "km" }]);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className={styles.secondaryMiniBtn}
              onClick={() => update("nearbyPlaces", [...nearbyPlaces, { id: crypto.randomUUID(), name: "", distance: "", unit: "km" }])}
            >
              <Plus size={14} />
              Add place
            </button>
          </div>

          <div className={styles.formGroup}>
            <label>House rules</label>
            <textarea
              className={`${styles.inputField} ${styles.textArea}`}
              value={data.houseRulesText}
              onChange={(event) => update("houseRulesText", event.target.value)}
              placeholder="Smoking, pets, quiet hours, kitchen access, shoes at the door, etc."
            />
          </div>

          <div className={styles.photoUploader}>
            <div className={styles.chipGroupTitle}>Host gallery</div>
            <div className={styles.photoUploadBar}>
              <button
                type="button"
                className={styles.primaryMiniBtn}
                onClick={() => hostGalleryInputRef.current?.click()}
              >
                <Upload size={14} />
                Add gallery photos
              </button>
              <input
                ref={hostGalleryInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                hidden
                onChange={(event) => void handleHostGalleryUpload(event)}
              />
              <div className={styles.helperText}>
                Show guests what a stay feels like, not just what the room looks like. Uploads up to {formatGalleryImageUploadLimitLabel()} are allowed.
              </div>
            </div>

            {uploading === "host-gallery" ? <div className={styles.uploadState}>Uploading gallery photos...</div> : null}
            {hostGalleryPhotos.length > 0 ? (
              <div className={styles.previewStrip}>
                {hostGalleryPhotos.map((photo, index) => (
                  <div key={`${photo}-${index}`} style={{ position: "relative", display: "inline-flex" }}>
                    <img src={photo} alt={`Host gallery ${index + 1}`} className={styles.previewThumb} />
                    <button
                      type="button"
                      aria-label={`Remove host gallery photo ${index + 1}`}
                      onClick={() => handleRemoveHostGalleryPhoto(index)}
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        width: 26,
                        height: 26,
                        borderRadius: 999,
                        border: "none",
                        background: "rgba(15, 23, 42, 0.82)",
                        color: "#fff",
                        cursor: "pointer",
                        display: "grid",
                        placeItems: "center",
                        zIndex: 2,
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className={`${styles.formGroup} ${styles.fullWidth} ${styles.panelSection}`}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Room setup</h2>
              <p>Describe each room so PMS and host profile pages can build room-level cards later.</p>
            </div>
            <div className={styles.sectionPill}>Room profile</div>
          </div>

          <div className={styles.roomStack}>
            {rooms.map((room, index) => (
              <div key={room.id} className={styles.roomCard}>
                <div className={styles.roomCardHeader}>
                  <div>
                    <div className={styles.roomCardTitle}>Room {index + 1}</div>
                    <div className={styles.roomCardSubtext}>Upload at least 5 room photos and complete the room fields.</div>
                  </div>
                  {rooms.length > 1 ? (
                    <button type="button" className={styles.iconOnlyBtn} onClick={() => removeRoom(index)}>
                      <X size={14} />
                    </button>
                  ) : null}
                </div>

                <div className={styles.choiceGrid}>
                  <label>
                    <span>Room name</span>
                    <input className={styles.inputField} value={room.roomName} onChange={(event) => updateRoom(index, "roomName", event.target.value)} placeholder="Primary room" />
                  </label>
                  <label>
                    <span>Room type</span>
                    <select className={styles.inputField} value={room.roomType} onChange={(event) => updateRoom(index, "roomType", event.target.value)}>
                      <option>Standard</option>
                      <option>Private room</option>
                      <option>Shared room</option>
                      <option>Luxury</option>
                      <option>Premium</option>
                    </select>
                  </label>
                  <label>
                    <span>Max guests</span>
                    <input className={styles.inputField} value={room.maxGuests} onChange={(event) => updateRoom(index, "maxGuests", event.target.value)} placeholder="2" />
                  </label>
                  <label>
                    <span>Bed configuration</span>
                    <input className={styles.inputField} value={room.bedConfiguration} onChange={(event) => updateRoom(index, "bedConfiguration", event.target.value)} placeholder="Queen bed" />
                  </label>
                </div>

                <div className={styles.choiceGrid}>
                  <label>
                    <span>Standard price</span>
                    <input className={styles.inputField} type="number" min="0" value={room.standardPrice} onChange={(event) => updateRoom(index, "standardPrice", event.target.value)} placeholder="2400" />
                  </label>
                  <label>
                    <span>Low demand price</span>
                    <input className={styles.inputField} type="number" min="0" value={room.lowDemandPrice} onChange={(event) => updateRoom(index, "lowDemandPrice", event.target.value)} placeholder="1800" />
                  </label>
                  <label>
                    <span>High demand price</span>
                    <input className={styles.inputField} type="number" min="0" value={room.highDemandPrice} onChange={(event) => updateRoom(index, "highDemandPrice", event.target.value)} placeholder="3200" />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px", paddingTop: "28px" }}>
                    <input type="checkbox" checked={Boolean(room.smartPricingEnabled)} onChange={(event) => updateRoom(index, "smartPricingEnabled", event.target.checked)} />
                    <span>Enable smart pricing</span>
                  </label>
                </div>

                <div className={styles.helperText} style={{ marginBottom: "12px" }}>
                  Smart pricing raises the price when demand is strong in this area and falls back to the standard price when demand is low.
                </div>

                <div className={styles.choiceGrid}>
                  <label>
                    <span>Room configuration</span>
                    <input className={styles.inputField} value={room.roomConfiguration} onChange={(event) => updateRoom(index, "roomConfiguration", event.target.value)} placeholder="Attached bath, balcony, work desk..." />
                  </label>
                  <label>
                    <span>Balcony</span>
                    <input className={styles.inputField} value={room.balcony} onChange={(event) => updateRoom(index, "balcony", event.target.value)} placeholder="Balcony, terrace, garden view..." />
                  </label>
                  <label>
                    <span>Room vibe</span>
                    <input className={styles.inputField} value={room.roomVibe} onChange={(event) => updateRoom(index, "roomVibe", event.target.value)} placeholder="Calm, colorful, heritage, premium..." />
                  </label>
                </div>

                <div className={styles.choiceGrid}>
                  <label>
                    <span>Room latitude</span>
                    <input className={styles.inputField} inputMode="decimal" value={room.lat} onChange={(event) => updateRoom(index, "lat", event.target.value)} placeholder="26.2389" />
                  </label>
                  <label>
                    <span>Room longitude</span>
                    <input className={styles.inputField} inputMode="decimal" value={room.lng} onChange={(event) => updateRoom(index, "lng", event.target.value)} placeholder="73.0243" />
                  </label>
                  <div style={{ display: "flex", gap: "10px", alignItems: "end", flexWrap: "wrap" }}>
                    <button type="button" className={styles.secondaryMiniBtn} onClick={() => setRoomLocationFromHome(index)} disabled={!data.latitude || !data.longitude}>
                      <MapPin size={14} />
                      Use home location
                    </button>
                    <button type="button" className={styles.secondaryMiniBtn} onClick={() => detectRoomLocation(index)}>
                      <MapPin size={14} />
                      Auto location
                    </button>
                  </div>
                </div>

                <div className={styles.chipSection}>
                  <div className={styles.chipGroupTitle}>Must show</div>
                  <div className={styles.chipRow}>
                    {ROOM_AMENITY_GROUPS.mustShow.map((amenity) => {
                      const active = room.roomAmenities.includes(amenity);
                      return (
                        <button
                          key={amenity}
                          type="button"
                          className={`${styles.chipButton} ${active ? styles.chipButtonActive : ""}`}
                          onClick={() => updateRoom(index, "roomAmenities", toggleValue(room.roomAmenities, amenity))}
                        >
                          {amenity}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <details className={styles.amenityDetails}>
                  <summary>
                    <span>Secondary amenities</span>
                    <ChevronDown size={14} />
                  </summary>
                  <div className={styles.chipRow}>
                    {ROOM_AMENITY_GROUPS.secondary.map((amenity) => {
                      const active = room.roomAmenities.includes(amenity);
                      return (
                        <button
                          key={amenity}
                          type="button"
                          className={`${styles.chipButton} ${active ? styles.chipButtonActive : ""}`}
                          onClick={() => updateRoom(index, "roomAmenities", toggleValue(room.roomAmenities, amenity))}
                        >
                          {amenity}
                        </button>
                      );
                    })}
                  </div>
                  <div className={styles.inlineAddRow} style={{ marginTop: "12px" }}>
                    <button
                      type="button"
                      className={styles.secondaryMiniBtn}
                      onClick={() => addCustomRoomAmenity(index, "customSecondaryAmenities")}
                    >
                      <Plus size={14} />
                      Add custom amenity
                    </button>
                  </div>
                  {room.customSecondaryAmenities.length > 0 ? (
                    <div className={styles.chipRow} style={{ marginTop: "12px" }}>
                      {room.customSecondaryAmenities.map((amenity, amenityIndex) => (
                        <button
                          key={`${room.id}-secondary-${amenityIndex}`}
                          type="button"
                          className={`${styles.chipButton} ${styles.chipButtonActive}`}
                          onClick={() => removeCustomRoomAmenity(index, "customSecondaryAmenities", amenity)}
                          title="Remove custom amenity"
                        >
                          {amenity} <X size={12} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </details>

                <details className={styles.amenityDetails}>
                  <summary>
                    <span>Experience highlights</span>
                    <ChevronDown size={14} />
                  </summary>
                  <div className={styles.chipRow}>
                    {ROOM_AMENITY_GROUPS.experience.map((amenity) => {
                      const active = room.roomAmenities.includes(amenity);
                      return (
                        <button
                          key={amenity}
                          type="button"
                          className={`${styles.chipButton} ${active ? styles.chipButtonActive : ""}`}
                          onClick={() => updateRoom(index, "roomAmenities", toggleValue(room.roomAmenities, amenity))}
                        >
                          {amenity}
                        </button>
                      );
                    })}
                  </div>
                  <div className={styles.inlineAddRow} style={{ marginTop: "12px" }}>
                    <button
                      type="button"
                      className={styles.secondaryMiniBtn}
                      onClick={() => addCustomRoomAmenity(index, "customExperienceHighlights")}
                    >
                      <Plus size={14} />
                      Add custom experience
                    </button>
                  </div>
                  {room.customExperienceHighlights.length > 0 ? (
                    <div className={styles.chipRow} style={{ marginTop: "12px" }}>
                      {room.customExperienceHighlights.map((experience, experienceIndex) => (
                        <button
                          key={`${room.id}-experience-${experienceIndex}`}
                          type="button"
                          className={`${styles.chipButton} ${styles.chipButtonActive}`}
                          onClick={() => removeCustomRoomAmenity(index, "customExperienceHighlights", experience)}
                          title="Remove custom experience"
                        >
                          {experience} <X size={12} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </details>

                <div className={styles.photoUploader}>
                  <div className={styles.photoUploadBar}>
                    <button type="button" className={styles.primaryMiniBtn} onClick={() => roomPhotoInputRefs.current[index]?.click()}>
                      <Upload size={14} />
                      Upload room photos
                    </button>
                    <input
                      ref={(node) => {
                        roomPhotoInputRefs.current[index] = node;
                      }}
                      type="file"
                      accept="image/*,.heic,.heif"
                      multiple
                      hidden
                      onChange={(event) => void handleRoomPhotosUpload(event, index)}
                    />
                    <div className={styles.helperText}>Minimum 5 photos for the primary room. Uploads up to {formatGalleryImageUploadLimitLabel()} are allowed.</div>
                  </div>
                  {uploading === `room-${index}` ? <div className={styles.uploadState}>Uploading room photos...</div> : null}
                  {Array.isArray(room.roomPhotos) && room.roomPhotos.length > 0 ? (
                    <div className={styles.previewStrip}>
                      {room.roomPhotos.map((photo, photoIndex) => (
                        <div key={`${photo}-${photoIndex}`} style={{ position: "relative", display: "inline-flex" }}>
                          <img src={photo} alt={`Room ${index + 1} photo ${photoIndex + 1}`} className={styles.previewThumb} />
                          <button
                            type="button"
                            aria-label={`Remove room ${index + 1} photo ${photoIndex + 1}`}
                            onClick={() => handleRemoveRoomPhoto(index, photoIndex)}
                            style={{
                              position: "absolute",
                              top: 6,
                              right: 6,
                              width: 26,
                              height: 26,
                              borderRadius: 999,
                              border: "none",
                              background: "rgba(15, 23, 42, 0.82)",
                              color: "#fff",
                              cursor: "pointer",
                              display: "grid",
                              placeItems: "center",
                              zIndex: 2,
                            }}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            <button type="button" className={styles.secondaryMiniBtn} onClick={addRoom}>
              <Plus size={14} />
              Add another room
            </button>
          </div>
        </section>
      </div>

      {uploadError ? <div className={styles.errorBanner}>{uploadError}</div> : null}

      <div className={styles.stepNoteCard}>
        <Sparkles size={16} />
        Keep the room photos honest and current. These details will later be used to build the host page and PMS room cards.
      </div>
    </div>
  );
}
