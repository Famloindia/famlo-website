"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import { uploadApplicationPhoto } from "@/lib/uploads";

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  state: string;

  bio: string;
  languages: string;
  interests: string;

  skills: string;
  activityTypes: string;
  availability: string;

  photoUrl: string;
};

const initialState: FormState = {
  fullName: "",
  email: "",
  phone: "",
  city: "",
  state: "",

  bio: "",
  languages: "English, Hindi",
  interests: "",

  skills: "",
  activityTypes: "",
  availability: "",

  photoUrl: ""
};

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function HommieOnboardingForm(): React.JSX.Element {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialState);

  const previewLanguages = useMemo(() => splitList(form.languages), [form.languages]);
  const previewInterests = useMemo(() => splitList(form.interests), [form.interests]);
  const previewSkills = useMemo(() => splitList(form.skills), [form.skills]);
  const previewActivityTypes = useMemo(() => splitList(form.activityTypes), [form.activityTypes]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function goNext(): void {
    setErrorMessage(null);

    if (step === 1) {
      if (!form.fullName.trim() || !form.email.trim() || !form.city.trim()) {
        setErrorMessage("Please complete full name, email, and city first.");
        return;
      }
    }

    if (step === 2) {
      if (!form.bio.trim() || previewLanguages.length === 0 || previewInterests.length === 0) {
        setErrorMessage("Please complete bio, languages, and interests before continuing.");
        return;
      }
    }

    setStep((current) => Math.min(current + 1, 3));
  }

  function goBack(): void {
    setErrorMessage(null);
    setStep((current) => Math.max(current - 1, 1));
  }

  async function handlePhotoUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;

    setUploadingPhoto(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const photoUrl = await uploadApplicationPhoto(
        supabase,
        "friend-applications",
        form.fullName || "hommie",
        file
      );

      update("photoUrl", photoUrl);
      setMessage("Profile photo uploaded successfully.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to upload profile photo.");
    } finally {
      setUploadingPhoto(false);
      event.target.value = "";
    }
  }

  async function submitApplication(): Promise<void> {
    setSubmitting(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/onboarding/hommie/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          city: form.city,
          state: form.state,
          bio: form.bio,
          interests: splitList(form.interests),
          languages: splitList(form.languages),
          skills: splitList(form.skills),
          activityTypes: splitList(form.activityTypes),
          availability: form.availability,
          photoUrl: form.photoUrl
        })
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        applicationId?: string;
      };

      if (!response.ok) {
        setErrorMessage(payload.error ?? "Unable to submit hommie application.");
        return;
      }

      setMessage("Hommie application submitted successfully.");

      startTransition(() => {
        router.push(`/partners/hommies/submitted?application=${payload.applicationId ?? ""}`);
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to submit hommie application.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dashboard-editor">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">Hommie onboarding</span>
          <h1>Tell Famlo how you help guests feel local</h1>
          <p>
            This onboarding currently submits into the shared <code>friend_applications</code> queue.
            That keeps the website aligned with the same approval path that later provisions the
            shared <code>hommie_profiles_v2</code> partner profile.
          </p>
        </div>

        <div className="dashboard-links">
          <span className="status">Step {step} of 3</span>
        </div>
      </div>

      {message ? <div className="auth-success">{message}</div> : null}
      {errorMessage ? <div className="auth-error">{errorMessage}</div> : null}

      {step === 1 ? (
        <div className="grid two-up dashboard-grid">
          <section className="panel detail-box">
            <h2>Identity</h2>

            <div className="dashboard-form-grid">
              <label>
                <span>Full name</span>
                <input
                  className="text-input"
                  onChange={(event) => update("fullName", event.target.value)}
                  placeholder="Your full name"
                  value={form.fullName}
                />
              </label>

              <label>
                <span>Email</span>
                <input
                  className="text-input"
                  onChange={(event) => update("email", event.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  value={form.email}
                />
              </label>

              <label>
                <span>Phone / WhatsApp</span>
                <input
                  className="text-input"
                  onChange={(event) => update("phone", event.target.value)}
                  placeholder="+91..."
                  value={form.phone}
                />
              </label>

              <label>
                <span>City</span>
                <input
                  className="text-input"
                  onChange={(event) => update("city", event.target.value)}
                  placeholder="Your city"
                  value={form.city}
                />
              </label>

              <label>
                <span>State</span>
                <input
                  className="text-input"
                  onChange={(event) => update("state", event.target.value)}
                  placeholder="Your state"
                  value={form.state}
                />
              </label>

              <label className="full-span">
                <span>Availability</span>
                <input
                  className="text-input"
                  onChange={(event) => update("availability", event.target.value)}
                  placeholder="Weekends, evenings, flexible, etc."
                  value={form.availability}
                />
              </label>
            </div>
          </section>

          <section className="panel detail-box">
            <h2>Why this matters later</h2>
            <ul>
              <li>Name, email, and phone help connect later partner identity.</li>
              <li>City and state are needed for discoverability and future public listing context.</li>
              <li>Availability helps later hommie profile usefulness and booking readiness.</li>
            </ul>
          </section>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid two-up dashboard-grid">
          <section className="panel detail-box">
            <h2>Profile and local strengths</h2>

            <div className="dashboard-form-grid">
              <label className="full-span">
                <span>Bio</span>
                <textarea
                  className="text-area"
                  onChange={(event) => update("bio", event.target.value)}
                  placeholder="Tell Famlo how you help guests feel local and supported."
                  value={form.bio}
                />
              </label>

              <label className="full-span">
                <span>Languages</span>
                <input
                  className="text-input"
                  onChange={(event) => update("languages", event.target.value)}
                  placeholder="English, Hindi"
                  value={form.languages}
                />
              </label>

              <label className="full-span">
                <span>Interests / city strengths</span>
                <input
                  className="text-input"
                  onChange={(event) => update("interests", event.target.value)}
                  placeholder="Food walks, college areas, local culture"
                  value={form.interests}
                />
              </label>

              <label className="full-span">
                <span>Skills</span>
                <input
                  className="text-input"
                  onChange={(event) => update("skills", event.target.value)}
                  placeholder="Travel planning, local navigation, student support"
                  value={form.skills}
                />
              </label>

              <label className="full-span">
                <span>Activities / services</span>
                <textarea
                  className="text-area"
                  onChange={(event) => update("activityTypes", event.target.value)}
                  placeholder="Pickup help, city orientation, café hopping, local guidance"
                  value={form.activityTypes}
                />
              </label>
            </div>
          </section>

          <section className="panel detail-box">
            <h2>Preview</h2>
            <ul>
              <li>Languages: {previewLanguages.join(", ") || "Pending"}</li>
              <li>Interests: {previewInterests.join(", ") || "Pending"}</li>
              <li>Skills: {previewSkills.join(", ") || "Pending"}</li>
              <li>Activities: {previewActivityTypes.join(", ") || "Pending"}</li>
            </ul>
          </section>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="grid two-up dashboard-grid">
          <section className="panel detail-box">
            <h2>Photo and final submit</h2>

            <div className="dashboard-form-grid">
              <label className="full-span">
                <span>Profile photo URL</span>
                <input
                  className="text-input"
                  onChange={(event) => update("photoUrl", event.target.value)}
                  placeholder="Paste uploaded image URL if you already have one"
                  value={form.photoUrl}
                />
              </label>

              <label className="full-span">
                <span>Upload profile photo</span>
                <input
                  accept="image/*"
                  className="text-input"
                  onChange={(event) => void handlePhotoUpload(event)}
                  type="file"
                />
              </label>
            </div>
          </section>

          <section className="panel detail-box">
            <h2>Submit summary</h2>
            <ul>
              <li>Name: {form.fullName || "Pending"}</li>
              <li>Email: {form.email || "Pending"}</li>
              <li>Location: {[form.city, form.state].filter(Boolean).join(", ") || "Pending"}</li>
              <li>Bio: {form.bio ? "Added" : "Pending"}</li>
              <li>Languages: {previewLanguages.length > 0 ? previewLanguages.join(", ") : "Pending"}</li>
              <li>Interests: {previewInterests.length > 0 ? previewInterests.join(", ") : "Pending"}</li>
              <li>Photo: {form.photoUrl ? "Added" : "Optional for now"}</li>
            </ul>

            <p>
              {uploadingPhoto
                ? "Uploading profile photo..."
                : "This submits into the current Hommie application pipeline and keeps later publish open for users and hommie_profiles_v2."}
            </p>
          </section>
        </div>
      ) : null}

      <div className="dashboard-links">
        {step > 1 ? (
          <button className="button-like secondary" onClick={goBack} type="button">
            Back
          </button>
        ) : null}

        {step < 3 ? (
          <button className="button-like" onClick={goNext} type="button">
            Continue
          </button>
        ) : (
          <button
            className="button-like"
            disabled={submitting || uploadingPhoto}
            onClick={() => void submitApplication()}
            type="button"
          >
            {submitting ? "Submitting..." : "Submit hommie application"}
          </button>
        )}
      </div>
    </div>
  );
}
