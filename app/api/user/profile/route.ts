import { NextResponse } from "next/server";

import { resolveAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { loadUserProfileCompatibility, upsertUserProfileCompatibility } from "@/lib/user-profile";

export async function GET(request: Request) {
  try {
    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);

    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const profile = await loadUserProfileCompatibility(supabase, authUser.id);
    return NextResponse.json({ profile });
  } catch (error: any) {
    console.error("Profile load failed:", error);
    return NextResponse.json({ error: error.message || "Failed to load profile" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId, name, email, phone, city, state, about, dob, gender, avatarUrl } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const authUser = await resolveAuthenticatedUser(supabase, request);
    if (!authUser) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (typeof userId === "string" && userId.trim().length > 0 && userId !== authUser.id) {
      return NextResponse.json({ error: "You can only update your own profile." }, { status: 403 });
    }

    await upsertUserProfileCompatibility(supabase, {
      userId: authUser.id,
      name,
      email,
      phone,
      city,
      state,
      about,
      dob,
      gender,
      avatarUrl
    });

    return NextResponse.json({ 
      success: true, 
      message: "Profile updated successfully" 
    });
  } catch (error: any) {
    console.error("Profile update failed:", error);
    return NextResponse.json({ error: error.message || "Failed to update profile" }, { status: 500 });
  }
}
