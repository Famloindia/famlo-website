"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

import styles from "./onboarding.module.css";
import Step1Hook from "./homes/steps/Step1Hook";
import Step2Story from "./homes/steps/Step2Story";
import Step3Space from "./homes/steps/Step3Space";

function normalizeRoomDefaults() {
  return {
    id: crypto.randomUUID(),
    roomName: "",
    roomType: "Private room",
    maxGuests: "2",
    bedConfiguration: "",
    roomConfiguration: "",
    balcony: "",
    roomVibe: "",
    roomAmenities: [] as string[],
    roomPhotos: [] as string[],
    lat: "",
    lng: "",
    standardPrice: "",
    lowDemandPrice: "",
    highDemandPrice: "",
    smartPricingEnabled: false,
  };
}

export default function HomestayOnboardingFlow(): React.JSX.Element {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [flow, setFlow] = useState({
    fullName: "",
    hostName: "",
    email: "",
    hostPhoto: "",
    hostPhotoUploadMethod: "",
    isEmailVerified: false,
    isPhoneVerified: false,
    countryCode: "+91",
    mobileNumber: "",
    otpCode: "",
    city: "",
    state: "",
    streetAddress: "",
    areaName: "",
    country: "India",
    googleMapsLink: "",
    latitude: "",
    longitude: "",
    pincode: "",
    landmarks: [] as Array<{ name: string; distance: string }>,
    neighborhoodDesc: "",
    accessibilityDesc: "",
    idDocumentType: "",
    idDocumentPhotoUrl: "",
    idDocumentUploadMethod: "",
    idDocumentValidationStatus: "",
    idDocumentValidationMessage: "",
    idDocumentConfidenceScore: 0,
    idDocumentFraudFlags: [] as string[],
    idDocumentValidationReasons: [] as string[],
    idDocumentReviewStatus: "",
    liveSelfieUrl: "",
    journeyStory: "",
    specialExperience: "",
    localExperience: "",
    languagesSpoken: ["English", "Hindi"],
    houseType: "Joint family",
    interactionType: "Friendly and available",
    hobbies: [] as string[],
    customHobby: "",
    checkInTime: "",
    checkOutTime: "",
    includedHighlights: [] as string[],
    commonAreas: [] as string[],
    commonAreaDraft: "",
    nearbyPlaces: [{ id: crypto.randomUUID(), name: "", distance: "", unit: "km" }] as Array<{ id: string; name: string; distance: string; unit: string }>,
    houseRulesText: "",
    hostGalleryPhotos: [] as string[],
    rooms: [normalizeRoomDefaults()],
    propertyOwnershipProofUrl: "",
    nocDocumentUrl: "",
    panCardUrl: "",
    upiId: "",
    accountHolderName: "",
    accountNumber: "",
    confirmAccountNumber: "",
    ifscCode: "",
    bankName: "",
    hostAgreementAccepted: false,
    termsPrivacyAccepted: false,
    commissionAgreementAccepted: false,
    codeOfConductAccepted: false,
    cancellationPolicyAccepted: false,
    hostAgreementAcceptedAt: "",
  });

  const updateField = <K extends keyof typeof flow>(field: K, value: (typeof flow)[K]) => {
    setFlow((current) => ({ ...current, [field]: value }));
  };

  const handleStep1Complete = (id?: string | null) => {
    if (id) {
      setDraftId(id);
    }

    setFlow((current) => ({
      ...current,
      hostName: current.hostName || current.fullName,
    }));
  };

  const resolvedFlow = useMemo(() => {
    const rooms = Array.isArray(flow.rooms) && flow.rooms.length > 0 ? flow.rooms : [normalizeRoomDefaults()];
    const hostGalleryPhotos = Array.isArray(flow.hostGalleryPhotos) ? flow.hostGalleryPhotos : [];
    const nearbyPlaces = Array.isArray(flow.nearbyPlaces)
      ? flow.nearbyPlaces.map((place) => ({
          id: typeof (place as { id?: unknown }).id === "string" ? String((place as { id?: unknown }).id) : crypto.randomUUID(),
          name: String((place as { name?: unknown }).name ?? ""),
          distance: String((place as { distance?: unknown }).distance ?? ""),
          unit: String((place as { unit?: unknown }).unit ?? "km"),
        }))
      : [{ id: crypto.randomUUID(), name: "", distance: "", unit: "km" }];
    return {
      ...flow,
      hostName: flow.hostName || flow.fullName,
      hostGalleryPhotos,
      nearbyPlaces,
      rooms,
    };
  }, [flow]);

  const buildCompliancePatch = () => ({
    propertyOwnershipProofUrl: resolvedFlow.propertyOwnershipProofUrl,
    nocDocumentUrl: resolvedFlow.nocDocumentUrl,
    panCardUrl: resolvedFlow.panCardUrl,
    upiId: resolvedFlow.upiId,
    accountHolderName: resolvedFlow.accountHolderName,
    accountNumber: resolvedFlow.accountNumber,
    confirmAccountNumber: resolvedFlow.confirmAccountNumber,
    ifscCode: resolvedFlow.ifscCode,
    bankName: resolvedFlow.bankName,
    hostAgreementAccepted: resolvedFlow.hostAgreementAccepted,
    termsPrivacyAccepted: resolvedFlow.termsPrivacyAccepted,
    commissionAgreementAccepted: resolvedFlow.commissionAgreementAccepted,
    codeOfConductAccepted: resolvedFlow.codeOfConductAccepted,
    cancellationPolicyAccepted: resolvedFlow.cancellationPolicyAccepted,
    hostAgreementAcceptedAt: resolvedFlow.hostAgreementAcceptedAt,
  });

  const saveDraft = async (targetStep: number, idOverride?: string): Promise<string | null> => {
    const currentDraftId = idOverride || draftId;
    if (!currentDraftId && targetStep !== 2) return null;

    setSaving(true);
    try {
      const res = await fetch("/api/onboarding/home/save-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: currentDraftId,
          step: targetStep,
          payloadPatch: resolvedFlow,
          compliancePatch: buildCompliancePatch(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Draft save failed");
      }

      const data = await res.json();
      if (data.draftId && data.draftId !== draftId) {
        setDraftId(data.draftId);
      }

      return data.draftId || currentDraftId || null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draft save failed");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const submitApplication = async (draftIdToSubmit?: string | null) => {
    const finalDraftId = draftIdToSubmit || draftId;
    if (!finalDraftId) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding/home/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: finalDraftId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Submit failed");
      }

      router.push("/partners/home/submitted?mode=review_required");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed. Review your details and retry.");
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    const step1Complete =
      resolvedFlow.fullName &&
      resolvedFlow.mobileNumber &&
      resolvedFlow.email &&
      resolvedFlow.streetAddress &&
      resolvedFlow.areaName &&
      resolvedFlow.city &&
      resolvedFlow.state &&
      resolvedFlow.country &&
      resolvedFlow.isPhoneVerified &&
      resolvedFlow.isEmailVerified &&
      resolvedFlow.idDocumentType &&
      resolvedFlow.idDocumentPhotoUrl &&
      resolvedFlow.liveSelfieUrl &&
      draftId;

    if (step === 1) {
      if (!step1Complete) {
        setError("Complete verification, exact location, and ID capture before continuing.");
        return;
      }
      setError(null);
      setFlow((current) => ({ ...current, hostName: current.hostName || current.fullName }));
      const savedDraftId = await saveDraft(2);
      if (!savedDraftId) return;
      setStep(2);
      return;
    }

    if (step === 2) {
      const primaryRoom = resolvedFlow.rooms[0];
      if (!resolvedFlow.hostName) {
        setError("Please add your host name.");
        return;
      }
      if (!resolvedFlow.journeyStory || resolvedFlow.journeyStory.trim().length < 40) {
        setError("Please write a short story about your journey and home.");
        return;
      }
      if (!resolvedFlow.specialExperience || !resolvedFlow.localExperience) {
        setError("Please tell us what makes your place special and what local experience you can share.");
        return;
      }
      if (!resolvedFlow.languagesSpoken.length) {
        setError("Please choose at least one language.");
        return;
      }
      if (!primaryRoom.roomName || !primaryRoom.roomType || !primaryRoom.maxGuests) {
        setError("Please complete the primary room details.");
        return;
      }
      if ((primaryRoom.roomPhotos ?? []).length < 5) {
        setError("Please upload at least 5 room photos for the primary room.");
        return;
      }
      if (!resolvedFlow.includedHighlights.length) {
        setError("Please add at least one included item or guest benefit.");
        return;
      }
      const roomsHavePricing = resolvedFlow.rooms.every((room) => {
        const hasStandardPrice = Number(room.standardPrice) > 0;
        return hasStandardPrice || room.smartPricingEnabled;
      });
      if (!roomsHavePricing) {
        setError("Please add a standard price or enable smart pricing for every room.");
        return;
      }
      const savedDraftId = await saveDraft(3);
      if (!savedDraftId) return;
      setStep(3);
      return;
    }

    if (step === 3) {
      if (!resolvedFlow.upiId || !resolvedFlow.accountHolderName || !resolvedFlow.accountNumber || !resolvedFlow.confirmAccountNumber || !resolvedFlow.ifscCode) {
        setError("Please complete UPI and bank account details.");
        return;
      }
      if (resolvedFlow.accountNumber !== resolvedFlow.confirmAccountNumber) {
        setError("Your bank account numbers do not match.");
        return;
      }
      const agreementsAccepted =
        resolvedFlow.hostAgreementAccepted &&
        resolvedFlow.termsPrivacyAccepted &&
        resolvedFlow.commissionAgreementAccepted &&
        resolvedFlow.codeOfConductAccepted &&
        resolvedFlow.cancellationPolicyAccepted;

      if (!agreementsAccepted) {
        setError("Please accept all legal and policy checkboxes to finish.");
        return;
      }

      setFlow((current) => ({
        ...current,
        hostAgreementAcceptedAt: current.hostAgreementAcceptedAt || new Date().toISOString(),
      }));

      const persistedDraftId = await saveDraft(3);
      if (!persistedDraftId) return;
      await submitApplication(persistedDraftId);
    }
  };

  const handleBack = () => {
    setStep((current) => Math.max(1, current - 1));
  };

  return (
    <div className={styles.onboardingContainer}>
      <div className={styles.backgroundOrbs} aria-hidden="true" />

      <header className={styles.minimalHeader}>
        <div className={styles.topBarBadge}>
          Step {step} of 3
        </div>
      </header>

      <main className={styles.mainContent}>
        <section className={styles.stepContainer}>
          <div className={styles.stepCard}>
            {step === 1 && <Step1Hook data={resolvedFlow} update={updateField} onStepComplete={handleStep1Complete} />}
            {step === 2 && <Step2Story data={resolvedFlow} update={updateField} />}
            {step === 3 && <Step3Space data={resolvedFlow} update={updateField} />}

            {error ? <div className={styles.errorBanner}>{error}</div> : null}

            <footer className={styles.footerNav}>
              {step > 1 ? (
                <button type="button" className={styles.secondaryBtn} onClick={handleBack} disabled={saving}>
                  <ArrowLeft size={18} />
                  Back
                </button>
              ) : (
                <div />
              )}

              <button type="button" className={styles.primaryBtn} onClick={handleNext} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" size={18} /> : step === 3 ? "Submit for review" : "Continue"}
                {!saving && <ArrowRight size={18} />}
              </button>
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}
