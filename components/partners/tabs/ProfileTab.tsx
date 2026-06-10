import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import styles from "../dashboard.module.css";
import { PhotoItem } from "../HostDashboardEditor";
import PropertyContentManager from "../property/PropertyContentManager";
import { Camera, Eye } from "lucide-react";
import {
  MAX_GALLERY_IMAGE_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_BYTES,
  formatGalleryImageUploadLimitLabel,
  formatImageUploadLimitLabel,
} from "@/lib/upload-limits";
import {
  parseMultiValueList,
  serializeMultiValueList,
  toggleListValue,
} from "@/lib/home-listing-options";

const HOBBY_OPTIONS = ["Cooking", "Music", "Gardening", "Reading", "Yoga", "Art", "Travel", "Dance", "Photography"];

export default function ProfileTab({ 
  profile, setProfile, listing, setListing, photos, setPhotos,
  propertyReels, setPropertyReels,
  compliance, setCompliance, schedule, setSchedule, onSave, saving, familyId
}: any) {
  const [uploadingSelfie, setUploadingSelfie] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [customHobby, setCustomHobby] = useState("");

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

  const selectedHobbies = useMemo(() => parseMultiValueList(profile.hostHobbies || ""), [profile.hostHobbies]);

  const updateHobbies = (nextHobbies: string[]) => {
    setProfile((current: any) => ({ ...current, hostHobbies: serializeMultiValueList(nextHobbies) }));
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

      <PropertyContentManager
        familyId={familyId}
        listing={listing}
        setListing={setListing}
        photos={photos}
        setPhotos={setPhotos}
        propertyReels={propertyReels}
        setPropertyReels={setPropertyReels}
        onSave={({ updatedListing, updatedPhotos }) =>
          onSave({
            updatedProfile: profile,
            updatedListing,
            updatedPhotos,
            updatedCompliance: compliance,
          })
        }
        saving={saving}
      />


    </div>
  )
}
