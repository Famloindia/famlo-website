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
  validateGuestProfileDetailsInput,
} from "@/lib/user-profile";
import { findAuthUserByPhone, hasGoogleIdentity } from "@/lib/auth/account-linking";

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
    const fieldErrors = validateGuestProfileDetailsInput({
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
    const googleAuthenticated = hasGoogleIdentity(authRecord.user);
    const verifiedAuthEmail =
      authEmail && authRecord.user.email_confirmed_at ? authEmail : null;
    const verifiedAuthPhone =
      authPhone && authRecord.user.phone_confirmed_at ? authPhone : null;
    const phoneOwner = normalizedPhone
      ? await findAuthUserByPhone(supabase, normalizedPhone)
      : null;
    if (phoneOwner && phoneOwner.id !== authUser.id) {
      return NextResponse.json(
        {
          error: "This phone number is already linked to another Famlo account.",
          code: "PHONE_ALREADY_LINKED",
        },
        { status: 409 }
      );
    }

    if (
      googleAuthenticated &&
      normalizedEmail &&
      verifiedAuthEmail &&
      normalizedEmail !== verifiedAuthEmail
    ) {
      return NextResponse.json(
        {
          error: "Your Google email is managed by your authenticated account.",
          code: "AUTH_EMAIL_READ_ONLY",
          fieldErrors: { email: "Use the verified Google email shown here." },
        },
        { status: 409 }
      );
    }

    await upsertUserProfileCompatibility(supabase, {
      userId: authUser.id,
      username: normalizeGuestUsername(username),
      name,
      email:
        verifiedAuthEmail &&
        (googleAuthenticated || verifiedAuthEmail === normalizedEmail)
          ? verifiedAuthEmail
          : undefined,
      phone:
        verifiedAuthPhone && verifiedAuthPhone === normalizedPhone
          ? verifiedAuthPhone
          : normalizedPhone,
      city,
      state,
      about,
      dob,
      gender,
      avatarUrl,
      emailVerifiedAt:
        verifiedAuthEmail &&
        (googleAuthenticated || normalizedEmail === verifiedAuthEmail)
          ? authRecord.user.email_confirmed_at
          : undefined,
      phoneVerifiedAt:
        verifiedAuthPhone && normalizedPhone === verifiedAuthPhone
          ? authRecord.user.phone_confirmed_at
          : undefined,
    });

    const pendingEmail =
      !googleAuthenticated &&
      normalizedEmail &&
      normalizedEmail !== verifiedAuthEmail
        ? normalizedEmail
        : null;
    const { error: pendingEmailError } = await supabase
      .from("users")
      .update({
        pending_email: pendingEmail,
        pending_email_requested_at: null,
      })
      .eq("id", authUser.id);
    if (pendingEmailError) throw pendingEmailError;

    const verifiedProfile = await loadUserProfileCompatibility(supabase, authUser.id);

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
      const constraint =
        "constraint" in error && typeof error.constraint === "string"
          ? error.constraint
          : "";
      if (constraint === "users_verified_email_owner_key") {
        return NextResponse.json(
          {
            error: "This email is already linked to another Famlo account.",
            code: "EMAIL_ALREADY_LINKED",
          },
          { status: 409 }
        );
      }
      if (constraint === "users_verified_phone_owner_key") {
        return NextResponse.json(
          {
            error: "This phone number is already linked to another Famlo account.",
            code: "PHONE_ALREADY_LINKED",
          },
          { status: 409 }
        );
      }
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
