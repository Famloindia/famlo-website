//app/api/onboarding/hommie/submit/route.ts

import { NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/supabase";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as Record<string, unknown>;

  const fullName = asString(body.fullName);
  const email = asString(body.email).toLowerCase();
  const phone = asString(body.phone);
  const city = asString(body.city);
  const state = asString(body.state);
  const bio = asString(body.bio);
  const availability = asString(body.availability);
  const photoUrl = asString(body.photoUrl);
  const interests = asStringArray(body.interests);
  const languages = asStringArray(body.languages);
  const skills = asStringArray(body.skills);
  const activityTypes = asStringArray(body.activityTypes);

  if (!fullName || !email || !city || !bio) {
    return NextResponse.json(
      { error: "Full name, email, city, and bio are required." },
      { status: 400 }
    );
  }

  if (interests.length === 0) {
    return NextResponse.json(
      { error: "Please add at least one interest or activity area." },
      { status: 400 }
    );
  }

  if (languages.length === 0) {
    return NextResponse.json(
      { error: "Please add at least one language." },
      { status: 400 }
    );
  }

  const supabase = createAdminSupabaseClient();

  const applicationPayload = {
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
      photo_url: photoUrl || null,
      status: "pending",
      review_notes: null,
      reviewed_at: null
    };

  const { data, error } = await supabase
    .from("friend_applications")
    .insert(applicationPayload as never)
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Unable to submit hommie application." },
      { status: 500 }
    );
  }

  const applicationId = String(data.id);

  const hommieApplicationV2Payload = {
    application_type: "hommie",
    status: "pending",
    current_step: 3,
    payload: {
      legacy_application_id: applicationId,
      fullName,
      email,
      phone: phone || null,
      city,
      state: state || null,
      bio,
      availability: availability || null,
      photoUrl: photoUrl || null,
      interests,
      languages,
      skills,
      activityTypes,
    },
    submitted_at: new Date().toISOString(),
  };

  const { error: v2ApplicationError } = await supabase
    .from("hommie_applications_v2")
    .insert(hommieApplicationV2Payload as never);

  if (v2ApplicationError) {
    console.error("Failed to write hommie_applications_v2:", v2ApplicationError);
  }

  return NextResponse.json({
    ok: true,
    applicationId,
    status: "pending_review"
  });
}
