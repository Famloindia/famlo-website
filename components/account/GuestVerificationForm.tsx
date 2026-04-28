"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, User, Mail, MapPin, ChevronDown } from "lucide-react";
import { useUser } from "@/components/auth/UserContext";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { hasGuestVerificationSubmission, isGuestProfileComplete } from "@/lib/user-profile";
import { MAX_IMAGE_UPLOAD_BYTES, formatImageUploadLimitLabel } from "@/lib/upload-limits";

interface GuestVerificationFormProps {
  title?: string;
  description?: string;
  buttonLabel?: string;
  compact?: boolean;
  onSuccess?: () => Promise<void> | void;
}

type VerificationState = {
  email: string;
  phone: string;
  name: string;
  city: string;
  state: string;
  about: string;
  dob: string;
  gender: string;
  avatarUrl: string;
  idDocumentUrl: string;
};

type UploadPickerKind = "avatar" | "aadhaar";

export function GuestVerificationForm({
  title = "Complete guest verification",
  description = "Share your profile, city, and Aadhaar-with-face photo so Famlo can review your booking identity.",
  buttonLabel = "Submit for review",
  compact = false,
  onSuccess,
}: Readonly<GuestVerificationFormProps>): React.JSX.Element {
  const { user, profile, refreshProfile } = useUser();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const hasSavedProfile = isGuestProfileComplete(profile);
  const [manualEditMode, setManualEditMode] = useState(false);
  const [form, setForm] = useState<VerificationState>({
    email: "",
    phone: "",
    name: "",
    city: "",
    state: "",
    about: "",
    dob: "",
    gender: "",
    avatarUrl: "",
    idDocumentUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "aadhaar" | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [activePicker, setActivePicker] = useState<UploadPickerKind | null>(null);
  const [cameraTarget, setCameraTarget] = useState<UploadPickerKind | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [submittedStatus, setSubmittedStatus] = useState<string | null>(null);
  const avatarCameraRef = useRef<HTMLInputElement>(null);
  const avatarGalleryRef = useRef<HTMLInputElement>(null);
  const aadhaarCameraRef = useRef<HTMLInputElement>(null);
  const aadhaarGalleryRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const kycStatus = submittedStatus ?? profile?.kyc_status ?? null;
  const hasVerificationSubmission = submittedStatus ? true : hasGuestVerificationSubmission(profile);
  const resolvedForm = {
    email: form.email || profile?.email || user?.email || "",
    phone: form.phone || profile?.phone || user?.phone || "",
    name: form.name || profile?.name || "",
    city: form.city || profile?.city || "",
    state: form.state || profile?.state || "",
    about: form.about || profile?.about || "",
    dob: form.dob || profile?.date_of_birth || "",
    gender: form.gender || profile?.gender || "",
    avatarUrl: form.avatarUrl || profile?.avatar_url || "",
    idDocumentUrl: form.idDocumentUrl || profile?.id_document_url || "",
  };
  const statusTone = useMemo(() => {
    switch (kycStatus) {
      case "pending":
      case "verified":
      case "auto_verified":
        if (kycStatus === "pending") {
          return { label: "Pending review", color: "#9a3412", background: "#ffedd5" };
        }
        return { label: "Verified", color: "#166534", background: "#dcfce7" };
      case "pending_review":
        return { label: "Pending review", color: "#9a3412", background: "#ffedd5" };
      case "rejected":
      case "needs_resubmission":
        return { label: "Needs resubmission", color: "#b91c1c", background: "#fee2e2" };
      default:
        return hasVerificationSubmission
          ? { label: "Submitted", color: "#0f766e", background: "#ccfbf1" }
          : hasSavedProfile
            ? { label: "Profile saved", color: "#334155", background: "#e2e8f0" }
            : { label: "Not started", color: "#334155", background: "#e2e8f0" };
    }
  }, [hasSavedProfile, hasVerificationSubmission, kycStatus]);

  useEffect(() => {
    const stream = cameraStreamRef.current;
    const video = cameraVideoRef.current;

    if (stream && video) {
      video.srcObject = stream;
      void video.play().catch(() => undefined);
    }
  }, [cameraTarget]);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  async function uploadAsset(file: File, folder: string): Promise<string> {
    if (!file.type.startsWith("image/")) {
      throw new Error("Please upload an image file.");
    }

    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      throw new Error(`Image must be ${formatImageUploadLimitLabel()} or smaller.`);
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    const response = await fetch("/api/onboarding/home/upload", {
      method: "POST",
      body: formData,
    });

    const data = await readJsonOrText(response);
    if (!response.ok || typeof data.url !== "string") {
      throw new Error(typeof data.error === "string" ? data.error : "Upload failed.");
    }

    return data.url;
  }

  async function readJsonOrText(response: Response): Promise<Record<string, unknown>> {
    const raw = await response.text();
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      const trimmed = raw.trim();
      if (/request entity too large/i.test(trimmed)) {
        return { error: `Image must be ${formatImageUploadLimitLabel()} or smaller.` };
      }
      return trimmed ? { error: trimmed } : {};
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>, kind: "avatar" | "aadhaar"): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(kind);
    setMessage(null);

    try {
      const url = await uploadAsset(file, kind === "avatar" ? "guest-profile" : "guest-kyc");
      setForm((current) => ({
        ...current,
        avatarUrl: kind === "avatar" ? url : current.avatarUrl,
        idDocumentUrl: kind === "aadhaar" ? url : current.idDocumentUrl,
      }));
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Upload failed.",
      });
    } finally {
      setUploading(null);
      event.target.value = "";
    }
  }

  function openUploadChoice(kind: UploadPickerKind): void {
    setActivePicker(kind);
    setMessage(null);
  }

  function stopCameraStream(): void {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
  }

  function closeCamera(): void {
    stopCameraStream();
    setCameraBusy(false);
    setCameraError(null);
    setCameraTarget(null);
  }

  async function openLiveCamera(kind: UploadPickerKind): Promise<void> {
    setActivePicker(null);
    setMessage(null);
    setCameraError(null);

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      triggerUploadSource(kind, "camera");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: kind === "avatar" ? "user" : { ideal: "environment" },
        },
      });

      stopCameraStream();
      cameraStreamRef.current = stream;
      setCameraTarget(kind);
    } catch (error) {
      triggerUploadSource(kind, "camera");
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? `Live camera could not open. ${error.message}`
            : "Live camera could not open.",
      });
    }
  }

  async function captureFromCamera(): Promise<void> {
    if (!cameraTarget || !cameraVideoRef.current || !cameraCanvasRef.current) {
      return;
    }

    const video = cameraVideoRef.current;
    const canvas = cameraCanvasRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Could not initialize camera capture.");
      return;
    }

    setCameraBusy(true);
    setCameraError(null);
    setMessage(null);

    try {
      context.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) resolve(value);
          else reject(new Error("Could not create a photo from the camera."));
        }, "image/jpeg", 0.92);
      });

      const file = new File(
        [blob],
        cameraTarget === "avatar" ? "guest-avatar-camera.jpg" : "guest-aadhaar-camera.jpg",
        { type: "image/jpeg" }
      );
      const kind = cameraTarget;
      const url = await uploadAsset(file, kind === "avatar" ? "guest-profile" : "guest-kyc");
      setForm((current) => ({
        ...current,
        avatarUrl: kind === "avatar" ? url : current.avatarUrl,
        idDocumentUrl: kind === "aadhaar" ? url : current.idDocumentUrl,
      }));
      closeCamera();
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Failed to capture photo.");
    } finally {
      setCameraBusy(false);
    }
  }

  function triggerUploadSource(kind: UploadPickerKind, source: "camera" | "gallery"): void {
    const ref =
      kind === "avatar"
        ? source === "camera"
          ? avatarCameraRef
          : avatarGalleryRef
        : source === "camera"
          ? aadhaarCameraRef
          : aadhaarGalleryRef;

    ref.current?.click();
    window.setTimeout(() => {
      setActivePicker(null);
    }, 0);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!user) {
      setMessage({ type: "error", text: "Please sign in first." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch("/api/user/verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          ...(user?.id ? { "x-famlo-user-id": user.id } : {}),
          ...(resolvedForm.email ? { "x-famlo-user-email": resolvedForm.email } : {}),
        },
        body: JSON.stringify({
          userId: user.id,
          email: resolvedForm.email,
          phone: resolvedForm.phone,
          name: resolvedForm.name,
          city: resolvedForm.city,
          state: resolvedForm.state,
          about: resolvedForm.about,
          dob: resolvedForm.dob,
          gender: resolvedForm.gender,
          avatarUrl: resolvedForm.avatarUrl,
          idDocumentUrl: resolvedForm.idDocumentUrl,
          idDocumentType: "aadhaar_face_match",
        }),
      });

      const data = await readJsonOrText(response);
      if (!response.ok || data.error) {
        throw new Error(typeof data.error === "string" ? data.error : "Verification save failed.");
      }

      setSubmittedStatus(typeof data.status === "string" ? data.status : resolvedForm.idDocumentUrl ? "pending" : "not_started");
      await refreshProfile();
      if (onSuccess) await onSuccess();
      setManualEditMode(false);
      setMessage({
        type: "success",
        text:
          resolvedForm.idDocumentUrl
            ? "Profile saved and verification submitted. Famlo team can review it now."
            : "Profile saved successfully. You can upload your ID anytime to send it for review.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Verification failed.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (hasSavedProfile && !manualEditMode) {
    return (
      <section
        className="panel detail-box account-verification-form"
        style={{
          padding: compact ? "20px" : "28px",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>{title}</h2>
            <p style={{ margin: "8px 0 0", color: "#64748b", lineHeight: 1.7 }}>{description}</p>
          </div>
          <span
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              background: statusTone.background,
              color: statusTone.color,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {statusTone.label}
          </span>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ padding: 16, borderRadius: 16, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <strong style={{ display: "block", marginBottom: 6 }}>Profile saved</strong>
            <p style={{ margin: 0, color: "#475569" }}>
              Your profile is already saved. You can keep using it for bookings, or tap edit if you want to update anything.
            </p>
          </div>

          <div className="dashboard-form-grid">
            <div>
              <span className="eyebrow">Name</span>
              <p style={{ margin: "8px 0 0" }}>{resolvedForm.name || "Not added"}</p>
            </div>
            <div>
              <span className="eyebrow">Phone</span>
              <p style={{ margin: "8px 0 0" }}>{resolvedForm.phone || "Not added"}</p>
            </div>
            <div>
              <span className="eyebrow">Email</span>
              <p style={{ margin: "8px 0 0" }}>{resolvedForm.email || "Not added"}</p>
            </div>
            <div>
              <span className="eyebrow">Location</span>
              <p style={{ margin: "8px 0 0" }}>{[resolvedForm.city, resolvedForm.state].filter(Boolean).join(", ") || "Not added"}</p>
            </div>
            <div>
              <span className="eyebrow">Gender</span>
              <p style={{ margin: "8px 0 0" }}>{resolvedForm.gender || "Not added"}</p>
            </div>
            <div>
              <span className="eyebrow">Date of birth</span>
              <p style={{ margin: "8px 0 0" }}>{resolvedForm.dob || "Not added"}</p>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <span className="eyebrow">About you</span>
              <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{resolvedForm.about || "Not added"}</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button className="button-like account-submit-btn" type="button" onClick={() => setManualEditMode(true)}>
              Edit profile
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <form
      className="panel detail-box account-verification-form"
      onSubmit={(event) => void handleSubmit(event)}
      style={{
        padding: compact ? "24px" : "32px",
        display: "grid",
        gap: "24px",
        borderRadius: '24px',
        border: '1px solid #f1f5f9',
        boxShadow: '0 10px 30px rgba(14, 43, 87, 0.04)'
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <p style={{ margin: "8px 0 0", color: "#64748b", lineHeight: 1.7 }}>{description}</p>
        </div>
        <span
          style={{
            padding: "8px 12px",
            borderRadius: 999,
            background: statusTone.background,
            color: statusTone.color,
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {statusTone.label}
        </span>
      </div>

      <div className="account-avatar-stage">
        <button
          className="account-avatar-picker"
          type="button"
          onClick={() => openUploadChoice("avatar")}
        >
          {resolvedForm.avatarUrl ? (
            <img
              src={resolvedForm.avatarUrl}
              alt="Guest profile"
              className="account-avatar-preview"
            />
          ) : (
            <div className="account-avatar-fallback">
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21a8 8 0 0 0-16 0" />
                <circle cx="12" cy="8" r="4" />
              </svg>
            </div>
          )}
          {uploading === "avatar" ? (
            <div className="account-avatar-overlay">
              <strong>Uploading...</strong>
            </div>
          ) : null}
        </button>
        <input
          className="account-hidden-file"
          type="file"
          accept="image/*"
          capture="user"
          ref={avatarCameraRef}
          onChange={(event) => void handleUpload(event, "avatar")}
        />
        <input
          className="account-hidden-file"
          type="file"
          accept="image/*"
          ref={avatarGalleryRef}
          onChange={(event) => void handleUpload(event, "avatar")}
        />
        <p className="account-upload-note" style={{ margin: 0 }}>
          {resolvedForm.avatarUrl ? "Tap the photo circle to change it." : "Tap the photo circle to upload your profile photo."}
        </p>
      </div>

      <div className="dashboard-form-grid">
        <label>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', marginBottom: '2px', display: 'block' }}>Full name</span>
          <input 
            className="text-input" 
            required 
            value={resolvedForm.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} 
            placeholder="Aryan Krishan"
          />
        </label>
        
        <label style={{ position: 'relative' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', marginBottom: '2px', display: 'block' }}>Gender</span>
          <div style={{ position: 'relative' }}>
            <select 
              className="text-input" 
              style={{ appearance: 'none', paddingRight: '40px' }}
              required 
              value={resolvedForm.gender}
              onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))}
            >
              <option value="">Select gender</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="non_binary">Non-binary</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
            <ChevronDown size={18} style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.5 }} />
          </div>
        </label>

        <label style={{ position: 'relative' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', marginBottom: '2px', display: 'block' }}>Date of birth</span>
          <div style={{ position: 'relative' }}>
            <input 
              className="text-input" 
              required 
              type="date" 
              value={resolvedForm.dob}
              onChange={(event) => setForm((current) => ({ ...current, dob: event.target.value }))} 
            />
            <Calendar size={18} style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.5 }} />
          </div>
        </label>

        <label>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', marginBottom: '2px', display: 'block' }}>City</span>
          <input 
            className="text-input" 
            required 
            value={resolvedForm.city}
            onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} 
            placeholder="Hisar"
          />
        </label>

        <label>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', marginBottom: '2px', display: 'block' }}>State</span>
          <input 
            className="text-input" 
            required 
            value={resolvedForm.state}
            onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))} 
            placeholder="Haryana"
          />
        </label>

        <label>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', marginBottom: '2px', display: 'block' }}>Phone</span>
          <input
            className="text-input"
            type="tel"
            required
            value={resolvedForm.phone}
            disabled={Boolean(user?.phone)}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            placeholder="+91 XXXXX XXXXX"
          />
        </label>

        <label>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', marginBottom: '2px', display: 'block' }}>Email</span>
          <input
            className="text-input"
            type="email"
            required
            value={resolvedForm.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="917404477395@phone.famlo.in"
          />
        </label>

        <label className="full-span" style={{ marginTop: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', marginBottom: '2px', display: 'block' }}>About you</span>
          <textarea
            className="text-input"
            required
            rows={4}
            value={resolvedForm.about}
            onChange={(event) => setForm((current) => ({ ...current, about: event.target.value }))}
            placeholder="Tell Famlo hosts a little about yourself and why you travel."
            style={{ resize: 'none', lineHeight: 1.6 }}
          />
        </label>
      </div>

      <div className="account-upload-card">
        <div className="account-upload-card-head">
          <div>
            <span className="eyebrow">Required KYC</span>
            <h3 style={{ margin: "8px 0 0" }}> Passport or Aadhaar photo with your face visible</h3>
          </div>
          <span className="account-required-pill">Required</span>
        </div>
        <p className="account-upload-note">
          Hold your Passport or Aadhaar card in your hand and make sure your face is clearly visible in the same photo.
        </p>
        <div className="account-upload-actions">
          {resolvedForm.idDocumentUrl ? (
            <a href={resolvedForm.idDocumentUrl} target="_blank" rel="noreferrer" className="account-upload-link">
              View uploaded Aadhaar
            </a>
          ) : null}
          <button
            className="button-like secondary"
            type="button"
            onClick={() => openUploadChoice("aadhaar")}
          >
            {uploading === "aadhaar" ? "Uploading Aadhaar..." : "Upload Aadhaar image"}
          </button>
          <input
            className="account-hidden-file"
            type="file"
            accept="image/*"
            capture="environment"
            ref={aadhaarCameraRef}
            onChange={(event) => void handleUpload(event, "aadhaar")}
          />
          <input
            className="account-hidden-file"
            type="file"
            accept="image/*"
            ref={aadhaarGalleryRef}
            onChange={(event) => void handleUpload(event, "aadhaar")}
          />
        </div>
      </div>

      {message ? (
        <div
          style={{
            borderRadius: 14,
            padding: "12px 14px",
            background: message.type === "success" ? "#dcfce7" : "#fee2e2",
            color: message.type === "success" ? "#166534" : "#b91c1c",
            fontWeight: 700,
          }}
        >
          {message.text}
        </div>
      ) : null}

      <button className="button-like account-submit-btn" disabled={saving || uploading !== null} type="submit">
        {saving ? "Saving..." : buttonLabel}
      </button>

      {activePicker ? (
        <div className="account-upload-sheet-backdrop" role="presentation" onClick={() => setActivePicker(null)}>
          <div className="account-upload-sheet" role="dialog" aria-modal="true" aria-label="Choose upload source" onClick={(event) => event.stopPropagation()}>
            <div className="account-upload-sheet-copy">
              <strong>{activePicker === "avatar" ? "Add your profile photo" : "Upload Aadhaar with your face visible"}</strong>
              <span>
                {activePicker === "avatar"
                  ? "Choose how you want to upload your photo."
                  : "Please keep your face visible while holding the Aadhaar in the same photo."}
              </span>
            </div>
            <div className="account-upload-sheet-actions">
              <button className="button-like" type="button" onClick={() => void openLiveCamera(activePicker)}>
                Use Camera
              </button>
              <button className="button-like secondary" type="button" onClick={() => triggerUploadSource(activePicker, "gallery")}>
                Choose from Gallery
              </button>
            </div>
            <button className="account-upload-sheet-close" type="button" onClick={() => setActivePicker(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {cameraTarget ? (
        <div className="account-upload-sheet-backdrop" role="presentation" onClick={closeCamera}>
          <div className="account-upload-sheet" role="dialog" aria-modal="true" aria-label="Use camera" onClick={(event) => event.stopPropagation()}>
            <div className="account-upload-sheet-copy">
              <strong>{cameraTarget === "avatar" ? "Capture profile photo" : "Capture Aadhaar with your face visible"}</strong>
              <span>
                {cameraTarget === "avatar"
                  ? "Center your face in the frame, then capture."
                  : "Hold your Aadhaar in the frame and keep your face visible in the same photo."}
              </span>
            </div>
            <div
              style={{
                overflow: "hidden",
                borderRadius: 24,
                background: "#0f172a",
                minHeight: 260,
              }}
            >
              <video
                ref={cameraVideoRef}
                autoPlay
                muted
                playsInline
                style={{ width: "100%", display: "block" }}
              />
            </div>
            <canvas ref={cameraCanvasRef} style={{ display: "none" }} />
            {cameraError ? (
              <div
                style={{
                  borderRadius: 14,
                  padding: "12px 14px",
                  background: "#fee2e2",
                  color: "#b91c1c",
                  fontWeight: 700,
                }}
              >
                {cameraError}
              </div>
            ) : null}
            <div className="account-upload-sheet-actions">
              <button className="button-like" type="button" disabled={cameraBusy} onClick={() => void captureFromCamera()}>
                {cameraBusy ? "Capturing..." : "Capture photo"}
              </button>
              <button className="button-like secondary" type="button" disabled={cameraBusy} onClick={closeCamera}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
