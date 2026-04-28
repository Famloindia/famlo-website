import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import styles from "../dashboard.module.css";
import { PhotoItem } from "../HostDashboardEditor";
import { ImagePlus, Camera, MapPin, ShieldCheck, FileCheck, FileSignature, Files, Eye } from "lucide-react";
import {
  MAX_GALLERY_IMAGE_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_BYTES,
  formatGalleryImageUploadLimitLabel,
  formatImageUploadLimitLabel,
} from "@/lib/upload-limits";
import {
  AMENITY_OPTIONS,
  BATHROOM_TYPE_OPTIONS,
  FOOD_OFFERING_OPTIONS,
  parseMultiValueList,
  serializeMultiValueList,
  toggleListValue,
} from "@/lib/home-listing-options";

const HOBBY_OPTIONS = ["Cooking", "Music", "Gardening", "Reading", "Yoga", "Art", "Travel", "Dance", "Photography"];
const HOUSE_TYPE_OPTIONS = ["Joint family", "Nuclear family", "Couple", "Solo host", "Shared household"];
const INTERACTION_TYPE_OPTIONS = ["Friendly and available", "Extrovert", "Introvert", "Quiet and helpful", "Highly social", "Flexible"];
const HOUSE_RULE_OPTIONS = ["No smoking", "No pets", "No alcohol", "Quiet after 10 PM"];

export default function ProfileTab({ 
  profile, setProfile, listing, setListing, photos, setPhotos,
  compliance, setCompliance, schedule, setSchedule, onSave, saving, familyId
}: any) {
  const [uploadingSelfie, setUploadingSelfie] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [customHobby, setCustomHobby] = useState("");
  const [customAmenity, setCustomAmenity] = useState("");
  const [customIncludedItem, setCustomIncludedItem] = useState("");
  const [customFoodType, setCustomFoodType] = useState("");
  const [customHouseRule, setCustomHouseRule] = useState("");

  const [locations, setLocations] = useState({ states: [], cities: [], villages: [] });

  useEffect(() => {
    fetch('/api/locations/search')
      .then(res => res.json())
      .then(data => setLocations(data))
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
        return { url: null, error: `Image must be ${formatImageUploadLimitLabel()} or smaller.` };
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

    const isGalleryUpload = folder === "galleries";
    const maxBytes = isGalleryUpload ? MAX_GALLERY_IMAGE_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
    const limitLabel = isGalleryUpload ? formatGalleryImageUploadLimitLabel() : formatImageUploadLimitLabel();
    if (file.size > maxBytes) {
      throw new Error(`Image must be ${limitLabel} or smaller.`);
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    const res = await fetch("/api/onboarding/home/upload", {
      method: "POST",
      body: formData
    });

    const payload = await readUploadResponse(res);
    if (!res.ok || !payload.url) {
      throw new Error(payload.error || "Upload failed");
    }
    return payload.url;
  };

  const handleSelfieUpload = async (e: any) => {
    if (!e.target.files?.[0]) return;
    try {
      setUploadingSelfie(true);
      const url = await uploadFileToR2(e.target.files[0], "selfies");
      if (url) setProfile((c: any) => ({ ...c, hostSelfieUrl: url }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to upload selfie to Cloudflare R2.");
    } finally {
      setUploadingSelfie(false);
    }
  };

  const handleGalleryUpload = async (e: any) => {
    if (!e.target.files) return;
    setUploadingGallery(true);
    try {
      const newPhotos = [...photos];
      for (const file of Array.from(e.target.files) as File[]) {
        const url = await uploadFileToR2(file, "galleries");
        if (url) {
          newPhotos.push({ id: `photo-${Date.now()}-${Math.random()}`, url, isPrimary: newPhotos.length === 0 });
        }
      }
      setPhotos(newPhotos);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to upload gallery photos to Cloudflare R2.");
    } finally {
      setUploadingGallery(false);
    }
  };

  const handleReplacePhoto = async (e: any, photoIndex: number) => {
    if (!e.target.files?.[0]) return;
    try {
      setUploadingGallery(true);
      const url = await uploadFileToR2(e.target.files[0], "galleries");
      if (!url) return;

      setPhotos((current: PhotoItem[]) =>
        current.map((photo, index) =>
          index === photoIndex
            ? { ...photo, url }
            : photo
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to replace listing image.");
    } finally {
      setUploadingGallery(false);
      e.target.value = "";
    }
  };

  const handleSetPrimaryPhoto = (photoIndex: number) => {
    setPhotos((current: PhotoItem[]) =>
      current.map((photo, index) => ({
        ...photo,
        isPrimary: index === photoIndex
      }))
    );
  };

  const handleRemovePhoto = (photoIndex: number) => {
    setPhotos((current: PhotoItem[]) => {
      const next = current.filter((_, index) => index !== photoIndex);
      if (next.length > 0 && !next.some((photo) => photo.isPrimary)) {
        next[0] = { ...next[0], isPrimary: true };
      }
      return next;
    });
  };

  const handleDocUpload = async (e: any, docType: string) => {
    if (!e.target.files?.[0]) return;
    setUploadingDoc(docType);
    try {
      const url = await uploadFileToR2(e.target.files[0], "compliance");
      if (url) {
        setCompliance((c: any) => ({ ...c, [docType]: url }));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to upload ${docType}.`);
    } finally {
      setUploadingDoc(null);
    }
  };

  const detectLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const coords = `${position.coords.latitude}, ${position.coords.longitude}`;
        setListing((c: any) => ({ ...c, googleMapsLink: `https://maps.google.com/?q=${coords}` }));
      }, () => alert("Location access denied or failed. Please check browser settings."));
    }
  };

  const selectedHobbies = useMemo(() => parseMultiValueList(profile.hostHobbies || ""), [profile.hostHobbies]);
  const selectedAmenities = useMemo(() => parseMultiValueList(listing.amenities || ""), [listing.amenities]);
  const selectedIncludedItems = useMemo(() => parseMultiValueList(listing.includedItems || ""), [listing.includedItems]);
  const selectedFood = useMemo(() => parseMultiValueList(listing.foodType || ""), [listing.foodType]);
  const selectedHouseRules = useMemo(() => parseMultiValueList(listing.houseRules || ""), [listing.houseRules]);

  const updateHobbies = (nextHobbies: string[]) => {
    setProfile((current: any) => ({ ...current, hostHobbies: serializeMultiValueList(nextHobbies) }));
  };
  const updateAmenities = (nextAmenities: string[]) => {
    setListing((current: any) => ({ ...current, amenities: serializeMultiValueList(nextAmenities) }));
  };

  const updateIncludedItems = (nextItems: string[]) => {
    setListing((current: any) => ({ ...current, includedItems: serializeMultiValueList(nextItems) }));
  };

  const updateFoodType = (nextItems: string[]) => {
    setListing((current: any) => ({ ...current, foodType: serializeMultiValueList(nextItems) }));
  };

  const updateHouseRules = (nextRules: string[]) => {
    setListing((current: any) => ({ ...current, houseRules: serializeMultiValueList(nextRules) }));
  };

  const saveProfile = () =>
    onSave({
      updatedProfile: profile,
      updatedListing: {
        ...listing,
      },
      updatedPhotos: photos,
      updatedCompliance: compliance,
    });
  const listingPreviewUrl = `/homes/${familyId}`;

  return (
    <div className={`${styles.flexCol} ${styles.animateIn}`} style={{ gap: '40px', paddingBottom: '80px' }}>
      <div className={styles.flexRow} style={{ alignItems: 'flex-start' }}>
        <div>
           <h2 style={{ fontSize: '24px', fontWeight: 900, margin: '0 0 4px', color: '#0e2b57' }}>Profile Configurations</h2>
           <p style={{ fontSize: '14px', color: 'rgba(14,43,87,0.6)', margin: 0 }}>Sync your identity, gallery, and listing story to the public home page.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Link
            href={listingPreviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.secondaryBtn}
            style={{ width: 'auto', background: '#eff6ff', color: '#165dcc', borderColor: 'rgba(22,93,204,0.14)', textDecoration: 'none' }}
          >
            <Eye size={16} />
            View listing
          </Link>
          <button className={styles.primaryBtn} style={{ width: 'auto' }} onClick={() => saveProfile()} disabled={saving}>
             {saving ? "Saving DB..." : "Update Web & App"}
          </button>
        </div>
      </div>

      <div className={styles.glassCard}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: '24px', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: '14px' }}>
            <div style={{ position: 'relative' }}>
              <div className={styles.instaSelfie} style={{ width: '100%', height: '280px' }}>
                {uploadingSelfie ? (
                  <span style={{ fontSize: '16px', fontWeight: 800, color: '#165dcc' }}>...</span>
                ) : profile.hostSelfieUrl ? (
                  <img src={profile.hostSelfieUrl} alt="Host Selfie" />
                ) : (
                  <Camera size={40} color="rgba(14,43,87,0.3)" />
                )}
                <label className={styles.instaSelfieOverlay} htmlFor="host-dashboard-photo-upload">
                  <span>{profile.hostSelfieUrl ? "Change Photo" : "Upload Live photo"}</span>
                  <input id="host-dashboard-photo-upload" type="file" style={{ display: 'none' }} accept="image/*" onChange={handleSelfieUpload} />
                </label>
              </div>
            </div>
            <div style={{ padding: '14px 16px', borderRadius: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, color: '#475569' }}>
              Save the profile first if you change your host identity photo or name.
            </div>
          </div>

          <div style={{ display: 'grid', gap: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#165dcc', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Host Identity Profile</h3>
            <div className={styles.gridCols2} style={{ gap: '18px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Display Name</label>
                <input className={styles.inputField} placeholder="E.g., Aryan Krishan" value={profile.hostDisplayName} onChange={(e) => setProfile((c: any) => ({...c, hostDisplayName: e.target.value}))} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Host Catchphrase / Tagline</label>
                <input className={styles.inputField} placeholder="E.g., Hosted by a warm local family in Jodhpur." value={profile.hostCatchphrase} onChange={(e) => setProfile((c: any) => ({...c, hostCatchphrase: e.target.value}))} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>City</label>
                <input list="city-list" className={styles.inputField} placeholder="Start typing..." value={profile.city} onChange={e => setProfile((c: any) => ({...c, city: e.target.value}))}/>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>State</label>
                <input list="state-list" className={styles.inputField} placeholder="Start typing..." value={profile.state} onChange={e => setProfile((c: any) => ({...c, state: e.target.value}))}/>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#165dcc', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Area Near The City (Neighborhood / Locality)</label>
                <input list="village-list" className={styles.inputField} style={{ border: '2px solid #bfdbfe', background: '#eff6ff' }} placeholder="E.g., Malviya Nagar, Jodhpur" value={profile.cityNeighbourhood} onChange={e => setProfile((c: any) => ({...c, cityNeighbourhood: e.target.value}))}/>
                <p style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', fontWeight: 600 }}>This helps us list your property on maps without disclosing its exact street location.</p>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Hobbies & Interests</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                  {HOBBY_OPTIONS.map((option) => {
                    const active = selectedHobbies.some((item) => item.toLowerCase() === option.toLowerCase());
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => updateHobbies(toggleListValue(selectedHobbies, option))}
                        style={{
                          borderRadius: '999px',
                          border: active ? '1px solid #165dcc' : '1px solid rgba(14,43,87,0.12)',
                          background: active ? '#dbeafe' : 'white',
                          color: active ? '#0b4db1' : '#0e2b57',
                          padding: '9px 14px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    className={styles.inputField}
                    style={{ flex: 1 }}
                    placeholder="Add a custom hobby"
                    value={customHobby}
                    onChange={(e) => setCustomHobby(e.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => {
                      const next = customHobby.trim();
                      if (!next) return;
                      updateHobbies(toggleListValue(selectedHobbies, next));
                      setCustomHobby("");
                    }}
                    style={{ width: 'auto', minWidth: 'auto' }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.glassCard}>
         <h3 style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '24px' }}>Host Gallery</h3>
         <p style={{ fontSize: '13px', color: 'rgba(14,43,87,0.6)', marginBottom: '16px' }}>
           Manage the exact listing images guests see. Upload new photos, replace old ones, choose the cover image, and remove anything you no longer want live.
         </p>
         
         <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '16px' }}>
            {photos.map((p: PhotoItem, i: number) => (
               <div key={p.id} style={{ flexShrink: 0, width: '168px', borderRadius: '18px', border: p.isPrimary ? '2px solid #165dcc' : '1px solid rgba(14,43,87,0.1)', overflow: 'hidden', position: 'relative', background: '#f4f8ff', boxShadow: p.isPrimary ? '0 16px 30px rgba(22,93,204,0.16)' : '0 10px 24px rgba(15,23,42,0.06)' }}>
                 <div style={{ position: 'relative', width: '100%', height: '132px' }}>
                   <img src={p.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Gallery" />
                   {p.isPrimary ? (
                     <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(22,93,204,0.96)', color: 'white', borderRadius: '999px', padding: '6px 10px', fontSize: '10px', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                       Listing Cover
                     </div>
                   ) : null}
                 </div>
                 <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                   <div style={{ fontSize: '12px', fontWeight: 800, color: '#0e2b57' }}># {i + 1} Image</div>
                   <button
                     type="button"
                     onClick={() => handleSetPrimaryPhoto(i)}
                     style={{ border: '1px solid rgba(22,93,204,0.18)', background: p.isPrimary ? '#dbeafe' : '#eff6ff', color: '#165dcc', borderRadius: '10px', padding: '9px 12px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
                   >
                     {p.isPrimary ? 'Main cover' : 'Set as cover'}
                   </button>
                   <label style={{ border: '1px solid rgba(14,43,87,0.1)', background: 'white', color: '#0e2b57', borderRadius: '10px', padding: '9px 12px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', textAlign: 'center' }}>
                     Re-upload
                     <input type="file" style={{ display: 'none' }} accept="image/*,.heic,.heif" onChange={(e) => void handleReplacePhoto(e, i)} />
                   </label>
                   <button
                     type="button"
                     onClick={() => handleRemovePhoto(i)}
                     style={{ border: 'none', background: '#fee2e2', color: '#b91c1c', borderRadius: '10px', padding: '9px 12px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
                   >
                     Remove
                   </button>
                 </div>
               </div>
            ))}
            
            <label style={{ flexShrink: 0, width: '168px', minHeight: '220px', borderRadius: '18px', border: '2px dashed rgba(22,93,204,0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(244,248,255,0.5)', color: '#165dcc', transition: 'all 0.2s ease', padding: '16px', textAlign: 'center' }}>
               <ImagePlus size={24} style={{ marginBottom: '4px' }} />
               <span style={{ fontSize: '12px', fontWeight: 800 }}>{uploadingGallery ? 'Uploading...' : 'Add photos'}</span>
               <span style={{ marginTop: '4px', fontSize: '10px', fontWeight: 800, color: 'rgba(22,93,204,0.7)' }}>Up to {formatGalleryImageUploadLimitLabel()}</span>
               <input type="file" multiple style={{ display: 'none' }} accept="image/*,.heic,.heif" onChange={handleGalleryUpload} />
            </label>
         </div>
      </div>

      <div className={styles.glassCard}>
         <h3 style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '24px' }}>Story and Listing Details</h3>

         <div className={styles.gridCols2} style={{ gap: '24px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
               <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>My Journey</label>
               <textarea className={styles.inputField} style={{ minHeight: '100px', resize: 'vertical', lineHeight: 1.55 }} placeholder="Type here" value={listing.journeyStory || ""} onChange={e => setListing((c: any) => ({...c, journeyStory: e.target.value}))}/>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
               <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>My Special Place</label>
               <textarea className={styles.inputField} style={{ minHeight: '100px', resize: 'vertical', lineHeight: 1.55 }} placeholder="What makes your place special" value={listing.specialExperience || ""} onChange={e => setListing((c: any) => ({...c, specialExperience: e.target.value}))}/>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
               <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>My Local Experience</label>
               <textarea className={styles.inputField} style={{ minHeight: '100px', resize: 'vertical', lineHeight: 1.55 }} placeholder="Type here" value={listing.localExperience || ""} onChange={e => setListing((c: any) => ({...c, localExperience: e.target.value}))}/>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
               <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Public Listing Title</label>
               <input className={styles.inputField} placeholder="E.g., Courtyard Lunch with a Jodhpur Family" value={listing.listingTitle} onChange={e => setListing((c: any) => ({...c, listingTitle: e.target.value}))}/>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
               <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Full Property Name</label>
               <input className={styles.inputField} value={listing.propertyName} onChange={e => setListing((c: any) => ({...c, propertyName: e.target.value}))}/>
            </div>
            <datalist id="city-list">
              {locations.cities.map((c: string) => <option key={c} value={c} />)}
            </datalist>
            <datalist id="state-list">
              {locations.states.map((s: string) => <option key={s} value={s} />)}
            </datalist>
            <datalist id="village-list">
              {locations.villages.map((v: string) => <option key={v} value={v} />)}
            </datalist>

            <div>
               <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Home Type</label>
               <select className={styles.inputField} value={listing.houseType || ""} onChange={e => setListing((c: any) => ({...c, houseType: e.target.value}))}>
                 <option value="">Select home type</option>
                 {HOUSE_TYPE_OPTIONS.map((option) => (
                   <option key={option} value={option}>{option}</option>
                 ))}
               </select>
            </div>
            <div>
               <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Interaction Type</label>
               <select className={styles.inputField} value={listing.interactionType || ""} onChange={e => setListing((c: any) => ({...c, interactionType: e.target.value}))}>
                 <option value="">Select interaction type</option>
                 {INTERACTION_TYPE_OPTIONS.map((option) => (
                   <option key={option} value={option}>{option}</option>
                 ))}
               </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
               <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>House Rules</label>
               <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                 {HOUSE_RULE_OPTIONS.map((option) => {
                   const active = selectedHouseRules.some((item) => item.toLowerCase() === option.toLowerCase());
                   return (
                     <button
                       key={option}
                       type="button"
                       onClick={() => updateHouseRules(toggleListValue(selectedHouseRules, option))}
                       style={{
                         borderRadius: '999px',
                         border: active ? '1px solid #165dcc' : '1px solid rgba(14,43,87,0.12)',
                         background: active ? '#eff6ff' : 'white',
                         color: active ? '#0b4db1' : '#0e2b57',
                         padding: '9px 14px',
                         fontSize: '12px',
                         fontWeight: 800,
                         cursor: 'pointer',
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
                 onChange={e => setListing((c: any) => ({...c, houseRules: e.target.value}))}
                 style={{ minHeight: '110px', resize: 'vertical', lineHeight: 1.55 }}
               />
               <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px' }}>
                 <input
                   className={styles.inputField}
                   style={{ flex: 1 }}
                   placeholder="Add a custom house rule"
                   value={customHouseRule}
                   onChange={(e) => setCustomHouseRule(e.target.value)}
                 />
                 <button
                   type="button"
                   className={styles.secondaryBtn}
                   onClick={() => {
                     const next = customHouseRule.trim();
                     if (!next) return;
                     updateHouseRules(toggleListValue(selectedHouseRules, next));
                     setCustomHouseRule("");
                   }}
                   style={{ width: 'auto', minWidth: 'auto' }}
                 >
                   Add
                 </button>
               </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
               <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Amenities</label>
               <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                 {AMENITY_OPTIONS.map((option) => {
                   const active = selectedAmenities.some((item) => item.toLowerCase() === option.toLowerCase());
                   return (
                     <button
                       key={option}
                       type="button"
                       onClick={() => updateAmenities(toggleListValue(selectedAmenities, option))}
                       style={{
                         borderRadius: '999px',
                         border: active ? '1px solid #165dcc' : '1px solid rgba(14,43,87,0.12)',
                         background: active ? '#dbeafe' : 'white',
                         color: active ? '#0b4db1' : '#0e2b57',
                         padding: '9px 14px',
                         fontSize: '12px',
                         fontWeight: 800,
                         cursor: 'pointer',
                       }}
                     >
                       {option}
                     </button>
                   );
                 })}
               </div>
               <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                 <input
                   className={styles.inputField}
                   style={{ flex: 1 }}
                   placeholder="Add a custom amenity"
                   value={customAmenity}
                   onChange={(e) => setCustomAmenity(e.target.value)}
                 />
                 <button
                   type="button"
                   className={styles.secondaryBtn}
                   onClick={() => {
                     const next = customAmenity.trim();
                     if (!next) return;
                     updateAmenities(toggleListValue(selectedAmenities, next));
                     setCustomAmenity("");
                   }}
                   style={{ width: 'auto', minWidth: 'auto' }}
                 >
                   Add
                 </button>
               </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
               <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Food Type</label>
               <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                 {FOOD_OFFERING_OPTIONS.map((option) => {
                   const active = selectedFood.some((item) => item.toLowerCase() === option.toLowerCase());
                   return (
                     <button
                       key={option}
                       type="button"
                       onClick={() => updateFoodType(toggleListValue(selectedFood, option))}
                       style={{
                         borderRadius: '999px',
                         border: active ? '1px solid #165dcc' : '1px solid rgba(14,43,87,0.12)',
                         background: active ? '#eff6ff' : 'white',
                         color: active ? '#0b4db1' : '#0e2b57',
                         padding: '9px 14px',
                         fontSize: '12px',
                         fontWeight: 800,
                         cursor: 'pointer',
                       }}
                     >
                       {option}
                     </button>
                   );
                 })}
               </div>
               <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
                 <input
                   className={styles.inputField}
                   style={{ flex: 1 }}
                   placeholder="Add a custom food type"
                   value={customFoodType}
                   onChange={(e) => setCustomFoodType(e.target.value)}
                 />
                 <button
                   type="button"
                   className={styles.secondaryBtn}
                   onClick={() => {
                     const next = customFoodType.trim();
                     if (!next) return;
                     updateFoodType(toggleListValue(selectedFood, next));
                     setCustomFoodType("");
                   }}
                   style={{ width: 'auto', minWidth: 'auto' }}
                 >
                   Add
                 </button>
               </div>
               <textarea
                 className={styles.inputField}
                 style={{ minHeight: '110px', resize: 'vertical', lineHeight: 1.55 }}
                 placeholder="Add meals, snacks, tea, breakfast, or any custom inclusions on new lines."
                 value={listing.includedItems}
                 onChange={e => setListing((c: any) => ({...c, includedItems: e.target.value}))}
               />
               <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px' }}>
                 <input
                   className={styles.inputField}
                   style={{ flex: 1 }}
                   placeholder="Add a custom included item"
                   value={customIncludedItem}
                   onChange={(e) => setCustomIncludedItem(e.target.value)}
                 />
                 <button
                   type="button"
                   className={styles.secondaryBtn}
                   onClick={() => {
                     const next = customIncludedItem.trim();
                     if (!next) return;
                     updateIncludedItems(toggleListValue(selectedIncludedItems, next));
                     setCustomIncludedItem("");
                   }}
                   style={{ width: 'auto', minWidth: 'auto' }}
                 >
                   Add
                 </button>
               </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
               <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Bathroom Type</label>
               <select className={styles.inputField} value={listing.bathroomType} onChange={e => setListing((c: any) => ({...c, bathroomType: e.target.value}))}>
                 <option value="">Select bathroom type</option>
                 {BATHROOM_TYPE_OPTIONS.map((option) => (
                   <option key={option} value={option}>{option}</option>
                 ))}
               </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
               <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Complete Property Address</label>
               <input className={styles.inputField} value={listing.propertyAddress} onChange={e => setListing((c: any) => ({...c, propertyAddress: e.target.value}))}/>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
               <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Geolocation Data</label>
               <div style={{ display: 'flex', gap: '16px' }}>
                 <input className={styles.inputField} style={{ flex: 1 }} placeholder="Calculated maps link or coordinates..." value={listing.googleMapsLink} onChange={e => setListing((c: any) => ({...c, googleMapsLink: e.target.value}))}/>
                 <button className={styles.primaryBtn} onClick={detectLocation} style={{ width: 'auto', background: '#ecfdf5', color: '#059669', border: '1px solid #10b981' }}>
                   <MapPin size={20} /> Detect Map Link
                 </button>
               </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
               <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Check In</label>
               <input className={styles.inputField} placeholder="12:00 PM" value={listing.checkInTime || ""} onChange={e => setListing((c: any) => ({...c, checkInTime: e.target.value}))}/>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
               <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Check Out</label>
               <input className={styles.inputField} placeholder="10:00 AM" value={listing.checkOutTime || ""} onChange={e => setListing((c: any) => ({...c, checkOutTime: e.target.value}))}/>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
               <label style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(14,43,87,0.6)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Common Area Access (Comma separated)</label>
               <input className={styles.inputField} placeholder="Living room, Courtyard, Terrace" value={listing.commonAreas} onChange={e => setListing((c: any) => ({...c, commonAreas: e.target.value}))}/>
            </div>
         </div>

         <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
           <button
             className={styles.primaryBtn}
             type="button"
             onClick={() => saveProfile()}
             disabled={saving}
             style={{ width: 'auto', minWidth: '220px' }}
           >
             {saving ? "Saving profile..." : "Save Profile to Listing"}
           </button>
         </div>
      </div>


    </div>
  )
}
