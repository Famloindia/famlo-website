"use server";

import { redirect } from "next/navigation";

import { createAdminSupabaseClient } from "@/lib/supabase";

function parseNumber(value: FormDataEntryValue | null, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function submitHomePartnerApplication(formData: FormData): Promise<void> {
  const supabase = createAdminSupabaseClient();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const whatsappNumber = String(formData.get("whatsappNumber") ?? "").trim();
  const propertyName = String(formData.get("propertyName") ?? "").trim();
  const village = String(formData.get("village") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const propertyAddress = String(formData.get("propertyAddress") ?? "").trim();
  const aboutFamily = String(formData.get("aboutFamily") ?? "").trim();
  const houseType = String(formData.get("houseType") ?? "").trim();
  const languages = splitList(formData.get("languages"));
  const culturalOfferings = splitList(formData.get("culturalOfferings"));
  const maxGuests = parseNumber(formData.get("maxGuests"), 1);
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();
  const googleMapsLink = String(formData.get("googleMapsLink") ?? "").trim();
  const latitude = parseNumber(formData.get("latitude"), Number.NaN);
  const longitude = parseNumber(formData.get("longitude"), Number.NaN);

  if (
    !fullName ||
    !email ||
    !propertyName ||
    !village ||
    !state ||
    !propertyAddress ||
    !aboutFamily ||
    !googleMapsLink ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    redirect("/partners/home?error=missing-fields");
  }

  const { error } = await supabase.from("family_applications").insert({
    full_name: fullName,
    email,
    phone: phone || null,
    whatsapp_number: whatsappNumber || null,
    property_name: propertyName,
    property_address: propertyAddress,
    village,
    state,
    house_type: houseType || null,
    about_family: aboutFamily,
    languages,
    max_guests: Math.max(1, Math.round(maxGuests)),
    cultural_offerings: culturalOfferings,
    photo_url: photoUrl || null,
    google_maps_link: googleMapsLink,
    latitude,
    longitude
  } as never);

  if (error) {
    redirect(`/partners/home?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/partners/home?submitted=1");
}

export async function submitHommiePartnerApplication(formData: FormData): Promise<void> {
  const supabase = createAdminSupabaseClient();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const interests = splitList(formData.get("interests"));
  const languages = splitList(formData.get("languages"));
  const skills = splitList(formData.get("skills"));
  const activityTypes = splitList(formData.get("activityTypes"));
  const availability = String(formData.get("availability") ?? "").trim();
  const photoUrl = String(formData.get("photoUrl") ?? "").trim();

  if (
    !fullName ||
    !email ||
    !city ||
    !bio
  ) {
    redirect("/partners/hommies?error=missing-fields");
  }

  const { error } = await supabase.from("friend_applications").insert({
    full_name: fullName,
    email,
    phone: phone || null,
    city,
    state: state || null,
    interests,
    languages,
    bio,
    availability: availability || null,
    skills,
    activity_types: activityTypes,
    photo_url: photoUrl || null
  } as never);

  if (error) {
    redirect(`/partners/hommies?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/partners/hommies?submitted=1");
}
