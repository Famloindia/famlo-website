"use client";

import { useState } from "react";
import { CheckCircle2, FileText, ShieldCheck, Upload, X } from "lucide-react";

import styles from "../../onboarding.module.css";
import { FAMLO_MASTER_PLATFORM_AGREEMENT } from "@/lib/famlo-master-platform-agreement";
import { MAX_DOCUMENT_UPLOAD_BYTES, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/upload-limits";

const IMAGE_FILE_EXTENSION_PATTERN = /\.(jpe?g|png|webp|heic|heif)$/;

const AGREEMENTS = [
  { id: "hostAgreementAccepted", label: "Host service agreement" },
  { id: "termsPrivacyAccepted", label: "Terms, privacy and consent" },
  { id: "commissionAgreementAccepted", label: "Commission and platform fee" },
  { id: "codeOfConductAccepted", label: "Code of conduct" },
  { id: "cancellationPolicyAccepted", label: "Cancellation and penalty terms" },
] as const;

async function uploadDocument(file: File, folder: string): Promise<string> {
  const lowerName = file.name.toLowerCase();
  if (
    !file.type.startsWith("image/") &&
    !IMAGE_FILE_EXTENSION_PATTERN.test(lowerName) &&
    file.type !== "application/pdf" &&
    !lowerName.endsWith(".pdf")
  ) {
    throw new Error("Upload JPG, PNG, WEBP, HEIC, or PDF files only.");
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

  return payload.url;
}

export default function Step3Space({ data, update }: any) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>, field: string, folder: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(field);
    setUploadError(null);

    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (file.size > (isPdf ? MAX_DOCUMENT_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES)) {
        throw new Error(isPdf ? "PDF must be 10MB or smaller." : "Image must be 15MB or smaller.");
      }
      const url = await uploadDocument(file, folder);
      update(field, url);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Document upload failed.");
    } finally {
      setUploading(null);
      event.target.value = "";
    }
  };

  const complete =
    data.hostAgreementAccepted &&
    data.termsPrivacyAccepted &&
    data.commissionAgreementAccepted &&
    data.codeOfConductAccepted &&
    data.cancellationPolicyAccepted;

  return (
    <div className={styles.animateIn}>
      <div className={styles.onboardingHeader}>
        <span className={styles.eyebrow} style={{ color: "#0e2b57" }}>Legal and payouts</span>
        <h1>Finish the legal and payment setup.</h1>
        <p>Upload the documents, add payout details, and accept the policies that let Famlo move your listing into review.</p>
      </div>

      <div className={styles.formGrid}>
        <section className={`${styles.formGroup} ${styles.fullWidth} ${styles.panelSection}`}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Documents</h2>
              <p>Ownership proof is the key file for review. NOC and PAN are optional here and can be shared now or later.</p>
            </div>
            <div className={styles.sectionPill}>Optional docs</div>
          </div>

          <div className={styles.docGrid}>
            {[
              {
                field: "propertyOwnershipProofUrl",
                title: "Property ownership proof",
                subtitle: "Upload ownership proof, electricity bill, or rent/lease support if accepted by your local rules.",
                folder: "host-property-docs",
              },
              {
                field: "nocDocumentUrl",
                title: "NOC document",
                subtitle: "Optional, but helpful for faster manual review and local verification.",
                folder: "host-noc-docs",
              },
              {
                field: "panCardUrl",
                title: "PAN card",
                subtitle: "Optional in this step. Add it now or later if your payout review needs it.",
                folder: "host-pan-docs",
              },
            ].map((doc) => {
              const value = data[doc.field];
              return (
                <div key={doc.field} className={styles.docCard}>
                  <div className={styles.docCardTop}>
                    <div className={styles.docIcon}>
                      <ShieldCheck size={16} />
                    </div>
                    <div>
                      <div className={styles.docTitle}>{doc.title}</div>
                      <div className={styles.docSubtitle}>{doc.subtitle}</div>
                    </div>
                  </div>

                  <div className={styles.docActions}>
                    {value ? (
                      <a href={value} target="_blank" rel="noreferrer" className={styles.docLink}>
                        View uploaded file
                      </a>
                    ) : (
                      <div className={styles.docMissing}>Not uploaded yet</div>
                    )}

                    <label className={styles.primaryMiniBtn}>
                      <Upload size={14} />
                      {uploading === doc.field ? "Uploading..." : value ? "Replace" : "Upload"}
                      <input
                        type="file"
                        accept="image/*,.heic,.heif,.pdf"
                        hidden
                        onChange={(event) => void handleUpload(event, doc.field, doc.folder)}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className={`${styles.formGroup} ${styles.fullWidth} ${styles.panelSection}`}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Payout details</h2>
              <p>Use the same payout account that should receive host earnings.</p>
            </div>
            <div className={styles.sectionPill}>Secure</div>
          </div>

          <div className={styles.choiceGrid}>
            <label>
              <span>UPI ID</span>
              <input className={styles.inputField} value={data.upiId} onChange={(event) => update("upiId", event.target.value)} placeholder="name@upi" />
            </label>
            <label>
              <span>Account holder name</span>
              <input className={styles.inputField} value={data.accountHolderName} onChange={(event) => update("accountHolderName", event.target.value)} placeholder="As per bank records" />
            </label>
            <label>
              <span>Account number</span>
              <input className={styles.inputField} inputMode="numeric" value={data.accountNumber} onChange={(event) => update("accountNumber", event.target.value)} placeholder="Account number" />
            </label>
            <label>
              <span>Confirm account number</span>
              <input className={styles.inputField} inputMode="numeric" value={data.confirmAccountNumber} onChange={(event) => update("confirmAccountNumber", event.target.value)} placeholder="Re-enter account number" />
            </label>
            <label>
              <span>IFSC code</span>
              <input className={styles.inputField} value={data.ifscCode} onChange={(event) => update("ifscCode", event.target.value.toUpperCase())} placeholder="SBIN0001234" />
            </label>
            <label>
              <span>Bank name</span>
              <input className={styles.inputField} value={data.bankName} onChange={(event) => update("bankName", event.target.value)} placeholder="Bank name" />
            </label>
          </div>
        </section>

        <section className={`${styles.formGroup} ${styles.fullWidth} ${styles.panelSection}`}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Agreements</h2>
              <p>Review the master agreement and accept each policy to finish your submission.</p>
            </div>
            <div className={styles.sectionPill}>Required</div>
          </div>

          <button type="button" className={styles.linkButton} onClick={() => setAgreementOpen(true)}>
            <FileText size={14} />
            Open Famlo master platform agreement
          </button>

          <div className={styles.agreementList}>
            {AGREEMENTS.map((agreement) => (
              <label key={agreement.id} className={styles.agreementRow}>
                <input
                  type="checkbox"
                  checked={Boolean(data[agreement.id])}
                  onChange={(event) => update(agreement.id, event.target.checked)}
                />
                <span>{agreement.label}</span>
                {data[agreement.id] ? <CheckCircle2 size={16} color="#059669" /> : null}
              </label>
            ))}
          </div>

          <div className={styles.finishNote}>
            After submission, Famlo sends the draft to admin and team review. Once approved, the homestay can go live and login details can be emailed to the host.
          </div>
        </section>
      </div>

      {uploadError ? <div className={styles.errorBanner}>{uploadError}</div> : null}

      {complete ? (
        <div className={styles.successBanner}>
          <ShieldCheck size={16} />
          All legal checkboxes are accepted. You are ready to submit for review.
        </div>
      ) : null}

      {agreementOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className={styles.modalBackdrop}
          onClick={() => setAgreementOpen(false)}
        >
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalKicker}>Famlo agreement</div>
                <h3>{FAMLO_MASTER_PLATFORM_AGREEMENT.title}</h3>
                <p className={styles.docSubtitle}>{FAMLO_MASTER_PLATFORM_AGREEMENT.subtitle}</p>
              </div>
              <button type="button" className={styles.iconOnlyBtn} onClick={() => setAgreementOpen(false)}>
                <X size={14} />
              </button>
            </div>
            <div className={styles.modalBody}>
              {FAMLO_MASTER_PLATFORM_AGREEMENT.sections.map((section) => (
                <div key={section.id} className={styles.modalSection}>
                  <h4>{section.title}</h4>
                  {section.body.map((paragraph) => (
                    <p key={paragraph.slice(0, 20)}>{paragraph}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
