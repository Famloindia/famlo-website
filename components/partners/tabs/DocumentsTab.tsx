"use client";

import { useEffect, useState } from "react";
import styles from "../dashboard.module.css";
import { ShieldCheck, FileCheck, FileText, Upload, Loader2, CreditCard, Home, Star } from "lucide-react";
import { MAX_DOCUMENT_UPLOAD_BYTES, MAX_IMAGE_UPLOAD_BYTES, formatImageUploadLimitLabel } from "@/lib/upload-limits";

interface DocumentsTabProps {
  compliance: {
    panCardUrl?: string;
    panNumber?: string;
    panMasked?: string;
    panLastFour?: string;
    panHolderName?: string;
    panDateOfBirth?: string;
    panVerificationStatus?: string;
    panVerificationProvider?: string;
    panRiskFlag?: boolean;
    panConsentGiven?: boolean;
    isPanVerified?: boolean;
    panVerifiedAt?: string;
    gstin?: string;
    gstVerificationStatus?: string;
    platformAgreementAcceptedAt?: string;
    propertyOwnershipUrl?: string;
    nocUrl?: string;
    policeVerificationUrl?: string;
    fssaiRegistrationUrl?: string;
    idDocumentType?: string;
    idDocumentUrl?: string;
    liveSelfieUrl?: string;
    adminNotes?: string;
  };
  setCompliance: (c: any) => void;
  onSave: (options?: any) => Promise<void> | void;
  saving?: boolean;
  appearanceMode?: "dark" | "light";
}

export default function DocumentsTab({ compliance, setCompliance, onSave, saving, appearanceMode = "dark" }: DocumentsTabProps) {
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [gstinDraft, setGstinDraft] = useState(compliance.gstin ?? "");
  const [gstState, setGstState] = useState<{
    verificationStatus: string;
    rejectionReason?: string | null;
    loading: boolean;
    saving: boolean;
    message?: { type: "success" | "error"; text: string } | null;
  }>({
    verificationStatus: compliance.gstVerificationStatus ?? (compliance.gstin ? "pending_review" : "not_provided"),
    rejectionReason: null,
    loading: false,
    saving: false,
    message: null,
  });
  const isDarkTheme = appearanceMode === "dark";
  const palette = {
    title: isDarkTheme ? "#f8fafc" : "#0f172a",
    body: isDarkTheme ? "rgba(226, 232, 240, 0.76)" : "#475569",
    subtle: isDarkTheme ? "rgba(148, 163, 184, 0.88)" : "#64748b",
    border: isDarkTheme ? "rgba(148, 163, 184, 0.16)" : "#e2e8f0",
    card: isDarkTheme ? "rgba(15, 23, 42, 0.72)" : "#ffffff",
    cardAlt: isDarkTheme ? "rgba(10, 18, 34, 0.94)" : "#f8fafc",
    success: isDarkTheme ? "#86efac" : "#166534",
  };

  useEffect(() => {
    setGstinDraft(compliance.gstin ?? "");
  }, [compliance.gstin]);

  useEffect(() => {
    let cancelled = false;

    async function loadGstProfile() {
      setGstState((current) => ({ ...current, loading: true }));
      try {
        const familyId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("family") : null;
        if (!familyId) {
          setGstState((current) => ({ ...current, loading: false }));
          return;
        }

        const response = await fetch(`/api/host/gst-profile?familyId=${encodeURIComponent(familyId)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          error?: string;
          profile?: {
            gstin?: string;
            verificationStatus?: string;
            rejectionReason?: string | null;
          };
        };

        if (!response.ok || !payload.profile) {
          throw new Error(payload.error || "Unable to load GST profile.");
        }

        if (!cancelled) {
          const nextGstin = payload.profile.gstin ?? "";
          setGstinDraft(nextGstin);
          setCompliance((current: any) => ({
            ...current,
            gstin: nextGstin,
            gstVerificationStatus: payload.profile?.verificationStatus ?? current.gstVerificationStatus,
          }));
          setGstState((current) => ({
            ...current,
            verificationStatus: payload.profile?.verificationStatus ?? current.verificationStatus,
            rejectionReason: payload.profile?.rejectionReason ?? null,
            loading: false,
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setGstState((current) => ({
            ...current,
            loading: false,
            message: { type: "error", text: error instanceof Error ? error.message : "Unable to load GST profile." },
          }));
        }
      }
    }

    void loadGstProfile();
    return () => {
      cancelled = true;
    };
  }, [setCompliance]);

  const categories = [
    {
      title: "Identity Verification",
      description: "Core identity assets captured during your onboarding.",
      icon: <ShieldCheck className="text-blue-600" />,
      docs: [
        { id: 'idDocumentUrl', label: 'ID Proof Photo', desc: `${compliance.idDocumentType || 'Government ID'} document. Captured during Step 1 onboarding.` },
        { id: 'liveSelfieUrl', label: 'Live Verification Selfie', desc: 'Real-time identity match captured during Step 1 onboarding.' },
      ]
    },
    {
      title: "To get payments",
      description: "Essential for financial verification and tax compliance.",
      icon: <CreditCard className="text-emerald-600" />,
      docs: [
        { id: 'panCardUrl', label: 'PAN Card', desc: 'Permanent Account Number for TDS & Settlements.' },
      ]
    },
    {
      title: "To get your first booking",
      description: "Property vetting required to activate guest reservations.",
      icon: <Home className="text-blue-600" />,
      docs: [
        { id: 'propertyOwnershipUrl', label: 'Property Ownership Proof', desc: 'Electricity bill or Registry documents.' },
        { id: 'nocUrl', label: 'NOC / Permission', desc: 'No Objection Certificate from society or owner.' },
      ]
    },
    {
      title: "To be a top lister",
      description: "Get the 'Verified Host' badge and higher search ranking.",
      icon: <Star className="text-orange-600" />,
      docs: [
        { id: 'policeVerificationUrl', label: 'Police Verification', desc: 'Recent local police clearance certificate.' },
        { id: 'fssaiRegistrationUrl', label: 'FSSAI Registration', desc: 'Required for hosts providing home-cooked meals.' },
      ]
    }
  ];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (file.size > (isPdf ? MAX_DOCUMENT_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES)) {
      alert(isPdf ? "PDF is too large. Max 10MB allowed." : `Image is too large. Max ${formatImageUploadLimitLabel()} allowed.`);
      return;
    }

    try {
      setUploadingId(id);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "compliance");

      const res = await fetch("/api/onboarding/home/upload", {
        method: "POST",
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      const nextCompliance = { ...compliance, [id]: data.url };
      setCompliance(nextCompliance);
      await onSave({ updatedCompliance: nextCompliance });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingId(null);
      e.target.value = "";
    }
  };

  const handleGstinSave = async () => {
    const familyId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("family") : null;
    if (!familyId) {
      setGstState((current) => ({
        ...current,
        message: { type: "error", text: "Family context is missing. Refresh the dashboard and try again." },
      }));
      return;
    }

    setGstState((current) => ({ ...current, saving: true, message: null }));
    try {
      const response = await fetch("/api/host/gst-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          gstin: gstinDraft,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        profile?: {
          gstin?: string;
          verificationStatus?: string;
          rejectionReason?: string | null;
        };
      };

      if (!response.ok || !payload.profile) {
        throw new Error(payload.error || "Unable to save GSTIN.");
      }

      const nextGstin = payload.profile.gstin ?? "";
      setCompliance((current: any) => ({
        ...current,
        gstin: nextGstin,
        gstVerificationStatus: payload.profile?.verificationStatus ?? current.gstVerificationStatus,
      }));
      setGstState((current) => ({
        ...current,
        saving: false,
        verificationStatus: payload.profile?.verificationStatus ?? current.verificationStatus,
        rejectionReason: payload.profile?.rejectionReason ?? null,
        message: { type: "success", text: nextGstin ? "GSTIN updated and connected to the host tax profile." : "GSTIN removed from the host tax profile." },
      }));
    } catch (error) {
      setGstState((current) => ({
        ...current,
        saving: false,
        message: { type: "error", text: error instanceof Error ? error.message : "Unable to save GSTIN." },
      }));
    }
  };

  return (
    <div className={`${styles.flexCol} ${styles.animateIn}`} style={{ gap: '32px' }}>
      <div
        style={{
          marginBottom: "8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          borderBottom: `1px solid ${palette.border}`,
          paddingBottom: "16px",
        }}
      >
        <div>
          <h2 style={{ fontSize: "24px", fontWeight: 900, margin: "0 0 4px", color: palette.title }}>
            Documents & Verification
          </h2>
          <p style={{ fontSize: "13px", margin: 0, color: palette.body, fontWeight: 600 }}>
            Manage your listing access and benefits by submitting the required documentation.
          </p>
        </div>
      </div>

      <div className={styles.flexCol} style={{ gap: '16px' }}>
        {categories.map((cat, idx) => (
          <div key={idx} style={{ gridColumn: '1 / -1', marginBottom: '40px' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '20px' }}>
               <div style={{ width: '48px', height: '48px', background: palette.cardAlt, border: `1px solid ${palette.border}`, borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 {cat.icon}
               </div>
               <div>
                 <h3 style={{ fontSize: '18px', fontWeight: 900, color: palette.title, margin: 0 }}>{cat.title}</h3>
                 <p style={{ fontSize: '13px', fontWeight: 600, color: palette.body, margin: 0 }}>{cat.description}</p>
               </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {cat.docs.map((doc) => {
                const url = (compliance as any)[doc.id];
                const isUploaded = !!url;
                const isUploading = uploadingId === doc.id;
                const isOnboardingIdentityDoc = doc.id === "idDocumentUrl" || doc.id === "liveSelfieUrl";

                return (
                  <div key={doc.id} style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: '24px', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                      <div style={{ width: '40px', height: '40px', background: palette.cardAlt, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isUploaded ? <FileCheck className="text-emerald-500" size={20} /> : <FileText className="text-slate-400" size={20} />}
                      </div>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 900, color: palette.title }}>{doc.label}</div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: palette.body }}>{doc.desc}</div>
                        {isOnboardingIdentityDoc && isUploaded ? (
                          <div style={{ marginTop: "8px", fontSize: "11px", fontWeight: 900, color: palette.success }}>Attached automatically from Step 1 onboarding</div>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      {isUploaded ? (
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', fontWeight: 900, color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <ShieldCheck size={12} /> Verified Asset
                            </div>
                            <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px', fontWeight: 600, color: '#60a5fa', textDecoration: 'none' }}>View Document</a>
                          </div>
                          <label className={styles.secondaryBtn} style={{ padding: '10px 20px', borderRadius: '12px', width: 'auto', minWidth: 'auto', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isUploading ? <Loader2 className="animate-spin" size={16} /> : "Update"}
                            <input type="file" style={{ display: 'none' }} onChange={(e) => handleFileChange(e, doc.id)} />
                          </label>
                        </div>
                      ) : (
                        <label className={styles.primaryBtn} style={{ padding: '12px 24px', borderRadius: '12px', width: 'auto', minWidth: 'auto', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                           {isUploading ? <Loader2 className="animate-spin" size={16} /> : <><Upload size={16} /> <span style={{ marginLeft: '8px' }}>Upload</span></>}
                           <input type="file" style={{ display: 'none' }} onChange={(e) => handleFileChange(e, doc.id)} />
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {cat.title === "To get payments" ? (
              <div style={{ marginTop: "16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "18px", padding: "16px 18px", display: "grid", gap: "10px" }}>
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", marginBottom: "6px" }}>GSTIN</div>
                    <input
                      className={styles.inputField}
                      value={gstinDraft}
                      onChange={(event) => setGstinDraft(event.target.value.toUpperCase())}
                      placeholder="27ABCDE1234F1Z5"
                      style={{ background: "white" }}
                    />
                    <div style={{ marginTop: "6px", fontSize: "11px", fontWeight: 600, color: "#64748b" }}>
                      Optional unless the host or business is GST registered. This value updates the shared host GST/tax profile used by finance and compliance.
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", marginBottom: "4px" }}>Status</div>
                      <div style={{ fontSize: "13px", fontWeight: 800, color: gstState.verificationStatus === "verified" ? "#15803d" : gstState.verificationStatus === "rejected" ? "#b91c1c" : "#0e2b57" }}>
                        {gstState.loading ? "Loading..." : gstState.verificationStatus}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      style={{ width: "auto", minWidth: "auto", padding: "10px 18px" }}
                      onClick={() => void handleGstinSave()}
                      disabled={gstState.saving || saving}
                    >
                      {gstState.saving ? <Loader2 className="animate-spin" size={16} /> : "Update GSTIN"}
                    </button>
                  </div>
                  {gstState.rejectionReason ? (
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#b91c1c" }}>
                      Rejection reason: {gstState.rejectionReason}
                    </div>
                  ) : null}
                  {gstState.message ? (
                    <div style={{ fontSize: "11px", fontWeight: 700, color: gstState.message.type === "success" ? "#166534" : "#b91c1c" }}>
                      {gstState.message.text}
                    </div>
                  ) : null}
                </div>

                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "18px", padding: "16px 18px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", marginBottom: "6px" }}>Platform Agreement</div>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: compliance.platformAgreementAcceptedAt ? "#15803d" : "#0e2b57" }}>
                    {compliance.platformAgreementAcceptedAt ? "Accepted" : "Pending"}
                  </div>
                  <div style={{ marginTop: "6px", fontSize: "11px", fontWeight: 600, color: "#64748b" }}>
                    {compliance.platformAgreementAcceptedAt
                      ? `Accepted on ${new Date(compliance.platformAgreementAcceptedAt).toLocaleDateString("en-IN")}`
                      : "Waiting for onboarding agreement acceptance."}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
