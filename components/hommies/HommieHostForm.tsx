"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import { INDIAN_STATES, STATE_TO_CITIES } from "../../lib/india";
import { extractCoordinatesFromGoogleMapsLink } from "../../lib/maps";
import { createBrowserSupabaseClient } from "../../lib/supabase";
import type { Database } from "../../lib/types";
import { uploadApplicationPhotos } from "../../lib/uploads";

type HommieApplicationInsert =
  Database["public"]["Tables"]["hommie_applications"]["Insert"];

const amenityOptions = [
  "Wifi",
  "Private room",
  "Attached washroom",
  "Meals included",
  "Parking",
  "Air conditioning",
  "Family-friendly",
  "Village experience"
] as const;

interface FormState {
  hostName: string;
  email: string;
  phone: string;
  propertyName: string;
  city: string;
  state: string;
  locality: string;
  address: string;
  googleMapsLink: string;
  description: string;
  nightlyPrice: string;
  maxGuests: string;
  amenities: string[];
  images: File[];
}

const initialState: FormState = {
  hostName: "",
  email: "",
  phone: "",
  propertyName: "",
  city: "",
  state: "",
  locality: "",
  address: "",
  googleMapsLink: "",
  description: "",
  nightlyPrice: "",
  maxGuests: "",
  amenities: [],
  images: []
};

function createSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getSubmissionErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unable to submit application.";
  }

  const message = error.message;

  if (message.includes("application-photos")) {
    return "Photo upload is not configured in Supabase yet. Please create the storage bucket and policies, then try again.";
  }

  if (
    message.includes("google_maps_link") ||
    message.includes("Could not find the 'google_maps_link' column")
  ) {
    return "Your Supabase Hommie table is missing the Google Maps link column. Run the latest hommies SQL setup, then submit again.";
  }

  return message;
}

export function HommieHostForm(): JSX.Element {
  const [formState, setFormState] = useState<FormState>(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string>("");

  const slugPreview = useMemo(
    () => createSlug(`${formState.propertyName}-${formState.city}`),
    [formState.city, formState.propertyName]
  );
  const cityOptions = useMemo(
    () => (formState.state ? STATE_TO_CITIES[formState.state] ?? [] : []),
    [formState.state]
  );

  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ): void {
    const { name, value } = event.target;
    setFormState((currentState) => {
      if (name === "state") {
        return { ...currentState, state: value, city: "" };
      }

      return { ...currentState, [name]: value };
    });
  }

  function handleAmenityToggle(amenity: string): void {
    setFormState((currentState) => ({
      ...currentState,
      amenities: currentState.amenities.includes(amenity)
        ? currentState.amenities.filter((item) => item !== amenity)
        : [...currentState.amenities, amenity]
    }));
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    setFormState((currentState) => ({ ...currentState, images: files }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      if (formState.images.length === 0) {
        throw new Error("Please upload at least one image.");
      }

      const coordinates = extractCoordinatesFromGoogleMapsLink(
        formState.googleMapsLink
      );

      if (!coordinates) {
        throw new Error(
          "Please paste a valid Google Maps share link with the exact pinned location."
        );
      }

      const supabase = createBrowserSupabaseClient();
      const imageUrls = await uploadApplicationPhotos(
        supabase,
        "hommie-applications",
        formState.propertyName,
        formState.images
      );

      const payload: HommieApplicationInsert = {
        host_name: formState.hostName.trim(),
        email: formState.email.trim(),
        phone: formState.phone.trim() || null,
        property_name: formState.propertyName.trim(),
        slug: slugPreview,
        city: formState.city.trim(),
        state: formState.state.trim(),
        locality: formState.locality.trim() || null,
        address: formState.address.trim(),
        google_maps_link: formState.googleMapsLink.trim() || null,
        description: formState.description.trim(),
        amenities: formState.amenities,
        images: imageUrls,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        nightly_price: Number(formState.nightlyPrice),
        max_guests: Number(formState.maxGuests),
        review_notes: null,
        status: "pending",
        reviewed_at: null
      };

      const { error } = await supabase
        .from("hommie_applications")
        .insert(payload as never);

      if (error) {
        throw error;
      }

      setMessage(
        "Your Hommie application has been submitted. Famlo will review it before listing."
      );
      setFormState(initialState);
    } catch (error) {
      setMessage(getSubmissionErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[32px] border border-[#D5E7F8] bg-white p-8 shadow-[0_24px_80px_rgba(26,110,187,0.1)] sm:p-10"
    >
      <div className="grid gap-5">
        <input
          name="hostName"
          value={formState.hostName}
          onChange={handleChange}
          required
          placeholder="Host name"
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <input
            name="email"
            type="email"
            value={formState.email}
            onChange={handleChange}
            required
            placeholder="Email"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
          />
          <input
            name="phone"
            value={formState.phone}
            onChange={handleChange}
            required
            placeholder="Phone"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
          />
        </div>
        <input
          name="propertyName"
          value={formState.propertyName}
          onChange={handleChange}
          required
          placeholder="Homestay name"
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
        />
        <p className="text-xs text-slate-500">
          Listing slug preview: {slugPreview || "pending"}
        </p>
        <div className="grid gap-5 sm:grid-cols-3">
          <select
            name="state"
            value={formState.state}
            onChange={handleChange}
            required
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
          >
            <option value="">Select state</option>
            {INDIAN_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
          <select
            name="city"
            value={formState.city}
            onChange={handleChange}
            required
            disabled={!formState.state}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition disabled:cursor-not-allowed disabled:bg-slate-50 focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
          >
            <option value="">
              {formState.state ? "Select city" : "Choose state first"}
            </option>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
          <input
            name="locality"
            value={formState.locality}
            onChange={handleChange}
            placeholder="Area / locality"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
          />
        </div>
        <textarea
          name="address"
          value={formState.address}
          onChange={handleChange}
          required
          rows={3}
          placeholder="Full address"
          className="rounded-3xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
        />
        <div className="grid gap-2">
          <label className="text-sm font-medium text-famloText">
            Exact location from Google Maps
          </label>
          <input
            name="googleMapsLink"
            value={formState.googleMapsLink}
            onChange={handleChange}
            required
            placeholder="Paste your Google Maps share link"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
          />
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span>Open Google Maps, pin your place, tap Share, then paste the link here.</span>
            <a
              href="https://www.google.com/maps"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-famloBlue"
            >
              Open Google Maps
            </a>
          </div>
        </div>
        <textarea
          name="description"
          value={formState.description}
          onChange={handleChange}
          required
          rows={5}
          placeholder="Tell guests what makes this Hommie special."
          className="rounded-3xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <input
            name="nightlyPrice"
            type="number"
            min="1"
            value={formState.nightlyPrice}
            onChange={handleChange}
            required
            placeholder="Nightly price"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
          />
          <input
            name="maxGuests"
            type="number"
            min="1"
            value={formState.maxGuests}
            onChange={handleChange}
            required
            placeholder="Max guests"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
          />
        </div>
        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium text-famloText">Amenities</legend>
          <div className="flex flex-wrap gap-3">
            {amenityOptions.map((amenity) => {
              const selected = formState.amenities.includes(amenity);
              return (
                <label
                  key={amenity}
                  className={`inline-flex cursor-pointer items-center rounded-full border px-4 py-2 text-sm font-medium transition ${
                    selected
                      ? "border-famloBlue bg-famloBlue text-white"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selected}
                    onChange={() => handleAmenityToggle(amenity)}
                  />
                  {amenity}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="grid gap-2">
          <label htmlFor="images" className="text-sm font-medium text-famloText">
            Upload images
          </label>
          <input
            id="images"
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageChange}
            required
            className="rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm"
          />
        </div>
        {message ? (
          <p
            className={`text-sm ${
              message.includes("submitted")
                ? "text-emerald-700"
                : "text-rose-600"
            }`}
          >
            {message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-famloBlue px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#155d9f] disabled:opacity-70"
        >
          {isSubmitting ? "Submitting..." : "Submit hommie application"}
        </button>
      </div>
    </form>
  );
}
