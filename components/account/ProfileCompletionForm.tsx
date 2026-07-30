"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Camera, ChevronDown, Upload } from "lucide-react";
import Image from "next/image";
import type { User } from "@supabase/supabase-js";

import { useUser } from "@/components/auth/UserContext";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  isGuestProfileComplete,
  type GuestProfileFieldErrors,
  type UserProfileRecord,
  validateGuestProfileDetailsInput,
} from "@/lib/user-profile";
import { normalizeGuestEmail, normalizeGuestPhone } from "@/lib/guest-identity";
import { getSafeAvatarUrl } from "@/lib/avatar-url";
import { MAX_IMAGE_UPLOAD_BYTES, formatImageUploadLimitLabel } from "@/lib/upload-limits";
import type { ContactEvidence } from "@/lib/auth/contact-evidence";
import { getSafeGuestAuthReturnPath } from "@/lib/site-url";

interface ProfileCompletionFormProps {
  title?: string;
  description?: string;
  buttonLabel?: string;
  compact?: boolean;
  returnTo?: string;
  accountLinkRequestId?: string | null;
  onSuccess?: () => Promise<void> | void;
  onPhoneConflictChange?: (hasConflict: boolean) => void;
}

type ProfileDraft = {
  username: string;
  email: string;
  phone: string;
  name: string;
  city: string;
  state: string;
  about: string;
  dob: string;
  gender: string;
  avatarUrl: string;
};

function createProfileDraft(
  profile: UserProfileRecord | null,
  user: User | null,
  contactEvidence?: ContactEvidence
): ProfileDraft {
  return {
    username: profile?.username ?? "",
    email:
      contactEvidence?.email.value ??
      profile?.pending_email ??
      profile?.email ??
      user?.email ??
      "",
    phone: profile?.phone ?? user?.phone ?? "",
    name: profile?.name ?? "",
    city: profile?.city ?? "",
    state: profile?.state ?? "",
    about: profile?.about ?? "",
    dob: profile?.date_of_birth ?? "",
    gender: profile?.gender ?? "",
    avatarUrl: profile?.avatar_url ?? "",
  };
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

export function ProfileCompletionForm({
  title = "Complete your guest profile",
  description = "Add your details once so Famlo hosts know who is arriving before you book.",
  buttonLabel = "Save profile",
  compact = false,
  returnTo = "/profile",
  accountLinkRequestId: activeAccountLinkRequestId = null,
  onSuccess,
  onPhoneConflictChange,
}: Readonly<ProfileCompletionFormProps>): React.JSX.Element {
  const { user, profile, contactEvidence, applyProfile, refreshAuth } = useUser();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const initializedUserId = useRef<string | null>(null);
  const [editMode, setEditMode] = useState(() => !isGuestProfileComplete(profile));
  const [draft, setDraft] = useState<ProfileDraft>(() =>
    createProfileDraft(profile, user, contactEvidence)
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "unavailable">("idle");
  const [phoneOtpState, setPhoneOtpState] = useState<"idle" | "sending" | "sent" | "verifying">("idle");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneOtpSessionId, setPhoneOtpSessionId] = useState("");
  const [phoneConflict, setPhoneConflict] = useState<string | null>(null);
  const [accountLinkRequestId, setAccountLinkRequestId] = useState("");
  const [accountLinkSessionId, setAccountLinkSessionId] = useState("");
  const [accountLinkOtp, setAccountLinkOtp] = useState("");
  const [accountLinkState, setAccountLinkState] = useState<
    "idle" | "sending" | "sent" | "verifying"
  >("idle");
  const [emailOtpState, setEmailOtpState] = useState<
    "idle" | "sending" | "sent" | "verifying"
  >("idle");
  const [emailOtp, setEmailOtp] = useState("");
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<GuestProfileFieldErrors>({});

  const resolvedForm = draft;

  const profileComplete = isGuestProfileComplete(profile);
  const emailVerified =
    contactEvidence.email.verified &&
    normalizeGuestEmail(contactEvidence.email.value) ===
      normalizeGuestEmail(resolvedForm.email);
  const phoneVerified =
    contactEvidence.phone.verified &&
    normalizeGuestPhone(contactEvidence.phone.value) ===
      normalizeGuestPhone(resolvedForm.phone);
  const savedAvatarUrl = getSafeAvatarUrl(resolvedForm.avatarUrl);
  const displayedAvatarUrl =
    photoPreviewUrl || (failedAvatarUrl !== savedAvatarUrl ? savedAvatarUrl : null);

  useEffect(() => {
    if (!user?.id || initializedUserId.current === user.id) return;
    initializedUserId.current = user.id;
    setDraft(createProfileDraft(profile, user, contactEvidence));
    setEditMode(!isGuestProfileComplete(profile));
  }, [contactEvidence, profile, user]);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  function selectPhoto(file: File | undefined): void {
    if (!file) return;
    setMessage(null);
    if (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.type)) {
      setMessage({ type: "error", text: "Choose a JPEG, PNG, WebP, HEIC, or HEIF image." });
      return;
    }
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setMessage({ type: "error", text: `Image must be ${formatImageUploadLimitLabel()} or smaller.` });
      return;
    }
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setSelectedPhoto(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  }

  async function uploadSelectedPhoto(accessToken?: string): Promise<string | null> {
    if (!selectedPhoto) return null;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedPhoto);

      const response = await fetch("/api/user/profile/photo", {
        method: "POST",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        body: formData,
      });

      const data = await readJsonOrText(response);
      if (!response.ok || typeof data.url !== "string") {
        throw new Error(typeof data.error === "string" ? data.error : "Upload failed.");
      }
      return data.url;
    } finally {
      setUploading(false);
    }
  }

  async function checkUsernameAvailability(): Promise<void> {
    const value = resolvedForm.username.trim().toLowerCase();
    setUsernameStatus("checking");
    setFieldErrors((current) => ({ ...current, username: undefined }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/auth/username/availability?username=${encodeURIComponent(value)}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      const payload = await response.json();
      if (!response.ok || payload.valid !== true) {
        setUsernameStatus("unavailable");
        setFieldErrors((current) => ({
          ...current,
          username: typeof payload.error === "string" ? payload.error : "Choose another username.",
        }));
        return;
      }
      setUsernameStatus(payload.available ? "available" : "unavailable");
      if (!payload.available) {
        setFieldErrors((current) => ({ ...current, username: "That username is not available." }));
      }
    } catch {
      setUsernameStatus("idle");
      setMessage({ type: "error", text: "Username availability could not be checked. Please retry." });
    }
  }

  async function sendPhoneVerificationOtp(): Promise<void> {
    setPhoneOtpState("sending");
    setPhoneOtp("");
    setPhoneOtpSessionId("");
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/user/profile/phone/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ phone: resolvedForm.phone }),
      });
      const payload = await response.json();
      if (!response.ok && payload.code === "PHONE_ALREADY_LINKED") {
        setPhoneConflict(resolvedForm.phone);
        setPhoneOtpState("idle");
        setFieldErrors((current) => ({ ...current, phone: undefined }));
        onPhoneConflictChange?.(true);
        return;
      }
      if (!response.ok || typeof payload.sessionId !== "string") {
        throw new Error(payload.error ?? "Unable to send a verification code.");
      }
      setPhoneOtpSessionId(payload.sessionId);
      setPhoneOtpState("sent");
      setMessage({ type: "success", text: "Verification code sent." });
    } catch (error) {
      setPhoneOtpState("idle");
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to send a verification code.",
      });
    }
  }

  async function verifyPhoneOtp(): Promise<void> {
    setPhoneOtpState("verifying");
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/user/profile/phone/verify-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          phone: resolvedForm.phone,
          otp: phoneOtp,
          sessionId: phoneOtpSessionId,
        }),
      });
      const payload = await response.json();
      if (!response.ok && payload.code === "PHONE_ALREADY_LINKED" && payload.ownershipVerified === true) {
        setPhoneConflict(resolvedForm.phone);
        setPhoneOtp("");
        setPhoneOtpSessionId("");
        setPhoneOtpState("idle");
        setFieldErrors((current) => ({ ...current, phone: undefined }));
        onPhoneConflictChange?.(true);
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? "The verification code is invalid or expired.");
      if (payload.profile && typeof payload.profile === "object") {
        applyProfile(payload.profile as UserProfileRecord);
      }
      await refreshAuth();
      setPhoneOtp("");
      setPhoneOtpSessionId("");
      setPhoneOtpState("idle");
      setPhoneConflict(null);
      onPhoneConflictChange?.(false);
      setFieldErrors((current) => ({ ...current, phone: undefined }));
      setMessage({ type: "success", text: "Phone verified successfully." });
    } catch (error) {
      setPhoneOtpState("sent");
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "The verification code is invalid or expired.",
      });
    }
  }

  function useAnotherPhone(): void {
    setDraft((current) => ({ ...current, phone: "" }));
    setPhoneOtp("");
    setPhoneOtpSessionId("");
    setPhoneOtpState("idle");
    setPhoneConflict(null);
    setAccountLinkRequestId("");
    setAccountLinkSessionId("");
    setAccountLinkOtp("");
    setAccountLinkState("idle");
    setMessage(null);
    setFieldErrors((current) => ({ ...current, phone: undefined }));
    onPhoneConflictChange?.(false);
  }

  async function logInWithLinkedPhone(): Promise<void> {
    if (!phoneConflict) return;
    setAccountLinkState("sending");
    setMessage(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch("/api/user/account-link/phone/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          phone: phoneConflict,
          returnTo: getSafeGuestAuthReturnPath(returnTo),
        }),
      });
      const payload = await response.json();
      if (
        !response.ok ||
        typeof payload.requestId !== "string" ||
        typeof payload.sessionId !== "string"
      ) {
        throw new Error(payload.error ?? "Unable to send a verification code.");
      }
      setAccountLinkRequestId(payload.requestId);
      setAccountLinkSessionId(payload.sessionId);
      setAccountLinkOtp("");
      setAccountLinkState("sent");
      setMessage({ type: "success", text: "Verification code sent." });
    } catch (error) {
      setAccountLinkState("idle");
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to send a verification code.",
      });
    }
  }

  async function verifyLinkedPhone(): Promise<void> {
    if (!phoneConflict || !accountLinkRequestId || !accountLinkSessionId) return;
    setAccountLinkState("verifying");
    setMessage(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch("/api/user/account-link/phone/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          requestId: accountLinkRequestId,
          phone: phoneConflict,
          otp: accountLinkOtp,
          sessionId: accountLinkSessionId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload.error ??
            "This account requires an audited support review before it can be linked."
        );
      }

      const {
        data: { user: sourceUser },
      } = await supabase.auth.getUser();
      const googleIdentity = sourceUser?.identities?.find(
        (identity) => identity.provider === "google"
      );
      if (!sourceUser || !googleIdentity || (sourceUser.identities?.length ?? 0) < 2) {
        throw new Error(
          "Google identity transfer requires an audited support review for this account."
        );
      }
      const { error: unlinkError } = await supabase.auth.unlinkIdentity(
        googleIdentity
      );
      if (unlinkError) throw unlinkError;

      window.sessionStorage.setItem(
        `famlo:account-link-source:${accountLinkRequestId}`,
        sourceUser.id
      );
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
      const profileUrl = new URL("/profile", window.location.origin);
      profileUrl.searchParams.set("link_request", accountLinkRequestId);
      profileUrl.searchParams.set("next", getSafeGuestAuthReturnPath(returnTo));
      window.location.replace(`${profileUrl.pathname}${profileUrl.search}`);
    } catch (error) {
      setAccountLinkState("sent");
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "The verification code is invalid or expired.",
      });
    }
  }

  async function sendEmailVerificationOtp(): Promise<void> {
    setEmailOtpState("sending");
    setEmailOtp("");
    setMessage(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch("/api/user/profile/email/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          email: resolvedForm.email,
          returnTo: getSafeGuestAuthReturnPath(returnTo),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to verify this email.");
      setEmailOtpState("sent");
      setMessage({ type: "success", text: "Check your email for the verification code." });
    } catch (error) {
      setEmailOtpState("idle");
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to verify this email.",
      });
    }
  }

  async function verifyEmailOtp(): Promise<void> {
    setEmailOtpState("verifying");
    setMessage(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch("/api/user/profile/email/verify-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          email: resolvedForm.email,
          otp: emailOtp,
          accountLinkRequestId: activeAccountLinkRequestId,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.session) {
        throw new Error(payload.error ?? "The verification code is invalid or expired.");
      }
      const { error: sessionError } = await supabase.auth.setSession(payload.session);
      if (sessionError) throw sessionError;
      if (payload.profile) applyProfile(payload.profile as UserProfileRecord);
      await refreshAuth();
      setEmailOtp("");
      setEmailOtpState("idle");
      setMessage({ type: "success", text: "Email verified successfully." });
    } catch (error) {
      setEmailOtpState("sent");
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "The verification code is invalid or expired.",
      });
    }
  }

  function cancelEditing(): void {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setDraft(createProfileDraft(profile, user, contactEvidence));
    setSelectedPhoto(null);
    setPhotoPreviewUrl("");
    setUsernameStatus("idle");
    setPhoneOtp("");
    setPhoneOtpSessionId("");
    setPhoneOtpState("idle");
    setPhoneConflict(null);
    setFieldErrors({});
    setMessage(null);
    onPhoneConflictChange?.(false);
    setEditMode(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!user) {
      setMessage({ type: "error", text: "Please sign in first." });
      return;
    }

    setSaving(true);
    setMessage(null);
    const validationErrors = validateGuestProfileDetailsInput({
      userId: user.id,
      ...resolvedForm,
    });
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setMessage({ type: "error", text: "Please correct the highlighted profile fields." });
      setSaving(false);
      return;
    }
    setFieldErrors({});

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uploadedAvatarUrl = await uploadSelectedPhoto(session?.access_token);
      const avatarUrlToSave = uploadedAvatarUrl ?? (resolvedForm.avatarUrl || null);

      const response = await fetch("/api/user/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          userId: user.id,
          username: resolvedForm.username,
          email: resolvedForm.email || null,
          phone: resolvedForm.phone || null,
          name: resolvedForm.name,
          city: resolvedForm.city,
          state: resolvedForm.state,
          about: resolvedForm.about,
          dob: resolvedForm.dob,
          gender: resolvedForm.gender,
          avatarUrl: avatarUrlToSave,
        }),
      });

      const data = await readJsonOrText(response);
      if (!response.ok || data.error) {
        if (data.fieldErrors && typeof data.fieldErrors === "object") {
          setFieldErrors(data.fieldErrors as GuestProfileFieldErrors);
        }
        throw new Error(typeof data.error === "string" ? data.error : "Profile save failed.");
      }

      const savedProfile = (data.profile as Record<string, unknown> | undefined) ?? null;
      if (!savedProfile || typeof savedProfile.id !== "string") {
        throw new Error("Profile save could not be verified.");
      }

      const canonicalProfile = savedProfile as unknown as UserProfileRecord;
      applyProfile(canonicalProfile);
      setDraft(createProfileDraft(canonicalProfile, user, contactEvidence));
      setSelectedPhoto(null);
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl("");
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      await refreshAuth();
      setPhoneConflict(null);
      onPhoneConflictChange?.(false);
      setEditMode(true);
      setMessage({
        type: "success",
        text:
          data.profileComplete === true
            ? "Profile details saved. You can continue to booking."
            : "Profile details saved. Verify both contact methods before booking.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Profile save failed.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!editMode && profileComplete) {
    const persistedAvatarUrl = getSafeAvatarUrl(profile?.avatar_url);
    const formattedDateOfBirth = profile?.date_of_birth
      ? new Intl.DateTimeFormat("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${profile.date_of_birth}T00:00:00Z`))
      : "Not added";

    return (
      <section className="profile-view-card">
        <div className="form-heading">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <span>Complete</span>
        </div>

        <div className="profile-view-layout">
          <aside className="profile-view-avatar">
            <div className="account-avatar-picker">
              {persistedAvatarUrl && failedAvatarUrl !== persistedAvatarUrl ? (
                <Image
                  src={persistedAvatarUrl}
                  alt={profile?.name || "Guest profile"}
                  width={240}
                  height={240}
                  sizes="120px"
                  unoptimized
                  onError={() => setFailedAvatarUrl(persistedAvatarUrl)}
                  className="account-avatar-preview"
                />
              ) : (
                <div className="account-avatar-fallback">
                  {(profile?.name || user?.email || "U").charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </aside>

          <div className="profile-view-grid">
            <div><span>Username</span><strong>@{profile?.username}</strong></div>
            <div><span>Full name</span><strong>{profile?.name}</strong></div>
            <div><span>Gender</span><strong>{profile?.gender?.replace(/_/g, " ")}</strong></div>
            <div><span>Date of birth</span><strong>{formattedDateOfBirth}</strong></div>
            <div><span>City</span><strong>{profile?.city}</strong></div>
            <div><span>State</span><strong>{profile?.state}</strong></div>
            <div>
              <span>Phone</span>
              <strong>{profile?.phone}</strong>
              <small>{contactEvidence.phone.verified ? "Verified" : "Not verified"}</small>
            </div>
            <div>
              <span>Email</span>
              <strong>{contactEvidence.email.value ?? profile?.email}</strong>
              <small>{contactEvidence.email.verified ? "Verified" : "Not verified"}</small>
            </div>
            <div className="full-span">
              <span>About you</span>
              <strong className="about-value">{profile?.about || "Not added"}</strong>
            </div>
          </div>
        </div>

        {message ? <p className={message.type}>{message.text}</p> : null}
        <div className="profile-view-actions">
          <button
            type="button"
            className="button-like edit-profile"
            onClick={() => {
              setDraft(createProfileDraft(profile, user, contactEvidence));
              setMessage(null);
              setEditMode(true);
            }}
          >
            Edit profile
          </button>
          {onSuccess ? (
            <button
              type="button"
              className="button-like edit-profile"
              onClick={() => void onSuccess()}
            >
              Continue to booking
            </button>
          ) : null}
        </div>

        <style jsx>{`
          .profile-view-card {
            padding: clamp(22px, 4vw, 32px);
            display: grid;
            gap: 24px;
            border: 1px solid #e5eaf2;
            border-radius: 20px;
            background: #fff;
            box-shadow: 0 14px 40px rgba(15, 23, 42, 0.06);
          }
          .form-heading { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
          .form-heading h2 { margin: 0; color: #0f172a; font-size: 21px; }
          .form-heading p { margin: 6px 0 0; color: #64748b; font-size: 14px; line-height: 1.55; }
          .form-heading > span { padding: 7px 11px; border-radius: 999px; color: #166534; background: #dcfce7; font-size: 11px; font-weight: 800; }
          .profile-view-layout { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: clamp(24px, 4vw, 42px); align-items: start; }
          .profile-view-avatar { display: grid; justify-items: center; padding: 10px 0; }
          .profile-view-avatar :global(.account-avatar-picker) { width: 120px; height: 120px; border: 3px solid #dbeafe; box-shadow: 0 12px 28px rgba(37, 99, 235, 0.12); }
          .profile-view-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 28px; }
          .profile-view-grid > div { display: grid; gap: 5px; min-width: 0; }
          .profile-view-grid span { color: #64748b; font-size: 11px; font-weight: 700; }
          .profile-view-grid strong { color: #172033; font-size: 14px; font-weight: 700; overflow-wrap: anywhere; text-transform: none; }
          .profile-view-grid small { width: max-content; padding: 3px 7px; border-radius: 999px; color: #166534; background: #dcfce7; font-size: 10px; font-weight: 800; }
          .profile-view-grid .full-span { grid-column: 1 / -1; }
          .about-value { white-space: pre-wrap; line-height: 1.6; }
          p.success, p.error { margin: 0; padding: 11px 13px; border-radius: 11px; font-size: 13px; font-weight: 700; }
          p.success { color: #166534; background: #dcfce7; }
          p.error { color: #b91c1c; background: #fee2e2; }
          .edit-profile { width: max-content; min-width: 140px; min-height: 44px; border-radius: 12px; }
          .profile-view-actions { display: flex; flex-wrap: wrap; gap: 10px; }
          @media (max-width: 760px) {
            .profile-view-layout { grid-template-columns: 1fr; }
            .profile-view-avatar { justify-items: start; }
          }
          @media (max-width: 640px) {
            .profile-view-grid { grid-template-columns: 1fr; }
            .profile-view-grid .full-span { grid-column: auto; }
            .profile-view-actions, .edit-profile { width: 100%; }
          }
        `}</style>
      </section>
    );
  }

  return (
    <form
      className="panel detail-box account-verification-form"
      onSubmit={(event) => void handleSubmit(event)}
      style={{
        padding: compact ? "20px" : "clamp(22px, 4vw, 32px)",
        display: "grid",
        gap: "24px",
        borderRadius: "20px",
        border: "1px solid #e5eaf2",
        background: "#ffffff",
        boxShadow: "0 14px 40px rgba(15, 23, 42, 0.06)",
      }}
    >
      <div className="form-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className={profileComplete && !phoneConflict ? "complete" : "incomplete"}>
          {profileComplete && !phoneConflict ? "Complete" : "Required"}
        </span>
      </div>

      <div className="profile-editor-layout">
        <aside className="avatar-panel">
          <div className="account-avatar-picker">
          {displayedAvatarUrl ? (
            <Image
              src={displayedAvatarUrl}
              alt="Guest profile preview"
              width={240}
              height={240}
              sizes="120px"
              unoptimized
              onError={() => setFailedAvatarUrl(displayedAvatarUrl)}
              className="account-avatar-preview"
            />
          ) : (
            <div className="account-avatar-fallback">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21a8 8 0 0 0-16 0" />
                <circle cx="12" cy="8" r="4" />
              </svg>
            </div>
          )}
          {uploading ? (
            <div className="account-avatar-overlay">
              <strong>Uploading...</strong>
            </div>
          ) : null}
          </div>
          <input
            ref={avatarInputRef}
            className="account-hidden-file"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(event) => selectPhoto(event.target.files?.[0])}
          />
          <input
            ref={cameraInputRef}
            className="account-hidden-file"
            type="file"
            accept="image/*"
            capture="user"
            onChange={(event) => selectPhoto(event.target.files?.[0])}
          />
          <div className="photo-actions">
            <button className="photo-action" type="button" onClick={() => avatarInputRef.current?.click()}>
              <Upload size={15} /> Choose photo
            </button>
            <button className="photo-action mobile-camera" type="button" onClick={() => cameraInputRef.current?.click()}>
              <Camera size={15} /> Take photo
            </button>
          </div>
          <p>JPG, PNG, WebP, HEIC or HEIF. {formatImageUploadLimitLabel()} maximum.</p>
          {fieldErrors.avatarUrl ? <small className="field-error">{fieldErrors.avatarUrl}</small> : null}
        </aside>

        <div className="compact-form-grid">
        <label className="full-span">
          <span>Username</span>
          <div className="username-row">
            <input
              className="mini-input"
              required
              autoCapitalize="none"
              autoComplete="username"
              value={resolvedForm.username}
              onChange={(event) => {
                setDraft((current) => ({ ...current, username: event.target.value.toLowerCase().trimStart() }));
                setUsernameStatus("idle");
              }}
              placeholder="aryan_krishan"
            />
            <button type="button" disabled={usernameStatus === "checking"} onClick={() => void checkUsernameAvailability()}>
              {usernameStatus === "checking" ? "Checking..." : "Check"}
            </button>
          </div>
          {usernameStatus === "available" ? <small className="field-success">Username is available.</small> : null}
          {fieldErrors.username ? <small className="field-error">{fieldErrors.username}</small> : null}
        </label>

        <label>
          <span>Full name</span>
          <input
            className="mini-input"
            required
            value={resolvedForm.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            placeholder="Aryan Krishan"
          />
          {fieldErrors.name ? <small className="field-error">{fieldErrors.name}</small> : null}
        </label>

        <label>
          <span>Gender</span>
          <div style={{ position: "relative" }}>
            <select
              className="mini-input"
              style={{ appearance: "none", paddingRight: "16px" }}
              required
              value={resolvedForm.gender}
              onChange={(event) => setDraft((current) => ({ ...current, gender: event.target.value }))}
            >
              <option value="">Select</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="non_binary">Non-binary</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
            <ChevronDown size={8} style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", opacity: 0.5 }} />
          </div>
          {fieldErrors.gender ? <small className="field-error">{fieldErrors.gender}</small> : null}
        </label>

        <label className="cool-calendar-wrapper">
          <span>Date of birth</span>
          <div className="calendar-field">
            <input
              className="mini-input calendar-input"
              required
              type="date"
              value={resolvedForm.dob}
              onChange={(event) => setDraft((current) => ({ ...current, dob: event.target.value }))}
            />
            <div className="calendar-icon-pills">
              <Calendar size={10} />
            </div>
          </div>
          {fieldErrors.dob ? <small className="field-error">{fieldErrors.dob}</small> : null}
        </label>

        <label>
          <span>City</span>
          <input
            className="mini-input"
            required
            value={resolvedForm.city}
            onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))}
            placeholder="Hisar"
          />
          {fieldErrors.city ? <small className="field-error">{fieldErrors.city}</small> : null}
        </label>

        <label>
          <span>State</span>
          <input
            className="mini-input"
            required
            value={resolvedForm.state}
            onChange={(event) => setDraft((current) => ({ ...current, state: event.target.value }))}
            placeholder="Haryana"
          />
          {fieldErrors.state ? <small className="field-error">{fieldErrors.state}</small> : null}
        </label>

        <label>
          <span>Phone</span>
          <input
            className="mini-input"
            type="tel"
            required
            value={resolvedForm.phone}
            onChange={(event) => {
              setDraft((current) => ({ ...current, phone: event.target.value }));
              setPhoneOtp("");
              setPhoneOtpSessionId("");
              setPhoneOtpState("idle");
              if (phoneConflict) {
                setPhoneConflict(null);
                onPhoneConflictChange?.(false);
              }
            }}
            placeholder="+91 XXXXX XXXXX"
          />
          {fieldErrors.phone ? <small className="field-error">{fieldErrors.phone}</small> : null}
          <small className="verification-note">Phone: {phoneVerified ? "Verified" : "Not verified"}</small>
          {!phoneVerified ? (
            <button
              className="verify-phone-action"
              type="button"
              disabled={!resolvedForm.phone || phoneOtpState === "sending" || phoneOtpState === "verifying"}
              onClick={() => void sendPhoneVerificationOtp()}
            >
              {phoneOtpState === "sending" ? "Sending..." : phoneOtpState === "sent" ? "Resend OTP" : "Verify phone"}
            </button>
          ) : null}
          {phoneOtpState === "sent" || phoneOtpState === "verifying" ? (
            <div className="phone-otp-row">
              <input
                className="mini-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={phoneOtp}
                onChange={(event) => setPhoneOtp(event.target.value.replace(/\D/g, ""))}
                placeholder="6-digit OTP"
              />
              <button type="button" disabled={phoneOtp.length !== 6 || phoneOtpState === "verifying"} onClick={() => void verifyPhoneOtp()}>
                {phoneOtpState === "verifying" ? "Checking..." : "Verify"}
              </button>
            </div>
          ) : null}
          {phoneConflict ? (
            <div className="phone-conflict" role="alert">
              <strong>This phone number is already linked to another Famlo account.</strong>
              <p>Log in with this phone number to access that account, or use a different number for this profile.</p>
              <div>
                <button
                  type="button"
                  className="conflict-primary"
                  disabled={accountLinkState === "sending" || accountLinkState === "verifying"}
                  onClick={() => void logInWithLinkedPhone()}
                >
                  {accountLinkState === "sending"
                    ? "Sending..."
                    : accountLinkState === "sent"
                      ? "Resend OTP"
                      : "Log in with this phone"}
                </button>
                <button type="button" className="conflict-secondary" onClick={useAnotherPhone}>
                  Use another number
                </button>
              </div>
              {accountLinkState === "sent" || accountLinkState === "verifying" ? (
                <div className="phone-otp-row">
                  <input
                    className="mini-input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={accountLinkOtp}
                    onChange={(event) =>
                      setAccountLinkOtp(event.target.value.replace(/\D/g, ""))
                    }
                    placeholder="6-digit OTP"
                  />
                  <button
                    type="button"
                    disabled={
                      accountLinkOtp.length !== 6 ||
                      accountLinkState === "verifying"
                    }
                    onClick={() => void verifyLinkedPhone()}
                  >
                    {accountLinkState === "verifying" ? "Checking..." : "Verify"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </label>

        <label className="full-span">
          <span>Email</span>
          <input
            className="mini-input"
            type="email"
            required
            readOnly={contactEvidence.email.readOnly}
            aria-readonly={contactEvidence.email.readOnly}
            value={resolvedForm.email}
            onChange={(event) => {
              if (contactEvidence.email.readOnly) return;
              setDraft((current) => ({ ...current, email: event.target.value }));
              setEmailOtp("");
              setEmailOtpState("idle");
            }}
            placeholder="name@example.com"
          />
          {fieldErrors.email ? <small className="field-error">{fieldErrors.email}</small> : null}
          <small className="verification-note">Email: {emailVerified ? "Verified" : "Not verified"}</small>
          {(!emailVerified || activeAccountLinkRequestId) &&
          !contactEvidence.email.readOnly ? (
            <button
              className="verify-phone-action"
              type="button"
              disabled={
                !resolvedForm.email ||
                emailOtpState === "sending" ||
                emailOtpState === "verifying"
              }
              onClick={() => void sendEmailVerificationOtp()}
            >
              {emailOtpState === "sending"
                ? "Sending..."
                : emailOtpState === "sent"
                  ? "Resend code"
                  : activeAccountLinkRequestId && emailVerified
                    ? "Confirm email to link Google"
                    : "Verify email"}
            </button>
          ) : null}
          {emailOtpState === "sent" || emailOtpState === "verifying" ? (
            <div className="phone-otp-row">
              <input
                className="mini-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={emailOtp}
                onChange={(event) =>
                  setEmailOtp(event.target.value.replace(/\D/g, ""))
                }
                placeholder="Email code"
              />
              <button
                type="button"
                disabled={
                  emailOtp.length < 6 || emailOtpState === "verifying"
                }
                onClick={() => void verifyEmailOtp()}
              >
                {emailOtpState === "verifying" ? "Checking..." : "Verify"}
              </button>
            </div>
          ) : null}
        </label>

        <label className="full-span">
          <span>About you</span>
          <textarea
            className="mini-input"
            rows={2}
            value={resolvedForm.about}
            onChange={(event) => setDraft((current) => ({ ...current, about: event.target.value }))}
            placeholder="Tell Famlo hosts a little about yourself."
            style={{ resize: "none", lineHeight: 1.2 }}
          />
          {fieldErrors.about ? <small className="field-error">{fieldErrors.about}</small> : null}
        </label>
        </div>
      </div>

      {message ? (
        <div
          style={{
            borderRadius: 12,
            padding: "12px 14px",
            background: message.type === "success" ? "#dcfce7" : "#fee2e2",
            color: message.type === "success" ? "#166534" : "#b91c1c",
            fontWeight: 700,
            fontSize: "13px"
          }}
        >
          {message.text}
        </div>
      ) : null}

      <div className="profile-form-actions">
        <button className="button-like account-submit-btn compact-btn" disabled={saving || uploading || Boolean(phoneConflict)} type="submit">
          {uploading ? "Uploading photo..." : saving ? "Saving..." : "Save details"}
        </button>
        {profileComplete && onSuccess ? (
          <button
            className="button-like continue-booking"
            disabled={saving || uploading}
            type="button"
            onClick={() => void onSuccess()}
          >
            {buttonLabel === "Save profile" ? "Continue to booking" : buttonLabel.replace(/^Save( profile)?( and)?/i, "Continue")}
          </button>
        ) : null}
        {profileComplete ? (
          <button className="cancel-edit" disabled={saving || uploading} type="button" onClick={cancelEditing}>
            Cancel
          </button>
        ) : null}
      </div>

      <style jsx>{`
        .form-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .form-heading h2 {
          margin: 0;
          color: #0f172a;
          font-size: 21px;
        }
        .form-heading p {
          margin: 6px 0 0;
          color: #64748b;
          font-size: 14px;
          line-height: 1.55;
        }
        .form-heading > span {
          flex: 0 0 auto;
          padding: 7px 11px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
        }
        .form-heading > span.complete {
          color: #166534;
          background: #dcfce7;
        }
        .form-heading > span.incomplete {
          color: #8a4b08;
          background: #fff3d6;
        }
        .profile-editor-layout {
          display: grid;
          grid-template-columns: 180px minmax(0, 1fr);
          gap: clamp(24px, 4vw, 42px);
          align-items: start;
        }
        .avatar-panel {
          display: grid;
          justify-items: center;
          gap: 12px;
          padding: 10px 0;
          text-align: center;
        }
        .avatar-panel :global(.account-avatar-picker) {
          width: 120px;
          height: 120px;
          border: 3px solid #dbeafe;
          box-shadow: 0 12px 28px rgba(37, 99, 235, 0.12);
        }
        .avatar-panel p {
          margin: 0;
          max-width: 170px;
          color: #94a3b8;
          font-size: 11px;
          line-height: 1.5;
        }
        .photo-actions {
          display: grid;
          gap: 8px;
          width: 100%;
        }
        .compact-form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 18px 16px;
        }

        .compact-form-grid label {
          display: grid;
          gap: 7px;
        }

        .compact-form-grid label span {
          color: #334155;
          font-size: 12px;
          font-weight: 700;
        }

        .field-error {
          color: #b91c1c;
          font-size: 11px;
          line-height: 1.4;
        }

        .field-success {
          color: #166534;
          font-size: 11px;
        }

        .verification-note {
          width: max-content;
          padding: 4px 8px;
          border-radius: 999px;
          color: #475569;
          background: #f1f5f9;
          font-size: 10px;
          font-weight: 700;
        }

        .phone-otp-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
        }

        .phone-otp-row button,
        .verify-phone-action {
          min-height: 40px;
          border: 1px solid #bfdbfe;
          border-radius: 10px;
          background: #fff;
          color: #1d4ed8;
          padding: 0 12px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }
        .phone-conflict {
          display: grid;
          gap: 8px;
          padding: 14px;
          border: 1px solid #f8d58b;
          border-radius: 13px;
          background: #fffaf0;
          color: #7c4208;
        }
        .phone-conflict > strong { font-size: 13px; line-height: 1.4; }
        .phone-conflict p { margin: 0; color: #7c5a32; font-size: 12px; line-height: 1.5; }
        .phone-conflict > div { display: flex; gap: 8px; flex-wrap: wrap; }
        .phone-conflict button {
          min-height: 38px;
          padding: 0 12px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }
        .conflict-primary { border: 1px solid #1d4ed8; background: #1d4ed8; color: #fff; }
        .conflict-secondary { border: 1px solid #d8b36a; background: #fff; color: #7c4208; }
        .continue-booking { min-height: 44px; }

        .username-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
        }

        .username-row button,
        .photo-action {
          border: 1px solid #bfdbfe;
          border-radius: 11px;
          background: #fff;
          color: #1d4ed8;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }
        .username-row button {
          min-width: 76px;
          padding: 0 12px;
        }

        .photo-action {
          min-height: 38px;
          padding: 8px 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        .photo-action:hover,
        .username-row button:hover,
        .verify-phone-action:hover {
          background: #eff6ff;
        }
        .photo-action:focus-visible,
        .username-row button:focus-visible,
        .verify-phone-action:focus-visible,
        .phone-otp-row button:focus-visible,
        .mini-input:focus-visible {
          outline: 3px solid rgba(59, 130, 246, 0.2);
          outline-offset: 2px;
        }

        .upload-photo {
          background: #1d4ed8;
          color: #fff;
          border-color: #1d4ed8;
        }

        .mobile-camera {
          display: none;
        }

        .mini-input {
          width: 100%;
          height: 46px;
          padding: 0 13px;
          border-radius: 12px;
          border: 1px solid #dbe2ea;
          font-size: 14px;
          color: #1e293b;
          background: #fff;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          box-sizing: border-box;
        }

        .mini-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        textarea.mini-input {
          height: auto;
          min-height: 96px;
          padding-top: 12px;
          line-height: 1.5 !important;
        }

        .calendar-field {
          position: relative;
          display: flex;
          align-items: center;
        }

        .calendar-input {
          padding-right: 44px;
        }

        .calendar-icon-pills {
          position: absolute;
          right: 8px;
          width: 30px;
          height: 30px;
          background: #eff6ff;
          color: #3b82f6;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .full-span {
          grid-column: 1 / -1;
        }

        .compact-btn {
          width: max-content;
          min-width: 150px;
          min-height: 44px;
          padding: 10px 22px;
          font-size: 14px;
          border-radius: 12px;
          font-weight: 800;
          justify-self: end;
        }
        .profile-form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }
        .cancel-edit {
          min-width: 110px;
          min-height: 44px;
          padding: 10px 18px;
          border: 1px solid #dbe2ea;
          border-radius: 12px;
          background: #fff;
          color: #475569;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
        }

        @media (max-width: 760px) {
          .profile-editor-layout {
            grid-template-columns: 1fr;
          }
          .avatar-panel {
            justify-items: start;
            text-align: left;
          }
          .photo-actions {
            display: flex;
            flex-wrap: wrap;
            width: auto;
          }
          .avatar-panel p {
            max-width: 320px;
          }
        }
        @media (max-width: 640px) {
          .compact-form-grid {
            grid-template-columns: 1fr;
          }
          .form-heading {
            align-items: center;
          }
          .mobile-camera {
            display: inline-flex;
          }
          .compact-btn {
            width: 100%;
            justify-self: stretch;
          }
          .profile-form-actions {
            display: grid;
          }
          .cancel-edit {
            width: 100%;
          }
        }
      `}</style>
    </form>
  );
}
