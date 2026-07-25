import { NextResponse } from "next/server";

import {
  deleteR2ObjectByPublicUrl,
  uploadGuestProfilePhotoToR2,
  validateGuestProfilePhoto,
} from "@/lib/r2-upload";
import { resolveStrictAuthenticatedUser } from "@/lib/request-user";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/upload-limits";
import {
  isGuestProfileComplete,
  loadUserProfileCompatibility,
  updateUserProfileAvatarCompatibility,
} from "@/lib/user-profile";

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = createAdminSupabaseClient();
  const authUser = await resolveStrictAuthenticatedUser(supabase, request);
  if (!authUser) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  let uploadedUrl: string | null = null;
  try {
    const formData = await request.formData();
    if (formData.has("userId") || formData.has("folder")) {
      return NextResponse.json({ error: "Unsupported upload parameters." }, { status: 400 });
    }
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Select a profile photo." }, { status: 400 });
    }

    await validateGuestProfilePhoto(file, MAX_IMAGE_UPLOAD_BYTES);
    const previousProfile = await loadUserProfileCompatibility(supabase, authUser.id);
    uploadedUrl = await uploadGuestProfilePhotoToR2(file, authUser.id);
    const savedProfile = await updateUserProfileAvatarCompatibility(supabase, authUser.id, uploadedUrl);
    if (!savedProfile || savedProfile.avatar_url !== uploadedUrl) {
      throw new Error("Profile photo save could not be verified.");
    }

    const previousUrl = previousProfile?.avatar_url;
    if (previousUrl && previousUrl !== uploadedUrl) {
      await deleteR2ObjectByPublicUrl(previousUrl, `guest-profile/${authUser.id}/`).catch((error) => {
        console.warn("Previous profile photo cleanup failed", {
          name: error instanceof Error ? error.name : "Error",
        });
      });
    }

    return NextResponse.json({
      success: true,
      url: uploadedUrl,
      profile: savedProfile,
      profileComplete: isGuestProfileComplete(savedProfile),
    });
  } catch (error) {
    if (uploadedUrl) {
      await deleteR2ObjectByPublicUrl(uploadedUrl, `guest-profile/${authUser.id}/`).catch(() => null);
    }
    const message = error instanceof Error ? error.message : "";
    const clientMessage =
      message.includes("JPEG") || message.includes("valid image") || message.includes("too large")
        ? message
        : "Profile photo could not be saved. Please try again.";
    const status = clientMessage === message ? 400 : 500;
    return NextResponse.json({ error: clientMessage }, { status });
  }
}
