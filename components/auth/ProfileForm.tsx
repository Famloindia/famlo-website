"use client";

import { useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useUser } from "./UserContext";
import { MAX_IMAGE_UPLOAD_BYTES, formatImageUploadLimitLabel } from "@/lib/upload-limits";

interface ProfileFormProps {
  onSuccess: () => void;
}

export function ProfileForm({ onSuccess }: ProfileFormProps) {
  const { user, profile, refreshProfile } = useUser();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    city: "",
    state: "",
    dob: "",
    gender: "",
    avatarUrl: "",
  });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const payload = {
    name: formData.name || profile?.name || "",
    phone: formData.phone || profile?.phone || user?.phone || "",
    city: formData.city || profile?.city || "",
    state: formData.state || profile?.state || "",
    dob: formData.dob || profile?.date_of_birth || "",
    gender: formData.gender || profile?.gender || "",
    avatarUrl: formData.avatarUrl || profile?.avatar_url || "",
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Please upload an image file.");
      }

      if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
        throw new Error(`Image must be ${formatImageUploadLimitLabel()} or smaller.`);
      }

      const uploadForm = new FormData();
      uploadForm.append("file", file);
      uploadForm.append("folder", "guest-profile");

      const response = await fetch("/api/onboarding/home/upload", {
        method: "POST",
        body: uploadForm,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.url !== "string") {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to upload profile photo.");
      }

      setFormData((current) => ({ ...current, avatarUrl: data.url }));
    } catch (err: any) {
      setError(err.message || "Failed to upload profile photo.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!payload.avatarUrl) {
      setError("Please upload your profile photo.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/user/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          ...(user?.id ? { "x-famlo-user-id": user.id } : {}),
          ...(user?.email ? { "x-famlo-user-email": user.email } : {}),
        },
        body: JSON.stringify({
          userId: user.id,
          ...payload,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      await refreshProfile();
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h2>Complete your profile</h2>
      <p className="auth-subtitle">Just a few more details to help Home hosts know who is visiting.</p>

      <div className="input-group">
        <label>Full Name</label>
        <input
          type="text"
          placeholder="Enter your name"
          value={formData.name || profile?.name || ""}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="auth-input"
          required
        />
      </div>

      <div className="input-group">
        <label>Phone Number</label>
        <input
          type="tel"
          placeholder="+91 XXXXX XXXXX"
          value={formData.phone || profile?.phone || user?.phone || ""}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          className="auth-input"
          required
          disabled={Boolean(user?.phone || profile?.phone)}
        />
        <p className="field-helper">
          {user?.phone || profile?.phone
            ? "This number is linked to your login."
            : "Add the number you want saved on your guest profile."}
        </p>
      </div>

      <div className="input-group">
        <label>Profile Photo</label>
        <div className="photo-upload-row">
          <label className="photo-upload-trigger">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              disabled={uploading || loading}
              className="photo-upload-input"
            />
            {payload.avatarUrl ? (
              <img src={payload.avatarUrl} alt="Profile preview" className="photo-preview" />
            ) : (
              <span className="photo-placeholder">{uploading ? "Uploading..." : "Upload photo"}</span>
            )}
          </label>
          <p className="photo-helper">This photo will be saved to your guest profile.</p>
        </div>
      </div>

      <div className="input-row">
        <div className="input-group">
          <label>City</label>
          <input
            type="text"
            placeholder="e.g. Delhi"
            value={formData.city || profile?.city || ""}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            className="auth-input"
            required
          />
        </div>
        <div className="input-group">
          <label>State</label>
          <input
            type="text"
            placeholder="e.g. Maharashtra"
            value={formData.state || profile?.state || ""}
            onChange={(e) => setFormData({ ...formData, state: e.target.value })}
            className="auth-input"
            required
          />
        </div>
      </div>

      <div className="input-row">
        <div className="input-group">
          <label>Date of Birth</label>
          <input
            type="date"
            value={formData.dob || profile?.date_of_birth || ""}
            onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
            className="auth-input"
            required
          />
        </div>
        <div className="input-group">
          <label>Gender</label>
          <select
            value={formData.gender || profile?.gender || ""}
            onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
            className="auth-input"
            required
          >
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}

      <button type="submit" disabled={loading || uploading} className="submit-btn">
        {loading ? "Saving..." : "Start Booking"}
      </button>

      <style jsx>{`
        .input-group {
          margin-bottom: 1.5rem;
          text-align: left;
        }

        label {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          margin-bottom: 0.4rem;
          color: #333;
        }

        .input-row {
          display: flex;
          gap: 1rem;
        }

        .input-row .input-group {
          flex: 1;
        }

        .photo-upload-row {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .photo-upload-trigger {
          width: 96px;
          height: 96px;
          border-radius: 50%;
          border: 1px dashed #cbd5e1;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          cursor: pointer;
          background: #f8fafc;
          flex-shrink: 0;
        }

        .photo-upload-input {
          display: none;
        }

        .photo-preview {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .photo-placeholder {
          padding: 0 0.75rem;
          font-size: 0.8rem;
          font-weight: 600;
          color: #475569;
          text-align: center;
          line-height: 1.3;
        }

        .photo-helper,
        .field-helper {
          margin: 0.45rem 0 0;
          font-size: 0.82rem;
          color: #64748b;
          line-height: 1.4;
        }

        .auth-form h2 {
          font-size: 1.75rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          letter-spacing: -0.5px;
        }

        .auth-subtitle {
          color: #666;
          margin-bottom: 2rem;
          line-height: 1.4;
        }

        .auth-input {
          box-sizing: border-box;
          appearance: none;
          width: 100%;
          padding: 1rem 1.25rem;
          border-radius: 12px;
          border: 1px solid #ddd;
          font-size: 1rem;
          outline: none;
          transition: border-color 0.2s;
        }

        .auth-input:focus {
          border-color: #1a73e8;
        }

        .submit-btn {
          box-sizing: border-box;
          width: 100%;
          padding: 1.1rem;
          border-radius: 12px;
          background: #1a73e8;
          color: #fff;
          border: none;
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: transform 0.2s, background 0.2s;
        }

        .submit-btn:hover {
          background: #1557b0;
          transform: translateY(-2px);
        }

        .submit-btn:disabled {
          background: #999;
          transform: none;
        }

        .error-msg {
          color: #e53e3e;
          margin-bottom: 1.5rem;
          font-size: 0.9rem;
        }

        @media (max-width: 640px) {
          .input-row,
          .photo-upload-row {
            flex-direction: column;
            align-items: stretch;
          }

          .photo-upload-trigger {
            margin: 0 auto;
          }

          .photo-helper {
            text-align: center;
          }
        }
      `}</style>
    </form>
  );
}
