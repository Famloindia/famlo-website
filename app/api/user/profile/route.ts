import { NextResponse } from "next/server";

import { loadGuestSessionSnapshot } from "@/lib/guest-session";
import { normalizeGuestEmail, normalizeGuestPhone } from "@/lib/guest-identity";
import { normalizeGuestUsername } from "@/lib/guest-username";
import { resolveStrictAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";
import {
  isGuestProfileComplete,
  loadUserProfileCompatibility,
  upsertUserProfileCompatibility,
  validateGuestProfileInput,
} from "@/lib/user-profile";

export async function GET(request: Request) {
  try {
    const supabase = createAdminSupabaseClient();
    const authUser = await resolveStrictAuthenticatedUser(supabase, request);

    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const session = await loadGuestSessionSnapshot(supabase, authUser);
    return NextResponse.json({ profile: session.profile, profileComplete: session.profileComplete });
  } catch (error: any) {
    console.error("Profile load failed", { name: error instanceof Error ? error.name : "Error" });
    return NextResponse.json({ error: "Profile could not be loaded. Please try again." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId, username, name, email, phone, city, state, about, dob, gender, avatarUrl } = await request.json();

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveStrictAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (typeof userId === "string" && userId.trim().length > 0 && userId !== authUser.id) {
      return NextResponse.json({ error: "You can only update your own profile." }, { status: 403 });
    }
    const fieldErrors = validateGuestProfileInput({
      userId: authUser.id,
      username,
      name,
      email,
      phone,
      city,
      state,
      about,
      dob,
      gender,
      avatarUrl,
    });
    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        { error: "Please correct the highlighted profile fields.", fieldErrors },
        { status: 400 }
      );
    }

    const normalizedEmail = normalizeGuestEmail(email);
    const normalizedPhone = normalizeGuestPhone(phone);
    const { data: authRecord, error: authRecordError } = await supabase.auth.admin.getUserById(authUser.id);
    if (authRecordError || !authRecord.user) {
      return NextResponse.json({ error: "Profile could not be verified." }, { status: 401 });
    }
    const authEmail = normalizeGuestEmail(authRecord.user.email);
    const authPhone = normalizeGuestPhone(authRecord.user.phone);

    const profile = await upsertUserProfileCompatibility(supabase, {
      userId: authUser.id,
      username: normalizeGuestUsername(username),
      name,
      email: normalizedEmail,
      phone: normalizedPhone,
      city,
      state,
      about,
      dob,
      gender,
      avatarUrl,
      emailVerifiedAt:
        normalizedEmail && normalizedEmail === authEmail && authRecord.user.email_confirmed_at
          ? authRecord.user.email_confirmed_at
          : undefined,
      phoneVerifiedAt:
        normalizedPhone && normalizedPhone === authPhone && authRecord.user.phone_confirmed_at
          ? authRecord.user.phone_confirmed_at
          : undefined,
    });

    const verifiedProfile = profile ?? (await loadUserProfileCompatibility(supabase, authUser.id));

    if (!verifiedProfile) {
      throw new Error("Profile save could not be verified.");
    }

    return NextResponse.json({ 
      success: true, 
      message: "Profile updated successfully",
      profile: verifiedProfile,
      profileComplete: isGuestProfileComplete(verifiedProfile)
    });
  } catch (error: any) {
    console.error("Profile update failed", { name: error instanceof Error ? error.name : "Error" });
    if (error && typeof error === "object" && error.code === "23505") {
      return NextResponse.json(
        {
          error: "That username is not available.",
          fieldErrors: { username: "Choose another username." },
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Profile could not be saved. Please try again." }, { status: 500 });
  }
}
