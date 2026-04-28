"use client";

import { useState } from "react";
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
}

export default function DocumentsTab({ compliance, setCompliance, onSave, saving }: DocumentsTabProps) {
  const [uploadingId, setUploadingId] = useState<string | null>(null);

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

  return (
    <div className={styles.tabContent}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Documents & Verification</h2>
        <p className={styles.sectionSubtitle}>Manage your listing access and benefits by submitting the required documentation.</p>
      </div>

      <div className={styles.formGrid}>
        {categories.map((cat, idx) => (
          <div key={idx} style={{ gridColumn: '1 / -1', marginBottom: '40px' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '20px' }}>
               <div style={{ width: '48px', height: '48px', background: 'white', border: '1px solid #f1f5f9', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 {cat.icon}
               </div>
               <div>
                 <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#0e2b57', margin: 0 }}>{cat.title}</h3>
                 <p style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', margin: 0 }}>{cat.description}</p>
               </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {cat.docs.map((doc) => {
                const url = (compliance as any)[doc.id];
                const isUploaded = !!url;
                const isUploading = uploadingId === doc.id;
                const isOnboardingIdentityDoc = doc.id === "idDocumentUrl" || doc.id === "liveSelfieUrl";

                return (
                  <div key={doc.id} style={{ background: 'white', border: '2px solid #f1f5f9', borderRadius: '24px', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                      <div style={{ width: '40px', height: '40px', background: '#f8fafc', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isUploaded ? <FileCheck className="text-emerald-500" size={20} /> : <FileText className="text-slate-400" size={20} />}
                      </div>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 900, color: '#0e2b57' }}>{doc.label}</div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>{doc.desc}</div>
                        {isOnboardingIdentityDoc && isUploaded ? (
                          <div style={{ marginTop: "8px", fontSize: "11px", fontWeight: 900, color: "#15803d" }}>Attached automatically from Step 1 onboarding</div>
                        ) : null}
                      </div>
                    </div>
                    <div>
                      {isUploaded ? (
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', fontWeight: 900, color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <ShieldCheck size={12} /> Verified Asset
                            </div>
                            <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px', fontWeight: 600, color: '#165dcc', textDecoration: 'none' }}>View Document</a>
                          </div>
                          <label className={styles.secondaryBtn} style={{ padding: '10px 20px', borderRadius: '12px', minWidth: 'auto', cursor: 'pointer' }}>
                            {isUploading ? <Loader2 className="animate-spin" size={16} /> : "Update"}
                            <input type="file" style={{ display: 'none' }} onChange={(e) => handleFileChange(e, doc.id)} />
                          </label>
                        </div>
                      ) : (
                        <label className={styles.primaryBtn} style={{ padding: '12px 24px', borderRadius: '12px', minWidth: 'auto', cursor: 'pointer' }}>
                           {isUploading ? <Loader2 className="animate-spin" size={16} /> : <><Upload size={16} /> <span style={{ marginLeft: '8px' }}>Upload</span></>}
                           <input type="file" style={{ display: 'none' }} onChange={(e) => handleFileChange(e, doc.id)} />
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
