"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, CheckCircle2, ImagePlus, Loader2, MapPin, MessageCircle, ShieldCheck, Upload, User, X } from "lucide-react";

import styles from "../../onboarding.module.css";
import { MAX_DOCUMENT_UPLOAD_BYTES, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/upload-limits";

const IMAGE_FILE_EXTENSION_PATTERN = /\.(jpe?g|png|webp|heic|heif)$/;

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || IMAGE_FILE_EXTENSION_PATTERN.test(file.name.toLowerCase());
}

function isBrowserReadableImage(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return isImageFile(file) && !lowerName.endsWith(".heic") && !lowerName.endsWith(".heif");
}

function getCurrentPositionWithFallback(): Promise<GeolocationPosition> {
  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    return Promise.reject(new Error("Geolocation is not supported by your browser."));
  }

  const attempts: PositionOptions[] = [
    { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 },
    { enableHighAccuracy: true, timeout: 35000, maximumAge: 0 },
  ];

  return attempts.reduce<Promise<GeolocationPosition>>((chain, options) => {
    return chain.catch(
      () =>
        new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, options);
        })
    );
  }, Promise.reject(new Error("No geolocation attempts made.")));
}

type CameraTarget = "hostPhoto" | "liveSelfie" | "idDocument" | null;

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

async function readImageMeta(file: File): Promise<{ width: number; height: number; contrast: number }> {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Could not read the uploaded image."));
      nextImage.src = imageUrl;
    });

    const canvas = document.createElement("canvas");
    const sampleWidth = 120;
    const sampleHeight = Math.max(1, Math.round((image.height / image.width) * sampleWidth));
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return { width: image.width, height: image.height, contrast: 100 };
    }

    context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;

    let min = 255;
    let max = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      const brightness = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
      min = Math.min(min, brightness);
      max = Math.max(max, brightness);
    }

    return {
      width: image.width,
      height: image.height,
      contrast: max - min,
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function runDocumentQualityCheck(file: File): Promise<string> {
  const allowedPdf = isPdfFile(file);
  const allowedImage = isImageFile(file);

  if (!allowedPdf && !allowedImage) {
    throw new Error("Upload a JPG, PNG, WEBP, HEIC, or PDF document.");
  }

  if (file.size > (allowedPdf ? MAX_DOCUMENT_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES)) {
    throw new Error(allowedPdf ? "Document must be 10MB or smaller." : "Image must be 15MB or smaller.");
  }

  return "Document uploaded for Famlo manual review.";
}

async function validateGovernmentId(file: File, selectedDocumentType: string, uploadMethod: "camera" | "device") {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("selectedDocumentType", selectedDocumentType);
  formData.append("uploadMethod", uploadMethod);

  const response = await fetch("/api/onboarding/home/validate-document", {
    method: "POST",
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Document validation failed.");
  }

  return payload as {
    decision: "pass" | "retry" | "reject";
    confidenceScore: number;
    reviewStatus: string;
    reasons: string[];
    fraudFlags: string[];
    userMessage: string;
  };
}

export default function Step1Profile({ data, update, onStepComplete }: any) {
  const [verifying, setVerifying] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtp, setEmailOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [verified, setVerified] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [verifiedDraftId, setVerifiedDraftId] = useState<string | null>(null);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [documentCheck, setDocumentCheck] = useState<string | null>(null);
  const draftLinkedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostPhotoGalleryRef = useRef<HTMLInputElement | null>(null);
  const documentDeviceRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  useEffect(() => {
    return () => stopMediaStream(cameraStream);
  }, [cameraStream]);

  useEffect(() => {
    if (!verifiedDraftId || draftLinkedRef.current) {
      return;
    }

    draftLinkedRef.current = true;
    onStepComplete(verifiedDraftId);
  }, [verifiedDraftId, onStepComplete]);

  const indianStates = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
    "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
    "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
    "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
    "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
    "Lakshadweep", "Puducherry", "Ladakh"
  ];

  const normalizedPhoneDigits = String(data.mobileNumber ?? "").replace(/\D/g, "").slice(0, 10);

  const readErrorMessage = async (res: Response, fallback: string) => {
    try {
      const json = await res.json();
      if (typeof json?.error === "string" && json.error.trim()) {
        return json.error.trim();
      }
      if (typeof json?.message === "string" && json.message.trim()) {
        return json.message.trim();
      }
    } catch {
      // ignore
    }
    return fallback;
  };

  const readUploadResponse = async (res: Response) => {
    const raw = await res.text();
    try {
      const json = JSON.parse(raw) as { error?: string; url?: string; message?: string };
      return {
        url: typeof json.url === "string" ? json.url : null,
        error:
          typeof json.error === "string"
            ? json.error
            : typeof json.message === "string"
              ? json.message
              : null,
      };
    } catch {
      const trimmed = raw.trim();
      if (/request entity too large/i.test(trimmed)) {
        return { url: null, error: "File must be within the upload size limit." };
      }
      return { url: null, error: trimmed || "Upload failed." };
    }
  };

  const uploadFile = async (file: File, folder: string, fallbackError: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    const res = await fetch("/api/onboarding/home/upload", { method: "POST", body: formData });
    const payload = await readUploadResponse(res);
    if (!res.ok || !payload.url) {
      throw new Error(payload.error || fallbackError);
    }
    return payload.url;
  };

  const closeCamera = () => {
    stopMediaStream(cameraStream);
    setCameraStream(null);
    setCameraTarget(null);
    setCameraBusy(false);
  };

  const openCamera = async (target: Exclude<CameraTarget, null>) => {
    setError(null);
    setCameraBusy(true);

    try {
      if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Live camera capture is not supported in this browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: target === "idDocument" ? "environment" : "user",
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
        audio: false,
      });

      stopMediaStream(cameraStream);
      setCameraStream(stream);
      setCameraTarget(target);
    } catch (cameraError) {
      const message = cameraError instanceof Error ? cameraError.message : "Could not open the camera.";
      setError(`Camera permission is required for live capture. ${message}`);
      stopMediaStream(cameraStream);
      setCameraStream(null);
      setCameraTarget(null);
    } finally {
      setCameraBusy(false);
    }
  };

  const captureLivePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !cameraTarget) {
      return;
    }

    setCameraBusy(true);
    setError(null);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 960;
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Could not initialize the live capture canvas.");
      }

      context.drawImage(video, 0, 0, width, height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((nextBlob) => {
          if (nextBlob) resolve(nextBlob);
          else reject(new Error("Unable to create a captured photo file."));
        }, "image/jpeg", 0.92);
      });

      const fileName =
        cameraTarget === "hostPhoto"
          ? "host-live-photo.jpg"
          : cameraTarget === "idDocument"
            ? "id-document-camera.jpg"
            : "live-selfie.jpg";
      const file = new File([blob], fileName, { type: "image/jpeg" });

      if (cameraTarget === "idDocument") {
        if (!data.idDocumentType) {
          throw new Error("Choose your document type before using the camera.");
        }

        update("idDocumentUploadMethod", "camera");
        const documentCheckMessage = "Document uploaded for Famlo manual review.";

        try {
          const validation = await validateGovernmentId(file, data.idDocumentType, "camera");
          update("idDocumentValidationStatus", validation.decision);
          update("idDocumentValidationMessage", "Document uploaded for Famlo manual review.");
          update("idDocumentConfidenceScore", validation.confidenceScore);
          update("idDocumentFraudFlags", validation.fraudFlags);
          update("idDocumentValidationReasons", []);
          update("idDocumentReviewStatus", "pending_manual_review");
        } catch (validationError) {
          update("idDocumentValidationStatus", "retry");
          update("idDocumentValidationMessage", "Document uploaded for Famlo manual review.");
          update("idDocumentConfidenceScore", 0);
          update("idDocumentFraudFlags", ["manual_review_required"]);
          update("idDocumentValidationReasons", []);
          update("idDocumentReviewStatus", "pending_manual_review");
        }

        const url = await uploadFile(file, "identity-docs", "Failed to upload the captured document.");
        update("idDocumentPhotoUrl", url);
        setDocumentCheck(documentCheckMessage);
      } else {
        const folder = cameraTarget === "hostPhoto" ? "host-profiles" : "live-verifications";
        const url = await uploadFile(file, folder, "Failed to upload the captured photo.");
        update(cameraTarget === "hostPhoto" ? "hostPhoto" : "liveSelfieUrl", url);
        if (cameraTarget === "hostPhoto") {
          update("hostPhotoUploadMethod", "camera");
        }
      }
      closeCamera();
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "Failed to capture live photo.");
    } finally {
      setCameraBusy(false);
    }
  };

  const sendOtp = async () => {
    setError(null);
    setVerifying(true);
    try {
      const fullPhone = `+91${normalizedPhoneDigits}`;
      const res = await fetch("/api/onboarding/home/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobileNumber: fullPhone })
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "Unable to send mobile OTP right now."));
      }
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send mobile OTP. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const sendEmailOtp = async () => {
    setError(null);
    setVerifyingEmail(true);
    try {
      const res = await fetch("/api/onboarding/home/email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email })
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "Unable to send email code right now."));
      }
      setEmailOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send email code. Please try again.");
    } finally {
      setVerifyingEmail(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    setVerifying(true);

    try {
      const fullPhone = `+91${normalizedPhoneDigits}`;
      const res = await fetch("/api/onboarding/home/otp-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobileNumber: fullPhone, otpCode: data.otpCode })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Verify failed");

      setVerified(true);
      update("isPhoneVerified", true);
      setVerifiedDraftId(resData.draftId || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid mobile code.");
    } finally {
      setVerifying(false);
    }
  };

  const verifyEmailOtp = async () => {
    setError(null);
    setVerifyingEmail(true);

    try {
      const res = await fetch("/api/onboarding/home/email-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email, otp: emailOtp })
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "Email verification failed."));
      }

      setEmailVerified(true);
      update("isEmailVerified", true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid email verification code.");
    } finally {
      setVerifyingEmail(false);
    }
  };

  const detectLocation = () => {
    setDetecting(true);
    setError(null);

    if (typeof window === "undefined") {
      setDetecting(false);
      return;
    }

    if (!("geolocation" in navigator)) {
      setError("Geolocation not supported by your browser.");
      setDetecting(false);
      return;
    }

    getCurrentPositionWithFallback()
      .then(async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=18`);
          if (!res.ok) throw new Error("Location service busy");

          const geo = await res.json();
          const addr = geo.address;
          if (!addr) throw new Error("Address data not found");

          const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
          const areaName = addr.suburb || addr.neighbourhood || addr.quarter || addr.hamlet || addr.village || "";
          const state = addr.state || "";
          const country = addr.country || "India";
          const addressLine = [addr.house_number, addr.road].filter(Boolean).join(", ");

          if (city) update("city", city);
          if (state) update("state", state);
          if (country) update("country", country);
          if (areaName) update("areaName", areaName);
          if (addressLine && !data.streetAddress) update("streetAddress", addressLine);
          update("latitude", String(latitude));
          update("longitude", String(longitude));
          update("googleMapsLink", `https://www.google.com/maps?q=${latitude},${longitude}`);
          if (addr.postcode) update("pincode", addr.postcode);

          if (!city && !state) {
            setError("Location found, but city and state could not be filled. Please add them manually.");
          }
        } catch (err) {
          console.error("Geo error:", err);
          setError("Location was found, but address lookup failed. Please type city and state manually.");
        } finally {
          setDetecting(false);
        }
      })
      .catch((err: GeolocationPositionError | Error) => {
        if ("code" in err && err.code === 1) {
          setError("Location permission denied. Please allow browser and system location access.");
        } else if ("code" in err && err.code === 2) {
          setError("Location is unavailable right now. Turn on device location services and try again.");
        } else if ("code" in err && err.code === 3) {
          setError("Location request timed out. Please retry after turning on precise location.");
        } else {
          setError("Unable to get your home's pin point right now. Please check browser and system settings.");
        }
        setDetecting(false);
      });
  };

  const handleDocumentUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setDocumentCheck(null);

    try {
      if (!data.idDocumentType) {
        throw new Error("Choose the document type first.");
      }
      const qualityMessage = await runDocumentQualityCheck(file);
      update("idDocumentUploadMethod", "device");
      let documentCheckMessage = qualityMessage;

      try {
        const validation = await validateGovernmentId(file, data.idDocumentType, "device");
        update("idDocumentValidationStatus", validation.decision);
        update("idDocumentValidationMessage", "Document uploaded for Famlo manual review.");
        update("idDocumentConfidenceScore", validation.confidenceScore);
        update("idDocumentFraudFlags", validation.fraudFlags);
        update("idDocumentValidationReasons", []);
        update("idDocumentReviewStatus", "pending_manual_review");
      } catch (validationError) {
        update("idDocumentValidationStatus", "retry");
        update("idDocumentValidationMessage", "Document uploaded for Famlo manual review.");
        update("idDocumentConfidenceScore", 0);
        update("idDocumentFraudFlags", ["manual_review_required"]);
        update("idDocumentValidationReasons", []);
        update("idDocumentReviewStatus", "pending_manual_review");
        documentCheckMessage = "Document uploaded for Famlo manual review.";
      }

      const url = await uploadFile(file, "identity-docs", "Failed to upload document.");
      update("idDocumentPhotoUrl", url);
      setDocumentCheck(documentCheckMessage);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Failed to upload document.");
    } finally {
      event.target.value = "";
    }
  };

  const handleHostPhotoGalleryUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    try {
      const url = await uploadFile(file, "host-profiles", "Failed to upload profile photo.");
      update("hostPhoto", url);
      update("hostPhotoUploadMethod", "gallery");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Failed to upload profile photo.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className={styles.animateIn}>
      <div className={styles.onboardingHeader} style={{ marginBottom: "40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#165dcc", marginBottom: "16px" }}>
          <div style={{ padding: "10px", background: "#f4f8ff", borderRadius: "12px" }}><User size={20} /></div>
          <span style={{ fontSize: "12px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em" }}>Partner Profile</span>
        </div>
        <h1 style={{ fontSize: "32px", fontWeight: 900 }}>Host Profile</h1>
        <p style={{ fontSize: "15px", color: "rgba(14, 43, 87, 0.5)", fontWeight: 600 }}>
          
        </p>
      </div>

      <div className={styles.formGrid}>
        <div className={`${styles.formGroup} ${styles.fullWidth}`} style={{ display: "flex", justifyContent: "center", marginBottom: "32px" }}>
          <div style={{ textAlign: "center" }}>
            <button
              type="button"
              onClick={() => hostPhotoGalleryRef.current?.click()}
              style={{ position: "relative", width: "110px", height: "110px", margin: "0 auto 12px", border: "none", padding: 0, background: "transparent", cursor: "pointer" }}
              aria-label="Upload or change profile photo"
            >
              {data.hostPhoto ? (
                <img src={data.hostPhoto} alt="Host Profile" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "3px solid #165dcc" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#f4f8ff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px dashed #165dcc" }}>
                  <User size={40} color="#165dcc" />
                </div>
              )}
              {data.hostPhoto ? null : (
                <span style={{ position: "absolute", inset: "auto 0 0 0", margin: "0 auto", width: "36px", height: "36px", background: "#165dcc", color: "white", borderRadius: "50%", border: "3px solid white", display: "grid", placeItems: "center" }}>
                  <ImagePlus size={16} />
                </span>
              )}
            </button>
            <input
              ref={hostPhotoGalleryRef}
              type="file"
              accept="image/*,.heic,.heif"
              style={{ display: "none" }}
              onChange={(event) => void handleHostPhotoGalleryUpload(event)}
            />
            <div style={{ fontSize: "11px", fontWeight: 900, color: "#165dcc", textTransform: "uppercase" }}>Profile Photo</div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "10px", flexWrap: "wrap" }}>
              <button type="button" className={styles.verifyBtn} style={{ minWidth: "138px" }} onClick={() => void openCamera("hostPhoto")}>
                <Camera size={14} /> Use Camera
              </button>
              <button
                type="button"
                className={styles.verifyBtn}
                style={{ minWidth: "158px", background: "#f4f8ff", color: "#165dcc", border: "1px solid rgba(22, 93, 204, 0.12)" }}
                onClick={() => hostPhotoGalleryRef.current?.click()}
              >
                <ImagePlus size={14} /> From Gallery
              </button>
            </div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "rgba(14, 43, 87, 0.45)", marginTop: "8px" }}>Click the photo circle to upload or change it, or use camera/gallery below.</div>
          </div>
        </div>

        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label>Full Name of Primary Host</label>
          <input className={styles.inputField} value={data.fullName} onChange={e => update("fullName", e.target.value)} placeholder="Full legal name" />
        </div>

        <div className={styles.formGroup}>
          <label>Mobile Number</label>
          <div className={styles.otpWrapper}>
            <div style={{ display: "flex", gap: "8px", flex: 1 }}>
              <select className={styles.inputField} style={{ width: "100px", padding: "18px 12px" }} value={data.countryCode} onChange={e => update("countryCode", e.target.value)} disabled={otpSent}>
                <option value="+91">+91 (IN)</option>
              </select>
              <input className={styles.inputField} value={normalizedPhoneDigits} onChange={e => update("mobileNumber", e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit number" disabled={otpSent} />
            </div>
            {!otpSent ? (
              <button className={styles.verifyBtn} onClick={sendOtp} disabled={normalizedPhoneDigits.length < 10 || verifying}>
                {verifying ? <Loader2 className="animate-spin" size={16} /> : "Send OTP"}
              </button>
            ) : null}
          </div>
        </div>

        <div className={styles.formGroup}>
          <label>OTP Verification</label>
          <div className={styles.otpWrapper}>
            <input className={styles.inputField} value={data.otpCode} onChange={e => update("otpCode", e.target.value)} placeholder="Enter 6-digit code" disabled={!otpSent || verified} />
            {otpSent && !verified ? (
              <button className={styles.verifyBtn} onClick={verifyOtp} disabled={!data.otpCode || verifying}>
                {verifying ? <Loader2 className="animate-spin" size={16} /> : "Verify"}
              </button>
            ) : null}
          </div>
        </div>

        <div className={styles.formGroup}>
          <label>Email Address</label>
          <div className={styles.otpWrapper}>
            <input className={styles.inputField} value={data.email} onChange={e => update("email", e.target.value)} placeholder="e.g. host@famlo.in" disabled={emailOtpSent || emailVerified} />
            {!emailOtpSent ? (
              <button className={styles.verifyBtn} onClick={sendEmailOtp} disabled={!data.email || verifyingEmail}>
                {verifyingEmail ? <Loader2 className="animate-spin" size={16} /> : "Send OTP"}
              </button>
            ) : null}
          </div>
        </div>

        <div className={styles.formGroup}>
          <label>Email Verification</label>
          <div className={styles.otpWrapper}>
            <input className={styles.inputField} value={emailOtp} onChange={e => setEmailOtp(e.target.value)} placeholder="6-digit email code" disabled={!emailOtpSent || emailVerified} />
            {emailOtpSent && !emailVerified ? (
              <button className={styles.verifyBtn} onClick={verifyEmailOtp} disabled={!emailOtp || verifyingEmail}>
                {verifyingEmail ? <Loader2 className="animate-spin" size={16} /> : "Verify Email"}
              </button>
            ) : null}
          </div>
        </div>

        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label>Google Pin Point</label>
          <button className={styles.verifyBtn} style={{ background: "#165dcc", color: "white", border: "none", width: "100%" }} type="button" onClick={detectLocation} disabled={detecting}>
            {detecting ? <span style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center" }}><Loader2 className="animate-spin" size={14} /> Detecting...</span> : "Use Current Live Location"}
          </button>
        </div>

        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label>Address</label>
          <input className={styles.inputField} value={data.streetAddress} onChange={e => update("streetAddress", e.target.value)} placeholder="House/Flat No., Building, Street" />
        </div>

        <div className={styles.formGroup}>
          <label>Area / Locality</label>
          <input className={styles.inputField} value={data.areaName || ""} onChange={e => update("areaName", e.target.value)} placeholder="e.g. Shastri Nagar" />
        </div>

        <div className={styles.formGroup}>
          <label>City</label>
          <div style={{ position: "relative" }}>
            <input className={styles.inputField} style={{ paddingLeft: "48px" }} value={data.city} onChange={e => update("city", e.target.value)} placeholder="e.g. Jodhpur" />
            <MapPin size={18} style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "rgba(14, 43, 87, 0.3)" }} />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label>State</label>
          <select className={styles.inputField} value={data.state} onChange={e => update("state", e.target.value)}>
            <option value="">Select State</option>
            {indianStates.map((state) => <option key={state} value={state}>{state}</option>)}
          </select>
        </div>

        <div className={styles.formGroup}>
          <label>Country</label>
          <select className={styles.inputField} value={data.country} onChange={e => update("country", e.target.value)}>
            <option value="India">India</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label>Pin Point Preview</label>
          <div className={styles.locationGrid}>
            <input className={styles.inputField} value={data.latitude || ""} onChange={e => update("latitude", e.target.value)} placeholder="Latitude" />
            <input className={styles.inputField} value={data.longitude || ""} onChange={e => update("longitude", e.target.value)} placeholder="Longitude" />
            <input className={styles.inputField} value={data.pincode || ""} onChange={e => update("pincode", e.target.value)} placeholder="Pincode" />
          </div>
          {data.googleMapsLink ? (
            <a href={data.googleMapsLink} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginTop: "12px", fontSize: "13px", fontWeight: 800, color: "#165dcc", textDecoration: "none" }}>
              <MapPin size={14} />
              Open detected Google pin point
            </a>
          ) : null}
          <p style={{ marginTop: "10px", fontSize: "12px", color: "rgba(14, 43, 87, 0.55)", fontWeight: 700 }}>
            Exact coordinates are stored privately. Public discovery uses an approximate masked pin for host privacy and safety.
          </p>
        </div>

        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label>Accessibility Details (Public)</label>
          <textarea className={styles.inputField} style={{ minHeight: "80px", paddingTop: "12px" }} value={data.accessibilityDesc || ""} onChange={e => update("accessibilityDesc", e.target.value)} placeholder="Tell your guests how to get to your location. " />
        </div>

        <div className={`${styles.formGroup} ${styles.fullWidth}`} style={{ marginTop: "24px", padding: "32px", background: "#f8fafc", borderRadius: "24px", border: "1px solid rgba(14, 43, 87, 0.05)" }}>
          <h4 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: 900 }}>Upload a Valid ID</h4>
          <p style={{ fontSize: "13px", color: "rgba(14, 43, 87, 0.6)", marginBottom: "24px", fontWeight: 600 }}>
            Use a clear photo or PDF of your government ID. We check whether the upload is readable and looks like a real document, then Famlo reviews it manually. File name does not matter.
          </p>

          <div className={styles.idVerificationGrid}>
            <div>
              <label style={{ fontSize: "11px", fontWeight: 900, textTransform: "uppercase", marginBottom: "8px", display: "block" }}>1. Document Type</label>
              <select className={styles.inputField} value={data.idDocumentType} onChange={e => update("idDocumentType", e.target.value)}>
                <option value="">Select Document</option>
                <option value="Aadhaar">Aadhaar Card</option>
                <option value="Passport">Passport</option>
                <option value="Driving Licence">Driving Licence</option>
                <option value="Voter ID">Voter ID</option>
              </select>

              <div style={{ marginTop: "16px" }}>
                <label style={{ fontSize: "11px", fontWeight: 900, textTransform: "uppercase", marginBottom: "8px", display: "block" }}>2. Upload Method</label>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={styles.verifyBtn}
                    style={{ flex: 1, minWidth: "150px" }}
                    onClick={() => {
                      if (!data.idDocumentType) {
                        setError("Choose document type first.");
                        return;
                      }
                      void openCamera("idDocument");
                    }}
                  >
                    <Camera size={14} /> Use Camera
                  </button>
                  <button
                    type="button"
                    className={styles.verifyBtn}
                    style={{ flex: 1, minWidth: "170px", background: data.idDocumentPhotoUrl ? "#f0fdf4" : "#f4f8ff", color: data.idDocumentPhotoUrl ? "#166534" : "#165dcc", border: "1px solid rgba(22, 93, 204, 0.12)" }}
                    onClick={() => documentDeviceRef.current?.click()}
                  >
                    <Upload size={14} /> {data.idDocumentPhotoUrl ? "Document Uploaded" : "Upload from Device"}
                  </button>
                  <input ref={documentDeviceRef} type="file" accept="image/*,.jpg,.jpeg,.png,.heic,.heif,.pdf,application/pdf" style={{ display: "none" }} onChange={(event) => void handleDocumentUpload(event)} />
                </div>
                <p style={{ fontSize: "10px", color: "rgba(14, 43, 87, 0.4)", marginTop: "8px", fontWeight: 700 }}>
                  Supported: JPG, JPEG, PNG, WEBP, HEIC, PDF. Upload the front side clearly; Famlo will review the document manually.
                </p>
                {documentCheck ? (
                  <div style={{ marginTop: "10px", fontSize: "12px", fontWeight: 700, color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "10px 12px" }}>
                    {documentCheck}
                  </div>
                ) : null}
                {data.idDocumentValidationMessage && !documentCheck ? (
                  <div style={{ marginTop: "10px", fontSize: "12px", fontWeight: 700, color: data.idDocumentValidationStatus === "pass" ? "#166534" : data.idDocumentValidationStatus === "retry" ? "#9a3412" : "#b91c1c", background: data.idDocumentValidationStatus === "pass" ? "#f0fdf4" : data.idDocumentValidationStatus === "retry" ? "#fff7ed" : "#fef2f2", border: `1px solid ${data.idDocumentValidationStatus === "pass" ? "#bbf7d0" : data.idDocumentValidationStatus === "retry" ? "#fed7aa" : "#fecaca"}`, borderRadius: "12px", padding: "10px 12px" }}>
                    {data.idDocumentValidationMessage}
                  </div>
                ) : null}
                {Array.isArray(data.idDocumentValidationReasons) && data.idDocumentValidationReasons.length > 0 ? (
                  <ul style={{ margin: "10px 0 0", paddingLeft: "18px", color: "rgba(14, 43, 87, 0.62)", fontSize: "12px", lineHeight: 1.6, fontWeight: 600 }}>
                    {data.idDocumentValidationReasons.map((reason: string) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: 900, textTransform: "uppercase", marginBottom: "8px", display: "block" }}>3. Live Verification Photo</label>
              <button
                type="button"
                className={styles.verifyBtn}
                style={{ cursor: "pointer", background: data.liveSelfieUrl ? "#f0fdf4" : "#0e2b57", color: data.liveSelfieUrl ? "#166534" : "white", border: "none", width: "100%" }}
                onClick={() => void openCamera("liveSelfie")}
              >
                {data.liveSelfieUrl ? "✓ Live Selfie Ready" : "Capture Live Selfie"}
              </button>
              <p style={{ fontSize: "10px", color: "rgba(14, 43, 87, 0.4)", marginTop: "8px", fontWeight: 700 }}>Camera-only capture. Gallery uploads are disabled for the live selfie.</p>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div style={{ marginTop: "24px", background: "#fef2f2", border: "1px solid #fee2e2", color: "#ef4444", padding: "16px", borderRadius: "16px", fontSize: "13px", fontWeight: 800, animation: "shake 0.4s ease" }}>
          {error}
        </div>
      ) : null}

      {verified && emailVerified ? (
        <div style={{ marginTop: "32px", padding: "32px", background: "#f0fdf4", borderRadius: "24px", border: "1px solid #dcfce7", textAlign: "center", animation: "fadeIn 0.5s ease" }}>
          <div style={{ width: "64px", height: "64px", background: "#dcfce7", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <CheckCircle2 size={32} color="#166534" />
          </div>
          <h3 style={{ fontSize: "18px", fontWeight: 900, color: "#166534", margin: "0 0 8px" }}>Identity Verified!</h3>
          <p style={{ fontSize: "14px", color: "#166534", fontWeight: 600, margin: 0 }}>Both phone and email are verified. Continue to complete your family story.</p>
        </div>
      ) : (
        <div style={{ marginTop: "40px", padding: "24px", background: "rgba(22, 93, 204, 0.03)", borderRadius: "24px", border: "1px solid rgba(14, 43, 87, 0.04)", display: "flex", gap: "16px", alignItems: "flex-start" }}>
          <MessageCircle size={20} color="#165dcc" style={{ marginTop: "2px" }} />
          <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "rgba(14, 43, 87, 0.6)", lineHeight: 1.6 }}>
            {verified ? "Phone verified. Please verify your email to proceed." : emailVerified ? "Email verified. Please verify your phone to proceed." : "Choose your document type first, then use camera or device upload. We automatically check for blur, unreadable uploads, blank files, unrelated screenshots, and suspicious uploads. Clear documents then go to admin/team review."}
          </p>
        </div>
      )}



      {cameraTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.64)",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            zIndex: 60,
          }}
        >
          <div style={{ width: "min(720px, 100%)", background: "#08152a", borderRadius: "28px", padding: "20px", boxShadow: "0 30px 80px rgba(0, 0, 0, 0.35)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", color: "white" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "#93c5fd" }}>Live Camera</div>
                <div style={{ fontSize: "18px", fontWeight: 900 }}>
                  {cameraTarget === "hostPhoto" ? "Capture Profile Photo" : cameraTarget === "idDocument" ? "Capture ID Document" : "Capture Live Selfie"}
                </div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.72)", marginTop: "6px", maxWidth: "420px", lineHeight: 1.6 }}>
                  {cameraTarget === "hostPhoto"
                    ? "Keep your face centered, well-lit, and clearly visible before you capture."
                    : cameraTarget === "idDocument"
                      ? "Keep the full front side of the document inside the frame. Avoid glare, blur, and cropped edges."
                      : "Capture a clear front-facing selfie in good light. This must be taken live from your camera."}
                </div>
              </div>
              <button
                type="button"
                onClick={closeCamera}
                style={{ width: "40px", height: "40px", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: "white", display: "grid", placeItems: "center", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ borderRadius: "20px", overflow: "hidden", background: "black" }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", display: "block", aspectRatio: "4 / 3", objectFit: "cover" }} />
              <canvas ref={canvasRef} style={{ display: "none" }} />
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "16px" }}>
              <button 
                type="button" 
                onClick={closeCamera} 
                style={{ height: "48px", padding: "0 20px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "white", fontWeight: 700, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={() => void captureLivePhoto()} 
                disabled={cameraBusy} 
                style={{ height: "48px", padding: "0 24px", borderRadius: "12px", border: "none", background: "#165dcc", color: "white", fontWeight: 700, cursor: "pointer", minWidth: "170px" }}
              >
                {cameraBusy ? <Loader2 className="animate-spin" size={20} style={{ margin: "0 auto" }} /> : "Capture and Use Photo"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
