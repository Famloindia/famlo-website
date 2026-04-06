"use client";

import {
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent
} from "react";

import { COMMON_LANGUAGE_OPTIONS, INDIAN_STATES, STATE_TO_CITIES } from "../../lib/india";
import { createBrowserSupabaseClient } from "../../lib/supabase";
import type { Database } from "../../lib/types";
import { uploadApplicationPhoto } from "../../lib/uploads";

const homeTypeOptions = [
  "Apartment",
  "Independent House",
  "Villa",
  "Townhouse",
  "Other"
] as const;

const culturalOfferingOptions = [
  "Home-cooked meals",
  "Local traditions",
  "Village walks",
  "Craft experiences",
  "Festival hosting",
  "Storytelling",
  "Farm visits",
  "Family activities"
] as const;

type FamilyApplicationInsert =
  Database["public"]["Tables"]["family_applications"]["Insert"];

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  whatsappNumber: string;
  propertyName: string;
  propertyAddress: string;
  village: string;
  state: string;
  houseType: string;
  aboutFamily: string;
  languages: string[];
  customLanguage: string;
  maxGuests: string;
  culturalOfferings: string[];
  photo: File | null;
}

interface SubmissionState {
  type: "success" | "error";
  message: string;
}

const initialFormState: FormState = {
  fullName: "",
  email: "",
  phone: "",
  whatsappNumber: "",
  propertyName: "",
  propertyAddress: "",
  village: "",
  state: "",
  houseType: "",
  aboutFamily: "",
  languages: [],
  customLanguage: "",
  maxGuests: "",
  culturalOfferings: [],
  photo: null
};

function resolveSelectedLanguages(state: FormState): string[] {
  const filteredLanguages = state.languages.filter((language) => language !== "Other");
  const customLanguage = state.customLanguage.trim();

  if (state.languages.includes("Other") && customLanguage.length > 0) {
    return [...filteredLanguages, customLanguage];
  }

  return filteredLanguages;
}

export function FamilyApplicationForm(): JSX.Element {
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionState, setSubmissionState] = useState<SubmissionState | null>(
    null
  );

  const cityOptions = useMemo(
    () => (formState.state ? STATE_TO_CITIES[formState.state] ?? [] : []),
    [formState.state]
  );

  function handleInputChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ): void {
    const { name, value } = event.target;

    setFormState((currentState) => {
      if (name === "state") {
        return {
          ...currentState,
          state: value,
          village: ""
        };
      }

      return {
        ...currentState,
        [name]: value
      };
    });
  }

  function handleOfferingToggle(offering: string): void {
    setFormState((currentState) => {
      const nextOfferings = currentState.culturalOfferings.includes(offering)
        ? currentState.culturalOfferings.filter((item) => item !== offering)
        : [...currentState.culturalOfferings, offering];

      return {
        ...currentState,
        culturalOfferings: nextOfferings
      };
    });
  }

  function handleLanguageToggle(language: string): void {
    setFormState((currentState) => {
      const nextLanguages = currentState.languages.includes(language)
        ? currentState.languages.filter((item) => item !== language)
        : [...currentState.languages, language];

      return {
        ...currentState,
        languages: nextLanguages,
        customLanguage:
          language === "Other" && currentState.languages.includes(language)
            ? ""
            : currentState.customLanguage
      };
    });
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextPhoto = event.target.files?.[0] ?? null;

    setFormState((currentState) => ({
      ...currentState,
      photo: nextPhoto
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmissionState(null);

    try {
      const finalLanguages = resolveSelectedLanguages(formState);

      if (finalLanguages.length === 0) {
        throw new Error("Please select at least one language.");
      }

      if (
        formState.languages.includes("Other") &&
        formState.customLanguage.trim().length === 0
      ) {
        throw new Error("Please write the language name when you choose Other.");
      }

      if (!formState.photo) {
        throw new Error("Please upload a family or home photo.");
      }

      const supabase = createBrowserSupabaseClient();
      const photoUrl = await uploadApplicationPhoto(
        supabase,
        "family-applications",
        formState.fullName,
        formState.photo
      );

      const payload: FamilyApplicationInsert = {
        full_name: formState.fullName.trim(),
        email: formState.email.trim(),
        phone: formState.phone.trim(),
        whatsapp_number:
          formState.whatsappNumber.trim().length > 0
            ? formState.whatsappNumber.trim()
            : null,
        property_name: formState.propertyName.trim(),
        property_address: formState.propertyAddress.trim(),
        village: formState.village.trim().length > 0 ? formState.village.trim() : null,
        state: formState.state.trim().length > 0 ? formState.state.trim() : null,
        house_type: formState.houseType,
        about_family:
          formState.aboutFamily.trim().length > 0
            ? formState.aboutFamily.trim()
            : null,
        languages: finalLanguages,
        max_guests:
          formState.maxGuests.trim().length > 0
            ? Number(formState.maxGuests)
            : null,
        cultural_offerings:
          formState.culturalOfferings.length > 0 ? formState.culturalOfferings : [],
        photo_url: photoUrl,
        google_maps_link: null,
        latitude: null,
        longitude: null,
        review_notes: null,
        status: "pending",
        reviewed_at: null
      };

      const { error } = await supabase.from("family_applications").insert(payload as never);

      if (error) {
        throw error;
      }

      setSubmissionState({
        type: "success",
        message:
          "Your family application has been submitted successfully. We'll review it and get back to you."
      });
      setFormState(initialFormState);
    } catch (error) {
      setSubmissionState({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong while submitting the application."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[32px] border border-[#D5E7F8] bg-white p-8 shadow-[0_24px_80px_rgba(26,110,187,0.1)] sm:p-10"
    >
      <div className="grid gap-6">
        <div className="grid gap-2">
          <label htmlFor="fullName" className="text-sm font-medium text-famloText">
            Full name
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            value={formState.fullName}
            onChange={handleInputChange}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-famloText outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
            placeholder="Your full name"
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="grid gap-2">
            <label htmlFor="email" className="text-sm font-medium text-famloText">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={formState.email}
              onChange={handleInputChange}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-famloText outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
              placeholder="you@example.com"
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="phone" className="text-sm font-medium text-famloText">
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              value={formState.phone}
              onChange={handleInputChange}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-famloText outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
              placeholder="+91 98765 43210"
            />
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="grid gap-2">
            <label
              htmlFor="whatsappNumber"
              className="text-sm font-medium text-famloText"
            >
              WhatsApp number
            </label>
            <input
              id="whatsappNumber"
              name="whatsappNumber"
              type="tel"
              value={formState.whatsappNumber}
              onChange={handleInputChange}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-famloText outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
              placeholder="+91 98765 43210"
            />
          </div>

          <div className="grid gap-2">
            <label
              htmlFor="maxGuests"
              className="text-sm font-medium text-famloText"
            >
              Max guests
            </label>
            <input
              id="maxGuests"
              name="maxGuests"
              type="number"
              min="1"
              value={formState.maxGuests}
              onChange={handleInputChange}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-famloText outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
              placeholder="2"
            />
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="grid gap-2">
            <label
              htmlFor="propertyName"
              className="text-sm font-medium text-famloText"
            >
              Property name
            </label>
            <input
              id="propertyName"
              name="propertyName"
              type="text"
              required
              value={formState.propertyName}
              onChange={handleInputChange}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-famloText outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
              placeholder="Name of your home or stay"
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="houseType" className="text-sm font-medium text-famloText">
              Home type
            </label>
            <select
              id="houseType"
              name="houseType"
              required
              value={formState.houseType}
              onChange={handleInputChange}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-famloText outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
            >
              <option value="">Select your home type</option>
              {homeTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="grid gap-2">
            <label htmlFor="state" className="text-sm font-medium text-famloText">
              State
            </label>
            <select
              id="state"
              name="state"
              required
              value={formState.state}
              onChange={handleInputChange}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-famloText outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
            >
              <option value="">Select state</option>
              {INDIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <label htmlFor="village" className="text-sm font-medium text-famloText">
              City / town / village
            </label>
            <select
              id="village"
              name="village"
              required
              value={formState.village}
              onChange={handleInputChange}
              disabled={!formState.state}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-famloText outline-none transition disabled:cursor-not-allowed disabled:bg-slate-50 focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
            >
              <option value="">
                {formState.state ? "Select city or town" : "Choose state first"}
              </option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-2">
          <label
            htmlFor="propertyAddress"
            className="text-sm font-medium text-famloText"
          >
            Property address
          </label>
          <textarea
            id="propertyAddress"
            name="propertyAddress"
            required
            rows={4}
            value={formState.propertyAddress}
            onChange={handleInputChange}
            className="rounded-3xl border border-slate-200 px-4 py-3 text-sm leading-7 text-famloText outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
            placeholder="Full property address"
          />
        </div>

        <div className="grid gap-2">
          <label
            htmlFor="aboutFamily"
            className="text-sm font-medium text-famloText"
          >
            About your family and home
          </label>
          <textarea
            id="aboutFamily"
            name="aboutFamily"
            rows={6}
            value={formState.aboutFamily}
            onChange={handleInputChange}
            className="rounded-3xl border border-slate-200 px-4 py-3 text-sm leading-7 text-famloText outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
            placeholder="Tell us about your home, your family, and the kind of environment guests can expect."
          />
        </div>

        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium text-famloText">
            Languages spoken
          </legend>
          <div className="flex flex-wrap gap-3">
            {COMMON_LANGUAGE_OPTIONS.map((language) => {
              const isSelected = formState.languages.includes(language);

              return (
                <label
                  key={language}
                  className={`inline-flex cursor-pointer items-center rounded-full border px-4 py-2 text-sm font-medium transition ${
                    isSelected
                      ? "border-famloBlue bg-famloBlue text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-famloBlue hover:text-famloBlue"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isSelected}
                    onChange={() => handleLanguageToggle(language)}
                  />
                  {language}
                </label>
              );
            })}
          </div>
          {formState.languages.includes("Other") ? (
            <input
              name="customLanguage"
              value={formState.customLanguage}
              onChange={handleInputChange}
              placeholder="Write your language"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-famloText outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
            />
          ) : null}
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium text-famloText">
            Cultural offerings
          </legend>
          <div className="flex flex-wrap gap-3">
            {culturalOfferingOptions.map((offering) => {
              const isSelected = formState.culturalOfferings.includes(offering);

              return (
                <label
                  key={offering}
                  className={`inline-flex cursor-pointer items-center rounded-full border px-4 py-2 text-sm font-medium transition ${
                    isSelected
                      ? "border-famloBlue bg-famloBlue text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-famloBlue hover:text-famloBlue"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isSelected}
                    onChange={() => handleOfferingToggle(offering)}
                  />
                  {offering}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-2">
          <label htmlFor="photo" className="text-sm font-medium text-famloText">
            Family or home photo
          </label>
          <input
            id="photo"
            name="photo"
            type="file"
            required
            accept="image/png,image/jpeg,image/webp"
            onChange={handlePhotoChange}
            className="rounded-2xl border border-dashed border-[#BFD8F1] bg-[#F8FBFF] px-4 py-4 text-sm text-slate-600 file:mr-4 file:rounded-full file:border-0 file:bg-famloBlue file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#155d9f]"
          />
          <p className="text-sm text-slate-500">
            Upload one clear photo for manual review.
          </p>
        </div>

        {submissionState ? (
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              submissionState.type === "success"
                ? "bg-[#EDF8F0] text-[#1F6A3A]"
                : "bg-[#FFF1F1] text-[#A63D40]"
            }`}
          >
            {submissionState.message}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-full bg-famloBlue px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#155d9f] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Submitting..." : "Submit family application"}
        </button>
      </div>
    </form>
  );
}
