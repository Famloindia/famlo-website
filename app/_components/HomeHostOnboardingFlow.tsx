"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type FlowState = {
  fullName: string;
  email: string;
  mobileNumber: string;
  cityNeighbourhood: string;
  state: string;
  cityName: string;
  villageName: string;
  aadhaarNumber: string;
  panNumber: string;
  familyComposition: string;
  hostBio: string;
  languages: string[];
  customLanguage: string;
  culturalActivity: string;
  hostProfession: string;
  doorLockConfirmed: boolean;
  bathroomType: string;
  commonAreas: string[];
  amenities: string[];
  propertyName: string;
  propertyAddress: string;
  googleMapsLink: string;
  latitude: string;
  longitude: string;
  photos: string[];
  baseNightlyRate: string;
  morningEnabled: boolean;
  morningRate: string;
  afternoonEnabled: boolean;
  afternoonRate: string;
  eveningEnabled: boolean;
  eveningRate: string;
  smokingAllowed: boolean;
  alcoholAllowed: boolean;
  petsAllowed: boolean;
  quietHoursFrom: string;
  quietHoursTo: string;
  customRules: string;
  accountHolderName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifscCode: string;
  bankName: string;
  maxGuests: string;
};

const initialState: FlowState = {
  fullName: "",
  email: "",
  mobileNumber: "",
  cityNeighbourhood: "",
  state: "",
  cityName: "",
  villageName: "",
  aadhaarNumber: "",
  panNumber: "",
  familyComposition: "Joint family",
  hostBio: "",
  languages: [],
  customLanguage: "",
  culturalActivity: "",
  hostProfession: "",
  doorLockConfirmed: true,
  bathroomType: "Private Attached",
  commonAreas: [],
  amenities: [],
  propertyName: "",
  propertyAddress: "",
  googleMapsLink: "",
  latitude: "",
  longitude: "",
  photos: ["", "", "", "", ""],
  baseNightlyRate: "",
  morningEnabled: true,
  morningRate: "",
  afternoonEnabled: true,
  afternoonRate: "",
  eveningEnabled: true,
  eveningRate: "",
  smokingAllowed: false,
  alcoholAllowed: false,
  petsAllowed: false,
  quietHoursFrom: "22:00",
  quietHoursTo: "06:00",
  customRules: "",
  accountHolderName: "",
  accountNumber: "",
  confirmAccountNumber: "",
  ifscCode: "",
  bankName: "",
  maxGuests: "2"
};

const languageOptions = [
  "English",
  "Hindi",
  "Assamese",
  "Bengali",
  "Bodo",
  "Dogri",
  "Gujarati",
  "Kannada",
  "Kashmiri",
  "Konkani",
  "Maithili",
  "Malayalam",
  "Manipuri",
  "Marathi",
  "Marwari",
  "Nepali",
  "Odia",
  "Punjabi",
  "Rajasthani",
  "Sanskrit",
  "Santali",
  "Sindhi",
  "Tamil",
  "Telugu",
  "Urdu"
];
const commonAreaOptions = ["Terrace", "Kitchen", "Garden", "Living Room"];
const amenityOptions = [
  "Kitchen Access",
  "Wi-Fi",
  "AC",
  "Parking",
  "First Aid Kit",
  "Geyser",
  "Washing Machine"
];

export function HomeHostOnboardingFlow(): JSX.Element {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [flow, setFlow] = useState<FlowState>(initialState);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [otpStatus, setOtpStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ifscStatus, setIfscStatus] = useState<string | null>(null);
  const [stateSuggestions, setStateSuggestions] = useState<string[]>([]);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [villageSuggestions, setVillageSuggestions] = useState<string[]>([]);

  const selectedLanguages = useMemo(() => {
    const custom = flow.customLanguage.trim();
    return custom ? [...flow.languages, custom] : flow.languages;
  }, [flow.customLanguage, flow.languages]);

  const monthlyProjection = useMemo(() => {
    const nightly = Number(flow.baseNightlyRate || 0);
    return nightly > 0 ? nightly * 10 : 0;
  }, [flow.baseNightlyRate]);

  useEffect(() => {
    if (flow.ifscCode.trim().length < 11) {
      return;
    }

    const controller = new AbortController();
    setIfscStatus("Checking IFSC...");

    fetch(`/api/ifsc?code=${encodeURIComponent(flow.ifscCode.trim())}`, {
      signal: controller.signal
    })
      .then(async (response) => {
        const payload = (await response.json()) as { bank?: string; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to verify IFSC.");
        }
        setFlow((current) => ({
          ...current,
          bankName: payload.bank ?? ""
        }));
        setIfscStatus(payload.bank ? `Bank detected: ${payload.bank}` : "IFSC verified.");
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setIfscStatus(error.message);
        }
      });

    return () => controller.abort();
  }, [flow.ifscCode]);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/locations/india?type=state&q=${encodeURIComponent(flow.state)}`, {
      signal: controller.signal
    })
      .then((response) => response.json())
      .then((payload: { suggestions?: string[] }) =>
        setStateSuggestions(payload.suggestions ?? [])
      )
      .catch(() => undefined);

    return () => controller.abort();
  }, [flow.state]);

  useEffect(() => {
    if (!flow.state.trim()) {
      setCitySuggestions([]);
      return;
    }

    const controller = new AbortController();

    fetch(
      `/api/locations/india?type=city&state=${encodeURIComponent(flow.state)}&q=${encodeURIComponent(flow.cityName)}`,
      { signal: controller.signal }
    )
      .then((response) => response.json())
      .then((payload: { suggestions?: string[] }) =>
        setCitySuggestions(payload.suggestions ?? [])
      )
      .catch(() => undefined);

    return () => controller.abort();
  }, [flow.cityName, flow.state]);

  useEffect(() => {
    if (!flow.state.trim() || !flow.cityName.trim()) {
      setVillageSuggestions([]);
      return;
    }

    const controller = new AbortController();

    fetch(
      `/api/locations/india?type=village&state=${encodeURIComponent(flow.state)}&city=${encodeURIComponent(flow.cityName)}&q=${encodeURIComponent(flow.villageName)}`,
      { signal: controller.signal }
    )
      .then((response) => response.json())
      .then((payload: { suggestions?: string[] }) =>
        setVillageSuggestions(payload.suggestions ?? [])
      )
      .catch(() => undefined);

    return () => controller.abort();
  }, [flow.cityName, flow.state, flow.villageName]);

  function update<K extends keyof FlowState>(key: K, value: FlowState[K]): void {
    setFlow((current) => ({
      ...current,
      [key]: value
    }));
  }

  function toggleArrayValue(key: "languages" | "commonAreas" | "amenities", value: string): void {
    setFlow((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value]
    }));
  }

  async function saveDraft(nextStep?: number): Promise<void> {
    if (!draftId) {
      return;
    }

    setSaving(true);
    const payloadPatch = {
      ...flow,
      languages: selectedLanguages,
      step
    };

    await fetch("/api/onboarding/home/save-draft", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        draftId,
        step: nextStep ?? step,
        payloadPatch
      })
    });
    setSaving(false);
  }

  async function sendOtp(): Promise<void> {
    if (
      !flow.fullName.trim() ||
      !flow.email.trim() ||
      !flow.mobileNumber.trim() ||
      !flow.state.trim() ||
      !flow.cityName.trim()
    ) {
      setOtpStatus("Please add your name, email, mobile number, state, and city before requesting OTP.");
      return;
    }

    setOtpStatus("Sending OTP...");
    const response = await fetch("/api/onboarding/home/send-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fullName: flow.fullName,
        email: flow.email,
        mobileNumber: flow.mobileNumber,
        cityNeighbourhood: flow.cityName,
        state: flow.state,
        cityName: flow.cityName,
        villageName: flow.villageName
      })
    });

    const payload = (await response.json()) as {
      draftId?: string;
      error?: string;
      devOtp?: string;
      provider?: string | null;
    };

    if (!response.ok) {
      setOtpStatus(payload.error ?? "Unable to send OTP.");
      return;
    }

    setDraftId(payload.draftId ?? null);
    setDevOtp(payload.devOtp ?? null);
    setOtpSent(true);
    setOtpStatus(
      payload.provider === "whatsapp-cloud"
        ? "OTP sent on WhatsApp. Verify it to continue."
        : payload.provider === "msg91"
          ? "OTP sent by SMS. Verify it to continue."
          : "OTP ready in dev mode. Verify it to continue."
    );
  }

  async function verifyOtp(): Promise<void> {
    if (!draftId) {
      return;
    }

    setOtpStatus("Verifying OTP...");
    const response = await fetch("/api/onboarding/home/verify-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        draftId,
        otpCode
      })
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setOtpStatus(payload.error ?? "OTP verification failed.");
      return;
    }

    setOtpStatus("Verified. Your draft listing has been created.");
    setStep(2);
  }

  async function goNext(): Promise<void> {
    if (step === 2) {
      if (!flow.hostBio.trim()) {
        setOtpStatus("Please tell Famlo a little about your family before continuing.");
        return;
      }

      if (selectedLanguages.length === 0) {
        setOtpStatus("Please select at least one language your family speaks.");
        return;
      }

      if (!flow.culturalActivity.trim()) {
        setOtpStatus("Please add the cultural experience you will share with guests.");
        return;
      }
    }

    if (step === 3) {
      const uploadedPhotos = flow.photos.filter(Boolean).length;
      if (uploadedPhotos < 5) {
        setOtpStatus("Please upload all 5 required photos before continuing.");
        return;
      }

      if (!flow.propertyName.trim() || !flow.propertyAddress.trim()) {
        setOtpStatus("Please add your listing title and property address before continuing.");
        return;
      }

      const latitude = flow.latitude.trim();
      const longitude = flow.longitude.trim();
      if (!latitude || !longitude) {
        setOtpStatus("Please use current location or enter latitude and longitude to continue.");
        return;
      }

      if (!flow.googleMapsLink.trim()) {
        update(
          "googleMapsLink",
          `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}`
        );
      }
    }

    if (step === 3) {
      setOtpStatus("Saving your home details...");
    } else {
      setOtpStatus(null);
    }

    await saveDraft(step + 1);
    setStep((current) => Math.min(current + 1, 4));
  }

  function useCurrentLocation(): void {
    if (!navigator.geolocation) {
      setOtpStatus("Location access is not available in this browser.");
      return;
    }

    setOtpStatus("Getting your current location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude.toFixed(6);
        const longitude = position.coords.longitude.toFixed(6);
        setFlow((current) => ({
          ...current,
          latitude,
          longitude,
          googleMapsLink:
            current.googleMapsLink ||
            `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}`
        }));
        setOtpStatus("Location added. You can continue now.");
      },
      () => {
        setOtpStatus("We could not read your location. Please enter latitude and longitude manually.");
      }
    );
  }

  async function submitForReview(): Promise<void> {
    if (flow.accountNumber.trim() !== flow.confirmAccountNumber.trim()) {
      setOtpStatus("Bank account numbers do not match yet.");
      return;
    }

    if (!flow.accountHolderName.trim() || !flow.ifscCode.trim()) {
      setOtpStatus("Please complete the bank details before submitting.");
      return;
    }

    setOtpStatus("Submitting your home for review...");
    await saveDraft(4);
    if (!draftId) {
      return;
    }

    const response = await fetch("/api/onboarding/home/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ draftId })
    });

    const payload = (await response.json()) as { error?: string; draftId?: string };

    if (!response.ok) {
      setOtpStatus(payload.error ?? "Unable to submit your listing.");
      return;
    }

    startTransition(() => {
      router.push(
        `/app/partnerslogin/home/dashboard?draft=${payload.draftId ?? draftId}&section=compliance&welcome=1`
      );
    });
  }

  return (
    <section className="px-6 py-10 sm:py-14">
      <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-8">
          <div className="mb-8 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6a3d]">
              Step {step} of 4
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-[#ede3d3]">
              <div
                className="h-full rounded-full bg-[#1f2937] transition-all"
                style={{ width: `${(step / 4) * 100}%` }}
              />
            </div>
            <p className="text-sm text-[#52606d]">
              {step === 1
                ? "No documents needed yet — let's get to know you first."
                : step === 2
                  ? "Build emotional ownership by shaping your family story."
                  : step === 3
                    ? "Show the space and the details that make it trustworthy."
                    : "Set pricing, payouts, and the money flow."}
            </p>
          </div>

          {step === 1 ? (
            <div className="space-y-4">
              <input
                value={flow.fullName}
                onChange={(event) => update("fullName", event.target.value)}
                placeholder="Primary host name"
                className="w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
              />
              <input
                value={flow.email}
                onChange={(event) => update("email", event.target.value)}
                placeholder="Email address"
                type="email"
                className="w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
              />
              <input
                value={flow.mobileNumber}
                onChange={(event) => update("mobileNumber", event.target.value)}
                placeholder="Mobile number"
                className="w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
              />
              <input
                list="india-states"
                value={flow.state}
                onChange={(event) => update("state", event.target.value)}
                placeholder="State"
                className="w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
              />
              <datalist id="india-states">
                {stateSuggestions.map((entry) => (
                  <option key={entry} value={entry} />
                ))}
              </datalist>
              <input
                list="india-cities"
                value={flow.cityName}
                onChange={(event) => {
                  update("cityName", event.target.value);
                  update("cityNeighbourhood", event.target.value);
                }}
                placeholder="City"
                className="w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
              />
              <datalist id="india-cities">
                {citySuggestions.map((entry) => (
                  <option key={entry} value={entry} />
                ))}
              </datalist>
              <input
                list="india-villages"
                value={flow.villageName}
                onChange={(event) => update("villageName", event.target.value)}
                placeholder="Village or locality"
                className="w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
              />
              <datalist id="india-villages">
                {villageSuggestions.map((entry) => (
                  <option key={entry} value={entry} />
                ))}
              </datalist>
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  value={flow.aadhaarNumber}
                  onChange={(event) => update("aadhaarNumber", event.target.value)}
                  placeholder="Aadhaar number"
                  className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                />
                <input
                  value={flow.panNumber}
                  onChange={(event) => update("panNumber", event.target.value)}
                  placeholder="PAN number"
                  className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                />
              </div>
              {!otpSent ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => void sendOtp()}
                    className="inline-flex rounded-full bg-[#1f2937] px-5 py-3 text-sm font-semibold text-white"
                  >
                    Send OTP
                  </button>
                  <p className="text-xs text-[#52606d]">
                    Type to search state, city, and village suggestions. OTP goes to
                    WhatsApp first when WhatsApp Cloud is configured.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] p-4">
                  <input
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value)}
                    placeholder="Enter OTP"
                    className="w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                  />
                  {devOtp ? (
                    <p className="text-sm text-[#52606d]">Dev OTP: {devOtp}</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void verifyOtp()}
                    className="inline-flex rounded-full bg-[#1f2937] px-5 py-3 text-sm font-semibold text-white"
                  >
                    Verify OTP and create draft
                  </button>
                </div>
              )}
              {otpStatus ? <p className="text-sm text-[#52606d]">{otpStatus}</p> : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <select
                  value={flow.familyComposition}
                  onChange={(event) => update("familyComposition", event.target.value)}
                  className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                >
                  <option>Joint family</option>
                  <option>Nuclear family</option>
                  <option>Couple</option>
                  <option>Solo Host</option>
                  <option>Other</option>
                </select>
                <input
                  value={flow.hostProfession}
                  onChange={(event) => update("hostProfession", event.target.value)}
                  placeholder="Profession"
                  className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                />
              </div>
              <textarea
                value={flow.hostBio}
                onChange={(event) => update("hostBio", event.target.value.slice(0, 300))}
                placeholder="Host bio, hobbies, profession"
                className="min-h-[110px] w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={flow.languages.includes("English")}
                    onChange={() => toggleArrayValue("languages", "English")}
                  />
                  English
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={flow.languages.includes("Hindi")}
                    onChange={() => toggleArrayValue("languages", "Hindi")}
                  />
                  Hindi
                </label>
              </div>
              <div className="rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] p-4">
                <p className="text-sm font-semibold text-[#1f2937]">
                  More Indian languages
                </p>
                <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
                  {languageOptions
                    .filter((language) => language !== "English" && language !== "Hindi")
                    .map((language) => (
                      <label
                        key={language}
                        className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={flow.languages.includes(language)}
                          onChange={() => toggleArrayValue("languages", language)}
                        />
                        {language}
                      </label>
                    ))}
                </div>
              </div>
              <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-4">
                <label className="flex items-center gap-3 text-sm font-semibold text-[#1f2937]">
                  <input
                    type="checkbox"
                    checked={Boolean(flow.customLanguage.trim())}
                    onChange={(event) => {
                      if (!event.target.checked) {
                        update("customLanguage", "");
                      }
                    }}
                  />
                  Other language
                </label>
                <input
                  value={flow.customLanguage}
                  onChange={(event) => update("customLanguage", event.target.value)}
                  placeholder="Write any other language here"
                  className="mt-3 w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                />
              </div>
              <textarea
                value={flow.culturalActivity}
                onChange={(event) => update("culturalActivity", event.target.value)}
                placeholder="What cultural activity will you share? Example: Morning chai ritual on the rooftop"
                className="min-h-[120px] w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex rounded-full border border-[#1f2937] px-5 py-3 text-sm font-semibold text-[#1f2937]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void goNext()}
                  className="inline-flex rounded-full bg-[#1f2937] px-5 py-3 text-sm font-semibold text-white"
                >
                  Continue
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {["Living Room", "Guest Room", "Bathroom", "Family Photo", "Entrance"].map(
                  (label, index) => (
                    <label
                      key={label}
                      className="block rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] p-4"
                    >
                      <p className="mb-3 text-sm font-semibold text-[#1f2937]">{label}</p>
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) {
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () => {
                            setFlow((current) => {
                              const nextPhotos = [...current.photos];
                              nextPhotos[index] = String(reader.result ?? "");
                              return {
                                ...current,
                                photos: nextPhotos
                              };
                            });
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                  )
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm">
                  Solid door with lock
                  <select
                    value={flow.doorLockConfirmed ? "yes" : "no"}
                    onChange={(event) =>
                      update("doorLockConfirmed", event.target.value === "yes")
                    }
                    className="mt-2 w-full bg-transparent outline-none"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm">
                  Bathroom type
                  <select
                    value={flow.bathroomType}
                    onChange={(event) => update("bathroomType", event.target.value)}
                    className="mt-2 w-full bg-transparent outline-none"
                  >
                    <option>Private Attached</option>
                    <option>Shared</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {commonAreaOptions.map((area) => (
                  <label
                    key={area}
                    className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={flow.commonAreas.includes(area)}
                      onChange={() => toggleArrayValue("commonAreas", area)}
                    />
                    {area}
                  </label>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {amenityOptions.map((amenity) => (
                  <label
                    key={amenity}
                    className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={flow.amenities.includes(amenity)}
                      onChange={() => toggleArrayValue("amenities", amenity)}
                    />
                    {amenity}
                  </label>
                ))}
              </div>

              <input
                value={flow.propertyName}
                onChange={(event) => update("propertyName", event.target.value)}
                placeholder="Listing title"
                className="w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
              />
              <textarea
                value={flow.propertyAddress}
                onChange={(event) => update("propertyAddress", event.target.value)}
                placeholder="Property address"
                className="min-h-[90px] w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  value={flow.googleMapsLink}
                  onChange={(event) => update("googleMapsLink", event.target.value)}
                  placeholder="Google Maps pin link"
                  className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                />
                <input
                  value={flow.maxGuests}
                  onChange={(event) => update("maxGuests", event.target.value)}
                  placeholder="Max guests"
                  className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  value={flow.latitude}
                  onChange={(event) => update("latitude", event.target.value)}
                  placeholder="Latitude"
                  className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                />
                <input
                  value={flow.longitude}
                  onChange={(event) => update("longitude", event.target.value)}
                  placeholder="Longitude"
                  className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={useCurrentLocation}
                  className="inline-flex rounded-full border border-[#1f2937] px-5 py-3 text-sm font-semibold text-[#1f2937]"
                >
                  Use current location
                </button>
                <p className="text-sm text-[#52606d]">
                  We will auto-build the Google Maps link from latitude and longitude if needed.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex rounded-full border border-[#1f2937] px-5 py-3 text-sm font-semibold text-[#1f2937]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void goNext()}
                  className="inline-flex rounded-full bg-[#1f2937] px-5 py-3 text-sm font-semibold text-white"
                >
                  Continue
                </button>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  value={flow.baseNightlyRate}
                  onChange={(event) => update("baseNightlyRate", event.target.value)}
                  placeholder="Base nightly rate (Rs. 1000 recommended)"
                  className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                />
                <div className="rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] p-4">
                  <p className="text-sm font-semibold text-[#1f2937]">Estimated earnings</p>
                  <p className="mt-2 text-sm text-[#52606d]">
                    At Rs. {flow.baseNightlyRate || "1000"} per night, hosting 10 nights per
                    month equals approximately Rs. {monthlyProjection.toLocaleString("en-IN")}.
                  </p>
                </div>
              </div>

              {[
                ["morningEnabled", "Morning Rate (6 AM - 11 AM)", "morningRate"],
                ["afternoonEnabled", "Afternoon Rate (11 AM - 4 PM)", "afternoonRate"],
                ["eveningEnabled", "Evening Rate (4 PM - 9 PM)", "eveningRate"]
              ].map(([toggleKey, label, rateKey]) => (
                <div
                  key={label}
                  className="grid gap-4 rounded-[24px] border border-[#e5e7eb] bg-[#faf7f2] p-4 sm:grid-cols-[auto_1fr]"
                >
                  <label className="flex items-center gap-3 text-sm font-semibold text-[#1f2937]">
                    <input
                      type="checkbox"
                      checked={flow[toggleKey as keyof FlowState] as boolean}
                      onChange={(event) =>
                        update(toggleKey as keyof FlowState, event.target.checked as never)
                      }
                    />
                    {label}
                  </label>
                  <input
                    value={String(flow[rateKey as keyof FlowState] ?? "")}
                    onChange={(event) =>
                      update(rateKey as keyof FlowState, event.target.value as never)
                    }
                    placeholder={`${label} (Rs. 400 recommended)`}
                    className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                    disabled={!flow[toggleKey as keyof FlowState]}
                  />
                </div>
              ))}

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["smokingAllowed", "Smoking Allowed"],
                  ["alcoholAllowed", "Alcohol Allowed"],
                  ["petsAllowed", "Pets Allowed"]
                ].map(([key, label]) => (
                  <label
                    key={label}
                    className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={flow[key as keyof FlowState] as boolean}
                      onChange={(event) =>
                        update(key as keyof FlowState, event.target.checked as never)
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  value={flow.email}
                  onChange={(event) => update("email", event.target.value)}
                  placeholder="Email for login credentials"
                  type="email"
                  className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                />
                <input
                  value={flow.accountHolderName}
                  onChange={(event) => update("accountHolderName", event.target.value)}
                  placeholder="Account holder name"
                  className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm text-[#52606d]">
                  Quiet hours from
                  <select
                    value={flow.quietHoursFrom}
                    onChange={(event) => update("quietHoursFrom", event.target.value)}
                    className="mt-2 w-full bg-transparent outline-none"
                  >
                    {Array.from({ length: 24 }, (_, index) => {
                      const hour = String(index).padStart(2, "0");
                      return `${hour}:00`;
                    }).map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm text-[#52606d]">
                  Quiet hours to
                  <select
                    value={flow.quietHoursTo}
                    onChange={(event) => update("quietHoursTo", event.target.value)}
                    className="mt-2 w-full bg-transparent outline-none"
                  >
                    {Array.from({ length: 24 }, (_, index) => {
                      const hour = String(index).padStart(2, "0");
                      return `${hour}:00`;
                    }).map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <textarea
                value={flow.customRules}
                onChange={(event) => update("customRules", event.target.value)}
                placeholder="Custom house rules"
                className="min-h-[90px] w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  value={flow.accountNumber}
                  onChange={(event) => update("accountNumber", event.target.value)}
                  placeholder="Bank account number"
                  className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                />
                <input
                  value={flow.confirmAccountNumber}
                  onChange={(event) => update("confirmAccountNumber", event.target.value)}
                  placeholder="Confirm account number"
                  className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  value={flow.ifscCode}
                  onChange={(event) => update("ifscCode", event.target.value.toUpperCase())}
                  placeholder="IFSC code"
                  className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                />
                <input
                  value={flow.bankName}
                  onChange={(event) => update("bankName", event.target.value)}
                  placeholder="Bank name"
                  className="rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none"
                />
              </div>
              {ifscStatus ? <p className="text-sm text-[#52606d]">{ifscStatus}</p> : null}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="inline-flex rounded-full border border-[#1f2937] px-5 py-3 text-sm font-semibold text-[#1f2937]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void submitForReview()}
                  className="inline-flex rounded-full bg-[#1f2937] px-5 py-3 text-sm font-semibold text-white"
                >
                  Submit My Home for Review
                </button>
              </div>
            </div>
          ) : null}
          {saving ? <p className="mt-4 text-sm text-[#52606d]">Saving progress...</p> : null}
        </div>

        <aside className="space-y-6">
          <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6a3d]">
              Live Listing Preview
            </p>
            <div className="mt-5 overflow-hidden rounded-[28px] border border-[#ece5d8] bg-[#fffaf2]">
              <div className="h-44 bg-gradient-to-br from-[#d6c1a7] via-[#f4ede2] to-[#b7d3e4]">
                {flow.photos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={flow.photos[0]}
                    alt="Preview"
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="space-y-3 p-5">
                <p className="text-lg font-semibold text-[#1f2937]">
                  {flow.propertyName || "Your Famlo home"}
                </p>
                <p className="text-sm text-[#52606d]">
                  {flow.cityNeighbourhood || "Jodhpur"}, hosted by {flow.fullName || "your family"}
                </p>
                {flow.email ? (
                  <p className="text-xs uppercase tracking-[0.2em] text-[#8a6a3d]">
                    Credentials will go to {flow.email}
                  </p>
                ) : null}
                <p className="text-sm leading-6 text-[#52606d]">
                  {flow.culturalActivity || "Your cultural experience will appear here."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedLanguages.map((language) => (
                    <span
                      key={language}
                      className="rounded-full border border-[#d7ccbb] bg-white px-3 py-1 text-xs text-[#52606d]"
                    >
                      {language}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <p className="text-sm font-semibold text-[#1f2937]">Why this flow works</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-[#52606d]">
              <li>Draft is created as soon as OTP is verified.</li>
              <li>Creative steps come before legal friction.</li>
              <li>Pricing and payouts make the reward feel real.</li>
              <li>Compliance comes after the host is already invested.</li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
