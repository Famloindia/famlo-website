// components/partners/HomeOnboardingForm.tsx

"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import { uploadApplicationPhotos } from "@/lib/uploads";

import { HomeIdentityStep } from "@/components/partners/homes/HomeIdentityStep";
import { HomeListingDetailsStep } from "@/components/partners/homes/HomeListingDetailsStep";
import { HomeOnboardingProgress } from "@/components/partners/homes/HomeOnboardingProgress";
import { HomePhotosTrustStep } from "@/components/partners/homes/HomePhotosTrustStep";
import { HomePropertyBasicsStep } from "@/components/partners/homes/HomePropertyBasicsStep";
import { HomeReviewPublishStep } from "@/components/partners/homes/HomeReviewPublishStep";

export type HomeOnboardingFlowState = {
  fullName: string;
  email: string;
  mobileNumber: string;
  state: string;
  cityName: string;
  villageName: string;
  cityNeighbourhood: string;

  familyComposition: string;
  hostProfession: string;

  propertyName: string;
  propertyAddress: string;
  roomType: string;
  maxGuests: string;
  googleMapsLink: string;
  latitude: string;
  longitude: string;

  hostBio: string;
  languages: string;
  culturalActivity: string;
  amenities: string;
  includedItems: string;
  customRules: string;
  bathroomType: string;

  baseNightlyRate: string;
  morningRate: string;
  afternoonRate: string;
  eveningRate: string;

  photos: string;

  smokingAllowed: boolean;
  alcoholAllowed: boolean;
  petsAllowed: boolean;

  complianceAcknowledgement: boolean;
  complianceNotes: string;
  aadhaarNumber: string;
  panNumber: string;

  accountHolderName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifscCode: string;
  bankName: string;
};

const initialState: HomeOnboardingFlowState = {
  fullName: "",
  email: "",
  mobileNumber: "",
  state: "",
  cityName: "",
  villageName: "",
  cityNeighbourhood: "",

  familyComposition: "Joint family",
  hostProfession: "",

  propertyName: "",
  propertyAddress: "",
  roomType: "Private room",
  maxGuests: "2",
  googleMapsLink: "",
  latitude: "",
  longitude: "",

  hostBio: "",
  languages: "English, Hindi",
  culturalActivity: "",
  amenities: "",
  includedItems: "",
  customRules: "",
  bathroomType: "Private Attached",

  baseNightlyRate: "",
  morningRate: "",
  afternoonRate: "",
  eveningRate: "",

  photos: "",

  smokingAllowed: false,
  alcoholAllowed: false,
  petsAllowed: false,

  complianceAcknowledgement: false,
  complianceNotes: "",
  aadhaarNumber: "",
  panNumber: "",

  accountHolderName: "",
  accountNumber: "",
  confirmAccountNumber: "",
  ifscCode: "",
  bankName: ""
};

type SubmitResponse = {
  error?: string;
  draftId?: string;
  mode?: "instant_publish" | "review_required" | "missing_details";
  familyId?: string | null;
  applicationId?: string | null;
  missingFields?: string[];
};

const STEP_TITLES = [
  "Identity",
  "Property basics",
  "Listing details",
  "Photos and trust",
  "Review and publish"
] as const;

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumberOrNull(value: string): number | null {
  const next = value.trim();
  if (!next) return null;
  const parsed = Number(next);
  return Number.isFinite(parsed) ? parsed : null;
}

export function HomeOnboardingForm(): React.JSX.Element {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [draftId, setDraftId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [flow, setFlow] = useState<HomeOnboardingFlowState>(initialState);

  const photoList = useMemo(() => splitList(flow.photos), [flow.photos]);

  function update<K extends keyof HomeOnboardingFlowState>(
    key: K,
    value: HomeOnboardingFlowState[K]
  ): void {
    setFlow((current) => ({ ...current, [key]: value }));
  }

  function setPhotos(nextPhotos: string[]): void {
    update("photos", nextPhotos.join(", "));
  }

  function buildDraftPayloadPatch(): Record<string, unknown> {
    return {
      fullName: flow.fullName.trim(),
      email: flow.email.trim(),
      mobileNumber: flow.mobileNumber.trim(),
      state: flow.state.trim(),
      cityName: flow.cityName.trim(),
      villageName: flow.villageName.trim(),
      cityNeighbourhood: flow.cityNeighbourhood.trim(),

      familyComposition: flow.familyComposition.trim(),
      hostProfession: flow.hostProfession.trim(),

      propertyName: flow.propertyName.trim(),
      propertyAddress: flow.propertyAddress.trim(),
      roomType: flow.roomType.trim(),
      maxGuests: toNumberOrNull(flow.maxGuests),
      googleMapsLink: flow.googleMapsLink.trim(),
      latitude: flow.latitude.trim(),
      longitude: flow.longitude.trim(),

      hostBio: flow.hostBio.trim(),
      languages: splitList(flow.languages),
      culturalActivity: flow.culturalActivity.trim(),
      amenities: splitList(flow.amenities),
      includedItems: splitList(flow.includedItems),
      customRules: splitList(flow.customRules),
      bathroomType: flow.bathroomType.trim(),

      baseNightlyRate: toNumberOrNull(flow.baseNightlyRate),
      morningRate: toNumberOrNull(flow.morningRate),
      afternoonRate: toNumberOrNull(flow.afternoonRate),
      eveningRate: toNumberOrNull(flow.eveningRate),

      photos: photoList,

      smokingAllowed: flow.smokingAllowed,
      alcoholAllowed: flow.alcoholAllowed,
      petsAllowed: flow.petsAllowed,

      complianceAcknowledgement: flow.complianceAcknowledgement,
      complianceNotes: flow.complianceNotes.trim()
    };
  }

  function buildCompliancePatch(): Record<string, unknown> {
    return {
      complianceAcknowledgement: flow.complianceAcknowledgement,
      complianceNotes: flow.complianceNotes.trim(),
      aadhaarNumber: flow.aadhaarNumber.trim(),
      panNumber: flow.panNumber.trim(),
      accountHolderName: flow.accountHolderName.trim(),
      accountNumber: flow.accountNumber.trim(),
      ifscCode: flow.ifscCode.trim(),
      bankName: flow.bankName.trim()
    };
  }

  async function persistDraftForPhotoUpload(): Promise<string | null> {
    const existingDraftId = draftId ?? (await saveDraft(step));
    if (!existingDraftId) {
      setErrorMessage("Please save the Home draft before uploading photos.");
      return null;
    }
    return existingDraftId;
  }

  async function handlePhotoUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    setUploadingPhotos(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const savedDraftId = await persistDraftForPhotoUpload();
      if (!savedDraftId) {
        return;
      }

      const supabase = createBrowserSupabaseClient();
      const remainingSlots = Math.max(0, 5 - photoList.length);
      const nextFiles = files.slice(0, remainingSlots);

      if (nextFiles.length === 0) {
        setErrorMessage("You already have 5 Home photos.");
        return;
      }

      const uploaded = await uploadApplicationPhotos(
        supabase,
        "family-applications",
        savedDraftId,
        nextFiles
      );

      const nextPhotoList = [...photoList, ...uploaded].slice(0, 5);
      setPhotos(nextPhotoList);

      await fetch("/api/onboarding/home/save-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: savedDraftId,
          step,
          payloadPatch: {
            ...buildDraftPayloadPatch(),
            photos: nextPhotoList
          },
          compliancePatch: buildCompliancePatch()
        })
      });

      setMessage("Home photos uploaded and linked to your onboarding draft.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to upload Home photos.");
    } finally {
      setUploadingPhotos(false);
      event.target.value = "";
    }
  }

  async function saveDraft(nextStep?: number): Promise<string | null> {
    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/onboarding/home/save-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId,
          step: nextStep ?? step,
          payloadPatch: buildDraftPayloadPatch(),
          compliancePatch: buildCompliancePatch()
        })
      });

      const payload = (await response.json()) as { error?: string; draftId?: string };

      if (!response.ok) {
        setErrorMessage(payload.error ?? "Unable to save Home draft.");
        return null;
      }

      if (payload.draftId) {
        setDraftId(payload.draftId);
      }

      setMessage("Home draft saved.");
      return payload.draftId ?? draftId;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save Home draft.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  function validateCurrentStep(): boolean {
    setErrorMessage(null);

    if (step === 1) {
      if (!flow.fullName.trim() || !flow.email.trim() || !flow.mobileNumber.trim()) {
        setErrorMessage("Please complete full name, email, and phone first.");
        return false;
      }
      if (!flow.cityName.trim() || !flow.state.trim()) {
        setErrorMessage("Please complete city and state.");
        return false;
      }
    }

    if (step === 2) {
      if (!flow.propertyName.trim() || !flow.propertyAddress.trim()) {
        setErrorMessage("Please complete Home name and address.");
        return false;
      }
      if (!flow.roomType.trim() || !flow.maxGuests.trim()) {
        setErrorMessage("Please complete room type and max guests.");
        return false;
      }
    }

    if (step === 3) {
      if (!flow.hostBio.trim()) {
        setErrorMessage("Please add a host bio.");
        return false;
      }
      if (
        !flow.baseNightlyRate.trim() &&
        !flow.morningRate.trim() &&
        !flow.afternoonRate.trim() &&
        !flow.eveningRate.trim()
      ) {
        setErrorMessage("Please add at least one Home price.");
        return false;
      }
    }

    if (step === 4) {
      if (photoList.length === 0) {
        setErrorMessage("Please add at least one Home photo.");
        return false;
      }
    }

    if (step === 5) {
      if (flow.accountNumber.trim() !== flow.confirmAccountNumber.trim()) {
        setErrorMessage("Bank account numbers do not match.");
        return false;
      }
      if (!flow.accountHolderName.trim() || !flow.ifscCode.trim()) {
        setErrorMessage("Please complete payout details.");
        return false;
      }
    }

    return true;
  }

  async function goNext(): Promise<void> {
    if (!validateCurrentStep()) return;

    const next = Math.min(step + 1, 5);
    const savedDraftId = await saveDraft(next);

    if (!savedDraftId && !draftId) {
      return;
    }

    setStep(next);
  }

  function goBack(): void {
    setErrorMessage(null);
    setStep((current) => Math.max(1, current - 1));
  }

  async function submitHome(): Promise<void> {
    if (!validateCurrentStep()) return;

    setSubmitting(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const currentDraftId = (await saveDraft(5)) ?? draftId;

      if (!currentDraftId) {
        setErrorMessage("Draft could not be created before Home submission.");
        return;
      }

      const response = await fetch("/api/onboarding/home/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: currentDraftId })
      });

      const payload = (await response.json()) as SubmitResponse;

      if (!response.ok) {
        setErrorMessage(payload.error ?? "Unable to submit Home onboarding.");
        return;
      }

      const nextMode =
        payload.mode === "instant_publish"
          ? "instant_publish"
          : payload.mode === "missing_details"
            ? "missing_details"
            : payload.missingFields && payload.missingFields.length > 0
              ? "missing_details"
              : "review_required";

      const search = new URLSearchParams();
      search.set("draft", payload.draftId ?? currentDraftId);
      search.set("mode", nextMode);

      if (payload.familyId) {
        search.set("family", payload.familyId);
      }

      if (payload.missingFields && payload.missingFields.length > 0) {
        search.set("missing", payload.missingFields.join(","));
      }

      startTransition(() => {
        router.push(`/partners/home/submitted?${search.toString()}`);
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to submit Home onboarding.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dashboard-editor">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">Homes onboarding</span>
          <h1>Become a Home host on Famlo</h1>
          <p>
            Upload Home photos during onboarding, keep them attached to your draft, and let Famlo sync them
            into live Home listing photos after publish.
          </p>
        </div>

        <div className="dashboard-links">
          <span className="status">
            Step {step} of 5 — {STEP_TITLES[step - 1]}
          </span>
          <button
            className="button-like secondary"
            disabled={saving}
            onClick={() => void saveDraft()}
            type="button"
          >
            {saving ? "Saving..." : "Save draft"}
          </button>
        </div>
      </div>

      <HomeOnboardingProgress currentStep={step} />

      {message ? <div className="auth-success">{message}</div> : null}
      {errorMessage ? <div className="auth-error">{errorMessage}</div> : null}

      {step === 1 ? <HomeIdentityStep flow={flow} update={update} /> : null}
      {step === 2 ? <HomePropertyBasicsStep flow={flow} update={update} /> : null}
      {step === 3 ? <HomeListingDetailsStep flow={flow} update={update} /> : null}
      {step === 4 ? (
        <HomePhotosTrustStep
          flow={flow}
          onUpload={handlePhotoUpload}
          photoList={photoList}
          update={update}
          onPhotosChange={() => {}} 
          uploadingPhotos={uploadingPhotos}
        />
      ) : null}
      {step === 5 ? <HomeReviewPublishStep flow={flow} photoList={photoList} /> : null}

      <div className="auth-links" style={{ marginTop: "24px" }}>
        {step > 1 ? (
          <button className="button-like secondary" disabled={saving || submitting || uploadingPhotos} onClick={goBack} type="button">
            Back
          </button>
        ) : null}

        {step < 5 ? (
          <button className="button-like" disabled={saving || submitting || uploadingPhotos} onClick={() => void goNext()} type="button">
            Next: {STEP_TITLES[step]}
          </button>
        ) : (
          <button className="button-like" disabled={saving || submitting || uploadingPhotos} onClick={() => void submitHome()} type="button">
            {submitting ? "Submitting..." : "Submit application"}
          </button>
        )}
      </div>
    </div>
  );
}