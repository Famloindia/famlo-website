"use client";

import { useState } from "react";
import { 
  CheckSquare, 
  Square, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  AlertTriangle,
  MapPin,
  Phone,
  Mail,
  User,
  CreditCard,
  Home,
  ShieldCheck,
  Languages,
  Info
} from "lucide-react";

interface Application {
  id: string;
  full_name: string;
  email: string;
  application_type?: "family" | "friend";
  bio?: string;
  photo_url?: string;
  address?: string;
  status: string;
  draft_data?: any;
}

interface VettingChecklistItem {
  id: string;
  label: string;
  description: string;
  checked: boolean;
}

interface VettingScorecardProps {
  applications: Application[];
  actorId: string;
  actorRole: "team" | "admin";
}

const DEFAULT_CHECKLIST: Omit<VettingChecklistItem, "checked">[] = [
  { id: "identity", label: "Identity Verified", description: "Aadhaar/PAN face match confirmed in ID Verifier" },
  { id: "photos", label: "Media Audit Pass", description: "Reviewing all 5+ photos for quality and authenticity" },
  { id: "profile", label: "Host Persona Pass", description: "Bio, family composition, and languages are professional" },
  { id: "financials", label: "Payment Setup Pass", description: "UPI ID and Bank details are valid and match name" },
  { id: "compliance", label: "Safety & Privacy Pass", description: "Bathroom type, documents, and policy checks meet Famlo standards" },
];

function ApplicationCard({ app, actorId, actorRole }: { app: Application; actorId: string; actorRole: string }) {
  const [checklist, setChecklist] = useState<VettingChecklistItem[]>(
    DEFAULT_CHECKLIST.map((item) => ({ ...item, checked: false }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [reason, setReason] = useState("");
  const [showFullDetail, setShowFullDetail] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const allChecked = checklist.every((item) => item.checked);
  const bioLength = app.bio?.length ?? 0;
  const draft = app.draft_data;
  const payload = draft?.payload && typeof draft.payload === "object" ? draft.payload : {};
  const pricing = payload?.pricing && typeof payload.pricing === "object" ? payload.pricing : {};
  const compliance = draft?.compliance && typeof draft.compliance === "object" ? draft.compliance : {};
  const getDraftValue = (...keys: string[]) => {
    for (const key of keys) {
      const direct = draft?.[key];
      if (direct !== undefined && direct !== null && direct !== "") return direct;
      const nested = (payload as any)?.[key];
      if (nested !== undefined && nested !== null && nested !== "") return nested;
      const pricingValue = (pricing as any)?.[key];
      if (pricingValue !== undefined && pricingValue !== null && pricingValue !== "") return pricingValue;
      const complianceValue = (compliance as any)?.[key];
      if (complianceValue !== undefined && complianceValue !== null && complianceValue !== "") return complianceValue;
    }
    return null;
  };
  const getDraftArray = (...keys: string[]) => {
    for (const key of keys) {
      const direct = draft?.[key];
      if (Array.isArray(direct) && direct.length > 0) return direct;
      const nested = (payload as any)?.[key];
      if (Array.isArray(nested) && nested.length > 0) return nested;
    }
    return [];
  };
  const hostPhotoUrl = String(getDraftValue("host_photo_url", "hostPhoto", "photo_url") || "");
  const listingStatus = typeof draft?.listing_status === "string" ? draft.listing_status : "submitted";
  const hasPricing = Boolean(
    getDraftValue("price_morning", "morningRate") ||
    getDraftValue("price_afternoon", "afternoonRate") ||
    getDraftValue("price_evening", "eveningRate") ||
    getDraftValue("price_fullday", "priceFullday", "fullDayRate", "baseNightlyRate")
  );
  const hasLocation = Boolean(getDraftValue("street_address", "property_address", "streetAddress", "propertyAddress", "city_name", "city", "state", "cityNeighbourhood", "areaName"));
  const hasIdDocument = Boolean(getDraftValue("idDocumentPhotoUrl", "idDocumentUrl"));
  const hasLiveSelfie = Boolean(getDraftValue("liveSelfieUrl"));
  const hasOwnershipDoc = Boolean(getDraftValue("propertyOwnershipProofUrl"));
  const hostAgreementAccepted = Boolean(getDraftValue("hostAgreementAccepted"));
  const termsPrivacyAccepted = Boolean(getDraftValue("termsPrivacyAccepted"));
  const commissionAgreementAccepted = Boolean(getDraftValue("commissionAgreementAccepted"));
  const codeOfConductAccepted = Boolean(getDraftValue("codeOfConductAccepted"));
  const cancellationPolicyAccepted = Boolean(getDraftValue("cancellationPolicyAccepted"));
  const gstApplicable = Boolean(getDraftValue("gstApplicable"));
  const gstDeclarationAccepted = Boolean(getDraftValue("gstDeclarationAccepted"));
  const landmarks = getDraftArray("landmarks");
  const locality = String(getDraftValue("city_neighbourhood", "cityNeighbourhood", "areaName", "villageName", "village") || "");
  const mapLink = String(getDraftValue("google_maps_link", "googleMapsLink") || "");
  const latitude = String(getDraftValue("lat_exact", "latitude", "lat") || "");
  const longitude = String(getDraftValue("lng_exact", "longitude", "lng") || "");
  const panMasked = String(getDraftValue("panMasked", "pan_masked") || "");
  const panHolderName = String(getDraftValue("panHolderName", "pan_holder_name") || "");
  const panVerificationStatus = String(getDraftValue("panVerificationStatus", "pan_verification_status") || "");
  const panRiskFlag = Boolean(getDraftValue("panRiskFlag", "pan_risk_flag"));
  const hostGalleryPhotos = getDraftArray("hostGalleryPhotos", "host_gallery_photos");
  const nearbyPlaces = getDraftArray("nearbyPlaces");
  const roomDrafts = getDraftArray("rooms");
  const journeyStory = String(getDraftValue("journeyStory", "hostBio") || "");
  const specialExperience = String(getDraftValue("specialExperience") || "");
  const localExperience = String(getDraftValue("localExperience") || "");
  const houseType = String(getDraftValue("houseType", "family_composition", "familyComposition") || "");
  const interactionType = String(getDraftValue("interactionType") || "");
  const checkInTime = String(getDraftValue("checkInTime") || "");
  const checkOutTime = String(getDraftValue("checkOutTime") || "");
  const hobbies = getDraftArray("hobbies");
  const includedItems = getDraftArray("includedItems", "included_items");
  const houseRules = getDraftArray("houseRules", "customRules", "house_rules");
  const commonAreas = getDraftArray("common_areas", "commonAreas");

  const toggle = (id: string) => {
    setChecklist((prev) => prev.map((item) => item.id === id ? { ...item, checked: !item.checked } : item));
  };

  const handleDecision = async (action: "approved" | "rejected") => {
    if (action === "approved" && !allChecked) return;
    setSubmitting(true);
    setRequestError(null);
    try {
      const res = await fetch("/api/teams/vetting/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: app.id,
          applicationType: app.application_type ?? "family",
          action,
          reason,
          actorId,
          actorRole
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDecision(action);
        return;
      }
      setRequestError(typeof data?.error === "string" ? data.error : "Approval request failed.");
    } catch (err) {
      console.error("Vetting decision failed", err);
      setRequestError("Approval request failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (decision) {
    return (
      <div style={{ background: "white", borderRadius: "20px", padding: "32px", border: `2px solid ${decision === "approved" ? "#86efac" : "#fca5a5"}`, textAlign: "center" }}>
        {decision === "approved" ? <CheckCircle2 size={40} color="#16a34a" /> : <XCircle size={40} color="#dc2626" />}
        <div style={{ marginTop: "16px", fontWeight: 900, fontSize: "18px", color: decision === "approved" ? "#16a34a" : "#dc2626" }}>
          {app.full_name} — {decision === "approved" ? "Approved" : "Rejected"}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "white", borderRadius: "20px", overflow: "hidden", border: "1px solid #e2e8f0", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
      {/* Header */}
      <div style={{ padding: "24px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: "16px", alignItems: "center" }}>
        {app.photo_url ? (
          <img src={app.photo_url} alt={app.full_name} style={{ width: "56px", height: "56px", borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#f4f8ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", fontWeight: 900, color: "#165dcc" }}>
            {app.full_name[0]}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: "17px", color: "#0e2b57" }}>{app.full_name}</div>
          <div style={{ fontSize: "13px", color: "#64748b" }}>{app.email} • {app.address}</div>
          {draft ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
                {[
                  { label: `Draft ${listingStatus}`, tone: "#165dcc", background: "#eff6ff" },
                  { label: `${hostGalleryPhotos.length} host photos`, tone: hostGalleryPhotos.length >= 5 ? "#15803d" : "#b45309", background: hostGalleryPhotos.length >= 5 ? "#f0fdf4" : "#fff7ed" },
                  { label: hasPricing ? "Pricing ready" : "Pricing missing", tone: hasPricing ? "#15803d" : "#b91c1c", background: hasPricing ? "#f0fdf4" : "#fef2f2" },
                  { label: hasLocation ? "Location ready" : "Location missing", tone: hasLocation ? "#15803d" : "#b91c1c", background: hasLocation ? "#f0fdf4" : "#fef2f2" },
                  { label: hostPhotoUrl ? "Host photo ready" : "Host photo missing", tone: hostPhotoUrl ? "#15803d" : "#b91c1c", background: hostPhotoUrl ? "#f0fdf4" : "#fef2f2" },
                  { label: hasIdDocument ? "ID doc ready" : "ID doc missing", tone: hasIdDocument ? "#15803d" : "#b91c1c", background: hasIdDocument ? "#f0fdf4" : "#fef2f2" },
                  { label: hasLiveSelfie ? "Live selfie ready" : "Live selfie missing", tone: hasLiveSelfie ? "#15803d" : "#b91c1c", background: hasLiveSelfie ? "#f0fdf4" : "#fef2f2" },
                  { label: hasOwnershipDoc ? "Property doc ready" : "Property doc missing", tone: hasOwnershipDoc ? "#15803d" : "#b91c1c", background: hasOwnershipDoc ? "#f0fdf4" : "#fef2f2" },
                  { label: hostAgreementAccepted ? "Agreement accepted" : "Agreement pending", tone: hostAgreementAccepted ? "#15803d" : "#b91c1c", background: hostAgreementAccepted ? "#f0fdf4" : "#fef2f2" },
                ].map((chip) => (
                <span
                  key={chip.label}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "6px 10px",
                    borderRadius: "999px",
                    background: chip.background,
                    color: chip.tone,
                    fontSize: "11px",
                    fontWeight: 900,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <button onClick={() => setShowFullDetail(!showFullDetail)} style={{ padding: "10px 20px", borderRadius: "12px", border: "1px solid #165dcc", background: showFullDetail ? "#165dcc" : "white", fontSize: "12px", fontWeight: 900, color: showFullDetail ? "white" : "#165dcc", cursor: "pointer", transition: "all 0.2s" }}>
          {showFullDetail ? "Close Detailed File" : "Review Comprehensive Detail"}
        </button>
      </div>

      {showFullDetail && (
        <div style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
          <div style={{ padding: "24px", borderBottom: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "11px", fontWeight: 900, color: "#64748b", textTransform: "uppercase", marginBottom: "16px", letterSpacing: "0.05em" }}>Step 2 Story & Style</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
              {[
                { label: "Your journey", value: journeyStory || "Not provided" },
                { label: "What makes your place special", value: specialExperience || "Not provided" },
                { label: "What local experience can you share?", value: localExperience || "Not provided" },
                { label: "House type", value: houseType || "Not provided" },
                { label: "Interaction style", value: interactionType || "Not provided" },
                { label: "Check-in time", value: checkInTime || "Not provided" },
                { label: "Check-out time", value: checkOutTime || "Not provided" },
              ].map((item) => (
                <div key={item.label} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "14px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", marginBottom: "6px" }}>{item.label}</div>
                  <div style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 700, lineHeight: 1.5 }}>{String(item.value)}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
              <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "14px" }}>
                <div style={{ fontSize: "10px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", marginBottom: "8px" }}>Hobbies & interests</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {(hobbies.length > 0 ? hobbies : ["Not provided"]).map((item, index) => (
                    <span key={`${item}-${index}`} style={{ display: "inline-flex", padding: "6px 10px", borderRadius: "999px", background: "#eff6ff", color: "#1d4ed8", fontSize: "11px", fontWeight: 800 }}>
                      {String(item)}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "14px" }}>
                <div style={{ fontSize: "10px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", marginBottom: "8px" }}>Included items</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {(includedItems.length > 0 ? includedItems : ["Not provided"]).map((item, index) => (
                    <span key={`${item}-${index}`} style={{ display: "inline-flex", padding: "6px 10px", borderRadius: "999px", background: "#f0fdf4", color: "#15803d", fontSize: "11px", fontWeight: 800 }}>
                      {String(item)}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "14px" }}>
                <div style={{ fontSize: "10px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", marginBottom: "8px" }}>House rules</div>
                <div style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 700, lineHeight: 1.5 }}>
                  {houseRules.length > 0 ? houseRules.join(", ") : "Not provided"}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: "#e2e8f0" }}>
            <div style={{ padding: "24px", background: "#f8fafc" }}>
              <div style={{ fontSize: "11px", fontWeight: 900, color: "#64748b", textTransform: "uppercase", marginBottom: "16px", letterSpacing: "0.05em" }}>Host Gallery</div>
              {hostGalleryPhotos.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
                  {hostGalleryPhotos.map((url: string, index: number) => (
                    <img
                      key={`${url}-${index}`}
                      src={url}
                      alt={`Host gallery ${index + 1}`}
                      style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: "12px", border: "1px solid #e2e8f0" }}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: "13px", color: "#64748b", background: "white", padding: "14px", borderRadius: "12px", border: "1px dashed #cbd5e1" }}>
                  No host gallery photos submitted yet.
                </div>
              )}
            </div>

            <div style={{ padding: "24px", background: "#f8fafc" }}>
              <div style={{ fontSize: "11px", fontWeight: 900, color: "#64748b", textTransform: "uppercase", marginBottom: "16px", letterSpacing: "0.05em" }}>Nearby Places</div>
              {nearbyPlaces.length > 0 ? (
                <div style={{ display: "grid", gap: "10px" }}>
                  {nearbyPlaces.map((place: any, index: number) => (
                    <div key={`${place?.id ?? index}`} style={{ background: "white", padding: "12px 14px", borderRadius: "12px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: "12px" }}>
                      <span style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 700 }}>{String(place?.name ?? `Place ${index + 1}`)}</span>
                      <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 800 }}>
                        {String(place?.distance ?? "")}{place?.unit ? ` ${String(place.unit)}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: "13px", color: "#64748b", background: "white", padding: "14px", borderRadius: "12px", border: "1px dashed #cbd5e1" }}>
                  No nearby places submitted yet.
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: "24px", borderBottom: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "11px", fontWeight: 900, color: "#64748b", textTransform: "uppercase", marginBottom: "16px", letterSpacing: "0.05em" }}>Rooms Submitted During Onboarding</div>
            {roomDrafts.length > 0 ? (
              <div style={{ display: "grid", gap: "16px" }}>
                {roomDrafts.map((room: any, index: number) => {
                  const roomAmenities = Array.isArray(room?.roomAmenities) ? room.roomAmenities : Array.isArray(room?.amenities) ? room.amenities : [];
                  const roomPhotos = Array.isArray(room?.roomPhotos) ? room.roomPhotos : Array.isArray(room?.photos) ? room.photos : [];
                  return (
                    <div key={room?.id ?? index} style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
                        <div>
                          <div style={{ fontSize: "16px", fontWeight: 900, color: "#0e2b57" }}>{String(room?.roomName ?? room?.name ?? `Room ${index + 1}`)}</div>
                          <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
                            {String(room?.roomType ?? room?.unitType ?? "Private room")}
                            {room?.maxGuests ? ` · up to ${String(room.maxGuests)} guests` : ""}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 800 }}>Smart pricing</div>
                          <div style={{ fontSize: "13px", color: room?.smartPricingEnabled ? "#15803d" : "#b45309", fontWeight: 900 }}>
                            {room?.smartPricingEnabled ? "Enabled" : "Standard"}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px", marginBottom: "12px" }}>
                        {[
                          { label: "Standard", value: room?.standardPrice ?? room?.priceFullday ?? room?.price_fullday },
                          { label: "Low demand", value: room?.lowDemandPrice ?? room?.priceMorning ?? room?.price_morning },
                          { label: "High demand", value: room?.highDemandPrice ?? room?.priceEvening ?? room?.price_evening },
                          { label: "Bed config", value: room?.bedConfiguration ?? room?.bedInfo ?? room?.bed_info },
                        ].map((item) => (
                          <div key={item.label} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "10px 12px" }}>
                            <div style={{ fontSize: "10px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase" }}>{item.label}</div>
                            <div style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 800, marginTop: "4px" }}>{String(item.value || "Not set")}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px", marginBottom: "12px" }}>
                        {[
                          { label: "Room configuration", value: room?.roomConfiguration ?? room?.description },
                          { label: "Balcony", value: room?.balcony },
                          { label: "Room vibe", value: room?.roomVibe },
                        ].map((item) => (
                          <div key={item.label} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "10px 12px" }}>
                            <div style={{ fontSize: "10px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase" }}>{item.label}</div>
                            <div style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 800, marginTop: "4px" }}>{String(item.value || "Not set")}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                        {roomAmenities.length > 0 ? roomAmenities.map((amenity: string, amenityIndex: number) => (
                          <span
                            key={`${amenity}-${amenityIndex}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "6px 10px",
                              borderRadius: "999px",
                              background: "#eff6ff",
                              color: "#1d4ed8",
                              fontSize: "11px",
                              fontWeight: 800,
                            }}
                          >
                            {amenity}
                          </span>
                        )) : (
                          <span style={{ fontSize: "12px", color: "#64748b" }}>No room amenities submitted yet.</span>
                        )}
                      </div>

                      {roomPhotos.length > 0 ? (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
                          {roomPhotos.map((url: string, photoIndex: number) => (
                            <img
                              key={`${url}-${photoIndex}`}
                              src={url}
                              alt={`Room ${index + 1} photo ${photoIndex + 1}`}
                              style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: "10px", border: "1px solid #e2e8f0" }}
                            />
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: "12px", color: "#64748b" }}>No room photos submitted yet.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: "13px", color: "#64748b", background: "#f8fafc", padding: "14px", borderRadius: "12px", border: "1px dashed #cbd5e1" }}>
                No room data was submitted in this application yet.
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: "#e2e8f0" }}>
            {/* Left Box: Identity & Story */}
            <div style={{ padding: "24px", background: "#f8fafc" }}>
               <h3 style={{ fontSize: "14px", fontWeight: 900, color: "#0e2b57", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}><User size={18} /> Identity & Background</h3>
               
               <div style={{ display: "flex", gap: "24px", marginBottom: "24px", alignItems: "start" }}>
                  {getDraftValue("host_photo_url", "hostPhoto", "photo_url") && (
                    <img src={String(getDraftValue("host_photo_url", "hostPhoto", "photo_url"))} alt="Profile" style={{ width: "80px", height: "80px", borderRadius: "12px", objectFit: "cover", border: "1px solid #e2e8f0" }} />
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", flex: 1 }}>
                     <div>
                       <div style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Full Name</div>
                       <div style={{ fontSize: "14px", color: "#0e2b57", fontWeight: 700 }}>{String(getDraftValue("primary_host_name", "fullName") || app.full_name)}</div>
                     </div>
                     <div>
                       <div style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Phone Number</div>
                       <div style={{ fontSize: "14px", color: "#0e2b57", fontWeight: 700 }}>{String(getDraftValue("mobile_number", "mobileNumber") || "N/A")}</div>
                     </div>
                     <div>
                       <div style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Email Address</div>
                       <div style={{ fontSize: "14px", color: "#0e2b57", fontWeight: 700 }}>{String(getDraftValue("email") || app.email)}</div>
                     </div>
                     <div>
                       <div style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Languages</div>
                       <div style={{ fontSize: "14px", color: "#0e2b57", fontWeight: 700 }}>{getDraftArray("languages_spoken", "languagesSpoken", "languages").join(", ") || "English"}</div>
                     </div>
                  </div>
               </div>

               <div style={{ marginBottom: "24px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", marginBottom: "4px" }}>Family Composition</div>
                  <div style={{ fontSize: "13px", color: "#334155", background: "white", padding: "12px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>{String(getDraftValue("family_composition", "familyComposition") || "Not specified")}</div>
               </div>

               <div style={{ marginBottom: "24px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", marginBottom: "4px" }}>Host Bio</div>
                  <div style={{ fontSize: "13px", color: "#334155", background: "white", padding: "12px", borderRadius: "10px", border: "1px solid #e2e8f0", lineHeight: 1.5 }}>{String(getDraftValue("host_bio", "hostBio") || "No bio available")}</div>
               </div>

               <div>
                  <div style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", marginBottom: "4px" }}>Famlo Experiences</div>
                  <div style={{ fontSize: "13px", color: "#334155", background: "white", padding: "12px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>{String(getDraftValue("famlo_experience", "culturalActivity", "famloExperience") || "None offered")}</div>
               </div>
            </div>

            {/* Right Box: Operations & Security */}
            <div style={{ padding: "24px", background: "#f8fafc" }}>
               <h3 style={{ fontSize: "14px", fontWeight: 900, color: "#0e2b57", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}><Home size={18} /> Housing & guest flow</h3>
               
               <div style={{ background: "white", padding: "16px", borderRadius: "14px", border: "1px solid #e2e8f0", marginBottom: "24px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Bathroom Type</div>
                      <div style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 800 }}>{String(getDraftValue("bathroom_type", "bathroomType") || "Private")}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Common Areas Access</div>
                      <div style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 700 }}>{commonAreas.join(", ") || "None specified"}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: "16px", borderTop: "1px solid #f1f5f9", paddingTop: "12px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", marginBottom: "4px" }}>Amenities</div>
                    <div style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 600 }}>{getDraftArray("amenities").join(", ") || "Standard"}</div>
                  </div>
               </div>

               <h3 style={{ fontSize: "14px", fontWeight: 900, color: "#0e2b57", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}><CreditCard size={18} /> Financial Configuration</h3>
               <div style={{ background: "#eff6ff", padding: "20px", borderRadius: "14px", border: "1px solid #bfdbfe", marginBottom: "24px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "12px", color: "#1e40af", fontWeight: 700 }}>Morning</span>
                      <span style={{ fontSize: "13px", color: "#1e40af", fontWeight: 900 }}>{String(getDraftValue("price_morning", "morningRate") || "Not set")}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "12px", color: "#1e40af", fontWeight: 700 }}>Afternoon</span>
                      <span style={{ fontSize: "13px", color: "#1e40af", fontWeight: 900 }}>{String(getDraftValue("price_afternoon", "afternoonRate") || "Not set")}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "12px", color: "#1e40af", fontWeight: 700 }}>Evening</span>
                      <span style={{ fontSize: "13px", color: "#1e40af", fontWeight: 900 }}>{String(getDraftValue("price_evening", "eveningRate") || "Not set")}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "12px", color: "#1e40af", fontWeight: 700 }}>Full day</span>
                      <span style={{ fontSize: "13px", color: "#1e40af", fontWeight: 900 }}>{String(getDraftValue("price_fullday", "priceFullday", "fullDayRate", "baseNightlyRate") || "Not set")}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "12px", color: "#1e40af", fontWeight: 700 }}>UPI ID</span>
                      <span style={{ fontSize: "13px", color: "#1e40af", fontWeight: 900 }}>{String(getDraftValue("upi_id", "upiId") || "MISSING")}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "12px", color: "#1e40af", fontWeight: 700 }}>A/C Holder</span>
                      <span style={{ fontSize: "13px", color: "#1e40af", fontWeight: 900 }}>{String(getDraftValue("bank_account_holder_name", "account_holder_name", "bankAccountHolderName", "accountHolderName") || "MISSING")}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "12px", color: "#1e40af", fontWeight: 700 }}>Account No.</span>
                      <span style={{ fontSize: "13px", color: "#1e40af", fontWeight: 900 }}>{String(getDraftValue("bank_account_number", "account_number", "bankAccountNumber", "accountNumber") || "MISSING")}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "12px", color: "#1e40af", fontWeight: 700 }}>IFSC Code</span>
                      <span style={{ fontSize: "13px", color: "#1e40af", fontWeight: 900 }}>{String(getDraftValue("ifsc_code", "ifscCode") || "MISSING")}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "12px", color: "#1e40af", fontWeight: 700 }}>Bank Name</span>
                      <span style={{ fontSize: "13px", color: "#1e40af", fontWeight: 900 }}>{String(getDraftValue("bank_name", "bankName") || "MISSING")}</span>
                    </div>
                  </div>
               </div>

               <h3 style={{ fontSize: "14px", fontWeight: 900, color: "#0e2b57", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}><ShieldCheck size={18} /> Compliance & Identity Assets</h3>
               <div style={{ background: "white", padding: "16px", borderRadius: "14px", border: "1px solid #e2e8f0", marginBottom: "24px", display: "grid", gap: "12px" }}>
                 {[
                   { label: "ID Type", value: getDraftValue("idDocumentType") },
                   { label: "ID Document Photo", url: getDraftValue("idDocumentPhotoUrl", "idDocumentUrl"), isAsset: true },
                   { label: "Live Selfie (Identity Match)", url: getDraftValue("liveSelfieUrl"), isAsset: true },
                   { label: "PAN Card", url: getDraftValue("panCardUrl"), isAsset: true },
                   { label: "PAN Mask", value: panMasked || "Not submitted" },
                   { label: "PAN Holder", value: panHolderName || "Not submitted" },
                   { label: "PAN Status", value: panVerificationStatus || (panRiskFlag ? "flagged" : "pending") },
                   { label: "Property ownership / Electricity / NOC", url: getDraftValue("propertyOwnershipProofUrl", "propertyOwnershipUrl"), isAsset: true },
                   { label: "NOC / Permission", url: getDraftValue("nocUrl"), isAsset: true },
                   { label: "Police Verification", url: getDraftValue("policeVerificationUrl"), isAsset: true },
                   { label: "FSSAI Registration", url: getDraftValue("fssaiRegistrationUrl"), isAsset: true },
                 ].map((doc) => (
                   <div key={doc.label} style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "10px" }}>
                     <span style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 700 }}>{doc.label}</span>
                     {doc.isAsset ? (
                       doc.url ? (
                         <a href={String(doc.url)} target="_blank" rel="noreferrer" style={{ fontSize: "12px", fontWeight: 900, color: "#165dcc", textDecoration: "none" }}>
                           View Document
                         </a>
                       ) : <span style={{ fontSize: "12px", fontWeight: 900, color: "#dc2626" }}>Missing Asset</span>
                     ) : (
                       <span style={{ fontSize: "13px", fontWeight: 900, color: "#0e2b57" }}>{String(doc.value || "N/A")}</span>
                     )}
                   </div>
                 ))}
               </div>

               <h3 style={{ fontSize: "14px", fontWeight: 900, color: "#0e2b57", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}><Info size={18} /> Agreement & GST</h3>
               <div style={{ background: "white", padding: "16px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
                 <div style={{ display: "grid", gap: "10px" }}>
                   <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                     <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 800 }}>Host agreement</span>
                     <span style={{ fontSize: "13px", color: hostAgreementAccepted ? "#15803d" : "#dc2626", fontWeight: 900 }}>
                       {hostAgreementAccepted ? "Accepted" : "Not accepted"}
                     </span>
                   </div>
                   <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                     <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 800 }}>Terms and privacy</span>
                     <span style={{ fontSize: "13px", color: termsPrivacyAccepted ? "#15803d" : "#dc2626", fontWeight: 900 }}>
                       {termsPrivacyAccepted ? "Accepted" : "Pending"}
                     </span>
                   </div>
                   <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                     <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 800 }}>Commission terms</span>
                     <span style={{ fontSize: "13px", color: commissionAgreementAccepted ? "#15803d" : "#dc2626", fontWeight: 900 }}>
                       {commissionAgreementAccepted ? "Accepted" : "Pending"}
                     </span>
                   </div>
                   <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                     <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 800 }}>Code of conduct</span>
                     <span style={{ fontSize: "13px", color: codeOfConductAccepted ? "#15803d" : "#dc2626", fontWeight: 900 }}>
                       {codeOfConductAccepted ? "Accepted" : "Pending"}
                     </span>
                   </div>
                   <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                     <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 800 }}>Cancellation policy</span>
                     <span style={{ fontSize: "13px", color: cancellationPolicyAccepted ? "#15803d" : "#dc2626", fontWeight: 900 }}>
                       {cancellationPolicyAccepted ? "Accepted" : "Pending"}
                     </span>
                   </div>
                   <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                     <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 800 }}>GST applicable</span>
                     <span style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 900 }}>
                       {gstApplicable ? "Yes" : "No"}
                     </span>
                   </div>
                   {gstApplicable ? (
                     <>
                       <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                         <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 800 }}>GST declaration</span>
                         <span style={{ fontSize: "13px", color: gstDeclarationAccepted ? "#15803d" : "#dc2626", fontWeight: 900 }}>
                           {gstDeclarationAccepted ? "Accepted" : "Pending"}
                         </span>
                       </div>
                       <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                         <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 800 }}>GST number</span>
                         <span style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 900 }}>
                           {String(getDraftValue("gstNumber") || "Not provided")}
                         </span>
                       </div>
                     </>
                   ) : null}
                 </div>
               </div>

               <h3 style={{ fontSize: "14px", fontWeight: 900, color: "#0e2b57", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}><MapPin size={18} /> Precise Location</h3>
               <div style={{ background: "white", padding: "16px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "12px" }}>
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Area / locality</div>
                      <div style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 700, marginTop: "4px" }}>{locality || "Not provided"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Pincode</div>
                      <div style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 700, marginTop: "4px" }}>{String(getDraftValue("pincode") || "Not provided")}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Full Address</div>
                  <div style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 600, marginTop: "4px" }}>{String(getDraftValue("street_address", "streetAddress", "property_address", "propertyAddress") || "Not provided")}</div>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>{locality || String(getDraftValue("city") || "")}, {String(getDraftValue("state") || "")}, {String(getDraftValue("country") || "")}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "12px" }}>
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Exact latitude</div>
                      <div style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 700, marginTop: "4px" }}>{latitude || "Not provided"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Exact longitude</div>
                      <div style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 700, marginTop: "4px" }}>{longitude || "Not provided"}</div>
                    </div>
                  </div>
                  {mapLink ? (
                    <a href={mapLink} target="_blank" rel="noreferrer" style={{ display: "inline-flex", marginTop: "12px", fontSize: "12px", fontWeight: 900, color: "#165dcc", textDecoration: "none" }}>
                      Open exact map pin
                    </a>
                  ) : null}
                  <div style={{ marginTop: "14px", borderTop: "1px solid #f1f5f9", paddingTop: "12px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", marginBottom: "4px" }}>Neighborhood summary</div>
                    <div style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 600 }}>{String(getDraftValue("neighborhood_desc", "neighborhoodDesc") || "Not provided")}</div>
                  </div>
                  <div style={{ marginTop: "14px", borderTop: "1px solid #f1f5f9", paddingTop: "12px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", marginBottom: "4px" }}>Accessibility details</div>
                    <div style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 600 }}>{String(getDraftValue("accessibility_desc", "accessibilityDesc") || "Not provided")}</div>
                  </div>
                  <div style={{ marginTop: "14px", borderTop: "1px solid #f1f5f9", paddingTop: "12px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", marginBottom: "4px" }}>Landmarks</div>
                    <div style={{ fontSize: "13px", color: "#0e2b57", fontWeight: 600 }}>
                      {landmarks.length > 0
                        ? landmarks.map((landmark: any) => `${landmark?.name || "Landmark"}${landmark?.distance ? ` - ${landmark.distance}` : ""}`).join(", ")
                        : "Not provided"}
                    </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Vetting Checklist */}
      <div style={{ padding: "24px", borderBottom: "1px solid #f1f5f9" }}>
        <div style={{ fontSize: "13px", fontWeight: 900, color: "#0e2b57", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Vetting Scorecard</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {checklist.map((item) => (
            <button key={item.id} onClick={() => toggle(item.id)} style={{ display: "flex", gap: "12px", alignItems: "flex-start", background: item.checked ? "#f0fdf4" : "#white", border: `1px solid ${item.checked ? "#22c55e" : "#e2e8f0"}`, borderRadius: "12px", padding: "12px 16px", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
              {item.checked ? <CheckSquare size={18} color="#22c55e" /> : <Square size={18} color="#94a3b8" />}
              <div>
                <div style={{ fontSize: "14px", fontWeight: 800, color: item.checked ? "#15803d" : "#0e2b57" }}>{item.label}</div>
                <div style={{ fontSize: "12px", color: "#64748b" }}>{item.description}</div>
              </div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: "16px", height: "4px", borderRadius: "2px", background: "#f1f5f9" }}>
          <div style={{ height: "100%", borderRadius: "2px", background: allChecked ? "#22c55e" : "#165dcc", width: `${(checklist.filter(i => i.checked).length / checklist.length) * 100}%`, transition: "width 0.3s ease" }} />
        </div>
        <div style={{ textAlign: "right", fontSize: "11px", fontWeight: 800, color: "#64748b", marginTop: "6px" }}>{checklist.filter(i => i.checked).length}/{checklist.length} criteria met</div>
      </div>

      {/* Decision Area */}
      <div style={{ padding: "24px" }}>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional: Add audit notes or rejection feedback..." style={{ width: "100%", minHeight: "80px", padding: "12px 16px", borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "13px", fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box", marginBottom: "16px" }} />
        {requestError ? (
          <div style={{ marginBottom: "16px", padding: "12px 14px", borderRadius: "12px", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: "13px", fontWeight: 700 }}>
            {requestError}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: "12px" }}>
          <button onClick={() => handleDecision("rejected")} disabled={submitting} style={{ flex: 1, padding: "14px", borderRadius: "12px", border: "2px solid #fca5a5", background: "white", color: "#dc2626", fontWeight: 900, fontSize: "14px", cursor: "pointer" }}>{submitting ? <Loader2 className="animate-spin" size={16} /> : "✗ Reject Application"}</button>
          <button onClick={() => handleDecision("approved")} disabled={!allChecked || submitting} style={{ flex: 2, padding: "14px", borderRadius: "12px", border: "none", background: allChecked ? "#22c55e" : "#e2e8f0", color: allChecked ? "white" : "#94a3b8", fontWeight: 900, fontSize: "14px", cursor: allChecked ? "pointer" : "not-allowed", transition: "all 0.2s" }}>{submitting ? <Loader2 className="animate-spin" size={16} /> : allChecked ? "✓ Approve & Grant Dashboard Access" : `Complete ${checklist.length - checklist.filter(i => i.checked).length} more checks to Approve`}</button>
        </div>
      </div>
    </div>
  );
}

export default function VettingScorecard({ applications, actorId, actorRole }: VettingScorecardProps) {
  if (applications.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "80px 32px", color: "#64748b" }}>
        <CheckCircle2 size={48} color="#22c55e" style={{ marginBottom: "16px", marginLeft: "auto", marginRight: "auto" }} />
        <div style={{ fontSize: "20px", fontWeight: 900, color: "#0e2b57" }}>All caught up!</div>
        <div style={{ fontSize: "14px", marginTop: "8px" }}>No pending applications in your review queue.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 900, color: "#0e2b57", margin: 0 }}>Review Queue</h1>
        <p style={{ color: "#64748b", fontSize: "14px", marginTop: "8px" }}>{applications.length} partner application{applications.length === 1 ? "" : "s"} awaiting assessment.</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {applications.map((app) => (
          <ApplicationCard key={app.id} app={app} actorId={actorId} actorRole={actorRole} />
        ))}
      </div>
    </div>
  );
}
