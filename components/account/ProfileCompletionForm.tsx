"use client";

import { useMemo, useRef, useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";

import { useUser } from "@/components/auth/UserContext";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { isGuestProfileComplete } from "@/lib/user-profile";
import { MAX_IMAGE_UPLOAD_BYTES, formatImageUploadLimitLabel } from "@/lib/upload-limits";

interface ProfileCompletionFormProps {
  title?: string;
  description?: string;
  buttonLabel?: string;
  compact?: boolean;
  onSuccess?: () => Promise<void> | void;
}

type ProfileDraft = {
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
  onSuccess,
}: Readonly<ProfileCompletionFormProps>): React.JSX.Element {
  const { user, profile, refreshProfile } = useUser();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [manualEditMode, setManualEditMode] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>({
    email: "",
    phone: "",
    name: "",
    city: "",
    state: "",
    about: "",
    dob: "",
    gender: "",
    avatarUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const resolvedForm = {
    email: draft.email || profile?.email || user?.email || "",
    phone: draft.phone || profile?.phone || user?.phone || "",
    name: draft.name || profile?.name || "",
    city: draft.city || profile?.city || "",
    state: draft.state || profile?.state || "",
    about: draft.about || profile?.about || "",
    dob: draft.dob || profile?.date_of_birth || "",
    gender: draft.gender || profile?.gender || "",
    avatarUrl: draft.avatarUrl || profile?.avatar_url || "",
  };

  const profileComplete = isGuestProfileComplete({
    ...(profile ?? {
      id: user?.id ?? "",
      name: null,
      phone: null,
      email: null,
      city: null,
      state: null,
      onboarding_completed: false,
      avatar_url: null,
      about: null,
      date_of_birth: null,
      gender: null,
      kyc_status: null,
      id_document_url: null,
      id_document_type: null,
    }),
    name: resolvedForm.name || null,
    phone: resolvedForm.phone || null,
    email: resolvedForm.email || null,
    city: resolvedForm.city || null,
    state: resolvedForm.state || null,
    about: resolvedForm.about || null,
    date_of_birth: resolvedForm.dob || null,
    gender: resolvedForm.gender || null,
  });

  const emailLocked = Boolean(user?.email || profile?.email);
  const phoneLocked = Boolean(user?.phone || profile?.phone);

  async function handleAvatarUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(null);

    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Please upload an image file.");
      }

      if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
        throw new Error(`Image must be ${formatImageUploadLimitLabel()} or smaller.`);
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "guest-profile");

      const response = await fetch("/api/onboarding/home/upload", {
        method: "POST",
        body: formData,
      });

      const data = await readJsonOrText(response);
      if (!response.ok || typeof data.url !== "string") {
        throw new Error(typeof data.error === "string" ? data.error : "Upload failed.");
      }

      setDraft((current) => ({ ...current, avatarUrl: data.url as string }));
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Upload failed.",
      });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!user) {
      setMessage({ type: "error", text: "Please sign in first." });
      return;
    }

    if (!resolvedForm.phone && !resolvedForm.email) {
      setMessage({ type: "error", text: "Add at least one contact method: phone or email." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/user/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          ...(user?.id ? { "x-famlo-user-id": user.id } : {}),
          ...(resolvedForm.email ? { "x-famlo-user-email": resolvedForm.email } : {}),
        },
        body: JSON.stringify({
          userId: user.id,
          email: resolvedForm.email || null,
          phone: resolvedForm.phone || null,
          name: resolvedForm.name,
          city: resolvedForm.city,
          state: resolvedForm.state,
          about: resolvedForm.about,
          dob: resolvedForm.dob,
          gender: resolvedForm.gender,
          avatarUrl: resolvedForm.avatarUrl || null,
        }),
      });

      const data = await readJsonOrText(response);
      if (!response.ok || data.error) {
        throw new Error(typeof data.error === "string" ? data.error : "Profile save failed.");
      }

      await refreshProfile();
      if (onSuccess) await onSuccess();
      setManualEditMode(false);
      setMessage({
        type: "success",
        text: "Profile saved. You can continue to booking now.",
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

  if (profileComplete && !manualEditMode) {
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
              background: "#dcfce7",
              color: "#166534",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Profile saved
          </span>
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
      </section>
    );
  }

  return (
    <form
      className="panel detail-box account-verification-form"
      onSubmit={(event) => void handleSubmit(event)}
      style={{
        padding: compact ? "8px" : "12px",
        display: "grid",
        gap: "8px",
        borderRadius: "10px",
        border: "1px solid #f1f5f9",
        background: "#ffffff",
        boxShadow: "0 2px 8px rgba(14, 43, 87, 0.01)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#1e40af" }}>{title}</h2>
          <p style={{ margin: "1px 0 0", color: "#64748b", fontSize: "11px", lineHeight: 1.3 }}>{description}</p>
        </div>
        <span
          style={{
            padding: "2px 6px",
            borderRadius: 999,
            background: profileComplete ? "#dcfce7" : "#eff6ff",
            color: profileComplete ? "#166534" : "#1e40af",
            fontSize: 8,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.05em"
          }}
        >
          {profileComplete ? "Saved" : "Req"}
        </span>
      </div>

      <div className="account-avatar-stage" style={{ padding: "0 2px", display: "flex", alignItems: "center", gap: "8px" }}>
        <button className="account-avatar-picker" type="button" onClick={() => avatarInputRef.current?.click()} style={{ width: "40px", height: "40px" }}>
          {resolvedForm.avatarUrl ? (
            <img src={resolvedForm.avatarUrl} alt="Guest profile" className="account-avatar-preview" />
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
              <strong style={{ fontSize: "7px" }}>...</strong>
            </div>
          ) : null}
        </button>
        <input
          ref={avatarInputRef}
          className="account-hidden-file"
          type="file"
          accept="image/*"
          onChange={(event) => void handleAvatarUpload(event)}
        />
        <p className="account-upload-note" style={{ margin: 0, fontSize: "9px", color: "#64748b", fontWeight: 600 }}>
          Profile photo
        </p>
      </div>

      <div className="compact-form-grid">
        <label>
          <span>Full name</span>
          <input
            className="mini-input"
            required
            value={resolvedForm.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            placeholder="Aryan Krishan"
          />
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
        </label>

        <label>
          <span>Phone</span>
          <input
            className="mini-input"
            type="tel"
            value={resolvedForm.phone}
            disabled={phoneLocked}
            onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
            placeholder="+91 XXXXX XXXXX"
          />
        </label>

        <label className="full-span">
          <span>Email</span>
          <input
            className="mini-input"
            type="email"
            value={resolvedForm.email}
            disabled={emailLocked}
            onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
            placeholder="name@example.com"
          />
        </label>

        <label className="full-span">
          <span>About you</span>
          <textarea
            className="mini-input"
            required
            rows={2}
            value={resolvedForm.about}
            onChange={(event) => setDraft((current) => ({ ...current, about: event.target.value }))}
            placeholder="Tell Famlo hosts a little about yourself."
            style={{ resize: "none", lineHeight: 1.2 }}
          />
        </label>
      </div>

      {message ? (
        <div
          style={{
            borderRadius: 6,
            padding: "4px 8px",
            background: message.type === "success" ? "#dcfce7" : "#fee2e2",
            color: message.type === "success" ? "#166534" : "#b91c1c",
            fontWeight: 700,
            fontSize: "10px"
          }}
        >
          {message.text}
        </div>
      ) : null}

      <button className="button-like account-submit-btn compact-btn" disabled={saving || uploading} type="submit">
        {saving ? "..." : buttonLabel}
      </button>

      <style jsx>{`
        .compact-form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 4px 8px;
        }

        .compact-form-grid label {
          display: grid;
          gap: 0;
        }

        .compact-form-grid label span {
          font-size: 8px;
          font-weight: 800;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          margin-bottom: 0;
        }

        .mini-input {
          width: 100%;
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid #e2e8f0;
          font-size: 10px;
          color: #1e293b;
          background: #f8fafc;
          transition: all 0.2s ease;
          box-sizing: border-box;
          height: 24px;
        }

        .mini-input:focus {
          outline: none;
          border-color: #3b82f6;
          background: #fff;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.05);
        }

        textarea.mini-input {
          height: auto;
          min-height: 36px;
        }

        .calendar-field {
          position: relative;
          display: flex;
          align-items: center;
        }

        .calendar-input {
          padding-right: 24px;
        }

        .calendar-icon-pills {
          position: absolute;
          right: 2px;
          width: 18px;
          height: 18px;
          background: #eff6ff;
          color: #3b82f6;
          border-radius: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .full-span {
          grid-column: 1 / -1;
        }

        .compact-btn {
          padding: 4px;
          font-size: 10px;
          border-radius: 4px;
          font-weight: 800;
          min-height: 30px;
          margin-top: 4px;
        }

        @media (max-width: 640px) {
          .compact-form-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </form>
  );
}
